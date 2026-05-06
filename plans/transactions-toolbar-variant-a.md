# Transactions Toolbar Variant A

## Status

Planned

## Goal

Implement the cleaner Variant A transactions toolbar with fewer controls visible by default.

Desktop should show the `Transactions` title, date range control, and an icon-only filters button. The date picker popover should show the calendar first, then a compact `Last` / `This` segmented selector below the calendar instead of separate toolbar buttons or a preset rail. Account, category, inflow/outflow, review status, and clear actions should move into a filter panel opened from the filter button. Bulk review should remain a contextual toolbar action outside the filter panel when `Needs review` is active.

Mobile should show a compact touch-first toolbar with large date controls and an icon-only filters button that opens a bottom sheet. Mobile inputs must use at least 16px text and 48px control height where text entry or selection is involved so iOS Safari does not zoom.

This plan intentionally does not add transaction search.

## Current Behavior

- [frontend/src/routes/_authed/transactions.tsx](/Users/jtkw/splice-mono/frontend/src/routes/_authed/transactions.tsx) owns the transactions page state, query params, filter controls, bulk category review action, and table rendering.
- The toolbar currently renders every filter inline in one wrapping `Group`: date preset buttons, date range picker, account select, category select, amount-sign segmented control, review-status segmented control, bulk review button, and clear filters button.
- The same inline toolbar is used across desktop and mobile, which makes desktop visually noisy and mobile crowded.
- The route query supports `accountId`, `startDate`, and `endDate`; other filters are local component state.
- Existing tests in [frontend/src/routes/_authed/transactions.test.tsx](/Users/jtkw/splice-mono/frontend/src/routes/_authed/transactions.test.tsx) validate that review filters are sent to the transaction query and included in bulk review filters.

## Target Data Shape

No API, database, generated-client, or shared type changes.

All existing filter state remains local to `TransactionsPage` except the existing search params already handled by the route. The plan only changes presentation and interaction structure.

## Milestones

### 1. Extract Filter State UI

Implementation tasks:

- Create a small transactions filter panel component near the route, either inside `transactions.tsx` if kept simple or as `frontend/src/components/transactions/TransactionsFilterPanel.tsx` if the route becomes too dense.
- Move these existing controls into the panel:
  - Account select.
  - Category select.
  - Amount sign segmented control: `All`, `Inflows`, `Outflows`.
  - Category review segmented control: `All`, `Needs review`, `Reviewed`.
  - `Clear filters`, shown only when filters are active.
- Keep `Mark N as reviewed` outside the panel as a contextual toolbar action, shown only when review status is `needs_review` and there are matching rows.
- Keep the existing state variables, query param construction, `bulkReviewFilters`, `markFilteredAsReviewed`, and `clearFilters` behavior unchanged.
- Add a derived active-filter count for the filter trigger. Count account, category, amount sign, review status, and date range as active filters; if date should not count on the filter icon, document that choice in the implementation PR.

Exit criteria:

- Filtering behavior is unchanged after moving controls into the panel.
- Bulk review still uses the current active filters.
- Clear filters still resets date, account, category, amount sign, and review status.
- The route file remains readable; if extraction is skipped, the inline component is still logically separated from table rendering.

### 2. Desktop Toolbar

Implementation tasks:

- Replace the current wrapping desktop toolbar with a calmer single-row layout:
  - Date range picker with a calendar and a `Last` / `This` segmented selector below the calendar.
  - Icon-only filters button using a lucide filter/funnel icon.
- Put account and category only inside the filter panel, not in the desktop toolbar.
- Do not add search.
- Use a Mantine `Popover` or similar anchored panel on desktop. Prefer a width around 320-380px, with grouped controls in a vertical stack and clear section spacing.
- Give the icon-only filter button an accessible label such as `aria-label="Open transaction filters"`.
- Show active state on the icon button when non-date hidden filters are active. If date range is included in the count, make sure the UI does not imply hidden filters are active when only a visible date filter is active.
- Keep desktop month/date/filter controls visually aligned at consistent sizing.

