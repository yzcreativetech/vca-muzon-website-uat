// Synthetic TEST ONLY channel and video metadata. Never fetch these identifiers.
export const CHANNEL = `UC${'T'.repeat(22)}`;
export const OTHER_CHANNEL = `UC${'X'.repeat(22)}`;
export const PLAYLIST = `UU${'T'.repeat(22)}`;
export const NOW = '2026-10-19T04:00:00.000Z';
export const ids = ['TEST_ONLY01', 'TEST_ONLY02', 'TEST_ONLY03', 'TEST_ONLY04'];

export function channelResource() {
  return { id: CHANNEL, snippet: { title: 'TEST ONLY channel', customUrl: '@test-only' },
    contentDetails: { relatedPlaylists: { uploads: PLAYLIST } } };
}

export function video(id = ids[0], kind = 'UPLOADED') {
  const result = { id, snippet: { channelId: CHANNEL, title: 'TEST ONLY video', description: '',
    publishedAt: '2026-10-18T00:00:00Z', thumbnails: { high: { url: 'https://example.invalid/test-only.jpg' } },
    liveBroadcastContent: kind === 'LIVE' ? 'live' : kind === 'UPCOMING' ? 'upcoming' : 'none' },
  status: { privacyStatus: 'public', uploadStatus: 'processed' }, contentDetails: { duration: 'PT1H2M3S' } };
  if (['LIVE', 'COMPLETED'].includes(kind)) result.liveStreamingDetails = { actualStartTime: '2026-10-19T01:00:00Z' };
  if (kind === 'COMPLETED') result.liveStreamingDetails.actualEndTime = '2026-10-19T02:00:00Z';
  if (kind === 'UPCOMING') result.liveStreamingDetails = { scheduledStartTime: '2026-10-20T01:00:00Z' };
  return result;
}

export function environment(extra = {}) {
  return { YOUTUBE_API_KEY: 'TEST_ONLY_SECRET_NOT_REAL', YOUTUBE_CHANNEL_ID: CHANNEL,
    YOUTUBE_MAX_AGE_SECONDS: '60', ...extra };
}

export function mockClient({ videos = [video()], liveIds = [], pages = [[ids[0]]], channel = channelResource() } = {}) {
  const calls = [];
  return { calls, async list(endpoint, params) {
    calls.push({ endpoint, params });
    if (endpoint === 'channels') return { items: channel ? [channel] : [] };
    if (endpoint === 'search') return { items: liveIds.map(id => ({ id: { videoId: id }, snippet: { channelId: CHANNEL } })) };
    if (endpoint === 'playlistItems') {
      const index = params.pageToken ? Number(params.pageToken.slice(4)) : 0;
      const page = pages[index] || [];
      return { items: page.map(id => ({ contentDetails: { videoId: id } })),
        ...(index + 1 < pages.length ? { nextPageToken: `page${index + 1}` } : {}) };
    }
    if (endpoint === 'videos') return { items: videos.filter(v => params.id.split(',').includes(v.id)) };
    throw new Error('Unexpected mocked endpoint');
  } };
}
