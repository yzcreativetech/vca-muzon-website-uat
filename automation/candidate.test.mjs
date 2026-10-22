import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { candidateConfig, verifyCandidate } from './candidate.mjs';
import { collect } from '../collector/collect.mjs';
import { environment, mockClient, NOW } from '../collector/test/fixtures.mjs';
import { loadSnapshot } from '../js/preachings-data.mjs';

const env = extra => ({ ...environment(), GITHUB_REPOSITORY: 'yzcreativetech/vca-muzon-website-uat',
  GITHUB_REF: 'refs/heads/feature/youtube-live-archive', YOUTUBE_CANDIDATE_APPROVED: 'true',
  YOUTUBE_BACKFILL_LIMIT: '1', ...extra });

test('candidate gate rejects missing credentials and unapproved or production configuration', () => {
  for (const change of [ { YOUTUBE_API_KEY: '' }, { YOUTUBE_MAX_AGE_SECONDS: '' },
    { YOUTUBE_CHANNEL_ID: '' }, { YOUTUBE_BACKFILL_LIMIT: '' }, { YOUTUBE_CANDIDATE_APPROVED: '' },
    { GITHUB_REPOSITORY: 'vcamediamuzon/vca-muzon-website' }, { GITHUB_REF: 'refs/heads/main' } ]) {
    assert.throws(() => candidateConfig(env(change)));
  }
  assert.equal(candidateConfig(env()).backfillLimit, 1);
});

test('workflow is manual, isolated, read-only and has no publication or secret-bearing artifacts', async () => {
  // JSON is a YAML 1.2 subset: parse the complete workflow without a new dependency.
  const workflow = JSON.parse(await readFile(new URL('../.github/workflows/youtube-preachings-refresh.yml', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.equal(workflow.on.workflow_dispatch.inputs.collect_candidate.default, false);
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.equal(workflow.concurrency['cancel-in-progress'], false);
  assert.equal(workflow.concurrency.group, 'youtube-preachings-uat');
  const job = workflow.jobs.candidate;
  assert.match(job.if, /github.repository == 'yzcreativetech\/vca-muzon-website-uat'/);
  assert.match(job.if, /github.ref == 'refs\/heads\/feature\/youtube-live-archive'/);
  assert.equal(job['timeout-minutes'], 15);
  for (const step of job.steps.filter(step => step.uses)) assert.match(step.uses, /^actions\/(checkout|setup-node)@[a-f0-9]{40}$/);
  assert.equal(job.steps[0].with['persist-credentials'], false);
  const step = job.steps.find(step => step.env?.YOUTUBE_API_KEY);
  assert.equal(step.if, '${{ inputs.collect_candidate }}');
  assert.equal(step.env.YOUTUBE_API_KEY, '${{ secrets.YOUTUBE_API_KEY }}');
  assert.equal(step.run, 'umask 077\nnode automation/candidate.mjs preflight\nnode collector/cli.mjs\nnode automation/candidate.mjs verify');
  assert.doesNotMatch(JSON.stringify(workflow), /upload-artifact|git push|contents.*write|pull_request_target|pages:|deploy-pages/);
});

test('candidate validates, resolves in frontend, excludes secret, preserves prior generation on failure', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'step7-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const config = candidateConfig(env({ YOUTUBE_OUTPUT_DIR: dir }));
  await assert.rejects(verifyCandidate(config));
  const result = await collect(config, { client: mockClient(), clock: () => NOW });
  assert.equal(result.ok, true);
  const snapshot = await verifyCandidate(config);
  assert.equal(snapshot.state.status, 'OFFLINE');
  assert.ok(!JSON.stringify(snapshot).includes(config.apiKey));
  const pointer = await readFile(join(dir, 'current.json'), 'utf8');
  const schema = JSON.parse(await readFile(new URL('../data-contracts/schemas/contracts.schema.json', import.meta.url), 'utf8'));
  const fetcher = async url => ({ ok: true, json: async () => JSON.parse(await readFile(join(dir, new URL(url).pathname.slice(1)), 'utf8')) });
  const loaded = await loadSnapshot('/current.json', schema, 60, fetcher, 'https://uat.invalid/');
  assert.deepEqual(loaded.entries, snapshot.archive.entries);
  assert.equal(loaded.status, 'STALE');
  const failure = await collect(config, { client: { list() { throw new Error('TEST ONLY remote failure'); } }, clock: () => NOW });
  assert.equal(failure.ok, false);
  assert.equal(failure.stale.status, 'STALE');
  assert.equal(await readFile(join(dir, 'current.json'), 'utf8'), pointer);
  await writeFile(join(dir, result.generation, 'archive.json'), '{broken');
  await assert.rejects(verifyCandidate(config));
});