Exit criteria:

- Desktop no longer shows account, category, flow, or review segmented controls inline.
- Desktop shows `Mark N as reviewed` outside the filter panel only when the `Needs review` filter is active.
- The filter trigger is icon-only but accessible by screen reader label.
- The filter panel can be opened, changed, cleared, and dismissed without disrupting table scroll.
- The table remains the dominant visual element under the toolbar.

### 3. Mobile Bottom Sheet

Implementation tasks:

- Add a mobile-specific toolbar layout using responsive Mantine props, CSS modules, or existing breakpoint helpers.
- Mobile default view should show only:
  - Date preset controls and/or date range control in a compact layout.
  - Icon-only filters button.
  - Optional active filter chips if they fit without pushing the table too far down.
- Use a Mantine `Drawer` from the bottom, or an equivalent mobile bottom sheet pattern, for the filters.
- Ensure all mobile selects, segmented controls, and date controls in the sheet use at least 16px text and 48px height. Avoid compact `xs` sizing for interactive mobile controls.
- Make segmented controls wrap or stack if needed, rather than shrinking text below 16px.
- Preserve access to `Clear filters` inside the sheet. Keep `Mark N as reviewed` outside the sheet as a contextual action when review status is `needs_review`.

Exit criteria:

- Mobile no longer stacks every filter inline above the table.
- Filter controls are large enough for touch and avoid Safari input zoom.
- The bottom sheet fits common iPhone widths around 390px without horizontal overflow.
- Table content begins quickly below the compact toolbar.

### 4. Polish And States

Implementation tasks:

- Add active filter chips or a concise active-filter summary only where it reduces ambiguity without adding clutter.
- Make empty account/category option states clear enough, especially while data is loading.
- Preserve keyboard accessibility for opening the filter panel, tabbing through controls, and closing with escape or outside click where Mantine supports it.
- Keep toolbar styling consistent with the existing dark theme and avoid introducing a one-off palette.

Exit criteria:

- The UI has a clear visual hierarchy: title, compact toolbar, table.
- Active filters are discoverable without showing all controls inline.
- The layout remains stable across desktop, tablet, and mobile widths.

## Tests

### Backend

- No backend tests are required because the API contract and transaction query semantics do not change.

### Frontend

- Update [frontend/src/routes/_authed/transactions.test.tsx](/Users/jtkw/splice-mono/frontend/src/routes/_authed/transactions.test.tsx) for the new interaction path:
  - Open the filters panel before clicking `Needs review` or `Outflows`.
  - Verify `categoryReviewStatus` still reaches `transactionControllerFindAll`.
- Verify bulk review still includes account, date, category, amount sign, and review filters after opening the panel to set hidden filters, while the `Mark N as reviewed` action itself remains outside the panel.
  - Verify `Clear filters` resets hidden filters and removes active filter indicators.
- Add coverage for the icon-only filter button accessible name.
- If the filter panel is extracted into a component, add focused component tests only if route tests become too broad or brittle.

## Validation Commands

Backend:

```bash
cd backend && yarn lint
```

Frontend:

```bash
cd frontend && yarn test src/routes/_authed/transactions.test.tsx
cd frontend && yarn lint
cd frontend && yarn typecheck
```

Manual validation:

```bash
cd frontend && yarn dev
```

- Check `/transactions` at desktop width.
- Check `/transactions` around 390px wide.
- Confirm mobile input/select text renders at 16px or larger and controls are at least 48px tall in the filter sheet.

## Overall Exit Criteria

- Desktop Variant A is implemented without search: visible toolbar includes the date range control and an accessible icon-only filters button.
- Account and category filters live only inside the filter panel.
- Flow and review filters live inside the filter panel on desktop and mobile.
- Bulk review remains outside the filter panel and appears only when `Needs review` is active.
- Mobile uses a compact toolbar plus bottom sheet and avoids Safari zoom-prone control sizing.
- Existing transaction filtering, bulk category review, undo notification, infinite loading, and table sorting continue to work.
- Frontend targeted tests, lint, and typecheck pass.
