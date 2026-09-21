<script setup lang="ts">
import { useData } from "vitepress"

const { isDark } = useData()

const code = `import { Hibiki } from '@hibiki-js/core'
import { stripe } from '@hibiki-js/stripe'

const app = new Hibiki().use(stripe({ secret }))
app.on('stripe.invoice.paid', (c) => {
  console.log(c.event.id)
})
export default app`

function highlight(source: string): string {
  let text = source
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")

  const stash: string[] = []
  const park = (html: string) => {
    stash.push(html)
    return `\u0000${stash.length - 1}\u0000`
  }

  text = text.replace(/('(?:\\.|[^'\\])*')/g, (match) =>
    park(`<span class="token string">${match}</span>`),
  )
  text = text.replace(
    /\b(import|from|const|export|default|new)\b/g,
    (match) => park(`<span class="token keyword">${match}</span>`),
  )
  text = text.replace(/\b([A-Z][A-Za-z0-9]*)\b/g, (match) =>
    park(`<span class="token class-name">${match}</span>`),
  )

  return text.replace(/\u0000(\d+)\u0000/g, (_, index) => stash[Number(index)]!)
}
</script>

<template>
  <div class="hero-code" :class="{ dark: isDark }">
    <div class="hero-code__window">
      <div class="hero-code__chrome" aria-hidden="true">
        <span class="dot red" />
        <span class="dot yellow" />
        <span class="dot green" />
      </div>
      <pre class="hero-code__body"><code v-html="highlight(code)" /></pre>
    </div>
  </div>
</template>
