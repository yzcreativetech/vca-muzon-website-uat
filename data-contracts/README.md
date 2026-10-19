# YouTube data contracts — Step 3

These files define data only. They are not loaded by any website page. All
fixtures are synthetic TEST ONLY content; their placeholder IDs must never be
used as church content or fetched from YouTube.

## Audit

The repository contains static HTML, CSS and a browser script (`js/vca_js.js`).
There are no existing JSON contracts, validator dependencies, package manifest,
or automated test runner. Existing preaching links are manually maintained.
No documented API response mapping or LIVE/OFFLINE/STALE policy was found.
The separate structure here fits that architecture without changing the pages.

`milestone.md` and an integration roadmap are absent. Existing progress notes
describe website styling and unrelated next steps. Consequently no milestone
file was created, no roadmap completion marker was asserted, and the next
integration milestone cannot be identified from this checkout. A read-only search
of the parent project folder also found no integration roadmap. The parent
project summary and original website phase plan mention YouTube as future work,
but do not define this integration's numbered milestones. Step 2B's
credential limitation remains unresolved; these offline contracts do not verify
channel access. No API access is needed for this step.

## Schema and fields

`schemas/contracts.schema.json` uses JSON Schema Draft 2020-12. Its reusable
`$defs` contain `live`, `offline`, `stale`, `archiveEntry`, and
`archiveCollection`, plus shared timestamp, video and freshness definitions.
The root accepts exactly one of these contracts. External validators must enable
format assertion for `date-time` and `uri`.

| Contract | Required | Optional |
| --- | --- | --- |
| LIVE | status=LIVE, lastSuccessfulCheckAt, livestream | none at state level |
| OFFLINE | status=OFFLINE, lastSuccessfulCheckAt | nextScheduledLivestream, latestArchiveEntry |
| STALE | status=STALE, lastSuccessfulCheckAt, previousStatus, reason, freshness | lastKnownLivestream |
| Video | videoId, title, thumbnailUrl, watchUrl | description, scheduledStartAt, actualStartAt |
| Archive entry | videoId, title, thumbnailUrl, watchUrl, publishedAt | description, durationSeconds, speaker, series, category |
| Archive collection | entries, lastSuccessfulCheckAt | none |
| Freshness | evaluatedAt, ageSeconds, policy.maxAgeSeconds | none |

Unknown fields and null values are rejected. Missing optional metadata is omitted.
Descriptions may be empty; titles and optional labels must be nonempty. IDs have
11 URL-safe characters; shape validation does not prove a video exists. Watch
URLs use the canonical HTTPS `www.youtube.com/watch?v=ID` form. Thumbnail URLs
must be absolute HTTPS URLs. Collections allow zero through 1000 entries per
payload; this is a contract size limit, not an archive retention policy.
Dates use UTC `Z`, seconds, and optional 1–3 fractional second digits. Calendar
dates are checked, including leap days; leap seconds are not supported.

## Meaning and freshness

LIVE records a successful observation of an active livestream. OFFLINE records a
successful observation of no active livestream. Errors must never be converted
to OFFLINE. A cached LIVE payload alone cannot prove a stream is currently live.

STALE records a previously successful observation that is no longer reliable.
`lastSuccessfulCheckAt` stays at the successful observation, not a failed attempt.
`previousStatus` identifies LIVE or OFFLINE. Retained livestream information is
historical only, requires previousStatus LIVE, and must never be presented as
currently live. With no prior success, there is no valid STALE snapshot under
this contract; startup/no-data error handling is deferred to the integration.

Reasons are AGE_EXCEEDED, API_ERROR, INVALID_RESPONSE, and CHECK_FAILED.
`ageSeconds` is the floor of elapsed seconds from the last successful check to
`evaluatedAt`; negative or inconsistent age is rejected. AGE_EXCEEDED requires
age strictly greater than `policy.maxAgeSeconds`. Equality remains within the
freshness window. Failures may make data stale before that threshold.

The positive integer `maxAgeSeconds` is a configurable policy input. No production
threshold has been approved. Fixture values (including 60 seconds) are test-only.
Validation checks recorded freshness consistency; it does not read a clock,
poll, detect a livestream, or transition states. A future consumer must assess
age at use time and classify expired observations as STALE under approved policy.

## JavaScript validation and tests

`validate.mjs` exports `validate(kind, payload, schema)` and returns
`{ valid, errors: [{ path, message }] }`. Supported kinds are `state` (dispatches
by status), `live`, `offline`, `stale`, `archiveEntry`, `archiveCollection`.
Pass the parsed schema explicitly; this module performs no filesystem or network
access and can be imported as a browser ES module or used in Node.

The small schema-driven engine implements the keywords used by the selected
definitions: local `$ref`, type, properties, required, additionalProperties=false,
const, enum, string lengths, pattern, formats, minimum, items and maxItems.
It selects a definition explicitly rather than implementing general `oneOf`.
It is **not a complete JSON Schema validator**. Tests audit every schema keyword,
reference and state alternative, so schema edits outside the supported subset
must be accompanied by validator changes. Fixture tests exercise the actual
schema definitions through this engine. They do not constitute an independent
Draft 2020-12 conformance test or external meta-schema validation.

JavaScript adds semantic checks beyond standard JSON Schema: watch URL/ID
agreement, elapsed age consistency, stale threshold comparison and compatibility
of previousStatus with retained livestream information. An external schema
validator can accept payloads that fail these additional semantic rules.

Run with Node 18 or later, without installing packages:

```sh
node --test data-contracts/validate.test.mjs
node --check data-contracts/validate.mjs
node --check data-contracts/validate.test.mjs
```

Final verification: the original 22 tests and two additional regression tests
(24 total) passed using the installed
Playwright-bundled Node executable. The default runner could not spawn a child
process under the sandbox (`EPERM`); rerunning with
`--test --experimental-test-isolation=none` passed. Both JavaScript syntax checks,
JSON parsing, and whitespace checks passed. The two corrections make malformed
status values return validation errors instead of throwing on inherited object
properties, and remove an undocumented safe-integer restriction absent from the
schema. Integer fields still reject fractional and non-finite numbers; their
JSON numbers are interpreted at JavaScript numeric precision.

No independent Draft 2020-12 validator was available. The locally discovered
Ajv 6.12.6 does not support that draft, and attempts to obtain Python jsonschema
in a temporary directory returned no available distribution. No permanent
project dependency was added. Independent meta-schema validation and a
standards-validator fixture comparison therefore remain unverified.

Fixtures cover each contract, empty collections, malformed IDs and watch URLs,
missing fields, unsupported statuses, invalid calendar dates, non-UTC timestamps,
null metadata, optional metadata, unknown fields, invalid nested archive entries,
negative age and zero thresholds. Additional tests cover state discrimination,
schema references and supported keywords, threshold boundaries and inconsistent
freshness metadata.

Deferred: API requests and authentication, response mapping, polling, state
transitions, archive synchronization, rendering, page/CSS updates, deployment,
and Supabase. Step 4 has not begun. No files are staged, committed or pushed by
this step.
