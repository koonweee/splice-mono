# Production interaction QA

This bounded pass used the dedicated `splice-interaction-qa` agent-browser Chrome session against production Nitro on port4302 and the synthetic fixture API on4310. It ran before the final exclusive timing pass. The final Settings mutation-scope change was excluded.

| Check                        | Result       | Observed behavior                                                                                                                                                       |
| ---------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pointer account editor       | Pass         | Edit account name opened the textbox and Save/Cancel controls.                                                                                                          |
| Failed name save via Enter   | Pass         | With the account endpoint returning503, `Synthetic outage` remained visible and `Unsaved QA name` stayed in the textbox.                                                |
| Home initial503 recovery     | Pass         | The shell showed Retry dashboard; restoring the API and clicking it restored Net worth and populated account cards.                                                     |
| Analysis initial503 recovery | Pass         | Retry analysis recovered to the fixture's truthful empty analysis state.                                                                                                |
| Keyboard navigation          | Pass         | Focusing the Transactions link and pressing Enter navigated and displayed the first purchase rows.                                                                      |
| Malformed deep link          | Pass         | Impossible and malformed dates were removed; the category filter survived and the page showed All dates.                                                                |
| Back/forward                 | Pass         | Browser history restored the category URL and visible purchase rows.                                                                                                    |
| Responsive mobile list       | Pass         | iPhone14 emulation rendered the mobile list with65 total and50 initial items.                                                                                           |
| Second-page pagination       | Not verified | Wheel attempts did not reach the actual container end; no pageIndex1 request was captured.                                                                              |
| Mobile detail/touch          | Not verified | The nested detail button was covered by its card metadata. Parent-card pointer dispatch succeeded, but no settled popover assertion or actual touch event was captured. |
| Cached refresh failure       | Not run      | Still requires a dedicated existing-data503 check.                                                                                                                      |
| Settings lazy requests       | Not run      | Still requires browser network observation of selected sections.                                                                                                        |

The browser reported no uncaught page errors. Two text waits used incorrect fixture expectations; follow-up DOM inspection confirmed the name-save error/draft and recovered Home content. These tooling timeouts are recorded in the JSON evidence rather than reported as application failures.

The fixture was reset and the named browser session was closed before handing the server back for exclusive timing. This pass made no application edits and restarted no servers. Exact observations are in `interaction-qa.json`.

## Completion on the final build

The parent completed the remaining cases with `scripts/verify-browser-interactions.mjs`; all six checks pass in [interaction-completion.json](interaction-completion.json): actual touch opens a transaction drawer, native container scrolling loads items 51–65 with one pageIndex1 request, the selected Categories section reuses its active SSR query and loads its existing archived comparison separately, fresh navigation makes no primary requests, and a real 31-second stale refresh failure retains labeled previous content and recovers on Retry. No application change was needed.

Two harness assertions were corrected during validation: an artificial second scroll event was removed, and active/archived category queries were distinguished rather than counted as duplicate keys. The final run uses the browser's native scroll event.

Tablet 820×1180 navigation was also verified using real pointer clicks on the menu and Accounts link; the page settled on Accounts. See [tablet-accounts.png](tablet-accounts.png). The parent inspected this screenshot, then closed the main splice-performance browser after previewing the requested explanation.
