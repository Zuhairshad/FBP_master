import { describe, expect, it, vi } from 'vitest'
import { ensureAccessToken, syncAllEbayBrands, syncEbayOrders } from './sync'

const env = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-role-key' }

interface Call {
  pathname: string
  method: string
  body: unknown
}

/** Routes a fake fetch across eBay's identity/fulfillment hosts and
 * Supabase's REST API by pathname, recording every call — same shape as
 * worker/src/amazon/sync.test.ts's makeFetch. `skuByOrderId` maps an
 * orderId to the platform SKU its (single, first) line item carries. */
function makeFetch(
  ebayOrders: { orderId: string; creationDate: string; lineItems: { lineItemId: string; sku: string | null }[] }[],
) {
  const calls: Call[] = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
    const body = init?.body ? (typeof init.body === 'string' ? init.body : undefined) : undefined
    calls.push({ pathname: url.pathname, method: init?.method ?? 'GET', body })

    if (url.pathname === '/sell/fulfillment/v1/order') {
      return Response.json({ orders: ebayOrders })
    }

    if (url.pathname === '/rest/v1/sku_mappings') {
      const sku = url.searchParams.get('platform_sku')
      if (sku?.includes('eq.KNOWN-SKU')) {
        return Response.json({ platform_sku: 'KNOWN-SKU', products: { master_sku: 'SKU-001' } })
      }
      return new Response('', { status: 200, headers: { 'content-length': '0' } })
    }

    return Response.json({})
  }) as typeof fetch

  return { fetchImpl, calls }
}

describe('ensureAccessToken', () => {
  it('reuses a cached access token that is not near expiry', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const accessToken = await ensureAccessToken(
      env,
      {
        brandId: 'brand-1',
        clientId: 'ci',
        clientSecret: 'cs',
        refreshToken: 'v^1.1#refresh',
        cachedAccessToken: 'v^1.1#cached',
        cachedAccessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
      fetchImpl,
    )
    expect(accessToken).toBe('v^1.1#cached')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('refreshes when there is no cached token', async () => {
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      if (String(url) === 'https://api.ebay.com/identity/v1/oauth2/token') {
        return Response.json({ access_token: 'v^1.1#new', expires_in: 7200, token_type: 'User Access Token' })
      }
      if (url instanceof URL && url.pathname === '/rest/v1/ebay_tokens' && init?.method === 'PATCH') {
        return Response.json({})
      }
      return Response.json({})
    }) as typeof fetch

    const accessToken = await ensureAccessToken(
      env,
      {
        brandId: 'brand-1',
        clientId: 'ci',
        clientSecret: 'cs',
        refreshToken: 'v^1.1#refresh',
        cachedAccessToken: null,
        cachedAccessTokenExpiresAt: null,
      },
      fetchImpl,
    )
    expect(accessToken).toBe('v^1.1#new')
  })

  it('refreshes when the cached token is within the expiry skew', async () => {
    const fetchImpl = (async (url: string | URL) => {
      if (String(url) === 'https://api.ebay.com/identity/v1/oauth2/token') {
        return Response.json({ access_token: 'v^1.1#refreshed', expires_in: 7200, token_type: 'User Access Token' })
      }
      return Response.json({})
    }) as typeof fetch

    const accessToken = await ensureAccessToken(
      env,
      {
        brandId: 'brand-1',
        clientId: 'ci',
        clientSecret: 'cs',
        refreshToken: 'v^1.1#refresh',
        cachedAccessToken: 'v^1.1#stale',
        cachedAccessTokenExpiresAt: new Date(Date.now() + 1000).toISOString(),
      },
      fetchImpl,
    )
    expect(accessToken).toBe('v^1.1#refreshed')
  })
})

