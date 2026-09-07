# Tint surface audit — 2026-09-07

The Home period selector was present in history and page-home, but registered
loading/data states did not make hover/selected comparisons explicit. Component
coverage was not evidence of exhaustive interaction coverage. The new
interaction-surfaces example uses real components and ordinary pointer/keyboard
interaction to make these comparisons accessible.

| Surface | Finding and action |
| --- | --- |
| Account cards, Investment header, row hover, tables | Already consume tinted surface/control tokens. Raised cards now use 10% accent in Light/Dark/OLED; group headers keep the muted role. |
| Gray secondary buttons/action icons, including Home periods and shell actions | Shared the accent-independent neutral status palette. Use muted/hover interface roles; neutral badges remain semantic. |
| Menus and picker dropdowns | Use overlay and shared hover roles; explicit colored menu actions retain their own feedback. |
| Unselected navigation, tabs, close controls, calendar cells/navigation | Neutral hover defaults bypassed tint, particularly in Light. Use shared hover, preserving selected/disabled treatment. |
| Segmented controls | Light background/indicator were untinted. Use muted/selected surfaces and readable selected text. |
| Inputs, borderless Paper, modal headers | Light defaults used plain white/body surfaces. Apply control/overlay roles. |
| Financial gains/losses, lifecycle/provider/category badges, destructive/warning actions | Keep semantic identities. Gray action chrome is distinct from gray status identity. |
| Disabled controls, decorative resize handles, fallback analysis nodes/icons | Retain subdued neutral treatment. |
| OLED canvas | Keep true black; raised surfaces and feedback still tint. |

Personal accent mixtures now use a shared 1.25× strength multiplier. The hover
role mixes 10% Light / 12.5% Dark and OLED accent into the raised surface, weaker
than selected feedback. Neutral appearance retains its original strengths. The control role exposes the existing input surface.
The contrast matrix now checks text against the hover background.

Review entry: http://localhost:4001/?example=interaction-surfaces&mode=dark&accent=%23ce9a7e

Use ready/extended/disabled, warm/cool accents and Neutral in Light/Dark/OLED.
Compare M hover with selected Y, selected hover, More menu keyboard focus,
secondary actions, calendar, picker, tabs and segments. Use account-overview for
existing card/row surfaces. No fake hover CSS is used.

This audit is source-based. Automated validation is reported in the task;
no new browser interaction review is claimed.

## Base neutrality audit

The current foundations are cool grays, not achromatic neutrals. This was an
implementation mistake in the neutral-base-plus-accent design. Centralizing the
values did not remove their existing hue. Increasing tint strength masked the
problem rather than correcting it.

| Role | Light base | Dark base | OLED base |
| --- | --- | --- | --- |
| Canvas | #f5f6f7 | #191c21 | #000000 |
| Raised/card/overlay | #ffffff | #24282e | #111315 |
| Muted/group header | #edf0f2 | #20242a | #191c20 |
| Control | #ffffff | #2b3037 | #202328 |
| Text | #20252b | #e6e9ed | #e6e9ed |
| Dimmed text seed | #606975 | #a8b0bc | #a8b0bc |
| No-accent action seed | #626b77 | #a6adb7 | #a6adb7 |

Every nonblack/nonwhite entry above has a blue bias. Neutral accent currently
skips surface tinting but retains these cool bases, and its selected/action/focus
colors use the cool fallback seed. Borders, separators and loading/hover surfaces
inherit hue through surface and text mixtures. The dark palette also has a fixed
cool #858e9b shade. Mantine's stock gray palette is imported unchanged and is
cool; its default dark palette is retained in Light mode.

Other base owners: OFFLINE_COLORS repeats the dark canvas/text/dimmed colors and
feeds the offline page and PWA manifest. Semantic status/provider backgrounds
mix their own intentional colors over #191c21 in dark modes; their backing base
is also cool. The neutral status seed #868e96 has its own blue cast. Intentional
financial/status/provider/category colors and accent swatches are not neutrality
failures and should retain their identities.

Correction scope: define one achromatic base palette per mode (equal RGB
channels), preserving approximate luminance and surface hierarchy; derive both
appearance and offline values from it. Replace neutral action/text/palette seeds
as well as surfaces. Re-run contrast tests and review warm/cool/Neutral accents
before further strength adjustments. Keep OLED canvas black. Test neutral output
channel equality across surface, text, border, hover, focus and selection roles:
the current Neutral test only asserts two hardcoded cool values and therefore
endorses the bug. The correction below supersedes these original values.


## Neutral-base correction and verification

`design-system/bases.ts` now owns achromatic Light/Dark/OLED foundations and the
neutral gray palette. Offline/PWA colors reuse the same dark foundation. Text,
no-accent actions and neutral statuses are grayscale; intentional status/provider
hues remain. Mantine's default dark palette was checked and is already achromatic
(the imported gray palette was not). Card tint remains 10%; other strengths remain
as previously adjusted.

Verified actual CSS backgrounds in the live interaction-surfaces workbench at
1280×720 for all nine combinations below. Computed backgrounds matched tokens.
Screenshots were inspected for Light Neutral, Dark Warm Clay, and OLED Slate Blue.

| Mode | Neutral card | Warm Clay card | Slate Blue card |
| --- | --- | --- | --- |
| Light | #ffffff | #faf5f2 | #f3f7fc |
| Dark | #282828 | #393331 | #31353a |
| OLED | #131313 | #26211e | #1f2328 |

OLED canvas remained #000000 in all three combinations. Regression tests now
assert equal RGB channels across neutral interface roles and verify exact card
mixes plus accent channel ordering for warm clay, slate blue and dusty plum in
all modes. The existing contrast matrix includes extreme custom accents.


Surface refinement: canvas, raised/card/overlay, muted and control tint strengths
are reduced by 25% from the verified matrix above (cards now 7.5%). Hover and
selection accent mixture strengths remain unchanged; their underlying raised
surface follows the reduced tint. The earlier matrix records the prior iteration.
