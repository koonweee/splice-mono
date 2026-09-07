import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { APPEARANCE_CHANGE_EVENT } from '../src/lib/appearance-preferences'
import {
  FixturePresentation,
  usePresentationPreferences,
} from './runtime-boundaries'
import {
  applyAppearance,
  previewAppearance,
  readStoredAppearance,
} from './appearance-boundary'
import {
  enableCurrentDeviceNotifications,
  loadCurrentDeviceNotificationState,
} from './notification-boundary'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
it('keeps appearance preview and saved values local without cookie or storage writes', () => {
  const cookie = document.cookie
  const storage = vi.spyOn(Storage.prototype, 'setItem')
  const onPreview = vi.fn()
  window.addEventListener(APPEARANCE_CHANGE_EVENT, onPreview)
  applyAppearance({ mode: 'oled', accent: null })
  previewAppearance({ mode: 'light', accent: '#86aee0' })
  expect(readStoredAppearance()).toEqual({ mode: 'oled', accent: null })
  expect(onPreview).toHaveBeenCalledTimes(2)
  expect(document.cookie).toBe(cookie)
  expect(storage).not.toHaveBeenCalled()
  window.removeEventListener(APPEARANCE_CHANGE_EVENT, onPreview)
})
it('masks within the presentation scope without persisting or changing another scope', () => {
  const cookie = document.cookie
  const storage = vi.spyOn(Storage.prototype, 'setItem')
  function Control({ name }: { name: string }) {
    const { maskBalances, setMaskBalances } = usePresentationPreferences()
    return (
      <button onClick={() => setMaskBalances((value) => !value)}>
        {name}: {String(maskBalances)}
      </button>
    )
  }
  render(
    <>
      <FixturePresentation masked={false}>
        <Control name="First" />
      </FixturePresentation>
      <FixturePresentation masked={false}>
        <Control name="Second" />
      </FixturePresentation>
    </>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'First: false' }))
  expect(screen.getByRole('button', { name: 'First: true' })).toBeDefined()
  expect(screen.getByRole('button', { name: 'Second: false' })).toBeDefined()
  expect(document.cookie).toBe(cookie)
  expect(storage).not.toHaveBeenCalled()
})
it('simulates notification subscription without requesting browser permission', async () => {
  const fetch = vi.spyOn(window, 'fetch')
  await enableCurrentDeviceNotifications()
  expect(await loadCurrentDeviceNotificationState()).toEqual({
    supported: 'supported',
    subscribed: true,
  })
  expect(fetch).not.toHaveBeenCalled()
})
