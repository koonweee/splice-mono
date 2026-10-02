import {
  DEFAULT_APPEARANCE,
  resolveAppearance,
} from '../src/lib/design-system/appearance'

export function appearanceFromSearch(search: string) {
  const params = new URLSearchParams(search)
  return resolveAppearance({
    monospaceAmounts: params.get('monospace') === 'true',
    mode: params.get('mode') ?? DEFAULT_APPEARANCE.mode,
    ...(params.has('lightAccent') || params.has('darkAccent')
      ? {
          accents: {
            ...(params.has('lightAccent')
              ? {
                  light:
                    params.get('lightAccent') === 'neutral'
                      ? null
                      : params.get('lightAccent'),
                }
              : {}),
            ...(params.has('darkAccent')
              ? {
                  dark:
                    params.get('darkAccent') === 'neutral'
                      ? null
                      : params.get('darkAccent'),
                }
              : {}),
          },
        }
      : {}),
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
