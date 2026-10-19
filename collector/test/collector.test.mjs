import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, parseChannelReference } from '../config.mjs';
import { createApiClient } from '../api-client.mjs';
import { resolveChannel } from '../channel.mjs';
import { collectHistory, collectLiveIds, fetchVideos } from '../retrieval.mjs';
import { classifyVideo, mapVideo, durationSeconds } from '../classify.mjs';
import { mergeArchive } from '../merge.mjs';
import { createStore, validateSnapshot } from '../output.mjs';
import { collect, staleState } from '../collect.mjs';
import { CollectorError, safeError } from '../errors.mjs';
import { validate } from '../../data-contracts/validate.mjs';
import { CHANNEL, OTHER_CHANNEL, PLAYLIST, NOW, ids, channelResource, video, environment, mockClient } from './fixtures.mjs';

const schema = JSON.parse(await fs.readFile(new URL('../../data-contracts/schemas/contracts.schema.json', import.meta.url), 'utf8'));
const config = extra => loadConfig(environment(extra));
const entry = (id = ids[0]) => mapVideo(video(id), schema, { archive: true });
const channel = { id: CHANNEL, title: 'TEST ONLY channel', uploadsPlaylistId: PLAYLIST };
const snapshot = () => ({ channel, archive: { entries: [entry()], lastSuccessfulCheckAt: NOW },
  state: { status: 'OFFLINE', lastSuccessfulCheckAt: NOW }, sources: [], backfill: { nextPageToken: null } });
const response = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const apiFailure = reason => ({ error: { message: 'UNTRUSTED_REMOTE_MESSAGE', errors: [{ reason }] } });
async function directory(t) {
  const dir = await fs.mkdtemp(join(tmpdir(), 'vca-collector-test-'));
  // mkdtemp returned our newly created absolute directory inside the OS temp directory.
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}
function memoryStore(initial) {
  let current = initial && structuredClone(initial);
  let writes = 0;
  return { withLock: action => action(), read: async () => current && structuredClone(current),
    publish: async (value, secret) => {
      validateSnapshot(value, schema);
      if (JSON.stringify(value).includes(secret)) throw new CollectorError('SECRET');
      current = structuredClone(value); writes++; return 'TEST_ONLY_GENERATION';
    }, get value() { return current; }, get writes() { return writes; } };
}

test('configuration prefers a valid pinned channel and hides credentials from serialization', () => {
  const c = config();
  assert.equal(c.channelId, CHANNEL);
  assert.ok(!JSON.stringify(c).includes(c.apiKey));
  assert.equal(c.maxAgeSeconds, 60);
  assert.equal(parseChannelReference('https://www.youtube.com/@Test-Only').handle, '@test-only');
  assert.equal(parseChannelReference(`https://www.youtube.com/channel/${CHANNEL}`).channelId, CHANNEL);
});

test('configuration rejects missing credentials, channel, policy and malformed settings', () => {
  for (const extra of [{ YOUTUBE_API_KEY: '' }, { YOUTUBE_CHANNEL_ID: undefined },
    { YOUTUBE_CHANNEL_ID: 'wrong' }, { YOUTUBE_MAX_AGE_SECONDS: undefined },
    { YOUTUBE_MAX_AGE_SECONDS: '0' }, { YOUTUBE_BACKFILL_LIMIT: '1.5' },
    { YOUTUBE_ARCHIVE_VIDEO_IDS: 'bad' }, { YOUTUBE_OUTPUT_DIR: process.cwd() },
    { YOUTUBE_CHANNEL_HANDLE: '@test-only', YOUTUBE_CHANNEL_URL: 'https://www.youtube.com/@other-handle' }]) {
    assert.throws(() => config(extra), e => e.code === 'CONFIG');
  }
  for (const ref of ['https://evil.invalid/@test-only', 'https://www.youtube.com/results?search_query=church', '@x', 'test-only']) {
    assert.throws(() => parseChannelReference(ref));
  }
});

test('configured channel resolves metadata and uploads playlist once', async () => {
  const client = mockClient();
  assert.deepEqual(await resolveChannel(client, config()), channel);
  assert.equal(client.calls.length, 1); assert.equal(client.calls[0].params.id, CHANNEL);
});

test('handle discovery uses forHandle without unrestricted search', async () => {
  const client = mockClient();
  const resolved = await resolveChannel(client, config({ YOUTUBE_CHANNEL_ID: undefined, YOUTUBE_CHANNEL_HANDLE: '@test-only' }));
  assert.equal(resolved.id, CHANNEL); assert.equal(client.calls[0].params.forHandle, '@test-only');
});

