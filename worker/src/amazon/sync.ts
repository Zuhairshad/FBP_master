import { fetchOrderItems, fetchOrders, refreshAccessToken } from './client'
import {
  cacheAccessToken,
  resolveMasterSku,
  touchLastSyncedAt,
  upsertPlatformOrder,
} from './supabaseAdmin'
import type { AmazonEnv } from './supabaseAdmin'
import type { AmazonOrder, PlatformOrderInsert } from './types'

const ACCESS_TOKEN_REFRESH_SKEW_MS = 60_000

/** Returns a valid access token, minting a new one via LWA refresh if none
 * is cached or the cached one is within a minute of expiring — avoids
 * re-minting on every sync call the way an unconditional refresh would. */
export async function ensureAccessToken(
  env: AmazonEnv,
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
    { clientId: params.clientId, clientSecret: params.clientSecret, refreshToken: params.refreshToken },
    fetchImpl,
  )
  await cacheAccessToken(env, { brandId: params.brandId, accessToken, accessTokenExpiresAt }, fetchImpl)
  return accessToken
}

/** Resolves an order's Master SKU from its first order item's SellerSKU
 * only — same single-resolution scope as worker/src/shopify/sync.ts's
 * resolveOrder and worker/src/tiktok/sync.ts's resolveOrder (see either
 * file's header comment for the rationale, which applies identically
 * here). Amazon's getOrderItems is a separate call per order (there is no
 * line-item array on the order itself), so this is also where that
 * per-order fan-out call happens. */
async function resolveOrder(
  env: AmazonEnv,
  brandId: string,
  order: AmazonOrder,
  accessToken: string,
  fetchImpl: typeof fetch,
): Promise<PlatformOrderInsert> {
  const items = await fetchOrderItems({ accessToken, amazonOrderId: order.AmazonOrderId }, fetchImpl)
  const firstSku = items[0]?.SellerSKU ?? null
  const resolvedMasterSku = firstSku ? await resolveMasterSku(env, brandId, firstSku, fetchImpl) : null

  return {
    brand_id: brandId,
    platform: 'amazon',
    platform_order_id: order.AmazonOrderId,
    raw_data: { ...order, OrderItems: items },
    resolved_master_sku: resolvedMasterSku,
    status: resolvedMasterSku ? 'resolved' : 'unmapped',
  }
}

export async function syncAmazonOrders(
  env: AmazonEnv,
  params: {
    brandId: string
    marketplaceId: string
    accessToken: string
    createdAfter?: string
  },
  fetchImpl: typeof fetch = fetch,
): Promise<{ syncedCount: number }> {
  const orders = await fetchOrders(
    { accessToken: params.accessToken, marketplaceId: params.marketplaceId, createdAfter: params.createdAfter },
    fetchImpl,
  )

  for (const order of orders) {
    const resolved = await resolveOrder(env, params.brandId, order, params.accessToken, fetchImpl)
    await upsertPlatformOrder(env, resolved, fetchImpl)
  }

  await touchLastSyncedAt(env, params.brandId, fetchImpl)

  return { syncedCount: orders.length }
}
