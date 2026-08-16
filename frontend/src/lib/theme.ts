import {
  ActionIcon,
  Autocomplete,
  Badge,
  Button,
  Checkbox,
  Drawer,
  FileInput,
  Input,
  InputWrapper,
  Loader,
  Modal,
  MultiSelect,
  NavLink,
  NumberInput,
  Paper,
  Popover,
  Progress,
  Radio,
  SegmentedControl,
  Select,
  Skeleton,
  Switch,
  Tabs,
  TextInput,
  Textarea,
  Tooltip,
  createTheme,
} from '@mantine/core'
import type {
  MantineColorScheme,
  MantineColorsTuple,
  MantineThemeOverride,
} from '@mantine/core'

export const THEME_STORAGE_KEY = 'splice_theme_preset'
export const THEME_CHANGE_EVENT = 'splice-theme-change'

export const THEME_PRESET_IDS = [
  'splice-light',
  'splice-dark',
  'dracula',
  'oled-black',
] as const

export type ThemePresetId = (typeof THEME_PRESET_IDS)[number]

type ThemePresetTokens = {
  brand: MantineColorsTuple
  gray: MantineColorsTuple
  dark: MantineColorsTuple
  success: MantineColorsTuple
  danger: MantineColorsTuple
  warning: MantineColorsTuple
  info: MantineColorsTuple
  accent: MantineColorsTuple
}

export type ThemePreset = {
  id: ThemePresetId
  label: string
  description: string
  colorScheme: Exclude<MantineColorScheme, 'auto'>
  swatches: readonly [string, string, string, string]
  theme: MantineThemeOverride
}

const spliceBrand: MantineColorsTuple = [
  '#e6faf7',
  '#dceeeb',
  '#c0d9d5',
  '#a0c2bd',
  '#85afa9',
  '#72a39b',
  '#689e96',
  '#568a82',
  '#487b73',
  '#356b63',
]

const spliceTeal: MantineColorsTuple = [
  '#e6faf7',
  '#d0f4ef',
  '#a8e8df',
  '#7ddace',
  '#58ccbf',
  '#3ec2b3',
  '#35b8a9',
  '#2a9e91',
  '#1f8a7e',
  '#12756a',
]

const spliceRed: MantineColorsTuple = [
  '#fce9e9',
  '#f3d4d4',
  '#e5acac',
  '#d78181',
  '#cc5f5f',
  '#c44a4a',
  '#bf4040',
  '#a83434',
  '#962c2c',
  '#832222',
]

const spliceDark: MantineColorsTuple = [
  '#c9d1cf',
  '#a8b3b0',
  '#889592',
  '#6a7876',
  '#525e5c',
  '#3d4847',
  '#2a3331',
  '#1c2422',
  '#131918',
  '#0a0e0d',
]

const spliceGray: MantineColorsTuple = [
  '#f5f8f7',
  '#e9efed',
  '#d2ddda',
  '#b8c9c4',
  '#9fb4ae',
  '#879f99',
  '#6d847f',
  '#566a65',
  '#3f4f4b',
  '#26322f',
]

const blue: MantineColorsTuple = [
  '#e8f4ff',
  '#d4e7f8',
  '#a8cdef',
  '#79b2e6',
  '#539be0',
  '#3b8bdb',
  '#2f82d9',
  '#236fbf',
  '#1a63ab',
  '#0a5597',
]

const yellow: MantineColorsTuple = [
  '#fff9db',
  '#fff3bf',
  '#ffec99',
  '#ffe066',
  '#ffd43b',
  '#fcc419',
  '#fab005',
  '#f59f00',
  '#f08c00',
  '#e67700',
]

const draculaPurple: MantineColorsTuple = [
  '#f3edff',
  '#e6d8ff',
  '#cfb6ff',
  '#bd93f9',
  '#ab79f4',
  '#9b63ee',
  '#8e51e8',
  '#7a3fd0',
  '#6937b6',
  '#592f99',
]

const draculaDark: MantineColorsTuple = [
  '#f8f8f2',
  '#ddd8ec',
  '#b9b4ca',
  '#918ca8',
  '#6f6b88',
  '#565a73',
  '#44475a',
  '#343746',
  '#282a36',
  '#191a21',
]

const draculaCyan: MantineColorsTuple = [
  '#ebfdff',
  '#d6f9ff',
  '#adf3ff',
  '#8be9fd',
  '#66dff5',
  '#46d4ed',
  '#2bc9e5',
  '#18acc5',
  '#0e8fa3',
  '#057080',
]

const draculaPink: MantineColorsTuple = [
  '#fff0fa',
  '#ffd6f0',
  '#ffabe1',
  '#ff79c6',
  '#f75cb8',
  '#ed45ab',
  '#df309d',
  '#c62289',
  '#a91b74',
  '#8c135f',
]

const oledBrand: MantineColorsTuple = [
  '#e5fffb',
  '#cafff5',
  '#99ffeb',
  '#66ffe0',
  '#37ffd7',
  '#00f0c8',
  '#00d5b2',
  '#00aa8f',
  '#007f6c',
  '#005447',
]

