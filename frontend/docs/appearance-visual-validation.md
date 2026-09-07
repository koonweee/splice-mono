# Appearance visual validation

Final status: the planned validation is complete. Earlier “remaining” sections are historical checkpoints, superseded by the final acceptance reconciliation at the end. Automated incomplete results remain preserved; manual follow-up is identified separately.

Status: in progress. This records inspected evidence, not completion of the full
component, accent, viewport and interaction matrix in the implementation plan.

## Phone page checkpoint — 2026-09-06

Captured Home, Accounts, Transactions, Analysis, Settings (General), and Landing
from their real workbench page compositions in Light, Dark and OLED. Each capture
uses synthetic fixtures, sage accent, a 390 × 844 CSS-pixel viewport, 2× device
scale, and reduced motion. The workbench page frame omits the navigation header;
these captures do not validate the production header or navigation.

Artifacts are in:
`/Users/jtkw/.codex/visualizations/2026/09/06/01a07786-1bbf-7880-8634-0d91a397310b/splice-theme-review/`.

- `screens/`: 18 page/mode screenshots.
- `*-a11y.json`, `*-snapshot.txt`, `*-errors.txt`: corresponding browser evidence.
- `phone-manifest.json`, `phone-contact-sheet.html`, `phone-contact-sheet.png`:
  six-panel annotated review checkpoint, rendered at 2600 × 4277 pixels.

Raw screenshots inspected: Light Home, Accounts, Transactions and Settings;
Dark Home; OLED Analysis. The contact sheet was also inspected at fit-to-screen.
Remaining raw captures still need visual review; capture alone is not signoff.

### Findings corrected

- Light Home's change percentage used Mantine teal text, failing contrast.
  `getChangeColorMantine` now returns the shared positive/negative roles for Home
  and account changes. The Light financial colors were darkened slightly to meet
  4.5:1 across canvas, raised, muted and control surfaces, including extreme seeds.
- Unselected Home period labels now use the readable dimmed text role.
- Light Analysis's net flow also used Mantine teal. Financial labels, directional
  indicators and aggregate graph colors now consume the shared financial roles.
- Manual account badges failed Light contrast at 2.95:1. Account status badges
  now consume paired semantic status foreground/background roles, including a
  centralized danger pair for connection errors.

The recaptured 18 page/mode audits report zero confirmed axe violations. Home
retains incomplete checks for unmounted popover targets and occluded row/control
contrast. Transactions retains incomplete checks for labels on generic metadata
containers and occluded contrast. These require manual resolution; zero confirmed
violations is not an accessibility signoff. Browser error logs were empty.
One OLED Analysis capture overlapped a Vite stylesheet update and showed black
text; a fresh navigation after the update produced readable text and a clean
audit. The replacement screenshot was inspected. Do not use the transient image.

Focused verification after these fixes: 42 resolver contrast tests, 25 formatting
tests, 5 NetWorthCard tests, and the Analysis route/Sankey tests pass. Lint passes
with three existing warnings; typecheck and token ownership checks pass.

## Remaining matrix

### Tablet gallery and phone follow-up — 2026-09-06

Captured 12 Light/sage examples at 744 × 1000 CSS pixels and 2× scale:
appearance, controls, status-colors, rows, editors, history, account-dialogs,
account-management, positions, investments, category-inputs and page-settings.
Files use the `*-light-744` prefix in the same artifact directory. These captures
show each example's initial state; closed editor buttons do not count as inspected
open dialogs. Raw status-colors, positions and category-inputs screenshots were
reviewed after their fixes; the other raw tablet captures await visual review.

Corrections from this batch:

- Transaction metadata now uses a named group rather than an aria-label on a
  generic div. The pending badge uses the shared warning pair; obsolete unused
  review-badge CSS was removed.
