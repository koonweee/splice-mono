# Styling tokens, component workbench, and theme overhaul

## Status

Complete locally. Token audit and centralization, Light / Dark / OLED + accent, server-first persistence, and the component workbench are implemented and validated. The final acceptance reconciliation below links the completed evidence; earlier checkpoints retain their historical limitations. Local app and workbench remain running. Changes are uncommitted and have not been pushed or deployed.

This plan supersedes the remaining styling/theming scope in `plans/mantine-theme-cleanup.md`, whose current-state description predates the shared component defaults now present in the app. Preserve that historical document; use this plan and `frontend/docs/ui-conventions.md` for new work.

## Goal

Audit and centralize Splice's reusable styling decisions, then replace the existing preset system with **Light / Dark / OLED + accent**. Build a maintained component workbench early and use it throughout the migration to inspect real component combinations, states, and responsive layouts.

The approved direction is a neutral foundation with restrained surface tinting, accent-colored interactive controls and net-worth graph, neutral readable text, and independent financial/status colors. The top bar should blend into the page with a faint divider. OLED keeps the page and top bar genuinely black; tint belongs on raised surfaces and controls.

No backward compatibility is required. Remove old preset IDs, preset UI, browser keys, and helper contracts rather than mapping old themes or retaining dual systems. Existing appearance preferences can reset to Dark + sage; preserve all unrelated settings and financial data.

## Baseline Before Implementation

This section records the starting point for the audit. The status and implementation evidence below track changes already made; removed files here are historical references, not current implementation instructions.

- `frontend/src/lib/theme.ts` owns four presets (`splice-light`, `splice-dark`, `dracula`, `oled-black`), palette tuples, Mantine mappings, component defaults, local-storage persistence, cookies, and theme events in one module. `buildTheme()` maps success to both `teal` and `green`, danger to `red`, and uses `brand` as Mantine's primary color with automatic foreground contrast.
- `frontend/src/styles.css` provides shared component classes, browser fixes, focus treatment, overlay styling, and mobile input sizing. Component modules and JSX still repeat border alpha values, surface colors, radii, motion durations, spacing, and layering values.
- Concrete audit candidates include repeated `rgba(255,255,255,.075)` borders in table/list/overlay styles; row hover fills in `TransactionsMobileList.module.css`; layer values in `DataState.module.css`, `TransactionBulkEditToolbar.module.css`, `PwaLifecycle.module.css`, and `CategorySelect.tsx`; and 120/150/200/400 ms motion values across controls, overlays, and `Chart.tsx`.
- `frontend/src/lib/media-queries.ts` already centralizes named breakpoints for both CSS and React. Preserve those role-specific breakpoints rather than inventing a second responsive scale.
- Shared primitives already exist: `PageHeader`, `Pressable`, `InteractiveRow`, `DataState`, `ResponsiveSlot`, `MobileTableList`, `EditorModal`, `FormActions`, `ConfirmActionDialog`, `LifecycleBadge`, and loading/deferred components. Extend these instead of replacing them. The component tree currently contains roughly 70 non-test TS/TSX modules, including helpers and page compositions; the audit must establish the actual rendered-component inventory.
- `frontend/docs/ui-standardization-audit.md` records completed UI standardization. Preserve its behavioral contracts; token work is not a reason to change financial formatting, query ownership, optimistic updates, form behavior, or table density.
- `AppThemeProvider.tsx`, `presentation-preferences.tsx`, and `routes/__root.tsx` coordinate server-first appearance, authenticated settings, browser cookies, and local storage. `SettingsPage.tsx` implements immediate theme previews, draft/baseline tracking, saving, and error restoration.
- Backend settings live in JSONB on `UserEntity`. `backend/src/types/UserSettings.ts` defines validation/defaults, and `user.service.ts::updateSettings()` explicitly merges fields. Updating only the Zod schema will not persist a new field.
- Root stylesheet links, development inline CSS modules, and `vite.config.ts`'s persistent production CSS plugin prevent refresh flashes and navigation CSS loss. Preserve and test both development and production delivery paths.
- Additional appearance surfaces include root `theme-color` metadata, PWA manifest colors in `vite.config.ts`, and the offline document in `src/sw.ts`.
- The approved six-look contact sheet was built from CSS overrides, not a production theme implementation. Its palette files are design references, not styles to paste wholesale into components:
  `/Users/jtkw/.codex/visualizations/2026/09/06/01a07786-1bbf-7880-8634-0d91a397310b/splice-palettes/`.
- TVRoom references: `apps/web/src/lib/theme/accent.ts` and `apps/web/src/app.css` in `~/projects/tvroom-rewrite`. Reuse the principle of a seed accent and semantic derived surfaces; retain Splice's account persistence and SSR requirements.

## Execution Order and Review Gates

The requested order is **audit → centralize → theme overhaul**. The workbench supports every stage; it is not a final documentation task.

| Stage | Concrete deliverable | Gate before moving on |
| --- | --- | --- |
| Audit + workbench bootstrap | Token disposition ledger, rendered-component catalog, and real component baselines | Each reusable styling decision has an owner or an explicit reason to remain local. |
| Centralize | Shared foundations and semantic roles consumed by production components and the workbench | Duplicates are resolved and existing layout/interaction behavior remains intact. |
| Theme overhaul | Light / Dark / OLED + accent, Settings controls, persistence, and preference reset | All modes are readable, semantic data colors remain independent, and first paint matches saved appearance. |
| Complete validation | Component/state coverage, responsive and interaction evidence, annotated contact sheet | Workbench and real application pass the documented checks. |

The workbench is a component inspection tool, not a second implementation of Splice's business logic. Use deterministic fixtures and explicit scenario controls to expose meaningful UI states. Implement in-memory mutations only where they are needed to inspect production interactions; do not reproduce provider integrations, scheduling, or the entire backend. Every rendered component still needs a direct example or a documented real composition, including relevant failure and combined states.

1. Complete the token and rendered-component inventory in milestone 1. Give each candidate an owner and a disposition before introducing more tokens. Bootstrap milestone 2 alongside this audit so actual component combinations can expose missing roles.
2. Establish representative workbench baselines, then centralize one styling family at a time in milestone 3. Compare each family against its baseline before changing its visual treatment. Prefer Mantine's existing scales; keep one-off domain geometry local.
3. Once token ownership and adoption are verified, complete the Light / Dark / OLED + accent resolver and settings replacement in milestones 4–5. Keep financial/status/category colors independent of the accent. Remove the old system without compatibility adapters.
4. Expand workbench coverage throughout these steps, then finish milestone 6 with the full interaction/responsive matrix and real screenshot contact sheet. A component's catalog entry is complete only when its meaningful states and composition behavior have been checked.

