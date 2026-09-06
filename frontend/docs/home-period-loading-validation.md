# Home period loading

Changing Home's period previously removed the net-worth card and account sections
until the new summary query completed. The page now retains the previous summary
in the mounted query observer while the new period loads. A status message names
the displayed period; comparison labels come from the response rather than the
new URL. The chart reserves its space with a loading placeholder until matching
period/date/currency data is available. Period changes preserve scroll position.

Previous values are not written into the destination query cache. Retention is
restricted to the same reporting currency and day, and requires the source query
to remain in the cache so clearing private data cannot revive it.

## Validation

- `yarn test src/hooks/useBalanceData.test.tsx src/routes/_authed/home.test.tsx`:
  14 passing tests, including both response orders, warm-period return, currency
  changes, cache clearing, and the visible previous-period label.
- `yarn typecheck`: passed.
- `yarn lint`: passed with three existing warnings outside the changed files.
- `VITE_API_BASE_URL=http://localhost:3101 VITE_DISABLE_DEVTOOLS=true yarn build`:
  passed.
- Agent-browser against that production build with an isolated synthetic backend:
  Month → Week and Week → Day using the actual dropdown with dashboard requests
  delayed four seconds. The original account button remained mounted throughout;
  net worth stayed visible; the status named Month, then Week, respectively. The
  chart placeholder was replaced by the completed chart. At 390px viewport width,
  document width remained 390px.

An initial-load React hydration warning (#418) was also observed. It reproduces
in an independent production build of unmodified `000a3ae` (including a cold
`/home?period=threeYears` load). This pre-existing initial SSR issue was subsequently
debugged and fixed locally; see [the hydration audit](hydration-audit.md). The
measured client period transitions added no errors.

Release scope: frontend only, alongside the hydration fix. No API or database changes.