- Shared Avatar placeholder styling now uses the secondary foreground and avatar
  surface. Direct computed-color measurements in Light phone transactions improved
  initials from 2.95:1 to 5.45:1. Measured names, amounts and metadata ranged from
  5.03:1 to 13.95:1. Transparent row actions explain axe's inability to determine
  those backgrounds; this measured sample does not clear every row/mode/state.
- Provider badges retain their pink/violet/orange identities through paired,
  accent-independent provider tokens, with 4.5:1 contrast tests. Category scope
  chips reuse the neutral status pair. The recaptured status-colors and
  category-inputs audits have zero violations and zero incomplete checks.
- Stock search now declares its combobox role, making the popup's aria-expanded
  attribute valid. The positions audit has zero violations; its unmounted popup
  reference remains an incomplete check until its open state is inspected.
- Home's absolute-change popup previously opened on focus/hover then closed on
  the same click. Pointer activation now explicitly opens it; keyboard activation
  toggles it, and blur dismisses it. A real browser confirmed the first click
  leaves it expanded and its controlled popup exists. The More periods menu also
  mounted its referenced target and exposed 3Y, 10Y and All; Escape was exercised.

These updates supersede the pending badge and avatar colors in the earlier phone
contact sheet. Retake affected screenshots for the final delivery artifact.

## Outstanding validation

### All-mode initial catalog capture and shared shell

All 35 example IDs now have initial-state captures and axe reports in all three
modes at 744 × 1000 CSS pixels, 2× scale (105 captures). They use sage and reduced
motion. All reports have zero confirmed violations; incomplete checks remain.
Browser error logs are empty. Additional raw screens inspected in this batch:
Dark loading-home, OLED loading-account-add, and Dark account-dialogs. Most raw
captures still require visual review, and nested/lazy components need interaction.

After those captures, extracted the production header/navigation/Main into
`AppShellLayout`, used by both the authenticated route and workbench pages. This
closes the earlier missing-header coverage gap without copying its markup or CSS.
Session ownership and route preparation stay in the authenticated route; preview
logout only displays a local notification. Collapsed navigation is now inert and
aria-hidden, preventing keyboard access to offscreen links. The shared shell has
a regression test for menu visibility and navigation preparation/logout callbacks.

Real browser checks verified opening navigation, following Settings, and closing
the menu on selection at 390px. Header screenshots were inspected at 390px Light
and 1440px OLED (`shared-shell-light-390.png`, `shared-shell-oled-1440.png`). These
show the canvas-matched header and faint divider. The phone screenshot precedes
the final logout icon foreground adjustment. Page screenshots from the 105-capture
batch precede shell extraction and must be refreshed for the final delivery sheet.

Before shell extraction, the full frontend suite passed 576 tests in 89 files;
production and workbench builds passed. No known fixture identifiers were found
in the production JS/MJS/HTML output. After extraction, the shared-shell, auth
route and registry tests pass (7 tests), with lint (three existing warnings) and
typecheck passing. Workbench build is checked separately at this checkpoint.

## Remaining requirements

### Nested controls — 2026-09-06

Real interaction checks found and corrected three issues that initial screenshots
could not reveal:

- Brokerage stock search now supports Arrow Down into its result buttons, retains
  the popup while focus moves among results, returns focus to search on Escape,
  and restores search focus after selection. In the 744px Dark browser, Arrow
  Down focused Add EXM, Tab reached Add ZERO, and Enter added ZERO with quantity 1.
- A phone date drawer inside an editor previously let Escape close both layers.
  It now isolates Escape from Mantine's ancestor capture listeners. In the 390px
  OLED browser, Escape closed the drawer and focused Choose date range; a second
  Escape closed the editor. Desktop and mobile regression cases both pass.
- A confirmation above an editor could dismiss the underlying editor on Escape.
  The confirmation now isolates its key handling and still blocks dismissal while
  pending. The browser verified that Escape preserves the editor below it.

Inspected and corrected the nested screenshots as well: the compact date trigger
no longer grows vertically in a column layout, and action footers use the overlay
surface rather than a black canvas rectangle. Updated native 2× screenshots are
`screens/editor-date-oled-390.png` and `screens/editor-confirm-oled-390.png`.

