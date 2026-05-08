# Mantine Theme Cleanup

## Status

Planned

## Goal

Centralize reusable Mantine component chrome in the frontend theme while preserving feature-specific layout, density, responsive behavior, and domain presentation. This plan is an audit and implementation checklist only; it does not authorize code changes until explicitly requested.

The cleanup should make generic surfaces, controls, overlays, status badges, table borders, and focus/hover treatment consistent across the app without removing local CSS that encodes transaction/account/category-specific behavior.

## Current Behavior

- Theme presets live in `frontend/src/lib/theme.ts`. `buildTheme()` maps preset tokens into Mantine color names, sets `primaryColor`, `primaryShade`, and `defaultRadius`, but does not currently define component defaults through `theme.components`.
- `frontend/src/components/AppThemeProvider.tsx` applies the active preset with `MantineProvider`, `defaultColorScheme`, and `forceColorScheme`. Theme changes are driven by `THEME_CHANGE_EVENT` and local storage.
- `frontend/src/routes/__root.tsx` loads Mantine core/charts/dates/notifications CSS, `mantine-react-table` CSS, and `frontend/src/styles.css`. It includes a pre-hydration theme-loading script and `ColorSchemeScript defaultColorScheme="auto"`.
- `frontend/src/styles.css` is mostly global browser/runtime chrome: stable scrollbar gutter, body margin reset, mobile 16px input font guard, and Recharts focus outline suppression.
- Generic component styling is scattered in feature files:
  - `frontend/src/routes/_authed/transactions.tsx`, `frontend/src/components/DateRangeControl.tsx`, and `frontend/src/components/settings/CustomCategoriesSection.tsx` each define near-identical mobile `Select` and `SegmentedControl` `styles`.
  - `frontend/src/components/TransactionsTable.module.css` and `frontend/src/components/transactions/TransactionsMobileList.module.css` duplicate pending/review badge chrome, avatar chrome, listbox option chrome, and tokenized table/list borders.
  - `frontend/src/components/TransactionsTable.tsx` passes `className` to Mantine slots such as `Badge`, `Avatar`, `ActionIcon`, and `Popover.Dropdown`; some of these override styled slots directly.
  - `frontend/src/components/settings/CustomCategoriesSection.tsx` reuses `TransactionsTable.module.css` for category-management table chrome, including `mantine-react-table` global selectors.
  - `frontend/src/routes/_authed.tsx` customizes `NavLink` with inline `styles`.
  - `frontend/src/routes/_authed/settings.tsx` builds theme preset radio cards from `UnstyledButton` and inline CSS.
  - `frontend/src/components/AccountModal.tsx` locally styles `Textarea` input chrome to create a borderless notes field.
- The only dirty/untracked worktree item observed during this audit was `tmp/`. Leave it untouched.

## Target Data Shape

No API, database, generated client, or shared data shape changes are expected. This is a frontend styling architecture cleanup in `frontend/src/lib/theme.ts`, local component files, and CSS modules only.

## Cleanup Candidates By Priority

### Priority 1: Shared Mobile Control Sizing

Files/components involved:

- `frontend/src/routes/_authed/transactions.tsx`
- `frontend/src/components/DateRangeControl.tsx`
- `frontend/src/components/settings/CustomCategoriesSection.tsx`
- Components: `Select`, `TextInput`, `Textarea`, `SegmentedControl`, `DatePicker`-adjacent controls.

Move to theme defaults:

- Mobile-friendly input `minHeight: 48` and `fontSize: 16` for input-like components where the same `styles={{ input: ... }}` is repeated.
- Mobile `SegmentedControl` root/label minimum heights and centered label layout, preferably as default slot styles gated by a media query in a theme class or CSS variable, not inline per component.

Keep local:

- Per-use widths such as filter select `w={170}`, `w={220}`, search field flex sizing, `DateRangeControl` width, drawer-specific `withinPortal`, and desktop/mobile density decisions.
- Domain labels, option data, disabled states, and filter-panel layout.

