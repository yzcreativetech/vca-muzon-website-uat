# Step 4 — YouTube data collector

Server-side, manually invoked data collection for the static VCA Muzon site.
No page imports these modules. No frontend changes, scheduled jobs, deployment,
database, npm dependencies, OAuth or Google Cloud resources are introduced.
Requires Node.js 22 or later. Verification here uses the installed Node 24.21.0
runtime bundled with Python Playwright; Node is not on this environment's PATH.

## Audit and verification boundary

Step 3 is committed as `eb704ba99a3618a01eb4a52fd5de684e50a7e715` on
`feature/youtube-live-archive` in the integration UAT checkout. Existing conventions
are ES modules for data validation and native `node:test`. There was no collector,
generated-data directory, configured channel ID, or documented API credential
provisioning strategy. The public site links to
`https://www.youtube.com/@vcamuzonsjdm` in `preachings.html`. This is a documented
handle, **not an API-verified channel ID**. It is not silently selected by code.
No roadmap was found and none was created.

The execution environment has no accessible `YOUTUBE_API_KEY`. All acceptance
tests use synthetic TEST ONLY responses and temporary filesystem output. Live
channel discovery, access permissions, actual response behavior, search indexing,
and quota consumption have **not** been verified. Configure the official channel
and credentials before live integration verification. Independent Draft 2020-12
schema validation remains unavailable as documented in Step 3. Its contracts and
validator have not been modified.

## Modules

| File | Responsibility |
| --- | --- |
| `config.mjs` | Environment validation and safe channel references |
| `api-client.mjs` | Public read-only API requests, timeouts and retry policy |
| `channel.mjs` | Resolve and verify the configured identity and uploads playlist |
| `retrieval.mjs` | Historical pagination, channel-scoped live search, detail batches |
| `classify.mjs` | Broadcast classification, metadata mapping, duration conversion |
| `merge.mjs` | Deterministic deduplication and archive ordering |
| `output.mjs` | Validation, storage lock, immutable generations, atomic pointer |
| `collect.mjs` | One refresh, checkpoint handling, state construction, stale fallback |
| `errors.mjs` | Sanitized structured errors |
| `cli.mjs` | Manual command with a sanitized summary and success/failure exit code |
| `test/` | Synthetic fixtures and automated tests |

## Environment configuration

Use the server process environment; no credential file or dotenv loader is used.
Never put credentials in the site, committed files, shell transcripts or JSON.

| Variable | Behavior |
| --- | --- |
| `YOUTUBE_API_KEY` | Required public Data API credential. Read into memory, sent only as `X-Goog-Api-Key`, omitted from serialized config. Never printed. |
| `YOUTUBE_CHANNEL_ID` | Preferred pinned ID: `UC` followed by 22 URL-safe characters. No real ID is supplied by this implementation. |
| `YOUTUBE_CHANNEL_HANDLE` | Alternative explicit `@handle`; the documented site handle is `@vcamuzonsjdm`. Conservative ASCII handle subset only. |
| `YOUTUBE_CHANNEL_URL` | Alternative HTTPS `youtube.com` or `www.youtube.com` `/@handle` or `/channel/ID` URL. Other hosts, credentials, query strings and fragments are rejected. |
| `YOUTUBE_MAX_AGE_SECONDS` | Required approved positive integer freshness policy, maximum 31536000. **No production default.** Test values are not policy approval. |
| `YOUTUBE_BACKFILL_LIMIT` | Playlist items scanned per invocation, 1–10000; default 100. Not archive retention. |
| `YOUTUBE_ARCHIVE_VIDEO_IDS` | Optional comma-separated explicit video allowlist; default empty. These are approval inputs, not an automatic sermon detector. |
| `YOUTUBE_OUTPUT_DIR` | Default `.collector-output` under the repository. Other existing source/page directories inside the project are rejected. A dedicated absolute directory outside the checkout is also supported. |
| `YOUTUBE_MAX_RETRIES` | Additional attempts per API call, 0–8; default 3. |
| `YOUTUBE_TIMEOUT_MS` | Per-attempt request/body timeout, 1–120000; default 15000. |
| `YOUTUBE_RETRY_BASE_MS` | Exponential delay base, 0–60000; default 500. |
| `YOUTUBE_RETRY_MAX_MS` | Delay cap, 0–120000; default 30000. |
| `YOUTUBE_LIVE_SEARCH_MAX_PAGES` | Maximum live-search pages, 1–20; default 5. Incomplete search fails safely. |

