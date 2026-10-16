/** Decode a hexadecimal string, returning undefined for malformed input. */
export function fromHex(value: string): Uint8Array | undefined {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) return undefined
  const bytes = new Uint8Array(value.length / 2)
  // The validation above limits input to ASCII hex; A-F/a-f need a +9 correction.
  for (let i = 0; i < bytes.length; i++) {
    const high = value.charCodeAt(i * 2)
    const low = value.charCodeAt(i * 2 + 1)
    bytes[i] = (((high & 15) + (high > 57 ? 9 : 0)) << 4) | ((low & 15) + (low > 57 ? 9 : 0))
  }
  return bytes
}
