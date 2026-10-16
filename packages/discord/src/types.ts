export type DiscordInteractionType = 1 | 2 | 3 | 4 | 5

export interface DiscordInteraction<TType extends DiscordInteractionType = DiscordInteractionType> {
  id: string
  application_id: string
  type: TType
  token?: string
  version?: number
  data?: Record<string, unknown>
  [key: string]: unknown
}

export interface DiscordEvents {
  ping: DiscordInteraction<1>
  application_command: DiscordInteraction<2>
  message_component: DiscordInteraction<3>
  application_command_autocomplete: DiscordInteraction<4>
  modal_submit: DiscordInteraction<5>
}

/** The public key from your Discord application's General Information page. */
export interface DiscordOptions {
  publicKey: string
  /** Maximum age, in seconds, of a signed interaction. Defaults to 300. */
  tolerance?: number
}

/** A JSON message payload accepted by Discord's Execute Webhook endpoint. */
export interface DiscordWebhookPayload {
  content?: string
  username?: string
  avatar_url?: string
  tts?: boolean
  embeds?: DiscordEmbed[]
  allowed_mentions?: Record<string, unknown>
  components?: Record<string, unknown>[]
  attachments?: Record<string, unknown>[]
  flags?: number
  thread_name?: string
  applied_tags?: string[]
  poll?: Record<string, unknown>
  [key: string]: unknown
}

/** A permissive representation of the message returned by Discord. */
export interface DiscordWebhookMessage {
  id: string
  channel_id: string
  content?: string
  [key: string]: unknown
}

/** A Discord rich embed. Additional Discord embed properties are accepted. */
export interface DiscordEmbed {
  title?: string
  description?: string
  url?: string
  color?: number
  timestamp?: string
  footer?: Record<string, unknown>
  image?: Record<string, unknown>
  thumbnail?: Record<string, unknown>
  author?: Record<string, unknown>
  fields?: Record<string, unknown>[]
  [key: string]: unknown
}

/** A named binary file to upload with a webhook message. File is also accepted as data. */
export interface DiscordWebhookFile {
  filename: string
  data: Blob
}

export interface DiscordWebhookSendOptions {
  /** Files to attach. An omitted or empty list sends a JSON request. */
  files?: readonly DiscordWebhookFile[]
  /** Send the message to an existing thread in the webhook's channel. */
  threadId?: string
  /** Wait for Discord to confirm delivery and return the created message. Defaults to true. */
  wait?: boolean
  /** Cancel the request, for example with AbortSignal.timeout(milliseconds). */
  signal?: AbortSignal
}

export interface DiscordWebhookOptions {
  /** Override global fetch, for example when running in a custom runtime. */
  fetch?: typeof fetch
}

/** A small client for sending messages to an incoming Discord webhook. */
export interface DiscordWebhook {
  send(payload: DiscordWebhookPayload, options: DiscordWebhookSendOptions & { wait: false }): Promise<undefined>
  send(payload: DiscordWebhookPayload, options?: DiscordWebhookSendOptions & { wait?: true }): Promise<DiscordWebhookMessage>
  send(payload: DiscordWebhookPayload, options?: DiscordWebhookSendOptions): Promise<DiscordWebhookMessage | undefined>
}
