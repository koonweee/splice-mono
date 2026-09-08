# Skeleton migration validation

Validated 2026-09-07 against the migration working tree. Release verification is recorded separately below. The [ownership inventory](loading-state-ownership.md) accounts for every content boundary and direct Skeleton usage; the [catalog](../workbench/catalog.json) supplies reproducible owner pairs. A registered pair is not itself visual evidence.

Implementation and independent review used three owner-family agents, followed by four review/fix passes: initial owner migration, cross-family visual review, SSR/accessibility/focus review, and final nested-state review. The parent integrated fixes and ran the release gates.

## Findings resolved

- Home chart loading now retains transparent surroundings. Shared account group headings, amount touch targets, dividers, and row typography preserve known anchors.
- Transactions and investment tables use their own column widths, borders, alignment, and mobile hierarchy. Tablet widths select the same presentation in both phases.
- Settings shares page action/filter slots during route loading, module loading, data loading, and server rendering. CSS-first filter wrapping prevents a hydration-only extra row. Filled desktop tables retain their viewport ancestry instead of collapsing inside a Suspense wrapper.
- Analysis shares desktop ordering and summary frames, transparent cashflow nodes/links, and the alternate hollow donut. Module loading uses the same owner fallback as data loading.
- Account details reserves its known comparison row and touch-target height. Held and ready phone tab anchors measured y=244.375px, height=44px in the same fixture.
- Token cards retain their actual metadata, input surface, and compact action row. Notifications use their own icon/message/time/action structure.
- Add Account and Backfill share known provider/form content and exact shell sizing/title. Manual editors preserve form/footer layout. Escape restores the opener across lazy overlay replacement; nested holdings Escape leaves account details open and focuses Edit holdings.
- General Settings route loading retains already-known appearance selection and accent.
- Desktop transaction drilldowns use the loaded table background inside their modal. Compact audit headers keep the rules action below the date/helper block in both phases.
- Transaction skeleton typography wrappers use valid block markup, preventing paragraph/div nesting during SSR.

## Browser matrix

All workbench data was synthetic. Captures were visually inspected, with corrected `*-fixed` pairs superseding earlier failing captures. Temporary evidence lives under `/tmp/splice-skeleton-validation`, `/tmp/splice-skeleton-review`, and `/tmp/settings-*`; these machine-local files are not durable attachments. Reproduce using the catalog's held-phase queries and release events.

| Family                            | Actual states inspected                                                | Viewport/theme coverage                                                       | Result                                                                                             |
| --------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Home                              | Route, module, summary-ready/series-held, ready                        | 390px phone and 1440px desktop; Dark                                          | Transparent chart; known group/heading anchors align after fixes.                                  |
| Accounts                          | Route/data held and ready                                              | 390px and 1440px                                                              | Institution/row frames agree; unknown group counts may change list length.                         |
| Analysis                          | Route/data/module and ready; Sankey and alternate donut                | Phone/desktop                                                                 | Correct ordering, columns, transparent chart silhouette and hollow ring.                           |
| Settings tables                   | Module → data → ready; Categories, Analysis, Categorization, Recurring | 390px OLED and 1440px Dark; Categories 320px Light; Categorization 744px Dark | Filter/action placement, table surfaces, filled height and column anchors agree.                   |
| Access tokens                     | Module/data/ready                                                      | 390px OLED and 1440px Dark                                                    | Shared input/card and action-row geometry.                                                         |
| General/Notifications settings    | Held route → ready                                                     | 390×844 Light, 1440×900 Dark                                                  | Known form/card anchors and selected appearance preserved.                                         |
| Transactions                      | Data-held/ready and failed refetch/recovery                            | 390px Light, 780px tablet, 1440px OLED                                        | Responsive branch parity; same existing row DOM node retained through failed refresh and recovery. |
| Account details/holdings/activity | Initial data, nested tab data and ready                                | 390px Dark, 1440px Light                                                      | Comparison/tab anchors and investment columns agree.                                               |
| Manual transaction editor         | Targeted module-held → ready; Escape                                   | 320px Light                                                                   | Shared fields/footer; returns focus to Add transaction.                                            |
| Manual holdings editor            | Targeted nested module-held → ready; Escape                            | 390px Light                                                                   | Same editor structure; only child closes and Edit holdings regains focus.                          |
| Add Account/Backfill              | Module-held → ready                                                    | 390px Light/OLED, 1440px Light                                                | Known content and complete overlay shell agree.                                                    |
| Notification inbox                | Loading/ready; refresh-error/retry                                     | 390px Light, 1440px OLED, violet accent                                       | Correct message/action hierarchy; retry retains rows.                                              |