test('resolution fails safely on no match, malformed metadata and ID mismatch', async () => {
  await assert.rejects(resolveChannel(mockClient({ channel: null }), config()), e => e.code === 'CHANNEL_NOT_FOUND');
  await assert.rejects(resolveChannel(mockClient({ channel: { ...channelResource(), id: OTHER_CHANNEL } }), config()), e => e.code === 'IDENTITY_MISMATCH');
  const missing = channelResource(); delete missing.contentDetails;
  await assert.rejects(resolveChannel(mockClient({ channel: missing }), config()), e => e.code === 'INVALID_RESPONSE');
});

test('pinned channel and configured handle must resolve to the same ID', async () => {
  let count = 0;
  const client = { list: async () => ({ items: [++count === 1 ? channelResource() : { id: OTHER_CHANNEL }] }) };
  await assert.rejects(resolveChannel(client, config({ YOUTUBE_CHANNEL_HANDLE: '@test-only' })), e => e.code === 'IDENTITY_MISMATCH');
});

test('historical pagination deduplicates, skips placeholders and exposes a resume token', async () => {
  const client = mockClient({ pages: [[ids[0], ids[0]], [ids[1], undefined], [ids[2]]] });
  const first = await collectHistory(client, channel, { limit: 4 });
  assert.deepEqual(first.ids, [ids[0], ids[1]]); assert.equal(first.nextPageToken, 'page2');
  const second = await collectHistory(client, channel, { limit: 4, pageToken: first.nextPageToken });
  assert.deepEqual(second.ids, [ids[2]]); assert.equal(second.nextPageToken, null);
});

test('historical pagination rejects repeated tokens instead of looping', async () => {
  const client = { list: async () => ({ items: [], nextPageToken: 'repeated' }) };
  await assert.rejects(collectHistory(client, channel, { limit: 10 }), e => e.code === 'INVALID_RESPONSE');
});

test('details use batches of 50 and mark omitted videos unavailable', async () => {
  const generated = Array.from({ length: 51 }, (_, i) => `TEST${String(i).padStart(7, '0')}`);
  const client = mockClient({ videos: generated.slice(0, 50).map(id => video(id)) });
  const found = await fetchVideos(client, channel, [...generated, generated[0]]);
  assert.equal(client.calls.length, 2); assert.equal(found.length, 51); assert.equal(found[50].unavailable, true);
});

test('details reject another channel, unsolicited IDs and duplicate results', async () => {
  const wrong = video(); wrong.snippet.channelId = OTHER_CHANNEL;
  await assert.rejects(fetchVideos(mockClient({ videos: [wrong] }), channel, [ids[0]]), e => e.code === 'IDENTITY_MISMATCH');
  for (const items of [[video(ids[1])], [video(), video()]]) {
    await assert.rejects(fetchVideos({ list: async () => ({ items }) }, channel, [ids[0]]), e => e.code === 'INVALID_RESPONSE');
  }
});

for (const kind of ['COMPLETED', 'UPCOMING', 'LIVE', 'UPLOADED']) {
  test(`classifies ${kind} from API fields`, () => assert.equal(classifyVideo(video(ids[0], kind), NOW), kind));
}

test('publication timestamps alone do not prove a completed livestream', () => {
  assert.equal(classifyVideo(video(), NOW), 'UPLOADED');
  const partial = video(ids[0], 'COMPLETED'); delete partial.liveStreamingDetails.actualEndTime;
  assert.equal(classifyVideo(partial, NOW), 'INDETERMINATE');
});

test('missing, inconsistent, future and invalid broadcast metadata fail closed', () => {
  const examples = [video(ids[0], 'COMPLETED'), video(ids[0], 'LIVE'), video(ids[0], 'UPCOMING'), video()];
  examples[0].liveStreamingDetails.actualEndTime = '2026-10-19T00:00:00Z';
  examples[1].liveStreamingDetails.actualStartTime = '2026-10-20T00:00:00Z';
  examples[2].liveStreamingDetails.actualEndTime = 'bad';
  delete examples[3].snippet.liveBroadcastContent;
  for (const example of examples) assert.equal(classifyVideo(example, NOW), 'INDETERMINATE');
});

test('private, deleted and unprocessed videos are unavailable', () => {
  assert.equal(classifyVideo({ id: ids[0], unavailable: true }, NOW), 'UNAVAILABLE');
  for (const privacyStatus of ['private', 'unlisted']) {
    const v = video(); v.status.privacyStatus = privacyStatus;
    assert.equal(classifyVideo(v, NOW), 'UNAVAILABLE');
  }
  const processing = video(); processing.status.uploadStatus = 'uploaded';
  assert.equal(classifyVideo(processing, NOW), 'UNAVAILABLE');
});

