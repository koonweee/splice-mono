import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import postcss from 'postcss'

const root = fileURLToPath(new URL('../src/', import.meta.url))
// These modules own palettes, rather than consuming an application appearance.
const paletteOwners = new Map([
  ['lib/design-system/', 'Canonical appearance and static offline palettes'],
  [
    'lib/category-colors.ts',
    'User/category data colors and foreground contrast',
  ],
  ['lib/crypto-utils.ts', 'Network brand identities'],
])
const literalColor = /#[\da-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/i
const violations = []
async function inspect(directory, relative = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = relative + entry.name
    if (
      name.startsWith('api/') ||
      name.includes('.test.') ||
      name === 'routeTree.gen.ts'
    )
      continue
    if (
      [...paletteOwners.keys()].some(
        (owner) =>
          name === owner || (owner.endsWith('/') && name.startsWith(owner)),
      )
    )
      continue
    if (entry.isDirectory()) {
      await inspect(`${directory}/${entry.name}`, `${name}/`)
      continue
    }
    if (!/\.(css|tsx?|jsx?)$/.test(name)) continue
    const source = await readFile(`${directory}/${entry.name}`, 'utf8')
    if (name.endsWith('.css')) {
      postcss.parse(source, { from: name }).walkDecls((declaration) => {
        if (literalColor.test(declaration.value))
          violations.push(
            `${name}:${declaration.source.start.line}: ${declaration.prop}: ${declaration.value}`,
          )
      })
    } else {
      const file = ts.createSourceFile(
        name,
        source,
        ts.ScriptTarget.Latest,
        true,
      )
      const visit = (node) => {
        if (
          (ts.isStringLiteral(node) ||
            ts.isNoSubstitutionTemplateLiteral(node) ||
            ts.isTemplateHead(node) ||
            ts.isTemplateMiddle(node) ||
            ts.isTemplateTail(node)) &&
          literalColor.test(node.text)
        ) {
          const { line } = file.getLineAndCharacterOfPosition(
            node.getStart(file),
          )
          violations.push(`${name}:${line + 1}: ${node.text}`)
        }
        ts.forEachChild(node, visit)
      }
      visit(file)
    }
  }
}
await inspect(root)
if (violations.length) {
  console.error(
    'Raw styling colors must move to an existing token or an explicitly documented palette owner:\n' +
      violations.join('\n'),
  )
  process.exitCode = 1
} else console.log('Styling color ownership check passed.')