The affected date, confirmation and stock-search suites pass 17 tests. Lint
passes with three existing warnings and typecheck passes. These checks cover the
named combinations; the remaining mode/viewport/state matrix is still open.

## Still to verify

Complete all catalog examples and meaningful states, remaining accents/custom
extremes, 744/1133/1440px layouts, overlays, keyboard/focus, motion and production
app comparisons. Recover the old-theme baseline separately and label its revision.
The phone checkpoint is not the final delivery contact sheet.

## Curated/extreme palette and choice-control checkpoint

Completed the 45-capture sweep: Home at 1133px and Controls at 1440px,
Light/Dark/OLED × neutral/sage/blue/plum/clay, plus Controls at 390px,
all modes × black/white/yellow/saturated blue/gray. All 45 audits have zero
confirmed axe violations and empty browser-error logs. Home contributes 30
incomplete checks across its 15 captures; these are not counted as passes.
Raw screenshots inspected at this checkpoint: Light/clay Home, Dark/plum
Controls, Light/yellow Controls, and OLED/saturated-blue Controls. Remaining raw
matrix/state reviews are still pending.

That inspection exposed unchecked choice boundaries that blended into dark
surfaces. Checkbox/radio borders and off-switch boundaries now consume the same
control-border token as text inputs. Selected switch thumbs and labels use
Mantine's contrast calculation for their actual color; off thumbs use neutral
text. The workbench Controls composition now includes unchecked, checked,
indeterminate, radio, switch and disabled states. Disabled/error styling remains
owned by Mantine.

Real 390px checks verified checkbox toggling, radio selection and switch toggling.
Rendered Light/yellow unchecked checkbox/radio boundaries measure 3.03:1 against
the canvas and 3.29:1 against their fill. OLED/white measures 5.14:1 and 3.96:1.
The selected white switch thumb measures 21:1 against its track; Light off-switch
thumb contrast improved from 1.30:1 to 11.85:1. Light/default and Dark/pending axe
checks report zero violations or incomplete checks. These are bounded measured
samples, not proof of the full control-color matrix.

Reviewed screenshots in `splice-theme-review/screens/`:
`choice-controls-oled-white-390.png`, `choice-controls-light-yellow-390.png`,
`choice-controls-dark-pending-390.png`. Earlier immediate captures contained
unsettled inherited text; OLED and Dark captures were replaced after waiting
for the client-rendered workbench to settle. All capture automation must wait
for rendering before taking the screenshot. The original 45-capture sweep did
wait 700ms per frame and predates the expanded Controls composition.

45 focused resolver/registry tests and typecheck pass. Final full suite, raw
review, remaining fixture interactions and release recovery are still pending.
The browser session was closed; app/workbench servers remain running.

## Recommendation workflow checkpoint

At 390px Light, the real Settings categorization panel now supports deterministic
recommendation generation, nested preview, accept, regenerate and dismiss through
the isolated fixture adapter. Acceptance increases the visible rule count while
leaving transactions unchanged (also covered by the fixture tests). No model,
background scheduler, real API or persistence is involved.

The preview initially allowed its parent drawer to consume Escape. The drawer now
suspends focus trapping and Escape while its preview is open. The browser verified
first Escape closes the preview and retains the drawer, then dismissal and second
Escape return to Settings. The component test now asserts both dismissal steps.
A low-contrast Priority badge was moved to the shared neutral status pair; the
settled phone categorization page then reports zero axe violations or incomplete
checks and no browser errors.

`recommendation-preview-light-390.png` was captured and inspected; it predates the
Escape ownership fix, which does not change its layout. The long transaction name
wraps and the modal scrolls to its actions. Mode/width variants and generation
failure/pending browser states are still pending. The browser was closed.

## Manual portfolio fixture checkpoint

