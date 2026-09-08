# PWA validation

This release adds session-bound device notifications, a compact inbox, guarded
updates, bounded offline recovery, and bounded public-asset caching. The uncategorized
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

Only successful same-origin hashed JS/CSS/font/image responses, the generic versioned
launch shell, and the minimal recovery assets enter the PWA caches. Authenticated HTML, API responses, financial
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
commit `5a3a95a` (authenticated startup code is unchanged by the final fallback
cooldown guard) are below; all 30 raw observations are retained in
[`startup-baseline.json`](./pwa-evidence/startup-baseline.json) and
[`startup-after.json`](./pwa-evidence/startup-after.json).

| Scenario         | Clean main content-ready | New build content-ready | Clean main body transfer | New build body transfer |
| ---------------- | -----------------------: | ----------------------: | -----------------------: | ----------------------: |
| First visit      |                 2,349 ms |                2,381 ms |              4,108,738 B |             2,309,813 B |
| Warm navigation  |                   171 ms |                  319 ms |                 74,598 B |                76,154 B |
| Suspended worker |                   279 ms |                  288 ms |                 74,812 B |                76,154 B |

First-visit transfer falls 43.8%; content-ready is 1.4% slower, within the fixed
5% regression limit. Warm navigation is 148ms slower and suspended-worker
navigation is 9ms slower in this sample. There is no claim of a startup timing
speedup. All measured navigations issue one document request; warm/suspended runs
transfer no cached static response bodies. The new client requests zero splash
images during installation. Essential cache: 1,123,543 raw / 339,103 gzip bytes
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

- Whole frontend: 106 files, 765 tests passed. Typecheck passed; lint has zero
  errors and 21 warnings. Token guard, production build, and workbench build passed.
  This includes the final cooldown regression and all17 offline recovery tests.
- Backend acceptance: 26 suites, 208 tests passed with zero skips, plus lint,
  typecheck, and build. Real PostgreSQL used a dedicated loopback benchmark database
  and isolated schemas. Generated OpenAPI/client contracts were regenerated.
- Production HTTP artifact checks passed: build agreement, static budget, no-store
  version/worker responses, and plain non-cacheable missing-asset 404s.
- Eighteen production Chromium 153 lifecycle cases passed on Linux at0592b82,
  against three real
  A/B/C releases and a real isolated Nest backend. They cover actual worker/cache
  activation, authenticated private-cache cleanup, cached offline JS, UI-only
  updates with dirty second-tab Settings, cold offline/captive/API-down recovery,
  navigation deadline and single request, rollback, cross-tab offline logout,
  revoked-token replay, failed registration retry, waiting-cache replacement,
  delayed recovery scripts and throttled online events, quota failure, migration
  rebind, push/account isolation, guarded notification navigation, shortcuts, offline/repeated Update actions, and
  real old lazy-chunk404 recovery without losing dirty Settings, and Update while
  an uncached static file's response headers remain stalled. The latter completes
  in6.174s within its10s regression budget, with exactly one asset request. A forced
  request during worker shutdown restarts the outgoing worker and completes the
  real update in31.293s within the45s activation budget.
- Independent two-window worker/channel replay verifies ten alternating same-owner
  handshakes converge without epoch rotation or outstanding reads. Account change
  and logout during an in-flight ownership probe reject stale badge work.

The push test uses an enrollment transport fixture and CDP delivery into the real
worker with the actual notification API. The constructed notification-click event
emulates native focus/event-lifetime privileges. These tests do not certify a real
push provider, OS notification click, or native permission sheet. The pending-probe
recovery, missed startup reconciliation, and superseded waiting-cache defects are fixed and
covered by passing final cases. Startup reconciliation does not schedule another
automatic recovery during a prior reload cooldown; a shared-journal regression and
independent replay verify persistent route failures remain stable while manual
and real reconnect retries still work.

Linux Chromium 153 exposed a delayed-activation bug: a background API request
arriving during worker shutdown restarts the outgoing worker and can require its
normal 30-second idle window before the new worker activates. The app's original
10-second activation listener had already expired. The [native trace](./pwa-evidence/chromium153-worker-restart.json)
and [forced-race evidence](./pwa-evidence/chromium153-delayed-activation.json)
record activation at 31.096 seconds with worker debugging excluded throughout.

