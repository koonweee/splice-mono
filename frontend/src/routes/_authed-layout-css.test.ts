import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const authedCssPath = join(process.cwd(), 'src/routes/_authed.module.css')
const authedCss = readFileSync(authedCssPath, 'utf8')

function getCssBlock(selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = authedCss.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\}`, 'm'))

  if (!match) {
    throw new Error(`Missing CSS block for ${selector}`)
  }

  return match[1]
}

describe('Authed layout CSS contract', () => {
  it('bounds the main shell content area and hides page-level overflow', () => {
    const main = getCssBlock('.main')

    expect(main).toContain('display: flex;')
    expect(main).toContain('flex-direction: column;')
    expect(main).toContain('min-height: 0;')
    expect(main).toContain('overflow: hidden;')
    expect(main).toContain('height: 100dvh;')
  })
})