test('mapping rejects missing required metadata and fabricates no speaker information', () => {
  const missing = video(); delete missing.snippet.thumbnails;
  assert.equal(mapVideo(missing, schema, { archive: true }), undefined);
  assert.ok(!Object.hasOwn(entry(), 'speaker'));
  assert.equal(durationSeconds('P1DT1H2M3S'), 90123); assert.equal(durationSeconds('invalid'), undefined);
});

test('merge preserves optional metadata, updates confirmed fields and is idempotent', () => {
  const old = { ...entry(), speaker: 'TEST ONLY speaker', description: 'old' };
  const fresh = { ...entry(), title: 'TEST ONLY updated' }; delete fresh.description;
  const merged = mergeArchive([old, old], [fresh, fresh]);
  assert.equal(merged.length, 1); assert.equal(merged[0].speaker, old.speaker);
  assert.equal(merged[0].description, old.description); assert.equal(merged[0].title, fresh.title);
  assert.deepEqual(mergeArchive(merged, [fresh]), merged);
});

test('archive ordering compares timestamps chronologically and breaks ties by ID', () => {
  const a = { ...entry(ids[0]), publishedAt: '2026-10-19T00:00:00Z' };
  const b = { ...entry(ids[1]), publishedAt: '2026-10-19T00:00:00.500Z' };
  const c = { ...entry(ids[2]), publishedAt: '2026-10-19T00:00:00.000Z' };
  assert.deepEqual(mergeArchive([], [c, a, b]).map(x => x.videoId), [ids[1], ids[0], ids[2]]);
});

for (const status of [429, 500, 502, 503, 504]) {
  test(`HTTP ${status} retries with injectable jitter then succeeds`, async () => {
    let calls = 0; const delays = [];
    const client = createApiClient(config(), { fetchImpl: async (url, options) => {
      assert.ok(!url.toString().includes('TEST_ONLY_SECRET_NOT_REAL'));
      assert.equal(options.headers['X-Goog-Api-Key'], 'TEST_ONLY_SECRET_NOT_REAL');
      return ++calls === 1 ? response(status, {}) : response(200, { items: [] });
    }, sleep: async delay => delays.push(delay), random: () => 0 });
    assert.deepEqual(await client.list('channels', {}), { items: [] });
    assert.equal(calls, 2); assert.deepEqual(delays, [250]);
  });
}

test('network failures and invalid JSON are retried without exposing exception text', async () => {
  let calls = 0;
  const client = createApiClient(config(), { fetchImpl: async () => {
    calls++; if (calls === 1) throw new Error('TEST_ONLY_SECRET_NOT_REAL');
    if (calls === 2) return response(200, undefined);
    return response(200, { items: [] });
  }, sleep: async () => {} });
  await client.list('videos', {}); assert.equal(calls, 3);
});

test('timeouts abort requests and stop at the retry limit', async () => {
  let aborted = false;
  const client = createApiClient(config({ YOUTUBE_TIMEOUT_MS: '5', YOUTUBE_MAX_RETRIES: '0' }), {
    fetchImpl: async (_url, options) => {
      options.signal.addEventListener('abort', () => { aborted = true; });
      return new Promise(() => {});
    }
  });
  await assert.rejects(client.list('channels', {}), e => e.code === 'TIMEOUT' && e.attempts === 1);
  assert.equal(aborted, true);
});

test('quota exhaustion, invalid credentials and permanent HTTP failures are never retried', async () => {
  for (const [status, reason, code] of [[403, 'quotaExceeded', 'QUOTA'], [403, 'dailyLimitExceeded', 'QUOTA'],
    [400, 'keyInvalid', 'CREDENTIALS'], [401, 'authError', 'CREDENTIALS'], [404, 'notFound', 'HTTP']]) {
    let calls = 0;
    const client = createApiClient(config(), { fetchImpl: async () => { calls++; return response(status, apiFailure(reason)); },
      sleep: async () => { assert.fail('Permanent failure must not sleep'); } });
    await assert.rejects(client.list('channels', {}), e => e.code === code && !e.retryable && e.attempts === 1);
    assert.equal(calls, 1);
  }
});

test('retry exhaustion is bounded, delays capped and remote error text omitted', async () => {
  const delays = []; let calls = 0;
  const client = createApiClient(config({ YOUTUBE_MAX_RETRIES: '2', YOUTUBE_RETRY_MAX_MS: '600' }), {
    fetchImpl: async () => { calls++; return response(503, apiFailure('backendError')); },
    sleep: async ms => delays.push(ms), random: () => 1
  });
  await assert.rejects(client.list('videos', {}), e => {
    assert.equal(e.attempts, 3); assert.ok(!JSON.stringify(safeError(e)).includes('UNTRUSTED_REMOTE_MESSAGE')); return true;
  });
  assert.equal(calls, 3); assert.deepEqual(delays, [500, 600]);
});

