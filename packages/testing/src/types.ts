import type { ProviderRegistry } from "@hibiki-js/core"

type Secrets<R extends ProviderRegistry> = Partial<Record<keyof R & string, string>>

export interface EventRequestOptions {
  /** Override the signing secret, for example to test an invalid signature. */
  secret?: string
  /** Stripe signing timestamp in seconds, for expiry tests. */
  timestamp?: number
}

export interface WebhookTestOptions<R extends ProviderRegistry> {
  secrets?: Secrets<R>
}
