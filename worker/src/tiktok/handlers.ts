import { buildAuthorizeUrl, exchangeCodeForToken, getAuthorizedShops, verifyWebhookSignature } from './client'
import type { TiktokWorkerEnv } from './env'
import { signInstallState, verifyInstallState } from '../shared/oauthState'
import {
  getTiktokTokenForBrand,
  getTiktokTokenForShop,
  upsertTiktokToken,
  verifyBrandAccessToken,
} from './supabaseAdmin'
import { ingestTiktokWebhookOrder, syncTiktokOrders } from './sync'
import type { TiktokOrder } from './types'

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) {
    return null
  }
  return header.slice('Bearer '.length)
}

async function requireBrand(
  request: Request,
  env: TiktokWorkerEnv,
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

/** GET /tiktok/status — mirrors handleStatus in worker/src/shopify/handlers.ts:
 * tiktok_tokens has zero RLS policies, so this is the frontend's only way to
 * read connection state. Returns only non-secret fields. */
export async function handleStatus(
  request: Request,
  env: TiktokWorkerEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const brandIdOrResponse = await requireBrand(request, env, fetchImpl)
  if (brandIdOrResponse instanceof Response) {
    return brandIdOrResponse
  }

  const token = await getTiktokTokenForBrand(env, brandIdOrResponse, fetchImpl)
  if (!token) {
    return Response.json({ connected: false })
  }

  return Response.json({ connected: true, shopId: token.shop_id, lastSyncedAt: token.last_synced_at })
}

/** POST /tiktok/install — returns the TikTok Shop OAuth authorize URL for
 * the calling brand to navigate to. Unlike Shopify's install endpoint, this
 * takes no request body: TikTok's authorize URL has no shop-domain
 * parameter for the caller to supply (see client.ts's buildAuthorizeUrl
 * comment) — the seller picks which shop to authorize inside TikTok's own
 * UI after redirecting there. */
export async function handleInstall(
  request: Request,
  env: TiktokWorkerEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const brandIdOrResponse = await requireBrand(request, env, fetchImpl)
  if (brandIdOrResponse instanceof Response) {
    return brandIdOrResponse
  }
  const brandId = brandIdOrResponse

  const state = await signInstallState(brandId, env.TIKTOK_APP_SECRET)
  const url = buildAuthorizeUrl({ appKey: env.TIKTOK_APP_KEY, state })

  return Response.json({ url })
}

/** GET /tiktok/callback — TikTok redirects the browser here after OAuth
 * consent, carrying only `code`/`state` (no extra request-signature query
 * param the way Shopify's callback carries `hmac` — ASSUMPTION, ref
 * client.ts's header comment). Identity/CSRF protection comes entirely from
 * the signed `state` (see shared/oauthState.ts): forging a valid `code`
 * without a real TikTok seller authorization isn't possible, and
 * exchanging any `code` requires this Worker's own app secret, so the
 * signed-state binding alone is sufficient here — there's no third party
 * (like an arbitrary Shopify store) whose identity also needs verifying. */
export async function handleCallback(
  request: Request,
  env: TiktokWorkerEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  if (!code || !state) {
    return Response.redirect(`${env.APP_URL}/brand/tiktok?error=invalid_callback`, 302)
  }

  const brandId = await verifyInstallState(state, env.TIKTOK_APP_SECRET)
  if (!brandId) {
    return Response.redirect(`${env.APP_URL}/brand/tiktok?error=expired_state`, 302)
  }

  const { accessToken, refreshToken, accessTokenExpiresAt } = await exchangeCodeForToken(
    { appKey: env.TIKTOK_APP_KEY, appSecret: env.TIKTOK_APP_SECRET, authCode: code },
    fetchImpl,
  )

  const shops = await getAuthorizedShops(
    { appKey: env.TIKTOK_APP_KEY, appSecret: env.TIKTOK_APP_SECRET, accessToken },
    fetchImpl,
  )
  const shop = shops[0]
  if (!shop) {
    return Response.redirect(`${env.APP_URL}/brand/tiktok?error=no_shop_authorized`, 302)
  }

  await upsertTiktokToken(
    env,
    { brandId, shopId: shop.shop_id, accessToken, refreshToken, accessTokenExpiresAt },
    fetchImpl,
  )

  return Response.redirect(`${env.APP_URL}/brand/tiktok?connected=1`, 302)
}

/** POST /tiktok/sync — manual "sync now" for the calling brand's connected
 * shop. */
export async function handleSync(
  request: Request,
  env: TiktokWorkerEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const brandIdOrResponse = await requireBrand(request, env, fetchImpl)
  if (brandIdOrResponse instanceof Response) {
    return brandIdOrResponse
  }
  const brandId = brandIdOrResponse

  const token = await getTiktokTokenForBrand(env, brandId, fetchImpl)
  if (!token) {
    return Response.json({ error: 'No TikTok Shop connected' }, { status: 400 })
  }

  const result = await syncTiktokOrders(
    env,
    {
      brandId,
      shopId: token.shop_id,
      accessToken: token.access_token,
      appKey: env.TIKTOK_APP_KEY,
      appSecret: env.TIKTOK_APP_SECRET,
      updateTimeGe: token.last_synced_at ? Math.floor(new Date(token.last_synced_at).getTime() / 1000) : undefined,
    },
    fetchImpl,
  )

  return Response.json(result)
}

/** POST /webhooks/tiktok/orders — TikTok Shop's order-update webhook. Reads
 * the body as text first (signature is computed over the raw bytes) before
 * any JSON parsing, same discipline as Shopify's webhook handler.
 * ASSUMPTION on the signature header name (`x-tts-signature`) — ref
 * client.ts's verifyWebhookSignature comment. */
export async function handleOrderWebhook(
  request: Request,
  env: TiktokWorkerEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const rawBody = await request.text()
  const signatureHeader = request.headers.get('x-tts-signature')
  const shopId = request.headers.get('x-tts-shop-id')

  if (!signatureHeader || !shopId) {
    return new Response('Missing required headers', { status: 400 })
  }

  const signatureValid = await verifyWebhookSignature({
    rawBody,
    signatureHeader,
    appSecret: env.TIKTOK_APP_SECRET,
  })
  if (!signatureValid) {
    return new Response('Invalid signature', { status: 401 })
  }

  const token = await getTiktokTokenForShop(env, shopId, fetchImpl)
  if (!token) {
    // Unknown shop (e.g. app was uninstalled but TikTok hasn't stopped
    // sending webhooks yet) — ack so TikTok doesn't retry indefinitely.
    return new Response('Unknown shop', { status: 200 })
  }

  const order = JSON.parse(rawBody) as TiktokOrder
  await ingestTiktokWebhookOrder(env, { brandId: token.brand_id, order }, fetchImpl)

  return new Response('ok', { status: 200 })
}
