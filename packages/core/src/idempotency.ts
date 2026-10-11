import { HibikiError } from "./index.js"

export type IdempotencyClaim =
  | { status: "acquired"; token: string }
  | { status: "completed" }
  | { status: "pending" }

/** Shared stores must claim atomically and complete/release only the matching token. */
export interface IdempotencyStore {
  claim(key: string): Promise<IdempotencyClaim>
  complete(key: string, token: string): Promise<void>
  release(key: string, token: string): Promise<void>
}

export interface MemoryIdempotencyOptions {
  /** Completed entries are retained for 24 hours by default. */
  retentionMs?: number
  /** Reject new claims at capacity instead of evicting replay protection. Defaults to 10,000. */
  maxEntries?: number
}

/** Process-local protection. Use a shared durable store across instances or restarts. */
export function createMemoryIdempotencyStore(options: MemoryIdempotencyOptions = {}): IdempotencyStore {
  const retentionMs = options.retentionMs ?? 86_400_000
  const maxEntries = options.maxEntries ?? 10_000
  if (!Number.isFinite(retentionMs) || retentionMs <= 0) throw new TypeError("retentionMs must be a positive finite number")
  if (!Number.isSafeInteger(maxEntries) || maxEntries <= 0) throw new TypeError("maxEntries must be a positive safe integer")
  const entries = new Map<string, { token: string; expiresAt?: number }>()
  // Completion order makes pruning proportional to expired entries, rather than all entries.
  const completed = new Map<string, number>()
  return {
    async claim(key) {
      const now = Date.now()
      for (const [expiredKey, expiresAt] of completed) {
        if (expiresAt > now) break
        completed.delete(expiredKey)
        entries.delete(expiredKey)
      }
      const entry = entries.get(key)
      if (entry) return { status: entry.expiresAt === undefined ? "pending" : "completed" }
      if (entries.size >= maxEntries) throw new HibikiError("HIBIKI_IDEMPOTENCY_UNAVAILABLE", "Idempotency store is full", 503)
      const token = crypto.randomUUID()
      entries.set(key, { token })
      return { status: "acquired", token }
    },
    async complete(key, token) {
      const entry = entries.get(key)
      if (entry?.token !== token || entry.expiresAt !== undefined) return
      entry.expiresAt = Date.now() + retentionMs
      completed.set(key, entry.expiresAt)
    },
    async release(key, token) {
      const entry = entries.get(key)
      if (entry?.token === token && entry.expiresAt === undefined) entries.delete(key)
    },
  }
}
