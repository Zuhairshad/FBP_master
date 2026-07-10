import { fetchOrders } from './client'
import { resolveMasterSku, touchLastSyncedAt, upsertPlatformOrder } from './supabaseAdmin'
import type { ShopifyEnv } from './supabaseAdmin'
import type { PlatformOrderInsert, ShopifyOrder } from './types'

/** Resolves an order's Master SKU from its first line item's SKU only —
 * ROADMAP.md's Phase 5 goal is order-level SKU resolution, not full
 * multi-line-item fan-out. A multi-SKU order resolves (or fails to resolve)
 * by its first line, which is the same single-resolution scope the rest of
 * this phase's schema (`platform_orders.resolved_master_sku` is a single
 * column, not a child table) already commits to. Revisit with a child
 * `platform_order_line_items` table if partial-fulfillment-per-SKU ever
 * matters. */
async function resolveOrder(
  env: ShopifyEnv,
  brandId: string,
  order: ShopifyOrder,
  fetchImpl: typeof fetch,
): Promise<PlatformOrderInsert> {
  const firstSku = order.line_items[0]?.sku ?? null
  const resolvedMasterSku = firstSku ? await resolveMasterSku(env, brandId, firstSku, fetchImpl) : null

  return {
    brand_id: brandId,
    platform: 'shopify',
    platform_order_id: String(order.id),
    raw_data: order,
    resolved_master_sku: resolvedMasterSku,
    status: resolvedMasterSku ? 'resolved' : 'unmapped',
  }
}

export async function syncShopifyOrders(
  env: ShopifyEnv,
  params: { brandId: string; shopDomain: string; accessToken: string; updatedAtMin?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ syncedCount: number }> {
  const orders = await fetchOrders(
    {
      shop: params.shopDomain,
      accessToken: params.accessToken,
      updatedAtMin: params.updatedAtMin,
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

export async function ingestShopifyWebhookOrder(
  env: ShopifyEnv,
  params: { brandId: string; order: ShopifyOrder },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const resolved = await resolveOrder(env, params.brandId, params.order, fetchImpl)
  await upsertPlatformOrder(env, resolved, fetchImpl)
}
