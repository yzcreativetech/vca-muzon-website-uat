import * as fs from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { validate } from '../data-contracts/validate.mjs';
import { VIDEO_ID, CHANNEL_ID } from './config.mjs';
import { utc } from './classify.mjs';
import { CollectorError, safeError, cleanupWarning } from './errors.mjs';

const classifications = new Set(['LIVE', 'UPCOMING', 'COMPLETED', 'UPLOADED', 'UNAVAILABLE', 'INDETERMINATE']);
const generationPattern = /^generation-[0-9a-f-]{36}$/u;

export function validateSnapshot(snapshot, schema) {
  if (!snapshot || !CHANNEL_ID.test(snapshot.channel?.id) || typeof snapshot.channel.title !== 'string' ||
      !/^[A-Za-z0-9_-]{10,100}$/u.test(snapshot.channel.uploadsPlaylistId) ||
      !validate('archiveCollection', snapshot.archive, schema).valid ||
      !validate('state', snapshot.state, schema).valid || !Array.isArray(snapshot.sources) ||
      !snapshot.backfill || (snapshot.backfill.nextPageToken !== null &&
      (typeof snapshot.backfill.nextPageToken !== 'string' || !snapshot.backfill.nextPageToken))) {
    throw new CollectorError('VALIDATION');
  }
  const ids = new Set();
  for (const entry of snapshot.archive.entries) {
    if (ids.has(entry.videoId)) throw new CollectorError('VALIDATION');
    ids.add(entry.videoId);
  }
  ids.clear();
  for (const source of snapshot.sources) {
    if (!source || !VIDEO_ID.test(source.videoId) || ids.has(source.videoId) ||
        !classifications.has(source.classification) || !utc(source.observedAt) ||
        (source.archiveApproved !== undefined && typeof source.archiveApproved !== 'boolean') ||
        (source.actualEndAt !== undefined && !utc(source.actualEndAt)) ||
        (source.metadata !== undefined && (!validate('archiveEntry', source.metadata, schema).valid || source.metadata.videoId !== source.videoId)) ||
        (source.livestream !== undefined && (!validate('live', { status: 'LIVE',
          lastSuccessfulCheckAt: source.observedAt, livestream: source.livestream }, schema).valid || source.livestream.videoId !== source.videoId))) {
      throw new CollectorError('VALIDATION');
    }
    ids.add(source.videoId);
  }
}

export function createStore(outputDir, schema, { io = fs, uuid = randomUUID } = {}) {
  async function json(path) { return JSON.parse(await io.readFile(path, 'utf8')); }
  return {
    async withLock(action) {
      let lock;
      try {
        await io.mkdir(outputDir, { recursive: true });
        lock = await io.open(join(outputDir, 'refresh.lock'), 'wx', 0o600);
      } catch { throw new CollectorError('STORAGE'); }
      let result;
      let failure;
      let failed = false;
      try { result = await action(); }
      catch (error) { failed = true; failure = error; }
      const warnings = [];
      let closed = false;
      try { await lock.close(); closed = true; }
      catch { warnings.push(cleanupWarning('LOCK_CLOSE_FAILED')); }
      // Do not release a lock whose handle may still be open.
      if (closed) {
        try { await io.unlink(join(outputDir, 'refresh.lock')); }
        catch { warnings.push(cleanupWarning('LOCK_REMOVE_FAILED')); }
      }
      if (failed) {
        if (warnings.length) {
          const safe = safeError(failure);
          failure = new CollectorError(safe.code, safe);
          failure.cleanupWarnings = warnings;
        }
        throw failure;
      }
      // Cleanup cannot undo a successful atomic publication or trigger its retry.
      if (warnings.length) return result && typeof result === 'object'
        ? { ...result, warnings: [...(result.warnings || []), ...warnings] }
        : { value: result, warnings };
      return result;
    },
    async read() {
      let pointer;
      try { pointer = await json(join(outputDir, 'current.json')); }
      catch (error) {
        if (error.code === 'ENOENT') return undefined;
        throw new CollectorError('STORAGE');
      }
      try {
        if (!generationPattern.test(pointer?.generation)) throw new CollectorError('STORAGE');
        const dir = join(outputDir, pointer.generation);
        const [archive, state, metadata] = await Promise.all([
          json(join(dir, 'archive.json')), json(join(dir, 'state.json')), json(join(dir, 'metadata.json'))
        ]);
        const snapshot = { ...metadata, archive, state };
        validateSnapshot(snapshot, schema);
        return snapshot;
      } catch { throw new CollectorError('STORAGE'); }
    },
    async publish(snapshot, secret) {
      validateSnapshot(snapshot, schema);
      const { archive, state, ...metadata } = snapshot;
      const documents = { 'archive.json': archive, 'state.json': state, 'metadata.json': metadata };
      const serialized = Object.fromEntries(Object.entries(documents).map(([name, value]) => [name, `${JSON.stringify(value, null, 2)}\n`]));
      if (secret && Object.values(serialized).some(value => value.includes(secret))) throw new CollectorError('SECRET');
      // A deterministic rerun with identical timestamps should not change the pointer.
      let previousPointer;
      try { previousPointer = await json(join(outputDir, 'current.json')); }
      catch (error) { if (error.code !== 'ENOENT') throw new CollectorError('STORAGE'); }
      if (previousPointer) {
        if (!generationPattern.test(previousPointer.generation)) throw new CollectorError('STORAGE');
        try {
          const identical = await Promise.all(Object.entries(serialized).map(async ([name, value]) =>
            await io.readFile(join(outputDir, previousPointer.generation, name), 'utf8') === value));
          if (identical.every(Boolean)) return previousPointer.generation;
        } catch { throw new CollectorError('STORAGE'); }
      }
      const generation = `generation-${uuid()}`;
      if (!generationPattern.test(generation)) throw new CollectorError('STORAGE');
      const dir = join(outputDir, generation);
      const temporaryPointer = join(outputDir, `${generation}.tmp`);
      try {
        await io.mkdir(dir);
        for (const [name, value] of Object.entries(serialized)) {
          await io.writeFile(join(dir, name), value, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
        }
        await io.writeFile(temporaryPointer, `${JSON.stringify({ generation })}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
        // All complete files become visible together via one same-directory rename.
        await io.rename(temporaryPointer, join(outputDir, 'current.json'));
      } catch {
        // Never delete the preceding snapshot. Orphan generations are safe to retain.
        try { await io.unlink(temporaryPointer); } catch { /* best-effort cleanup */ }
        throw new CollectorError('STORAGE');
      }
      return generation;
    }
  };
}
