import { buildAuthorizeUrl, exchangeCodeForToken, isValidShopDomain, verifyOAuthCallbackHmac, verifyWebhookHmac } from './client'
import type { ShopifyWorkerEnv } from './env'
import { signInstallState, verifyInstallState } from './oauthState'
import {
  getShopifyTokenForBrand,
  getShopifyTokenForShop,
  upsertShopifyToken,
  verifyBrandAccessToken,
} from './supabaseAdmin'
import { ingestShopifyWebhookOrder, syncShopifyOrders } from './sync'
import type { ShopifyOrder } from './types'

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) {
    return null
  }
  return header.slice('Bearer '.length)
}

async function requireBrand(
  request: Request,
  env: ShopifyWorkerEnv,
  fetchImpl: typeof fetch,
): Promise<string | Response> {
  const token = bearerToken(request)
  if (!token) {
    return Response.json({ error: 'Missing bearer token' }, { status: 401 })
  }
  const brandId = await verifyBrandAccessToken(env, token, fetchImpl)
  if (!brandId) {
    return Response.json({ error: 'Invalid or expired session' }, { status: 401 })
  }
  return brandId
}

/** GET /shopify/status — the frontend's only way to know whether a brand is
 * connected: shopify_tokens has zero RLS policies (see the migration's
 * header comment), so even the owning brand cannot query it directly via
 * Supabase. This endpoint returns just the non-secret fields — never
 * access_token/scope. */
export async function handleStatus(
  request: Request,
  env: ShopifyWorkerEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const brandIdOrResponse = await requireBrand(request, env, fetchImpl)
  if (brandIdOrResponse instanceof Response) {
    return brandIdOrResponse
  }

  const token = await getShopifyTokenForBrand(env, brandIdOrResponse, fetchImpl)
  if (!token) {
    return Response.json({ connected: false })
  }

  return Response.json({ connected: true, shopDomain: token.shop_domain, lastSyncedAt: token.last_synced_at })
}

/** POST /shopify/install — returns the Shopify OAuth authorize URL for the
 * calling brand to navigate to. Requires the brand's session token so the
 * install-state binding (see oauthState.ts) is signed for the right brand,
 * not whatever `shop`/brand a caller happens to pass in. */
export async function handleInstall(
  request: Request,
  env: ShopifyWorkerEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const brandIdOrResponse = await requireBrand(request, env, fetchImpl)
  if (brandIdOrResponse instanceof Response) {
    return brandIdOrResponse
  }
  const brandId = brandIdOrResponse

  const body = (await request.json().catch(() => null)) as { shop?: string } | null
  const shop = body?.shop
  if (!shop || !isValidShopDomain(shop)) {
    return Response.json({ error: 'shop must be a valid *.myshopify.com domain' }, { status: 400 })
  }

  const state = await signInstallState(brandId, env.SHOPIFY_CLIENT_SECRET)
  const url = buildAuthorizeUrl({
    shop,
    clientId: env.SHOPIFY_CLIENT_ID,
    redirectUri: `${env.WORKER_URL}/shopify/callback`,
    scopes: env.SHOPIFY_SCOPES,
    state,
  })

  return Response.json({ url })
}

/** GET /shopify/callback — Shopify redirects the browser here after OAuth
 * consent. No bearer token is possible on a browser redirect, so identity
 * comes entirely from the signed `state` (see oauthState.ts) plus Shopify's
 * own `hmac` query-param signature proving the request truly came from
 * Shopify. */
export async function handleCallback(
  request: Request,
  env: ShopifyWorkerEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const url = new URL(request.url)
  const shop = url.searchParams.get('shop')
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  if (!shop || !isValidShopDomain(shop) || !code || !state) {
    return Response.redirect(`${env.APP_URL}/brand/shopify?error=invalid_callback`, 302)
  }

  const hmacValid = await verifyOAuthCallbackHmac({
    searchParams: url.searchParams,
    clientSecret: env.SHOPIFY_CLIENT_SECRET,
  })
  if (!hmacValid) {
    return Response.redirect(`${env.APP_URL}/brand/shopify?error=invalid_signature`, 302)
  }

  const brandId = await verifyInstallState(state, env.SHOPIFY_CLIENT_SECRET)
  if (!brandId) {
    return Response.redirect(`${env.APP_URL}/brand/shopify?error=expired_state`, 302)
  }

  const { accessToken, scope } = await exchangeCodeForToken(
    {
      shop,
      clientId: env.SHOPIFY_CLIENT_ID,
      clientSecret: env.SHOPIFY_CLIENT_SECRET,
      code,
    },
    fetchImpl,
  )

  await upsertShopifyToken(env, { brandId, shopDomain: shop, accessToken, scope }, fetchImpl)

  return Response.redirect(`${env.APP_URL}/brand/shopify?connected=1`, 302)
}

/** POST /shopify/sync — manual "sync now" for the calling brand's connected
 * store. */
export async function handleSync(
  request: Request,
  env: ShopifyWorkerEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const brandIdOrResponse = await requireBrand(request, env, fetchImpl)
  if (brandIdOrResponse instanceof Response) {
    return brandIdOrResponse
  }
  const brandId = brandIdOrResponse

  const token = await getShopifyTokenForBrand(env, brandId, fetchImpl)
  if (!token) {
    return Response.json({ error: 'No Shopify store connected' }, { status: 400 })
  }

  const result = await syncShopifyOrders(
    env,
    {
      brandId,
      shopDomain: token.shop_domain,
      accessToken: token.access_token,
      updatedAtMin: token.last_synced_at ?? undefined,
    },
    fetchImpl,
  )

  return Response.json(result)
}

/** POST /webhooks/shopify/orders — Shopify's orders/create + orders/updated
 * webhook. Must read the body as text first (HMAC is computed over the raw
 * bytes) before any JSON parsing. */
export async function handleOrderWebhook(
  request: Request,
  env: ShopifyWorkerEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const rawBody = await request.text()
  const hmacHeader = request.headers.get('x-shopify-hmac-sha256')
  const shopDomain = request.headers.get('x-shopify-shop-domain')

  if (!hmacHeader || !shopDomain) {
    return new Response('Missing required headers', { status: 400 })
  }

  const hmacValid = await verifyWebhookHmac({
    rawBody,
    hmacHeader,
    clientSecret: env.SHOPIFY_CLIENT_SECRET,
  })
  if (!hmacValid) {
    return new Response('Invalid signature', { status: 401 })
  }

  const token = await getShopifyTokenForShop(env, shopDomain, fetchImpl)
  if (!token) {
    // Unknown shop (e.g. app was uninstalled but Shopify hasn't stopped
    // sending webhooks yet) — ack so Shopify doesn't retry indefinitely.
    return new Response('Unknown shop', { status: 200 })
  }

  const order = JSON.parse(rawBody) as ShopifyOrder
  await ingestShopifyWebhookOrder(env, { brandId: token.brand_id, order }, fetchImpl)

  return new Response('ok', { status: 200 })
}