test('channel-scoped live search must finish before absence can mean offline', async () => {
  const client = { list: async () => ({ items: [], nextPageToken: 'more' }) };
  await assert.rejects(collectLiveIds(client, channel, 1), e => e.code === 'INDETERMINATE');
  const wrong = { list: async () => ({ items: [{ id: { videoId: ids[0] }, snippet: { channelId: OTHER_CHANNEL } }] }) };
  await assert.rejects(collectLiveIds(wrong, channel, 2), e => e.code === 'IDENTITY_MISMATCH');
});

test('successful refresh writes approved entries and retains other uploads as candidates', async () => {
  const store = memoryStore();
  const result = await collect(config({ YOUTUBE_ARCHIVE_VIDEO_IDS: ids[0] }), { store, schema, clock: () => NOW,
    client: mockClient({ videos: [video(ids[0], 'COMPLETED'), video(ids[1])], pages: [[ids[0], ids[1]]] }) });
  assert.equal(result.ok, true); assert.equal(result.archiveCount, 1); assert.equal(result.candidateCount, 2);
  assert.equal(store.value.state.status, 'OFFLINE');
  assert.ok(validate('archiveCollection', store.value.archive, schema).valid);
  assert.ok(validate('state', store.value.state, schema).valid);
});

test('no classification approval means an empty preaching archive', async () => {
  const store = memoryStore();
  const result = await collect(config(), { store, schema, clock: () => NOW, client: mockClient() });
  assert.equal(result.ok, true); assert.equal(result.archiveCount, 0); assert.equal(result.candidateCount, 1);
});

test('live and upcoming broadcasts are excluded from the archive', async () => {
  for (const kind of ['LIVE', 'UPCOMING']) {
    const store = memoryStore();
    const result = await collect(config({ YOUTUBE_ARCHIVE_VIDEO_IDS: ids[0] }), { store, schema, clock: () => NOW,
      client: mockClient({ videos: [video(ids[0], kind)], liveIds: kind === 'LIVE' ? [ids[0]] : [] }) });
    assert.equal(result.ok, true); assert.equal(result.archiveCount, 0);
    assert.equal(store.value.state.status, kind === 'LIVE' ? 'LIVE' : 'OFFLINE');
    if (kind === 'UPCOMING') assert.ok(store.value.state.nextScheduledLivestream);
  }
});

test('repeated runs are idempotent with unchanged source data and clock', async () => {
  const store = memoryStore(); const c = config({ YOUTUBE_ARCHIVE_VIDEO_IDS: ids[0] });
  await collect(c, { store, schema, clock: () => NOW, client: mockClient() });
  const first = structuredClone(store.value);
  await collect(c, { store, schema, clock: () => NOW, client: mockClient() });
  assert.deepEqual(store.value, first); assert.equal(store.value.archive.entries.length, 1);
});

test('backfill resumes from the saved checkpoint and preserves earlier candidates', async () => {
  const store = memoryStore(); const options = { store, schema, clock: () => NOW };
  const c = config({ YOUTUBE_BACKFILL_LIMIT: '1' });
  const make = () => mockClient({ pages: [[ids[0]], [ids[1]]], videos: [video(), video(ids[1])] });
  await collect(c, { ...options, client: make() });
  assert.equal(store.value.backfill.nextPageToken, 'page1');
  await collect(c, { ...options, client: make() });
  assert.equal(store.value.backfill.nextPageToken, null); assert.equal(store.value.sources.length, 2);
});

test('unavailable archive details do not delete previously valid entries', async () => {
  const store = memoryStore(snapshot());
  const result = await collect(config(), { store, schema, clock: () => NOW, client: mockClient({ videos: [] }) });
  assert.equal(result.ok, true); assert.equal(store.value.archive.entries.length, 1);
});

test('API failure preserves prior output and returns STALE, never OFFLINE', async () => {
  const initial = snapshot(); initial.state = { status: 'LIVE', lastSuccessfulCheckAt: NOW, livestream: mapVideo(video(ids[0], 'LIVE'), schema) };
  const store = memoryStore(initial);
  const result = await collect(config(), { store, schema, clock: () => '2026-10-19T04:02:00Z',
    client: { list: async () => { throw new CollectorError('QUOTA'); } } });
  assert.equal(result.ok, false); assert.equal(result.stale.status, 'STALE');
  assert.equal(result.stale.previousStatus, 'LIVE'); assert.equal(result.stale.reason, 'AGE_EXCEEDED');
  assert.ok(validate('stale', result.stale, schema).valid);
  assert.deepEqual(store.value, initial); assert.equal(store.writes, 0);
});

