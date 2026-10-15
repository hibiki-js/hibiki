import { HibikiError } from "./index.js"

export type IdempotencyClaim =
  | { status: "acquired"; token: string }
  | { status: "completed" }
  | { status: "pending" }

/** Shared stores must claim atomically and complete/release only the matching token. */
export interface IdempotencyStore {
  /** Atomically claim a new ID or report an existing running/completed claim. */
  claim(key: string): Promise<IdempotencyClaim>
  /** Mark only the token owner's running claim completed. */
  complete(key: string, token: string): Promise<void>
  /** Remove only the token owner's running claim, preserving completed IDs. */
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
  // Resume across claims so a burst does not repeatedly scan deleted Map slots.
  let pruning: ReturnType<typeof completed.entries> | undefined
  return {
    async claim(key) {
      const now = Date.now()
      pruning ??= completed.entries()
      for (let pruned = 0; pruned < 128; pruned++) {
        const next = pruning.next()
        if (next.done || next.value[1] > now) {
          pruning = undefined
          break
        }
        const [expiredKey] = next.value
        completed.delete(expiredKey)
        entries.delete(expiredKey)
      }
      let entry = entries.get(key)
      // The requested ID may be beyond this claim's pruning budget.
      if (entry?.expiresAt !== undefined && entry.expiresAt <= now) {
        entries.delete(key)
        completed.delete(key)
        entry = undefined
      }
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