At 744px Dark, created a synthetic USD brokerage through Accounts → Add account
→ Manual → Brokerage (holdings), selected EXM and entered quantity 2. The real
mutation closed the editor and refetched the list with `Review portfolio`, with
no reported browser errors. Captured and inspected
`splice-theme-review/screens/portfolio-created-dark-744.png` including its local
success notification. The browser was closed.

The adapter now registers new account reads and supports local holdings create,
replace and fixed-price refresh. Exact totals, readback, rejection before mutation
and store isolation are tested. The complete workbench suite at this checkpoint
passes 46 tests in 12 files. The holdings edit/refresh browser flow, remaining
states, mode/viewport combinations and final contact sheet are still pending.


## Chart scenarios checkpoint (2026-09-06)

History now uses the dashboard fixture series and exact-money formatters, so the
headline, plotted coordinates and tooltip payload use the same units. It exposes
ready/loading/empty/single/refresh-error states. Finish loading and Replay loading
allow inspection of the real Chart placeholder transition; retained errors wrap the
chart in DataState and Retry clears the simulated failure.

At 390px, real-browser checks verified OLED loading → exact loaded balance,
Light empty history, and Dark retained-error → Retry. The raw
`history-refresh-error-dark-390.png` screenshot in the review artifact directory
was inspected: graph and period controls remain visible with the bounded alert.
The Light masked single-point example retained masking after focus/ArrowRight,
but no inspection tooltip appeared. This does **not** establish working keyboard
chart inspection; investigate that interaction before closing the matrix. Browser
errors were empty at the empty-state checkpoint; the named browser was closed.

The existing chart, dashboard fixture and registry suites pass 23 tests. These
checks cover the underlying behavior and registry, not every new example state.
Full mode/viewport/state review remains pending.


## Keyboard chart inspection follow-up (2026-09-06)

Resolved the preceding keyboard-inspection gap. Recharts handles keyboard selection
without firing its pointer movement callback. Chart now activates inspection on
focus and relevant keys, and its tooltip reports the exact selected point through
an effect for keyboard interaction. Escape, blur, loading and existing pointer
cleanup clear inspection. No decorative loading values are reported.

Real 390px Light/reduced-motion checks verified ArrowRight changes the headline to
$123,457,570.38 with Aug 11 in the tooltip, and Escape restores the latest balance.
OLED masked single-point inspection shows only the date; changing to Y exposes
Sep 6, 2026 while preserving masking. The raw
`history-keyboard-masked-oled-390.png` was inspected: focus boundary, point and date
are visible. Browser errors were empty; the named session was closed.

All 13 chart tests pass, including new keyboard selection/dismissal and decorative
loading guards. Typecheck, lint (three existing warnings), token ownership check
and production build pass. This verifies the specific interaction, not the full
remaining visual/state matrix or final production first-paint checks.


## Holdings composition checkpoint (2026-09-06)

The holdings dialog scenario now mounts real AccountModal with an isolated manual
portfolio. Its nested editor uses generated API hooks, search, save, query
invalidation and refresh through the fixture transport, including failure/latency.
The old no-op save callback is removed. No historical percentage is fabricated
for the new scenario.

At 744px Dark, changing EXM quantity 2 → 3 updated both holdings and account balance
from $92.67 to $139.01; refresh retained the reconciled result. At 390px Light with
500ms latency and write failures, quantity 4 remained in the editor with an error
and the underlying account remained at $92.67. Browser errors were empty and the
named browser was closed. `holdings-save-error-light-390.png` was inspected at raw
resolution: layout and draft are visible, but the bright error title needs a
contrast audit before this state can be considered fully validated.
`holdings-edited-dark-744.png` predates removal of the unrelated percentage fixture
and is not a final capture.

Seven focused fixture/registry tests pass; typecheck, lint (three existing warnings)
and workbench build pass. Remaining full state/mode review is not complete.


## Semantic alert contrast checkpoint (2026-09-06)