Some implementation already exists in this working tree. Preserve it, but do not treat that as evidence that an earlier gate passed: finish missing audit dispositions and validation before declaring the corresponding milestone complete. If a pre-change baseline was not captured, recover it from an isolated repository revision and label its provenance; do not label the new theme as the old baseline.

## Target Data Shape

Replace the existing `theme` field in the settings contract with a complete appearance value:

```ts
type AppearancePreference = {
  mode: 'light' | 'dark' | 'oled'
  accent: string | null // normalized #rrggbb; null = neutral, no surface tint
}

// Other user settings retain their existing fields and meaning.
type AppearanceSettings = {
  appearance: AppearancePreference
}

// The existing settings PATCH accepts appearance atomically when supplied.
// Omitting it preserves the saved appearance; accent:null deliberately clears tint.
type AppearanceSettingsUpdate = {
  appearance?: AppearancePreference
}
```

Default: `{ mode: 'dark', accent: '#83b59b' }`. Swatches: neutral, sage, slate blue, dusty plum, warm clay; a custom picker accepts any valid six-digit hex color. The selected seed remains unchanged in storage; displayed accent shades adapt to the base mode and contrast requirements. Tint strength is automatic, not another user setting. A light palette may therefore use a darker visible sage than the same seed on dark surfaces.

Use a new bounded, encoded appearance cookie and local-storage key, such as `splice_appearance` and `splice:appearance`. The authenticated server preference is authoritative; validated browser preference is only the anonymous fallback. Do not read legacy theme keys or translate legacy IDs. Add a one-time database migration resetting old appearance preferences and deleting `theme`, without changing other JSONB properties. Invalid or missing new-format preferences fall back to the new default; this is input resilience, not legacy compatibility.

## Milestones

### 1. Audit reusable styling decisions and component coverage

Implementation tasks:

- [x] Create `frontend/docs/styling-token-audit.md` with a source inventory and disposition for every styling family. Search CSS modules, global CSS, JSX style props, Mantine defaults, chart colors, responsive helpers, metadata, and offline/PWA styling; exclude generated API code and third-party internals.
- [x] Record each candidate's current values, consumers, intended meaning, proposed owner/token, and disposition: centralize, reuse an existing Mantine token, retain locally, or remove as obsolete. Count duplicates by semantic role, not just literal equality.
- [x] Audit color roles (canvas, raised/muted surface, control, hover/pressed/selected, separators, focus, foreground, success/danger/warning/info), typography, spacing/density, radius, elevation, overlay/backdrop, layering, chart treatment, and motion/reduced motion.
- [x] Keep geometry with domain meaning local: chart sampling, Sankey layout, column widths, monetary typography exceptions, circular avatars, and component-specific offsets are not automatically global tokens. User category colors, provider identity colors, and financial semantics must not become personal accents.
- [x] Map global stacking relationships separately from local stacking contexts. A local row `z-index:1` is not equivalent to an app overlay layer.
- [x] Inventory every exported rendered component and its meaningful variants/states in `frontend/workbench/catalog.md`. Distinguish direct examples, components demonstrated inside a composition, and nonvisual helpers covered by unit tests. Every omission requires a documented reason.
- [x] Capture baseline real UI for Home, Accounts, Transactions, Analysis, Settings, and representative dialogs using the current styles. Use synthetic fixtures, not production accounts or secrets. Recovered from isolated revision `7bcfbd3`; provenance and limitations are in `frontend/docs/appearance-baseline.md`.

Exit criteria:

- [x] Every reusable styling family has a documented owner; the first batch of token names and exceptions is concrete.
- [x] Every rendered component is represented in the workbench coverage inventory, including loading/error/empty and nested overlay cases.
- [x] Audit references match the current checkout, including completed standardization work and unrelated pending changes. No unrelated work is overwritten.

### 2. Establish the component workbench before centralization

Implementation tasks:

- [x] Add a standalone development workbench under `frontend/workbench/`, with its own HTML/React entry and Vite config. Proposed commands: `yarn workbench` (port 4001) and `yarn workbench:build`. Keep it outside the production TanStack route tree and `src` CSS glob so fixtures and workbench styles do not ship in the app.
- [x] Reuse the production Mantine theme, global CSS, CSS modules, media-query expansion, and production components. Extract shared Vite CSS configuration if necessary; do not maintain copied theme/component implementations.
- [x] Add a searchable component registry, URL-addressable examples, viewport presets, reduced-motion toggle, balance masking, and state controls. Initially expose the existing presets for baseline checks; replace these with the new modes/accents in milestone 4.
- [x] Provide isolated QueryClient, memory router, presentation/session providers, deterministic dates and financial fixtures. Use development-only mock handlers at API boundaries for components that fetch or mutate, with unexpected API requests failing visibly. Do not permit real backend traffic, bank linking, notifications, access-token creation, or user preference writes from examples.
- [x] Start with primitives and representative compositions: controls/forms, rows with secondary actions, table + toolbar, chart + period control, editor + picker/popover, retained data + refresh error, confirmation dialog, and notification/error overlays. Populate the remaining catalog as each family is centralized.
- [x] Mount comparison panes in independent frames so HTML color-scheme attributes, CSS variables, portals, and preference events cannot leak across examples. Theme previews must update the entire example including body-level dialogs/tooltips.
- [x] Add focused isolation tests and a smoke check for the registry; configure a static workbench build in CI. Verify production output excludes workbench code, fixtures, and mock workers.

Exit criteria:

- [x] A developer can run the workbench without a database, logged-in user, or backend server.
- [x] Baseline examples use actual components and can reproduce loading, errors, disabled/pending state, focus, and overlays.
- [x] Opening or changing examples has no effect on normal app preferences or data. Examples have stable URLs suitable for agent-browser capture.

### 3. Centralize tokens and adopt them across the application

Implementation tasks:

