import type { ComboboxProps } from '@mantine/core'

const DROPDOWN_MAX_HEIGHT_VAR = '--splice-combobox-dropdown-max-height'

export const viewportAwareDropdownMaxHeight = `min(260px, var(${DROPDOWN_MAX_HEIGHT_VAR}, 45dvh))`

export function getViewportAwareComboboxProps(
  overrides: Partial<ComboboxProps> = {},
): ComboboxProps {
  const { middlewares, ...rest } = overrides

  return {
    floatingStrategy: 'fixed',
    middlewares: {
      flip: true,
      inline: false,
      shift: { padding: 8 },
      size: {
        padding: 8,
        apply({ availableHeight, elements }) {
          elements.floating.style.setProperty(
            DROPDOWN_MAX_HEIGHT_VAR,
            `${Math.max(120, Math.floor(availableHeight))}px`,
          )
        },
      },
      ...middlewares,
    },
    position: 'bottom-start',
    preventPositionChangeWhenVisible: false,
    withinPortal: true,
    zIndex: 1100,
    ...rest,
  }
}

export function getViewportAwareOverlayComboboxProps(
  overrides: Partial<ComboboxProps> = {},
): ComboboxProps {
  return getViewportAwareComboboxProps({
    hideDetached: false,
    withinPortal: false,
    ...overrides,
  })
}
