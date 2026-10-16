import { readFile, writeFile } from "node:fs/promises"
import ts from "typescript"

const check = process.argv.includes("--check")
const catalog = { schemaVersion: 1, typePolicy: "Curated structural types, not runtime payload validation or a guarantee for every upstream API version.", providers: {} }
for (const [provider, interfaceName, format, source] of [
  ["stripe", "StripeEvents", "snapshot events with data.object; thin events are not supported", "https://docs.stripe.com/api/events/object"],
  ["github", "GitHubEvents", "application/json webhook deliveries; event/action pairs are curated", "https://docs.github.com/en/webhooks/webhook-events-and-payloads"],
  ["discord", "DiscordEvents", "signed Discord Interactions (incoming webhooks are a separate outgoing API)", "https://discord.com/developers/docs/interactions/receiving-and-responding"],
]) {
  const text = await readFile(`packages/${provider}/src/types.ts`, "utf8")
  const ast = ts.createSourceFile(`${provider}.ts`, text, ts.ScriptTarget.Latest, true)
  const definition = ast.statements.find(node => ts.isInterfaceDeclaration(node) && node.name.text === interfaceName)
  if (!definition) throw new Error(`Missing ${interfaceName}`)
  const events = definition.members.map(node => node.name?.text).filter(Boolean).sort()
  const pkg = JSON.parse(await readFile(`packages/${provider}/package.json`, "utf8"))
  catalog.providers[provider] = { package: pkg.name, version: pkg.version, format, events, specification: source }
  if (provider !== "discord") for (const locale of ["", "ja/"]) {
    const doc = await readFile(`docs/${locale}providers/${provider}.md`, "utf8")
    for (const event of events) if (!doc.includes(`\`${event}\``)) throw new Error(`Missing documented event: ${locale}${provider}.${event}`)
  }
}
const links = [
  ["Choosing Hibiki", "guide/choosing-hibiki"], ["Getting started", "guide/getting-started"],
  ["Core API and response behavior", "reference/core"], ["Testing and signed requests", "reference/testing"],
  ["Stripe snapshot provider", "providers/stripe"], ["GitHub JSON provider", "providers/github"],
  ["Discord Interactions provider", "providers/discord"], ["Hono integration", "integrations/hono"],
  ["Error handling", "guide/error-handling"],
]
for (const [, path] of links) await readFile(`docs/${path}.md`)
const small = "# Hibiki\n\nTypeScript webhooks on Web Standards Request/Response. Core and providers have no runtime dependencies. Register providers with new Hibiki().use(...), handlers with .on(...), and call .handle(request, { provider }). Stripe snapshot events, GitHub JSON deliveries, and Discord Interactions are supported. Hibiki does not provide durable storage, queues, automatic retries, or global deduplication. See https://hibiki-js.github.io/llms.txt for task-specific references.\n"
const full = small + "\n## References\n\n" + links.map(([label, path]) => `- [${label}](https://hibiki-js.github.io/${path}.html): Markdown source at https://raw.githubusercontent.com/hibiki-js/hibiki/main/docs/${path}.md`).join("\n") + "\n\n## Machine-readable coverage\n\n- https://hibiki-js.github.io/providers.json contains provider package versions, supported native events, formats and specification sources. Match these versions to installed packages. Main-branch Markdown may differ from an older release.\n- https://github.com/hibiki-js/hibiki/tree/main/skills/hibiki contains the optional usage skill.\n"
for (const [file, content] of [
  ["docs/public/providers.json", JSON.stringify(catalog, null, 2) + "\n"],
  ["llms.txt", full], ["docs/public/llms.txt", full], ["llms-small.txt", small], ["docs/public/llms-small.txt", small],
]) {
  if (check) {
    if (await readFile(file, "utf8") !== content) throw new Error(`${file} is stale; run pnpm generate:agent-docs`)
  } else await writeFile(file, content)
}
console.log(check ? "Agent references are current" : "Generated agent references")
