import { HibikiError } from "./errors.js"

/** Bound actual stream bytes; Content-Length alone is not trustworthy. */
export async function readBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  const contentLength = request.headers.get("content-length")
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {
    throw new HibikiError("HIBIKI_PAYLOAD_TOO_LARGE", "Webhook body is too large", 413)
  }
  const reader = request.clone().body?.getReader()
  if (!reader) return new Uint8Array()
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > maxBytes) {
        // A cloned stream is teed; cancellation may wait for the original consumer.
        void reader.cancel().catch(() => {})
        throw new HibikiError("HIBIKI_PAYLOAD_TOO_LARGE", "Webhook body is too large", 413)
      }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  if (chunks.length === 1) return chunks[0]!.slice()
  const body = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength }
  return body
}
