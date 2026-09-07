import {
  DEFAULT_APPEARANCE,
  resolveAppearance,
} from '../src/lib/design-system/appearance'

export function appearanceFromSearch(search: string) {
  const params = new URLSearchParams(search)
  return resolveAppearance({
    mode: params.get('mode') ?? DEFAULT_APPEARANCE.mode,
    accent:
      params.get('accent') === 'neutral'
        ? null
        : (params.get('accent') ?? DEFAULT_APPEARANCE.accent),
  })
}

// Gallery navigation only; the production route still validates the selected tab.
export const settingsSections = [
  'general',
  'notifications',
  'access',
  'categories',
  'analysis',
  'categorization',
  'recurring',
] as const
