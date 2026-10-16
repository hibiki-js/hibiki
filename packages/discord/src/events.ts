import type { DiscordInteractionType, DiscordEvents } from "./types.js"

export const EVENT_NAMES = {
  1: "ping",
  2: "application_command",
  3: "message_component",
  4: "application_command_autocomplete",
  5: "modal_submit",
} as const satisfies Record<DiscordInteractionType, keyof DiscordEvents>

/** Return whether a value is an interaction type supported by this provider. */
export function isInteractionType(value: unknown): value is DiscordInteractionType {
  return typeof value === "number" && Object.hasOwn(EVENT_NAMES, value)
}