At least one channel reference is required. If both a pinned ID and handle are
configured, both are resolved and must identify the same channel. Contradictory
references are rejected. Channel names alone never establish ownership. The
resolved channel is reused throughout one invocation; a previously published
snapshot must match the configured/resolved channel. Identity mismatches neither
publish output nor return another channel's state as a stale fallback.

After the key, channel and approved freshness policy have been supplied to the
process environment, run manually from the repository root:

```powershell
node collector/cli.mjs
```

This command performs real API calls when correctly configured. It was **not**
run against YouTube during implementation. Tests below make no network calls.
Keep generated snapshots separate from reviewed source files; no generated data
is staged, deployed or published by this milestone.

## Discovery, history and eligibility

Resolve `channels.list` with `id` or `forHandle`, requesting snippet and uploads
playlist metadata. Historical backfill uses `playlistItems.list` with up to 50
items per page, followed by `videos.list` batches of up to 50 unique IDs. The
saved next-page token resumes a limited run. Exhaustion records null; the next
invocation starts from the beginning to revisit recent uploads. Duplicate IDs
do not duplicate records. Repeated tokens and invalid responses fail safely.
Tokens can expire or become invalid when the playlist changes; such an API error
preserves the last snapshot and requires operator review before restarting with
a new dedicated output directory. No automatic destructive reset is attempted.

Deleted/private placeholders with no ID are skipped; IDs omitted from detail
responses are recorded as UNAVAILABLE. Details with an unexpected ID or another
channel ID abort the refresh. Each run also rechecks existing archive entries,
explicitly approved IDs and previously active/indeterminate candidates.

No sermon rules were approved. By default, **no upload enters the preaching
archive**: known metadata is retained in `metadata.json` as candidate records.
Only explicitly allowlisted or previously approved archive IDs with confirmed
COMPLETED/UPLOADED status and valid required metadata can enter it. No speaker,
series or sermon category is inferred. An allowlist is a review mechanism, not
an assertion that all videos from this church are preachings.

## Classification and current state

All eligible videos require `privacyStatus=public` and `uploadStatus=processed`.
Classification uses `snippet.liveBroadcastContent` and `liveStreamingDetails`,
never title keywords or a publication timestamp alone:

| Result | Evidence |
| --- | --- |
| LIVE | `live`, valid actual start at/before observation, no actual end |
| UPCOMING | `upcoming`, scheduled start, no actual start/end |
| COMPLETED | `none`, valid actual start/end in order at/before observation |
| UPLOADED | `none`, no liveStreamingDetails, valid publication at/before observation |
| UNAVAILABLE | Omitted detail, explicit private/unlisted status, deleted/failed/rejected upload, or an ordinary non-broadcast upload still processing |
| INDETERMINATE | Missing required status/processing metadata, contradictory broadcast fields or invalid/future timestamps |

LIVE and UPCOMING never enter the archive. Confirmed active videos previously
archived are removed from the active archive while their approval and optional
metadata are retained in candidate records for later completion. Previously
valid entries are retained when current details are unavailable; the candidate
record documents their latest availability, so archive retention does not prove
continued playback availability. No automatic deletion policy is invented.