const oledDark: MantineColorsTuple = [
  '#f6fffd',
  '#d9ebe6',
  '#aec6bf',
  '#7f9b92',
  '#5a746b',
  '#334b43',
  '#102018',
  '#050b08',
  '#000000',
  '#000000',
]

function buildTheme(tokens: ThemePresetTokens): MantineThemeOverride {
  return createTheme({
    colors: {
      brand: tokens.brand,
      gray: tokens.gray,
      dark: tokens.dark,
      teal: tokens.success,
      green: tokens.success,
      red: tokens.danger,
      yellow: tokens.warning,
      blue: tokens.info,
      cyan: tokens.info,
      violet: tokens.accent,
      pink: tokens.accent,
    },
    primaryColor: 'brand',
    primaryShade: { light: 6, dark: 4 },
    defaultRadius: 'md',
    components: {
      ActionIcon: ActionIcon.extend({
        defaultProps: { radius: 'md' },
        classNames: { root: 'splice-action-icon-root' },
      }),
      Autocomplete: Autocomplete.extend({
        defaultProps: { radius: 'md' },
        classNames: { input: 'splice-input-input' },
      }),
      Badge: Badge.extend({
        defaultProps: { radius: 'sm' },
        classNames: { root: 'splice-badge-root' },
      }),
      Button: Button.extend({
        defaultProps: { radius: 'md' },
        classNames: { root: 'splice-button-root' },
      }),
      Checkbox: Checkbox.extend({
        defaultProps: { color: 'brand', radius: 'sm' },
        classNames: { root: 'splice-inline-control-root' },
      }),
      Drawer: Drawer.extend({
        defaultProps: { padding: 'md', radius: 'md', shadow: 'xl' },
        classNames: {
          body: 'splice-overlay-body',
          content: 'splice-overlay-content splice-drawer-content',
          header: 'splice-overlay-header',
          title: 'splice-overlay-title',
        },
      }),
      FileInput: FileInput.extend({
        defaultProps: { radius: 'md' },
        classNames: { input: 'splice-input-input' },
      }),
      Input: Input.extend({
        defaultProps: { radius: 'md' },
        classNames: { input: 'splice-input-input' },
      }),
      InputWrapper: InputWrapper.extend({
        classNames: {
          description: 'splice-input-description',
          error: 'splice-input-error',
          label: 'splice-input-label',
        },
      }),
      Loader: Loader.extend({
        defaultProps: { color: 'brand' },
      }),
      Modal: Modal.extend({
        defaultProps: { padding: 'md', radius: 'md', shadow: 'xl' },
        classNames: {
          body: 'splice-overlay-body',
          content: 'splice-overlay-content',
          header: 'splice-overlay-header',
          title: 'splice-overlay-title',
        },
      }),
      MultiSelect: MultiSelect.extend({
        defaultProps: { radius: 'md' },
        classNames: { input: 'splice-input-input' },
      }),
      NavLink: NavLink.extend({
        classNames: {
          label: 'splice-navlink-label',
          root: 'splice-navlink-root',
        },
      }),
      NumberInput: NumberInput.extend({
        defaultProps: { radius: 'md' },
        classNames: { input: 'splice-input-input' },
      }),
      Paper: Paper.extend({
        defaultProps: { radius: 'md' },
        classNames: { root: 'splice-paper-root' },
      }),
      Popover: Popover.extend({
        defaultProps: { radius: 'md', shadow: 'md' },
        classNames: { dropdown: 'splice-popover-dropdown' },
      }),
      Progress: Progress.extend({
        defaultProps: { radius: 'xl' },
      }),
      Radio: Radio.extend({
        defaultProps: { color: 'brand' },
        classNames: { root: 'splice-inline-control-root' },
      }),
      SegmentedControl: SegmentedControl.extend({
        defaultProps: { radius: 'md' },
        classNames: {
          indicator: 'splice-segmented-control-indicator',
          label: 'splice-segmented-control-label',
          root: 'splice-segmented-control-root',
        },
      }),
      Select: Select.extend({
        defaultProps: { radius: 'md' },
        classNames: { input: 'splice-input-input' },
      }),
      Skeleton: Skeleton.extend({
        defaultProps: { radius: 'sm' },
      }),
      Switch: Switch.extend({
        defaultProps: { color: 'brand' },
        classNames: { root: 'splice-inline-control-root' },
      }),
      Tabs: Tabs.extend({
        defaultProps: { radius: 'md' },
        classNames: {
          list: 'splice-tabs-list',
          tab: 'splice-tabs-tab',
        },
      }),
      Textarea: Textarea.extend({
        defaultProps: { radius: 'md' },
        classNames: { input: 'splice-input-input' },
      }),
      TextInput: TextInput.extend({
        defaultProps: { radius: 'md' },
        classNames: { input: 'splice-input-input' },
      }),
      Tooltip: Tooltip.extend({
        defaultProps: {
          arrowRadius: 2,
          openDelay: 250,
          transitionProps: { duration: 120, transition: 'fade' },
          withArrow: true,
        },
        classNames: { tooltip: 'splice-tooltip' },
      }),
    },
  })
}

