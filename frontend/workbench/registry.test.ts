import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { examples } from './examples'
import catalog from './catalog.json'

describe('workbench registry', () => {
  it('has distinct addressable examples with usable state choices', () => {
    expect(new Set(examples.map((example) => example.id)).size).toBe(
      examples.length,
    )
    for (const example of examples) {
      expect(example.id).toMatch(/^[a-z0-9-]+$/)
      expect(typeof example.component).toBe('function')
      expect(example.states.length).toBeGreaterThan(0)
      expect(new Set(example.states).size).toBe(example.states.length)
    }
  })
  it('accounts for every exported rendered component in the production component tree', () => {
    const root = resolve(process.cwd(), 'src/components')
    const covered = new Set(
      catalog.map((entry) => `${entry.source}:${entry.component}`),
    )
    const containsJsx = (node: ts.Node): boolean => {
      if (
        ts.isJsxElement(node) ||
        ts.isJsxSelfClosingElement(node) ||
        ts.isJsxFragment(node)
      )
        return true
      return ts.forEachChild(node, containsJsx) ?? false
    }
    const inspect = (directory: string, relative = 'components/') => {
      for (const item of readdirSync(directory, { withFileTypes: true })) {
        if (item.isDirectory()) {
          inspect(`${directory}/${item.name}`, `${relative}${item.name}/`)
          continue
        }
        if (!item.name.endsWith('.tsx') || item.name.includes('.test.'))
          continue
        const source = `${relative}${item.name}`
        const file = ts.createSourceFile(
          source,
          readFileSync(`${directory}/${item.name}`, 'utf8'),
          ts.ScriptTarget.Latest,
          true,
        )
        for (const statement of file.statements) {
          if (
            !ts.canHaveModifiers(statement) ||
            !ts
              .getModifiers(statement)
              ?.some(
                (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
              )
          )
            continue
          if (
            ts.isFunctionDeclaration(statement) &&
            statement.name &&
            /^[A-Z]/.test(statement.name.text) &&
            containsJsx(statement)
          )
            expect(
              covered.has(`${source}:${statement.name.text}`),
              `${source}:${statement.name.text} needs a workbench example`,
            ).toBe(true)
          if (ts.isVariableStatement(statement))
            for (const declaration of statement.declarationList.declarations) {
              if (
                ts.isIdentifier(declaration.name) &&
                /^[A-Z]/.test(declaration.name.text) &&
                containsJsx(declaration)
              )
                expect(
                  covered.has(`${source}:${declaration.name.text}`),
                  `${source}:${declaration.name.text} needs a workbench example`,
                ).toBe(true)
            }
        }
      }
    }
    inspect(root)
  })
  it('keeps catalog capture URLs and state choices connected to real examples', () => {
    for (const entry of catalog) {
      expect(entry.example, entry.component).toBeTruthy()
      const example = examples.find(
        (candidate) => candidate.id === entry.example,
      )
      expect(example, entry.component).toBeDefined()
      expect(example?.components, entry.component).toContain(entry.component)
      for (const state of entry.states)
        expect(example?.states, entry.component).toContain(state)
    }
  })
})
