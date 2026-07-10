import { fetchOrders } from './client'
import { resolveMasterSku, touchLastSyncedAt, upsertPlatformOrder } from './supabaseAdmin'
import type { TiktokEnv } from './supabaseAdmin'
import type { PlatformOrderInsert, TiktokOrder } from './types'

/** Resolves an order's Master SKU from its first line item's seller_sku
 * only — same single-resolution scope as worker/src/shopify/sync.ts's
 * resolveOrder (see that file's header comment for the rationale, which
 * applies identically here). */
async function resolveOrder(
  env: TiktokEnv,
  brandId: string,
  order: TiktokOrder,
  fetchImpl: typeof fetch,
): Promise<PlatformOrderInsert> {
  const firstSku = order.line_items[0]?.seller_sku ?? null
  const resolvedMasterSku = firstSku ? await resolveMasterSku(env, brandId, firstSku, fetchImpl) : null

  return {
    brand_id: brandId,
    platform: 'tiktok',
    platform_order_id: order.id,
    raw_data: order,
    resolved_master_sku: resolvedMasterSku,
    status: resolvedMasterSku ? 'resolved' : 'unmapped',
  }
}

export async function syncTiktokOrders(
  env: TiktokEnv,
  params: {
    brandId: string
    shopId: string
    accessToken: string
    appKey: string
    appSecret: string
    updateTimeGe?: number
  },
  fetchImpl: typeof fetch = fetch,
): Promise<{ syncedCount: number }> {
  const orders = await fetchOrders(
    {
      shopId: params.shopId,
      accessToken: params.accessToken,
      appKey: params.appKey,
      appSecret: params.appSecret,
      updateTimeGe: params.updateTimeGe,
    },
    fetchImpl,
  )

  for (const order of orders) {
    const resolved = await resolveOrder(env, params.brandId, order, fetchImpl)
    await upsertPlatformOrder(env, resolved, fetchImpl)
  }

  await touchLastSyncedAt(env, params.brandId, fetchImpl)

  return { syncedCount: orders.length }
}

export async function ingestTiktokWebhookOrder(
  env: TiktokEnv,
  params: { brandId: string; order: TiktokOrder },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const resolved = await resolveOrder(env, params.brandId, params.order, fetchImpl)
  await upsertPlatformOrder(env, resolved, fetchImpl)
}
