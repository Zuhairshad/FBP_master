import { buildAuthorizeUrl, computeChallengeResponse, exchangeCodeForToken } from './client'
import type { EbayWorkerEnv } from './env'
import { signInstallState, verifyInstallState } from '../shared/oauthState'
import { getEbayTokenForBrand, upsertEbayTokens, verifyBrandAccessToken } from './supabaseAdmin'
import { ensureAccessToken, syncEbayOrders } from './sync'

const FULFILLMENT_SCOPE = 'https://api.ebay.com/oauth/api_scope/sell.fulfillment'

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) {
    return null
  }
  return header.slice('Bearer '.length)
}

async function requireBrand(
  request: Request,
  env: EbayWorkerEnv,
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

/** GET /ebay/status — mirrors handleStatus in worker/src/shopify/handlers.ts
 * and its Phase 6/7 counterparts: ebay_tokens has zero RLS policies, so this
 * is the frontend's only way to read connection state. Returns only
 * non-secret fields. */
export async function handleStatus(
  request: Request,
  env: EbayWorkerEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const brandIdOrResponse = await requireBrand(request, env, fetchImpl)
  if (brandIdOrResponse instanceof Response) {
    return brandIdOrResponse
  }

  const token = await getEbayTokenForBrand(env, brandIdOrResponse, fetchImpl)
  if (!token) {
    return Response.json({ connected: false })
  }

  return Response.json({ connected: true, lastSyncedAt: token.last_synced_at })
}

/** POST /ebay/install — returns the eBay OAuth authorize URL for the calling
 * brand to navigate to. Like TikTok's install endpoint, takes no request
 * body: eBay's authorize URL has no shop-identifier parameter for the
 * caller to supply — the seller consents to their own already-registered
 * eBay account inside eBay's own UI after redirecting there. */
export async function handleInstall(
  request: Request,
  env: EbayWorkerEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const brandIdOrResponse = await requireBrand(request, env, fetchImpl)
  if (brandIdOrResponse instanceof Response) {
    return brandIdOrResponse
  }
  const brandId = brandIdOrResponse

  const state = await signInstallState(brandId, env.EBAY_CLIENT_SECRET)
  const url = buildAuthorizeUrl({
    clientId: env.EBAY_CLIENT_ID,
    ruName: env.EBAY_RU_NAME,
    scopes: FULFILLMENT_SCOPE,
    state,
  })

  return Response.json({ url })
}

/** GET /ebay/callback — eBay redirects the browser here after OAuth
 * consent, carrying `code`/`state` (the RuName's configured accept URL
 * points here). Identity/CSRF protection comes entirely from the signed
 * `state` (see shared/oauthState.ts), same as TikTok's callback — there's
 * no third-party shop identity to also verify, unlike Shopify's
 * embeddable-app model. */
export async function handleCallback(
  request: Request,
  env: EbayWorkerEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')

  if (!code || !state) {
    return Response.redirect(`${env.APP_URL}/brand/ebay?error=invalid_callback`, 302)
  }

  const brandId = await verifyInstallState(state, env.EBAY_CLIENT_SECRET)
  if (!brandId) {
    return Response.redirect(`${env.APP_URL}/brand/ebay?error=expired_state`, 302)
  }

  const { accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt } = await exchangeCodeForToken(
    { clientId: env.EBAY_CLIENT_ID, clientSecret: env.EBAY_CLIENT_SECRET, code, ruName: env.EBAY_RU_NAME },
    fetchImpl,
  )

  await upsertEbayTokens(
    env,
    { brandId, accessToken, accessTokenExpiresAt, refreshToken, refreshTokenExpiresAt },
    fetchImpl,
  )

  return Response.redirect(`${env.APP_URL}/brand/ebay?connected=1`, 302)
}

/** POST /ebay/sync — manual "sync now" for the calling brand's connected
 * eBay seller account. Mints/refreshes the access token as needed before
 * fetching orders. */
export async function handleSync(
  request: Request,
  env: EbayWorkerEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const brandIdOrResponse = await requireBrand(request, env, fetchImpl)
  if (brandIdOrResponse instanceof Response) {
    return brandIdOrResponse
  }
  const brandId = brandIdOrResponse

  const token = await getEbayTokenForBrand(env, brandId, fetchImpl)
  if (!token) {
    return Response.json({ error: 'No eBay seller account connected' }, { status: 400 })
  }

  const accessToken = await ensureAccessToken(
    env,
    {
      brandId,
      clientId: env.EBAY_CLIENT_ID,
      clientSecret: env.EBAY_CLIENT_SECRET,
      refreshToken: token.refresh_token,
      cachedAccessToken: token.access_token,
      cachedAccessTokenExpiresAt: token.access_token_expires_at,
    },
    fetchImpl,
  )

  const result = await syncEbayOrders(
    env,
    { brandId, accessToken, creationDateFrom: token.last_synced_at ?? undefined },
    fetchImpl,
  )

  return Response.json(result)
}

/** GET /webhooks/ebay/account-deletion — eBay's mandatory endpoint
 * verification handshake (see client.ts's computeChallengeResponse). Every
 * eBay app that stores eBay user data must subscribe to marketplace account
 * deletion notifications and pass this challenge before the subscription is
 * accepted; unlike an order webhook, this isn't optional. */
export async function handleDeletionChallenge(request: Request, env: EbayWorkerEnv): Promise<Response> {
  const url = new URL(request.url)
  const challengeCode = url.searchParams.get('challenge_code')
  if (!challengeCode) {
    return Response.json({ error: 'Missing challenge_code' }, { status: 400 })
  }

  const endpoint = `${env.WORKER_URL}/webhooks/ebay/account-deletion`
  const challengeResponse = await computeChallengeResponse({
    challengeCode,
    verificationToken: env.EBAY_VERIFICATION_TOKEN,
    endpoint,
  })

  return Response.json({ challengeResponse })
}

/** POST /webhooks/ebay/account-deletion — the actual deletion notification.
 * ASSUMPTION / scope note: this app currently has no stored column
 * correlating an eBay userId/username (the identifiers in the notification
 * payload) back to a brand_id — ebay_tokens is keyed by our own brand_id,
 * not eBay's user identity — so there is no per-brand token revocation this
 * handler can perform from the payload alone yet. It acknowledges every
 * notification with 200 (required so eBay doesn't retry/flag the
 * subscription as broken), which is the compliance-mandatory minimum;
 * revisit if per-brand deletion becomes a real requirement (would need
 * capturing the eBay username at connect-time to make the correlation
 * possible). */
export async function handleDeletionNotification(request: Request): Promise<Response> {
  await request.text()
  return new Response('ok', { status: 200 })
}
