import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
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
  it('requires addressable owner loading/ready pairs for every skeleton', () => {
    for (const entry of catalog) {
      expect(existsSync(resolve('src', entry.source)), entry.source).toBe(true)
      if (!/(?:Skeleton|Placeholder)$/.test(entry.component)) continue
      expect(
        'loadingPairs' in entry,
        `${entry.component} needs paired owner coverage`,
      ).toBe(true)
      if (!('loadingPairs' in entry) || !entry.loadingPairs) continue
      expect(entry.loadingPairs.length, entry.component).toBeGreaterThan(0)
      for (const pair of entry.loadingPairs) {
        const pairExample = examples.find(
          (candidate) =>
            candidate.id === ('example' in pair ? pair.example : entry.example),
        )
        expect(pairExample?.components, entry.component).toContain(pair.owner)
        expect(pair.interaction.length, entry.component).toBeGreaterThan(20)
        expect(pair.phases.length, entry.component).toBeGreaterThan(0)
        for (const phase of pair.phases)
          expect(['route', 'module', 'data']).toContain(phase)
        for (const state of [pair.loading.state, pair.ready.state])
          expect(pairExample?.states, entry.component).toContain(state)
        const loadingQuery = new URLSearchParams(
          Object.entries(pair.loading.query).filter(
            (parameter): parameter is [string, string] =>
              typeof parameter[1] === 'string',
          ),
        )
        const readyQuery = new URLSearchParams(
          Object.entries(pair.ready.query).filter(
            (parameter): parameter is [string, string] =>
              typeof parameter[1] === 'string',
          ),
        )
        expect(loadingQuery.get('tab'), entry.component).toBe(
          readyQuery.get('tab'),
        )
        expect(
          readyQuery.has('hold') ||
            readyQuery.has('holdModules') ||
            readyQuery.has('holdModule') ||
            readyQuery.has('holdRoute'),
          entry.component,
        ).toBe(false)
        const hasHold =
          loadingQuery.has('hold') ||
          loadingQuery.has('holdModules') ||
          loadingQuery.has('holdModule') ||
          loadingQuery.has('holdRoute')
        expect(
          hasHold || pair.loading.state !== pair.ready.state,
          `${entry.component} has identical capture phases`,
        ).toBe(true)
        if (loadingQuery.has('hold'))
          expect(pair.releaseEvents).toContain('workbench:release-reads')
        if (loadingQuery.has('holdModules') || loadingQuery.has('holdModule'))
          expect(pair.releaseEvents).toContain('workbench:release-modules')
        if (loadingQuery.has('holdRoute'))
          expect(pair.releaseEvents).toContain('workbench:release-route')
      }
    }
  })

  it('keeps pending owners independent of eager feature implementations', () => {
    const production = resolve('src')
    const files: Array<string> = []
    const collect = (directory: string) => {
      for (const item of readdirSync(directory, { withFileTypes: true })) {
        const file = resolve(directory, item.name)
        if (item.isDirectory()) collect(file)
        else if (/\.tsx?$/.test(item.name) && !item.name.includes('.test.'))
          files.push(file)
      }
    }
    collect(production)
    const graph = new Map<string, Array<string>>()
    const retired = new Set([
      'RowSkeleton',
      'TableSkeleton',
      'ChartSkeleton',
      'FormSkeleton',
      'SettingsSkeleton',
      'AccountsSkeleton',
      'AnalysisSkeleton',
      'AccountDetailsSkeleton',
      'AccessTokensSkeleton',
      'CategoriesTableSkeleton',
    ])
    const resolveLocal = (file: string, specifier: string) => {
      const base = specifier.startsWith('.')
        ? resolve(dirname(file), specifier)
        : specifier.startsWith('@/')
          ? resolve(production, specifier.slice(2))
          : undefined
      if (!base) return undefined
      return [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        `${base}/index.ts`,
        `${base}/index.tsx`,
      ].find((candidate) => files.includes(candidate))
    }
    for (const file of files) {
      const ast = ts.createSourceFile(
        file,
        readFileSync(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
      )
      const dependencies: Array<string> = []
      for (const statement of ast.statements) {
        if (
          !ts.isImportDeclaration(statement) &&
          !ts.isExportDeclaration(statement)
        )
          continue
        if (
          !statement.moduleSpecifier ||
          !ts.isStringLiteral(statement.moduleSpecifier)
        )
          continue
        const specifier = statement.moduleSpecifier.text
        const clause = ts.isImportDeclaration(statement)
          ? statement.importClause
          : statement
        if (clause?.isTypeOnly) continue
        const bindings = ts.isImportDeclaration(statement)
          ? statement.importClause?.namedBindings
          : statement.exportClause
        const names =
          bindings &&
          (ts.isNamedImports(bindings) || ts.isNamedExports(bindings))
            ? bindings.elements
                .filter((item) => !item.isTypeOnly)
                .map((item) => item.propertyName?.text ?? item.name.text)
            : []
        if (
          specifier.endsWith('/loading/LoadingSkeleton') ||
          specifier === './LoadingSkeleton'
        ) {
          expect(
            names.filter((name) => retired.has(name)),
            `${file} imports retired domain shapes`,
          ).toEqual([])
        }
        if (
          bindings &&
          (ts.isNamedImports(bindings) || ts.isNamedExports(bindings)) &&
          bindings.elements.length > 0 &&
          names.length === 0 &&
          !(ts.isImportDeclaration(statement) && statement.importClause?.name)
        )
          continue
        dependencies.push(resolveLocal(file, specifier) ?? specifier)
      }
      graph.set(file, dependencies)
    }
    // Derive the protected lazy destinations from the actual loader contract,
    // so adding a new feature does not require copying a second denylist.
    const loaderFile = resolve(production, 'lib/feature-loaders.ts')
    const loaderAst = ts.createSourceFile(
      loaderFile,
      readFileSync(loaderFile, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    )
    const lazyDestinations = new Set<string>()
    const inspectImports = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length > 0 &&
        ts.isStringLiteral(node.arguments[0])
      ) {
        lazyDestinations.add(
          resolveLocal(loaderFile, node.arguments[0].text) ??
            node.arguments[0].text,
        )
      }
      ts.forEachChild(node, inspectImports)
    }
    inspectImports(loaderAst)
    const heavyPackages = ['recharts', '@mantine/charts', 'mantine-react-table']
    const pendingRoots = new Set(
      catalog
        .filter((entry) => /(?:Skeleton|Placeholder)$/.test(entry.component))
        .map((entry) => resolve(production, entry.source)),
    )
    for (const root of pendingRoots) {
      const seen = new Set<string>()
      const visit = (file: string, chain: Array<string>) => {
        if (seen.has(file)) return
        seen.add(file)
        for (const dependency of graph.get(file) ?? []) {
          expect(
            lazyDestinations.has(dependency) ||
              heavyPackages.some(
                (pkg) => dependency === pkg || dependency.startsWith(`${pkg}/`),
              ),
            `${[...chain, file, dependency].join(' -> ')} eagerly loads a chart/table implementation`,
          ).toBe(false)
          if (graph.has(dependency)) visit(dependency, [...chain, file])
        }
      }
      visit(root, [])
    }
  })
})
