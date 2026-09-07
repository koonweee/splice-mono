import ts from 'typescript'
import postcss from 'postcss'

const fontProps = new Set([
  'fontSize',
  'fontWeight',
  'lineHeight',
  'fontFamily',
  'fw',
  'fz',
  'lh',
])
const textComponents = new Set(['Text', 'Title', 'Anchor', 'Code'])
const cssProps = /^(font(?:-size|-weight|-family)?|line-height)$/

/** Inspect authored source, never generated CSS or dependency internals. */
export function typographyViolations(name, source, roles) {
  const errors = []
  const add = (line, message) => errors.push(`${name}:${line}: ${message}`)
  if (name.endsWith('.css')) {
    const file = postcss.parse(source, { from: name })
    file.walkDecls((decl) => {
      if (cssProps.test(decl.prop) && decl.value !== 'inherit')
        add(decl.source.start.line, `Use @splice-type <role>, not ${decl.prop}`)
    })
    file.walkAtRules('splice-type', (rule) => {
      if (!roles.has(rule.params))
        add(rule.source.start.line, `Unknown role ${rule.params}`)
    })
    return errors
  }
  const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true)
  const localText = new Set(textComponents)
  for (const statement of file.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      statement.moduleSpecifier.text !== '@mantine/core'
    )
      continue
    const bindings = statement.importClause?.namedBindings
    if (bindings && ts.isNamedImports(bindings)) {
      for (const specifier of bindings.elements)
        if (textComponents.has((specifier.propertyName ?? specifier.name).text))
          localText.add(specifier.name.text)
    }
  }
  function visit(node) {
    const line =
      file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1
    if (ts.isJsxAttribute(node)) {
      const prop = node.name.getText(file)
      const tag = node.parent.parent.tagName?.getText(file)
      if (fontProps.has(prop) || (prop === 'size' && localText.has(tag)))
        add(line, `Use data-typography, not ${tag}.${prop}`)
      if (
        prop === 'data-typography' &&
        node.initializer &&
        ts.isStringLiteral(node.initializer) &&
        !roles.has(node.initializer.text)
      )
        add(line, `Unknown role ${node.initializer.text}`)
    }
    if (
      ts.isPropertyAssignment(node) &&
      fontProps.has(node.name.getText(file).replace(/['"]/g, ''))
    )
      add(line, 'Typography metrics belong in design-system/typography.ts')
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      /\b(?:font-size|font-weight|line-height)\s*:/.test(node.text)
    )
      add(line, 'Inline CSS typography must use a canonical role')
    if (
      (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
      /\b(?:text-(?:xs|sm|base|lg|xl|[2-9]xl|\[)|font-(?:thin|light|normal|medium|semibold|bold|black)|leading-)/.test(
        node.text,
      )
    )
      add(line, 'Typography utility classes must use a canonical role')
    ts.forEachChild(node, visit)
  }
  visit(file)
  return errors
}