Measured the holdings error title at rgb(250,82,82), 14px, over a 10% red alert
fill. On its light surface this is approximately 2.92:1, despite the nested-dialog
axe audit reporting zero confirmed violations (three incomplete checks).
Shared Mantine Alert defaults now map light-variant red, yellow/orange,
green/teal and gray alerts to the existing danger, warning, success and neutral
foreground/background roles. Other color/variant choices retain Mantine behavior.
This fixes the semantic treatment centrally without recoloring financial data.
The same title now measures rgb(201,42,42) over rgb(249,229,229), or 4.51:1.

The status gallery now exposes all four semantic alerts. At 744px its Light,
Dark and OLED audits each reported zero violations and zero incomplete checks.
`alerts-light-744.png` was inspected; the holdings error screenshot was recaptured.
Browser errors were empty and the named session was closed. Existing 42 appearance
resolver tests cover these pairs across mode/accent combinations. Typecheck,
lint (three existing warnings), token guard and workbench build pass.

The nested holdings audit also identified a generic div with an aria-label and a
collapsed stock-search combobox whose referenced dropdown is unmounted. These
remain separate accessibility review items; the alert result does not close them
or the full validation matrix.


## Investment accessibility follow-up (2026-09-06)

Compact holdings and activity containers now expose named region roles, matching
the shared mobile-list convention. The stock-search popover keeps its hidden
dialog mounted so the combobox controls relationship remains valid while closed.
Focused input/results opt into Mantine's Escape isolation while search is open,
preventing the parent modal's window capture listener from dismissing the editor.

Real phone checks verified Escape from the search field and from a result button
closes search while both account details and the editor remain open. The audit
reports zero violations and two incomplete checks: hidden dropdown relationship
and the parent heading overlapped by the nested modal. A separate direct DOM probe
resolved the former: expanded=false, targetExists=true, targetDisplay=none,
targetRole=dialog. The prior generic aria-label finding is gone. No browser errors;
all named browser sessions were closed.

Six editor tests pass, including focus/selection and the retained controls target.
The delayed-results test now checks accessible visibility rather than requiring
DOM removal. Typecheck, lint (three existing warnings) and workbench build pass.
This does not complete the wider component/state or first-paint matrix.


## Remaining mode-specific consumer colors (2026-09-06)

Validation text now uses `--splice-error`, resolved for 4.5:1 contrast against
canvas, raised, muted and control surfaces. Rule badge text/background and blue
informational alerts now use accent-independent status pairs. This removes the
last application-consumer `light-dark` color choices while preserving semantic
identities. Existing 42 resolver tests now include the additional roles and error
surface comparisons.

The 744px Light/yellow status gallery (including the new blue info alert) and
OLED/white Controls error state both report zero axe violations/incomplete checks.
Browser errors were empty; the named browser was closed. Typecheck, lint (three
existing warnings), token ownership check and both production builds pass.
These bounded checks do not replace the remaining full visual/state matrix.

Full frontend regression checkpoint after this pass: 589 tests across 92 files pass (37.09s Vitest run).


## Complete registered-state capture pass started (2026-09-06)

A new pass derives all example/state combinations from the running registry and
captures each in Light/Dark/OLED at 744×1200, scale 2, reduced motion. Editors are
opened before capture; positions empty/error scenarios execute a search. Artifacts
and per-case audit counts live in `splice-theme-review/state-matrix/manifest.json`,
with the exact registry and capture script beside it. Raw review is tracked
separately in `review-notes.json`; capture is not a visual approval.

