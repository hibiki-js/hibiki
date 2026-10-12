import { spawn } from "node:child_process"
import { readFile, readdir } from "node:fs/promises"
import { join } from "node:path"
import ts from "typescript"
import { applicationMetrics } from "./source-metrics.mjs"

export function execute(argv, { cwd, env = process.env, timeoutMs = 120000, isolateProcessGroup = true } = {}) {
  return new Promise((resolve, reject) => {
    const start = performance.now()
    const grouped = process.platform !== "win32" && isolateProcessGroup
    const child = spawn(argv[0], argv.slice(1), { cwd, env, detached: grouped, stdio: ["ignore", "pipe", "pipe"] })
    let stdout = "", stderr = "", timedOut = false
    const stop = signal => {
      try { grouped ? process.kill(-child.pid, signal) : child.kill(signal) } catch {}
    }
    child.stdout.on("data", data => { stdout = (stdout + data).slice(-100000) })
    child.stderr.on("data", data => { stderr = (stderr + data).slice(-100000) })
    const timer = setTimeout(() => { timedOut = true; stop("SIGKILL") }, timeoutMs)
    child.on("error", error => { clearTimeout(timer); reject(error) })
    child.on("close", code => {
      clearTimeout(timer)
      stop("SIGKILL") // clean up only this invocation's remaining descendants
      resolve({ code, timedOut, durationMs: Math.round(performance.now() - start), stdout, stderr })
    })
  })
}

export async function classify(workspace) {
  const pkg = JSON.parse(await readFile(join(workspace, "package.json"), "utf8"))
  const imports = new Set()
  let implementationLines = 0
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (["node_modules", ".eval-build", ".git", ".agents"].includes(entry.name)) continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (/\.(?:[cm]?[jt]s|tsx)$/.test(entry.name) && !/(?:\.test\.|\.spec\.|contract\.ts$)/.test(entry.name)) {
        const source = await readFile(path, "utf8")
        implementationLines += source.split("\n").filter(line => line.trim()).length
        const ast = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true)
        function scan(node) {
          if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && !node.importClause?.isTypeOnly) {
            const bindings = node.importClause?.namedBindings
            if (!bindings || !ts.isNamedImports(bindings) || node.importClause.name || bindings.elements.some(element => !element.isTypeOnly)) imports.add(node.moduleSpecifier.text)
          }
          if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === "require")) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) imports.add(node.arguments[0].text)
          ts.forEachChild(node, scan)
        }
        scan(ast)
      }
    }
  }
  await visit(workspace)
  const application = await applicationMetrics(workspace)
  const dependencies = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).sort()
  return {
    dependencies, imports: application.imports, implementationLines: application.nonblankLines,
    application, projectSourceImports: [...imports].sort(), projectSourceLines: implementationLines,
    hibikiDeclared: dependencies.some(name => name.startsWith("@hibiki-js/")),
    hibikiImported: application.imports.some(name => name.startsWith("@hibiki-js/")),
    sdkImported: application.imports.some(name => name === "stripe" || name.startsWith("@octokit/webhooks")),
  }
}
