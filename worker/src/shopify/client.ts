import { hmacSha256Base64, hmacSha256Hex, timingSafeEqual } from '../shared/hmac'
import type { ShopifyOrder } from './types'

const SHOPIFY_API_VERSION = '2025-01'
const SHOP_DOMAIN_PATTERN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/

/** Rejects anything that isn't a bare *.myshopify.com host — the `shop` query
 * param on /shopify/install is browser-supplied, so this is the guard against
 * building an OAuth/API URL against an attacker-controlled host. */
export function isValidShopDomain(shop: string): boolean {
  return SHOP_DOMAIN_PATTERN.test(shop)
}

export function buildAuthorizeUrl(params: {
  shop: string
  clientId: string
  redirectUri: string
  scopes: string
  state: string
}): string {
  const url = new URL(`https://${params.shop}/admin/oauth/authorize`)
  url.searchParams.set('client_id', params.clientId)
  url.searchParams.set('scope', params.scopes)
  url.searchParams.set('redirect_uri', params.redirectUri)
  url.searchParams.set('state', params.state)
  return url.toString()
}

export async function exchangeCodeForToken(
  params: {
    shop: string
    clientId: string
    clientSecret: string
    code: string
  },
  fetchImpl: typeof fetch = fetch,
): Promise<{ accessToken: string; scope: string }> {
  const res = await fetchImpl(`https://${params.shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: params.clientId,
      client_secret: params.clientSecret,
      code: params.code,
    }),
  })

  if (!res.ok) {
    throw new Error(`Shopify token exchange failed: ${res.status} ${await res.text()}`)
  }

  const body = (await res.json()) as { access_token: string; scope: string }
  return { accessToken: body.access_token, scope: body.scope }
}

export async function fetchOrders(
  params: {
    shop: string
    accessToken: string
    updatedAtMin?: string
  },
  fetchImpl: typeof fetch = fetch,
): Promise<ShopifyOrder[]> {
  const url = new URL(`https://${params.shop}/admin/api/${SHOPIFY_API_VERSION}/orders.json`)
  url.searchParams.set('status', 'any')
  if (params.updatedAtMin) {
    url.searchParams.set('updated_at_min', params.updatedAtMin)
  }

  const res = await fetchImpl(url.toString(), {
    headers: { 'X-Shopify-Access-Token': params.accessToken },
  })

  if (!res.ok) {
    throw new Error(`Shopify order fetch failed: ${res.status} ${await res.text()}`)
  }

  const body = (await res.json()) as { orders: ShopifyOrder[] }
  return body.orders
}

/** Verifies the `X-Shopify-Hmac-Sha256` webhook header — base64 HMAC-SHA256
 * of the raw request body, keyed by the app's client secret. */
export async function verifyWebhookHmac(params: {
  rawBody: string
  hmacHeader: string
  clientSecret: string
}): Promise<boolean> {
  const computed = await hmacSha256Base64(params.rawBody, params.clientSecret)
  return timingSafeEqual(computed, params.hmacHeader)
}

/** Verifies the OAuth callback's `hmac` query param per Shopify's "Verifying
 * requests" spec: hex HMAC-SHA256 over the remaining query params, sorted by
 * key and joined as `key=value&key=value` (with `&`/`%` unescaped in values,
 * which URLSearchParams already leaves untouched for typical Shopify
 * params). Without this, `/shopify/callback` would trust `shop`/`code` from
 * an unauthenticated GET request with no proof they came from Shopify. */
export async function verifyOAuthCallbackHmac(params: {
  searchParams: URLSearchParams
  clientSecret: string
}): Promise<boolean> {
  const hmacParam = params.searchParams.get('hmac')
  if (!hmacParam) {
    return false
  }

  const pairs: string[] = []
  for (const [key, value] of params.searchParams) {
    if (key === 'hmac' || key === 'signature') continue
    pairs.push(`${key}=${value}`)
  }
  pairs.sort()

  const computed = await hmacSha256Hex(pairs.join('&'), params.clientSecret)
  return timingSafeEqual(computed, hmacParam)
}
