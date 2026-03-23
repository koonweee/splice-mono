import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const askCssPath = join(process.cwd(), 'src/components/ask/ask.module.css')
const askCss = readFileSync(askCssPath, 'utf8')

describe('Ask layout CSS contract', () => {
  it('keeps the route viewport bounded under the AppShell offset', () => {
    expect(askCss).toContain('.routeViewport')
    expect(askCss).toContain('--app-shell-offset: calc(var(--app-shell-header-offset, 0rem) + (2 * var(--app-shell-padding)));')
    expect(askCss).toContain('height: calc(100dvh - var(--app-shell-offset));')
  })

  it('assigns scrolling to the transcript and desktop evidence panes', () => {
    expect(askCss).toContain('.messages')
    expect(askCss).toContain('overflow-y: auto;')
    expect(askCss).toContain('.desktopEvidence')
    expect(askCss).toContain('min-height: 0;')
  })

  it('preserves the one-column mobile collapse', () => {
    expect(askCss).toContain('@media (max-width: 768px)')
    expect(askCss).toContain('grid-template-columns: 1fr;')
    expect(askCss).toContain('.desktopEvidence')
    expect(askCss).toContain('display: none;')
  })
})