Behavior/accessibility risks:

- Increasing default heights can change dense desktop controls if not scoped carefully.
- `SegmentedControl` radio semantics and keyboard behavior must remain Mantine-owned; do not replace it with custom controls.
- Keep the global mobile 16px input guard in `styles.css` until browser zoom behavior is visually confirmed after theme defaults land.

Suggested tests/visual checks:

- `cd frontend && yarn typecheck`
- `cd frontend && yarn lint`
- Browser check `/transactions` and `/settings?tab=categories` at mobile width: filters open, segmented controls are 48px touch targets, labels fit, keyboard arrow selection still works.

### Priority 2: Overlay And Surface Chrome

Files/components involved:

- `frontend/src/components/DateRangeControl.tsx`
- `frontend/src/components/TransactionsTable.tsx`
- `frontend/src/components/transactions/TransactionSummaryStrip.tsx`
- `frontend/src/components/ChangePercentPopover.tsx`
- `frontend/src/components/CategoryTransactionsModal.tsx`
- `frontend/src/components/AccountModal.tsx`
- `frontend/src/components/accounts/AddAccountModal.tsx`
- `frontend/src/components/accounts/BackfillModal.tsx`
- `frontend/src/components/accounts/UpdateBalanceModal.tsx`
- `frontend/src/routes/_authed/transactions.tsx`
- `frontend/src/components/transactions/TransactionsMobileList.tsx`
- `frontend/src/components/settings/CustomCategoriesSection.tsx`
- Components: `Popover`, `Modal`, `Drawer`, `Paper`, `Card`-like `Paper` surfaces.

Move to theme defaults:

- Baseline `Popover` dropdown radius, border color, shadow, and padding defaults where the app repeatedly uses `shadow="md"` and tokenized borders.
- Baseline `Modal`/`Drawer` padding, radius, overlay, title weight, and mobile bottom-drawer surface chrome.
- Baseline `Paper` surface border/radius/background/shadow for app cards and panels, using tokenized `light-dark()` values.

Keep local:

- `DateRangeControl` popover positioning, `withinPortal={false}`, date picker contents, and button clear overlay.
- Desktop transaction filter custom `FocusTrap` dialog in `transactions.tsx` unless it is intentionally replaced with `Popover`; its `role="dialog"`, Escape handling, click-outside behavior, and focus trap are behavior, not chrome.
- Modal size/fullscreen rules (`AccountModal` `fullScreen={isMobile}`, transaction mobile drawer `position="bottom"`), chart tooltip sizing, and feature-specific panel widths.

Behavior/accessibility risks:

- Replacing custom dialog chrome with `Popover` could change focus trapping and outside-click semantics; if only styling is centralized, keep behavior unchanged.
- Modal/drawer theme changes can affect scroll locking; preserve the existing scrollbar compensation fix in `styles.css`.
- Ensure overlay title IDs, drawer close buttons, Escape handling, and focus return remain Mantine defaults.

Suggested tests/visual checks:

- Component tests that already open modals/drawers: `cd frontend && yarn test src/components/AccountModal.test.tsx src/components/CategoryTransactionsModal.test.tsx src/components/accounts/AccountRow.test.tsx src/components/transactions/TransactionsMobileList.test.tsx`
- Browser check `/transactions`: date popover, transaction details popover, desktop filter dialog, and mobile bottom drawers in light/dark presets.

### Priority 3: Status Badge And Pill Chrome

Files/components involved:

- `frontend/src/components/TransactionsTable.module.css`
- `frontend/src/components/TransactionsTable.tsx`
- `frontend/src/components/transactions/TransactionsMobileList.module.css`
- `frontend/src/components/transactions/TransactionsMobileList.tsx`
- `frontend/src/components/accounts/ProviderBadge.tsx`
- `frontend/src/components/accounts/StatusBadge.tsx`
- `frontend/src/components/settings/CustomCategoriesSection.tsx`
- Components: `Badge`.

