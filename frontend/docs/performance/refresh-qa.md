# Two-tab refresh recovery

The final production build passed the two-tab browser refresh check on September 5, 2026, using Nitro on port 4302 and the synthetic API fixture on port 4310.

Both authenticated Accounts tabs invalidated the app's canonical `/user/me` query concurrently. Browser interception returned an initial 401 to each tab, then allowed one coordinated refresh to set synthetic HTTP-only cookies. Subsequent user requests reached the fixture normally.

| Check                                                              | Result    |
| ------------------------------------------------------------------ | --------- |
| Initial unauthorized responses                                     | 2         |
| Refresh calls with Web Locks available                             | Exactly 1 |
| Successful canonical query retries                                 | 2         |
| Rotated HTTP-only cookies installed                                | Passed    |
| Both tabs preserve identity and private content                    | Passed    |
| False logout, blocked session UI, query errors, or page exceptions | None      |

This exercises the real browser refresh coordinator and mounted query observers. The refresh response itself is synthetic; backend cookie rotation and grace handling are covered separately by backend and built-Nitro checks.

The dedicated `splice-refresh-qa` browser session was closed after verification. No fixture controls or application settings were changed.

Machine-readable results are in [refresh-qa.json](refresh-qa.json). To repeat, open two authenticated `/accounts` tabs in a dedicated agent-browser session and run `node scripts/refresh-qa.mjs <session-cdp-websocket>` from `frontend`, then close that browser session.