test('failure without a previous success fabricates no OFFLINE or STALE', async () => {
  const store = memoryStore();
  const result = await collect(config(), { store, schema, clock: () => NOW, client: mockClient({ channel: null }) });
  assert.equal(result.ok, false); assert.equal(result.stale, undefined); assert.equal(store.writes, 0);
});

test('unavailable current-live details preserve the snapshot instead of asserting OFFLINE', async () => {
  const store = memoryStore(snapshot()); const before = structuredClone(store.value);
  const result = await collect(config(), { store, schema, clock: () => NOW, client: mockClient({ liveIds: [ids[0]], videos: [] }) });
  assert.equal(result.ok, false); assert.equal(result.error.code, 'INDETERMINATE');
  assert.equal(result.stale.status, 'STALE'); assert.deepEqual(store.value, before);
});

test('previous active candidates with missing details cannot become confirmed offline', async () => {
  const initial = snapshot(); initial.sources = [{ videoId: ids[0], classification: 'LIVE', observedAt: NOW }];
  const store = memoryStore(initial);
  const result = await collect(config(), { store, schema, clock: () => NOW, client: mockClient({ videos: [] }) });
  assert.equal(result.ok, false); assert.equal(result.error.code, 'INDETERMINATE');
});

test('errors can stale data inside the configurable freshness window', () => {
  const state = snapshot().state; const stale = staleState(state, '2026-10-19T04:00:30Z', 60, 'HTTP');
  assert.equal(stale.reason, 'API_ERROR'); assert.equal(stale.freshness.policy.maxAgeSeconds, 60);
  assert.ok(validate('stale', stale, schema).valid);
  assert.equal(staleState(state, '2026-10-19T03:00:00Z', 60), undefined);
});

test('filesystem round-trip parses generated JSON and validates both Step 3 contracts', async t => {
  const dir = await directory(t); const store = createStore(dir, schema);
  await store.withLock(async () => { await store.publish(snapshot(), 'TEST_ONLY_SECRET_NOT_REAL'); });
  assert.deepEqual(await store.read(), snapshot());
  const pointer = JSON.parse(await fs.readFile(join(dir, 'current.json'), 'utf8'));
  for (const name of ['archive.json', 'state.json', 'metadata.json']) {
    JSON.parse(await fs.readFile(join(dir, pointer.generation, name), 'utf8'));
  }
});

test('invalid generated output is rejected before publication', async t => {
  const dir = await directory(t); const store = createStore(dir, schema);
  await store.publish(snapshot(), 'TEST_ONLY_SECRET_NOT_REAL');
  const before = await fs.readFile(join(dir, 'current.json'), 'utf8');
  const invalid = snapshot(); invalid.archive.entries[0].publishedAt = 'bad';
  await assert.rejects(store.publish(invalid, 'TEST_ONLY_SECRET_NOT_REAL'), e => e.code === 'VALIDATION');
  assert.equal(await fs.readFile(join(dir, 'current.json'), 'utf8'), before);
});

test('atomic pointer failure preserves the previous complete generation', async t => {
  const dir = await directory(t); const store = createStore(dir, schema);
  await store.publish(snapshot(), 'TEST_ONLY_SECRET_NOT_REAL');
  const before = await fs.readFile(join(dir, 'current.json'), 'utf8');
  const failing = createStore(dir, schema, { io: { ...fs, rename: async () => { throw new Error('TEST ONLY disk failure'); } } });
  const updated = snapshot(); updated.archive.entries[0].title = 'TEST ONLY updated';
  await assert.rejects(failing.publish(updated, 'TEST_ONLY_SECRET_NOT_REAL'), e => e.code === 'STORAGE');
  assert.equal(await fs.readFile(join(dir, 'current.json'), 'utf8'), before);
  assert.deepEqual(await store.read(), snapshot());
});

test('credential material is rejected before any snapshot is published', async t => {
  const dir = await directory(t); const store = createStore(dir, schema);
  const unsafe = snapshot(); unsafe.archive.entries[0].description = 'TEST_ONLY_SECRET_NOT_REAL';
  await assert.rejects(store.publish(unsafe, 'TEST_ONLY_SECRET_NOT_REAL'), e => e.code === 'SECRET');
  assert.equal(await store.read(), undefined);
});

test('storage lock prevents overlapping writers and is released after failure', async t => {
  const dir = await directory(t); const store = createStore(dir, schema);
  await store.withLock(async () => {
    await assert.rejects(store.withLock(async () => {}), e => e.code === 'STORAGE');
  });
  await assert.rejects(store.withLock(async () => { throw new CollectorError('HTTP'); }));
  await store.withLock(async () => {});
});

