# Shared UI conventions

Use these defaults when adding or changing UI. Extend an existing primitive when
the same behavior is needed in another screen; keep financial rules and data
mutations in their feature.

## Editors and form actions

Use [EditorModal](../src/components/forms/EditorModal.tsx) with
[FormActions](../src/components/forms/FormActions.tsx) for create/edit forms.
The modal is full screen at widths up to `36em` and centered above that. The
footer supplies Cancel, sticky positioning, safe-area spacing, and equal-width
phone buttons. Callers supply the primary action, validation, and pending state.

```tsx
<EditorModal opened={opened} onClose={onClose} title="Edit item">
  <form onSubmit={form.onSubmit(handleSave)}>
    <Stack>
      <TextInput label="Name" {...form.getInputProps('name')} />
      <FormActions onCancel={onClose} cancelDisabled={isPending}>
        <Button type="submit" loading={isPending}>
          Save
        </Button>
      </FormActions>
    </Stack>
  </form>
</EditorModal>
```

Keep the semantic `form` → `Stack` structure and put `FormActions` last: the
[layout CSS](../src/components/forms/EditorModal.module.css) depends on it.
Use short action labels such as Save or Create. Guard duplicate/invalid submits
in the handler and decide whether dismissal is safe while saving; the shell
does not enforce these policies. Preserve its content/body classes when
customizing styles. A details viewer or confirmation need not be an editor.

Current adopters include account editors, manual transactions, categories,
analysis rules, categorization rules, recurring transactions, holdings, and CSV
backfill.

## Saving and confirmation

Keep drafts open on failure. Disable pending actions and guard duplicate submits;
close only after success. Form errors belong beside the draft, using
[getApiErrorMessage](../src/lib/api-errors.ts) with an actionable fallback.
For row actions use [mutation feedback](../src/lib/mutation-feedback.ts):
`notifyMutationError({ title, error, fallback })` and
`notifyMutationSuccess({ title, message })`.

Use [ConfirmActionDialog](../src/components/ConfirmActionDialog.tsx) for destructive
actions. Supply `title`, `targetLabel`, `consequence`, `confirmLabel`, `onConfirm`,
`onClose`, `opened`, `isPending`, and `error`. It focuses Cancel and blocks dismissal
while pending. The caller owns the mutation, clears old errors on reopening/retry,
and closes after success. Do not put a mutation in the trigger that opens it.

## Settings sections

| Primitive                                                                     | Use it for                                                                                                                                                         |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [SettingsToolbar](../src/components/settings/SettingsToolbar.tsx)             | Section title, description, Add action, and optional extra actions; wraps on phones. It renders styled text, so provide appropriate heading semantics when needed. |
| [SettingsStatusBadge](../src/components/settings/SettingsStatusBadge.tsx)     | Active, Paused, Archived, and Ended states, with consistent colors and contrast. Other domains keep their own status meanings.                                     |
| [SettingsArchiveFilter](../src/components/settings/SettingsArchiveFilter.tsx) | The controlled “Archived only” checkbox. The caller owns filtering.                                                                                                |

These are used across categories and rule sections; recurring transactions also
use the toolbar and status badge.

[LifecycleBadge](../src/components/LifecycleBadge.tsx) is the underlying status
primitive, also used in category pickers. It accepts `status` and `size`: Active
uses success, Paused warning, Archived/Ended neutral. `SettingsStatusBadge` is a
compatibility wrapper. Domain-specific transaction/provider statuses stay separate.

## Dates and dropdowns

- Use [DateRangeControl](../src/components/DateRangeControl.tsx) for a standalone
  reporting range: desktop popover, bottom sheet at widths up to `48em`.
- Reuse its exported `DateRangeFields` inside an existing filter sheet. It shares
  Start/End fields, range-order correction, and month/MTD/YTD presets. The parent
  owns applying, clearing, and closing the surrounding filters.
- Use [formatDateRangeLabel](../src/lib/date-range.ts) everywhere a range is
  summarized. It retains the year and handles single-day, open, and empty ranges.
- Use [formatCalendarDate](../src/lib/format.ts) for `YYYY-MM-DD` display and
  `formatDateTime` for timestamps. The shared policy is `en-US`, device-local time
  for instants, and no timezone shift for calendar dates. Preserve provider date
  adapters and keep display formatting separate from API date serialization.
