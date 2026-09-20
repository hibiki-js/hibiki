# Error handling

Hibiki maps failures to stable `HibikiError` codes and returns the code string as the response body.

| Code | Typical status |
|---|---|
| `HIBIKI_VERIFICATION_FAILED` | 400 |
| `HIBIKI_PARSE_FAILED` | 400 |
| `HIBIKI_UNSUPPORTED_EVENT` | 400 when `strictEvents: true` |
| `HIBIKI_UNSUPPORTED_CONTENT_TYPE` | 415 |
| `HIBIKI_PROVIDER_NOT_REGISTERED` | 500 |
| `HIBIKI_DUPLICATE_HANDLER` | 500 |
| `HIBIKI_HANDLER_FAILED` | 500 |

Unsupported provider events return **200** by default so providers do not retry endlessly. Enable `strictEvents: true` to reject them with 400.
