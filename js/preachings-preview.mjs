// Explicit localhost-only fixture adapter. Never imported on the published page.
export async function loadPreview(fetchJSON, schema, mode = 'offline') {
  const fixtures = await fetchJSON('data-contracts/fixtures/test-only.json');
  const names = { live: 'active live', offline: 'offline', stale: 'stale previous live' };
  const state = fixtures.cases.find(item => item.name === (names[mode] || names.offline)).payload;
  const archive = fixtures.cases.find(item => item.name === (mode === 'empty' ? 'empty archive' : 'archive collection')).payload;
  // The fixture clock is fixed, so LIVE/OFFLINE previews do not expire with wall time.
  return { state, archive, now: Date.parse(state.lastSuccessfulCheckAt), maxAgeSeconds: 60, schema };
}