- [x] Introduce `frontend/src/lib/design-system/` with foundation scales, semantic roles, component defaults, and a Mantine adapter. Separate pure styling definitions from persistence and React event handling currently mixed into `theme.ts`.
- [x] Define one canonical value source. Prefer existing Mantine tokens where they express the role; add `--splice-*` semantic variables for missing roles. For numbers consumed in both CSS and component props (layers, durations, shared dimensions), define them once in TypeScript and expose corresponding CSS variables through the adapter. Do not maintain independent JS and CSS copies.
- [x] Organize foundations (space/type/radius/motion/layers), semantic tokens (surface/text/border/action/status), and a small set of component tokens (table/header/divider/chart) only where distinct roles justify them. Document consumption rules and dependency direction.
- [x] First map current palettes to the centralized roles to isolate refactoring from the new visual treatment. Keep this intermediate state internal to implementation; it is not a second supported theme API.
- [x] Adopt tokens family by family: app shell/page chrome; controls/forms; rows/lists/tables; overlays and portals; status/category treatments; charts/loading; settings/PWA. Update workbench examples alongside each family and remove duplicated CSS after callers move.
- [x] Preserve the 16px mobile input guard, focus visibility, retained-data behavior, native control semantics, chart hover/morph behavior, and approved Home spacing. Avoid broad selector overrides that silently affect unrelated third-party elements.
- [x] Resolve named global layer relationships across AppShell, sticky tools, errors, dialogs, popovers, and notifications. Use Mantine's layer defaults where appropriate; avoid creating competing global scales.
- [x] Centralize chart opacity/fade/motion and placeholder colors through chart roles, including `Chart.tsx`, `Chart.module.css`, `ChartSkeleton`, and chart tooltips. Keep category/Sankey data colors independent.
- [x] Update `ui-conventions.md` and the audit as each family is completed. Add a focused guard against new raw theme colors in application styling, with explicit exceptions for semantic data palettes/assets; do not write brittle tests asserting CSS strings or pixel constants.

Exit criteria:

- [x] Every audited duplicate is replaced, removed, or retained with a documented reason. No large untouched family remains behind a “follow-up” note.
- [x] Components consume shared semantic roles rather than selecting theme-specific hex values or recreating color mixes.
- [x] Workbench and real routes show no unintended layout, focus, stacking, or interaction changes from centralization; existing behavior tests, lint, typecheck, and build pass.

### 4. Replace presets with neutral modes and derived accents

Implementation tasks:

- [x] Build a pure `resolveAppearance()` in the design-system layer. It resolves Light, Dark, or OLED foundations plus a validated accent into the full Mantine/semantic token set and a readable chart accent.
- [x] Use restrained surface tinting based on the approved CSS previews: dark surfaces around 3–8%, light surfaces weaker, and selected controls stronger. Keep most text neutral. Neutral (`accent:null`) applies zero surface tint and a visible neutral control/chart treatment.
- [x] Maintain true black canvas/header in OLED with distinguishable raised surfaces. In all modes use the approved quiet header with its faint divider.
- [x] Adapt action foregrounds, focus rings, selected labels, and chart colors for contrast. Arbitrary black, white, near-gray, bright yellow, and saturated custom seeds must remain usable. Preserve the stored seed while deriving safe displayed shades; do not assume Mantine button auto-contrast protects every custom surface or chart.
- [x] Decouple Home's net-worth accent from success colors. Keep positive/negative amounts, warning states, category identities, and multiseries chart meaning independent of accent selection.
- [x] Replace the workbench preset controls with mode, accent swatches, custom hex picker, and neutral. Add side-by-side mode/accent comparison and a token inspector showing resolved surface/text/action/status values.
- [x] Remove old palette definitions and preset exports once all application consumers move in milestone 5; no permanent aliases or Dracula compatibility palette.

Exit criteria:

- [x] All six approved directions are reproducible through base + accent, with the quieter header. OLED has a reviewed comparison even though it was absent from the original sheet.
- [x] Contrast checks cover normal text (4.5:1), large text (3:1), and required control/focus/graph boundaries (3:1 against adjacent backgrounds); inactive/disabled states remain distinguishable without treating them as active text.
- [x] Workbench review covers every curated accent on all three modes, plus extreme custom seeds and reduced motion. Changing the accent does not recolor semantic data meanings.

### 5. Replace the settings contract and wire server-first appearance

Implementation tasks:

- [x] Update `backend/src/types/UserSettings.ts`, defaults/normalization, `user.service.ts::updateSettings()`, and relevant response schemas to use the new appearance object. Require a complete valid appearance object when supplied, normalize hex casing, handle `accent:null` explicitly, and reject invalid mode/color values and the removed `theme` update field.
- [x] Add a targeted JSONB migration removing the old `theme` property and initializing appearance to Dark + sage. Preserve unrelated settings byte-for-byte in meaning; do not reset the entire settings document. Do not migrate Dracula to plum or keep old theme names alive. Document the preference reset and the rollback limitation.
- [x] Regenerate the frontend API with `yarn orval` from the updated backend. Never hand-edit generated clients/models.
- [x] Refactor `AppThemeProvider.tsx`, `presentation-preferences.tsx`, and `routes/__root.tsx` to pass one resolved appearance through SSR and hydration. Use validated new-format cookies/storage, synchronize browser tabs, and keep authenticated server settings authoritative after login or account switches.
- [x] Replace the theme grid in `SettingsPage.tsx` with three mode choices and a compact accent row: swatches, custom picker/hex entry, neutral, and reset. Keep existing live preview, unsaved-draft detection, save/cancel behavior, failure restoration, and external settings reconciliation. Theme/accent preview and cancellation must operate as one draft.
- [x] Update root browser theme-color metadata to the resolved canvas. Replace hardcoded Dracula PWA/offline colors with a documented neutral default where personalized data is unavailable; static splash assets do not need combinatorial accent generation. Preserve offline privacy.
- [x] Delete old preset helpers, events/storage reads, and tests; use new keys instead of compatibility fallbacks. Preserve balance masking, date resolution, and all other presentation settings.
- [x] Validate refresh and navigation CSS delivery in development and production, including the existing persistent stylesheet plugin and development inline styles. Do not hide the page until hydration as a workaround.

Exit criteria:

- [x] Only the new appearance contract is accepted and rendered. Old settings reset cleanly with no dual-read/write period.
- [x] Saving survives refresh, login, navigation, and another browser session; draft previews and failed saves cannot incorrectly replace the authoritative saved preference.
- [x] The first HTML paint and hydrated page agree on mode and accent, including custom colors and OLED. There is no unstyled or wrong-theme flash.
- [x] Migration tests prove unrelated settings remain intact. API ownership tests prove one user cannot alter another user's appearance.

### 6. Complete the workbench, verify combinations, and prepare delivery

Implementation tasks:

- [x] Finish every entry in `frontend/workbench/catalog.md`. All rendered components must be directly demonstrated or linked to a real composition example. Nonvisual helpers need a reason and a test reference, not empty showcase tiles.
- [x] Include nested and difficult states: picker inside editor, confirmation above account details, sticky bulk toolbar with retained-data error, validation + pending submit, masked chart hover, placeholder-to-data morph, empty chart, single-point history, long names, large/negative/zero amounts, category colors, and responsive tables.
- [x] Add deliberate failure/latency fixture controls and keyboard walkthroughs. Mount only selected examples/comparison frames to keep the workbench responsive.
- [x] Add a maintained README with commands, provider/mock conventions, how to register a component/state, and stable capture URLs. Update CI and documentation so new shared components require a workbench example or explicit nonvisual exclusion.
- [x] Use agent-browser for the workbench and real app at 390px phone, 744px tablet, 1133px landscape tablet, and 1440px desktop. Check all mode/swatch combinations on a representative composite gallery; check every catalog entry in all three modes with at least one accent, then test color-sensitive components across the full matrix. Include extreme custom colors, keyboard focus, touch-sized controls, nested portals, and reduced motion.
- [x] Capture an annotated contact sheet from real workbench/app screenshots using the contact-sheet skill. Inspect native resolution and fit-to-screen; no CSS-only preview overrides remain in production implementation.
- [x] Document deployment ordering for the incompatible settings contract and preference reset. Test old cached-client rejection/refresh recovery and coordinated backend/frontend release; do not build compatibility adapters. Release reversal requires the previous code plus an explicit settings recovery/reset, not a lossy down migration claiming to restore deleted selections. The local same-origin historical-client → current-client recovery rehearsal, old-format rejection, and unchanged-settings checks are recorded in `frontend/docs/appearance-release.md`. No production deployment was performed.
- [x] Leave the local app and workbench running for user review when implementation completes; close agent-browser sessions started for validation. Commit/push/deploy only when requested in that implementation session.

Exit criteria:

- [x] The workbench is complete, reproducible offline from the backend, and useful for ongoing component combinations, not just a palette demo.
- [x] Production bundle excludes workbench entry points, fixtures, and mocking code. Normal app routes use the exact same production primitives/tokens reviewed in the workbench.
- [x] The validation matrix, contact sheet, and documentation are complete, with no unresolved material contrast, hydration, stacking, or interaction defects.

## Tests

### Backend

- Extend `backend/test/types/user-settings.spec.ts`: valid modes, uppercase-to-lowercase hex normalization, neutral accent, missing defaults, malformed/oversized colors, invalid mode, removed legacy field rejection.
- Extend `backend/test/user/user.service.spec.ts` and relevant controller/auth coverage: atomic appearance updates, omitted appearance preservation, explicit neutral, preservation of currency/timezone/notification settings, authenticated ownership.
- Add a real PostgreSQL migration test and update `backend/test/user/settings-auth.postgres.spec.ts` where the contract changes. Verify reset/removal affects only appearance fields, including null/default settings cases.

### Frontend

- Pure resolver tests for deterministic results, neutral/OLED invariants, separate status colors, and contrast across curated and extreme seeds. Test behavior and contrast, not snapshots of every generated hex value.
- Extend `presentation-preferences.test.tsx`, provider tests, and Settings route/component tests for SSR first paint, authenticated precedence, storage failures, malformed cookie values, preview/save/cancel/error, unsaved drafts during refetch, and cross-tab changes.
- Preserve `Chart.test.tsx`, `NetWorthCard` hydration tests, Home period tests, and existing form/row/table/overlay tests; custom appearance must not regress masking, hover, animation, or monetary semantics.
- Workbench isolation/registry smoke tests and real-browser checks for portal scoping, responsive layouts, network isolation, and rendering all registered examples.
- Visual checks verify repeated tokens and layout; do not add unit tests that merely search CSS declarations or assert implementation constants.

## Validation Commands

Backend (from `backend/`):

```bash
yarn lint
yarn tsc --noEmit
yarn test test/types/user-settings.spec.ts test/user/user.service.spec.ts --runInBand
# Run the new migration and affected PostgreSQL suites with the repository's
# documented test database setup; never point test/migration checks at production.
```

Frontend (from `frontend/`):

```bash
yarn orval                  # after updating the backend OpenAPI contract
yarn lint
yarn typecheck
yarn tokens:check           # enforce styling color ownership
yarn test --maxWorkers=2
yarn build
yarn workbench              # new script from milestone 2
yarn workbench:build        # new script from milestone 2
```

Run `git diff --check`; inspect generated client changes. Run agent-browser outside the sandbox as required by repository instructions, use a named session, and close it afterward. Reuse local dev auth and existing server processes according to the splice-local-dev skill. Build and inspect production output as well as Vite development behavior. Baseline unit/build checks do not replace visual validation of this plan.

## Overall Exit Criteria

- [x] Styling audit is complete; every reusable token family has one owner, adopted consumers, and documented exceptions.
- [x] Light / Dark / OLED + accent is the only theme system; no legacy presets, mappings, or compatibility persistence remain.
- [x] Neutral, sage, blue, plum, clay, and custom colors produce coherent, readable combinations; OLED remains black and the top bar stays quiet.
- [x] Financial/status/category colors retain their independent meanings; exact-money display, masking, layout density, and existing interactions remain correct.
- [x] Appearance is saved per user and correct from the first server paint, with reliable draft handling and no refresh flash.
- [x] Existing appearance preferences reset safely; all unrelated settings and user data remain intact.
- [x] All rendered components have maintained workbench coverage, including meaningful combined and failure states; the workbench cannot mutate real data and is excluded from production.
- [x] Required checks and browser matrix pass; reviewed screenshots and operating documentation are available.
- [x] No unrelated pending bank-link/account work is included or overwritten; deployment is a separate authorized action.

## Implementation evidence (2026-09-06)

### Current workbench coverage checkpoint

- Completed all 14 loading compositions in Light/Dark/OLED at 744px, with 42 inspected recaptures and zero audit violations/incomplete checks. Fixed nearly invisible dark-card skeletons using shared base/highlight roles and centralized pulse duration; corrected the workbench reduced-motion toggle to stop CSS animations. Native browser emulation verifies 1.8-second normal motion and no reduced-motion animation. Resolver tests (42), typecheck, token check, lint and both builds pass. The first-state review now covers 33 of 35 examples. Separately, 74 focused backend and 12 isolated PostgreSQL tests pass; source/ownership/migration inspection closes the new-only contract and data-preservation gates. Detailed evidence: `frontend/docs/appearance-visual-validation.md`, `loading-review/` artifacts. Full remaining state review stays open.

- Added a direct `page-transactions / refresh-error` workbench state for bulk selection with retained-data errors. Real page failure/recovery was verified at 390/744/1133/1440px across Light/Dark/OLED: selection and loaded rows persist, recovery removes the error, controls remain reachable, and there is no horizontal overflow or runtime error. All four audits report zero confirmed violations; overlay contrast incomplete checks remain open. One isolation/recovery test brings workbench coverage to 48 passing tests; typecheck, lint and workbench build pass. Evidence: `frontend/docs/appearance-visual-validation.md`, `bulk-refresh/` artifacts. First-state strip review now covers 19 of 35 examples; this does not close the full state matrix.

