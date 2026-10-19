import { readFile } from 'node:fs/promises';
import { createApiClient } from './api-client.mjs';
import { resolveChannel } from './channel.mjs';
import { collectHistory, collectLiveIds, fetchVideos } from './retrieval.mjs';
import { classifyVideo, mapVideo, utc } from './classify.mjs';
import { mergeArchive, compareIds } from './merge.mjs';
import { createStore } from './output.mjs';
import { CollectorError, safeError } from './errors.mjs';

export function staleState(previous, evaluatedAt, maxAgeSeconds, code = 'CHECK_FAILED') {
  if (!previous || !utc(evaluatedAt)) return undefined;
  const ageSeconds = Math.floor((Date.parse(evaluatedAt) - Date.parse(previous.lastSuccessfulCheckAt)) / 1000);
  if (ageSeconds < 0) return undefined;
  const previousStatus = previous.status === 'STALE' ? previous.previousStatus : previous.status;
  const lastKnownLivestream = previous.status === 'LIVE' ? previous.livestream : previous.lastKnownLivestream;
  return { status: 'STALE', lastSuccessfulCheckAt: previous.lastSuccessfulCheckAt, previousStatus,
    ...(previousStatus === 'LIVE' && lastKnownLivestream ? { lastKnownLivestream } : {}),
    reason: ageSeconds > maxAgeSeconds ? 'AGE_EXCEEDED' :
      code === 'INVALID_RESPONSE' ? 'INVALID_RESPONSE' :
      ['QUOTA', 'CREDENTIALS', 'HTTP', 'TIMEOUT', 'NETWORK'].includes(code) ? 'API_ERROR' : 'CHECK_FAILED',
    freshness: { evaluatedAt, ageSeconds, policy: { maxAgeSeconds } } };
}

function stateFromVideos(videos, liveIds, now, schema, archive) {
  const classified = videos.map(video => ({ video, classification: classifyVideo(video, now) }));
  // Every search result must have an interpretable authoritative details response.
  for (const id of liveIds) {
    const found = classified.find(item => item.video.id === id);
    if (!found || ['UNAVAILABLE', 'INDETERMINATE'].includes(found.classification)) throw new CollectorError('INDETERMINATE');
  }
  // Metadata for any observed active/upcoming item must be usable before asserting a state.
  for (const item of classified) {
    const broadcast = item.video.snippet?.liveBroadcastContent;
    const possibleBroadcast = item.video.liveStreamingDetails !== undefined ||
      ['live', 'upcoming'].includes(broadcast) ||
      (item.classification === 'INDETERMINATE' && broadcast !== 'none');
    if (['INDETERMINATE', 'UNAVAILABLE'].includes(item.classification) && possibleBroadcast) {
      throw new CollectorError('INDETERMINATE');
    }
  }
  const live = classified.filter(item => item.classification === 'LIVE')
    .sort((a, b) => compareIds(a.video.id, b.video.id));
  if (live.length) {
    const livestream = mapVideo(live[0].video, schema);
    if (!livestream) throw new CollectorError('VALIDATION');
    return { status: 'LIVE', lastSuccessfulCheckAt: now, livestream };
  }
  const upcoming = classified.filter(item => item.classification === 'UPCOMING')
    .sort((a, b) => Date.parse(a.video.liveStreamingDetails.scheduledStartTime) - Date.parse(b.video.liveStreamingDetails.scheduledStartTime) || compareIds(a.video.id, b.video.id));
  const nextScheduledLivestream = upcoming[0] && mapVideo(upcoming[0].video, schema);
  if (upcoming.length && !nextScheduledLivestream) throw new CollectorError('VALIDATION');
  return { status: 'OFFLINE', lastSuccessfulCheckAt: now,
    ...(nextScheduledLivestream ? { nextScheduledLivestream } : {}),
    ...(archive.entries[0] ? { latestArchiveEntry: archive.entries[0] } : {}) };
}