test('corrupt existing data fails closed instead of being overwritten', async t => {
  const dir = await directory(t); const store = createStore(dir, schema);
  await fs.writeFile(join(dir, 'current.json'), '{bad');
  const result = await collect(config(), { schema, store, clock: () => NOW, client: mockClient() });
  assert.equal(result.ok, false); assert.equal(result.error.code, 'STORAGE');
  assert.equal(await fs.readFile(join(dir, 'current.json'), 'utf8'), '{bad');
});

test('unchanged filesystem refresh reuses its generation and a later check replaces it', async t => {
  const dir = await directory(t); const store = createStore(dir, schema);
  const c = config({ YOUTUBE_ARCHIVE_VIDEO_IDS: ids[0] });
  const first = await collect(c, { schema, store, clock: () => NOW, client: mockClient() });
  const second = await collect(c, { schema, store, clock: () => NOW, client: mockClient() });
  assert.equal(first.ok, true); assert.equal(second.ok, true); assert.equal(second.generation, first.generation);
  const third = await collect(c, { schema, store, clock: () => '2026-10-19T04:00:01Z', client: mockClient() });
  assert.equal(third.ok, true); assert.notEqual(third.generation, first.generation);
  assert.equal((await store.read()).archive.lastSuccessfulCheckAt, '2026-10-19T04:00:01.000Z');
});

test('identity mismatches never return another channel snapshot as STALE', async () => {
  const initial = snapshot(); initial.channel = { ...initial.channel, id: OTHER_CHANNEL };
  const store = memoryStore(initial); const client = mockClient();
  const result = await collect(config(), { schema, store, clock: () => NOW, client });
  assert.equal(result.ok, false); assert.equal(result.error.code, 'IDENTITY_MISMATCH');
  assert.equal(result.stale, undefined); assert.equal(client.calls.length, 0); assert.equal(store.writes, 0);
});

test('future publication and incomplete stream details are never archived', () => {
  const future = video(); future.snippet.publishedAt = '2026-10-20T00:00:00Z';
  assert.equal(classifyVideo(future, NOW), 'INDETERMINATE');
  const ended = video(ids[0], 'COMPLETED'); delete ended.liveStreamingDetails.actualStartTime;
  assert.equal(classifyVideo(ended, NOW), 'INDETERMINATE');
});

test('rate-limit 403 is retryable and stalled response bodies time out', async () => {
  let calls = 0;
  const rateClient = createApiClient(config(), { fetchImpl: async () => ++calls === 1
    ? response(403, apiFailure('rateLimitExceeded')) : response(200, { items: [] }), sleep: async () => {} });
  await rateClient.list('channels', {}); assert.equal(calls, 2);
  const stalled = createApiClient(config({ YOUTUBE_TIMEOUT_MS: '5', YOUTUBE_MAX_RETRIES: '0' }), {
    fetchImpl: async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) })
  });
  await assert.rejects(stalled.list('channels', {}), e => e.code === 'TIMEOUT');
});

test('a partial file-writing failure leaves the previous pointer and data intact', async t => {
  const dir = await directory(t); const store = createStore(dir, schema);
  await store.publish(snapshot(), 'TEST_ONLY_SECRET_NOT_REAL');
  const before = await fs.readFile(join(dir, 'current.json'), 'utf8');
  const failing = createStore(dir, schema, { io: { ...fs, writeFile: async (path, ...args) => {
    if (path.endsWith('state.json')) throw new Error('TEST ONLY disk failure');
    return fs.writeFile(path, ...args);
  } } });
  const updated = snapshot(); updated.archive.entries[0].title = 'TEST ONLY changed';
  await assert.rejects(failing.publish(updated, 'TEST_ONLY_SECRET_NOT_REAL'), e => e.code === 'STORAGE');
  assert.equal(await fs.readFile(join(dir, 'current.json'), 'utf8'), before);
  assert.deepEqual(await store.read(), snapshot());
});

test('confirmed active videos leave the archive but retain approval and optional metadata', async () => {
  const initial = snapshot(); initial.archive.entries[0].speaker = 'TEST ONLY retained speaker';
  const store = memoryStore(initial);
  const active = await collect(config(), { store, schema, clock: () => NOW,
    client: mockClient({ videos: [video(ids[0], 'LIVE')], liveIds: [ids[0]] }) });
  assert.equal(active.ok, true); assert.equal(store.value.archive.entries.length, 0);
  assert.equal(store.value.sources[0].archiveApproved, true);
  assert.equal(store.value.sources[0].metadata.speaker, initial.archive.entries[0].speaker);
  const completed = await collect(config(), { store, schema, clock: () => NOW,
    client: mockClient({ videos: [video(ids[0], 'COMPLETED')] }) });
  assert.equal(completed.ok, true); assert.equal(store.value.archive.entries.length, 1);
  assert.equal(store.value.archive.entries[0].speaker, initial.archive.entries[0].speaker);
});