- For dropdowns, use [mobile-combobox helpers](../src/lib/mobile-combobox.ts):
  `getViewportAwareComboboxProps` normally, and
  `getViewportAwareOverlayComboboxProps` within an overlay. Pair with
  `viewportAwareDropdownMaxHeight` rather than copying positioning/z-index rules.

## Appearance and interaction

[design-system](../src/lib/design-system/appearance.ts) owns the appearance resolver
and shared Mantine component defaults;
[styles.css](../src/styles.css) owns shared appearance and responsive input
rules. Use theme spacing, radii, and semantic colors before adding local values.
Buttons and common form inputs default to `md`. Keep explicit size overrides
intentional. Check custom text/background combinations in light and dark themes;
a palette name alone does not guarantee readable contrast.

Prefer these existing building blocks alongside the new editor/settings pieces:

| Reuse                                                                                        | Responsibility                                                                                                                                   |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| [PageHeader](../src/components/PageHeader.tsx)                                               | Page-level `h1`, responsive title sizing, and actions.                                                                                           |
| [MobileTableList](../src/components/MobileTableList.tsx)                                     | Mobile row shell and loading/error/empty presentation; callers supply row content and accessible interactions.                                   |
| [Table chrome](../src/components/MantineTableChrome.module.css)                              | Shared desktop table styling.                                                                                                                    |
| [Pressable](../src/components/Pressable.tsx)                                                 | Native button semantics and pointer/keyboard press feedback. Its hook alone does not make a `div` keyboard accessible.                           |
| [Transaction badge styles](../src/components/transactions/TransactionStatusBadge.module.css) | Shared Rule, Pending, and Review presentation.                                                                                                   |
| [Money/date formatters](../src/lib/format.ts)                                                | `formatMoneyWithSign` accepts API minor units; `formatMoneyNumber` accepts major units. Keep date-only calendar values distinct from timestamps. |
| [Category colors](../src/lib/category-colors.ts)                                             | Color normalization, fallbacks, and contrast helpers.                                                                                            |
| [API error messages](../src/lib/api-errors.ts)                                               | Extract server messages with a caller-supplied fallback. Callers still choose inline or notification presentation.                               |

Use native buttons/links, label icon-only actions, and avoid nesting interactive
controls. Use [InteractiveRow](../src/components/InteractiveRow.tsx) for a row with
a primary action and independent secondary controls: supply `actionLabel`,
`onActivate`, and content. It owns the native primary button, focus, and press
feedback; secondary buttons and selection controls remain siblings.

## Data states and financial display

Use [DataState](../src/components/DataState.tsx) around fetched content. Set
`hasData`, loading/error/fetching flags, messages, and `onRetry`. Cached children
remain visible after a failed refresh. Keep `PageHeader` outside the state
boundary. `MobileTableList` also exposes retry/fetching props; wire them to the
query rather than rendering a nonfunctional Retry button.

API money amounts and analysis totals are exact **minor-unit strings**. Keep
financial arithmetic in `lib/money.ts`: integer sums/comparisons and decimal text
parsing. Use `DecimalInput` for money drafts so typing, editing, and sign changes
preserve every digit. Counts and calendar inputs may still use `NumberInput`.
Reject excessive currency precision on submit rather than silently rounding a
draft. Categorization-rule amount conditions use exact **major-unit strings**.

Use `formatMoneyWithSign` or `formatMinorMoneyString` for HTTP money, and
`formatMajorMoneyString` for provider/major-unit text. Numeric chart coordinates
must pass through `moneyToChartNumber`/`minorToChartNumber`; retain the exact money
and currency on each point for tooltips and hover summaries. Never send BigInt
or Decimal instances to the API, Query cache, or SSR serialization.

For provider decimal strings in major units, use
[investment formatters](../src/lib/investment-format.ts): `formatInvestmentQuote`
preserves up to four decimals; `formatInvestmentValue` uses currency precision
(explicit fractional-fee opt-in); `formatInvestmentQuantity` keeps share precision
separate. Callers retain balance masking and currency selection. Cash continues
through `formatMoneyWithSign`.

## Responsive rules

[media-queries.ts](../src/lib/media-queries.ts) is the source for both
[React hooks](../src/lib/responsive.ts) and CSS. Use named CSS conditions such as
`@media (--compact-layout)`; Vite expands them to native media queries.

