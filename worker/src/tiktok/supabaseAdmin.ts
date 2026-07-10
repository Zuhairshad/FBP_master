import { createClient } from '@supabase/supabase-js'
import type { PlatformOrderInsert, SkuMappingRow, TiktokTokenRow } from './types'

export interface TiktokEnv {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
}

// Same fetchImpl-injection shape as worker/src/shopify/supabaseAdmin.ts —
// see that file's header comment for why.

function adminClient(env: TiktokEnv, fetchImpl: typeof fetch) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    global: { fetch: fetchImpl },
  })
}

/** Verifies a brand's Supabase session token (sent by the browser as
 * `Authorization: Bearer <token>`) and returns their user id, or null if the
 * token is missing/invalid. */
export async function verifyBrandAccessToken(
  env: TiktokEnv,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const { data, error } = await adminClient(env, fetchImpl).auth.getUser(accessToken)
  if (error || !data.user) {
    return null
  }
  return data.user.id
}

export async function getTiktokTokenForBrand(
  env: TiktokEnv,
  brandId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TiktokTokenRow | null> {
  const { data, error } = await adminClient(env, fetchImpl)
    .from('tiktok_tokens')
    .select('id, brand_id, shop_id, access_token, refresh_token, access_token_expires_at, last_synced_at')
    .eq('brand_id', brandId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load tiktok_tokens for brand ${brandId}: ${error.message}`)
  }
  return data as TiktokTokenRow | null
}

export async function getTiktokTokenForShop(
  env: TiktokEnv,
  shopId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TiktokTokenRow | null> {
  const { data, error } = await adminClient(env, fetchImpl)
    .from('tiktok_tokens')
    .select('id, brand_id, shop_id, access_token, refresh_token, access_token_expires_at, last_synced_at')
    .eq('shop_id', shopId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load tiktok_tokens for shop ${shopId}: ${error.message}`)
  }
  return data as TiktokTokenRow | null
}

export async function upsertTiktokToken(
  env: TiktokEnv,
  params: {
    brandId: string
    shopId: string
    accessToken: string
    refreshToken: string
    accessTokenExpiresAt: string
  },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const { error } = await adminClient(env, fetchImpl)
    .from('tiktok_tokens')
    .upsert(
      {
        brand_id: params.brandId,
        shop_id: params.shopId,
        access_token: params.accessToken,
        refresh_token: params.refreshToken,
        access_token_expires_at: params.accessTokenExpiresAt,
      },
      { onConflict: 'brand_id' },
    )

  if (error) {
    throw new Error(`Failed to upsert tiktok_tokens for brand ${params.brandId}: ${error.message}`)
  }
}

export async function touchLastSyncedAt(
  env: TiktokEnv,
  brandId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const { error } = await adminClient(env, fetchImpl)
    .from('tiktok_tokens')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('brand_id', brandId)

  if (error) {
    throw new Error(`Failed to update last_synced_at for brand ${brandId}: ${error.message}`)
  }
}

/** Resolves a TikTok line-item SKU to a brand's Master SKU via Phase 4's
 * sku_mappings table (platform='tiktok'). Returns null if unmapped. */
export async function resolveMasterSku(
  env: TiktokEnv,
  brandId: string,
  platformSku: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const { data, error } = await adminClient(env, fetchImpl)
    .from('sku_mappings')
    .select('platform_sku, products(master_sku)')
    .eq('brand_id', brandId)
    .eq('platform', 'tiktok')
    .eq('platform_sku', platformSku)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to resolve SKU mapping for brand ${brandId}, SKU ${platformSku}: ${error.message}`)
  }
  return (data as SkuMappingRow | null)?.products?.master_sku ?? null
}

export async function upsertPlatformOrder(
  env: TiktokEnv,
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