export async function collect(config, {
  client = createApiClient(config),
  clock = () => new Date().toISOString(),
  schema: suppliedSchema,
  store: suppliedStore
} = {}) {
  const schema = suppliedSchema || JSON.parse(await readFile(new URL('../data-contracts/schemas/contracts.schema.json', import.meta.url), 'utf8'));
  const store = suppliedStore || createStore(config.outputDir, schema);
  let previous;
  try {
    return await store.withLock(async () => {
      previous = await store.read();
      if (previous && ((config.channelId && previous.channel.id !== config.channelId) ||
          (config.handle && previous.channel.handle && previous.channel.handle !== config.handle))) {
        throw new CollectorError('IDENTITY_MISMATCH');
      }
      const channel = await resolveChannel(client, config);
      if (previous && previous.channel.id !== channel.id) throw new CollectorError('IDENTITY_MISMATCH');
      const pageToken = previous?.channel.uploadsPlaylistId === channel.uploadsPlaylistId
        ? previous.backfill.nextPageToken || undefined : undefined;
      const history = await collectHistory(client, channel, { limit: config.backfillLimit, pageToken });
      const liveIds = await collectLiveIds(client, channel, config.liveSearchMaxPages);
      const previousActiveIds = (previous?.sources || [])
        .filter(source => ['LIVE', 'UPCOMING', 'INDETERMINATE'].includes(source.classification) ||
          (source.classification === 'UNAVAILABLE' && source.livestream)).map(source => source.videoId);
      const previousLive = previous?.state.status === 'LIVE' ? previous.state.livestream :
        previous?.state.status === 'STALE' && previous.state.previousStatus === 'LIVE' ? previous.state.lastKnownLivestream : undefined;
      if (previousLive) previousActiveIds.push(previousLive.videoId);
      const videos = await fetchVideos(client, channel, [...history.ids, ...liveIds, ...previousActiveIds,
        ...(previous?.archive.entries || []).map(entry => entry.videoId), ...config.approvedVideoIds]);
      const now = utc(clock());
      if (!now || (previous && Date.parse(now) < Date.parse(previous.state.lastSuccessfulCheckAt))) throw new CollectorError('CONFIG');
      const sourceMap = new Map((previous?.sources || []).map(source => [source.videoId, source]));
      const oldArchive = new Map((previous?.archive.entries || []).map(entry => [entry.videoId, entry]));
      const allowed = new Set([...config.approvedVideoIds, ...oldArchive.keys(),
        ...(previous?.sources || []).filter(source => source.archiveApproved).map(source => source.videoId)]);
      const confirmedActive = new Set();
      const entries = [];
      for (const video of videos) {
        const classification = classifyVideo(video, now);
        const metadata = mapVideo(video, schema, { archive: true });
        const livestream = ['LIVE', 'UPCOMING'].includes(classification) ? mapVideo(video, schema) : undefined;
        const old = sourceMap.get(video.id);
        const priorMetadata = old?.metadata || oldArchive.get(video.id);
        const actualEndAt = utc(video.liveStreamingDetails?.actualEndTime);
        sourceMap.set(video.id, { ...old, videoId: video.id, classification, observedAt: now,
          ...(allowed.has(video.id) ? { archiveApproved: true } : {}),
          ...(metadata || priorMetadata ? { metadata: { ...priorMetadata, ...metadata } } : {}),
          ...(livestream ? { livestream } : {}), ...(actualEndAt ? { actualEndAt } : {}) });
        if (['LIVE', 'UPCOMING'].includes(classification)) confirmedActive.add(video.id);
        if (allowed.has(video.id) && ['COMPLETED', 'UPLOADED'].includes(classification) && metadata) entries.push({ ...priorMetadata, ...metadata });
      }
      const retained = (previous?.archive.entries || []).filter(entry => !confirmedActive.has(entry.videoId));
      const archive = { entries: mergeArchive(retained, entries), lastSuccessfulCheckAt: now };
      const state = stateFromVideos(videos, [...new Set([...liveIds, ...previousActiveIds])], now, schema, archive);
      const snapshot = { channel, archive, state,
        sources: [...sourceMap.values()].sort((a, b) => compareIds(a.videoId, b.videoId)),
        backfill: { nextPageToken: history.nextPageToken } };
      const generation = await store.publish(snapshot, config.apiKey);
      return { ok: true, generation, channelId: channel.id, status: state.status,
        archiveCount: archive.entries.length, candidateCount: snapshot.sources.length };
    });
  } catch (error) {
    const { warnings, ...safe } = safeError(error);
    return { ok: false, error: safe,
      ...(warnings ? { warnings } : {}),
      ...(previous && safe.code !== 'IDENTITY_MISMATCH'
        ? { stale: staleState(previous.state, utc(clock()), config.maxAgeSeconds, safe.code) } : {}) };
  }
}
