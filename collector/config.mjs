import { resolve, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CollectorError } from './errors.mjs';

export const CHANNEL_ID = /^UC[A-Za-z0-9_-]{22}$/u;
export const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/u;
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const bad = () => { throw new CollectorError('CONFIG'); };

function integer(value, fallback, minimum, maximum) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) bad();
  return number;
}

export function parseChannelReference(value) {
  if (typeof value !== 'string' || !value || value !== value.trim()) bad();
  if (CHANNEL_ID.test(value)) return { channelId: value };
  let handle = value;
  if (value.startsWith('https://')) {
    let url;
    try { url = new URL(value); } catch { bad(); }
    if (!['youtube.com', 'www.youtube.com'].includes(url.hostname) || url.port ||
        url.username || url.password || url.search || url.hash) bad();
    const path = url.pathname.replace(/\/$/u, '');
    if (path.startsWith('/channel/') && CHANNEL_ID.test(path.slice(9))) return { channelId: path.slice(9) };
    try { handle = decodeURIComponent(path.slice(1)); } catch { bad(); }
  }
  // Conservative ASCII subset of YouTube handles; unsupported forms fail closed.
  if (!/^@[A-Za-z0-9_.-]{3,30}$/u.test(handle)) bad();
  return { handle: handle.toLowerCase() };
}

export function loadConfig(env = process.env) {
  const id = env.YOUTUBE_CHANNEL_ID;
  if (id !== undefined && !CHANNEL_ID.test(id)) bad();
  const reference = env.YOUTUBE_CHANNEL_HANDLE || env.YOUTUBE_CHANNEL_URL;
  const parsed = reference ? parseChannelReference(reference) : {};
  if (id && parsed.channelId && id !== parsed.channelId) bad();
  const channelId = id || parsed.channelId;
  if (!channelId && !parsed.handle) bad();
  if (env.YOUTUBE_CHANNEL_HANDLE && env.YOUTUBE_CHANNEL_URL) {
    const fromUrl = parseChannelReference(env.YOUTUBE_CHANNEL_URL);
    if ((fromUrl.handle && fromUrl.handle !== parsed.handle) ||
        (fromUrl.channelId && fromUrl.channelId !== channelId)) bad();
  }
  if (typeof env.YOUTUBE_API_KEY !== 'string' || !/^[A-Za-z0-9_-]+$/u.test(env.YOUTUBE_API_KEY)) bad();
  const approvedVideoIds = (env.YOUTUBE_ARCHIVE_VIDEO_IDS || '').split(',').filter(Boolean);
  if (approvedVideoIds.some(value => !VIDEO_ID.test(value))) bad();
  const outputDir = resolve(env.YOUTUBE_OUTPUT_DIR || resolve(projectRoot, '.collector-output'));
  // Prevent accidental writes to existing website/source folders.
  const rel = relative(projectRoot, outputDir);
  if (!rel || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`) &&
      rel.split(/[\\/]/u)[0] !== '.collector-output')) bad();
  const config = {
    ...(channelId ? { channelId } : {}), ...(parsed.handle ? { handle: parsed.handle } : {}),
    approvedVideoIds: [...new Set(approvedVideoIds)], outputDir,
    backfillLimit: integer(env.YOUTUBE_BACKFILL_LIMIT, 100, 1, 10000),
    maxAgeSeconds: integer(env.YOUTUBE_MAX_AGE_SECONDS, undefined, 1, 31536000),
    maxRetries: integer(env.YOUTUBE_MAX_RETRIES, 3, 0, 8),
    timeoutMs: integer(env.YOUTUBE_TIMEOUT_MS, 15000, 1, 120000),
    baseDelayMs: integer(env.YOUTUBE_RETRY_BASE_MS, 500, 0, 60000),
    maxDelayMs: integer(env.YOUTUBE_RETRY_MAX_MS, 30000, 0, 120000),
    liveSearchMaxPages: integer(env.YOUTUBE_LIVE_SEARCH_MAX_PAGES, 5, 1, 20)
  };
  Object.defineProperty(config, 'apiKey', { value: env.YOUTUBE_API_KEY, enumerable: false });
  return Object.freeze(config);
}
