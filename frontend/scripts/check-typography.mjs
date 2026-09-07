import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { typographyViolations } from './typography-policy.mjs'
const root = fileURLToPath(new URL('../src/', import.meta.url))
const definitions = await readFile(
  `${root}lib/design-system/typography.ts`,
  'utf8',
)
const definitionFile = ts.createSourceFile(
  'typography.ts',
  definitions,
  ts.ScriptTarget.Latest,
  true,
)
const roles = new Set()
function collect(node) {
  if (
    ts.isVariableDeclaration(node) &&
    node.name.getText(definitionFile) === 'typographyRoles'
  ) {
    const object = ts.isAsExpression(node.initializer)
      ? node.initializer.expression
      : node.initializer
    for (const property of object.properties)
      roles.add(property.name.getText(definitionFile))
  }
  ts.forEachChild(node, collect)
}
collect(definitionFile)
const errors = []
async function inspect(directory, relative = '') {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = relative + entry.name
    if (
      name.startsWith('api/') ||
      name.startsWith('lib/design-system/') ||
      name.includes('.test.') ||
      name === 'routeTree.gen.ts'
    )
      continue
    if (entry.isDirectory())
      await inspect(`${directory}/${entry.name}`, `${name}/`)
    else if (/\.(css|tsx?)$/.test(name))
      errors.push(
        ...typographyViolations(
          name,
          await readFile(`${directory}/${entry.name}`, 'utf8'),
          roles,
        ),
      )
  }
}
await inspect(root)
if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
} else
  console.log(
    `Typography ownership check passed (${roles.size} canonical roles).`,
  )
