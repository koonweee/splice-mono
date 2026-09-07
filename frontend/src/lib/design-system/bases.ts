/** Achromatic foundations: personal hue enters only through accent mixing. */
export const BASES = {
  light: {
    canvas: '#f6f6f6',
    raised: '#ffffff',
    muted: '#f0f0f0',
    control: '#ffffff',
    text: '#252525',
    dimmed: '#686868',
    action: '#6a6a6a',
  },
  dark: {
    canvas: '#1c1c1c',
    raised: '#282828',
    muted: '#242424',
    control: '#303030',
    text: '#e9e9e9',
    dimmed: '#afafaf',
    action: '#acacac',
  },
  oled: {
    canvas: '#000000',
    raised: '#131313',
    muted: '#1c1c1c',
    control: '#232323',
    text: '#e9e9e9',
    dimmed: '#afafaf',
    action: '#acacac',
  },
} as const

export const NEUTRAL_GRAY = [
  '#f9f9f9',
  '#f3f3f3',
  '#ececec',
  '#e2e2e2',
  '#d4d4d4',
  '#b5b5b5',
  '#8e8e8e',
  '#505050',
  '#3a3a3a',
  '#252525',
] as const
