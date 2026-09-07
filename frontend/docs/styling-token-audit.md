# Styling token audit

Status: source inventory and token-family dispositions reviewed; browser combination review remains tracked separately in `appearance-visual-validation.md`. Historical route baselines are recovered (see `appearance-baseline.md`). Source: current checkout, 2026-09-06.

## Ownership and disposition

Phone visual validation found remaining default-palette consumers in financial
change labels, Analysis totals/indicators, and account status badges. These now
consume shared financial or paired status roles. See
`appearance-visual-validation.md` for measured failures and recapture evidence.

Lifecycle status adoption: `LifecycleBadge` now consumes paired
`--splice-status-{success,warning,neutral}-{bg,fg}` roles from `appearance.ts`.
These replace component-level light/dark shade selection. Each pair is derived
independently of the accent and checked for 4.5:1 text contrast across every
tested mode/seed. A real Light-mode category table exposed the prior Active
badge's 3.66:1 contrast; after adoption, its axe audit has zero violations and
zero incomplete checks. This evidence covers that table, not the full UI matrix.

| Family | Starting sources / findings (historical) | Target owner and disposition |
| --- | --- | --- |
| Palette and semantic colors | `lib/theme.ts` mixes palettes, component defaults, and persistence. | `lib/design-system`: pure base/accent resolver and semantic roles. Remove preset tuples after adoption. |
| Surfaces and borders | `styles.css`, account/transaction/table modules repeat light-dark fills and white alpha borders. | Centralize canvas, raised, muted, control, hover, selected, border, separator, divider. |
| Typography | Mantine font sizes/headings already shared; Home amount uses clamp and tabular numerals. | Reuse Mantine typography; preserve the local financial headline role, not arbitrary pixel replacement. |
| Spacing and density | Mantine spacing props coexist with explicit Home control geometry and table dimensions. | Reuse Mantine scale; centralize shared input/row touch size, retain domain layout geometry. |
| Radius and elevation | Mostly Mantine radii/shadows, with local circles, 6px labels, and overlays. | Reuse Mantine radius/shadow roles; keep circles and structural zero radii local. |
| Interaction | `Pressable`, `InteractiveRow`, theme defaults duplicate feedback and 120/150ms transitions. | Centralize feedback colors and quick/standard/overlay/chart motion; preserve pointer cancellation logic. |
| Layers | DataState 190, toolbar 250, PWA 300, table popover 400 and combobox 1100; local row layers 1 and table headers 3. | Explicit global layer roles; retain local stacking-context layers. Portals must remain above their owning dialogs. |
| Responsive | `lib/media-queries.ts` expands named CSS conditions and feeds React hooks. | Retain as canonical breakpoint owner; share the Vite plugin with workbench. |
| Charts/loading | Chart defaults, placeholder CSS, and skeleton modules encode visual values. | Centralize line/fill/placeholder/motion roles; data sampling, chart dimensions, Sankey geometry stay local. |
| Semantic data colors | `category-colors.ts`, provider/status badges, Sankey links. | Preserve category/user colors and provider identities. Financial success/danger/warning/info stay independent of accent. |
| App shell and PWA | Root metadata, manifest, service-worker offline HTML contain Dracula hex values. | Dynamic canvas from appearance for SSR/browser chrome; neutral offline/static PWA fallback. |
| Browser fixes | Scrollbar gutter, mobile input zoom guard, focus and safe-area styles. | Preserve behavior in global CSS; do not theme or remove mechanical browser rules. |

## Historical literal inventory (before adoption)

These counts describe the pre-adoption checkout, including the now-removed `theme.ts`. They are historical evidence, not current outstanding occurrences. Equal literals do not necessarily have equal meaning.

### Raw Color

