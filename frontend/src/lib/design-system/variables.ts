import { DEFAULT_APPEARANCE, resolveAppearance } from './appearance'
import { foundation } from './foundation'
import type { CSSVariablesResolver } from '@mantine/core'

/** Mantine adapter: one semantic appearance plus the shared numeric foundations. */
export const designVariables: CSSVariablesResolver = (theme) => ({
  variables: {
    ...Object.fromEntries(
      Object.entries(foundation.motion).map(([key, value]) => [
        `--splice-motion-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
        `${value}ms`,
      ]),
    ),
    ...Object.fromEntries(
      Object.entries(foundation.layers).map(([key, value]) => [
        `--splice-layer-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
        String(value),
      ]),
    ),
    ...Object.fromEntries(
      Object.entries(foundation.dimensions).map(([key, value]) => [
        `--splice-size-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`,
        `${value}px`,
      ]),
    ),
    '--splice-chart-fill': String(foundation.chart.minimalFill),
    '--splice-chart-fade-end': String(foundation.chart.fadeEnd),
    '--splice-chart-placeholder-opacity': String(
      foundation.chart.placeholderOpacity,
    ),
    '--splice-chart-placeholder-dim-opacity': String(
      foundation.chart.placeholderDimOpacity,
    ),
    ...((theme.other.splice as Record<string, string> | undefined) ??
      resolveAppearance(DEFAULT_APPEARANCE).variables),
  },
  light:
    (theme.other.splice as Record<string, string> | undefined) ??
    resolveAppearance(DEFAULT_APPEARANCE).variables,
  dark:
    (theme.other.splice as Record<string, string> | undefined) ??
    resolveAppearance(DEFAULT_APPEARANCE).variables,
})
