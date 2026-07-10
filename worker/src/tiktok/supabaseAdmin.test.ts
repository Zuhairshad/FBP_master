import { describe, expect, it } from 'vitest'
import {
  getTiktokTokenForBrand,
  getTiktokTokenForShop,
  listTiktokTokens,
  resolveMasterSku,
  touchLastSyncedAt,
  upsertPlatformOrder,
  upsertTiktokToken,
  verifyBrandAccessToken,
} from './supabaseAdmin'

const env = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-role-key' }

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

describe('getTiktokTokenForBrand', () => {
  it('returns the row when one exists', async () => {
    const fetchImpl = fakeFetch((url) => {
      expect(url.pathname).toBe('/rest/v1/tiktok_tokens')
      return Response.json({
        id: 't1',
        brand_id: 'brand-1',
        shop_id: 'shop-1',
        access_token: 'act_x',
        refresh_token: 'rft_x',
        access_token_expires_at: '2026-01-01T00:00:00Z',
        last_synced_at: null,
      })
    })

    const row = await getTiktokTokenForBrand(env, 'brand-1', fetchImpl)
    expect(row?.shop_id).toBe('shop-1')
  })

  it('returns null when no row exists (maybeSingle, PostgREST 406-style empty)', async () => {
    const fetchImpl = fakeFetch(() => new Response('', { status: 200, headers: { 'content-length': '0' } }))
    const row = await getTiktokTokenForBrand(env, 'brand-2', fetchImpl)
    expect(row).toBeNull()
  })

  it('throws with a descriptive message on a database error', async () => {
    const fetchImpl = fakeFetch(() => Response.json({ message: 'connection refused', code: '500' }, { status: 500 }))
    await expect(getTiktokTokenForBrand(env, 'brand-1', fetchImpl)).rejects.toThrow(/Failed to load tiktok_tokens/)
  })
})

describe('getTiktokTokenForShop', () => {
  it('returns the row for the given shop id', async () => {
    const fetchImpl = fakeFetch(() =>
      Response.json({
        id: 't1',
        brand_id: 'brand-1',
        shop_id: 'shop-1',
        access_token: 'act_x',
        refresh_token: 'rft_x',
        access_token_expires_at: '2026-01-01T00:00:00Z',
        last_synced_at: null,
      }),
    )
    const row = await getTiktokTokenForShop(env, 'shop-1', fetchImpl)
    expect(row?.brand_id).toBe('brand-1')
  })
})

describe('upsertTiktokToken', () => {
  it('posts the token row with an on-conflict upsert', async () => {
    const fetchImpl = fakeFetch((url, init) => {
      expect(url.pathname).toBe('/rest/v1/tiktok_tokens')
      expect(url.searchParams.get('on_conflict')).toBe('brand_id')
      expect(init?.method).toBe('POST')
      return Response.json({})
    })

    await upsertTiktokToken(
      env,
      {
        brandId: 'brand-1',
        shopId: 'shop-1',
        accessToken: 'act_x',
        refreshToken: 'rft_x',
        accessTokenExpiresAt: '2026-01-01T00:00:00Z',
      },
      fetchImpl,
    )
  })

  it('throws on a database error', async () => {
    const fetchImpl = fakeFetch(() => Response.json({ message: 'unique violation' }, { status: 409 }))
    await expect(
      upsertTiktokToken(
        env,
        { brandId: 'brand-1', shopId: 'shop-x', accessToken: 'y', refreshToken: 'z', accessTokenExpiresAt: '2026-01-01T00:00:00Z' },
        fetchImpl,
      ),
    ).rejects.toThrow(/Failed to upsert tiktok_tokens/)
  })
})

describe('touchLastSyncedAt', () => {
  it('patches the row for the given brand', async () => {
    const fetchImpl = fakeFetch((url, init) => {
      expect(url.pathname).toBe('/rest/v1/tiktok_tokens')
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
      return Response.json({ platform_sku: 'TT-001', products: { master_sku: 'SKU-001' } })
    })

    expect(await resolveMasterSku(env, 'brand-1', 'TT-001', fetchImpl)).toBe('SKU-001')
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
      { brand_id: 'brand-1', platform: 'tiktok', platform_order_id: '1001', raw_data: { id: '1001' }, resolved_master_sku: 'SKU-001', status: 'resolved' },
      fetchImpl,
    )
  })
})

describe('listTiktokTokens', () => {
  it('returns every row with no owner filter', async () => {
    const fetchImpl = fakeFetch((url) => {
      expect(url.pathname).toBe('/rest/v1/tiktok_tokens')
      expect(url.searchParams.has('brand_id')).toBe(false)
      return Response.json([
        { id: 't1', brand_id: 'brand-1', shop_id: 'shop-1', access_token: 'act_1', refresh_token: 'rft_1', access_token_expires_at: '2026-01-01T00:00:00Z', last_synced_at: null },
        { id: 't2', brand_id: 'brand-2', shop_id: 'shop-2', access_token: 'act_2', refresh_token: 'rft_2', access_token_expires_at: '2026-01-01T00:00:00Z', last_synced_at: null },
      ])
    })

    const tokens = await listTiktokTokens(env, fetchImpl)
    expect(tokens).toHaveLength(2)
    expect(tokens.map((t) => t.brand_id)).toEqual(['brand-1', 'brand-2'])
  })

  it('returns an empty array when no brand is connected', async () => {
    const fetchImpl = fakeFetch(() => Response.json([]))
    expect(await listTiktokTokens(env, fetchImpl)).toEqual([])
  })

  it('throws with a descriptive message on a database error', async () => {
    const fetchImpl = fakeFetch(() => Response.json({ message: 'connection refused' }, { status: 500 }))
    await expect(listTiktokTokens(env, fetchImpl)).rejects.toThrow(/Failed to list tiktok_tokens/)
  })
})