Missing uploadStatus alone proves neither unavailability nor a confirmed LIVE
state. Unresolved possible broadcasts from backfill or live search prevent
OFFLINE publication even when live search is empty. Previous LIVE/STALE state
and legacy UNAVAILABLE candidates retaining livestream information are also
rechecked, so pagination or merging cannot silently drop that evidence. Failure
preserves the previous snapshot and returns the existing STALE contract where
prior valid state exists; no schema field or livestream metadata is invented.

A bounded history scan cannot establish absence of an active livestream. Every
successful refresh therefore separately completes a channel-scoped
`search.list(channelId,type=video,eventType=live)` query and validates returned
IDs through video details. This search never identifies the church. It consumes
additional API quota beyond history retrieval; its completeness is still limited
by YouTube's public search/index visibility. There is no private/member-only or
owner-authenticated broadcast inventory. API search may lag; public API
observation is not a guarantee of all broadcasts or real-time availability.

Every invocation consumes live-search quota and rechecks existing archive
details. Pagination and retries add requests; the current limits bound individual
runs/requests, not daily consumption. No scheduled refresh frequency has been
approved. A future daily request budget and approved frequency are needed before
scheduled operation. This corrective patch implements neither scheduling nor a
daily quota manager.

An observed LIVE item produces the existing LIVE contract. Otherwise a completed
successful live check with no unresolved active candidates produces OFFLINE,
optionally including the earliest observed upcoming stream and latest archive
entry. Upcoming discovery is limited to scanned/retained candidates; it is not
an exhaustive upcoming search. Multiple live items use deterministic video-ID
ordering; all candidates remain retained. Missing current-live details,
contradictory broadcast data, incomplete search or errors never become OFFLINE.

## Merging, freshness and failures

Video ID is the deduplication key. New authoritative metadata updates existing
fields; absent optional fields preserve prior values, including manually present
speaker/series/category values. Empty strings supplied by the API are actual
updates. Ordering is publication time descending with video ID as a stable tie
breaker. The Step 3 maximum of 1000 archive entries remains enforced; exceeding it
rejects publication rather than silently truncating or changing the contract.

Retries cover network failures, timeouts, HTTP 429, 500/502/503/504, rate-limit
403 and malformed successful response envelopes. Delays use capped exponential
backoff with 50–100% jitter; timing, randomness and fetch are injectable. A
maximum retry count bounds attempts. Exhausted quota, invalid credentials and
other permanent HTTP failures are not repeatedly retried. Remote exception text,
response bodies, authenticated URLs and raw API errors are never logged.
Errors expose fixed code/message, retryable flag and applicable status/attempts.

On a pre-publication refresh failure the preceding published snapshot is preserved. If prior
valid state exists for the same channel, the programmatic result additionally
returns an existing-contract STALE payload with the previous successful timestamp
and historical LIVE information where applicable. STALE is **not written over
the last valid generation on failure**. With no successful prior data, no state
is invented. The CLI prints only fixed error details, any sanitized cleanup
warnings, and whether a stale fallback exists. Consumers must assess cached data
age; old LIVE is never current proof.

Freshness uses the explicit max-age policy, floor of elapsed seconds, and the
existing strict `age > maximum` condition. Errors may stale data before expiry.
Clock reversal is rejected. Successful timestamps describe this observation,
not every historical candidate's last observation; each source also records its
own `observedAt`.

## Output and publication

The output directory is dedicated to one channel and contains:

```text
current.json                         # { "generation": "generation-<uuid>" }
generation-<uuid>/archive.json        # unchanged Step 3 archiveCollection contract
generation-<uuid>/state.json          # unchanged Step 3 LIVE/OFFLINE/STALE contract
generation-<uuid>/metadata.json       # collector-internal channel, candidates, checkpoint
```

Use a dedicated, operator-controlled directory with a known resolved location.
Path checks are lexical; they do not resolve or prevent symlink/junction redirection.
Do not point the output directory through links into website, configuration or
other application directories. This patch does not change filesystem permissions
or add canonical-path enforcement.

