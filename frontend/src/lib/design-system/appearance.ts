import { DEFAULT_THEME, createTheme } from '@mantine/core'
import { typographyFonts, typographyScale } from './typography'
import { BASES, NEUTRAL_GRAY } from './bases'
import { components } from './components'
import { DEFAULT_APPEARANCE, parseAppearance } from './appearance-preference'
import type { MantineColorsTuple } from '@mantine/core'

export {
  DEFAULT_APPEARANCE,
  ACCENT_SWATCHES,
  parseAppearance,
} from './appearance-preference'
export type {
  AppearanceMode,
  AppearancePreference,
} from './appearance-preference'

function channels(hex: string) {
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16))
}

export function mixColor(base: string, tint: string, amount: number): string {
  const other = channels(tint)
  return (
    '#' +
    channels(base)
      .map((value, index) =>
        Math.round(value + (other[index] - value) * amount)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  )
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((channel) => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return r * 0.2126 + g * 0.7152 + b * 0.0722
}

export function contrastRatio(a: string, b: string): number {
  const first = luminance(a),
    second = luminance(b)
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05)
}

/** Preserve hue as far as possible; move toward the readable luminance endpoint. */
export function readableColor(
  seed: string,
  backgrounds: Array<string>,
  minimum: number,
): string {
  const passes = (color: string) =>
    backgrounds.every(
      (background) => contrastRatio(color, background) >= minimum,
    )
  if (passes(seed)) return seed
  const endpoint =
    Math.min(...backgrounds.map((bg) => contrastRatio('#000000', bg))) >
    Math.min(...backgrounds.map((bg) => contrastRatio('#ffffff', bg)))
      ? '#000000'
      : '#ffffff'
  let low = 0,
    high = 1
  for (let index = 0; index < 24; index++) {
    const midpoint = (low + high) / 2
    if (passes(mixColor(seed, endpoint, midpoint))) high = midpoint
    else low = midpoint
  }
  return mixColor(seed, endpoint, high)
}

function tuple(values: Array<string>): MantineColorsTuple {
  if (values.length !== 10)
    throw new Error('A Mantine palette needs ten shades')
  return values as unknown as MantineColorsTuple
}

export function resolveAppearance(input: unknown) {
  const preference = parseAppearance(input) ?? { ...DEFAULT_APPEARANCE }
  const light = preference.mode === 'light'
  const oled = preference.mode === 'oled'
  const base = BASES[preference.mode]
  const seed = preference.accent ?? base.action
  // One strength adjustment for personal accent mixtures, including feedback.
  const accentMix = (color: string, amount: number) =>
    mixColor(color, seed, amount * (preference.accent === null ? 1 : 1.25))
  const tint = (color: string, amount: number) =>
    preference.accent === null ? color : accentMix(color, amount * 0.75)
  const canvas = oled ? base.canvas : tint(base.canvas, light ? 0.035 : 0.06)
  const raised = tint(
    base.raised,
    0.08, // 7.5% after accent strength and surface attenuation.
  )
  const muted = tint(base.muted, light ? 0.035 : 0.065)
  const control = tint(base.control, light ? 0.03 : 0.08)
  const interfaceHover = accentMix(raised, light ? 0.08 : 0.1)
  const text = base.text
  const dimmed = readableColor(
    base.dimmed,
    [canvas, raised, muted, control, interfaceHover],
    4.5,
  )
  const action = readableColor(seed, [canvas, raised, control], 4.5)
  const actionForeground =
    contrastRatio(action, '#000000') >= contrastRatio(action, '#ffffff')
      ? '#000000'
      : '#ffffff'
  const selected = accentMix(raised, light ? 0.15 : 0.19)
  const selectedText = readableColor(action, [selected], 4.5)
  const selectedHover = readableColor(
    accentMix(raised, light ? 0.22 : 0.26),
    [selectedText],
    4.5,
  )
  const chart = readableColor(seed, [canvas], 3)
  const border = mixColor(raised, text, light ? 0.16 : 0.14)
  const separator = mixColor(raised, text, light ? 0.09 : 0.075)
  const focus = readableColor(
    seed,
    [canvas, raised, muted, control, selected],
    3,
  )
  const controlBorder = readableColor(
    mixColor(control, text, 0.25),
    [control, canvas, raised],
    3,
  )
  const brand = tuple(
    [0.95, 0.85, 0.7, 0.5]
      .map((amount) => mixColor(seed, '#ffffff', amount))
      .concat([
        action,
        action,
        action,
        mixColor(action, light ? '#000000' : '#ffffff', 0.1),
        mixColor(action, light ? '#000000' : '#ffffff', 0.2),
        mixColor(action, light ? '#000000' : '#ffffff', 0.3),
      ]),
  )
  const dark = tuple([
    text,
    dimmed,
    '#8d8d8d',
    controlBorder,
    control,
    control,
    raised,
    muted,
    canvas,
    '#000000',
  ])
  const colors = {
    canvas,
    raised,
    muted,
    control,
    text,
    dimmed,
    action,
    actionForeground,
    selected,
    selectedHover,
    selectedText,
    chart,
    border,
    separator,
    focus,
    controlBorder,
  }
  const variables = {
    ...Object.fromEntries(
      Object.entries({
        'status-success': '#2b8a3e',
        'status-warning': '#e67700',
        'status-danger': '#c92a2a',
        'status-neutral': '#8e8e8e',
        'status-info': '#1971c2',
        'status-rule': '#7950f2',
        'provider-plaid': '#e64980',
        'provider-simplefin': '#7950f2',
        'provider-crypto': '#fd7e14',
      }).flatMap(([role, color]) => {
        // Status identity and its contrast are independent of the user's accent.
        const background = mixColor(
          light ? BASES.light.raised : BASES.dark.canvas,
          color,
          light ? 0.12 : 0.2,
        )
        const hover = mixColor(background, color, 0.08)
        return [
          ...(role.startsWith('status-')
            ? [
                [`--splice-${role}-hover`, hover],
                [
                  `--splice-${role}-control-fg`,
                  readableColor(
                    color,
                    [background, hover, canvas, raised, muted, control],
                    4.5,
                  ),
                ],
              ]
            : []),
          [`--splice-${role}-bg`, background],
          [`--splice-${role}-fg`, readableColor(color, [background], 4.5)],
        ]
      }),
    ),
    '--splice-error': readableColor(
      light ? '#c92a2a' : '#ff9ba7',
      [canvas, raised, muted, control],
      4.5,
    ),
    '--mantine-color-body': canvas,
    '--mantine-color-text': text,
    '--mantine-color-dimmed': dimmed,
    '--mantine-color-default': control,
    '--mantine-color-default-hover': mixColor(control, text, 0.06),
    '--mantine-color-default-color': text,
    '--mantine-color-default-border': border,
    '--mantine-primary-color-filled': action,
    '--mantine-primary-color-filled-hover': brand[7],
    '--mantine-primary-color-contrast': actionForeground,
    '--mantine-primary-color-light': selected,
    '--mantine-primary-color-light-hover': selectedHover,
    '--mantine-primary-color-light-color': selectedText,
    '--mantine-color-brand-light': selected,
    '--mantine-color-brand-light-hover': selectedHover,
    '--mantine-color-brand-light-color': selectedText,
    '--splice-canvas': canvas,
    '--splice-header': canvas,
    '--splice-header-divider': mixColor(canvas, text, 0.06),
    '--splice-border': border,
    '--splice-separator': separator,
    '--splice-surface-raised': raised,
    '--splice-surface-overlay': raised,
    '--splice-surface-muted': muted,
    '--splice-surface-avatar': control,
    '--splice-surface-row': raised,
    // Decorative loading shapes need separation from both canvas and card surfaces.
    '--splice-skeleton-base': readableColor(
      mixColor(raised, text, 0.08),
      [canvas, raised, muted, control],
      1.2,
    ),
    '--splice-skeleton-highlight': readableColor(
      mixColor(raised, text, 0.16),
      [canvas, raised, muted, control],
      1.5,
    ),
    '--splice-row-hover': mixColor(raised, text, 0.035),
    '--splice-table-hover': mixColor(raised, text, 0.025),
    '--splice-control': control,
    '--splice-hover': interfaceHover,
    '--splice-selected': selected,
    '--splice-selected-hover': selectedHover,
    '--splice-group-header': muted,
    '--splice-chart-color': chart,
    '--splice-font-amount': preference.monospaceAmounts
      ? typographyFonts.mono
      : typographyFonts.body,
    '--splice-focus': focus,
    '--splice-control-border': controlBorder,
    // Semantic meanings are independent of the user's accent.
    '--splice-positive': light ? '#076e54' : '#66d8ad',
    '--splice-negative': light ? '#aa2233' : '#ff9ba7',
  }
  return {
    preference,
    colorScheme: light ? ('light' as const) : ('dark' as const),
    colors,
    variables,
    theme: createTheme({
      fontSizes: typographyScale,
      fontFamily: typographyFonts.body,
      fontFamilyMonospace: typographyFonts.mono,
      primaryColor: 'brand',
      primaryShade: light ? 6 : 4,
      autoContrast: true,
      luminanceThreshold: 0.179,
      defaultRadius: 'md',
      colors: {
        brand,
        dark: light ? DEFAULT_THEME.colors.dark : dark,
        gray: tuple([...NEUTRAL_GRAY]),
      },
      components,
      other: { splice: variables },
    }),
  }
}
