import type { EbayOrder, EbayOrderSearchResponse } from './types'

const EBAY_AUTH_HOST = 'https://auth.ebay.com'
const EBAY_API_HOST = 'https://api.ebay.com'
const TOKEN_PATH = '/identity/v1/oauth2/token'
const ORDER_SEARCH_PATH = '/sell/fulfillment/v1/order'

// eBay's own docs pages (developer.ebay.com) returned HTTP 403 when fetched
// directly via WebFetch from this sandbox's network policy — same class of
// block as TikTok's and Amazon's docs portals (see CLAUDE.md Landmines).
// Unlike those two, though, WebSearch's result synthesis here quoted
// developer.ebay.com's own page content directly (request/response shapes,
// the RuName mechanic, the account-deletion challenge-hash algorithm) rather
// than paraphrasing a third-party description of the same spec — a
// first-party *source*, even though not a first-party *fetch*. Everything
// below is unit-tested against this documented format; UNVERIFIED end-to-end
// against a live eBay sandbox/production app (same blocker class as every
// marketplace integration before this one — see ROADMAP.md).

/** Builds the eBay OAuth authorize URL. eBay's `redirect_uri` parameter is
 * not a literal callback URL: it must be the "RuName" eBay assigns per
 * registered app in the Developer Portal, which itself maps to the
 * accept/decline URLs configured there — see env.ts's EBAY_RU_NAME. */
export function buildAuthorizeUrl(params: { clientId: string; ruName: string; scopes: string; state: string }): string {
  const url = new URL(`${EBAY_AUTH_HOST}/oauth2/authorize`)
  url.searchParams.set('client_id', params.clientId)
  url.searchParams.set('redirect_uri', params.ruName)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', params.scopes)
  url.searchParams.set('state', params.state)
  return url.toString()
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${btoa(`${clientId}:${clientSecret}`)}`
}

interface EbayTokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
  refresh_token_expires_in?: number
  token_type: string
  error?: string
  error_description?: string
}

export async function exchangeCodeForToken(
  params: { clientId: string; clientSecret: string; code: string; ruName: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ accessToken: string; accessTokenExpiresAt: string; refreshToken: string; refreshTokenExpiresAt: string }> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.ruName,
  })

  const res = await fetchImpl(`${EBAY_API_HOST}${TOKEN_PATH}`, {
    method: 'POST',
    headers: {
      authorization: basicAuthHeader(params.clientId, params.clientSecret),
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  const responseBody = (await res.json()) as EbayTokenResponse
  if (!res.ok || !responseBody.refresh_token || !responseBody.refresh_token_expires_in) {
    throw new Error(`eBay token exchange failed: ${res.status} ${responseBody.error_description ?? await res.text().catch(() => '')}`)
  }

  const now = Date.now()
  return {
    accessToken: responseBody.access_token,
    accessTokenExpiresAt: new Date(now + responseBody.expires_in * 1000).toISOString(),
    refreshToken: responseBody.refresh_token,
    refreshTokenExpiresAt: new Date(now + responseBody.refresh_token_expires_in * 1000).toISOString(),
  }
}

export async function refreshAccessToken(
  params: { clientId: string; clientSecret: string; refreshToken: string; scopes: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ accessToken: string; accessTokenExpiresAt: string }> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: params.refreshToken,
    scope: params.scopes,
  })

  const res = await fetchImpl(`${EBAY_API_HOST}${TOKEN_PATH}`, {
    method: 'POST',
    headers: {
      authorization: basicAuthHeader(params.clientId, params.clientSecret),
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })

  const responseBody = (await res.json()) as EbayTokenResponse
  if (!res.ok) {
    throw new Error(`eBay token refresh failed: ${res.status} ${responseBody.error_description ?? await res.text().catch(() => '')}`)
  }

  return {
    accessToken: responseBody.access_token,
    accessTokenExpiresAt: new Date(Date.now() + responseBody.expires_in * 1000).toISOString(),
  }
}

/** eBay's Fulfillment API returns line items inline on the order object
 * (unlike Amazon, which needs a separate getOrderItems call per order) —
 * same shape as Shopify/TikTok in this respect. */
export async function fetchOrders(
  params: { accessToken: string; creationDateFrom?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<EbayOrder[]> {
  const url = new URL(`${EBAY_API_HOST}${ORDER_SEARCH_PATH}`)
  if (params.creationDateFrom) {
    url.searchParams.set('filter', `creationdate:[${params.creationDateFrom}..]`)
  }
  url.searchParams.set('limit', '50')

  const res = await fetchImpl(url.toString(), {
    headers: { authorization: `Bearer ${params.accessToken}` },
  })

  if (!res.ok) {
    throw new Error(`eBay order fetch failed: ${res.status} ${await res.text()}`)
  }

  const body = (await res.json()) as EbayOrderSearchResponse
  return body.orders ?? []
}

/** eBay's mandatory Marketplace Account Deletion notification endpoint
 * verification: when the endpoint URL is registered in the Developer
 * Portal, eBay sends a GET with a `challenge_code` query param; the
 * endpoint must respond `{"challengeResponse": "<hash>"}` where hash is the
 * hex SHA-256 digest of challengeCode + verificationToken + endpoint,
 * concatenated in that order. Every eBay app that stores eBay user data
 * must subscribe to this — see handlers.ts's handleDeletionChallenge. */
export async function computeChallengeResponse(params: {
  challengeCode: string
  verificationToken: string
  endpoint: string
}): Promise<string> {
  const message = `${params.challengeCode}${params.verificationToken}${params.endpoint}`
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message))
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
