import { hmacSha256Hex, timingSafeEqual } from './hmac'

const STATE_TTL_MS = 10 * 60 * 1000

/** The Worker is stateless (no KV/session store), so the OAuth `state` param
 * doubles as a signed, self-contained CSRF token: it carries the initiating
 * brand's id and an expiry, HMAC-signed with the app's client secret. The
 * callback verifies the signature and expiry before trusting the embedded
 * brand id — an attacker who calls the callback directly with an arbitrary
 * `state` cannot forge a valid signature without the secret, so they cannot
 * link their own Shopify store's OAuth code to a victim's brand account. */
export async function signInstallState(brandId: string, clientSecret: string): Promise<string> {
  const payload = `${brandId}.${Date.now() + STATE_TTL_MS}`
  const encodedPayload = btoa(payload)
  const signature = await hmacSha256Hex(encodedPayload, clientSecret)
  return `${encodedPayload}.${signature}`
}

export async function verifyInstallState(state: string, clientSecret: string): Promise<string | null> {
  const separatorIndex = state.lastIndexOf('.')
  if (separatorIndex === -1) {
    return null
  }

  const encodedPayload = state.slice(0, separatorIndex)
  const signature = state.slice(separatorIndex + 1)
  const expectedSignature = await hmacSha256Hex(encodedPayload, clientSecret)

  if (!timingSafeEqual(signature, expectedSignature)) {
    return null
  }

  const dotIndex = atob(encodedPayload).lastIndexOf('.')
  if (dotIndex === -1) {
    return null
  }

  const brandId = atob(encodedPayload).slice(0, dotIndex)
  const expiresAt = Number(atob(encodedPayload).slice(dotIndex + 1))

  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    return null
  }

  return brandId
}