| Hook / CSS condition                       | Purpose                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------ |
| `usePhoneLayout` / `--phone-layout`        | Up to `36em`: fullscreen editors and phone toolbars.                     |
| `useCompactLayout` / `--compact-layout`    | Up to `48em`: page controls, Settings, transaction lists and drilldowns. |
| `useDataListLayout` / `--data-list-layout` | Up to `50em`: denser investment data and charts.                         |
| `useSupportsHover` / `--supports-hover`    | Fine pointer with hover; safe initial render during hydration.           |
| `useCoarsePointer` / `--coarse-pointer`    | Touch-oriented controls, independent of screen width.                    |

Keep one-off content constraints local. Use the named hooks for new callers;
`useIsMobile` remains a compatibility alias for `useDataListLayout`.

For visual changes, follow the repository's testing guidance. When browser
validation is requested, check narrow phone, tablet portrait/landscape, and
desktop paths, including overflow, focus, and overlays. Viewport emulation does
not replace testing native browser keyboards or safe-area behavior on devices.

## Route data and cache ownership

Keep route modules small enough for automatic component splitting. Page components
belong in `components/pages`; unopened editors, Settings sections, and charts use
local `DeferredFeature` boundaries. Keep the summary and navigation outside chart
boundaries. Components must not import their route module to obtain URL state.

Place reusable query options in `lib/queries`. A loader and its component must
use the same parameters, query key, and pagination shape. Transactions uses a
50-row infinite query (`pages` and `pageParams`) from its first server-rendered
page onward. Resolve default dates once in the presentation context so server
and browser use the same user timezone and day.

Use `lib/query-policy.ts` for freshness and `lib/query-invalidation.ts` for explicit
mutation dependencies. URL path segments identify families; substring predicates
can invalidate unrelated queries and are discouraged. App-level mutation
reconciliation owns cancellation, authoritative patches, and invalidation.
Standalone component consumers can use `invalidateMutationFamilies` without
causing a second refetch in the managed app.

Keep financial values server-confirmed. Account names and notes may use the
shared optimistic metadata mechanism and account mutation scope; preserve drafts
on failure and prevent earlier writes from overwriting newer edits. Never relabel
previous filtered rows or totals as a new filter's results. DataState should retain
matching cached results with a visible refresh error and Retry action.

Canonical session data is `User` at `['/user/me']`. `useSession` selects `{user}`
for compatibility; it does not create a second session cache. Do not persist
private Query data or copy it into global server state. Presentation preferences
may use their dedicated small cookies, but masking must apply to chart tooltips,
labels, and dialogs as well as primary numbers.

## Loading, preparation and stable layouts

Prefer the shapes in `components/loading/LoadingSkeleton.tsx` for read-only
initial loads. Pass the actual shape to `DataState.loadingFallback`; pass a
`LoadingSkeleton` boundary with the same shape to `DeferredFeature.fallback` for
module loading. The two phases must share geometry. Dialog code uses an overlay
shell, so opening an editor must never insert a loading form into the page below
its trigger. Keep page headings and filters outside data boundaries.

Skeleton shapes are decorative, noninteractive and hidden from assistive
technology. Their boundary exposes one concise loading announcement and
`aria-busy`. All Mantine skeleton shimmer is disabled with reduced motion. Never
fabricate financial values for a placeholder, and keep masking active in every
loaded value and tooltip.

Matching cached content remains mounted while refetching. `DataState` retains its
children (including drafts, focus and selection), places refresh failures in a
bounded overlay, and keeps explicit Retry. Verify the overlay does not cover
important controls. Empty/initial-error messages occupy the same content frame as
the relevant shape. Do not insert transient banners, spinners or messages above
retained results. In a fixed-height table, preserve flex/min-height and scroll
ownership through every boundary.

A new period/filter must not label old comparison data as current. Keep
period-independent identities and balances where valid; replace affected
comparisons in their existing slots. Matching cached filters can render
immediately. A separate visible “currently showing” announcement is unnecessary.
Saving and syncing can retain button-local progress without replacing drafts.

Make responsive presentation agree from the first server paint: CSS controls
heading size and visibility/layout of equivalent content. When different table
implementations are necessary, use the shared responsive boundary and validate
that hydration does not replace visible geometry. Reserve chart dimensions and
avatar slots. Check ordinary CLS **and** interaction-time layout shifts and anchor
bounds; clicks do not excuse asynchronous content jumps.

Share code import promises through `lib/feature-loaders.ts` and query options
through `lib/queries`. Prepare actual nested chart code alongside its data.
Authenticated idle preparation is bounded, respects hidden tabs/Save-Data and
identity changes, and warms only default primary data using the existing
30-second in-tab Query cache. It must not fetch additional transaction pages,
all filter combinations or security/access-token inventory. Explicit intent can
prepare selected Settings sections using their own authoritative freshness rules.
No private data belongs in the code registry or persistent browser storage.

