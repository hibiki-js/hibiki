import { Hono } from "hono"
import { Hibiki } from "@hibiki-js/core"
import { github } from "@hibiki-js/github"
import { hibiki } from "@hibiki-js/hono"

const webhooks = new Hibiki().use(github({ secret: "github-example" }))
webhooks.on("github.pull_request.opened", async (context) => {
  console.log(context.event.pull_request.number)
})
export const app = new Hono().post("/webhooks/github", hibiki(webhooks, "github"))
