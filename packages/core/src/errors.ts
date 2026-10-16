export type HibikiErrorCode =
  | "HIBIKI_VERIFICATION_FAILED" | "HIBIKI_PARSE_FAILED" | "HIBIKI_UNSUPPORTED_EVENT"
  | "HIBIKI_UNSUPPORTED_CONTENT_TYPE" | "HIBIKI_PROVIDER_NOT_REGISTERED"
  | "HIBIKI_DUPLICATE_HANDLER" | "HIBIKI_HANDLER_FAILED"
  | "HIBIKI_PAYLOAD_TOO_LARGE" | "HIBIKI_EVENT_IN_PROGRESS" | "HIBIKI_IDEMPOTENCY_UNAVAILABLE"

/** A stable, safe-to-inspect error raised by Hibiki. */
export class HibikiError extends Error {
  constructor(readonly code: HibikiErrorCode, message: string, readonly status: number) {
    super(message)
    this.name = "HibikiError"
  }
}
