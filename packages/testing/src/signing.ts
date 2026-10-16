import { encoder, hex } from "../../../internal/encoding.js"

export type Signer = (secret: string, body: string) => Promise<string>

export function importSigningKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
}

export async function hmac(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  return hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body) as unknown as BufferSource)))
}
