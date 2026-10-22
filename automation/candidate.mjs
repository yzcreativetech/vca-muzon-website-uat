import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../collector/config.mjs';
import { createStore } from '../collector/output.mjs';

// This gate is intentionally limited to disposable first-run candidates.
export function candidateConfig(env = process.env) {
  if (env.GITHUB_REPOSITORY !== 'yzcreativetech/vca-muzon-website-uat' ||
      env.GITHUB_REF !== 'refs/heads/feature/youtube-live-archive' ||
      env.YOUTUBE_CANDIDATE_APPROVED !== 'true' ||
      !env.YOUTUBE_BACKFILL_LIMIT || !env.YOUTUBE_CHANNEL_ID) {
    throw new Error('Candidate configuration is missing or unapproved');
  }
  return loadConfig(env);
}

export async function verifyCandidate(config) {
  const schema = JSON.parse(await readFile(new URL('../data-contracts/schemas/contracts.schema.json', import.meta.url), 'utf8'));
  const snapshot = await createStore(config.outputDir, schema).read();
  if (!snapshot || snapshot.channel.id !== config.channelId ||
      snapshot.archive.lastSuccessfulCheckAt !== snapshot.state.lastSuccessfulCheckAt ||
      JSON.stringify(snapshot).includes(config.apiKey)) {
    throw new Error('Candidate verification failed');
  }
  return snapshot;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const config = candidateConfig();
    if (process.argv[2] === 'verify') await verifyCandidate(config);
    else if (process.argv[2] !== 'preflight') throw new Error();
    console.log('Candidate checks passed; public publication remains disabled.');
  } catch {
    // Neither raw errors nor environment values belong in Actions logs.
    console.error('Candidate checks failed. Review approved configuration and collector summary.');
    process.exitCode = 1;
  }
}
