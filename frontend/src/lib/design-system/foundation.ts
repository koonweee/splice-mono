import { getDefaultZIndex } from '@mantine/core'

/** Values needed by both React props and CSS. Mantine owns space/type/radius. */
export const foundation = {
  motion: {
    quick: 120,
    feedback: 150,
    overlay: 200,
    chart: 400,
    breathe: 1800,
    tooltipDelay: 250,
  },
  layers: {
    // Floating application tools remain below dialogs; pickers use Mantine portals.
    retainedError: getDefaultZIndex('app') + 30,
    bulkToolbar: getDefaultZIndex('app') + 20,
    lifecycle: getDefaultZIndex('app') + 40,
    tablePopover: getDefaultZIndex('popover'),
    combobox: getDefaultZIndex('popover'),
    floatingPanel: getDefaultZIndex('popover'),
  },
  dimensions: {
    touchTarget: 44,
    touchInput: 48,
    controlIcon: 20,
  },
  chart: {
    minimalFill: 0.12,
    fill: 0.2,
    fadeEnd: 0,
    placeholderOpacity: 0.45,
    placeholderDimOpacity: 0.2,
  },
} as const