- Recovered 13 historical Dracula baseline captures from isolated revision `7bcfbd3`: five real routes at 390/1440px plus account details, transaction editor and date picker at 744px. Used a production build and read-only synthetic API; original theme/CSS hashes match Git. Initial server-only captures were replaced. Temporary servers/browser are closed. Baseline capture is complete; full raw comparison and final current-state validation remain open.

- Added per-frame manual portfolio creation, holdings replacement and fixed-price refresh fixtures; newly created balance accounts also receive detail/holdings/activity read handlers. Exact decimal totals and pre-mutation validation are covered by three new tests. All 46 workbench tests pass. The 744px Dark browser created a two-share EXM portfolio through the real AddAccountModal and verified the refreshed list and success notification. Holdings edit/refresh browser coverage and remaining visual matrix are still pending; fixture quote/currency limits are documented in the workbench README.

- Recommendation fixtures now support generation/regeneration, ignored categories, preview, accept and dismiss, with frame isolation and no model/background jobs. The Light phone walkthrough verified the real nested flow and uncovered/fixed parent-drawer Escape ownership and low-contrast priority badges. Three new fixture tests plus the component's nested dismissal regression pass; typecheck, lint, token check and both builds pass. The generated rule-change preview type has no rendered frontend consumer, so it does not require a separate workbench interaction. Full visual/state review and remaining fixture coverage are still pending.

- Completed 45 curated/extreme palette captures at 390/1133/1440px with zero confirmed axe violations and no browser errors; Home has 30 incomplete checks requiring manual review. Sampled raw review exposed low-contrast unchecked choice controls and white-on-white switch thumbs. Shared checkbox/radio/switch boundaries and switch foregrounds now consume contrast-safe owners, and Controls exposes all selection/disabled states. Real phone interaction, rendered contrast measurements, 45 focused tests, typecheck and both builds pass. Full raw/state/fixture review remains pending; details are in `appearance-visual-validation.md`.

- Nested interaction checkpoint: stock search supports keyboard focus/selection and Escape restoration; phone date drawer and confirmation now isolate Escape from their parent editor. Real 744px Dark stock selection and 390px OLED nested dismissal were verified. Corrected a vertically stretched phone date trigger and canvas-colored dialog action footer, then recaptured/inspected both nested screenshots. Affected suites pass 17 tests; lint/typecheck pass. Full matrix remains pending.

- All 35 initial example states captured at 744px in Light/Dark/OLED (105 captures), with zero confirmed axe violations and no browser errors; most raw screenshots and nested states still await review. Full frontend checkpoint: 576 tests/89 files and both builds pass. Subsequently extracted shared `AppShellLayout` into production/workbench, added missing header/navigation coverage, and made collapsed links inert. Phone navigation and 1440px OLED header were inspected; 7 focused tests, lint and typecheck pass. Catalog now maps 84 components. Page captures predate this shell extraction and need final refresh.

- Tablet Light gallery: captured 12 initial compositions at 744px/2×; inspected and fixed provider/category badge contrast and stock-search ARIA semantics. Phone follow-up centralized pending/Avatar colors and corrected generic metadata labeling. Real Home activation uncovered and fixed the absolute-change popup's focus/hover/click race; controlled popup targets were verified when opened. Detailed bounded evidence is in `appearance-visual-validation.md`; full raw/state/mode review remains pending.

- Phone visual checkpoint: captured six real page compositions in all three modes at 390px/2× and inspected six representative raw screenshots. Corrected Light contrast in financial changes, Analysis amounts and account status badges through shared semantic tokens. All 18 recaptured page audits have zero confirmed violations; Home/Transactions incomplete checks still require manual review. Evidence and remaining scope are recorded in `frontend/docs/appearance-visual-validation.md`; the six-panel annotated checkpoint is in the visualization directory. This is not the completed full matrix.

- Full frontend checkpoint: 566 tests across 87 files pass, along with typecheck and the styling color ownership check. Subsequently corrected dashboard fixtures: Day has unique daily endpoints, all longer periods have distinct spans, and summary/account/graph amounts reconcile. Nine added fixture tests and typecheck pass. These data checks improve graph inspection reliability; they do not replace the outstanding visual matrix.

- Rule application preview/application fixtures now protect manual assignments and support exact amount matching. The 390px Dark browser verified Matched 1 / Would update 1 / Skipped manual 0, then Updated 1 after applying to the synthetic accommodation transaction. No browser errors were reported. Lint passes with three existing warnings and the workbench static build passes. Recommendation/change-preview scenarios and the full visual matrix remain pending.

- Analysis/categorization rule fixtures now support create/edit/archive/restore, category scope/view resolution, condition preservation and revisions. Three added tests bring the workbench suite to 28 passing tests. Typecheck, lint (three existing warnings) and workbench build pass.
- Real 744px Light browser verified analysis edit/save/archive/restore and categorization edit/save with no reported runtime errors. Browser closed. Rule previews/application/recommendations and recomputation of analysis fixtures remain incomplete; this does not close full rule/composition coverage.

- Transaction bulk fixtures now support assignment/clearing and Undo, preserve manual records, validate complete selections before mutation and restore assignment metadata. Four new tests cover these behaviors, unavailable undo targets, per-instance isolation and deliberate write failures. The workbench suite now has 25 passing tests.
- Phone browser verified provider selection, bulk save, selection reset and Undo restoring both the fixture store and rendered category. The notification's entry animation must settle before automated Undo clicks; the initial immediate click was not a valid mutation check. Browser closed. Typecheck, lint (three existing warnings) and workbench build pass. Rule-management fixtures and the final matrix remain incomplete.

- Recurring/access fixtures now support schedule create/update/pause/resume/archive and token create/reveal/revoke, with isolated stores and deliberate failures applied before mutation. Monthly dates are deterministic; no scheduler runs and revealed tokens are explicitly invalid workbench strings. Three new tests cover lifecycle round trips, isolation and failed-write integrity.
- OLED phone browser verified token reveal/revoke and schedule pause/resume/edit/save, with the edited merchant visible after refetch and no horizontal overflow or reported runtime errors. Browser closed; normal servers left running. Current workbench suite: 21 tests pass; typecheck, lint (three existing warnings), token guard and static workbench build pass. Rules, transaction bulk fixtures and full mode/viewport validation remain incomplete.

- First-paint evidence is now recorded in `frontend/docs/appearance-first-paint-validation.md`. With application scripts disabled by CSP, development and production render authenticated Dark/sage Home and anonymous custom Light/OLED landing pages with the same computed canvas as after hydration. Home's 18px heading/header/width also match. A conflicting anonymous-format cookie cannot override the authenticated saved appearance in the development SSR check.
- Production Home → Settings navigation retains all seven enabled stylesheet links and the correct canvas. Temporary browser/proxy/production-preview processes were closed; app/workbench remain running. This is bounded evidence, not completion of the final route/mode matrix or stale-client recovery exercise; repeat on the final build.

