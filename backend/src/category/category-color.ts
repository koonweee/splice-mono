import { randomInt } from 'crypto';

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export const UNCATEGORIZED_CATEGORY_COLOR = '#868e96';
export const BALANCE_ADJUSTMENT_CATEGORY_COLOR = '#4c6ef5';

export function isCategoryColor(value: string): boolean {
  return HEX_COLOR_PATTERN.test(value.trim());
}

export function normalizeCategoryColor(value: string): string {
  const trimmed = value.trim();

  if (!isCategoryColor(trimmed)) {
    throw new Error('Category color must be a valid hex color');
  }

  const color = trimmed.toLowerCase();
  if (color.length === 4) {
    return `#${color
      .slice(1)
      .split('')
      .map((character) => `${character}${character}`)
      .join('')}`;
  }

  return color;
}

export function generateCategoryColor(): string {
  const hue = randomInt(0, 360);
  const saturation = randomInt(52, 74);
  const lightness = randomInt(42, 58);

  return hslToHex(hue, saturation, lightness);
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const normalizedSaturation = saturation / 100;
  const normalizedLightness = lightness / 100;
  const chroma =
    (1 - Math.abs(2 * normalizedLightness - 1)) * normalizedSaturation;
  const huePrime = hue / 60;
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1));
  const m = normalizedLightness - chroma / 2;
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
              : [chroma, 0, x];

  return `#${[red, green, blue]
    .map((channel) =>
      Math.round((channel + m) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}
