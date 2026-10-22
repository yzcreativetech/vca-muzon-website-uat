# Step 7: UAT automation

Status: **CONFIGURATION APPROVAL REQUIRED**. Implemented and tested offline;
not activated, committed, pushed or verified on GitHub. Public publication and
scheduled refresh are deliberately absent. No real API requests were made.

## Audit

Checkout: `feature/youtube-live-archive`, origin
`https://github.com/yzcreativetech/vca-muzon-website-uat.git`.
Step 3, 4 and 6 commits are present (eb704ba, 614c2fa, 14935dc).
No existing `.github/workflows`, package manifest, CNAME or local Pages deployment
configuration was found. Remote Pages settings and repository secrets have not
been inspected; absence of local configuration does not establish hosting state.
Step 5 structure exists in preachings.html, but no formal milestone acceptance
record was found. Step 5 completion remains unconfirmed.

The existing noninteractive command is `node collector/cli.mjs`; it exits nonzero
on failure and emits sanitized summaries. It requires Node 22+ and no packages.
The workflow provisions Node 24 LTS. Only official checkout/setup-node actions
are used, pinned to verified upstream commits:
[checkout](https://github.com/actions/checkout/commit/11bd71901bbe5b1630ceea73d27597364c9af683),
[setup-node](https://github.com/actions/setup-node/commit/49933ea5288caeca8642d1e84afbd3f7d6820020).
Review these pins periodically; they are fixed versions, not automatic updates.
The workflow file uses JSON syntax, a YAML 1.2 subset, so the full document is
parsed by the native Node tests without adding a YAML dependency.

## Manual execution after review

No workflow is activated by this local change. GitHub generally requires the
workflow_dispatch definition to exist on the default branch before the Actions
UI can dispatch it. Introducing that definition requires a separate reviewed
repository change; do not merge this feature or relax its branch gate implicitly.

After approved installation, select Actions > YouTube preachings candidate checks
> Run workflow > feature/youtube-live-archive. Leave collect_candidate unchecked
for offline tests. This mode never reads the API secret or calls YouTube.
Browser checks run locally, not on the hosted runner (no browser dependencies
are installed by the workflow).

API candidate execution additionally requires explicit approval of an isolated
first-run scan and its quota usage. Configure these repository variables under
Settings > Secrets and variables > Actions > Variables:

| Variable | Required decision |
| --- | --- |
| YOUTUBE_CANDIDATE_APPROVED | Set to `true` only after candidate-run approval |
| YOUTUBE_CHANNEL_ID | API-verified official pinned channel ID |
| YOUTUBE_MAX_AGE_SECONDS | Approved positive LIVE/OFFLINE freshness limit |
| YOUTUBE_BACKFILL_LIMIT | Approved bounded first-run scan size (1–10000) |
| YOUTUBE_ARCHIVE_VIDEO_IDS | Optional explicitly approved preaching IDs, comma separated |

These are workflow approval inputs or existing collector variables; no new
collector arguments are invented. YOUTUBE_OUTPUT_DIR is a private, unique runner
temporary directory, not a publication path. Other collector controls and default
retry limits remain as documented in collector/README.md.

Under Settings > Secrets and variables > Actions > Secrets > New repository
secret, configure `YOUTUBE_API_KEY` after the name/provisioning decision is approved.
This matches the collector variable. Never paste the value into chat, source,
workflow inputs, logs or browser code. No secret has been created or rotated.
Missing/invalid configuration fails preflight before the collector runs.

Check collect_candidate only for an approved disposable scan. The workflow runs
preflight, the actual CLI, then a second storage/contract validation and credential
scan. It does not export generated content. Check the run summary and individual
step logs for fixed error codes and cleanup warnings. Job failure stops subsequent
generation/verification steps; the always-run summary reports job status.

## Publication and persistence gate

The collector writes current.json with a generation name, plus immutable
generation-UUID/{archive,state,metadata}.json. Step 3 validates the consumer files;
collector validation checks internal metadata. The frontend reads the pointer
once and fetches archive/state from the same generation with cache: no-store.
It never fetches metadata. Its integration entry point is not currently connected
on normal page visits; no UI or freshness policy was changed here.

Local generation uses exclusive locks, complete generation writes and atomic
pointer replacement. Partial writes, invalid output and API errors preserve the
last valid local generation. Cleanup warnings after pointer replacement remain
successful. Failed refreshes do not write fabricated OFFLINE or STALE data.
The frontend interprets expired LIVE/OFFLINE as STALE under the supplied policy.
This is tested behavior, not live API acceptance.

Hosted runners are ephemeral. This workflow intentionally restores nothing and
retains no candidate artifacts, checkpoints, discovered IDs or generations across
runs. Every candidate starts fresh and may contain only a partial history. It
must never replace an existing archive. Persistence cannot be implemented until
an approved storage/publication mechanism exists. No cache is used as authority.

A future approved publisher must recover the entire valid prior generation,
including private metadata/checkpoint, before collecting; distinguish explicitly
authorized bootstrap from missing/corrupt persistence; validate identity and all
contracts; transfer immutable consumer files first; atomically switch the public
pointer only after transfer verification; retain previous generations for readers
and rollback. Do not expose internal metadata by default. Approve cache headers
and retention together. GitHub Pages branch commits, deployment permissions and
public URLs require separate review; no automatic repository writes are present.

## Pending operational decisions

All ten requested operational decisions lack documented approval:

1. JSON publication directory and mechanism, including private persistence.
2. Stable same-origin public current.json URL and cache behavior.
3. Scheduled refresh frequency and corresponding UTC cron.
4. LIVE freshness threshold shared with the frontend.
5. Historical archive refresh cadence (collector currently combines history and live checks).
6. Daily API request/quota budget and enforcement strategy.
7. Approval/provisioning of proposed YOUTUBE_API_KEY secret name.
8. Any publication write permissions; current workflow needs contents: read only.
9. Snapshot retention, rollback window and orphan cleanup.
10. Initial historical backfill/bootstrap policy and preaching eligibility approvals.

No cron is proposed numerically without a refresh decision. After approval, add a
reviewed `schedule` entry using the chosen UTC cron and change job gating/persistence
as needed for GitHub's default-branch scheduled execution. Keep scheduling disabled
until daily budget enforcement and persistence are implemented. Each invocation
performs channel resolution, historical pagination, live search and video batches;
archive rechecks, retries and pagination increase consumption. Existing bounds are
per run, not a daily quota manager. Measure live consumption before activation.

## Security and recovery

Manual trigger only; exact UAT repository/feature ref guard; contents: read;
checkout persist-credentials false; no PAT, write token, privileged PR trigger,
deployment, shell-interpolated workflow input, cache or artifact upload. API key
is scoped only to the collection step. umask 077 restricts generated files.
The constant concurrency group serializes runs without cancelling active writes;
GitHub may replace pending runs. Job timeout is 15 minutes. Do not enable verbose
environment dumps or run unreviewed branch changes with repository secrets.

For a failed candidate, inspect sanitized logs, correct approved configuration,
and rerun manually. Runner interruption discards disposable work; no public state
changes. No public rollback is needed at this stage. For an approved future durable
store, stop automation, validate the preceding generation, then atomically restore
its pointer. Verify no process is running before removing a leftover lock; never
delete valid archive/checkpoint data to bypass an error. Expired checkpoint tokens
require an operator-approved restart plan, not silent reset. Retain metadata during
recovery. Disable future scheduling before rollback or credential investigation.

## Validation and limits

Run from the repository root with Node 24 and existing Python Playwright/Chrome:

```text
node --test --experimental-test-isolation=none data-contracts/validate.test.mjs collector/test/collector.test.mjs js/test/preachings.test.mjs automation/candidate.test.mjs
python js/test/preachings_browser.py
git diff --check
```

Offline results: 103 Node tests (existing 100 plus 3 Step 7), 84 browser assertions
at 375/430/768/1024/1440px. Existing collector tests cover invalid key, quota,
429/500/503, timeout/network/invalid responses, incomplete livestream metadata,
partial writes/failed pointer replacement, corrupt storage, concurrent locks,
missing prior snapshots, and cleanup failures. Step 7 checks configuration gates,
workflow parsing/security, independent candidate validation, frontend generation
resolution, absence of the test secret, invalid JSON rejection and prior pointer
preservation on failed refresh. Real abrupt process termination, hosted token
permission denial and remote publication failure are not exercised: no remote
publisher exists. Existing lock and partial-write tests model local interruption
effects; they do not establish hosting atomicity or durability.

Requires GitHub verification: dispatch availability/branch guards, runner execution,
action downloads, settings/secret availability, concurrency queue and cancellation,
job timeout, actual token permissions, official channel access and quota usage.
Requires approval and further implementation: persistent generation restore,
remote publication/rollback, retention, daily budget enforcement and scheduling.
Production promotion also requires confirmed Step 5 acceptance, approved frontend
connection, live playback/API verification and a separate production review.
No Step 8 work is included.
