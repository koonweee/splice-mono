import {
  APPEARANCE_CHANGE_EVENT,
  normalizeAppearance,
} from '../src/lib/appearance-preferences'
import { DEFAULT_APPEARANCE } from '../src/lib/design-system/appearance'
import type { AppearancePreference } from '../src/lib/design-system/appearance'

export {
  APPEARANCE_CHANGE_EVENT,
  APPEARANCE_COOKIE,
  APPEARANCE_STORAGE_KEY,
  appearanceEqual,
  decodeAppearance,
  encodeAppearance,
  normalizeAppearance,
} from '../src/lib/appearance-preferences'
let stored = DEFAULT_APPEARANCE
export const readStoredAppearance = () => stored
export const writeAppearanceCookie = (_value: AppearancePreference) => {} // Never write shared localhost cookies.
export function previewAppearance(value: AppearancePreference) {
  window.dispatchEvent(
    new CustomEvent(APPEARANCE_CHANGE_EVENT, {
      detail: normalizeAppearance(value),
    }),
  )
}
export function applyAppearance(value: AppearancePreference) {
  stored = normalizeAppearance(value)
  previewAppearance(stored)
}
