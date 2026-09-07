import {
  ActionIcon,
  Alert,
  Autocomplete,
  Avatar,
  Badge,
  Button,
  Checkbox,
  Combobox,
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
  getContrastColor,
} from '@mantine/core'
import { foundation } from './foundation'
import type { MantineThemeOverride } from '@mantine/core'

const optionScrollArea = {
  styles: { content: { minWidth: '100%', width: '100%' } },
}

const semanticRoles: Record<string, string> = {
  red: 'danger',
  yellow: 'warning',
  orange: 'warning',
  green: 'success',
  teal: 'success',
  gray: 'neutral',
  blue: 'info',
  violet: 'rule',
}
function semanticAction(color?: string, variant?: string) {
  const role = semanticRoles[color?.split('.')[0] ?? '']
  if (
    !role ||
    !['light', 'subtle', 'outline', 'transparent'].includes(variant ?? '')
  )
    return null
  return {
    color: `var(--splice-status-${role}-control-fg)`,
    background:
      variant === 'light' ? `var(--splice-status-${role}-bg)` : 'transparent',
    hover: `var(--splice-status-${role}-hover)`,
  }
}

/** Shared component behavior and geometry; independent of appearance/storage. */
export const components: MantineThemeOverride['components'] = {
  Alert: Alert.extend({
    vars: (_theme, props) => {
      if (props.variant && props.variant !== 'light') return { root: {} }
      const role = semanticRoles[props.color?.split('.')[0] ?? '']
      if (!role) return { root: {} }
      return {
        root: {
          '--alert-bg': `var(--splice-status-${role}-bg)`,
          '--alert-color': `var(--splice-status-${role}-fg)`,
        },
      }
    },
  }),
  Avatar: Avatar.extend({
    styles: {
      placeholder: {
        color: 'var(--mantine-color-dimmed)',
        background: 'var(--splice-surface-avatar)',
      },
    },
  }),
  ActionIcon: ActionIcon.extend({
    vars: (_theme, props) => {
      const colors = semanticAction(props.color, props.variant)
      return {
        root: colors
          ? {
              '--ai-color': colors.color,
              '--ai-bg': colors.background,
              '--ai-hover': colors.hover,
              '--ai-hover-color': colors.color,
              '--ai-bd':
                props.variant === 'outline'
                  ? `1px solid ${colors.color}`
                  : undefined,
            }
          : {},
      }
    },
    defaultProps: { radius: 'md' },
    classNames: { root: 'splice-action-icon-root' },
  }),
  Autocomplete: Autocomplete.extend({
    defaultProps: {
      radius: 'md',
      size: 'md',
      scrollAreaProps: optionScrollArea,
    },
    classNames: {
      input: 'splice-input-input',
      option: 'splice-combobox-option',
    },
  }),
  Badge: Badge.extend({
    vars: (_theme, props) => {
      const role = semanticRoles[props.color?.split('.')[0] ?? '']
      return {
        root:
          props.variant === 'light' && role
            ? {
                '--badge-bg': `var(--splice-status-${role}-bg)`,
                '--badge-color': `var(--splice-status-${role}-fg)`,
              }
            : {},
      }
    },
    defaultProps: { radius: 'sm' },
    classNames: { root: 'splice-badge-root' },
  }),
  Button: Button.extend({
    vars: (_theme, props) => {
      const colors = semanticAction(props.color, props.variant)
      return {
        root: colors
          ? {
              '--button-color': colors.color,
              '--button-bg': colors.background,
              '--button-hover': colors.hover,
              '--button-hover-color': colors.color,
              '--button-bd':
                props.variant === 'outline'
                  ? `1px solid ${colors.color}`
                  : undefined,
            }
          : {},
      }
    },
    defaultProps: { radius: 'md', size: 'md' },
    classNames: { root: 'splice-button-root' },
  }),
  Checkbox: Checkbox.extend({
    defaultProps: { color: 'brand', radius: 'sm' },
    classNames: {
      root: 'splice-inline-control-root',
      input: 'splice-choice-input',
    },
  }),
  Combobox: Combobox.extend({
    classNames: {
      dropdown: 'splice-popover-dropdown',
      option: 'splice-combobox-option',
    },
  }),
  Drawer: Drawer.extend({
    defaultProps: {
      padding: 'md',
      radius: 'md',
      shadow: 'xl',
      closeButtonProps: { 'aria-label': 'Close panel' },
    },
    classNames: {
      body: 'splice-overlay-body',
      content: 'splice-overlay-content splice-drawer-content',
      header: 'splice-overlay-header',
      title: 'splice-overlay-title',
    },
  }),
  FileInput: FileInput.extend({
    defaultProps: { radius: 'md', size: 'md' },
    classNames: { input: 'splice-input-input' },
  }),
  Input: Input.extend({
    defaultProps: { radius: 'md', size: 'md' },
    classNames: { input: 'splice-input-input' },
  }),
  InputWrapper: InputWrapper.extend({
    classNames: {
      root: 'splice-field-root',
      description: 'splice-input-description',
      error: 'splice-input-error',
      label: 'splice-input-label',
    },
  }),
  Loader: Loader.extend({
    defaultProps: { color: 'brand' },
  }),
  Modal: Modal.extend({
    defaultProps: {
      padding: 'md',
      radius: 'md',
      shadow: 'xl',
      closeButtonProps: { 'aria-label': 'Close dialog' },
    },
    classNames: {
      body: 'splice-overlay-body',
      content: 'splice-overlay-content',
      header: 'splice-overlay-header',
      title: 'splice-overlay-title',
    },
  }),
  MultiSelect: MultiSelect.extend({
    defaultProps: {
      radius: 'md',
      size: 'md',
      scrollAreaProps: optionScrollArea,
    },
    classNames: {
      input: 'splice-input-input',
      option: 'splice-combobox-option',
    },
  }),
  NavLink: NavLink.extend({
    classNames: {
      label: 'splice-navlink-label',
      root: 'splice-navlink-root',
    },
  }),
  NumberInput: NumberInput.extend({
    defaultProps: { radius: 'md', size: 'md' },
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
    classNames: {
      root: 'splice-inline-control-root',
      radio: 'splice-choice-input',
    },
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
    defaultProps: {
      radius: 'md',
      size: 'md',
      scrollAreaProps: optionScrollArea,
    },
    classNames: {
      input: 'splice-input-input',
      option: 'splice-combobox-option',
    },
  }),
  Skeleton: Skeleton.extend({
    defaultProps: { radius: 'sm' },
    classNames: { root: 'splice-skeleton-root' },
  }),
  Switch: Switch.extend({
    defaultProps: { color: 'brand' },
    styles: (theme, props) => ({
      root: {
        '--splice-switch-contrast': getContrastColor({
          color: props.color || theme.primaryColor,
          theme,
          autoContrast: true,
        }),
      },
    }),
    classNames: {
      root: 'splice-inline-control-root',
      input: 'splice-switch-input',
      track: 'splice-switch-track',
      thumb: 'splice-switch-thumb',
    },
  }),
  Tabs: Tabs.extend({
    defaultProps: { radius: 'md' },
    classNames: {
      list: 'splice-tabs-list',
      tab: 'splice-tabs-tab',
    },
  }),
  Textarea: Textarea.extend({
    defaultProps: { radius: 'md', size: 'md' },
    classNames: { input: 'splice-input-input' },
  }),
  TextInput: TextInput.extend({
    defaultProps: { radius: 'md', size: 'md' },
    classNames: { input: 'splice-input-input' },
  }),
  Tooltip: Tooltip.extend({
    defaultProps: {
      arrowRadius: 2,
      openDelay: foundation.motion.tooltipDelay,
      transitionProps: {
        duration: foundation.motion.quick,
        transition: 'fade',
      },
      withArrow: true,
    },
    classNames: { tooltip: 'splice-tooltip' },
  }),
}