| Source | Occurrences |
| --- | --- |
| `styles.css` | 3 |
| `sw.ts` | 3 |
| `components/TransactionsTable.module.css` | 17 |
| `components/AccountSection.module.css` | 2 |
| `components/MantineTableChrome.module.css` | 2 |
| `components/MobileTableList.module.css` | 3 |
| `lib/crypto-utils.ts` | 2 |
| `lib/category-colors.ts` | 16 |
| `lib/theme.ts` | 184 |
| `routes/__root.tsx` | 1 |
| `components/transactions/TransactionsMobileList.module.css` | 8 |
| `components/transactions/TransactionStatusBadge.module.css` | 2 |

### Motion

| Source | Occurrences |
| --- | --- |
| `styles.css` | 2 |
| `components/DeferredOverlay.tsx` | 1 |
| `components/TransactionsTable.module.css` | 3 |
| `components/Chart.tsx` | 1 |
| `components/AccountCard.module.css` | 1 |
| `components/Pressable.module.css` | 1 |
| `components/AccountModal.tsx` | 1 |
| `components/InteractiveRow.module.css` | 1 |
| `components/CategoryTransactionsModal.tsx` | 1 |
| `lib/theme.ts` | 2 |
| `components/settings/RecurringManualTransactionsSection.tsx` | 1 |
| `components/analysis/AnalysisSankeyChart.module.css` | 2 |
| `components/loading/ChartSkeleton.module.css` | 2 |
| `components/loading/LoadingSkeleton.module.css` | 1 |
| `components/transactions/ManualTransactionModal.tsx` | 1 |
| `components/pages/SettingsPage.module.css` | 1 |

### Layer

| Source | Occurrences |
| --- | --- |
| `styles.css` | 1 |
| `components/PwaLifecycle.module.css` | 1 |
| `components/TransactionsTable.tsx` | 2 |
| `components/InteractiveRow.module.css` | 1 |
| `components/DataState.module.css` | 1 |
| `components/MantineTableChrome.module.css` | 1 |
| `components/NetWorthCard.tsx` | 1 |
| `lib/mobile-combobox.ts` | 1 |
| `components/forms/EditorModal.module.css` | 1 |
| `components/transactions/TransactionsMobileList.module.css` | 1 |
| `components/transactions/TransactionBulkEditToolbar.module.css` | 1 |

## Allowed local values and exclusions

- Financial/chart geometry, table column widths, avatar circles, and structural zero dimensions remain local.
- Category colors and provider brand colors are data/domain palettes, not personal appearance.
- Generated API files, test fixtures, SVG assets, and third-party code are excluded from token literal policy.
- Local z-index values are retained only where a documented local stacking context contains them.
- Workbench chrome and fixture data do not belong in production tokens.

## Verification log

- Baseline screenshots: recovered from isolated revision `7bcfbd3`; see `appearance-baseline.md`. Full before/after review remains pending.
- Workbench coverage: tracked in `../workbench/catalog.md`.
- Source ownership/adoption: verified against the current family tables below. Browser interaction and appearance gates remain in the implementation plan.

## Workbench baseline observations

The initial standalone gallery builds and uses shared responsive CSS compilation. On 2026-09-06 the real desktop date picker inside EditorModal clipped its upper calendar after flipping above the trigger. Resolve the non-portal/overflow relationship during overlay adoption and verify keyboard focus restoration; do not paper over it with a global z-index. Historical route baseline capture is now available in `appearance-baseline.md`; full before/after review remains pending.

## First adoption pass

- `lib/design-system/components.ts` now owns shared Mantine component defaults, separately from persistence.
- `foundation.ts` owns quick/feedback/overlay/chart/loading timing, shared mobile control sizes, chart fill/fade/placeholder treatment, and app/portal layers. Space, type and radii continue to use Mantine.
- `variables.ts` exposes numeric foundations and the appearance resolver output to Mantine/CSS. The intermediate legacy mapping has been removed; the adapter resolves the new appearance only.
- Global styles, list/table/transaction surfaces, dividers, row selections, financial text, feedback motion, Home chart/skeleton, deferred overlays and shared touch sizes consume these tokens. Category palettes and provider colors remain independent.
- Local layers: interactive row overlay (1), mobile date header (1), editor sticky actions (2), pinned table actions (3), and chart retained-error overlay (1) belong to their own containers. Global floating tools now sit between Mantine app and modal layers; combobox/table portals use Mantine's popover layer.
- The nested desktop date picker now uses a portal with viewport shifting. Its focused elements opt out of the editor's Mantine Escape handler, so Escape returns to the editor rather than dismissing both. Regression test and real-browser check pass.
- Resolver validation: 42 deterministic, contrast, neutral, OLED and semantic independence checks. Chart's 11 existing behavior tests and the workbench's two transport checks pass. Full app/route matrix remains pending.

