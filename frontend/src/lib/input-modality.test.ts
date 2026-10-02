import { afterEach, describe, expect, it } from 'vitest'
import { installInputModality } from './input-modality'

let dispose: (() => void) | undefined
afterEach(() => {
  dispose?.()
  dispose = undefined
  document.documentElement.removeAttribute('data-input-modality')
})
function pointer(type: string) {
  const event = new Event('pointerdown', { bubbles: true })
  Object.defineProperty(event, 'pointerType', { value: type })
  document.body.dispatchEvent(event)
}
describe('input modality', () => {
  it('switches from touch to keyboard navigation and back without changing focus', () => {
    dispose = installInputModality(document)
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()
    pointer('touch')
    expect(document.documentElement.dataset.inputModality).toBe('touch')
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }),
    )
    expect(document.documentElement.dataset.inputModality).toBe('keyboard')
    expect(document.activeElement).toBe(input)
    pointer('pen')
    expect(document.documentElement.dataset.inputModality).toBe('touch')
    pointer('mouse')
    expect(document.documentElement.dataset.inputModality).toBe('pointer')
    input.remove()
  })
  it('ignores typing and browser shortcuts while allowing navigation keys', () => {
    dispose = installInputModality(document)
    pointer('touch')
    for (const options of [
      { key: 'a' },
      { key: 'Tab', ctrlKey: true },
      { key: 'ArrowDown', isComposing: true },
    ])
      document.body.dispatchEvent(new KeyboardEvent('keydown', options))
    expect(document.documentElement.dataset.inputModality).toBe('touch')
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown' }),
    )
    expect(document.documentElement.dataset.inputModality).toBe('keyboard')
  })
  it('removes listeners and restores a pre-existing modality on cleanup', () => {
    document.documentElement.dataset.inputModality = 'keyboard'
    dispose = installInputModality(document)
    pointer('touch')
    dispose()
    dispose = undefined
    expect(document.documentElement.dataset.inputModality).toBe('keyboard')
    pointer('touch')
    expect(document.documentElement.dataset.inputModality).toBe('keyboard')
  })
})
