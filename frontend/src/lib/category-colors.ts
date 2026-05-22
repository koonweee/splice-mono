import type { CSSProperties } from 'react'

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export const UNCATEGORIZED_CATEGORY_COLOR = '#868e96'

const FALLBACK_COLORS = [
  '#845ef7',
  '#339af0',
  '#51cf66',
  '#fcc419',
  '#ff8787',
  '#da77f2',
]

export function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim()

  if (!HEX_COLOR_PATTERN.test(trimmed)) {
    return null
  }

  const color = trimmed.toLowerCase()
  if (color.length === 4) {
    return `#${color
      .slice(1)
      .split('')
      .map((character) => `${character}${character}`)
      .join('')}`
  }

  return color
}

export function generateCategoryColor(): string {
  const hue = Math.floor(Math.random() * 360)
  const saturation = 52 + Math.floor(Math.random() * 22)
  const lightness = 42 + Math.floor(Math.random() * 16)

  return hslToHex(hue, saturation, lightness)
}

export function getFallbackCategoryColor(category: string, index = 0): string {
  if (category === 'UNCATEGORIZED') {
    return UNCATEGORIZED_CATEGORY_COLOR
  }

  return FALLBACK_COLORS[index % FALLBACK_COLORS.length]
}

export function getDisplayCategoryColor(
  color: string | null | undefined,
  fallbackCategory = 'UNCATEGORIZED',
  index = 0,
): string {
  return (
    normalizeHexColor(color ?? '') ??
    getFallbackCategoryColor(fallbackCategory, index)
  )
}

export function getRelativeLuminance(color: string): number {
  const normalized = normalizeHexColor(color)
  if (!normalized) {
    return 1
  }

  const [red, green, blue] = [1, 3, 5].map((start) =>
    parseInt(normalized.slice(start, start + 2), 16),
  )

  return [red, green, blue]
    .map((channel) => {
      const normalizedChannel = channel / 255
      return normalizedChannel <= 0.03928
        ? normalizedChannel / 12.92
        : Math.pow((normalizedChannel + 0.055) / 1.055, 2.4)
    })
    .reduce(
      (luminance, channel, index) =>
        luminance + channel * [0.2126, 0.7152, 0.0722][index],
      0,
    )
}

export function getContrastRatio(first: string, second: string): number {
  const firstLuminance = getRelativeLuminance(first)
  const secondLuminance = getRelativeLuminance(second)
  const lighter = Math.max(firstLuminance, secondLuminance)
  const darker = Math.min(firstLuminance, secondLuminance)

  return (lighter + 0.05) / (darker + 0.05)
}

export function getReadableTextColor(
  background: string,
): '#000000' | '#ffffff' {
  return getContrastRatio(background, '#000000') >=
    getContrastRatio(background, '#ffffff')
    ? '#000000'
    : '#ffffff'
}

export function getCategoryColorStyles(
  color: string,
  options: { selected?: boolean } = {},
): CSSProperties {
  const backgroundColor = getDisplayCategoryColor(color)
  const textColor = getReadableTextColor(backgroundColor)
  const borderColor =
    textColor === '#000000'
      ? 'rgba(0, 0, 0, 0.24)'
      : 'rgba(255, 255, 255, 0.38)'

  return {
    backgroundColor,
    border: `1px solid ${borderColor}`,
    boxShadow: options.selected ? `0 0 0 2px ${borderColor}` : undefined,
    color: textColor,
  }
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const normalizedSaturation = saturation / 100
  const normalizedLightness = lightness / 100
  const chroma =
    (1 - Math.abs(2 * normalizedLightness - 1)) * normalizedSaturation
  const huePrime = hue / 60
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1))
  const m = normalizedLightness - chroma / 2
  const [red, green, blue] =
    huePrime >= 0 && huePrime < 1
      ? [chroma, x, 0]
      : huePrime >= 1 && huePrime < 2
        ? [x, chroma, 0]
        : huePrime >= 2 && huePrime < 3
          ? [0, chroma, x]
          : huePrime >= 3 && huePrime < 4
            ? [0, x, chroma]
            : huePrime >= 4 && huePrime < 5
              ? [x, 0, chroma]
              : [chroma, 0, x]

  return `#${[red, green, blue]
    .map((channel) =>
      Math.round((channel + m) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}
