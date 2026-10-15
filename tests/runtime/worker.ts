import { runSuite } from "./suite.js"

export default {
  /** Run the compatibility suite inside a workerd request context. */
  async fetch(): Promise<Response> {
    // All crypto, requests, handlers and assertions execute inside workerd.
    try {
      return Response.json(await runSuite())
    } catch (error) {
      return new Response(error instanceof Error ? error.stack : String(error), { status: 500 })
    }
  },
}
