import { createClient } from '@supabase/supabase-js'
import type { AmazonTokenRow, PlatformOrderInsert, SkuMappingRow } from './types'

export interface AmazonEnv {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
}

// Same fetchImpl-injection shape as worker/src/shopify/supabaseAdmin.ts and
// worker/src/tiktok/supabaseAdmin.ts — see either file's header comment.

function adminClient(env: AmazonEnv, fetchImpl: typeof fetch) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    global: { fetch: fetchImpl },
  })
}

/** Verifies a brand's Supabase session token (sent by the browser as
 * `Authorization: Bearer <token>`) and returns their user id, or null if the
 * token is missing/invalid. */
export async function verifyBrandAccessToken(
  env: AmazonEnv,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const { data, error } = await adminClient(env, fetchImpl).auth.getUser(accessToken)
  if (error || !data.user) {
    return null
  }
  return data.user.id
}

export async function getAmazonTokenForBrand(
  env: AmazonEnv,
  brandId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AmazonTokenRow | null> {
  const { data, error } = await adminClient(env, fetchImpl)
    .from('amazon_tokens')
    .select('id, brand_id, marketplace_id, refresh_token, access_token, access_token_expires_at, last_synced_at')
    .eq('brand_id', brandId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load amazon_tokens for brand ${brandId}: ${error.message}`)
  }
  return data as AmazonTokenRow | null
}

export async function upsertAmazonRefreshToken(
  env: AmazonEnv,
  params: { brandId: string; marketplaceId: string; refreshToken: string },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const { error } = await adminClient(env, fetchImpl)
    .from('amazon_tokens')
    .upsert(
      { brand_id: params.brandId, marketplace_id: params.marketplaceId, refresh_token: params.refreshToken },
      { onConflict: 'brand_id' },
    )

  if (error) {
    throw new Error(`Failed to upsert amazon_tokens for brand ${params.brandId}: ${error.message}`)
  }
}

export async function cacheAccessToken(
  env: AmazonEnv,
  params: { brandId: string; accessToken: string; accessTokenExpiresAt: string },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const { error } = await adminClient(env, fetchImpl)
    .from('amazon_tokens')
    .update({ access_token: params.accessToken, access_token_expires_at: params.accessTokenExpiresAt })
    .eq('brand_id', params.brandId)

  if (error) {
    throw new Error(`Failed to cache access token for brand ${params.brandId}: ${error.message}`)
  }
}

export async function touchLastSyncedAt(
  env: AmazonEnv,
  brandId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const { error } = await adminClient(env, fetchImpl)
    .from('amazon_tokens')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('brand_id', brandId)

  if (error) {
    throw new Error(`Failed to update last_synced_at for brand ${brandId}: ${error.message}`)
  }
}

/** Resolves an Amazon line-item SellerSKU to a brand's Master SKU via
 * Phase 4's sku_mappings table (platform='amazon'). Returns null if
 * unmapped. */
export async function resolveMasterSku(
  env: AmazonEnv,
  brandId: string,
  platformSku: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const { data, error } = await adminClient(env, fetchImpl)
    .from('sku_mappings')
    .select('platform_sku, products(master_sku)')
    .eq('brand_id', brandId)
    .eq('platform', 'amazon')
    .eq('platform_sku', platformSku)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to resolve SKU mapping for brand ${brandId}, SKU ${platformSku}: ${error.message}`)
  }
  return (data as SkuMappingRow | null)?.products?.master_sku ?? null
}

export async function upsertPlatformOrder(
  env: AmazonEnv,
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

/** Every brand with a connected Amazon seller account — same rationale as
 * worker/src/shopify/supabaseAdmin.ts's listShopifyTokens (Phase 10). */
export async function listAmazonTokens(
  env: AmazonEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<AmazonTokenRow[]> {
  const { data, error } = await adminClient(env, fetchImpl)
    .from('amazon_tokens')
    .select('id, brand_id, marketplace_id, refresh_token, access_token, access_token_expires_at, last_synced_at')

  if (error) {
    throw new Error(`Failed to list amazon_tokens: ${error.message}`)
  }
  return (data ?? []) as AmazonTokenRow[]
}
