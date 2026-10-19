import { validate } from '../data-contracts/validate.mjs';

export function utc(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/u.test(value)) return undefined;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 19) !== value.slice(0, 19)) return undefined;
  return date.toISOString();
}

export function classifyVideo(video, observedAt) {
  if (!video || video.unavailable) return 'UNAVAILABLE';
  const status = video.snippet?.liveBroadcastContent;
  const details = video.liveStreamingDetails;
  const privacy = video.status?.privacyStatus;
  const upload = video.status?.uploadStatus;
  if (['private', 'unlisted'].includes(privacy) || ['deleted', 'failed', 'rejected'].includes(upload)) return 'UNAVAILABLE';
  // Missing metadata is not affirmative evidence that a video is unavailable.
  if (upload === 'uploaded' && status === 'none' && details === undefined) return 'UNAVAILABLE';
  if (privacy !== 'public' || upload !== 'processed') return 'INDETERMINATE';
  if (!['none', 'live', 'upcoming'].includes(status)) return 'INDETERMINATE';
  if (details !== undefined && (!details || typeof details !== 'object' || Array.isArray(details))) return 'INDETERMINATE';
  for (const key of ['actualStartTime', 'actualEndTime', 'scheduledStartTime', 'scheduledEndTime']) {
    if (details?.[key] !== undefined && !utc(details[key])) return 'INDETERMINATE';
  }
  const start = details?.actualStartTime && Date.parse(details.actualStartTime);
  const end = details?.actualEndTime && Date.parse(details.actualEndTime);
  const now = Date.parse(observedAt);
  if (!Number.isFinite(now) || (start !== undefined && start > now) ||
      (end !== undefined && (end > now || start === undefined || end < start))) return 'INDETERMINATE';
  if (status === 'live') return start !== undefined && end === undefined ? 'LIVE' : 'INDETERMINATE';
  if (status === 'upcoming') return start === undefined && end === undefined && details?.scheduledStartTime ? 'UPCOMING' : 'INDETERMINATE';
  if (!utc(video.snippet.publishedAt) || Date.parse(video.snippet.publishedAt) > now) return 'INDETERMINATE';
  if (end !== undefined && start !== undefined) return 'COMPLETED';
  if (details !== undefined) return 'INDETERMINATE';
  return 'UPLOADED';
}

export function durationSeconds(value) {
  if (typeof value !== 'string') return undefined;
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/u.exec(value);
  if (!match || !match.slice(1).some(v => v !== undefined)) return undefined;
  const [, d = 0, h = 0, m = 0, s = 0] = match;
  const seconds = Number(d) * 86400 + Number(h) * 3600 + Number(m) * 60 + Number(s);
  return Number.isSafeInteger(seconds) ? seconds : undefined;
}

export function mapVideo(video, schema, { archive = false } = {}) {
  const snippet = video.snippet || {};
  const thumbnails = snippet.thumbnails || {};
  const thumbnailUrl = ['maxres', 'standard', 'high', 'medium', 'default']
    .map(key => thumbnails[key]?.url).find(url => typeof url === 'string' && url.startsWith('https://'));
  const mapped = { videoId: video.id, title: snippet.title, thumbnailUrl,
    watchUrl: `https://www.youtube.com/watch?v=${video.id}` };
  if (typeof snippet.description === 'string') mapped.description = snippet.description;
  if (archive) {
    mapped.publishedAt = utc(snippet.publishedAt);
    const duration = durationSeconds(video.contentDetails?.duration);
    if (duration !== undefined) mapped.durationSeconds = duration;
    return validate('archiveEntry', mapped, schema).valid ? mapped : undefined;
  }
  for (const [source, target] of [['scheduledStartTime', 'scheduledStartAt'], ['actualStartTime', 'actualStartAt']]) {
    const value = utc(video.liveStreamingDetails?.[source]);
    if (value) mapped[target] = value;
  }
  // Reuse the LIVE container to validate the shared video definition.
  return validate('live', { status: 'LIVE', lastSuccessfulCheckAt: '2026-01-01T00:00:00Z', livestream: mapped }, schema).valid ? mapped : undefined;
}