test('missing processing metadata is indeterminate rather than proof of unavailability or LIVE', () => {
  for (const kind of ['LIVE', 'UPCOMING', 'COMPLETED', 'UPLOADED']) {
    const incomplete = video(ids[0], kind); delete incomplete.status.uploadStatus;
    assert.equal(classifyVideo(incomplete, NOW), 'INDETERMINATE');
  }
  const missingDetails = video(ids[0], 'LIVE');
  delete missingDetails.status.uploadStatus; delete missingDetails.liveStreamingDetails;
  assert.equal(classifyVideo(missingDetails, NOW), 'INDETERMINATE');
  const processingLive = video(ids[0], 'LIVE'); processingLive.status.uploadStatus = 'uploaded';
  assert.equal(classifyVideo(processingLive, NOW), 'INDETERMINATE');
});

test('unresolved historical broadcast blocks publication even when live search is empty', async () => {
  const incomplete = video(ids[0], 'LIVE');
  delete incomplete.status.uploadStatus; delete incomplete.liveStreamingDetails;
  const store = memoryStore(); const client = mockClient({ videos: [incomplete], liveIds: [] });
  const result = await collect(config(), { schema, store, client, clock: () => NOW });
  assert.equal(result.ok, false); assert.equal(result.error.code, 'INDETERMINATE');
  assert.ok(client.calls.some(call => call.endpoint === 'search'));
  assert.equal(store.writes, 0); assert.equal(result.stale, undefined);
});

test('contradictory backfill preserves the previous snapshot and returns valid historical STALE', async () => {
  const initial = snapshot(); initial.archive.entries = [];
  initial.state = { status: 'LIVE', lastSuccessfulCheckAt: NOW, livestream: mapVideo(video(ids[0], 'LIVE'), schema) };
  const incomplete = video(ids[0], 'LIVE'); delete incomplete.status.uploadStatus;
  const store = memoryStore(initial);
  const result = await collect(config(), { schema, store, clock: () => '2026-10-19T04:00:30Z',
    client: mockClient({ videos: [incomplete], liveIds: [] }) });
  assert.equal(result.ok, false); assert.equal(result.error.code, 'INDETERMINATE');
  assert.equal(store.writes, 0); assert.deepEqual(store.value, initial);
  assert.equal(result.stale.status, 'STALE'); assert.equal(result.stale.previousStatus, 'LIVE');
  assert.deepEqual(result.stale.lastKnownLivestream, initial.state.livestream);
  assert.ok(validate('stale', result.stale, schema).valid);
});

test('unresolved live-search results cannot be promoted to LIVE or OFFLINE', async () => {
  const incomplete = video(ids[0], 'LIVE'); delete incomplete.status.uploadStatus;
  const store = memoryStore();
  const result = await collect(config(), { schema, store, clock: () => NOW,
    client: mockClient({ videos: [incomplete], liveIds: [ids[0]] }) });
  assert.equal(result.ok, false); assert.equal(result.error.code, 'INDETERMINATE'); assert.equal(store.writes, 0);
});

test('retained possible broadcasts are rechecked even when absent from backfill and search', async () => {
  const livestream = mapVideo(video(ids[0], 'LIVE'), schema);
  const live = { status: 'LIVE', lastSuccessfulCheckAt: NOW, livestream };
  for (const variant of ['legacy-unavailable', 'live-state', 'stale-state']) {
    const initial = snapshot(); initial.archive.entries = [];
    if (variant === 'legacy-unavailable') initial.sources = [{ videoId: ids[0], classification: 'UNAVAILABLE', observedAt: NOW, livestream }];
    if (variant === 'live-state') initial.state = live;
    if (variant === 'stale-state') initial.state = staleState(live, NOW, 60);
    const store = memoryStore(initial);
    const client = mockClient({ pages: [[ids[1]]], videos: [video(ids[1])], liveIds: [] });
    const result = await collect(config(), { schema, store, client, clock: () => NOW });
    assert.ok(client.calls.some(call => call.endpoint === 'videos' && call.params.id.split(',').includes(ids[0])));
    assert.equal(result.ok, false); assert.equal(result.error.code, 'INDETERMINATE');
    assert.equal(store.writes, 0); assert.deepEqual(store.value, initial);
    assert.ok(validate('stale', result.stale, schema).valid);
  }
});

