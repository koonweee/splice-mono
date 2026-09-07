# Compact touch interaction audit

September 7, 2026. Scope: shared Mantine defaults, native/Pressable controls,
page actions, account and transaction rows, Settings forms, pickers, calendars,
charts, and menus. Inspected interactive JSX and CSS for small fixed sizes,
hover-only actions, nested row activation, and pointer/touch handling.

## Contract

- Compact layouts (up to 48em) and devices with **any coarse pointer** use the
  shared touch geometry. A wide touchscreen must not depend on phone layout.
- Buttons, icon buttons, close/navigation controls, menu items, options, tabs,
  calendar controls and segmented choices have at least 44px target height;
  individual targets are at least 44px wide. Larger existing widths remain.
- Control icons use 20px artwork; touch sizing does not enlarge status symbols,
  chart marks or checkbox/switch artwork. Text keeps its existing hierarchy.
- Inputs are at least 48px high with 16px text. Clear/reveal controls reserve
  an input section rather than covering the text. Compact numeric fields use
  typing/keyboard adjustment instead of tiny stacked spinner buttons.
- A choice's label and reserved padding activate the native input exactly once.
  Disabled controls remain disabled; row checkboxes do not open the parent row.
- Preserve normal fine-pointer desktop density. No invisible overlapping hit
  boxes, blanket padding increases or removal of keyboard focus styling.

44px is our product target, matching WCAG's enhanced target size criterion;
it is stronger than the 24px AA minimum (both have exceptions):
https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced
https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html

## Findings and resolution

| Surface | Finding | Resolution |
| --- | --- | --- |
| Shared buttons and icon buttons | xs/sm props bypassed touch sizing; icons varied | Minimum targets in shared CSS, compact 20px icons, retain larger widths |
| Menus and select options | Content-height rows were smaller than touch targets | Full 44px rows, including disabled items |
| Navigation, close buttons and tabs | Header Burger and logout inherited small defaults | Shared minimum targets, unchanged 60px app bar |
| Account row actions | Enlarging three inline icons severely truncated names | One touch action menu; original inline controls on fine-pointer desktop |
| Home range | 34px pills | Keep 34px pill artwork inside 44px targets; retain the 50px control row |
| Account section expand/collapse | Short text-only Pressable header | 44px target through shared Pressable styling |
| Absolute-change popovers | Small text target; fixed line-height parent | 44px target, vertically aligned comparison text, remove constrained parent line height |
| Choice controls | Root height alone did not make padding clickable | Native checkbox/radio activation from reserved padding, labeled switch body sizing |
| Clear controls / amount sign toggle | Small controls inside narrow input sections | Reserve 48px section for 44px target; stop clear-button mouse-down propagation |
| Multi-select removable pills | Small remove button | 44px remove target and pill height; visual text remains compact |
| Numeric spinners | Two stacked tiny controls | Hide on touch while preserving typed/keyboard input |
| Wide transaction tables | Date/category actions revealed only on hover | Always expose on touch; size metadata/sort controls independently from their icons |
| Calendar days | Small default day/navigation buttons on large touch devices | Shared 44px minimum; phone date entry retains its existing drawer/native fields |
| Interactive rows | Primary and secondary targets must stay independent | Existing sibling-button structure and press cancellation retained; padding regression tests added |
| Graphs | Continuous scrubbing must coexist with vertical scrolling | Existing pan-y and cancellation behavior retained; chart tap/drag smoke checked |
| Sankey diagram | Thin visual marks cannot each be enlarged safely | Existing labeled category buttons provide equivalent actions; do not inflate chart geometry |
| Color controls | Fine visual manipulation | Keep direct text color entry alongside picker, existing 44px appearance swatches |

Table column-resize handles and chart marks are continuous manipulation surfaces,
not ordinary buttons; this pass does not force 44px geometry on plotted data or
make resizing required to read table content. Inline prose links retain their
text layout. Decorative status icons are not inflated into action buttons.

## Maintained coverage

`/?example=touch-controls` compares shared controls in ready/disabled states and
can outline the actual target boundaries. It uses production components, not
mock buttons. Accounts, Home, Transactions, Settings, rows, editors and analysis
examples cover contextual combinations. Tests in
`src/lib/design-system/touch-controls.test.tsx` protect padding activation,
disabled behavior and row isolation; existing chart, row and picker suites cover
interaction behavior. Geometry is checked in-browser rather than CSS-string tests.

## Validation

- Chromium: 390px phone, Light Accounts, Dark Settings/Categories, OLED Home.
  No horizontal overflow or sub-44px visible button rectangles in inspected pages.
- Dedicated controls: Dark/Warm clay at phone and 1280px with true coarse-pointer
  emulation. Menu rows measured 44px, inputs 48px; checkbox padding tap toggled.
- Home: real touch tap and horizontal drag changed the selected point without
  runtime errors; original graph touch behavior was not rewritten.
- Wide touch Transactions: metadata/action targets meet 44px, hover-only actions
  are exposed. Source review includes compact list and independent row controls.
- This is browser emulation, not a claim of physical iOS/Safari device testing.

Follow-up audit findings: connection error/reauthentication badge details now open
on tap/click in a popover instead of depending on hover. AccountCard uses a minimum
height so larger absolute-change targets cannot overflow a fixed 94px card.

Final checks also covered the new account menu (Edit opens the existing rename
flow; Escape cancels), clear-button activation without opening a picker, the
320px OLED disabled composition, and click/Escape on connection error details.
Normal 1280px fine-pointer mode retains the existing compact control dimensions.

Calendar validation: Light/Slate blue, 1024px coarse-pointer viewport; day targets
measured 44×44px and the 369px popover fit without document overflow.
Typecheck, lint (three pre-existing warnings), token guard and app/workbench
builds passed. Full frontend run: 592 tests passed and 10 failed on selectors for
the preceding page-layout change. Updated those selectors without weakening the
workflow assertions; both affected suites passed on rerun (24 tests). The new
padding/account-menu tests and targeted chart/row/workbench tests also passed.
