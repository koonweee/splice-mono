# Hydration audit — 2026-09-05

## Finding and scope

Reproduced React hydration error #418 on Home, including cold three-year and
ten-year initial loads. The development stack trace identifies `HomePage` →
`NetWorthCard`: server HTML contains the chart Skeleton, while the first browser
render expects the chart's Box and Suspense boundary.

Home awaits its summary but starts the chart-series request independently. That
request can finish after HTML rendering and before browser hydration, so the
streamed Query state is newer than the rendered placeholder. The failing branch
is outside the chart's own Suspense boundary, allowing recovery to rebuild the
surrounding route content. The original production build also reproduces this;
it was not introduced by the period-retention fix.

No additional affected route was found in this bounded audit. Some early error
reads arrived after the next navigation started; their component stacks still
identified Home. Final per-page checks wait for network idle and two animation
frames before reading errors.

## Fix and value

`NetWorthCard` uses TanStack Router's `ClientOnly` around the complete chart
region, with a fixed-height Skeleton fallback. The server and first hydration
pass now agree regardless of chart request timing. Afterwards, chart data,
loading, and retry/error UI render normally. The summary and accounts retain SSR;
the existing parallel series request still starts in the loader.

This is a small rendering-correctness fix worth making: it avoids hydration
recovery and unnecessary DOM replacement. It does not accelerate queries, reduce
payloads, or benefit MCP. No millisecond performance improvement is claimed.
On fresh documents, chart rendering begins after hydration; its space is reserved
in the server HTML. Client-side navigation does not wait for a new hydration pass.

This follows [React's requirement that initial server and browser content match](https://react.dev/reference/react-dom/client/hydrateRoot#caveats).
Do not hide this race with `suppressHydrationWarning` or make the whole dashboard
wait for the chart. Future independently streamed queries need a stable initial
render boundary around every branch that depends on their result.

## Verification

| Coverage | Result |
| --- | --- |
| Home: default, week, three-year periods | No errors after fix |
| Transactions, Analysis, Accounts | No hydration errors found |
| All seven Settings tabs | No hydration errors found |
| Home with an account-details URL | No hydration errors found |
| Desktop 1440px and phone 390px | Both passed |

- **29 production-build initial loads, zero browser runtime/hydration errors**, using
  a fresh synthetic user and isolated database, plus 12 development-build checks.
- Read back actual server HTML: summary heading and all three synthetic account
  buttons are present, alongside the stable chart placeholder.
- New `NetWorthCard.hydration.test.tsx` uses real `renderToString` and `hydrateRoot`.
  Before the fix, pending→ready and failed→ready cases reproduce mismatches. After
  the fix, all three cases pass and assert the original summary DOM node survives.
- 21 focused tests pass across the hydration test, NetWorthCard interactions,
  dashboard queries, and Home page tests.
- Frontend typecheck and production build pass. Lint passes with three existing
  warnings in unrelated files.

Scope is synthetic-data initial loads, not an exhaustive check of every editor,
production dataset, browser extension, or authentication transition. The local
browser sessions and fixture servers were stopped after validation.

Release scope: frontend only, alongside the separately validated Home period-loading fix.
