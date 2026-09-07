# PWA validation

This release adds session-bound device notifications, a compact inbox, guarded
updates, bounded offline recovery, and static-only caching. The uncategorized
transaction badge remains independent of the inbox unread indicator.

## Reproducible checks

Run `yarn pwa:check` after a production build and `yarn pwa:test` with the dedicated
loopback `splice_backend_benchmark` PostgreSQL database configured. The lifecycle
harness builds three real application releases and drives Chromium against an
isolated Nest backend; missing prerequisites are failures, not skipped checks.
Backend delivery, session migration, and privacy tests are described in
[`pwa-delivery-and-logout.md`](../../backend/docs/pwa-delivery-and-logout.md).

The focused frontend suite covers registration deadlines/retry, native permission
ordering, notification intent races, worker enrollment and badge ordering,
logout persistence, update guards, offline recovery, inbox interactions, and
shared query invalidation. Real mutation tests cover known-offline rejection and
uncertain manual transaction saves. The workbench exercises production components
through isolated in-memory fixtures; it does not request native push permission.

## Browser observations

September 7, 2026, local Chrome via an isolated agent-browser session, synthetic
fixtures only:

- Compact inbox inspected in Dark at 390×844, Light at 1440×900, and OLED at
  744×900. Read changes the unread indicator; a failed dismissal retains the row
  and shows an error. There is no retention footer. Icon actions have accessible
  labels. The corrected unread indicator passes axe WCAG A/AA with zero confirmed
  violations; the remaining text-contrast incomplete result was inspected visually.
- Header bell opens the production drawer in the Home fixture. Escape closes it
  and restores focus to the bell. At 200% root text size, the corrected header ends
  at 120px and page title starts below 153px, with no horizontal overflow.
- Landscape 844×390 editor has a scrollable body and reachable sticky Save action
  at y=307–349. Dark phone offline notice stays within the viewport.
- Final production smoke after source recovery: phone inbox opens, Escape restores
  bell focus, and no runtime errors were reported. Cold offline Accounts launch
  retains its path/query/hash and explicit Retry restores that exact destination.
  Automatic reconnect is established by the lifecycle harness below.
- Production worker results are recorded below. Workbench observations alone do
  not certify service-worker behavior.

## Static assets and privacy

Only successful same-origin hashed JS/CSS/font/image responses and the minimal
recovery assets enter the PWA caches. Authenticated HTML, API responses, financial
drafts, notification bodies, and badge counts are never persisted. Cache metadata
contains build IDs, use times, and byte counts; enrollment metadata contains opaque
control IDs, a server-verified opaque account scope, and badge ordering timestamps. Pending logout uses a minimal
request/mode/timestamp journal plus an acknowledgement tombstone so failed browser
storage writes cannot revive or downgrade a completed logout.

The worker checks current server enrollment through `/_pwa/enrollment` before
showing private push content. Network/auth/storage failure produces a generic
notification. This extra server check deliberately favors privacy when the app
cannot establish current ownership. Old pages cannot enroll a legacy worker:
registration requires protocol version 2 and a successful worker handshake.

Repeated handshakes for the same verified account and enrollment preserve their
epoch and badge ordering. An account/enrollment change rotates that boundary and
clears previous display state. The scope is a domain-separated hash returned only
after the server verifies the current user; raw account identity is not persisted
in worker storage. This also distinguishes badge-only devices without push.
Native badge operations have bounded waits but cannot be canceled by JavaScript;
a late completion triggers cleanup while the worker remains alive. A terminated
worker relies on the next verified foreground reconciliation.

Static caches retain two activated releases plus an actual installing/waiting
release within a 20 MiB combined limit, with
seven-day cleanup of an unused previous release. Eviction is allowed; a missing
old lazy chunk requires explicit guarded recovery. No cache policy guarantees
that every old chunk remains available.

`node scripts/optimize-pwa-pngs.mjs` losslessly recompresses PNG IDAT streams and
asserts byte-identical decoded scanlines. The release saved 629,927 bytes across
11 icons/splash images. The original logo exceeds the maskable safe circle, so
its misleading maskable declaration was removed; ordinary icons and branding
remain unchanged. Manifest identity, scope, and start URL remain `/`. Shortcuts
point to uncategorized transactions and Accounts.

## Performance method