test('affirmative unavailability remains distinct from missing metadata', () => {
  for (const upload of ['deleted', 'failed', 'rejected', 'uploaded']) {
    const unavailable = video(); unavailable.status.uploadStatus = upload;
    assert.equal(classifyVideo(unavailable, NOW), 'UNAVAILABLE');
  }
  const privateVideo = video(); privateVideo.status.privacyStatus = 'private';
  assert.equal(classifyVideo(privateVideo, NOW), 'UNAVAILABLE');
  const absentPrivacy = video(); delete absentPrivacy.status.privacyStatus;
  assert.equal(classifyVideo(absentPrivacy, NOW), 'INDETERMINATE');
});

test('post-publication lock removal failure reports success and a sanitized warning without republishing', async t => {
  const dir = await directory(t); const normal = createStore(dir, schema);
  await normal.publish(snapshot(), 'TEST_ONLY_SECRET_NOT_REAL');
  let replacements = 0;
  const warningStore = createStore(dir, schema, { io: { ...fs,
    rename: async (...args) => { replacements++; return fs.rename(...args); },
    unlink: async path => {
      if (path.endsWith('refresh.lock')) throw new Error('TEST_ONLY_SECRET_NOT_REAL raw filesystem details');
      return fs.unlink(path);
    }
  } });
  const client = mockClient();
  const result = await collect(config(), { schema, store: warningStore, client, clock: () => NOW });
  assert.equal(result.ok, true); assert.equal(result.error, undefined);
  assert.equal(result.warnings[0].code, 'LOCK_REMOVE_FAILED');
  assert.ok(!JSON.stringify(result.warnings).includes('TEST_ONLY_SECRET_NOT_REAL'));
  const pointer = JSON.parse(await fs.readFile(join(dir, 'current.json'), 'utf8'));
  assert.equal(pointer.generation, result.generation); assert.equal(replacements, 1);
  assert.equal(client.calls.filter(call => call.endpoint === 'search').length, 1);
  assert.ok(validate('state', (await normal.read()).state, schema).valid);
  // Simulate operator recovery after confirming this test collector has finished.
  await fs.unlink(join(dir, 'refresh.lock'));
  const rerun = await collect(config(), { schema, store: normal, client: mockClient(), clock: () => NOW });
  assert.equal(rerun.ok, true); assert.equal(rerun.generation, result.generation);
  assert.equal((await fs.readdir(dir)).filter(name => name.startsWith('generation-')).length, 2);
});

test('post-publication close failure remains visible and does not release an uncertain lock', async t => {
  const dir = await directory(t); let removals = 0;
  const store = createStore(dir, schema, { io: { ...fs,
    open: async (...args) => {
      const handle = await fs.open(...args);
      return { close: async () => { await handle.close(); throw new Error('TEST ONLY close error'); } };
    },
    unlink: async path => { removals++; return fs.unlink(path); }
  } });
  const result = await collect(config(), { schema, store, client: mockClient(), clock: () => NOW });
  assert.equal(result.ok, true); assert.equal(result.warnings[0].code, 'LOCK_CLOSE_FAILED');
  assert.equal(removals, 0); await fs.stat(join(dir, 'refresh.lock'));
  assert.ok(validate('archiveCollection', (await store.read()).archive, schema).valid);
});

test('pre-publication failure retains its primary error when cleanup also fails', async t => {
  const dir = await directory(t); const normal = createStore(dir, schema);
  await normal.publish(snapshot(), 'TEST_ONLY_SECRET_NOT_REAL');
  const before = await fs.readFile(join(dir, 'current.json'), 'utf8');
  const failing = createStore(dir, schema, { io: { ...fs,
    rename: async () => { throw new Error('TEST_ONLY_SECRET_NOT_REAL replacement failure'); },
    unlink: async path => {
      if (path.endsWith('refresh.lock')) throw new Error('TEST_ONLY_SECRET_NOT_REAL cleanup failure');
      return fs.unlink(path);
    }
  } });
  const result = await collect(config(), { schema, store: failing, client: mockClient(), clock: () => NOW });
  assert.equal(result.ok, false); assert.equal(result.error.code, 'STORAGE');
  assert.equal(result.warnings[0].code, 'LOCK_REMOVE_FAILED');
  assert.ok(!JSON.stringify({ error: result.error, warnings: result.warnings }).includes('TEST_ONLY_SECRET_NOT_REAL'));
  assert.equal(await fs.readFile(join(dir, 'current.json'), 'utf8'), before);
  assert.deepEqual(await normal.read(), snapshot());
  assert.ok(validate('stale', result.stale, schema).valid);
});
