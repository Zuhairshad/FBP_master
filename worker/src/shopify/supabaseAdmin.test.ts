import { describe, expect, it } from 'vitest'
import {
  getShopifyTokenForBrand,
  getShopifyTokenForShop,
  resolveMasterSku,
  touchLastSyncedAt,
  upsertPlatformOrder,
  upsertShopifyToken,
  verifyBrandAccessToken,
} from './supabaseAdmin'

const env = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-role-key' }

/** Fakes the Supabase REST/Auth wire format just enough to drive our own
 * code's branches (found/not-found/error) — not to re-verify PostgREST's own
 * query encoding, which is Supabase's tested library code, not ours. */
function fakeFetch(responder: (url: URL, init?: RequestInit) => Response): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
    return responder(url, init)
  }) as typeof fetch
}

describe('verifyBrandAccessToken', () => {
  it('returns the user id for a valid token', async () => {
    const fetchImpl = fakeFetch((url) => {
      expect(url.pathname).toBe('/auth/v1/user')
      return Response.json({ id: 'brand-1', aud: 'authenticated' })
    })

    expect(await verifyBrandAccessToken(env, 'valid-token', fetchImpl)).toBe('brand-1')
  })

  it('returns null for an invalid/expired token', async () => {
    const fetchImpl = fakeFetch(() => Response.json({ error: 'invalid token' }, { status: 401 }))
    expect(await verifyBrandAccessToken(env, 'bad-token', fetchImpl)).toBeNull()
  })
})

describe('getShopifyTokenForBrand', () => {
  it('returns the row when one exists', async () => {
    const fetchImpl = fakeFetch((url) => {
      expect(url.pathname).toBe('/rest/v1/shopify_tokens')
      return Response.json({
        id: 't1',
        brand_id: 'brand-1',
        shop_domain: 'brand-1.myshopify.com',
        access_token: 'shpat_x',
        scope: 'read_orders',
        last_synced_at: null,
      })
    })

    const row = await getShopifyTokenForBrand(env, 'brand-1', fetchImpl)
    expect(row?.shop_domain).toBe('brand-1.myshopify.com')
  })

  it('returns null when no row exists (maybeSingle, PostgREST 406-style empty)', async () => {
    const fetchImpl = fakeFetch(() => new Response('', { status: 200, headers: { 'content-length': '0' } }))
    const row = await getShopifyTokenForBrand(env, 'brand-2', fetchImpl)
    expect(row).toBeNull()
  })

  it('throws with a descriptive message on a database error', async () => {
    const fetchImpl = fakeFetch(() =>
      Response.json({ message: 'connection refused', code: '500' }, { status: 500 }),
    )
    await expect(getShopifyTokenForBrand(env, 'brand-1', fetchImpl)).rejects.toThrow(/Failed to load shopify_tokens/)
  })
})

describe('getShopifyTokenForShop', () => {
  it('returns the row for the given shop domain', async () => {
    const fetchImpl = fakeFetch(() =>
      Response.json({
        id: 't1',
        brand_id: 'brand-1',
        shop_domain: 'brand-1.myshopify.com',
        access_token: 'shpat_x',
        scope: 'read_orders',
        last_synced_at: null,
      }),
    )
    const row = await getShopifyTokenForShop(env, 'brand-1.myshopify.com', fetchImpl)
    expect(row?.brand_id).toBe('brand-1')
  })
})

describe('upsertShopifyToken', () => {
  it('posts the token row with an on-conflict upsert', async () => {
    const fetchImpl = fakeFetch((url, init) => {
      expect(url.pathname).toBe('/rest/v1/shopify_tokens')
      expect(url.searchParams.get('on_conflict')).toBe('brand_id')
      expect(init?.method).toBe('POST')
      return Response.json({})
    })

    await upsertShopifyToken(
      env,
      { brandId: 'brand-1', shopDomain: 'brand-1.myshopify.com', accessToken: 'shpat_x', scope: 'read_orders' },
      fetchImpl,
    )
  })

  it('throws on a database error', async () => {
    const fetchImpl = fakeFetch(() => Response.json({ message: 'unique violation' }, { status: 409 }))
    await expect(
      upsertShopifyToken(
        env,
        { brandId: 'brand-1', shopDomain: 'x.myshopify.com', accessToken: 'y', scope: 'z' },
        fetchImpl,
      ),
    ).rejects.toThrow(/Failed to upsert shopify_tokens/)
  })
})

describe('touchLastSyncedAt', () => {
  it('patches the row for the given brand', async () => {
    const fetchImpl = fakeFetch((url, init) => {
      expect(url.pathname).toBe('/rest/v1/shopify_tokens')
      expect(init?.method).toBe('PATCH')
      return Response.json({})
    })
    await touchLastSyncedAt(env, 'brand-1', fetchImpl)
  })
})

describe('resolveMasterSku', () => {
  it('returns the master_sku when a mapping exists', async () => {
    const fetchImpl = fakeFetch((url) => {
      expect(url.pathname).toBe('/rest/v1/sku_mappings')
      return Response.json({ platform_sku: 'AMZ-001', products: { master_sku: 'SKU-001' } })
    })

    expect(await resolveMasterSku(env, 'brand-1', 'AMZ-001', fetchImpl)).toBe('SKU-001')
  })

  it('returns null when unmapped', async () => {
    const fetchImpl = fakeFetch(() => new Response('', { status: 200, headers: { 'content-length': '0' } }))
    expect(await resolveMasterSku(env, 'brand-1', 'UNKNOWN-SKU', fetchImpl)).toBeNull()
  })
})

describe('upsertPlatformOrder', () => {
  it('posts the order with an on-conflict upsert on (platform, platform_order_id)', async () => {
    const fetchImpl = fakeFetch((url) => {
      expect(url.pathname).toBe('/rest/v1/platform_orders')
      expect(url.searchParams.get('on_conflict')).toBe('platform,platform_order_id')
      return Response.json({})
    })

    await upsertPlatformOrder(
      env,
      {
        brand_id: 'brand-1',
        platform: 'shopify',
        platform_order_id: '1001',
        raw_data: { id: 1001 },
        resolved_master_sku: 'SKU-001',
        status: 'resolved',
      },
      fetchImpl,
    )
  })
})