Compare clean main `5eeacb6` with this release using the same synthetic empty Home
account, 390×844 viewport, reduced motion, Chrome, 4× CPU slowdown, and 6 Mbps down /
1.5 Mbps up / 40ms latency. Each of five new browser contexts measures first visit,
warm navigation, and navigation after CDP stops the worker. A loopback HTTP proxy
counts actual response-body bytes from both the page and worker; page-only CDP
network events omit worker precache traffic. Content-ready means the Home net-worth
heading and balance control are present after DOMContentLoaded. These local
measurements are not field Core Web Vitals or physical-device startup results.

The baseline first visit transfers all eight splash images. Five-run medians from
the final source build are below; all 30 raw observations are retained in
[`startup-baseline.json`](./pwa-evidence/startup-baseline.json) and
[`startup-after.json`](./pwa-evidence/startup-after.json).

| Scenario         | Clean main content-ready | New build content-ready | Clean main body transfer | New build body transfer |
| ---------------- | -----------------------: | ----------------------: | -----------------------: | ----------------------: |
| First visit      |                 2,349 ms |                2,447 ms |              4,108,738 B |             2,309,119 B |
| Warm navigation  |                   171 ms |                  395 ms |                 74,598 B |                75,914 B |
| Suspended worker |                   279 ms |                  335 ms |                 74,812 B |                75,914 B |

First-visit transfer falls 43.8%; content-ready is 4.2% slower, within the fixed
5% regression limit. Warm navigation is 224ms slower and suspended-worker
navigation is 56ms slower in this sample. There is no claim of a startup timing
speedup. All measured navigations issue one document request; warm/suspended runs
transfer no cached static response bodies. The new client requests zero splash
images during installation. Essential cache: 1,123,303 raw / 339,017 gzip bytes
across 11 eligible assets, below 2.5 MiB raw / 1 MiB compressed.

## Platform limitations

No physical installed iOS or Android device is connected to this task. Browser
viewport/offline/worker tests cannot certify OS installation, notification
permission sheets, app-switcher suspension, icon masking, real software-keyboard
insets, or push-provider delivery. On an available installed device, check launch,
keyboard/editor actions, safe areas, notification enrollment/click, and each app
shortcut after rollout. Devices must open the upgraded app once to rebind previously
enabled push; previously disabled notifications stay disabled.

The separate unrestricted backend push-destination audit finding is outside this
plan and is not resolved by delivery deadlines or session-bound enrollment.

## Automated evidence

Fresh final-source checks on September 7, 2026:

- Whole frontend: 106 files, 753 tests passed. Typecheck passed; lint has zero
  errors and 21 warnings. Token guard, production build, and workbench build passed.
- Backend acceptance: 26 suites, 208 tests passed with zero skips, plus lint,
  typecheck, and build. Real PostgreSQL used a dedicated loopback benchmark database
  and isolated schemas. Generated OpenAPI/client contracts were regenerated.
- Production HTTP artifact checks passed: build agreement, static budget, no-store
  version/worker responses, and plain non-cacheable missing-asset 404s.
- Fourteen production Chromium 152 lifecycle cases passed against three real
  A/B/C releases and a real isolated Nest backend. They cover actual worker/cache
  activation, authenticated private-cache cleanup, cached offline JS, UI-only
  updates with dirty second-tab Settings, cold offline/captive/API-down recovery,
  navigation deadline and single request, rollback, cross-tab offline logout,
  revoked-token replay, failed registration retry, waiting-cache replacement,
  delayed recovery scripts and throttled online events, quota failure, migration
  rebind, push/account isolation, guarded notification navigation, and shortcuts.
- Independent two-window worker/channel replay verifies ten alternating same-owner
  handshakes converge without epoch rotation or outstanding reads. Account change
  and logout during an in-flight ownership probe reject stale badge work.

The push test uses an enrollment transport fixture and CDP delivery into the real
worker with the actual notification API. The constructed notification-click event
emulates native focus/event-lifetime privileges. These tests do not certify a real
push provider, OS notification click, or native permission sheet. The pending-probe
recovery and superseded waiting-cache defects found in earlier runs are fixed and
covered by passing final cases.

## Deployment prerequisite evidence

The live database backup was created on September 7 and restored successfully
into a temporary verification database, which was then dropped. Dump: 873,356
bytes, SHA-256 `912400849ac69acc4750ae98097ebd715ce6f3ef8f9984f34575f9e66f9ed696`.
It remains at `/var/lib/postgresql/data/pwa-backups/pre-pwa-cutover-20260907.dump` in the
PostgreSQL volume. This is a verified local backup; the unrelated scheduled R2
backup action still reports a verification failure and was not represented as
successful. Live schema migration and deployment evidence are recorded after
those operations complete.