`metadata.json` contains channel ID/title/uploads playlist (and configured handle
when used), `backfill.nextPageToken`, and `sources`. Sources have videoId,
classification and observedAt; optional metadata uses a valid archive-entry
shape, livestream uses the shared video shape, actualEndAt preserves completion
evidence, and archiveApproved preserves explicit approval. Retained fields are
historical; classification and observedAt describe the most recent check.
This internal file and the pointer are storage controls, not new Step 3 consumer
contracts. They are separately checked; the two consumer files are validated
through the unmodified Step 3 JavaScript layer before any write.

A lock prevents overlapping refreshes. Files are written into a fresh immutable
generation, then a same-directory rename atomically replaces current.json only
after all files are complete. Readers read the pointer once and use that folder.
Validation, API or write failures leave the previous pointer untouched. Actual
credential material in any serialized output rejects publication. Byte-identical
reruns reuse the existing generation; legitimate refresh timestamps create a new
generation. Old and incomplete orphan generations are retained for recovery;
automatic pruning and power-loss/fsync durability are not implemented. After a
process crash, an operator must verify that no collector is running before
removing a leftover refresh.lock. No stale lock is broken automatically.

Lock cleanup is separate from publication. Once the pointer replacement succeeds,
the collector still returns `ok: true` if lock close/removal fails; a top-level
`warnings` array reports `LOCK_CLOSE_FAILED` or `LOCK_REMOVE_FAILED`, each with
`phase: cleanup` and a fixed, sanitized operator message. The CLI includes these
warnings in its success summary and retains a successful exit status. Cleanup
does not retry publication or create another generation. If the refresh itself
fails before replacement and cleanup also fails, `ok: false` preserves the primary
error and reports cleanup warnings separately. An uncertain open lock is not
removed; any leftover lock requires operator inspection before another refresh.

## Tests and acceptance

```powershell
node --test data-contracts/validate.test.mjs collector/test/collector.test.mjs
```

In this sandbox child-process isolation is blocked. With the installed Node 24
runtime, use `--test --experimental-test-isolation=none` for the same test files.
Tests cover configuration, ID/handle mismatch, pagination/resume, deduplication,
50-ID batching, classification, missing/private/deleted metadata, transient and
permanent errors, bounded retries, request/body timeouts, successful filesystem
refresh, invalid output, partial writes, atomic pointer failures, locks,
credential rejection, idempotency, freshness and STALE versus OFFLINE.
Temporary test output is parsed and validated, then removed by test cleanup.

Verification passed: **86 tests** (62 collector tests plus all 24 Step 3 tests),
JavaScript syntax checks, repository JSON parsing and whitespace checks. Generated
JSON is also parsed and validated in real-filesystem tests. No live API request
was made.

The nine corrective regression tests cover missing processing metadata,
contradictory historical evidence despite empty live search, valid STALE fallback,
unresolved live-search results, retained broadcast rechecks, affirmative
unavailability, cleanup warnings after successful publication, uncertain lock
close handling, and preservation of a pre-publication error when cleanup fails.

Mocked/offline acceptance is implemented; live integration acceptance remains
unverified until official configuration and API access are available. Step 3's
24 tests must continue passing. Step 5, website rendering, deployment, scheduling
and automatic sermon classification are not part of this milestone. No files
are staged, committed or pushed during implementation.

Official references used for the API mapping:
[channels.list](https://developers.google.com/youtube/v3/docs/channels/list),
[playlistItems.list](https://developers.google.com/youtube/v3/docs/playlistItems/list),
[videos.list](https://developers.google.com/youtube/v3/docs/videos/list),
[video resource fields](https://developers.google.com/youtube/v3/docs/videos),
[search.list](https://developers.google.com/youtube/v3/docs/search/list),
[API errors](https://developers.google.com/youtube/v3/docs/errors),
[API key system header](https://cloud.google.com/apis/docs/system-parameters).
