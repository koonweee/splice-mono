export type AppearanceBaseMode = 'light' | 'dark' | 'oled'
export type AppearanceMode = AppearanceBaseMode | 'auto'
export type AppearancePreference = {
  mode: AppearanceMode
  accent: string | null
  /** Remember each mode's accent; legacy preferences use accent for every mode. */
  accents?: Partial<Record<AppearanceBaseMode, string | null>>
  monospaceAmounts?: boolean
}
export const DEFAULT_APPEARANCE: AppearancePreference = {
  mode: 'dark',
  accent: '#83b59b',
}
export const ACCENT_SWATCHES = [
  { label: 'Neutral', value: null },
  { label: 'Sage', value: '#83b59b' },
  { label: 'Slate blue', value: '#86aee0' },
  { label: 'Dusty plum', value: '#b399cf' },
  { label: 'Warm clay', value: '#ce9a7e' },
] as const

export function parseAppearance(value: unknown): AppearancePreference | null {
  if (!value || typeof value !== 'object') return null
  const { mode, accent, accents, monospaceAmounts } = value as Record<
    string,
    unknown
  >
  if (monospaceAmounts !== undefined && typeof monospaceAmounts !== 'boolean')
    return null
  if (mode !== 'light' && mode !== 'dark' && mode !== 'oled' && mode !== 'auto')
    return null
  if (
    accent !== null &&
    (typeof accent !== 'string' || !/^#[0-9a-f]{6}$/i.test(accent))
  )
    return null
  const remembered: AppearancePreference['accents'] = {}
  if (accents !== undefined) {
    if (!accents || typeof accents !== 'object' || Array.isArray(accents))
      return null
    for (const [key, color] of Object.entries(accents)) {
      if (key !== 'light' && key !== 'dark' && key !== 'oled') return null
      if (
        color !== null &&
        (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color))
      )
        return null
      remembered[key] = typeof color === 'string' ? color.toLowerCase() : null
    }
  }
  return {
    mode,
    ...(Object.keys(remembered).length ? { accents: remembered } : {}),
    ...(monospaceAmounts ? { monospaceAmounts: true } : {}),
    accent: typeof accent === 'string' ? accent.toLowerCase() : null,
  }
}

export function appearanceBaseMode(
  preference: AppearancePreference,
  deviceMode: 'light' | 'dark' = 'dark',
): AppearanceBaseMode {
  return preference.mode === 'auto' ? deviceMode : preference.mode
}

export function appearanceAccent(
  preference: AppearancePreference,
  mode: AppearanceBaseMode,
) {
  const remembered = preference.accents?.[mode]
  return remembered === undefined ? preference.accent : remembered
}

function rememberedAccents(preference: AppearancePreference) {
  return {
    light: appearanceAccent(preference, 'light'),
    dark: appearanceAccent(preference, 'dark'),
    oled: appearanceAccent(preference, 'oled'),
  }
}

export function selectAppearanceMode(
  preference: AppearancePreference,
  mode: AppearanceMode,
  deviceMode: 'light' | 'dark',
) {
  const accents = rememberedAccents(preference)
  return {
    ...preference,
    mode,
    accents,
    accent: accents[mode === 'auto' ? deviceMode : mode],
  }
}

export function selectAppearanceAccent(
  preference: AppearancePreference,
  accent: string | null,
  deviceMode: 'light' | 'dark',
) {
  return {
    ...preference,
    accent,
    accents: {
      ...rememberedAccents(preference),
      [appearanceBaseMode(preference, deviceMode)]: accent,
    },
  }
}
