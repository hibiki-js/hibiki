export const encoder = /* @__PURE__ */ new TextEncoder()

export function hex(bytes: Uint8Array): string {
  const digits = "0123456789abcdef"
  let result = ""
  for (const byte of bytes) result += digits[byte >> 4]! + digits[byte & 15]!
  return result
}

/** Decode exactly one SHA-256 digest; reject malformed signature encodings. */
export function fromHex(value: string): Uint8Array | undefined {
  if (!/^[0-9a-f]{64}$/i.test(value)) return undefined
  const bytes = new Uint8Array(value.length / 2)
  // The validation above limits input to ASCII hex; A-F/a-f need a +9 correction.
  for (let i = 0; i < bytes.length; i++) {
    const high = value.charCodeAt(i * 2)
    const low = value.charCodeAt(i * 2 + 1)
    bytes[i] = (((high & 15) + (high > 57 ? 9 : 0)) << 4) | ((low & 15) + (low > 57 ? 9 : 0))
  }
  return bytes
}
