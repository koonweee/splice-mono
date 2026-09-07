import { DEFAULT_APPEARANCE, parseAppearance } from './design-system/appearance'
import type { AppearancePreference } from './design-system/appearance'

export const APPEARANCE_COOKIE = 'splice_appearance'
export const APPEARANCE_STORAGE_KEY = 'splice:appearance'
export const APPEARANCE_CHANGE_EVENT = 'splice:appearance-change'

export function normalizeAppearance(value: unknown): AppearancePreference {
  return parseAppearance(value) ?? { ...DEFAULT_APPEARANCE }
}
export function appearanceEqual(
  a: AppearancePreference,
  b: AppearancePreference,
) {
  return (
    a.mode === b.mode &&
    a.accent === b.accent &&
    Boolean(a.monospaceAmounts) === Boolean(b.monospaceAmounts)
  )
}
export function decodeAppearance(
  value: string | null | undefined,
): AppearancePreference | null {
  if (!value || value.length > 256) return null
  try {
    return parseAppearance(JSON.parse(decodeURIComponent(value)))
  } catch {
    return null
  }
}
export function encodeAppearance(value: AppearancePreference): string {
  return encodeURIComponent(JSON.stringify(normalizeAppearance(value)))
}
export function readStoredAppearance(): AppearancePreference {
  try {
    return (
      decodeAppearance(window.localStorage.getItem(APPEARANCE_STORAGE_KEY)) ?? {
        ...DEFAULT_APPEARANCE,
      }
    )
  } catch {
    return { ...DEFAULT_APPEARANCE }
  }
}
export function writeAppearanceCookie(value: AppearancePreference) {
  if (typeof document === 'undefined') return
  document.cookie = `${APPEARANCE_COOKIE}=${encodeAppearance(value)}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
}
export function previewAppearance(appearance: AppearancePreference) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(
    new CustomEvent(APPEARANCE_CHANGE_EVENT, {
      detail: normalizeAppearance(appearance),
    }),
  )
}
export function applyAppearance(appearance: AppearancePreference) {
  if (typeof window === 'undefined') return
  const value = normalizeAppearance(appearance)
  try {
    window.localStorage.setItem(APPEARANCE_STORAGE_KEY, encodeAppearance(value))
  } catch {
    /* Cookie still carries server-first appearance. */
  }
  writeAppearanceCookie(value)
  previewAppearance(value)
}
