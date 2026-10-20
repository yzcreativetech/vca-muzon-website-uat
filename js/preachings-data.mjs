import { validate } from '../data-contracts/validate.mjs';

export const CHANNEL = 'https://www.youtube.com/@vcamuzonsjdm';
export const PAGE_SIZE = 8;
export const validId = id => typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id);
export function embedUrl(id) {
  if (!validId(id) || id.startsWith('TEST_ONLY')) throw new Error('Invalid playback identifier');
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0`;
}
export function interpretState(payload, schema, maxAgeSeconds, now = Date.now()) {
  if (!validate('state', payload, schema).valid) return 'UNVERIFIED';
  if (payload.status === 'STALE') return 'STALE';
  if (!Number.isInteger(maxAgeSeconds) || maxAgeSeconds <= 0) return 'UNVERIFIED';
  const age = Math.floor((now - Date.parse(payload.lastSuccessfulCheckAt)) / 1000);
  if (age < 0) return 'UNVERIFIED';
  return age > maxAgeSeconds ? 'STALE' : payload.status;
}
export function archiveEntries(payload, schema) {
  if (!validate('archiveCollection', payload, schema).valid) throw new Error('Invalid archive');
  const unique = [...new Map(payload.entries.map(entry => [entry.videoId, entry])).values()];
  return unique.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || (a.videoId < b.videoId ? -1 : a.videoId > b.videoId ? 1 : 0));
}
export async function fetchJSON(url, fetcher = fetch) {
  const response = await fetcher(url, { cache: 'no-store', credentials: 'same-origin', signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error('Data unavailable');
  return response.json();
}
// No production URL or freshness default is selected here. A future approved caller
// can pass the collector's public pointer URL and policy explicitly.
export async function loadSnapshot(pointerUrl, schema, maxAgeSeconds, fetcher = fetch, base = location.href) {
  const url = new URL(pointerUrl, base);
  if (url.origin !== new URL(base).origin || url.search || url.hash) throw new Error('Invalid data location');
  const pointer = await fetchJSON(url.href, fetcher);
  if (!/^generation-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(pointer?.generation)) throw new Error('Invalid generation');
  const folder = new URL(`${pointer.generation}/`, url);
  const [state, archive] = await Promise.allSettled([
    fetchJSON(new URL('state.json', folder).href, fetcher),
    fetchJSON(new URL('archive.json', folder).href, fetcher)
  ]);
  return {
    status: state.status === 'fulfilled' ? interpretState(state.value, schema, maxAgeSeconds) : 'UNVERIFIED',
    state: state.status === 'fulfilled' ? state.value : null,
    entries: archive.status === 'fulfilled' && validate('archiveCollection', archive.value, schema).valid ? archiveEntries(archive.value, schema) : null
  };
}
export function previewAllowed(location) {
  return ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) && new URLSearchParams(location.search).has('preachings-preview');
}
