import { createClient } from '@supabase/supabase-js'
import type { PlatformOrderInsert, SkuMappingRow, WalmartTokenRow } from './types'

export interface WalmartEnv {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
}

// Same fetchImpl-injection shape as worker/src/shopify/supabaseAdmin.ts —
// see that file's header comment for why.

function adminClient(env: WalmartEnv, fetchImpl: typeof fetch) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    global: { fetch: fetchImpl },
  })
}

/** Verifies a brand's Supabase session token (sent by the browser as
 * `Authorization: Bearer <token>`) and returns their user id, or null if the
 * token is missing/invalid. */
export async function verifyBrandAccessToken(
  env: WalmartEnv,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const { data, error } = await adminClient(env, fetchImpl).auth.getUser(accessToken)
  if (error || !data.user) {
    return null
  }
  return data.user.id
}

export async function getWalmartTokenForBrand(
  env: WalmartEnv,
  brandId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<WalmartTokenRow | null> {
  const { data, error } = await adminClient(env, fetchImpl)
    .from('walmart_tokens')
    .select('id, brand_id, client_id, client_secret, access_token, access_token_expires_at, last_synced_at')
    .eq('brand_id', brandId)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to load walmart_tokens for brand ${brandId}: ${error.message}`)
  }
  return data as WalmartTokenRow | null
}

/** Stores the brand's own Walmart Seller Center client_id/client_secret —
 * see the walmart_tokens migration's header comment for why this is
 * brand-submitted rather than obtained via an OAuth redirect. */
export async function upsertWalmartCredentials(
  env: WalmartEnv,
  params: { brandId: string; clientId: string; clientSecret: string },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const { error } = await adminClient(env, fetchImpl)
    .from('walmart_tokens')
    .upsert(
      { brand_id: params.brandId, client_id: params.clientId, client_secret: params.clientSecret },
      { onConflict: 'brand_id' },
    )

  if (error) {
    throw new Error(`Failed to upsert walmart_tokens for brand ${params.brandId}: ${error.message}`)
  }
}

export async function cacheAccessToken(
  env: WalmartEnv,
  params: { brandId: string; accessToken: string; accessTokenExpiresAt: string },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const { error } = await adminClient(env, fetchImpl)
    .from('walmart_tokens')
    .update({ access_token: params.accessToken, access_token_expires_at: params.accessTokenExpiresAt })
    .eq('brand_id', params.brandId)

  if (error) {
    throw new Error(`Failed to cache Walmart access token for brand ${params.brandId}: ${error.message}`)
  }
}

export async function touchLastSyncedAt(
  env: WalmartEnv,
  brandId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const { error } = await adminClient(env, fetchImpl)
    .from('walmart_tokens')
    .update({ last_synced_at: new Date().toISOString() })
    .eq('brand_id', brandId)

  if (error) {
    throw new Error(`Failed to update last_synced_at for brand ${brandId}: ${error.message}`)
  }
}

/** Resolves a Walmart line-item SKU to a brand's Master SKU via Phase 4's
 * sku_mappings table (platform='walmart'). Returns null if unmapped. */
export async function resolveMasterSku(
  env: WalmartEnv,
  brandId: string,
  platformSku: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const { data, error } = await adminClient(env, fetchImpl)
    .from('sku_mappings')
    .select('platform_sku, products(master_sku)')
    .eq('brand_id', brandId)
    .eq('platform', 'walmart')
    .eq('platform_sku', platformSku)
    .maybeSingle()

  if (error) {
    throw new Error(`Failed to resolve SKU mapping for brand ${brandId}, SKU ${platformSku}: ${error.message}`)
  }
  return (data as SkuMappingRow | null)?.products?.master_sku ?? null
}

export async function upsertPlatformOrder(
  env: WalmartEnv,
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

/** Every brand with a connected Walmart seller account — same rationale as
 * worker/src/shopify/supabaseAdmin.ts's listShopifyTokens (Phase 10). */
export async function listWalmartTokens(
  env: WalmartEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<WalmartTokenRow[]> {
  const { data, error } = await adminClient(env, fetchImpl)
    .from('walmart_tokens')
    .select('id, brand_id, client_id, client_secret, access_token, access_token_expires_at, last_synced_at')

  if (error) {
    throw new Error(`Failed to list walmart_tokens: ${error.message}`)
  }
  return (data ?? []) as WalmartTokenRow[]
}