Activation now waits up to 45 seconds. Registration and download limits remain
10 seconds; the initiating tab still rechecks its draft/save guard before reload.
Unit tests cover delayed activation, repeated clicks, an editor opened during the
wait, exact timeout cleanup, and late activation before or after explicit Retry.
The browser regression forces the native restart instead of relying on timing.
Worker debugging is temporarily excluded from browser and frame sessions during
Update actions because debugger attachment can defer activation until Chromium's
five-minute fallback. Inspection is restored before offline and push checks. This test
helper uses the pinned Playwright 1.63 in-process bridge and fails explicitly if
that bridge changes; it never stops a worker or forces activation. Fresh Linux18
validation passed with all8 debugger scopes restored and zero unexpected worker
attachments during Update. GitHub release CI34162866084 passed. The subsequent
deploy comparison exposed a fixture setup miss: the app updated in1.127s, but
the injected request arrived too late to restart the outgoing worker. Harness
commit9903776 allows at most three fresh contexts only after a successful update
misses that setup condition. Actual failures still stop immediately, and all
three setup misses fail. A targeted Linux rerun witnessed the restart and updated
in31.66s; the complete corrected CI suite subsequently passed all 18 cases, followed by both protected deployment comparison runs.

## Deployment prerequisite evidence

The live database backup was created on September 7 and restored successfully
into a temporary verification database, which was then dropped. Dump: 873,364
bytes, SHA-256 `98088521b971743895d8f954015b388e4b572129d4e5d0be926da43097957998`.
It remains at `/var/lib/postgresql/data/pwa-backups/pre-pwa-cutover-20260907T212545Z.dump` in the
PostgreSQL volume. This is a verified local backup; the unrelated scheduled R2
backup action still reports a verification failure and was not represented as
successful. The verified backup preceded the successful live migration and rollout below.

## Production release

Deployed September 7, 2026 and verified at 22:07 UTC in VPS, Singapore, and San
Francisco. [Deploy workflow 34164495422](https://github.com/koonweee/splice-mono/actions/runs/34164495422)
passed and [deploy PR 281](https://github.com/koonweee/splice-mono/pull/281) merged
commit `55ca895ee0cff8352de8cdfbedee54e0cb5ef193`. Backend image `0.0.122` and
frontend image `0.0.119` were pulled and checked before the API cutover.

All six running containers are healthy and match their approved registry digests.
All regions and the public endpoint serve frontend build
`mtrs87cd-0efe4796-cf93-4e25-ab69-f5a53202f11a`; the worker agrees with that build.
Regional and public probes passed API health, unauthenticated private-endpoint
rejection with `no-store`, recovery login state, and missing-asset 404 checks.
Both additive migrations are present. Backfill reports `remaining: 0`; no active
unbound refresh tokens or eligible unbound push subscriptions remain. Three
legacy subscriptions are paused until the upgraded app rebinds them.

Count-only postdeploy checks found no ready delivery backlog, stale processing
claims, attempts beyond the retry limit, recent non-migration delivery failures,
or database lock waiters. No device had rebound at this observation, so these
checks do not establish live push-provider delivery. Authenticated session,
logout, inbox, and account-isolation checks used synthetic local data; production
probes did not mutate a real user's account or send a real push.

The [release record](./pwa-evidence/production-release.json) contains image
digests, operation IDs, privacy counts, and public probe results. The
[final corrected CI results](./pwa-evidence/lifecycle-ci-9903776.json) retain all
18 cases and their explicit browser/OS limitations. Physical-device checks remain
blocked by unavailable devices as described above.

## Cached Home launch and hourly refresh (September 8)

The previous no-financial-persistence policy is superseded only for the bounded
Home snapshot described in the frontend README. This data lives in a separate
IndexedDB store, never in the service worker HTTP response cache. Private HTML,
API responses, credentials, drafts and notifications remain excluded from that
cache. The public shell includes no serialized session; `src/client.tsx` mounts
TanStack Router with `createRoot(document)` for that shell and retains Start's
normal hydration for network-rendered documents. Only verified session checks
can seed the live identity. The pending root renders the shared Home presentation
without private query observers or usable financial actions.

`yarn pwa:cached-home-test` uses synthetic accounts, a production build, full
Chromium and real service worker/IndexedDB. Full Chromium is intentional: the
bundled headless shell can crash on the existing service-worker BadgeService IPC.
`yarn pwa:test --channel=chromium` selects the same engine for lifecycle tests.
The public manifest is network-only and is not a boot dependency even though the
PWA plugin appends it to its injected manifest. Home's lazy Chart and its static
imports are boot dependencies so updated snapshots remain drawable offline.

For manual inspection, first build with `VITE_API_BASE_URL='' yarn build` so a
local `.env` API override cannot redirect the synthetic fixture to the real
localhost backend. Then `yarn pwa:cached-home-test --serve` starts an isolated IPv6
loopback gateway with a synthetic API and production frontend, preserving normal
local app ports. Use the printed URL. The `splice_access_token=alice` cookie
selects the synthetic account. This mode never accesses real financial data.

Automated/browser evidence is recorded in the implementation ledger. Physical
installed-iOS process termination/relaunch and OS-native splash caching require
an actual device and remain a device-only validation limitation; desktop
Chromium service-worker cold-start tests do not certify those OS behaviors.
