import { loadConfig } from './config.mjs';
import { collect } from './collect.mjs';
import { safeError } from './errors.mjs';

// Server-side command only. Never import this module from a website page.
try {
  const result = await collect(loadConfig());
  // Stale payloads may contain titles; emit only a fixed, sanitized summary.
  if (result.ok) console.log(JSON.stringify({ ok: true, status: result.status,
    archiveCount: result.archiveCount, candidateCount: result.candidateCount,
    ...(result.warnings ? { warnings: result.warnings } : {}) }));
  else {
    console.error(JSON.stringify({ ok: false, error: result.error, hasStaleSnapshot: Boolean(result.stale),
      ...(result.warnings ? { warnings: result.warnings } : {}) }));
    process.exitCode = 1;
  }
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: safeError(error) }));
  process.exitCode = 1;
}
