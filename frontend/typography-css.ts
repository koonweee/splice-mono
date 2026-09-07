import postcss from 'postcss'
import {
  compactTypographyRoles,
  typographyDefaults,
  typographyRoles,
} from './src/lib/design-system/typography'
import { mediaQueries } from './src/lib/media-queries'
import type { TypographyRole } from './src/lib/design-system/typography'
import type { AtRule } from 'postcss'

function declarations(roleName: string, compact = false) {
  if (!Object.hasOwn(typographyRoles, roleName))
    throw new Error(`Unknown typography role: ${roleName}`)
  const role = roleName as TypographyRole
  const metrics = compact ? compactTypographyRoles[role] : typographyRoles[role]
  if (!metrics) throw new Error(`Unknown typography role: ${role}`)
  return Object.entries(metrics).map(([prop, value]) =>
    postcss.decl({
      prop: prop.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`),
      value: String(value),
    }),
  )
}

export function expandTypography(rule: AtRule) {
  if (rule.name === 'splice-type') {
    const role = rule.params as TypographyRole
    rule.replaceWith(...declarations(role))
  } else if (rule.name === 'splice-typography') {
    const rules = Object.entries(typographyDefaults).map(([role, selector]) =>
      postcss
        .rule({ selector })
        .append(...declarations(role as TypographyRole)),
    )
    for (const role of Object.keys(typographyRoles) as Array<TypographyRole>) {
      // Explicit roles win over library classes without !important.
      const selector = `[data-typography="${role}"][data-typography]`
      rules.push(postcss.rule({ selector }).append(...declarations(role)))
    }
    for (const generated of rules) rule.before(generated)
    const compact = postcss.atRule({
      name: 'media',
      params: mediaQueries['--compact-layout'],
    })
    for (const role of Object.keys(compactTypographyRoles) as Array<
      keyof typeof compactTypographyRoles
    >) {
      compact.append(
        postcss
          .rule({ selector: `[data-typography="${role}"][data-typography]` })
          .append(...declarations(role, true)),
      )
    }
    rule.replaceWith(compact)
  }
}
