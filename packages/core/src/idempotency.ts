import { HibikiError } from "./errors.js"

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
  type Completed = {
    token?: undefined
    key: string
    expiresAt: number
    previous: Completed | undefined
    next: Completed | undefined
  }
  const entries = new Map<string, { token: string; expiresAt?: undefined } | Completed>()
  // Only current completed entries are queued; pending IDs never expire.
  let head: Completed | undefined
  let tail: Completed | undefined

  // Unlink directly even when a requested expired ID is beyond the cleanup batch.
  function removeCompleted(entry: Completed): void {
    if (entry.previous) entry.previous.next = entry.next
    else head = entry.next
    if (entry.next) entry.next.previous = entry.previous
    else tail = entry.previous
    entry.previous = undefined
    entry.next = undefined
    entries.delete(entry.key)
  }
  return {
    async claim(key) {
      const now = Date.now()
      for (let pruned = 0; pruned < 128 && head && head.expiresAt <= now; pruned++) removeCompleted(head)
      let entry = entries.get(key)
      // The requested ID may be beyond this claim's pruning budget.
      if (entry?.expiresAt !== undefined && entry.expiresAt <= now) {
        removeCompleted(entry)
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
      if (!entry || entry.expiresAt !== undefined || entry.token !== token) return
      // Ownership is only needed while pending; completed IDs retain replay protection without it.
      const completed: Completed = { key, expiresAt: Date.now() + retentionMs, previous: tail, next: undefined }
      if (tail) tail.next = completed
      else head = completed
      tail = completed
      entries.set(key, completed)
    },
    async release(key, token) {
      const entry = entries.get(key)
      if (entry && entry.expiresAt === undefined && entry.token === token) entries.delete(key)
    },
  }
}
