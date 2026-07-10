import { hmacSha256Hex, timingSafeEqual } from '../shared/hmac'
import type { TiktokOrder, TiktokShop } from './types'

const TIKTOK_AUTH_HOST = 'https://auth.tiktok-shops.com'
const TIKTOK_API_HOST = 'https://open-api.tiktokglobalshop.com'
const ORDER_SEARCH_PATH = '/order/202309/orders/search'
const AUTHORIZED_SHOPS_PATH = '/authorization/202309/shops'

// TikTok Shop's own "sign your API request" and OAuth guide pages
// (partner.tiktokshop.com) returned HTTP 403 when fetched directly from this
// sandbox's network policy — same class of block as the sandbox's other
// documented CDN/registry blocks (see CLAUDE.md Landmines). Everything below
// is built from secondary sources describing the same published spec
// (the TikTok Shop Partner API's HMAC-SHA256 request signing and its
// auth-code token exchange), not a first-party doc fetch, and is
// UNVERIFIED end-to-end against a live TikTok Shop app — every code path
// here is unit-tested against this documented format instead, the same
// posture Phase 5 used for Shopify's HMAC/OAuth code before its own live
// verification (which Shopify's docs *were* fetchable for).

/** TikTok's request-signing algorithm: sign_string = path + sorted(query
 * params, excluding "sign" and "access_token", concatenated as
 * `${key}${value}` with no separator) + body (raw JSON string, only present
 * for a JSON request body — omitted for a bodyless GET). The secret wraps
 * both ends of that string, HMAC-SHA256 keyed by the same secret, hex,
 * uppercase. */
export async function signRequest(params: {
  path: string
  queryParams: Record<string, string>
  body?: string
  appSecret: string
}): Promise<string> {
  const sortedKeys = Object.keys(params.queryParams)
    .filter((key) => key !== 'sign' && key !== 'access_token')
    .sort()
  const paramString = sortedKeys.map((key) => `${key}${params.queryParams[key]}`).join('')
  const signString = `${params.path}${paramString}${params.body ?? ''}`
  const wrapped = `${params.appSecret}${signString}${params.appSecret}`
  const hex = await hmacSha256Hex(wrapped, params.appSecret)
  return hex.toUpperCase()
}

/** Builds the TikTok Shop OAuth authorize URL. Unlike Shopify's
 * buildAuthorizeUrl, this takes no redirect_uri: TikTok Shop apps register
 * their callback URL once in the Partner Center rather than passing it per
 * request (ASSUMPTION, same 403-blocked-docs caveat as above) — so
 * TiktokWorkerEnv has no WORKER_URL, unlike ShopifyWorkerEnv. */
export function buildAuthorizeUrl(params: { appKey: string; state: string }): string {
  const url = new URL(`${TIKTOK_AUTH_HOST}/oauth/authorize`)
  url.searchParams.set('app_key', params.appKey)
  url.searchParams.set('state', params.state)
  return url.toString()
}

interface TiktokTokenResponse {
  code: number
  message: string
  data?: {
    access_token: string
    access_token_expire_in: number
    refresh_token: string
  }
}