Move to theme defaults:

- Generic compact badge baseline: `letter-spacing: 0`, predictable small heights, radius, border behavior for `variant="light"`/`variant="outline"`, and tokenized text/background contrast.
- Reusable status-tone variants or helper class names for pending/review/custom/system/visible/hidden/archived badges if Mantine theme alone cannot express all tones.

Keep local:

- Transaction category tone mapping in `getCategoryToneClass()` because it is domain presentation.
- Category review/override indicators and category-specific colors where they encode transaction semantics.
- Badge positioning for active filter count (`Badge circle pos="absolute" top={-6} right={-6}`).

Behavior/accessibility risks:

- `className` on `Badge` root can override themed root styles. Where the cleanup needs both theme defaults and a local modifier, prefer `classNames={{ root: styles.someModifier }}` or a wrapper helper that composes theme defaults rather than replacing the root class.
- Badge colors must remain tokenized for all presets; avoid raw `rgba(...)` additions unless they are backed by theme variables or CSS vars per preset.

Suggested tests/visual checks:

- Browser check pending/review badges in both `TransactionsTable` and `TransactionsMobileList` across `splice-light`, `splice-dark`, `dracula`, and `oled-black`.
- Verify tooltip labels still expose the same review explanation in the transaction category badge.

### Priority 4: Table And ScrollArea-Like Chrome

Files/components involved:

- `frontend/src/components/TransactionsTable.tsx`
- `frontend/src/components/TransactionsTable.module.css`
- `frontend/src/components/settings/CustomCategoriesSection.tsx`
- `frontend/src/components/transactions/TransactionsMobileList.tsx`
- `frontend/src/components/transactions/TransactionsMobileList.module.css`
- Components/libraries: `mantine-react-table`, Mantine `Table`-adjacent styles, `ScrollArea`-like list containers.

Move to theme defaults or a shared style module:

- Reusable table border token, header/body row border color, hover background, resize handle chrome, and pinned-actions border.
- Shared scroll/list surface border/background/radius if it applies beyond transactions.

Keep local:

- Column sizing, row height constants, virtualization height math, sticky date headers, mobile list grid layout, transaction amount alignment, hidden row actions, and category management pinned actions.
- `mantine-react-table` behavioral props and accessibility props for row selection.

Behavior/accessibility risks:

- MRT uses generated class names and global selectors. A Mantine component theme will not reach all MRT internals; centralize in a dedicated shared CSS module or table wrapper where necessary.
- Do not remove `aria-label` props for category selection checkboxes or the list/listbox roles for category options.

Suggested tests/visual checks:

- `cd frontend && yarn test src/components/TransactionsTable.test.tsx src/components/settings/CustomCategoriesSection.test.tsx`
- Browser check table resize handles, sticky headers, row selection checkboxes, pinned actions, infinite scroll, and hover states.

### Priority 5: ActionIcon, Button, NavLink, Tooltip Defaults

Files/components involved:

- `frontend/src/routes/_authed.tsx`
- `frontend/src/components/accounts/AccountRow.tsx`
- `frontend/src/components/settings/CustomCategoriesSection.tsx`
- `frontend/src/components/TransactionsTable.tsx`
- `frontend/src/components/DateRangeControl.tsx`
- `frontend/src/components/NetWorthCard.tsx`
- Components: `ActionIcon`, `Button`, `NavLink`, `Tooltip`.

Move to theme defaults:

- App-wide `ActionIcon` default radius, subtle/default hover contrast, focus ring, and disabled/loading treatment.
- `Button` default radius, common light/subtle variant tone, and compact size polish.
- `Tooltip` defaults such as `withArrow`, multiline max width, open delay, and shadow if the product wants consistent help chrome.
- `NavLink` root radius and active-label weight from `_authed.tsx`.

Keep local:

- Icon sizes, destructive `color="red"`, success `color="green"`, filter count badges, action-specific `aria-label`s, loading states, and responsive `size={48}` touch targets.

Behavior/accessibility risks:

- `NavLink` currently uses inline `styles` for active label weight; moving it to theme defaults must preserve active state affordance and router link behavior.
- Do not remove `Tooltip` wrappers around icon-only controls unless an accessible label remains on the control.
- Preserve keyboard handling for table edit/cancel actions and Escape behavior.

Suggested tests/visual checks:

- Browser keyboard pass through header/nav, account row actions, transaction row actions, and category management actions.
- Verify focus rings remain visible in all color schemes.

### Priority 6: Input Variants And Borderless Notes Field

Files/components involved:

- `frontend/src/components/AccountModal.tsx`
- `frontend/src/components/settings/PersonalAccessTokenSection.tsx`
- `frontend/src/components/settings/CustomCategoriesSection.tsx`
- `frontend/src/components/accounts/AddAccountModal.tsx`
- `frontend/src/components/accounts/UpdateBalanceModal.tsx`
- Components: `TextInput`, `Textarea`, `NumberInput`, `Select`, `FileInput`, `Checkbox`, `Switch`.

Move to theme defaults:

- Baseline input radius, border color, focus border, description/error spacing, and mobile font/height.
- If the borderless account notes style is reused elsewhere, add an explicit local variant/helper such as `variant="unstyled"` or a small `classNames` helper instead of one-off inline `styles`.

Keep local:

- `AccountModal` notes field being transparent/borderless may be feature-specific because it reads like an inline note editor.
- Form descriptions, validation messages, currency prefixes, `FileInput` accept behavior, and checkbox/switch labels.

Behavior/accessibility risks:

- Input theme changes can alter label/description associations; preserve Mantine input wrappers.
- Switch/Checkbox row spacing must not reduce hit targets or detach labels from controls.

Suggested tests/visual checks:

- Browser check settings general form, PAT creation, account notes editing, add-account modal, and category edit drawer.
- Run existing tests for settings, PAT, and account modal.

## Proposed Mantine Theme Defaults

Add or extend `components` in `frontend/src/lib/theme.ts` inside `buildTheme()` using Mantine component `.extend()` APIs. Keep all color values tokenized through Mantine CSS vars, `light-dark()`, and preset tokens.

Suggested defaults to evaluate in small slices:

- `Button`: `defaultProps` for radius and common size; `styles`/`classNames` for subtle/light/default variants only if contrast is verified in every preset.
- `ActionIcon`: radius, default/subtle hover surface, focus-visible ring, compact icon button sizing consistency.
- `Badge`: root letter spacing, compact height, border behavior, and reusable light/outline token contrast.
- `Paper` and possibly `Card`: shared bordered surface background, border color, radius, and shadow defaults.
- `Popover`: dropdown radius, shadow, border, and baseline padding.
- `Modal` and `Drawer`: content radius, title weight, header/body padding, overlay opacity, and bottom-drawer surface polish.
- `Tooltip`: `withArrow`, shadow, multiline max width, and readable tokenized background/text contrast if needed.
- `Input`, `InputWrapper`, `TextInput`, `Textarea`, `NumberInput`, `Select`, `FileInput`: radius, border, focus, description/error spacing, and mobile control sizing.
- `Checkbox`, `Switch`, `Radio`: size/radius/color defaults while preserving native label behavior.
- `Tabs`: list border, tab radius, active tab color/weight for settings.
- `SegmentedControl`: radius, indicator, label height, and mobile touch sizing.
- `Progress`, `Loader`, `Skeleton`: default radius/sizes where repeated, but avoid changing semantic colors.
- `NavLink`: root radius and active label weight, replacing `_authed.tsx` inline `styles`.

For `mantine-react-table`, do not assume Mantine theme component defaults cover all internals. Prefer a shared table wrapper or shared CSS module for MRT-specific classes such as `.mrt-table-paper`, `.mrt-table-body-row`, pinned actions, and resize handles.