- Token audit now includes a current source disposition table for geometry, type, motion, layers and responsive rules across the component families. Historical literal counts are explicitly labeled as pre-adoption counts.
- Removed unused desktop/mobile category-option CSS after verifying both callers use `CategorySelect`. Metadata popovers now consume the shared border role. Remaining 44px target/48px compact input values in account dialogs, date control, Settings tabs, inline balance, positions editor and loading placeholders now use the same foundation source in JS and CSS; domain table/diagram geometry remains local with documented reasons.
- Verified the phone positions editor still has a 44×44 remove target, no horizontal overflow and no reported runtime errors. All 21 existing transaction/mobile-list/positions-editor tests pass. Typecheck, lint (three existing warnings), token guard and workbench build pass at this checkpoint. Broader visual/fixture/first-paint work remains pending.

- Category fixtures now support create/update/archive/restore/search and bulk duplicate/primary/archive operations, including conflicts and partial results. Four tests protect these flows and historical transaction labels. Real browser verified phone create/archive/restore and desktop category rendering.
- Page examples now provide Mantine AppShell/Main height/padding constraints and load the production table stylesheet. This fixes invisible desktop tables and incorrectly styled sort controls in the gallery.
- Lifecycle status colors are centralized as accent-independent foreground/background pairs. Pure contrast checks cover all tested modes/seeds; the Light desktop Categories axe audit now has zero violations/incomplete checks (previously Active labels measured 3.66:1).
- Latest validation: 60 focused appearance/workbench tests pass, frontend typecheck/lint/token guard and production app build pass. Lint retains three existing warnings. Browser session closed; no servers stopped. Full final visual coverage remains incomplete.

- The registry now contains 35 examples, including the real six route compositions, account dialogs and lifecycle/session states. All 83 catalog entries map to examples. An AST-based inventory test checks exported JSX components under `src/components`; this proves registration coverage, not complete visual or interaction coverage.
- Workbench-only boundaries isolate memory routing, session/query/presentation state, appearance persistence, login, notifications and PWA operations. Browser inspection verified an OLED Settings preview/save uses no cookies or local-storage keys.
- Manual transaction fixtures now round-trip creation, editing, reporting-date override/reset, category selection and deletion, including date/category/sign filtering. Six fixture tests cover store isolation, response isolation, protected provider records, rejected unknown/external requests, failed-write integrity and cancellation. Other Settings and bulk mutation fixtures remain incomplete.
- Phone browser verified the real transaction details → edit → save flow: the updated merchant appears in the list after invalidation/refetch, with no reported runtime errors. The validation browser was closed; development servers were left running.
- Current checks: 14 workbench tests pass; TypeScript, token ownership guard and standalone workbench build pass. Lint has no errors and three existing require-await warnings. Full responsive/appearance matrix, complete fixture interactions, production first-paint checks and final contact sheet remain pending.

### Earlier implementation checkpoints

- Initial standalone workbench: 19 examples, shared production CSS/media expansion, isolated comparison documents, fail-closed fetch/XHR transport, mode/accent controls and token inspector. Full page providers/mocks and catalog coverage remain pending.
- First centralization pass: shared Mantine defaults extracted; semantic list/table/surface roles, motion, chart appearance, shared touch dimensions, and named global layers adopted. Remaining categories, app shell/PWA, settings and other audited consumers remain pending.
- New pure resolver: 42 tests covering curated/extreme accents, readable text/action/focus/graph, OLED and neutral invariants, seed normalization, and status independence. At this initial checkpoint settings still used the old contract; the later appearance contract checkpoint below replaces it.
- Nested DateRangeControl/EditorModal: viewport-clipped picker and double Escape dismissal fixed; five date-range tests pass, including the nested regression; browser confirms the editor remains open.
- Frontend lint passes with three pre-existing require-await warnings; typecheck and standalone workbench production build pass. Full app production build and all 531 frontend tests (77 files) pass. A production-output scan found no workbench entry/fixture/transport markers; full browser matrix and contact sheet remain pending.

### Appearance contract evidence (2026-09-06)

- New schema and atomic merge replace `theme` with `appearance`; the generated client contains only the new models. API source ordering was preserved during regeneration to avoid unrelated generated churn.
- `ReplaceAppearanceSettings1788728000000` resets appearance, removes theme, preserves unrelated nested/unknown fields, handles empty and JSON-null documents, and updates the SQL default. The migration passed in isolated PostgreSQL schemas and has been applied to the local development database.
- 74 focused backend settings/service/controller tests and 12 PostgreSQL migration/concurrency/ownership tests pass. Backend lint and typecheck pass.
- Settings now provides three modes, native radio swatches, custom hex/picker, neutral, reset and Cancel. Invalid custom drafts block saving and cancel cleanly. Provider tests cover SSR tokens, authenticated precedence, account changes and cross-tab updates.
- All 537 frontend tests (79 files) and the app production build pass at this checkpoint. The full final browser matrix, production first-paint checks, and contact sheet are still pending.
- Real phone browser: Home renders with accent graph and quiet header. Saved OLED/neutral survived full navigation; computed canvas/header were black and `theme-color` was #000000. Restored Dark/sage afterward. A real old-format settings PATCH returned 400; the current response contains appearance and no theme field.
- Release ordering and irreversible reset recovery are documented in `frontend/docs/appearance-release.md`. No production deployment performed. Local app/backend remain running; validation browser closed.

### Workbench and token adoption checkpoint (2026-09-06)

- Added six real compositions: account summaries, account edits/archive/balance, status/provider controls, investment holdings/activity, brokerage positions, and category/rule inputs. The gallery now has 26 examples; full page/provider coverage remains pending.
- Added a workbench-only generated-client request adapter, per-frame QueryClient and cloned stores, deliberate read/write failures, latency and cancellation. Four transport fixture tests prove store isolation, failed-write integrity, unknown/external endpoint rejection and cancellation. Two registry tests verify existing catalog URLs/component names/selectable states.
- Added the static workbench and token ownership guard to CI, including workbench/scripts changes in frontend path detection. Full production exclusion verification remains pending after the final gallery is complete.
- Removed obsolete transaction category appearance classes, adopted semantic account dividers and overlay backgrounds, and reused Mantine status/radius roles. Restored visible keyboard chart focus.
- Phone browser checked account balance save, investment holdings/activity, and category popovers. These surfaced and fixed bright account dividers, long-name squeezing, long category option clipping and unintended horizontal option scrolling. Native arrow-key selection is preserved; the closed OLED category gallery reports zero axe violations/incomplete checks. Final all-mode/all-viewport validation remains pending.

