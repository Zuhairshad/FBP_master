import type { AmazonWorkerEnv } from './env'
import {
  getAmazonTokenForBrand,
  upsertAmazonRefreshToken,
  verifyBrandAccessToken,
} from './supabaseAdmin'
import { ensureAccessToken, syncAmazonOrders } from './sync'

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) {
    return null
  }
  return header.slice('Bearer '.length)
}

async function requireBrand(
  request: Request,
  env: AmazonWorkerEnv,
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

/** GET /amazon/status — mirrors handleStatus in
 * worker/src/shopify/handlers.ts and worker/src/tiktok/handlers.ts:
 * amazon_tokens has zero RLS policies, so this is the frontend's only way
 * to read connection state. Returns only non-secret fields. */
export async function handleStatus(
  request: Request,
  env: AmazonWorkerEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const brandIdOrResponse = await requireBrand(request, env, fetchImpl)
  if (brandIdOrResponse instanceof Response) {
    return brandIdOrResponse
  }

  const token = await getAmazonTokenForBrand(env, brandIdOrResponse, fetchImpl)
  if (!token) {
    return Response.json({ connected: false })
  }

  return Response.json({
    connected: true,
    marketplaceId: token.marketplace_id,
    lastSyncedAt: token.last_synced_at,
  })
}

/** POST /amazon/connect — stores the brand's Amazon self-authorization
 * refresh token + marketplace id. Unlike Shopify/TikTok's install/callback
 * pair, there is no OAuth redirect here: Amazon's SP-API self-authorization
 * flow has the seller generate this refresh token directly in Seller
 * Central and hand it to the brand, who submits it through our own form
 * (see AmazonConnectPage) — see the amazon_tokens migration's header
 * comment for the full rationale. Bearer-token-authenticated like every
 * other brand-facing endpoint. */
export async function handleConnect(
  request: Request,
  env: AmazonWorkerEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const brandIdOrResponse = await requireBrand(request, env, fetchImpl)
  if (brandIdOrResponse instanceof Response) {
    return brandIdOrResponse
  }
  const brandId = brandIdOrResponse

  const body = (await request.json().catch(() => null)) as
    | { refreshToken?: string; marketplaceId?: string }
    | null
  const refreshToken = body?.refreshToken
  const marketplaceId = body?.marketplaceId
  if (!refreshToken || !marketplaceId) {
    return Response.json({ error: 'refreshToken and marketplaceId are required' }, { status: 400 })
  }

  await upsertAmazonRefreshToken(env, { brandId, marketplaceId, refreshToken }, fetchImpl)

  return Response.json({ connected: true })
}

/** POST /amazon/sync — manual "sync now" for the calling brand's connected
 * seller account. Mints/refreshes the LWA access token as needed before
 * fetching orders. */
export async function handleSync(
  request: Request,
  env: AmazonWorkerEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const brandIdOrResponse = await requireBrand(request, env, fetchImpl)
  if (brandIdOrResponse instanceof Response) {
    return brandIdOrResponse
  }
  const brandId = brandIdOrResponse

  const token = await getAmazonTokenForBrand(env, brandId, fetchImpl)
  if (!token) {
    return Response.json({ error: 'No Amazon seller account connected' }, { status: 400 })
  }

  const accessToken = await ensureAccessToken(
    env,
    {
      brandId,
      clientId: env.AMAZON_CLIENT_ID,
      clientSecret: env.AMAZON_CLIENT_SECRET,
      refreshToken: token.refresh_token,
      cachedAccessToken: token.access_token,
      cachedAccessTokenExpiresAt: token.access_token_expires_at,
    },
    fetchImpl,
  )

  const result = await syncAmazonOrders(
    env,
    {
      brandId,
      marketplaceId: token.marketplace_id,
      accessToken,
      createdAfter: token.last_synced_at ?? undefined,
    },
    fetchImpl,
  )

  return Response.json(result)
}
