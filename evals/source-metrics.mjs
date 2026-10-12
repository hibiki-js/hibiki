import { readFile, stat } from "node:fs/promises"
import { dirname, extname, join, relative, resolve } from "node:path"
import ts from "typescript"

/** Measure application sources reachable from app.ts, excluding standalone verification scripts. */
export async function applicationMetrics(workspace) {
  const root = resolve(workspace), files = new Set(), imports = new Set(), unresolved = new Set()
  let nonblankLines = 0, statements = 0, assertions = 0, explicitAny = 0
  async function localSource(from, specifier) {
    const target = resolve(dirname(from), specifier)
    if (relative(root, target).startsWith("..")) return undefined
    const extension = extname(target)
    const candidates = /\.[cm]?js$/.test(extension)
      ? [target.replace(/\.([cm]?)js$/, ".$1ts"), target]
      : [target, `${target}.ts`, `${target}.js`, join(target, "index.ts"), join(target, "index.js")]
    for (const candidate of candidates) {
      try { if ((await stat(candidate)).isFile() && /\.[cm]?[jt]sx?$/.test(candidate)) return candidate } catch {}
    }
  }
  async function visit(path) {
    if (files.has(path) || relative(root, path) === "contract.ts") return
    files.add(path)
    const source = await readFile(path, "utf8")
    nonblankLines += source.split("\n").filter(line => line.trim()).length
    const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)
    const specs = []
    function scan(node) {
      if (ts.isStatement(node) && !ts.isBlock(node)) statements++
      if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) assertions++
      if (node.kind === ts.SyntaxKind.AnyKeyword) explicitAny++
      const bindings = ts.isImportDeclaration(node) ? node.importClause?.namedBindings : undefined
      const runtimeImport = ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly &&
        (!bindings || !ts.isNamedImports(bindings) || node.importClause.name || bindings.elements.some(element => !element.isTypeOnly))
      if (runtimeImport || ts.isExportDeclaration(node) && !node.isTypeOnly) {
        if (node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) specs.push(node.moduleSpecifier.text)
      }
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === "require") && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) specs.push(node.arguments[0].text)
      ts.forEachChild(node, scan)
    }
    scan(ast)
    for (const spec of specs) {
      if (!spec.startsWith(".")) imports.add(spec)
      else {
        const local = await localSource(path, spec)
        if (local) await visit(local)
        else unresolved.add(`${relative(root, path)}: ${spec}`)
      }
    }
  }
  await visit(join(root, "app.ts"))
  return { files: [...files].map(path => relative(root, path)).sort(), nonblankLines, statements, assertions, explicitAny, imports: [...imports].sort(), unresolved: [...unresolved].sort() }
}
