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

[theme.ts](../src/lib/theme.ts) owns Mantine component defaults and palettes;
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
