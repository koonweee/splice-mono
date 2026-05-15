import { describe, expect, it } from 'vitest'
import {
  getViewportAwareComboboxProps,
  getViewportAwareOverlayComboboxProps,
} from './mobile-combobox'

describe('mobile combobox helpers', () => {
  it('keeps the default viewport-aware dropdown portaled', () => {
    expect(getViewportAwareComboboxProps()).toMatchObject({
      floatingStrategy: 'fixed',
      position: 'bottom-start',
      withinPortal: true,
    })
  })

  it('keeps overlay dropdowns inside their drawer or modal subtree', () => {
    expect(getViewportAwareOverlayComboboxProps()).toMatchObject({
      floatingStrategy: 'fixed',
      hideDetached: false,
      position: 'bottom-start',
      withinPortal: false,
    })
  })
})