Initial Light findings: Retry text in rows error/refresh-error and history
refresh-error is 2.44:1 (#fa5252 on #f9d6d6). The loading Chart container has an
aria-label without a naming role. The inline balance Save icon also needs measured
non-text contrast. These are open findings to fix after the consistent capture
pass finishes; no passing full-matrix claim is made. Empty Settings currently
captures General only; data-backed tabs and nested overlays need explicit follow-up.


## Registered-state and nested-overlay follow-up (2026-09-06)

The 216-case 744px Light/Dark/OLED state capture finished without capture errors.
Its six confirmed violations were three Light Retry labels below contrast and
three loading Chart generic-element accessible names. Shared semantic Button /
ActionIcon variants now use separately contrast-checked control foregrounds, and
the loading chart has a status role. All 15 targeted rechecks have zero confirmed
violations; five retain incomplete checks requiring manual context. The original
matrix and rechecks are preserved separately in `state-matrix/`.

Raw fixed Light Retry and account-management captures were inspected: actions
remain readable, the long name truncates before independent row controls, and
there is no visible clipping. This does not mark all 216 images visually reviewed.
The earlier three manual review notes are preserved, with these follow-up notes.

Workbench Editors now uses the production semantic form/Stack/footer structure,
disables fields and dismissal while pending, and exposes three confirmation states
directly. Deferred overlays expose loaded/loading/error states directly and loaded
content owns the actual editor dialog. Catalog and README describe these states.
The original matrix predates these six added state choices.

The `compositions/` capture manifest contains 18 added cases: all six new states in
Light at 390px, Dark at 744px, and OLED at 1133px, all reduced-motion and sage.
All 18 have zero violations and zero incomplete accessibility checks. Inspected
raw Light deferred error and Dark confirmation error screenshots show readable
errors, contained actions, and visible focus. The phone pending editor was also
inspected: its footer stays at the bottom, every draft/action control is disabled,
and Escape preserves the draft. Escape from ready confirmation leaves the editor
open and returns focus inside it after the close transition.

Typecheck, three registry tests, lint (three existing warnings), and workbench build
pass. The prior shared action-token change also passed app/workbench builds and the
token guard. All agent-browser sessions are closed; normal services remain running.
Full raw/composite review, remaining Settings tab combinations and the final contact
sheet still need completion. These bounded checks do not close the full visual gate.


## Settings section coverage and delivery sheet (2026-09-06)

The workbench now exposes a Settings section selector and stable `tab=` URLs.
Thirty-six captures cover General/Notifications ready plus populated/empty
Categories, Analysis, Categorization, Recurring and Access in Light 390px,
Dark 744px and OLED 1440px. Every capture selects the intended tab and document
width equals viewport width. All audits have zero incomplete checks. One original
Light Analysis audit reported two low-contrast gray badge labels (Setting/Exclude,
2.74:1). Semantic light Badges now use centralized status pairs; its recheck and
three bright-yellow status gallery rechecks have zero violations/incomplete checks.
Original failing evidence is preserved alongside fixed results.

Inspected raw General and Categories phone screenshots, the fixed status gallery,
current Home in Light/blue, Dark/plum and OLED/sage, neutral controls, loading chart,
and the desktop transaction table. A long merchant name compressed Pending; shared
transaction status badges now resist shrinking. A direct browser probe reports
43px available and 43px content width, and the recaptured label is fully visible.
The table audit has zero violations. Workbench section selection updates the outer
URL and iframe URL; after rendering, the selected production Settings tab is Access.

The reviewed 12-panel annotated artifact is `delivery/contact-sheet.html` with a
3840×12942 PNG beside it. It includes modes, appearance controls, categories, pending
editor, nested confirmation, deferred error, semantic status, loading history,
neutral controls and desktop transaction density. The sheet was built with the
contact-sheet skill from 2× real synthetic workbench captures; crops only remove
unrelated continuation or blank area. Source images, capture scripts and manifest
are preserved. Fit-to-screen and native detail/table crops were inspected; callouts
were moved away from labels. All 12 images loaded and the sheet has no horizontal
overflow at its 1920px CSS capture width.

All 589 frontend tests in 92 files pass, including 47 workbench tests. Typecheck,
lint (three existing warnings), token guard, app build and workbench build pass.
The production asset scan found no workbench/mock/fixture markers. Normal services
remain running and the named validation browsers are closed.

The contact-sheet deliverable and Settings tab capture gap are now addressed.
Full per-entry review of the older registered-state matrix and final requirement
reconciliation remain open; this sheet is a curated review, not proof that every
possible interaction has been checked.

### Registered-state manual review follow-up

Reviewed three-mode strips for the initial states of appearance, account overview,
account management, Landing, Home, Accounts, Transactions, Analysis, Settings,
investments, positions, category inputs, account dialogs, PWA offline lifecycle,
and the session boundary. These 15 compositions retain consistent geometry across
Light, Dark, and OLED, with no unexpected clipping in the inspected captures.
This covers the first registered state of each named example, not every state in
the matrix. Strips are in `state-matrix/review-strips/`; the automated incomplete
findings are grouped in `state-matrix/incomplete-summary.json`.

A settled live DOM check on the Light Home frame confirms that the expanded
“More periods” button's `aria-controls` resolves to a rendered element with
`role="menu"`. An immediate post-click probe ran before the portal mounted;
that transient result is not a missing-target defect after rendering. This check
does not independently close the ChangePercentPopover or stock-search findings.

### Bulk selection with retained refresh error

Added `page-transactions / refresh-error` as a directly selectable workbench state.
Its controls change only the current fixture's transaction-list read behavior,
then invalidate the production transaction query. The page and its selection stay
mounted. A fixture test proves failure after a successful read, recovery with
unchanged data, and isolation from account reads and a second fixture instance.

The real browser selected the provider transaction, triggered the failure, and
restored reads in Light at 390 and 1440px, Dark at 744px, and OLED at 1133px.
Every case retained selection and loaded rows, removed the error after recovery,
and had no horizontal document overflow. All four screenshots were inspected:
the error notice does not cover the bulk controls. No browser errors were reported.
Audits have zero confirmed violations; row-overlay contrast checks remain marked
incomplete rather than being counted as passes. Evidence is in `bulk-refresh/`,
including screenshots, audits, the follow-up script, and measured results.

All 48 workbench tests pass, along with typecheck, lint (three existing warnings)
and the static workbench build. This change adds no production component code.
The validation browser was closed; app and workbench services remain running.

Also inspected the Controls, Rows, History, and Status colors three-mode strips.
Their layout review brings the first-state strip coverage to 19 of 35 examples.
The historical status strip predates the semantic badge correction; current badge
contrast evidence remains the later fixed status-gallery captures, not that strip.

### Complete loading-family review

Reviewing the loading strips exposed almost invisible shapes on raised Dark and
OLED cards. Mantine Skeleton's palette-index default now has explicit shared
base/highlight roles, resolved against page and card surfaces. These decorative
colors use modest visibility targets; they are not text or interactive controls.
The existing 1.8-second breathe foundation owns pulse duration. The workbench
reduced-motion override now disables animation instead of shortening an infinite
animation to 0.01ms.

Recaptured and inspected all 14 loading examples in Light, Dark and OLED at
744px/2×. All 42 screenshots show visible silhouettes with consistent geometry;
all audits have zero violations and zero incomplete checks. DOM measurements
confirm no horizontal overflow and `animation-name: none` for every skeleton in
the reduced-motion previews. A separate native-media browser check reports the
normal 1.8-second pulse, then `animation-name: none` with the browser's actual
reduced-motion preference. Browser errors are empty and both named sessions closed.

Evidence is in `loading-review/`: source captures, reviewed manifest, audits,
three-mode strips, and capture/build scripts. This supersedes the older loading
strips in `state-matrix/`. Together with prior first-state reviews, coverage is now
33 of 35 initial examples; other states and the two remaining initial overlay
examples still need reconciliation.

Resolver tests (42), typecheck, token ownership, lint (three existing warnings),
application build and workbench build pass after the correction. The backend
appearance contract suites also pass 74 tests, and the isolated PostgreSQL
migration/settings suites pass 12 tests. Inspection confirms that the controller
uses the authenticated principal, unknown update keys are rejected, old appearance
keys are not read, and migration preserves unrelated JSONB fields. Those bounded
contract and migration gates are now checked in the plan.


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