Appearance contract and Settings adoption are complete in code. Header uses canvas + faint divider; PWA/offline use a neutral static fallback. See appearance-release.md and the implementation plan for current test evidence and outstanding visual/coverage work.

## Second adoption pass (2026-09-06)

| Candidate / previous value | Consumers | Final disposition |
| --- | --- | --- |
| Fixed light account separator (`gray-2`) | `accounts/AccountRow.tsx` | `--splice-separator`; removed a bright dark-mode divider found in phone workbench review. |
| Teal/green/blue/violet/cyan/grape/gray/indigo category badge backgrounds and white-alpha borders | `TransactionsTable.module.css`, `getCategoryToneClass` | Removed. Every badge already receives `getCategoryColorStyles` with inline background, border and foreground. These classes were dead appearance overrides; category identity remains owned by category data. |
| Pending yellow / review orange alpha backgrounds (.18) | `TransactionStatusBadge.module.css` | Reuse Mantine semantic `yellow-light` / `orange-light`; independent of user accent. |
| Popover/combobox canvas background | `styles.css`, Mantine adapter | `--splice-surface-overlay`; combobox dropdowns now use the same role as other floating surfaces. |
| 4px category option / 6px Sankey category button corners | Transaction table and Sankey modules | Existing Mantine `radius-xs` / `radius-sm`. Circles and structural zero radii remain local. |
| Unconditional Recharts outline suppression | Global CSS | Removed; pointer focus alone is suppressed, keyboard focus uses `--splice-focus`. Sankey focus consumes the same role. |
| Category palette and luminance-derived black/white text, .24/.38 category border alphas | `lib/category-colors.ts` | Retain in the single domain palette owner: colors come from category data, not the user's appearance. |
| Ethereum / Bitcoin brand hex colors | `lib/crypto-utils.ts` | Retain documented network identities, never tint from accent. |
| Zero-duration recurring/manual editor transitions | Recurring settings and manual transaction modal | Retain explicit local no-animation behavior; do not turn zero into a new motion token. |
| Local layers 1/2/3 | Interactive row target, transaction row target, chart error, editor footer, table headers | Retain within their existing component stacking context. Global errors/tools/portals use foundation layer roles. |

A source-aware color ownership guard (`scripts/check-style-tokens.mjs`) parses
CSS declarations and TypeScript string/template literals. It excludes generated
models/tests/assets and the explicit palette owners above; all current consumer
color literals have been removed. This does not claim the full token audit or
visual matrix is complete.


## Current source disposition: geometry, type, motion and layers

Reviewed on 2026-09-06 after the category workbench pass. Paths below are under
`src/components` unless specified. This source review does not replace the
outstanding visual matrix.