export async function exchangeCodeForToken(
  params: { appKey: string; appSecret: string; authCode: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ accessToken: string; refreshToken: string; accessTokenExpiresAt: string }> {
  const url = new URL(`${TIKTOK_AUTH_HOST}/api/v2/token/get`)
  url.searchParams.set('app_key', params.appKey)
  url.searchParams.set('app_secret', params.appSecret)
  url.searchParams.set('auth_code', params.authCode)
  url.searchParams.set('grant_type', 'authorized_code')

  const res = await fetchImpl(url.toString())
  if (!res.ok) {
    throw new Error(`TikTok token exchange failed: ${res.status} ${await res.text()}`)
  }

  const body = (await res.json()) as TiktokTokenResponse
  if (body.code !== 0 || !body.data) {
    throw new Error(`TikTok token exchange returned an error: ${body.code} ${body.message}`)
  }

  return {
    accessToken: body.data.access_token,
    refreshToken: body.data.refresh_token,
    accessTokenExpiresAt: new Date(Date.now() + body.data.access_token_expire_in * 1000).toISOString(),
  }
}

interface TiktokAuthorizedShopsResponse {
  code: number
  message: string
  data?: { shops: TiktokShop[] }
}

/** TikTok's OAuth callback carries only `code`/`state` — no shop id — so
 * the shop this token is authorized for is resolved with a follow-up signed
 * call after token exchange. A brand connecting exactly one shop (this
 * repo's scope, matching Shopify's one-shop-per-brand model) takes the
 * first entry; a seller with multiple shops authorized to the same app
 * would need multi-shop UI this phase doesn't build (scope note, mirrors
 * ROADMAP.md's Phase 4 single-entry SKU-mapping precedent — flagged, not
 * silently dropped). */
export async function getAuthorizedShops(
  params: { appKey: string; appSecret: string; accessToken: string },
  fetchImpl: typeof fetch = fetch,
): Promise<TiktokShop[]> {
  const queryParams: Record<string, string> = {
    app_key: params.appKey,
    timestamp: String(Math.floor(Date.now() / 1000)),
  }
  const sign = await signRequest({ path: AUTHORIZED_SHOPS_PATH, queryParams, appSecret: params.appSecret })

  const url = new URL(`${TIKTOK_API_HOST}${AUTHORIZED_SHOPS_PATH}`)
  for (const [key, value] of Object.entries(queryParams)) {
    url.searchParams.set(key, value)
  }
  url.searchParams.set('sign', sign)

  const res = await fetchImpl(url.toString(), { headers: { 'x-tts-access-token': params.accessToken } })
  if (!res.ok) {
    throw new Error(`TikTok authorized-shops fetch failed: ${res.status} ${await res.text()}`)
  }

  const body = (await res.json()) as TiktokAuthorizedShopsResponse
  if (body.code !== 0 || !body.data) {
    throw new Error(`TikTok authorized-shops fetch returned an error: ${body.code} ${body.message}`)
  }
  return body.data.shops
}

interface TiktokOrderSearchResponse {
  code: number
  message: string
  data?: { orders: TiktokOrder[] }
}

export async function fetchOrders(
  params: { shopId: string; accessToken: string; appKey: string; appSecret: string; updateTimeGe?: number },
  fetchImpl: typeof fetch = fetch,
): Promise<TiktokOrder[]> {
  const queryParams: Record<string, string> = {
    app_key: params.appKey,
    shop_id: params.shopId,
    timestamp: String(Math.floor(Date.now() / 1000)),
  }
  const body = JSON.stringify({
    page_size: 50,
    ...(params.updateTimeGe ? { update_time_ge: params.updateTimeGe } : {}),
  })

  const sign = await signRequest({ path: ORDER_SEARCH_PATH, queryParams, body, appSecret: params.appSecret })

  const url = new URL(`${TIKTOK_API_HOST}${ORDER_SEARCH_PATH}`)
  for (const [key, value] of Object.entries(queryParams)) {
    url.searchParams.set(key, value)
  }
  url.searchParams.set('sign', sign)

  const res = await fetchImpl(url.toString(), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-tts-access-token': params.accessToken },
    body,
  })

  if (!res.ok) {
    throw new Error(`TikTok order fetch failed: ${res.status} ${await res.text()}`)
  }

  const responseBody = (await res.json()) as TiktokOrderSearchResponse
  if (responseBody.code !== 0 || !responseBody.data) {
    throw new Error(`TikTok order fetch returned an error: ${responseBody.code} ${responseBody.message}`)
  }
  return responseBody.data.orders
}

/** Webhook signature verification. Modeled on the same HMAC-SHA256
 * secret-wrapped primitive TikTok documents for outbound request signing
 * (signRequest above) — TikTok Shop's webhook-specific signature header
 * name and exact byte range were not independently confirmed against a
 * first-party source in this sandbox (same 403-blocked-docs caveat).
 * UNVERIFIED against a live TikTok Shop webhook delivery. */
export async function verifyWebhookSignature(params: {
  rawBody: string
  signatureHeader: string
  appSecret: string
}): Promise<boolean> {
  const wrapped = `${params.appSecret}${params.rawBody}${params.appSecret}`
  const computed = (await hmacSha256Hex(wrapped, params.appSecret)).toUpperCase()
  return timingSafeEqual(computed, params.signatureHeader)
}