Representative shared-frame checks used warm accent `#ce9a7e`, reduced motion at 320px/744px, and violet `#8b5cf6` for notifications. Reduced-motion media preference was confirmed and Skeleton pseudo-element animation was `none`. No document horizontal overflow occurred in the narrow Settings checks. Masking was checked on Home. No browser exceptions were reported for the tested workbench transitions.

## Reproduction

Start `yarn workbench` in `frontend`. The base is `http://localhost:4001/?frame=true`.

- Home: `&example=page-home&state=ready&hold=series`; target chart module with `&holdModule=loadChart`.
- Main pages: `&example=page-<home|accounts|transactions|analysis>&state=ready&holdRoute=true`.
- Settings: `&example=page-settings&state=ready&tab=<section>&holdRoute=true`; use `holdModules=true&hold=reads` for module → data → ready. General/Notifications companion skeletons are route-only; `hold=user` exercises the separate session-loading branch.
- Application preview: `&example=page-settings&state=ready&tab=categorization&hold=/categorization-rules/category-rule/application-preview`. In the synthetic fixture, edit the grocery rule condition to `accommodation`, save, and open Apply to existing transactions. Capture after modal animation settles, release reads, and capture populated results. Do not apply the rule.
- Nested editors, audit and category drilldowns: use the catalog's required interactions and targeted `holdModule` key. Holding every module would prevent opening the parent needed to reach a child.
- Release phases independently with `window.dispatchEvent(new Event('workbench:release-route'))`, `workbench:release-modules`, and `workbench:release-reads`.

## Production build checks

`yarn pwa:launch-test` passed immediate launch HTML, delayed session resolution, Home redirect, login/retry, and private-route SSR/auth. Added browser checks compare JavaScript-disabled SSR with hydrated output for Categories, Analysis, Categorization, and Recurring at 390px/1440px: all eight section-heading/filter anchor pairs remain within 1px and report no hydration exceptions.

Authenticated local production navigation uses the documented local auth bypass and the existing API, without changing account data. It complements synthetic held-phase evidence. Warm navigation completed Home → Transactions → Analysis → Accounts → Settings → Home at 1440px, including every Settings tab, without document overflow or page exceptions; Home masking persisted. Fresh 390px Transactions and Analysis direct entries after the final markup correction reported no React exceptions or failed resource responses. Initial Recharts measurement warnings remain during chart mounting; these were also observed in the preceding audit.

The final independent source review found no remaining major implementation defects after the nested-state corrections.

The full frontend suite passed **825 tests across 115 files**. After the final markup correction, 60 focused boundary/workbench tests passed. Typecheck, lint (zero errors; 21 existing warnings), token checks, production build, workbench build, and launch/SSR browser checks passed. The registry accounts for 153 rendered components and 50 held/released recipes; its dependency guard confirms route fallbacks do not eagerly import feature implementations. The production output still contains separate chart, Settings, and editor chunks. Release revision is recorded after deployment.

## Expected differences and limits

Unknown record counts, user-authored wrapping, optional security metadata, unread notification styling, and actual chart data can change intrinsic content. Disabled known controls become enabled. These are distinct from avoidable changes to surfaces, known labels, ordering, or anchors; no claim of universal zero CLS is made.

This report distinguishes local production and synthetic workbench evidence. It does not claim an authenticated audit of the deployed site. No API/database migrations or financial behavior changes are part of this refactor.