- Checkpoint validation: all 543 frontend tests (81 files) pass, including workbench fixtures/registry and existing Settings/table/chart coverage. Typecheck, color ownership guard and workbench build pass. Final matrix and complete page coverage are still pending.


### Chart workbench checkpoint (2026-09-06)

- History uses consistent exact-money dashboard fixtures and exposes loading completion/replay and retained-error Retry. Real phone checks cover OLED loading completion, Light empty/masked-single, and Dark error recovery; the retained-error screenshot was inspected. Existing chart/dashboard/registry suites pass 23 tests.
- Keyboard focus/ArrowRight kept single-point values masked but did not expose an inspection tooltip. Keyboard chart inspection remains unverified and needs investigation; this checkpoint does not close the full interaction matrix.
- Removed the stale UI-conventions reference to the deleted theme module. No production deployment or commit performed.


### Keyboard chart inspection checkpoint (2026-09-06)

- Resolved the previous chart keyboard gap: focus/arrow selection updates the exact-money headline, Escape/blur clears it, and decorative loading remains noninteractive. Real Light reduced-motion and OLED masked single-point/yearly checks passed; screenshot inspected and browser closed.
- Chart tests pass 13 cases; typecheck, lint (three existing warnings), token guard and production build pass. Full visual/state matrix and final first-paint/release validation remain pending.


### Holdings workbench checkpoint (2026-09-06)

- Replaced the isolated no-op holdings save with real AccountModal + nested editor backed by the per-frame portfolio store. Browser verified Dark tablet edit/save/refresh and Light phone failed-save draft preservation; four investment fixture tests plus three registry tests pass.
- Typecheck, lint (three existing warnings) and workbench build pass. Raw Light error screenshot exposes a bright alert title requiring contrast review; this and the complete visual/state matrix remain pending. Browser closed; no production changes or deployment in this checkpoint.


### Semantic alert checkpoint (2026-09-06)

- Shared light-variant semantic alerts now consume contrast-safe status pairs; the measured holdings title improves from approximately 2.92:1 to 4.51:1. Status gallery includes error/warning/success/neutral alerts and passes Light/Dark/OLED audits at 744px with zero violations/incomplete checks.
- Existing 42 resolver tests, typecheck, lint (three existing warnings), token guard and workbench build pass. Nested holdings generic aria-label and collapsed combobox relationship remain accessibility review items, alongside the broader validation matrix. Browser closed.


### Investment accessibility checkpoint (2026-09-06)

- Compact holdings/activity lists now have named region roles. Closed stock search retains its hidden dialog target; a direct browser DOM probe confirms its controls relationship. Escape from the search input or focused result preserves both parent dialogs.
- Six editor tests, typecheck, lint (three existing warnings) and workbench build pass. Browser audit has zero violations and two incomplete checks (hidden target resolved by DOM probe; overlapping parent heading remains contextual). Browsers closed. Full validation remains pending.


### Token source review and full-suite checkpoint (2026-09-06)

- Centralized remaining consumer mode-specific validation and rule-badge colors. Added accent-independent info alert colors; expanded resolver contrast checks cover the new roles. Application consumers now contain no light-dark/color-mix expressions; standard Mantine variants and domain palettes retain documented ownership.
- All 589 frontend tests across 92 files pass. Typecheck, lint (three existing warnings), token ownership guard, app build and workbench build pass. Light/yellow info gallery and OLED/white validation audits have zero violations/incomplete checks; browser closed.
- Updated audit dispositions, including Chart initialization's local measurement delay. Full visual/state coverage, final first-paint/release checks and contact sheet remain pending; this checkpoint does not close those gates.


### Production first-paint repeat (2026-09-06)

- Current production build reproduces saved Dark/sage and anonymous custom Light/blue and OLED/magenta colors before JavaScript, with identical hydrated canvas/meta. Conflicting anonymous cookie cannot override authenticated server appearance. Evidence is in `appearance-first-paint-validation.md`.
- Home → Settings navigation did not produce a confirmed destination in the captured measurement and the browser emitted an unlabeled error marker. This observation remains unresolved, not a passing navigation check. Both test browsers and temporary servers were closed; normal dev/workbench untouched.
- Old cached-client recovery, final navigation verification and full visual/state matrix remain pending.


### Navigation and development hydration checkpoint (2026-09-06)

- Confirmed production Home → Settings reaches the destination with all seven external stylesheets enabled and unchanged saved canvas/header/meta. Resolved the prior uncertain result; details are in the first-paint validation document.
- Identified the recorded error as a development CSS HMR timestamp mismatch. Root now uses a stable development stylesheet href while retaining production hashed assets. Fresh local login + refresh reports no browser errors and successful hydration. Typecheck/lint pass; browsers and temporary preview closed.
- Old cached-client recovery and complete visual/state delivery remain pending.


### Incompatible release recovery checkpoint (2026-09-06)

- Historical preset client Save changes fails against the new API without mutating settings. Switching the same local origin to the current build and reloading exposes modes/accents and restores saved Dark/sage. Explicit legacy PATCH returns 400; new-format PATCH of the saved appearance returns 200 with all settings unchanged.
- No browser errors. Historical/current previews, proxy and test browser closed; normal services untouched. The local release-recovery checklist item is verified. Full workbench visual/state coverage and final contact sheet remain pending.


### Full registered-state capture in progress (2026-09-06)

- Started current-registry Light/Dark/OLED captures at 744px, opening editors and triggering positions search states. Manifest, audit results, raw review notes and capture script are in `splice-theme-review/state-matrix/`.
- Light pass identifies 2.44:1 Retry labels and loading Chart aria-label role misuse. Inline save-icon contrast, Settings tab states and nested deferred overlays also need follow-up. Capture does not equal review; full visual gate remains open.
- Corrected stale README claims about already-implemented fixture mutations.


### Registered-state fixes and addressable overlays (2026-09-06)

- Completed the 216-case initial state capture. Six confirmed violations are fixed through shared semantic action foregrounds and loading-chart role semantics; all 15 targeted rechecks have zero violations. Original audits are retained. Raw fixed Retry/account-management screenshots inspected.
- Workbench editor now follows the production form/footer structure and blocks draft changes/dismissal while pending. Added directly selectable confirmation and deferred-overlay loaded/loading/error states, with actual loaded dialog ownership. Updated catalog and README.
- All 18 added overlay captures have zero violations/incomplete checks across Light phone, Dark tablet and OLED landscape; inspected representative raw error screenshots and phone pending footer. Escape from confirmation preserves its editor. Details and remaining scope are in `appearance-visual-validation.md`.
- Typecheck, three registry checks, lint (three existing warnings), and static workbench build pass. Prior action-token app/workbench builds and token guard pass. Browsers are closed; normal services remain running. Full review, remaining Settings combinations and final contact sheet remain open.


