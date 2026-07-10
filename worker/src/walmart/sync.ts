import { fetchOrders, mintAccessToken } from './client'
import { cacheAccessToken, resolveMasterSku, touchLastSyncedAt, upsertPlatformOrder } from './supabaseAdmin'
import type { WalmartEnv } from './supabaseAdmin'
import type { PlatformOrderInsert, WalmartOrder } from './types'

const ACCESS_TOKEN_REFRESH_SKEW_MS = 60_000

/** Returns a valid access token, minting a new one via the client-credentials
 * grant if none is cached or the cached one is within a minute of expiring —
 * same caching shape as Amazon's and eBay's ensureAccessToken (see either
 * file's header comment for the rationale, which applies identically here:
 * Walmart's access token is even shorter-lived — 15 minutes — making this
 * caching more valuable, not less). Unlike Amazon/eBay, there is no separate
 * refresh_token: client_id/client_secret themselves are re-used on every
 * mint. */
export async function ensureAccessToken(
  env: WalmartEnv,
  params: {
    brandId: string
    clientId: string
    clientSecret: string
    cachedAccessToken: string | null
    cachedAccessTokenExpiresAt: string | null
  },
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const cachedExpiry = params.cachedAccessTokenExpiresAt ? new Date(params.cachedAccessTokenExpiresAt).getTime() : 0
  if (params.cachedAccessToken && cachedExpiry - ACCESS_TOKEN_REFRESH_SKEW_MS > Date.now()) {
    return params.cachedAccessToken
  }

  const { accessToken, accessTokenExpiresAt } = await mintAccessToken(
    { clientId: params.clientId, clientSecret: params.clientSecret },
    fetchImpl,
  )
  await cacheAccessToken(env, { brandId: params.brandId, accessToken, accessTokenExpiresAt }, fetchImpl)
  return accessToken
}

/** Resolves an order's Master SKU from its first order line's SKU only —
 * same single-resolution scope as worker/src/shopify/sync.ts's resolveOrder
 * and its Phase 6/7/8 counterparts (see any of those files' header comment
 * for the rationale, which applies identically here). Walmart's Orders API
 * returns order lines inline, so no per-order fan-out call is needed here
 * (unlike Amazon). */
function resolveOrder(
  env: WalmartEnv,
  brandId: string,
  order: WalmartOrder,
  fetchImpl: typeof fetch,
): Promise<PlatformOrderInsert> {
  const firstSku = order.orderLines.orderLine[0]?.item.sku ?? null
  const resolved = firstSku ? resolveMasterSku(env, brandId, firstSku, fetchImpl) : Promise.resolve(null)

  return resolved.then((resolvedMasterSku) => ({
    brand_id: brandId,
    platform: 'walmart',
    platform_order_id: order.purchaseOrderId,
    raw_data: order,
    resolved_master_sku: resolvedMasterSku,
    status: resolvedMasterSku ? 'resolved' : 'unmapped',
  }))
}

export async function syncWalmartOrders(
  env: WalmartEnv,
  params: { brandId: string; accessToken: string; createdStartDate?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ syncedCount: number }> {
  const orders = await fetchOrders(
    { accessToken: params.accessToken, createdStartDate: params.createdStartDate },
    fetchImpl,
  )

  for (const order of orders) {
    const resolved = await resolveOrder(env, params.brandId, order, fetchImpl)
    await upsertPlatformOrder(env, resolved, fetchImpl)
  }

  await touchLastSyncedAt(env, params.brandId, fetchImpl)

  return { syncedCount: orders.length }
}
