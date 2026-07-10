import { createClient } from '@supabase/supabase-js'
import type { EbayTokenRow, PlatformOrderInsert, SkuMappingRow } from './types'

export interface EbayEnv {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
}

// Same fetchImpl-injection shape as worker/src/shopify/supabaseAdmin.ts —
// see that file's header comment for why.

function adminClient(env: EbayEnv, fetchImpl: typeof fetch) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    global: { fetch: fetchImpl },
  })
}

/** Verifies a brand's Supabase session token (sent by the browser as
 * `Authorization: Bearer <token>`) and returns their user id, or null if the
 * token is missing/invalid. */
export async function verifyBrandAccessToken(
  env: EbayEnv,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const { data, error } = await adminClient(env, fetchImpl).auth.getUser(accessToken)
  if (error || !data.user) {
    return null
  }
  return data.user.id
}

export async function getEbayTokenForBrand(
  env: EbayEnv,
  brandId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<EbayTokenRow | null> {
  const { data, error } = await adminClient(env, fetchImpl)
    .from('ebay_tokens')
    .select('id, brand_id, refresh_token, refresh_token_expires_at, access_token, access_token_expires_at, last_synced_at')
    .eq('brand_id', brandId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load ebay_tokens for brand ${brandId}: ${error.message}`)
  }
  return data as EbayTokenRow | null
}

export async function upsertEbayTokens(
  env: EbayEnv,
  params: {
    brandId: string
    accessToken: string
    accessTokenExpiresAt: string
    refreshToken: string
    refreshTokenExpiresAt: string
  },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const { error } = await adminClient(env, fetchImpl)
    .from('ebay_tokens')
    .upsert(
      {
        brand_id: params.brandId,
        access_token: params.accessToken,
        access_token_expires_at: params.accessTokenExpiresAt,
        refresh_token: params.refreshToken,
        refresh_token_expires_at: params.refreshTokenExpiresAt,
      },
      { onConflict: 'brand_id' },
    )

  if (error) {
    throw new Error(`Failed to upsert ebay_tokens for brand ${params.brandId}: ${error.message}`)
  }
}

export async function cacheAccessToken(
  env: EbayEnv,
  params: { brandId: string; accessToken: string; accessTokenExpiresAt: string },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const { error } = await adminClient(env, fetchImpl)
    .from('ebay_tokens')
    .update({ access_token: params.accessToken, access_token_expires_at: params.accessTokenExpiresAt })
    .eq('brand_id', params.brandId)

  if (error) {
    throw new Error(`Failed to cache eBay access token for brand ${params.brandId}: ${error.message}`)
  }
}

export async function touchLastSyncedAt(
  env: EbayEnv,
  brandId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const { error } = await adminClient(env, fetchImpl)
    .from('ebay_tokens')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('brand_id', brandId)

  if (error) {
    throw new Error(`Failed to update last_synced_at for brand ${brandId}: ${error.message}`)
  }
}

/** Resolves an eBay line-item SKU to a brand's Master SKU via Phase 4's
 * sku_mappings table (platform='ebay'). Returns null if unmapped. */
export async function resolveMasterSku(
  env: EbayEnv,
  brandId: string,
  platformSku: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const { data, error } = await adminClient(env, fetchImpl)
    .from('sku_mappings')
    .select('platform_sku, products(master_sku)')
    .eq('brand_id', brandId)
    .eq('platform', 'ebay')
    .eq('platform_sku', platformSku)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to resolve SKU mapping for brand ${brandId}, SKU ${platformSku}: ${error.message}`)
  }
  return (data as SkuMappingRow | null)?.products?.master_sku ?? null
}

export async function upsertPlatformOrder(
  env: EbayEnv,
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