| Consumers | Values / decision | Owner |
| --- | --- | --- |
| `AccountModal`, `DateRangeControl`, `pages/SettingsPage`, `settings/AppearanceControl`, `accounts/InlineBalanceEditor`, `investments/ManualBrokeragePositionsEditor`, `loading/LoadingSkeleton` | Repeated 44px interactive targets and 48px compact inputs now consume one TS/CSS value. A position editor's trailing grid column shares the same value as its delete button. | `foundation.dimensions` via `variables.ts` |
| `NetWorthCard.module.css` | Keep clamp(1.75rem, 6vw, 2.5rem), 1.2 line height and tabular numerals: one financial headline composition. | Local |
| `PageHeader`, `analysis/AnalysisAuditHeader` | Headings use Mantine h3/h4 and the compact action uses Mantine md button geometry. | Mantine scales |
| `CompactAccountRow`, `AccountCard`, `AccountSection`, `MobileTableList`, `TransactionsMobileList` | Space/radius/surface roles reuse shared values. Keep transaction 12px row density, 3px metadata gaps, 9px data swatches and account divider opacities .5/.3: these express the approved account/transaction hierarchy. | Mantine + semantic surfaces; local composition geometry |
| `TransactionsTable`, `MantineTableChrome` | Keep 28px inline editor, 22px metadata icon, 40px coarse-pointer affordance, 12px resize handle and pinned columns at local layer 3. Removed unused category-option list/hover/selected rules from both desktop and mobile modules; actual pickers use `CategorySelect`. Metadata popover border now uses `--splice-border`. | Shared picker/overlay roles; local dense-table geometry |
| `settings/CustomCategoriesSection` | Keep 66px row, 52px header, 56px selection, 130px status, 88px usage and 92px actions columns. These occur together in one management table, not as an app-wide scale. | Local table configuration |
| `investments/InvestmentHoldingsTable`, `ManualBrokeragePositionsEditor` | Keep 620px table minimum, 260px security cell, 66/72px position rows and 8/6.5/5.75rem quantity column. Touch action column is centralized separately. | Local financial layout |
| `Chart`, `loading/ChartSkeleton` | Shared fill, fade, placeholder opacity and animation duration are foundation roles. Keep point sampling, 1.5/2px minimal/full stroke widths and chart dimensions with the chart. | Foundation appearance; local data geometry |
| `analysis/AnalysisSankeyChart` | Keep 720/640px readable diagram width and node/link hover/pressed opacity (.72/.82/.74), which reveal diagram connectivity. Motion and focus use shared tokens; category identity uses category data. | Local diagram semantics + shared interaction roles |
| `loading/LoadingSkeleton` | Keep 42px desktop input silhouette to match Mantine md controls, text widths/row placeholders and chart heights matching their represented compositions. Compact input and action sizes use foundation values. | Mantine-matching local silhouettes + foundation dimensions |
| Mantine `Skeleton` | Default dark palette index nearly merged with raised cards. Base and highlight now use `--splice-skeleton-base` / `--splice-skeleton-highlight`, derived against canvas, raised, muted and control surfaces. The 1.2/1.5 ratios are decorative visibility targets, not WCAG text thresholds. Pulse duration uses the existing breathe foundation; silhouettes stay local. | Pure appearance resolver + shared component class |
| `DataState`, `DeferredOverlay`, `CategoryTransactionsModal`, `forms/EditorModal` | Keep flex/overflow constraints, 180px bounded empty region and 48px modal viewport clearance. Global retained errors use named foundation layer; sticky form footer uses local layer 2. | Shared primitives; local structural layout |
| `InteractiveRow`, `Pressable` | Shared motion/focus/feedback roles; retain absolute hit target layer 1 within positioned row, pointer event mechanics, resets and inset focus offset. | Shared primitives |
| `PwaLifecycle` | Named global layer, Mantine spacing/shadow; retain 560px readable alert width. | Foundation + local alert composition |
| `ResponsiveSlot`, `routes/_authed/transactions.module.css`, `SettingsToolbar` | Preserve display/flex switching, width constraints and responsive toolbar wrapping. | `lib/media-queries.ts`; local layout |
| `pages/SettingsPage`, `AppShellLayout.module.css` | Preserve viewport/AppShell height and scroll constraints. Shared touch target drives tabs. Header surface/divider use semantic roles. | AppShell + appearance |
| `categories/CategorySelect`, `settings/AppearanceControl` | Keep 12px category dot and 26px accent preview circles; 50% radius is shape, not a radius scale. Accent selection/focus rings deliberately have separate 2/3px weights and 3/4px offsets. | Local selection affordance; shared focus/border roles |
| `transactions/TransactionBulkEditToolbar`, `TransactionStatusBadge`, `LifecycleBadge` | Toolbar uses named layer/shadow/mobile dimensions. Lifecycle pairs are centralized and contrast checked. Pending badges and Avatar fallbacks now consume shared semantic pairs/surfaces. Unused review badge CSS was removed. Provider identities have contrast-safe pairs; rule badges consume independent violet status-rule foreground/background roles. | Foundation + status palette owners |
| `styles.css`, `design-system/components.ts` | Mantine owns named typography/space/radius/shadow. Keep badge xs 9px/18px compact treatment, 24px inline control baseline, 4px helper spacing, 300px tooltip width and 2px arrow radius as shared component defaults, not duplicated foundation scales. | Shared component defaults |
| `sw.ts`, `routes/__root.tsx`, `vite.config.ts` | Personalized browser canvas comes from the resolver. Static offline/PWA colors use `OFFLINE_COLORS`; no preference data embedded in offline content. | `design-system/offline.ts` + resolver |

