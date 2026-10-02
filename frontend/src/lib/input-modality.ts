/** Focus rings follow keyboard navigation, including keyboards on touch devices. */
export function installInputModality(document: Document): () => void {
  const root = document.documentElement
  const previous = root.getAttribute('data-input-modality')
  const pointerDown = (event: PointerEvent) => {
    root.setAttribute(
      'data-input-modality',
      event.pointerType === 'touch' || event.pointerType === 'pen'
        ? 'touch'
        : 'pointer',
    )
  }
  const keyDown = (event: KeyboardEvent) => {
    if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey)
      return
    if (
      [
        'Tab',
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'Home',
        'End',
      ].includes(event.key)
    )
      root.setAttribute('data-input-modality', 'keyboard')
  }
  document.addEventListener('pointerdown', pointerDown, true)
  document.addEventListener('keydown', keyDown, true)
  return () => {
    document.removeEventListener('pointerdown', pointerDown, true)
    document.removeEventListener('keydown', keyDown, true)
    if (previous === null) root.removeAttribute('data-input-modality')
    else root.setAttribute('data-input-modality', previous)
  }
}
