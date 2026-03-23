import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const askCssPath = join(process.cwd(), 'src/components/ask/ask.module.css')
const askCss = readFileSync(askCssPath, 'utf8')

function getCssBlock(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = askCss.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'))

  if (!match) {
    throw new Error(`Missing CSS block for ${selector}`)
  }

  return match[1]
}

describe('Ask layout CSS contract', () => {
  it('keeps the route viewport bounded under the AppShell offset', () => {
    const routeViewport = getCssBlock('.routeViewport')

    expect(routeViewport).toContain(
      '--app-shell-offset: calc(var(--app-shell-header-offset, 0rem) + (2 * var(--app-shell-padding)));',
    )
    expect(routeViewport).toContain('height: calc(100dvh - var(--app-shell-offset));')
    expect(routeViewport).toContain('min-height: 0;')
  })

  it('assigns scrolling to the transcript and desktop evidence panes', () => {
    const messages = getCssBlock('.messages')
    const desktopEvidence = getCssBlock('.desktopEvidence')

    expect(messages).toContain('overflow-y: auto;')
    expect(messages).toContain('min-height: 0;')
    expect(messages).toContain('flex: 1;')
    expect(desktopEvidence).toContain('overflow-y: auto;')
    expect(desktopEvidence).toContain('min-height: 0;')
  })

  it('preserves the one-column mobile collapse', () => {
    const mobileMedia = askCss.match(/@media \(max-width: 768px\) \{([\s\S]*?)\n\}/m)

    expect(mobileMedia?.[1]).toContain('.page')
    expect(mobileMedia?.[1]).toContain('grid-template-columns: 1fr;')
    expect(mobileMedia?.[1]).toContain('.desktopEvidence')
    expect(mobileMedia?.[1]).toContain('display: none;')
  })
})
