import { VIDEO_ID } from './config.mjs';
import { CollectorError } from './errors.mjs';

export async function collectHistory(client, channel, { limit, pageToken } = {}) {
  const ids = new Set();
  const tokens = new Set();
  let scanned = 0;
  let pages = 0;
  do {
    if (tokens.has(pageToken)) throw new CollectorError('INVALID_RESPONSE');
    tokens.add(pageToken);
    const maxResults = Math.min(50, limit - scanned);
    const response = await client.list('playlistItems', { part: 'contentDetails',
      playlistId: channel.uploadsPlaylistId, maxResults, pageToken });
    if (response.items.length > maxResults) throw new CollectorError('INVALID_RESPONSE');
    for (const item of response.items) {
      const id = item?.contentDetails?.videoId;
      // Missing IDs (deleted/private placeholders) are skipped, never invented.
      if (id !== undefined && (typeof id !== 'string' || !VIDEO_ID.test(id))) throw new CollectorError('INVALID_RESPONSE');
      if (id) ids.add(id);
    }
    scanned += response.items.length;
    pages++;
    pageToken = response.nextPageToken;
  } while (pageToken && scanned < limit && pages < limit);
  return { ids: [...ids], nextPageToken: pageToken || null, scanned };
}

// Search is scoped to an already verified channel, never used to establish identity.
export async function collectLiveIds(client, channel, maxPages) {
  const ids = new Set();
  const tokens = new Set();
  let pageToken;
  for (let page = 0; page < maxPages; page++) {
    if (tokens.has(pageToken)) throw new CollectorError('INVALID_RESPONSE');
    tokens.add(pageToken);
    const response = await client.list('search', { part: 'snippet', channelId: channel.id,
      type: 'video', eventType: 'live', maxResults: 50, pageToken });
    for (const item of response.items) {
      if (item?.snippet?.channelId !== channel.id || !VIDEO_ID.test(item?.id?.videoId)) {
        throw new CollectorError('IDENTITY_MISMATCH');
      }
      ids.add(item.id.videoId);
    }
    pageToken = response.nextPageToken;
    if (!pageToken) return [...ids];
  }
  throw new CollectorError('INDETERMINATE');
}

export async function fetchVideos(client, channel, ids) {
  const unique = [...new Set(ids)];
  if (unique.some(id => typeof id !== 'string' || !VIDEO_ID.test(id))) throw new CollectorError('CONFIG');
  const found = new Map();
  for (let offset = 0; offset < unique.length; offset += 50) {
    const batch = unique.slice(offset, offset + 50);
    const requested = new Set(batch);
    const response = await client.list('videos', { part: 'snippet,contentDetails,liveStreamingDetails,status', id: batch.join(',') });
    for (const video of response.items) {
      if (!requested.has(video?.id) || found.has(video.id)) throw new CollectorError('INVALID_RESPONSE');
      if (video.snippet?.channelId !== channel.id) throw new CollectorError('IDENTITY_MISMATCH');
      found.set(video.id, video);
    }
  }
  return unique.map(id => found.get(id) || { id, unavailable: true });
}
