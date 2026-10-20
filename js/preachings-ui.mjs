import { CHANNEL, PAGE_SIZE, embedUrl, validId, previewAllowed, fetchJSON, interpretState, archiveEntries, loadSnapshot } from './preachings-data.mjs';

const byId = id => document.getElementById(id);
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function channelLink() {
  const link = node('a', 'Visit our YouTube channel');
  link.href = CHANNEL; link.target = '_blank'; link.rel = 'noopener noreferrer';
  return link;
}
// One active iframe across the page, created only by an explicit button activation.
export function createPlayerController() {
  let active;
  return {
    stop() { if (active) { active.frame.remove(); active.poster.hidden = false; active = null; } },
    activate(host, poster, video, message) {
      const src = embedUrl(video.videoId);
      this.stop();
      const frame = node('iframe');
      frame.title = `YouTube player: ${video.title}`;
      frame.allow = 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen';
      frame.allowFullscreen = true;
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      frame.addEventListener('error', () => { message.textContent = 'Playback could not load. Please open this video on YouTube.'; });
      frame.src = src; poster.hidden = true; host.append(frame);
      active = { frame, poster }; frame.focus();
      message.textContent = 'If playback is unavailable, open this video on YouTube.';
    }
  };
}
const player = typeof document !== 'undefined' ? createPlayerController() : null;
function media(video, preview = false, eager = false, action = 'Play video') {
  const wrap = node('div', undefined, 'preaching-media');
  const host = node('div', undefined, 'preaching-player');
  const button = node('button', undefined, 'preaching-poster');
  button.type = 'button'; button.setAttribute('aria-label', `${action}: ${video.title}`);
  const image = node('img'); image.width = 640; image.height = 360;
  image.alt = `Video thumbnail: ${video.title}`; image.loading = eager ? 'eager' : 'lazy';
  const fallback = 'assets/preachings/preaching-hero.webp';
  image.src = preview ? fallback : safeThumbnail(video.thumbnailUrl, fallback);
  image.addEventListener('error', () => { if (image.getAttribute('src') !== fallback) image.src = fallback; });
  button.append(image, node('span', preview ? 'TEST ONLY - playback disabled' : action, 'preaching-play-label'));
  button.disabled = preview;
  const message = node('p', '', 'preaching-playback-message'); message.setAttribute('role', 'status');
  button.addEventListener('click', () => player.activate(host, button, video, message));
  host.append(button); wrap.append(host, message);
  if (!preview) {
    const direct = node('a', 'Open on YouTube'); direct.href = `https://www.youtube.com/watch?v=${video.videoId}`;
    direct.target = '_blank'; direct.rel = 'noopener noreferrer'; wrap.append(direct);
  }
  return wrap;
}
function safeThumbnail(value, fallback) {
  try {
    const url = new URL(value, location.href);
    if (url.origin === location.origin || (url.protocol === 'https:' && url.hostname === 'i.ytimg.com')) return url.href;
  } catch { /* Use the local poster for unavailable/unapproved thumbnail origins. */ }
  return fallback;
}
function details(video) {
  const content = node('div', undefined, 'preaching-details');
  content.append(node('h3', video.title));
  const time = node('time', new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' }).format(new Date(video.publishedAt)));
  time.dateTime = video.publishedAt; content.append(time);
  if (video.speaker) content.append(node('p', video.speaker, 'preaching-speaker'));
  const labels = [video.series, video.category].filter(Boolean);
  if (labels.length) content.append(node('p', labels.join(' / '), 'preaching-labels'));
  if (video.description) content.append(node('p', video.description, 'preaching-description'));
  return content;
}
export function renderState(status, state, preview = false) {
  const messages = { LIVE: 'LIVE - Sunday worship is streaming', OFFLINE: 'There is no active livestream at the last successful check.', STALE: 'Livestream availability could not be verified.', UNVERIFIED: 'Livestream availability could not be verified.' };
  byId('livestream-status').textContent = (preview ? 'TEST ONLY: ' : '') + (messages[status] || messages.UNVERIFIED);
  byId('livestream-status').dataset.state = status;
  const host = byId('livestream-player');
  if (host.contains(document.querySelector('.preaching-player iframe'))) player.stop();
  host.replaceChildren(); host.hidden = status !== 'LIVE';
  if (status === 'LIVE') {
    host.append(node('h3', state.livestream.title));
    if (state.livestream.description) host.append(node('p', state.livestream.description));
    host.append(media(state.livestream, preview, true, 'Watch Live'));
  }
  const fallback = byId('livestream-fallback');
  fallback.replaceChildren(node('span', 'Watch previous messages below, or '), channelLink());
}
export function archiveState(state) {
  for (const name of ['empty', 'loading', 'error']) byId(`preaching-archive-${name}`).hidden = name !== state;
  byId('preaching-archive-list').setAttribute('aria-busy', String(state === 'loading'));
}
export function renderArchive(entries, preview = false) {
  player.stop();
  const featured = byId('latest-preaching-content'); const list = byId('preaching-archive-list');
  featured.replaceChildren(); list.replaceChildren();
  const more = byId('preaching-load-more');
  more.hidden = true;
  more.onclick = null;
  byId('preaching-archive-count').textContent = '';
  archiveState(entries.length ? null : 'empty');
  if (!entries.length) { featured.append(node('p', 'No preaching is available yet.')); return; }
  featured.append(media(entries[0], preview, true), details(entries[0]));
  let count = 0;
  function appendPage() {
    const fragment = document.createDocumentFragment();
    const next = Math.min(entries.length, count + PAGE_SIZE);
    for (const video of entries.slice(count, next)) {
      const card = node('article', undefined, 'preaching-card preaching-dynamic-card');
      card.append(media(video, preview), details(video)); fragment.append(card);
    }
    list.append(fragment); count = next; more.hidden = count >= entries.length;
    byId('preaching-archive-count').textContent = `Showing ${count} of ${entries.length} messages`;
    return fragment;
  }
  more.onclick = () => {
    const oldCount = count; appendPage();
    list.children[oldCount]?.querySelector('button')?.focus();
  };
  appendPage();
}
function enhanceManualContent() {
  // Preserve the manually maintained records as a fallback, without presenting them
  // as collector-verified. Do not infer or repair conflicting video metadata.
  byId('preachings-data-notice').textContent = 'Showing manually maintained messages. Visit our YouTube channel for the latest updates.';
  const featured = byId('latest-preaching-watch');
  const links = [featured, ...document.querySelectorAll('#preaching-archive-list .preaching-watch')];
  const seen = new Set();
  for (const link of links) {
    const id = new URL(link.href).pathname.split('/').pop();
    if (!validId(id)) continue;
    if (seen.has(id)) {
      link.closest('article')?.remove(); continue;
    }
    seen.add(id);
    const image = link.querySelector('img');
    const card = link.closest('article');
    const video = { videoId: id, title: card?.querySelector('h3')?.textContent || byId('latest-preaching-title').textContent, thumbnailUrl: image.src };
    if (card) {
      const thumbnail = link.querySelector('.preaching-thumb'); thumbnail.remove();
      const content = node('div', undefined, 'preaching-details');
      while (link.firstChild) content.append(link.firstChild);
      content.querySelector('.preaching-description')?.remove();
      content.lastElementChild?.remove();
      link.replaceWith(media(video), content);
    } else link.parentElement.replaceWith(media(video, false, true));
  }
}
async function boot() {
  enhanceManualContent();
  renderState('UNVERIFIED', null);
  if (!previewAllowed(location)) return;
  // The fixture import and fetch are unreachable on non-loopback hosts.
  const notice = byId('preachings-data-notice');
  notice.textContent = 'DEVELOPMENT PREVIEW - SYNTHETIC TEST ONLY DATA. These are not church sermons. Playback is disabled.';
  notice.classList.add('preaching-preview-notice');
  byId('latest-preaching-content').replaceChildren(); byId('preaching-archive-list').replaceChildren();
  archiveState('loading');
  try {
    const [{ loadPreview }, schema] = await Promise.all([import('./preachings-preview.mjs'), fetchJSON('data-contracts/schemas/contracts.schema.json')]);
    const sample = await loadPreview(fetchJSON, schema, new URLSearchParams(location.search).get('preachings-preview'));
    renderState(interpretState(sample.state, schema, sample.maxAgeSeconds, sample.now), sample.state, true);
    renderArchive(archiveEntries(sample.archive, schema), true);
  } catch {
    archiveState('error'); renderState('UNVERIFIED', null, true);
    byId('latest-preaching-content').replaceChildren(node('p', 'Preachings could not be loaded.'), channelLink());
  }
}
if (typeof document !== 'undefined') boot();

// Explicit integration entry point; no production endpoint is inferred or enabled.
// Returns cleanup for expiry checks. Archive validity is independent of live freshness.
export async function connectSnapshot({ pointerUrl, schema, maxAgeSeconds, fetcher = fetch }) {
  archiveState('loading');
  let snapshot;
  try { snapshot = await loadSnapshot(pointerUrl, schema, maxAgeSeconds, fetcher); }
  catch { snapshot = { state: null, status: 'UNVERIFIED', entries: null }; }
  if (snapshot.entries) {
    byId('preachings-data-notice').textContent = 'Messages from our preaching archive.';
    renderArchive(snapshot.entries);
  } else {
    byId('preachings-data-notice').replaceChildren(node('span', 'Preachings are temporarily unavailable. '), channelLink());
    player.stop();
    byId('preaching-archive-list').replaceChildren();
    byId('latest-preaching-content').replaceChildren(node('p', 'Preachings could not be loaded.'), channelLink());
    byId('preaching-load-more').hidden = true;
    byId('preaching-archive-count').textContent = '';
    archiveState('error');
  }
  let previous;
  function refreshStatus() {
    const status = snapshot.state ? interpretState(snapshot.state, schema, maxAgeSeconds) : 'UNVERIFIED';
    if (status !== previous) { renderState(status, snapshot.state); previous = status; }
  }
  refreshStatus();
  const interval = setInterval(refreshStatus, 1000);
  document.addEventListener('visibilitychange', refreshStatus);
  return () => { clearInterval(interval); document.removeEventListener('visibilitychange', refreshStatus); player.stop(); };
}
