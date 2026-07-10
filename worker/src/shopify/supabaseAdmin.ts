import { createClient } from '@supabase/supabase-js'
import type { PlatformOrderInsert, ShopifyTokenRow, SkuMappingRow } from './types'

export interface ShopifyEnv {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
}

// Every function below takes an explicit `fetchImpl` (defaulting to the
// global `fetch`) and forwards it into supabase-js's `global.fetch` option —
// the same injection point client.ts uses for Shopify's own API. This makes
// every Supabase call here replaceable with a fake in tests, with no
// reliance on module-global fetch stubbing.

function adminClient(env: ShopifyEnv, fetchImpl: typeof fetch) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    global: { fetch: fetchImpl },
  })
}

/** Verifies a brand's Supabase session token (sent by the browser as
 * `Authorization: Bearer <token>`) and returns their user id, or null if the
 * token is missing/invalid. Runs the actual Auth-server validation — never
 * trusts a client-supplied brand id directly. */
export async function verifyBrandAccessToken(
  env: ShopifyEnv,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const { data, error } = await adminClient(env, fetchImpl).auth.getUser(accessToken)
  if (error || !data.user) {
    return null
  }
  return data.user.id
}

export async function getShopifyTokenForBrand(
  env: ShopifyEnv,
  brandId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ShopifyTokenRow | null> {
  const { data, error } = await adminClient(env, fetchImpl)
    .from('shopify_tokens')
    .select('id, brand_id, shop_domain, access_token, scope, last_synced_at')
    .eq('brand_id', brandId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load shopify_tokens for brand ${brandId}: ${error.message}`)
  }
  return data as ShopifyTokenRow | null
}

export async function getShopifyTokenForShop(
  env: ShopifyEnv,
  shopDomain: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ShopifyTokenRow | null> {
  const { data, error } = await adminClient(env, fetchImpl)
    .from('shopify_tokens')
    .select('id, brand_id, shop_domain, access_token, scope, last_synced_at')
    .eq('shop_domain', shopDomain)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load shopify_tokens for shop ${shopDomain}: ${error.message}`)
  }
  return data as ShopifyTokenRow | null
}

export async function upsertShopifyToken(
  env: ShopifyEnv,
  params: { brandId: string; shopDomain: string; accessToken: string; scope: string },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const { error } = await adminClient(env, fetchImpl)
    .from('shopify_tokens')
    .upsert(
      {
        brand_id: params.brandId,
        shop_domain: params.shopDomain,
        access_token: params.accessToken,
        scope: params.scope,
      },
      { onConflict: 'brand_id' },
    )

  if (error) {
    throw new Error(`Failed to upsert shopify_tokens for brand ${params.brandId}: ${error.message}`)
  }
}

export async function touchLastSyncedAt(
  env: ShopifyEnv,
  brandId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const { error } = await adminClient(env, fetchImpl)
    .from('shopify_tokens')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('brand_id', brandId)

  if (error) {
    throw new Error(`Failed to update last_synced_at for brand ${brandId}: ${error.message}`)
  }
}

/** Resolves a Shopify line-item SKU to a brand's Master SKU via Phase 4's
 * sku_mappings table (platform='shopify'). Returns null if unmapped. */
export async function resolveMasterSku(
  env: ShopifyEnv,
  brandId: string,
  platformSku: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const { data, error } = await adminClient(env, fetchImpl)
    .from('sku_mappings')
    .select('platform_sku, products(master_sku)')
    .eq('brand_id', brandId)
    .eq('platform', 'shopify')
    .eq('platform_sku', platformSku)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to resolve SKU mapping for brand ${brandId}, SKU ${platformSku}: ${error.message}`)
  }
  return (data as SkuMappingRow | null)?.products?.master_sku ?? null
}

export async function upsertPlatformOrder(
  env: ShopifyEnv,
  order: PlatformOrderInsert,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const { error } = await adminClient(env, fetchImpl)
    .from('platform_orders')
    .upsert(order, { onConflict: 'platform,platform_order_id' })

  if (error) {
    throw new Error(`Failed to upsert platform_orders row ${order.platform_order_id}: ${error.message}`)
  }
}
