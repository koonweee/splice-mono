# Typography audit and standardization

September 7, 2026. Audited authored JSX text, headings, anchors and SVG labels;
component/global CSS; Mantine defaults and control internals; the offline document;
and representative page, editor and loading compositions. The initial inventory
found 264 text/style-bearing JSX usages, including four ChangePercentPopover
size consumers. All 260 direct text elements now choose named roles; the four
popover consumers choose caption/metadata roles through `textRole`.

## Ownership

`src/lib/design-system/typography.ts` is the only source for sizes, weights,
line heights and font families. Mantine's familiar 12/14/16/18/20px body scale is
explicitly retained. Values use rem, including the extra heading/display sizes.
`data-typography="role"` selects a JSX/SVG role. CSS uses `@splice-type role`;
`typography-css.ts` compiles it from the same definition in app and workbench.
The shared stylesheet registers roles and library defaults before first paint.
Heading order describes document structure and does not determine visual size.

| Role family | Treatment and intent |
| --- | --- |
| Page title | 22px/700 desktop; 18px/700 compact |
| Section / subsection | 16px/600 and 14px/600; subordinate to the page title |
| Dialog title | 18px/600 |
| Row title | 16px/500, with 14px/500 for dense tables and Home rows |
| Body / bodySmall / lead | 16px, 14px, 18px at regular weight |
| Amount | 16px/600; dense 14px/600; large summary values 20px/600 |
| Label / control | 14px/500; independent of button target geometry |
| Input | 16px/400, preserving mobile input readability |
| Metadata / caption | 14px and 12px; captionStrong uses 600 |
| Badge / chart label | 10px/600 compact tags; 12px/400 plotted labels |
| Display / brand | Responsive 28–40px net worth; 48px landing brand; 18px app brand |
| Code / offline / native date | Canonical monospace; offline title; native date line-box alignment |

Exact line heights and responsive rules are in the canonical definitions and
shown live in the Typography workbench. Do not copy this table's numbers into
surfaces. The small/large role variants are intentional density choices, not
permission to introduce component-specific metrics.

## Adjustments after reviewing hierarchy

- Institution sections, including **Manual accounts**, were default h3 (22px),
  exceeding the 18px mobile page title. They now use 16px semibold while retaining
  h3 semantics. Settings section titles use the same role.
- Home Assets/Liabilities use sectionHeading; Investment/Depository group labels
  use the smaller label role. A nested group no longer looks like a peer title.
- Account names use rowTitle; dense investment/transaction rows use rowTitleSmall.
  Merchant weights of 650 and amount weights of 700/750 become named 500/600 roles.
- Financial summaries and table amounts are distinguished from captions and
  section headings; regular explanatory text is not promoted to a heading role.
- Custom category rows drop their local 1.25 line-height in favor of shared
  row/caption leading. Truncation and contextual colors remain local.
- The 9px badge override becomes the canonical 10px badge role. Control text
  stays compact while touch target sizes remain independent.
- Home's fluid headline and matching loading placeholder share display. Sankey
  labels no longer hardcode a number, and Recharts labels receive chartLabel.
- Local active-tab, navigation, dialog and date-input overrides were replaced
  with the corresponding shared role. Native date alignment remains centrally
  defined rather than losing its browser-specific line-box behavior.
- The privacy-safe offline document consumes canonical typography directly;
  it cannot depend on the application's loaded stylesheet.

## Enforcement and boundaries

`yarn tokens:check` now also runs the typography ownership guard. It rejects local
Text/Title/Anchor/Code size props (including imported aliases), fw/fz/lh and raw
font style properties, CSS font declarations, typography utility classes and
unknown literal roles. Icon sizes, control geometry, truncation, text alignment,
case and contextual color remain valid local decisions. A plain `font: inherit`
on a native button is allowed.

Generated API code, tests, dependencies and the canonical design-system directory
are excluded. Mantine internals receive centrally assigned defaults; their `size`
props continue to control geometry, not a new font scale. The workbench shell's
inspection UI is separate from production surfaces. Static analysis is a guard,
not a proof against every dynamically constructed style or third-party API.

## Validation

- Full frontend suite: 606 tests passed after migration; new compiler tests and
  the changed percentage-popover API were checked in a targeted follow-up
  (55 workbench/compiler/policy/popover tests passed on the final pass).
- App and workbench production builds passed. Typecheck and ownership checks
  passed; lint has the three existing async-without-await warnings.
- Real Chromium workbench: Dark/Warm clay Accounts and Settings at 390px;
  Light/Slate blue Transactions at 390px, including bulk selection; OLED/Sage
  Home at 390px; Light/Slate blue Analysis at 1280px after the real Sankey loaded.
- Measured Accounts: page title 18px/700, Manual accounts 16px/600, row names
  16px/500, metadata 14px/400. Desktop page title measured 22px, SVG labels 12px.
  Inspected views had no document horizontal overflow. No browser runtime errors
  were reported. The Typography gallery also fit at 320px; the editor was
  inspected at 320px with reduced motion and an 18px/600 title, then dismissed
  with Escape. This is Chromium validation, not physical Safari/iOS testing.

Use `/?example=typography` for the role reference and `/?view=pages&width=390`
for hierarchy across real pages. Controls, editors and loading examples continue
to use production components and inherit these roles.