describe('syncEbayOrders', () => {
  it('resolves a known SKU and upserts a resolved order', async () => {
    const { fetchImpl, calls } = makeFetch([
      { orderId: '01-11111-11111', creationDate: '2026-01-01T00:00:00.000Z', lineItems: [{ lineItemId: 'li1', sku: 'KNOWN-SKU' }] },
    ])

    const result = await syncEbayOrders(env, { brandId: 'brand-1', accessToken: 'v^1.1#x' }, fetchImpl)

    expect(result).toEqual({ syncedCount: 1 })

    const orderUpsert = calls.find((c) => c.pathname === '/rest/v1/platform_orders')
    expect(JSON.parse(orderUpsert?.body as string)).toMatchObject({
      brand_id: 'brand-1',
      platform: 'ebay',
      platform_order_id: '01-11111-11111',
      resolved_master_sku: 'SKU-001',
      status: 'resolved',
    })

    expect(calls.some((c) => c.pathname === '/rest/v1/ebay_tokens' && c.method === 'PATCH')).toBe(true)
  })

  it('marks an order unmapped when its SKU has no mapping', async () => {
    const { fetchImpl, calls } = makeFetch([
      { orderId: '01-22222-22222', creationDate: '2026-01-01T00:00:00.000Z', lineItems: [{ lineItemId: 'li1', sku: 'NO-MAPPING' }] },
    ])

    await syncEbayOrders(env, { brandId: 'brand-1', accessToken: 'v^1.1#x' }, fetchImpl)

    const orderUpsert = calls.find((c) => c.pathname === '/rest/v1/platform_orders')
    expect(JSON.parse(orderUpsert?.body as string)).toMatchObject({ resolved_master_sku: null, status: 'unmapped' })
  })

  it('marks an order unmapped when it has no line items at all', async () => {
    const { fetchImpl, calls } = makeFetch([
      { orderId: '01-33333-33333', creationDate: '2026-01-01T00:00:00.000Z', lineItems: [] },
    ])

    await syncEbayOrders(env, { brandId: 'brand-1', accessToken: 'v^1.1#x' }, fetchImpl)

    const orderUpsert = calls.find((c) => c.pathname === '/rest/v1/platform_orders')
    expect(JSON.parse(orderUpsert?.body as string)).toMatchObject({ resolved_master_sku: null, status: 'unmapped' })
  })

  it('returns zero synced when eBay has no orders', async () => {
    const { fetchImpl } = makeFetch([])
    const result = await syncEbayOrders(env, { brandId: 'brand-1', accessToken: 'v^1.1#x' }, fetchImpl)
    expect(result).toEqual({ syncedCount: 0 })
  })
})

describe('syncAllEbayBrands', () => {
  const appParams = { clientId: 'ci', clientSecret: 'cs' }

  it('syncs every connected brand and tallies successes', async () => {
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
      if (url.pathname === '/rest/v1/ebay_tokens' && (init?.method ?? 'GET') === 'GET') {
        return Response.json([
          { id: 't1', brand_id: 'brand-1', refresh_token: 'v^1.1#r1', refresh_token_expires_at: '2027-01-01T00:00:00Z', access_token: null, access_token_expires_at: null, last_synced_at: null },
          { id: 't2', brand_id: 'brand-2', refresh_token: 'v^1.1#r2', refresh_token_expires_at: '2027-01-01T00:00:00Z', access_token: null, access_token_expires_at: null, last_synced_at: null },
        ])
      }
      if (url.pathname === '/identity/v1/oauth2/token') {
        return Response.json({ access_token: 'v^1.1#new', token_type: 'User Access Token', expires_in: 7200 })
      }
      if (url.pathname === '/sell/fulfillment/v1/order') {
        return Response.json({ orders: [] })
      }
      return Response.json({})
    }) as typeof fetch

    const result = await syncAllEbayBrands(env, appParams, fetchImpl)
    expect(result).toEqual({ successCount: 2, failureCount: 0, errors: [] })
  })

  it("isolates one brand's token-refresh failure so the rest still sync", async () => {
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
      if (url.pathname === '/rest/v1/ebay_tokens' && (init?.method ?? 'GET') === 'GET') {
        return Response.json([
          { id: 't1', brand_id: 'broken-brand', refresh_token: 'v^1.1#bad', refresh_token_expires_at: '2027-01-01T00:00:00Z', access_token: null, access_token_expires_at: null, last_synced_at: null },
          { id: 't2', brand_id: 'brand-2', refresh_token: 'v^1.1#r2', refresh_token_expires_at: '2027-01-01T00:00:00Z', access_token: null, access_token_expires_at: null, last_synced_at: null },
        ])
      }
      if (url.pathname === '/identity/v1/oauth2/token') {
        const body = new URLSearchParams(init?.body as string)
        if (body.get('refresh_token') === 'v^1.1#bad') {
          return Response.json({ error: 'invalid_grant' }, { status: 400 })
        }
        return Response.json({ access_token: 'v^1.1#new', token_type: 'User Access Token', expires_in: 7200 })
      }
      if (url.pathname === '/sell/fulfillment/v1/order') {
        return Response.json({ orders: [] })
      }
      return Response.json({})
    }) as typeof fetch

    const result = await syncAllEbayBrands(env, appParams, fetchImpl)
    expect(result.successCount).toBe(1)
    expect(result.failureCount).toBe(1)
    expect(result.errors[0]).toContain('broken-brand')
  })

  it('returns zero counts when no brand is connected', async () => {
    const fetchImpl = (async () => Response.json([])) as typeof fetch
    const result = await syncAllEbayBrands(env, appParams, fetchImpl)
    expect(result).toEqual({ successCount: 0, failureCount: 0, errors: [] })
  })
})
