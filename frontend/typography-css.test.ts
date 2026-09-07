import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import { expandTypography } from './typography-css'
import { typographyRoles } from './src/lib/design-system/typography'

const compile = (css: string) =>
  postcss([
    {
      postcssPlugin: 'test-typography',
      AtRule: {
        'splice-type': expandTypography,
        'splice-typography': expandTypography,
      },
    },
  ]).process(css, { from: undefined })

describe('typography compiler', () => {
  it('expands a CSS consumer from the same metrics as JSX roles', async () => {
    const result = await compile(
      '@splice-typography; .custom { @splice-type caption; color: inherit; }',
    )
    const values: Array<string> = []
    result.root.walkRules((rule) => {
      if (
        rule.selector === '.custom' ||
        rule.selector.startsWith('[data-typography="caption"]')
      )
        rule.walkDecls('font-size', (decl) => {
          values.push(decl.value)
        })
    })
    expect(values).toEqual([
      typographyRoles.caption.fontSize,
      typographyRoles.caption.fontSize,
    ])
    expect(result.css).not.toContain('@splice-')
    expect(result.css).toContain('color: inherit')
  })
  it('fails builds on unknown roles', async () => {
    await expect(compile('.custom { @splice-type missing; }')).rejects.toThrow(
      'Unknown typography role',
    )
  })
})
