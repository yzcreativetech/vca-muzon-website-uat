export const compareIds = (a, b) => a < b ? -1 : a > b ? 1 : 0;

export function stableOrder(entries) {
  return [...entries].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || compareIds(a.videoId, b.videoId));
}

export function mergeArchive(existing, fresh) {
  const byId = new Map();
  for (const entry of [...existing, ...fresh]) {
    const defined = Object.fromEntries(Object.entries(entry).filter(([, value]) => value !== undefined));
    byId.set(entry.videoId, { ...byId.get(entry.videoId), ...defined });
  }
  return stableOrder([...byId.values()]);
}
