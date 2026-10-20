import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { interpretState, archiveEntries, embedUrl, fetchJSON, loadSnapshot, previewAllowed, PAGE_SIZE } from '../preachings-data.mjs';
const schema = JSON.parse(await readFile(new URL('../../data-contracts/schemas/contracts.schema.json', import.meta.url)));
const fixtures = JSON.parse(await readFile(new URL('../../data-contracts/fixtures/test-only.json', import.meta.url)));
const sample = name => structuredClone(fixtures.cases.find(item => item.name === name).payload);
const now = Date.parse(sample('active live').lastSuccessfulCheckAt);
for (const [name, status] of [['active live', 'LIVE'], ['offline', 'OFFLINE'], ['stale previous live', 'STALE']]) {
  test(`${status} interpretation`, () => assert.equal(interpretState(sample(name), schema, 60, now), status));
}
test('unsupported and malformed state is unverified', () => {
  for (const state of [null, {}, { status: 'UNKNOWN' }, { status: 'LIVE' }]) assert.equal(interpretState(state, schema, 60, now), 'UNVERIFIED');
});
test('LIVE expires strictly after threshold; future clocks and missing policy unverified', () => {
  const live = sample('active live');
  assert.equal(interpretState(live, schema, 60, now + 60000), 'LIVE');
  assert.equal(interpretState(live, schema, 60, now + 61000), 'STALE');
  assert.equal(interpretState(live, schema, null, now), 'UNVERIFIED');
  assert.equal(interpretState(live, schema, 60, now - 1), 'UNVERIFIED');
});
test('archive validates, deduplicates, orders newest first with stable ID tie break', () => {
  const archive = sample('archive collection'); const first = archive.entries[0];
  archive.entries = [{ ...first, videoId: 'TEST_ONLY02', watchUrl: 'https://www.youtube.com/watch?v=TEST_ONLY02', publishedAt: '2026-10-18T00:00:00Z' }, first, first];
  const result = archiveEntries(archive, schema);
  assert.equal(result.length, 2); assert.equal(result[0].videoId, first.videoId);
  archive.entries[0].publishedAt = first.publishedAt;
  assert.equal(archiveEntries(archive, schema)[0].videoId, first.videoId);
});
test('empty archive, optional fields absent and invalid archive', () => {
  assert.deepEqual(archiveEntries(sample('empty archive'), schema), []);
  assert.equal(archiveEntries(sample('archive collection'), schema)[0].speaker, undefined);
  assert.throws(() => archiveEntries({ entries: [{}] }, schema));
});
test('embed validates ID and never allows synthetic fixture playback', () => {
  assert.equal(embedUrl('hwIoKTxWxS4'), 'https://www.youtube-nocookie.com/embed/hwIoKTxWxS4?autoplay=1&playsinline=1&rel=0');
  for (const id of ['', '<script>', 'TEST_ONLY01', undefined, 'abc/defghij']) assert.throws(() => embedUrl(id));
});
test('fixture preview requires explicit loopback opt-in', () => {
  assert.equal(previewAllowed({ hostname: 'localhost', search: '?preachings-preview=live' }), true);
  for (const hostname of ['vcamuzon.org', 'localhost.evil.test', '127.0.0.2']) assert.equal(previewAllowed({ hostname, search: '?preachings-preview=live' }), false);
  assert.equal(previewAllowed({ hostname: 'localhost', search: '' }), false);
});
test('missing JSON, malformed JSON and network failure reject', async () => {
  for (const fn of [async () => ({ ok: false }), async () => { throw Error(); }, async () => ({ ok: true, json() { throw Error(); } })]) await assert.rejects(fetchJSON('/sample', fn));
});
const generation = 'generation-12345678-1234-1234-1234-123456789abc';
function fetcherFor(state, archive) {
  return async url => ({ ok: true, json: async () => url.endsWith('current.json') ? { generation } : url.endsWith('state.json') ? state : archive });
}
test('collector pointer is read once, generation files use same folder', async () => {
  const urls = [];
  const fake = fetcherFor(sample('offline'), sample('archive collection'));
  const snapshot = await loadSnapshot('/approved/current.json', schema, 60, async url => { urls.push(url); return fake(url); }, 'https://church.test/preachings.html');
  assert.equal(urls.length, 3); assert.ok(urls.slice(1).every(url => url.includes(generation)));
  assert.equal(snapshot.entries.length, 1);
});
test('archive remains available when state invalid, and live remains interpretable when archive invalid', async () => {
  const result = await loadSnapshot('/approved/current.json', schema, 60, fetcherFor({ status: 'INVALID' }, sample('archive collection')), 'https://church.test/');
  assert.equal(result.status, 'UNVERIFIED'); assert.equal(result.entries.length, 1);
  const invalidArchive = await loadSnapshot('/approved/current.json', schema, 60, fetcherFor(sample('offline'), {}), 'https://church.test/');
  assert.equal(invalidArchive.entries, null);
});
test('pointer traversal and cross-origin data rejected', async () => {
  await assert.rejects(loadSnapshot('https://evil.test/current.json', schema, 60, fetcherFor(null, null), 'https://church.test/'));
  await assert.rejects(loadSnapshot('/current.json', schema, 60, async () => ({ ok: true, json: async () => ({ generation: '../secrets' }) }), 'https://church.test/'));
});
test('pagination batch is bounded', () => assert.equal(PAGE_SIZE, 8));