### Settings sections, badge correction and delivery artifact (2026-09-06)

- Added stable Settings section URLs and a gallery selector. All 36 populated/empty section captures select the intended tab without document overflow. Light Analysis exposed gray badge contrast; shared semantic light badge pairs fix it, and the failing view plus all-mode yellow gallery rechecks pass with zero violations/incomplete checks.
- Desktop visual review found Pending shrinking beside a long merchant name; shared status badges now retain their width. Recapture and DOM measurements confirm the complete label. Source ownership dispositions are reviewed and corresponding implementation checkboxes reconciled; broader visual gates remain unchecked.
- Built and inspected the 12-panel `splice-theme-review/delivery/contact-sheet.html` and 3840×12942 PNG from real 2× screenshots. Source images, annotations and scripts are preserved. Full-size detail and fit-to-screen inspections passed after relocating callouts away from labels.
- All 589 frontend tests (92 files), typecheck, lint (three existing warnings), token guard, app/workbench builds pass. Workbench section navigation verified; all named browsers closed. Normal services remain available. Older full matrix review and final requirement reconciliation remain unfinished.


### Editor and deferred-state review (2026-09-06)

- Added the addressable `validation-pending` editor scenario. Inspected all seven editor states and all six deferred states across Light, Dark and OLED: 39 captures, zero audit violations and zero incomplete checks. Evidence is in `splice-theme-review/overlay-review/`, including reviewed strips, raw captures and scripts.
- Settled phone checks confirm pending validation remains visible and Escape cannot dismiss the pending editor. Confirmation consumes the first Escape and restores focus within its editor; a second Escape closes the editor. Loading and failed deferred overlays remain dismissible. Checks wait for entry/exit transitions before measuring.
- All 35 examples now have an inspected initial-state view. The remaining 33 non-default states are being reviewed separately; this does not close the full visual matrix. Three registry tests, typecheck, lint (three existing warnings), and workbench build pass. Named browsers closed after checks.


### Registered states and manual accessibility review (2026-09-06)

- Completed capture and raw review of the remaining 33 registered state choices across all three modes at 744px: 99 screenshots, no document overflow, and zero confirmed axe violations. `remaining-review/manifest.json` records reviewed captures; original audits retain incomplete classifications. Stock empty/error views were exercised through their real search input.
- Inspected all 12 populated/empty Settings section combinations across Light phone, Dark tablet and OLED desktop (36 views), using the corrected Light Analysis capture. Layouts preserve readable long names, responsive list/table treatments, quiet headers and contained controls. These complement prior interaction checks; screenshots are viewport captures, not claims of full scroll coverage.
- Resolved the outstanding sampled row/avatar contrast findings through live computed-color measurements in `manual-a11y/`. Account rows, retained-error rows and transaction rows/avatar initials were measured in all three modes. Minimum text contrast was 4.94:1; inspected ancestors had no opacity or background-image layers that invalidate the calculation. The row hit area is transparent. Stock headings under the open search portal are occluded; their unobscured text/background pairs also exceed 4.5:1.
- Expanded ChangePercentPopover and stock-search controls resolve to visible `role=dialog` targets in every mode. Disabled stock search retains its hidden dialog target. These settle the corresponding original audit uncertainties; they do not alter the stored automated results.
- All registered examples and state choices now have raw visual evidence. The remaining validation scope is palette/extreme-color matrix reconciliation, final persistence/first-paint evidence reconciliation, and overall acceptance review. No production code changed during this checkpoint; validation browsers closed.


### Final acceptance reconciliation (2026-09-06)

- Completed and inspected the final palette matrix: 60 Controls/Status captures and 30 Home captures across Light/Dark/OLED, neutral plus all four swatches, and black/white/yellow/saturated-blue/gray custom seeds. Curated Home views use 1133px, Controls/Status 1440px, and extremes 390px. All have zero confirmed axe violations and no document overflow. All 30 three-mode strips were inspected; `palette-final/` and `home-palette-final/` retain raw screenshots, manifests, audits and scripts. OLED remains black, headers remain quiet, and semantic/provider colors remain independent. Home's two automated incomplete categories remain recorded as such; the corresponding transparent-row contrast and popup relationships were manually checked in the earlier accessibility checkpoint, rather than relabeled as automated passes.
- Together with the 744px registered-state review, responsive Settings captures, loading/editor/deferred reviews and documented live keyboard/portal/morph/retained-error checks, this completes the planned component and palette matrix. Existing 42 resolver tests cover contrast across curated and additional extreme seeds; meaningful behavior tests protect exact-money, masking, focus, drafts and interaction contracts. This is representative responsive and color-sensitive coverage, not a claim to exhaust every possible Cartesian combination.
- Added the three nonvisual component-adjacent helpers to the catalog, with their consumer coverage and behavioral test references. All 84 rendered components remain connected to real examples. The workbench uses isolated fixtures and remains independent of the backend; its boundary and registry tests pass in the full suite.
- Final production build first-paint repeat passed: custom Light/blue and OLED/magenta, saved Dark/sage in a fresh authenticated browser, and a conflicting OLED browser cookie. Server-only HTML and hydrated styles/meta agree; React attachment is absent/present as expected. Browser errors are empty. `final-paint/results.json` and its script preserve measurements. Prior actual Save/navigation, provider cross-tab/account changes, Settings save/failure/cancel tests and real PostgreSQL ownership/persistence checks supply the remaining persistence evidence. No preference was changed during this final repeat.
- Final frontend suite: **590 tests across 92 files pass**. Frontend typecheck, lint (zero errors, three existing require-await warnings), token guard, production build and static workbench build pass. Backend lint/typecheck pass; the recorded 74 settings-contract tests and 12 real PostgreSQL migration/settings tests pass. Final production scan checks 2,158 JS/MJS/HTML files including packaged dependencies and finds no fixture identifiers. Logs use `/tmp/splice-theme-final-*`; prior database logs are `/tmp/splice-appearance-{contract,postgres}-final.log`.
- Audit dispositions match the current checkout. Its “First adoption pass” records the intermediate legacy-role mapping and subsequent removal; no legacy adapter is restored. Approved Home geometry, mobile input sizing and local domain exceptions are documented. Unrelated pending account/bank-link work remains untouched and unstaged.
- Local app remains at `http://localhost:4000`, workbench at `http://localhost:4001`. Temporary production/proxy processes and named validation browsers were closed. No commit, push or deployment was performed. No known material implementation defect remains open.
