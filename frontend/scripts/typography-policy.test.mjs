import { describe, expect, it } from 'vitest'
import { typographyViolations } from './typography-policy.mjs'
const roles = new Set(['body', 'caption'])
describe('typography ownership policy', () => {
  it('accepts role consumers and inherited text', () => {
    expect(
      typographyViolations(
        'sample.tsx',
        '<Text data-typography="body" c="dimmed">Example</Text>',
        roles,
      ),
    ).toEqual([])
    expect(
      typographyViolations(
        'sample.css',
        '.text { @splice-type caption; color: inherit; } button { font: inherit; }',
        roles,
      ),
    ).toEqual([])
  })
  it('rejects local metrics without confusing icon/control geometry', () => {
    expect(
      typographyViolations(
        'sample.tsx',
        '<><Text size="sm" fw={600} /><Icon size={20} /><Button size="sm" /></>',
        roles,
      ),
    ).toHaveLength(2)
    expect(
      typographyViolations(
        'sample.tsx',
        'const style = { fontSize: 12 };',
        roles,
      ),
    ).toHaveLength(1)
  })
  it('follows imported Text aliases', () => {
    expect(
      typographyViolations(
        'sample.tsx',
        'import { Text as Copy } from "@mantine/core"; <Copy size="xs" />',
        roles,
      ),
    ).toHaveLength(1)
  })
  it('rejects unknown roles, CSS metrics and typography utilities', () => {
    expect(
      typographyViolations(
        'sample.css',
        '.text { font-size: 12px; @splice-type missing; }',
        roles,
      ),
    ).toHaveLength(2)
    expect(
      typographyViolations(
        'sample.tsx',
        '<Text data-typography="missing" className="text-sm font-bold" />',
        roles,
      ),
    ).toHaveLength(2)
  })
})
