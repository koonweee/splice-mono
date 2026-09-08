export type AppearanceMode = 'light' | 'dark' | 'oled'
export type AppearancePreference = {
  mode: AppearanceMode
  accent: string | null
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
  const { mode, accent, monospaceAmounts } = value as Record<string, unknown>
  if (monospaceAmounts !== undefined && typeof monospaceAmounts !== 'boolean')
    return null
  if (mode !== 'light' && mode !== 'dark' && mode !== 'oled') return null
  if (
    accent !== null &&
    (typeof accent !== 'string' || !/^#[0-9a-f]{6}$/i.test(accent))
  )
    return null
  return {
    mode,
    ...(monospaceAmounts ? { monospaceAmounts: true } : {}),
    accent: typeof accent === 'string' ? accent.toLowerCase() : null,
  }
}
