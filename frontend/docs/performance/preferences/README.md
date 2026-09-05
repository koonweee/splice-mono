# Preference and session browser evidence

Production frontend at `localhost:4302`, synthetic API at `localhost:4310`, captured September 5, 2026. All data shown is generated test data. The [machine-readable report](browser-preferences.json) records 19 successful first-paint cases and two successful session cases, with no failures.

The harness attaches Chrome DevTools Protocol to an isolated `agent-browser` session. It holds external JavaScript requests, including module preloads, while allowing server streaming scripts and CSS. Every first-paint capture verifies that the router has not initialized, scripts are still held, useful content is visible, and there is no horizontal overflow. It then releases scripts and checks the hydrated result and runtime errors.

| Coverage                                                                                            | Result                                                                                                                                        |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Splice dark, Splice light, Dracula, OLED black at desktop 1440×1000, tablet 820×1180, phone 390×844 | All four saved themes render before hydration; body background remains identical afterward despite conflicting old browser theme preferences. |
| Settings for all four themes                                                                        | Saved theme selection, JPY currency, and Asia/Tokyo timezone appear before hydration.                                                         |
| Saved masking cookie                                                                                | Home total and account cards remain masked before and through hydration.                                                                      |
| Missing masking cookie with legacy localStorage true or false                                       | First paint is conservatively masked; hydration migrates the old choice into the preference cookie.                                           |
| Direct Home account-modal URL                                                                       | Underlying SSR content stays masked; the hydrated modal also masks its current balance.                                                       |
| Anonymous landing                                                                                   | Hydrates without a `/user/me` request or private data.                                                                                        |
| Actual logout button with two authenticated tabs                                                    | Both tabs discard private content, navigate to the landing page, and settle to anonymous with access/refresh cookies removed.                 |

A DOM observer checks for visible currency amounts throughout masked cases. Runtime exceptions, unhandled rejections, and hydration errors are checked. Authenticated hydration reuses the single server session check in each first-paint case. This tests visible masking, not encryption or removal of authorized data from server serialization. Percentage changes retain existing behavior.

Selected screenshots:

- [Dracula phone before JavaScript](dracula-phone-before-js.png)
- [Splice dark tablet before JavaScript](splice-dark-tablet-before-js.png)
- [OLED desktop before JavaScript](oled-black-desktop-before-js.png)
- [Saved light Settings before JavaScript](splice-light-settings-desktop-before-js.png)
- [Masked account modal after hydration](masked-account-modal-desktop-hydrated.png)
- [Anonymous phone](anonymous-phone.png)
- [Second tab after settled logout](cross-tab-logout.png)

Reproduce after starting the synthetic API and production frontend described in the parent performance documentation:

```sh
agent-browser --session splice-preferences open http://localhost:4302
agent-browser --session splice-preferences get cdp-url
cd frontend
node scripts/verify-browser-preferences.mjs '<browser WebSocket URL>'
agent-browser --session splice-preferences close
```

Run every `agent-browser` command outside the sandbox, as required by repository instructions. Do not share the fixture controls with another browser run concurrently. The harness restores the fixture in `finally`; the caller closes its named browser session. Set `PREFERENCES_AUTH_ONLY=1` and supply a separate output directory to rerun just the session checks. The recorded session checks were rerun separately after tightening the assertion to wait for settled anonymous UI, rather than capturing the navigation transition.
