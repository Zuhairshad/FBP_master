import { fetchOrders, refreshAccessToken } from './client'
import {
  cacheAccessToken,
  listEbayTokens,
  resolveMasterSku,
  touchLastSyncedAt,
  upsertPlatformOrder,
} from './supabaseAdmin'
import type { EbayEnv } from './supabaseAdmin'
import type { EbayOrder, PlatformOrderInsert } from './types'

const ACCESS_TOKEN_REFRESH_SKEW_MS = 60_000
const FULFILLMENT_SCOPE = 'https://api.ebay.com/oauth/api_scope/sell.fulfillment'

/** Returns a valid access token, minting a new one via refresh_token if none
 * is cached or the cached one is within a minute of expiring — same
 * caching shape as worker/src/amazon/sync.ts's ensureAccessToken (see that
 * file's header comment for the rationale, which applies identically
 * here: eBay's access token is short-lived — 2 hours — same as Amazon's
 * LWA token, so re-minting on every sync call would be wasteful). */
export async function ensureAccessToken(
  env: EbayEnv,
  params: {
    brandId: string
    clientId: string
    clientSecret: string
    refreshToken: string
    cachedAccessToken: string | null
    cachedAccessTokenExpiresAt: string | null
  },
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const cachedExpiry = params.cachedAccessTokenExpiresAt ? new Date(params.cachedAccessTokenExpiresAt).getTime() : 0
  if (params.cachedAccessToken && cachedExpiry - ACCESS_TOKEN_REFRESH_SKEW_MS > Date.now()) {
    return params.cachedAccessToken
  }

  const { accessToken, accessTokenExpiresAt } = await refreshAccessToken(
    {
      clientId: params.clientId,
      clientSecret: params.clientSecret,
      refreshToken: params.refreshToken,
      scopes: FULFILLMENT_SCOPE,
    },
    fetchImpl,
  )
  await cacheAccessToken(env, { brandId: params.brandId, accessToken, accessTokenExpiresAt }, fetchImpl)
  return accessToken
}

/** Resolves an order's Master SKU from its first line item's `sku` only —
 * same single-resolution scope as worker/src/shopify/sync.ts's resolveOrder
 * and its Phase 6/7 counterparts (see either file's header comment for the
 * rationale, which applies identically here). eBay's Fulfillment API
 * returns line items inline, so no per-order fan-out call is needed here
 * (unlike Amazon). */
function resolveOrder(
  env: EbayEnv,
  brandId: string,
  order: EbayOrder,
  fetchImpl: typeof fetch,
): Promise<PlatformOrderInsert> {
  const firstSku = order.lineItems[0]?.sku ?? null
  const resolved = firstSku ? resolveMasterSku(env, brandId, firstSku, fetchImpl) : Promise.resolve(null)

  return resolved.then((resolvedMasterSku) => ({
    brand_id: brandId,
    platform: 'ebay',
    platform_order_id: order.orderId,
    raw_data: order,
    resolved_master_sku: resolvedMasterSku,
    status: resolvedMasterSku ? 'resolved' : 'unmapped',
  }))
}

export async function syncEbayOrders(
  env: EbayEnv,
  params: { brandId: string; accessToken: string; creationDateFrom?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ syncedCount: number }> {
  const orders = await fetchOrders(
    { accessToken: params.accessToken, creationDateFrom: params.creationDateFrom },
    fetchImpl,
  )

  for (const order of orders) {
    const resolved = await resolveOrder(env, params.brandId, order, fetchImpl)
    await upsertPlatformOrder(env, resolved, fetchImpl)
  }

  await touchLastSyncedAt(env, params.brandId, fetchImpl)

  return { syncedCount: orders.length }
}

/** Phase 10: syncs every brand with a connected eBay seller account, same
 * per-brand recipe as handleSync in handlers.ts — see
 * worker/src/shopify/sync.ts's syncAllShopifyBrands for the per-brand
 * failure-isolation rationale, which applies identically here. */
export async function syncAllEbayBrands(
  env: EbayEnv,
  params: { clientId: string; clientSecret: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ successCount: number; failureCount: number; errors: string[] }> {
  const tokens = await listEbayTokens(env, fetchImpl)
  const errors: string[] = []
  let successCount = 0

  for (const token of tokens) {
    try {
      const accessToken = await ensureAccessToken(
        env,
        {
          brandId: token.brand_id,
          clientId: params.clientId,
          clientSecret: params.clientSecret,
          refreshToken: token.refresh_token,
          cachedAccessToken: token.access_token,
          cachedAccessTokenExpiresAt: token.access_token_expires_at,
        },
        fetchImpl,
      )
      await syncEbayOrders(
        env,
        { brandId: token.brand_id, accessToken, creationDateFrom: token.last_synced_at ?? undefined },
        fetchImpl,
      )
      successCount++
    } catch (err) {
      errors.push(`brand ${token.brand_id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return { successCount, failureCount: errors.length, errors }
}