## Styling tokens and appearance

Use `lib/design-system/appearance.ts` for the pure Light/Dark/OLED + accent
resolver, `foundation.ts` for shared numeric roles, `components.ts` for Mantine
component defaults, and `variables.ts` for the CSS adapter. Persistence and
preview events belong in `lib/appearance-preferences.ts`, outside styling.
The dependency flows from foundations and component defaults to appearance to
providers and consumers; a component must not import persistence to obtain a color.

Prefer Mantine's spacing, type, radius, shadow and named breakpoint conventions.
Use `--splice-canvas`, `--splice-surface-raised`, `--splice-surface-muted`,
`--splice-surface-overlay`, `--splice-border`, and `--splice-separator` for
application surfaces. `--splice-control-border` and `--splice-focus` have stronger
contrast requirements than decorative separators. Use `--splice-selected` and
`--splice-selected-hover` for selected surfaces, and `--splice-chart-color` for
net-worth history. Positive/negative financial meaning and provider/category
colors remain independent of the personal accent.

Shared layers, durations and input/touch dimensions originate in `foundation.ts`;
React reads the values there and CSS consumes the adapter's `--splice-layer-*`,
`--splice-motion-*`, and `--splice-size-*` variables. Keep local chart geometry,
table column widths, circular swatches, structural zero radii and stacking within
an existing local context local. Do not convert every number into a global token.
Do not suppress keyboard focus to improve a pointer screenshot.

Run `yarn tokens:check` when changing styles. It rejects raw color literals in
application consumers while allowing the documented palette owners in
`design-system`, `category-colors.ts`, and `crypto-utils.ts`. A new exception
requires a domain-specific reason in the audit; it is not an escape hatch for a
component-specific theme. Tests, generated API models, and static assets are
outside this guard.

## Component workbench

Every new shared rendered component needs a real example in `workbench/`, with
its source and meaningful states recorded in `catalog.json` and `catalog.md`.
A nonvisual export should instead document its role and behavior test. Run
`yarn workbench` and use mode/accent, viewport, masking, motion and API controls
to inspect combinations. The registry smoke test checks that documented capture
URLs and selectable states resolve. CI builds the static workbench and runs its
isolation checks without a backend.

Keep workbench fixtures and transport adapters outside `src`; production routes
must never import them. The workbench uses independent frame documents and
QueryClients. API examples opt into explicit in-memory handlers. Unknown requests
fail visibly instead of falling through to real HTTP. Never use real user data,
bank-link URLs, notification permission prompts or persisted preferences in an
example. See `workbench/README.md` for the current provider and coverage status.

Secondary interface feedback uses `--splice-hover`; input surfaces use
`--splice-control`. Gray Buttons/ActionIcons are secondary interface actions and
follow the tint. Gray lifecycle/status badges remain accent-independent. Avoid
status background tokens for navigation or ordinary hover feedback. Review
unselected/selected hover, keyboard focus, portals and disabled controls; catalog
registration alone is not a visual review. See [tint audit](tint-surface-audit.md).

Use `subtle` for borderless actions instead of `outline`. The outline-button audit
found three usages (Accounts: Sync all, Backfill, Add account), now replaced.
Transaction category badges retain their separate outline treatment; keyboard
focus outlines are unaffected.

## Non-Home page layout

Use `PageLayout` for Accounts, Transactions, Analysis and Settings. It owns the
16px gap between title/actions, optional navigation, optional toolbar and content.
Omitted slots do not reserve space. `scroll="content"` bounds the content region
using the app-shell height; `contentVariant="edge-to-edge"` removes the compact
content inset while rows retain their own content padding. Home keeps its existing
composition. Forms keep Save with the form rather than in the page header.

Pass action definitions (`id`, `label`, `icon`, `onClick`, optional disabled/loading
and onPrepare), never JSX buttons, to the layout's `actions` prop. `PageActions`
shows one icon-only 44px action plus overflow on phones and two labeled
actions plus overflow on desktop. When only one action would remain in overflow,
show it directly instead: two icons on phones or three labeled actions on desktop.
Only use More for two or more remaining actions. Without primary, first secondary is promoted.
All actions use subtle styling. Labels remain in aria-labels, tooltips and menus.

