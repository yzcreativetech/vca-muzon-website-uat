# Preachings UI (Step 6)

The page has page-scoped CSS and ES modules; shared CSS/JavaScript, collector and
schemas are unchanged. No framework, dependencies, credentials or API calls added.

## Publication gate

No generated JSON, approved public path or approved freshness threshold exists in
this checkout. Normal page visits therefore retain manually maintained sermons,
explicitly labeled, and show unverified livestream availability. The duplicate
manual archive URL is displayed once (the first existing record); its conflicting
September 27/October 4 metadata still requires editorial verification. Original
HTML source records and direct links remain available without JavaScript.

`connectSnapshot({ pointerUrl, schema, maxAgeSeconds, fetcher })` in
`preachings-ui.mjs` is the future explicit integration entry point. It is not
invoked by the normal page. Supply an approved same-origin collector `current.json`
URL, the parsed existing schema and an approved positive integer age limit. No
production endpoint or default age is invented. A pointer is read once, and both
consumer files are fetched from that immutable generation. Internal metadata is
never fetched. Failed/invalid archive loading shows the error state; valid archive
data survives invalid/missing live state. The returned cleanup function stops
expiry checks. Refresh scheduling/publication remains outside this milestone.

Validation imports the unchanged Step 3 browser-safe validator with its existing
schema. There is no duplicate validator or reduced schema approximation. Additional
UI rules: deduplicate by ID, order by publication descending then ID (matching the
collector), accept only same-origin/i.ytimg.com thumbnails, and validate IDs again
before constructing privacy-enhanced embeds. Unknown thumbnail origins use a local
poster; the contract's broader HTTPS allowance is deliberately not a broad CSP
allowance. Missing required thumbnail fields invalidate the contract, while failed
image requests fall back locally. Optional metadata is omitted, never inferred.
Collector archive inclusion remains the only eligibility decision.

LIVE/OFFLINE require valid contracts and a current successful observation within
the explicitly supplied policy; expired observations become STALE, clock reversal
and absent policy become unverified. Contract STALE remains STALE. Expiry is
rechecked each second and on visibility changes. Browsers may throttle background
timers; status is re-evaluated when returning to the page. Service time is approved
existing page content and does not establish livestream availability.

## Isolated fixture preview

Serve the repository on localhost, then open:

- `/preachings.html?preachings-preview=live`
- `/preachings.html?preachings-preview=offline`
- `/preachings.html?preachings-preview=stale`
- `/preachings.html?preachings-preview=empty`

The preview requires BOTH a loopback hostname and the query opt-in. It is disabled
on published hosts. The adapter imports the Step 3 TEST ONLY fixtures unchanged;
a fixed fixture clock and 60-second TEST policy are used solely for preview.
A persistent notice marks all fixture content synthetic, images stay local,
buttons are disabled and synthetic videos never receive watch links. The player
also rejects fixture IDs beginning TEST_ONLY. No fixture embeds are requested.

## Playback and presentation

Manual sermons and approved future archive entries share one click-to-load player.
Only one iframe can exist; switching restores the previous poster and removes its
iframe. Keyboard-activated buttons load HTTPS www.youtube-nocookie.com embeds.
No iframe loads on navigation. Every real video retains an Open on YouTube link.
Detectable iframe errors display a fallback, but cross-origin video availability,
YouTube policy errors and actual play success cannot reliably be detected without
the IFrame API. They remain visible in YouTube's player; the external link remains
available. No IFrame API or third-party script is loaded.

The three/two/one-column archive loads eight entries at a time, preserves image
space and uses local image fallbacks. Metadata uses textContent, dates use semantic
time elements in Philippine time, and optional descriptions have bounded height.
Focus styles, polite status announcements and reduced-motion visibility are
provided. A scoped footer column adjustment prevents existing 1024px overflow.

Only preachings.html CSP changes: connect-src 'self' for local JSON, i.ytimg.com
for thumbnails, and www.youtube-nocookie.com for frames. Other origins and
restrictions remain unchanged. Shared page resources remain untouched.

## Offline verification

With Node 22+:

```text
node --test --experimental-test-isolation=none data-contracts/validate.test.mjs collector/test/collector.test.mjs js/test/preachings.test.mjs
node --check js/preachings-data.mjs
node --check js/preachings-ui.mjs
node --check js/preachings-preview.mjs
python js/test/preachings_browser.py
```

The browser checks require existing Python Playwright and installed Chrome; no
package installation is needed in the implementation environment. An ephemeral
loopback HTTP server serves the page. External requests are intercepted (including
YouTube frames); tests do not call a live API or assert real playback success.
Screenshots are written to the system temporary directory, not the repository.

Step 6 frontend development is implemented and tested offline. Full acceptance
remains pending approved JSON publication/freshness configuration, official
channel/API verification and real YouTube playback verification. No Step 7 work,
scheduling, deployment, staging, commit or push is performed.