Small component-specific breakpoints at 22.5em (account balances) and 23.125em
(position columns) remain local: they handle those content widths, whereas the
36/48/50em application layout thresholds stay in `media-queries.ts`. Equality
of a numeric value alone is not grounds to merge those roles.

### Choice-control adoption

Checkbox and Radio unchecked boundaries and the off Switch track consume
`--splice-control-border`, shared with input/default-button boundaries. Checked
checkbox/radio colors remain Mantine-owned. Switch checked foregrounds derive
from its actual color through Mantine `getContrastColor`; the off thumb uses
neutral text. Disabled/error states retain Mantine ownership. This closes a
contrast gap in the previously untouched inline-control family without creating
a second border scale. The Controls workbench exposes all selection states.


### Semantic alert adoption

Mantine Alert light variants with semantic colors consume existing status pairs
through `components.ts`: red → danger, yellow/orange → warning, green/teal →
success, gray → neutral. This avoids bright default-palette titles on pale fills.
The holdings error title improved from approximately 2.92:1 to 4.51:1; the expanded
status gallery passes Light/Dark/OLED axe checks at 744px. Other variants and
nonsemantic color choices retain Mantine behavior and require their own review.


### Validation, informational and rule colors

Source review found two remaining consumer `light-dark` choices: InputWrapper's
validation color and transaction rule badge text. Both now resolve centrally.
`--splice-error` guarantees 4.5:1 against canvas, raised, muted and control surfaces;
field errors and standalone stock-search errors consume it. Rule foreground and
background share the accent-independent `status-rule` pair. Blue semantic alerts
use `status-info`, also independent of accent. Resolver tests cover both new pairs
across modes/seeds. No `light-dark` or `color-mix` expressions remain in application
consumers after this pass; Mantine's component variant system still owns standard
named variants, and category/provider identities remain domain data.

The 120ms Chart initialization delay stays local: it allows responsive measurement
before the first morph, rather than expressing transition duration. Existing local
zero-duration editor transitions and local stacking layers retain the dispositions
above. This review does not certify all remaining visual states.


## Final source ownership review (2026-09-06)

Rechecked CSS and TS consumers for raw colors, mode-dependent color expressions,
motion declarations, layers and shared dimensions. The token guard passes;
consumer `light-dark`/`color-mix` searches are empty. Remaining local layers and
zero-duration transitions match the explicit dispositions above. Canonical JS/CSS
values flow from foundation.ts through variables.ts; no consumer imports appearance
persistence to obtain styling. Mantine owns the existing spacing/type/radius/shadow
scales. This completes source ownership disposition; visual gates are separate.

Semantic light/subtle/outline/transparent Buttons and ActionIcons now consume
status control foregrounds checked against both hover and surrounding surfaces.
Semantic light Badges consume status foreground/background pairs, replacing an
Analysis rule type badge measured at 2.74:1 in Light mode. Category inline palettes
and provider identities remain their own owners. Shared status badges do not
shrink in transaction rows, so a long merchant label cannot truncate Pending.

The Analysis recheck and Light/Dark/OLED semantic gallery with a bright yellow
accent have zero violations/incomplete checks. This is bounded browser evidence;
full component and responsive review is recorded in the visual validation document.
