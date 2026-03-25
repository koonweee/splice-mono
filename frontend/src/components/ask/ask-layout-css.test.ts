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
  it('fills the parent shell layout without recomputing viewport height', () => {
    const routeViewport = getCssBlock('.routeViewport')

    expect(routeViewport).toContain('flex: 1;')
    expect(routeViewport).toContain('min-height: 0;')
    expect(routeViewport).not.toContain('100dvh')
    expect(routeViewport).not.toContain('--app-shell-offset')
  })

  it('assigns scrolling to the transcript within the single Ask layout pane', () => {
    const page = getCssBlock('.page')
    const messages = getCssBlock('.messages')

    expect(page).toContain('flex: 1;')
    expect(page).toContain('height: 100%;')
    expect(page).toContain('min-height: 0;')
    expect(messages).toContain('overflow-y: auto;')
    expect(messages).toContain('min-height: 0;')
    expect(messages).toContain('flex: 1;')
    expect(messages).toContain('padding-right: 8px;')
    expect(messages).toContain('padding-bottom: 8px;')
    expect(messages).toContain('scrollbar-gutter: stable;')
  })

  it('keeps the page in a single-column layout', () => {
    const mobileMedia = askCss.match(/@media \(max-width: 768px\) \{([\s\S]*?)\n\}/m)

    expect(getCssBlock('.page')).not.toContain('grid-template-columns')
    expect(mobileMedia?.[1] ?? '').not.toContain('.desktopEvidence')
  })
})