## Milestones

### 1. Baseline Theme Components Scaffold

Implementation tasks:

- Add an initial `components` section to `buildTheme()` in `frontend/src/lib/theme.ts`.
- Start with low-risk defaults for `Button`, `ActionIcon`, `Tooltip`, `Paper`, `Popover`, `Modal`, and `Drawer`.
- Keep the existing token presets unchanged.
- Do not remove local styles in this milestone unless they are exact duplicates of the new defaults.

Exit criteria:

- `cd frontend && yarn typecheck`
- `cd frontend && yarn lint`
- Browser visual check: `/home`, `/accounts`, `/transactions`, `/settings` in the default dark preset.

### 2. Consolidate Mobile Control Defaults

Implementation tasks:

- Move repeated mobile input and segmented-control sizing from `transactions.tsx`, `DateRangeControl.tsx`, and `CustomCategoriesSection.tsx` into theme defaults or a small shared helper if Mantine theme media-query scoping is insufficient.
- Remove only duplicate local `styles` props that are covered by the new defaults.
- Keep per-component width, portal, density, and layout props local.

Exit criteria:

- `cd frontend && yarn test src/routes/_authed/transactions.test.tsx src/routes/_authed/settings.test.tsx src/components/settings/CustomCategoriesSection.test.tsx`
- Browser mobile check: `/transactions` filter drawer, date range popover, `/settings?tab=categories` filter drawer and edit drawer.

### 3. Badge And Status Tone Cleanup

Implementation tasks:

- Create theme-backed badge baseline defaults.
- Deduplicate pending/review badge base chrome shared by desktop and mobile transactions.
- Keep category-specific tone modifiers local or move them to a named transaction-category badge helper only if reuse is clear.
- Replace root-level `className` overrides with `classNames` where a Mantine slot override would otherwise mask theme defaults.

Exit criteria:

- `cd frontend && yarn test src/components/TransactionsTable.test.tsx src/components/transactions/TransactionsMobileList.test.tsx`
- Visual check pending, needs-review, custom/system, visible/hidden/archived badges in all theme presets.

### 4. Table, List, And MRT Shared Chrome

Implementation tasks:

- Extract MRT border/hover/resize-handle/pinned-actions chrome from `TransactionsTable.module.css` into a shared table style module or wrapper that both `TransactionsTable` and `CustomCategoriesSection` can use.
- Keep transaction column layout, category editor listbox, sticky mobile date groups, and row height constants local.
- Review whether the mobile transactions list should use a `Paper`/shared surface class or remain a feature-specific CSS module with shared CSS variables.

Exit criteria:

- `cd frontend && yarn test src/components/TransactionsTable.test.tsx src/components/settings/CustomCategoriesSection.test.tsx`
- Browser check table resize, virtual scroll, row selection, pinned actions, transaction infinite scroll, and mobile list scroll.

### 5. Nav, Form, And Special Variants

Implementation tasks:

- Move `NavLink` radius/active-weight styling from `frontend/src/routes/_authed.tsx` into theme defaults.
- Evaluate whether `ThemePresetOption` in `settings.tsx` should become a local reusable radio-card component with tokenized class names; keep ARIA `role="radio"` and `aria-checked`.
- Decide whether the borderless account notes `Textarea` remains a feature-specific local variant or becomes a named reusable input variant.
- Audit `Checkbox`/`Switch` row spacing after input defaults land.

Exit criteria:

- `cd frontend && yarn test src/routes/_authed/settings.test.tsx src/components/AccountModal.test.tsx`
- Keyboard check: tab through app nav, settings tabs, theme radio cards, account notes, and switch/checkbox controls.

### 6. Final Visual And Color-Scheme Pass

Implementation tasks:

- Check every changed default in `splice-light`, `splice-dark`, `dracula`, and `oled-black`.
- Remove obsolete duplicate local CSS only after confirming the themed default applies to the intended Mantine slot.
- Keep unrelated files and `tmp/` untouched.

Exit criteria:

- All validation commands below pass.
- Browser visual checks cover desktop and mobile widths for `/home`, `/accounts`, `/transactions`, `/analysis`, and `/settings?tab=categories`.
- Focus rings, hover states, drawer/modal behavior, category listbox behavior, and checkbox/switch labels remain accessible.

## Tests

### Backend

- No backend tests are expected for this plan.

### Frontend

- Existing tests should be enough for most behavior guardrails, with focused runs around components whose markup or styling props change:
  - `src/routes/_authed/transactions.test.tsx`
  - `src/routes/_authed/settings.test.tsx`
  - `src/components/TransactionsTable.test.tsx`
  - `src/components/transactions/TransactionsMobileList.test.tsx`
  - `src/components/settings/CustomCategoriesSection.test.tsx`
  - `src/components/AccountModal.test.tsx`
  - `src/components/CategoryTransactionsModal.test.tsx`
  - `src/components/accounts/AccountRow.test.tsx`
  - `src/components/settings/PersonalAccessTokenSection.test.tsx`
- Add targeted tests only if implementation changes DOM semantics or interaction wiring. Pure theme-default moves should lean on visual/browser validation.

## Validation Commands

Frontend:

```bash
cd frontend && yarn lint
cd frontend && yarn typecheck
cd frontend && yarn test
cd frontend && yarn build
```

Focused frontend runs during milestones:

```bash
cd frontend && yarn test src/routes/_authed/transactions.test.tsx
cd frontend && yarn test src/routes/_authed/settings.test.tsx
cd frontend && yarn test src/components/TransactionsTable.test.tsx src/components/transactions/TransactionsMobileList.test.tsx
cd frontend && yarn test src/components/settings/CustomCategoriesSection.test.tsx
cd frontend && yarn test src/components/AccountModal.test.tsx src/components/CategoryTransactionsModal.test.tsx
```

Browser validation:

- Start local dev with the repo local-dev workflow, then check `http://localhost:4000`.
- Use local auth bypass if needed: `http://localhost:3000/user/dev/login?redirect=/home`.
- Inspect desktop and mobile widths for `/home`, `/accounts`, `/transactions`, `/analysis`, `/settings`, and `/settings?tab=categories`.
- Toggle each theme preset in Settings and verify contrast, focus, hover, selected, disabled, loading, modal/drawer, and popover states.
- Verify keyboard behavior for nav links, settings tabs, theme radio cards, transaction/category listbox options, row action icons, filters, checkboxes, switches, and drawer/modal Escape handling.

## Overall Exit Criteria

- Reusable Mantine chrome is centralized in `frontend/src/lib/theme.ts` or an explicitly shared frontend style helper.
- Local styling remains where it expresses feature layout, density, responsive structure, table sizing, virtualization, transaction/category/account semantics, or domain-specific tone.
- No local `className` root override unintentionally masks a themed Mantine slot; where local slot styling is still needed, it uses `classNames`, a wrapper, or a shared helper deliberately.
- Color values remain tokenized and work across all theme presets.
- Existing accessibility roles, labels, focus management, keyboard handling, and Mantine component semantics are preserved.
- Validation commands pass and visual checks cover all routes listed above.

## Explicit Non-Goals

- Do not implement this plan until explicitly requested.
- Do not remove local CSS merely because it exists.
- Do not redesign page layouts, route structure, data fetching, filters, transaction/category behavior, or API contracts.
- Do not hand-edit generated files under `frontend/src/api/**` or `frontend/src/routeTree.gen.ts`.
- Do not replace Mantine components with custom controls when Mantine owns accessibility and keyboard behavior.
- Do not hard-code one-off colors outside theme tokens or existing Mantine CSS variables.
- Do not touch unrelated dirty or untracked files, including `tmp/`.
