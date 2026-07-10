/** Shared HMAC-SHA256 primitive (Web Crypto, available in the Workers
 * runtime) plus a constant-time comparator. Shopify uses two different
 * encodings for the "same" HMAC-SHA256-over-a-secret operation: webhook
 * body signatures are base64, OAuth callback query-string signatures are
 * hex — callers pick the encoding, this module just computes+compares. */

async function sign(message: string, secret: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
}

export async function hmacSha256Base64(message: string, secret: string): Promise<string> {
  const signature = await sign(message, secret)
  return btoa(String.fromCharCode(...new Uint8Array(signature)))
}

export async function hmacSha256Hex(message: string, secret: string): Promise<string> {
  const signature = await sign(message, secret)
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

/** `a !== b` leaks timing information proportional to how many leading
 * characters matched — every HMAC/signature comparison in this module goes
 * through this instead. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}
