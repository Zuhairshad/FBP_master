import { describe, expect, it } from 'vitest'
import {
  cacheAccessToken,
  getEbayTokenForBrand,
  resolveMasterSku,
  touchLastSyncedAt,
  upsertEbayTokens,
  upsertPlatformOrder,
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

describe('getEbayTokenForBrand', () => {
  it('returns the row when one exists', async () => {
    const fetchImpl = fakeFetch((url) => {
      expect(url.pathname).toBe('/rest/v1/ebay_tokens')
      return Response.json({
        id: 't1',
        brand_id: 'brand-1',
        refresh_token: 'v^1.1#refresh',
        refresh_token_expires_at: '2027-01-01T00:00:00Z',
        access_token: null,
        access_token_expires_at: null,
        last_synced_at: null,
      })
    })

    const row = await getEbayTokenForBrand(env, 'brand-1', fetchImpl)
    expect(row?.refresh_token).toBe('v^1.1#refresh')
  })

  it('returns null when no row exists (maybeSingle, PostgREST 406-style empty)', async () => {
    const fetchImpl = fakeFetch(() => new Response('', { status: 200, headers: { 'content-length': '0' } }))
    const row = await getEbayTokenForBrand(env, 'brand-2', fetchImpl)
    expect(row).toBeNull()
  })

  it('throws with a descriptive message on a database error', async () => {
    const fetchImpl = fakeFetch(() => Response.json({ message: 'connection refused', code: '500' }, { status: 500 }))
    await expect(getEbayTokenForBrand(env, 'brand-1', fetchImpl)).rejects.toThrow(/Failed to load ebay_tokens/)
  })
})

describe('upsertEbayTokens', () => {
  it('posts both tokens with an on-conflict upsert', async () => {
    const fetchImpl = fakeFetch((url, init) => {
      expect(url.pathname).toBe('/rest/v1/ebay_tokens')
      expect(url.searchParams.get('on_conflict')).toBe('brand_id')
      expect(init?.method).toBe('POST')
      return Response.json({})
    })

    await upsertEbayTokens(
      env,
      {
        brandId: 'brand-1',
        accessToken: 'v^1.1#access',
        accessTokenExpiresAt: '2026-01-01T02:00:00Z',
        refreshToken: 'v^1.1#refresh',
        refreshTokenExpiresAt: '2027-07-01T00:00:00Z',
      },
      fetchImpl,
    )
  })

  it('throws on a database error', async () => {
    const fetchImpl = fakeFetch(() => Response.json({ message: 'unique violation' }, { status: 409 }))
    await expect(
      upsertEbayTokens(
        env,
        {
          brandId: 'brand-1',
          accessToken: 'x',
          accessTokenExpiresAt: 'y',
          refreshToken: 'z',
          refreshTokenExpiresAt: 'w',
        },
        fetchImpl,
      ),
    ).rejects.toThrow(/Failed to upsert ebay_tokens/)
  })
})

describe('cacheAccessToken', () => {
  it('patches the row with the new access token + expiry', async () => {
    const fetchImpl = fakeFetch((url, init) => {
      expect(url.pathname).toBe('/rest/v1/ebay_tokens')
      expect(init?.method).toBe('PATCH')
      return Response.json({})
    })
    await cacheAccessToken(
      env,
      { brandId: 'brand-1', accessToken: 'v^1.1#x', accessTokenExpiresAt: '2026-01-01T00:00:00Z' },
      fetchImpl,
    )
  })
})

describe('touchLastSyncedAt', () => {
  it('patches the row for the given brand', async () => {
    const fetchImpl = fakeFetch((url, init) => {
      expect(url.pathname).toBe('/rest/v1/ebay_tokens')
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
      return Response.json({ platform_sku: 'EBAY-001', products: { master_sku: 'SKU-001' } })
    })

    expect(await resolveMasterSku(env, 'brand-1', 'EBAY-001', fetchImpl)).toBe('SKU-001')
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
        platform: 'ebay',
        platform_order_id: '01-12345-67890',
        raw_data: { orderId: '01-12345-67890' },
        resolved_master_sku: 'SKU-001',
        status: 'resolved',
      },
      fetchImpl,
    )
  })
})