function definePreset(config: Omit<ThemePreset, 'theme'> & {
  tokens: ThemePresetTokens
}): ThemePreset {
  return {
    id: config.id,
    label: config.label,
    description: config.description,
    colorScheme: config.colorScheme,
    swatches: config.swatches,
    theme: buildTheme(config.tokens),
  }
}

export const THEME_PRESETS = [
  definePreset({
    id: 'splice-light',
    label: 'Splice light',
    description: 'Current Splice palette with a light surface.',
    colorScheme: 'light',
    swatches: ['#f5f8f7', spliceBrand[6], spliceTeal[5], spliceRed[5]],
    tokens: {
      brand: spliceBrand,
      gray: spliceGray,
      dark: spliceDark,
      success: spliceTeal,
      danger: spliceRed,
      warning: yellow,
      info: blue,
      accent: spliceBrand,
    },
  }),
  definePreset({
    id: 'splice-dark',
    label: 'Splice dark',
    description: 'Current Splice palette with the existing dark surface.',
    colorScheme: 'dark',
    swatches: [spliceDark[8], spliceBrand[6], spliceTeal[5], spliceRed[5]],
    tokens: {
      brand: spliceBrand,
      gray: spliceGray,
      dark: spliceDark,
      success: spliceTeal,
      danger: spliceRed,
      warning: yellow,
      info: blue,
      accent: spliceBrand,
    },
  }),
  definePreset({
    id: 'dracula',
    label: 'Dracula',
    description: 'High-chroma dark palette with purple and cyan accents.',
    colorScheme: 'dark',
    swatches: [draculaDark[8], draculaPurple[4], draculaCyan[3], draculaPink[3]],
    tokens: {
      brand: draculaPurple,
      gray: draculaDark,
      dark: draculaDark,
      success: [
        '#effff2',
        '#d6ffd9',
        '#a9ffb3',
        '#7cff8d',
        '#50fa7b',
        '#36e866',
        '#22d554',
        '#15b846',
        '#0c9437',
        '#057027',
      ],
      danger: [
        '#ffecec',
        '#ffd6d6',
        '#ffaaaa',
        '#ff7b7b',
        '#ff5555',
        '#f43f3f',
        '#e53030',
        '#c72121',
        '#aa1919',
        '#8c1212',
      ],
      warning: [
        '#ffffe7',
        '#ffffc8',
        '#fcff9e',
        '#f1fa8c',
        '#e1ed63',
        '#cedb44',
        '#b9c72e',
        '#9aa421',
        '#7d8619',
        '#5f6610',
      ],
      info: draculaCyan,
      accent: draculaPink,
    },
  }),
  definePreset({
    id: 'oled-black',
    label: 'OLED black',
    description: 'True-black surfaces with electric teal accents.',
    colorScheme: 'dark',
    swatches: ['#000000', oledBrand[5], '#52ff80', '#ff4f67'],
    tokens: {
      brand: oledBrand,
      gray: oledDark,
      dark: oledDark,
      success: [
        '#eaffef',
        '#d1ffd9',
        '#9cffae',
        '#68ff86',
        '#34ff62',
        '#00f044',
        '#00d33b',
        '#00ad30',
        '#008826',
        '#00631b',
      ],
      danger: [
        '#fff0f2',
        '#ffd8de',
        '#ffadba',
        '#ff7f92',
        '#ff4f67',
        '#f73350',
        '#e81f3d',
        '#c9142f',
        '#a90d26',
        '#88061c',
      ],
      warning: yellow,
      info: oledBrand,
      accent: oledBrand,
    },
  }),
] as const satisfies ReadonlyArray<ThemePreset>

export const DEFAULT_THEME_PRESET_ID: ThemePresetId = 'splice-dark'

const THEME_PRESET_MAP = new Map(
  THEME_PRESETS.map((preset) => [preset.id, preset]),
)

export function isThemePresetId(value: unknown): value is ThemePresetId {
  return (
    typeof value === 'string' &&
    THEME_PRESET_IDS.includes(value as ThemePresetId)
  )
}

export function normalizeThemePresetId(value: unknown): ThemePresetId {
  return isThemePresetId(value) ? value : DEFAULT_THEME_PRESET_ID
}

export function getThemePreset(value: unknown): ThemePreset {
  return (
    THEME_PRESET_MAP.get(normalizeThemePresetId(value)) ??
    THEME_PRESET_MAP.get(DEFAULT_THEME_PRESET_ID) ??
    THEME_PRESETS[0]
  )
}

export function readStoredThemePresetId(): ThemePresetId {
  if (typeof window === 'undefined') return DEFAULT_THEME_PRESET_ID

  return normalizeThemePresetId(window.localStorage.getItem(THEME_STORAGE_KEY))
}

export function previewThemePresetId(theme: ThemePresetId): void {
  if (typeof window === 'undefined') return

  window.dispatchEvent(
    new CustomEvent<{ theme: ThemePresetId }>(THEME_CHANGE_EVENT, {
      detail: { theme },
    }),
  )
}

export function applyThemePresetId(theme: ThemePresetId): void {
  if (typeof window === 'undefined') return

  window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  previewThemePresetId(theme)
}