Use `PageNavigation` for section selection and `PageToolbar` for content filters.
Settings uses the existing tabs on desktop and a section selector on mobile.
Nested SettingsToolbar actions and `PageToolbar section` filters mount into the
layout's header/toolbar targets using React portals, retaining the panel's state,
context and handlers; unmounting a panel removes its contributions. Category/rule
forms remain owned by their sections. Transactions replaces filters with bulk
controls while selecting. Feature preparation remains attached to actions.

## Compact touch controls

Use the `foundation.dimensions` touchTarget (44), touchInput (48) and controlIcon
(20) tokens. `--touch-controls` covers compact widths and any coarse pointer,
including wide hybrid devices. Shared Mantine defaults/CSS own target geometry;
keep icon artwork compact, preserve larger dimensions and avoid enlarging all
spacing. Form fields reserve room for clear/reveal buttons. Checkbox/radio
padding forwards to native input activation; do not replace wrapperProps without
preserving this behavior. Account-row secondary actions use a touch menu so
labels remain readable. Home range pills retain compact artwork within larger
buttons. Focus indicators and existing drag/scroll behavior stay intact.

Use the touch-controls workbench with boundary outlines, then check the affected
real page composition: bigger targets can cause truncation even when every
rectangle meets the minimum. See [touch interaction audit](touch-interaction-audit.md)
for scope, exceptions and actual validation.

## Typography roles

Choose `data-typography="sectionHeading"` (or another named role) on Text, Title,
Anchor and SVG text. Keep Title `order` semantic. CSS consumers use
`@splice-type rowTitleSmall;`; Vite expands both mechanisms from
`src/lib/design-system/typography.ts`. Never specify font size, weight, leading
or family in a surface, including through fw/fz/lh, text size props, style objects
or utility classes. Add a reusable role centrally when an audited use case needs
one. Color, alignment, truncation and text transformation remain contextual.
Button/input `size` controls geometry; shared defaults own their typography.

Use the Typography workbench for the scale and the all-pages view for hierarchy.
Run `yarn tokens:check` (includes typography ownership), relevant tests and both
builds after changing canonical roles. The [typography audit](typography-audit.md)
records role choices, exceptions and validation. Native controls may use
`font: inherit`; offline rendering imports the canonical role directly.


## Page density

Use Home and Transactions as density references without reducing global spacing,
type roles or target sizes. PageLayout still owns the page-level gaps.

- Accounts: put the section toggle above the bordered list, with an 8px gap.
  Use one 12px row inset, subtle separators and no inter-row gaps. Keep name and
  account type together; the Manual badge has its own final row. Linked accounts
  keep connection status, sync metadata and repair actions. Put actions beside
  the text column rather than reserving a separate badge column.
- General Settings: use a transparent, unpadded form, capped at 720px. Separate
  groups with subtle lines and 12px spacing. Put Reset beside Appearance and Use
  browser beside Timezone. Keep fields full width, helpers below, and Save/Cancel
  with the form. AppearanceControl owns custom-color draft/reset validity.
- Compact Settings lists: combine the row name, status and action in the heading;
  keep conditions, category/priority, schedule amount/account and next occurrence
  readable below it. Allow long text and metadata to wrap. Do not impose a fixed
  row height or remove essential details to match a short fixture.
- Use SettingsRowActions with action definitions for both desktop buttons and
  touch menus. One action stays direct; multiple actions use an accessible menu.
  Preserve disabled/loading/destructive states and preparation callbacks. Opening
  an editor must hand focus to its dialog, while Escape returns to the row trigger.
- Analysis: align Inflows, Outflows and Net with 12px summary padding; allow whole
  columns to wrap for very large values. Keep 16px before Cashflow. Pass
  showTotals={false} to the page's Sankey composition to avoid duplicate totals;
  standalone charts retain totals. Compact category rows have one inset and
  retain 44px hit areas. Loading compositions mirror the same hierarchy.

Review actual page examples, including state=long-content, before changing these
patterns. The [density plan](../../plans/non-home-page-density.md) records the
approved scope and validation; the workbench README lists capture URLs.


Amount font preference: `display`, `amount*` and numeric caption/metadata/input
roles use `--splice-font-amount`, resolved from the saved appearance preference.
General's “Use monospace font for amounts” switch previews immediately and follows
Save/Cancel. Omitted/false uses the body font; true uses the canonical mono stack.
Keep dates, names and prose in their existing roles. Numeric input roles are
selected centrally by inputmode. Account amounts and percentage disclosures share
the same preference, including in portals and server-rendered first paint.
