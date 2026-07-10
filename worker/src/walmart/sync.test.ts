import { describe, expect, it, vi } from 'vitest'
import { ensureAccessToken, syncAllWalmartBrands, syncWalmartOrders } from './sync'

const env = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-role-key' }

interface Call {
  pathname: string
  method: string
  body: unknown
}

/** Routes a fake fetch across Walmart's token/orders hosts and Supabase's
 * REST API by pathname, recording every call — same shape as
 * worker/src/ebay/sync.test.ts's makeFetch. `skuByOrderId` maps a
 * purchaseOrderId to the platform SKU its (single, first) order line
 * carries. */
function makeFetch(
  walmartOrders: { purchaseOrderId: string; orderLines: { orderLine: { item: { sku: string | null } }[] } }[],
) {
  const calls: Call[] = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
    const body = init?.body ? (typeof init.body === 'string' ? init.body : undefined) : undefined
    calls.push({ pathname: url.pathname, method: init?.method ?? 'GET', body })

    if (url.pathname === '/v3/orders') {
      return Response.json({ list: { elements: { order: walmartOrders } } })
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
        cachedAccessToken: 'wm-cached',
        cachedAccessTokenExpiresAt: new Date(Date.now() + 600_000).toISOString(),
      },
      fetchImpl,
    )
    expect(accessToken).toBe('wm-cached')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('mints when there is no cached token', async () => {
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      if (String(url) === 'https://marketplace.walmartapis.com/v3/token') {
        return Response.json({ access_token: 'wm-new', token_type: 'Bearer', expires_in: 900 })
      }
      if (url instanceof URL && url.pathname === '/rest/v1/walmart_tokens' && init?.method === 'PATCH') {
        return Response.json({})
      }
      return Response.json({})
    }) as typeof fetch

    const accessToken = await ensureAccessToken(
      env,
      { brandId: 'brand-1', clientId: 'ci', clientSecret: 'cs', cachedAccessToken: null, cachedAccessTokenExpiresAt: null },
      fetchImpl,
    )
    expect(accessToken).toBe('wm-new')
  })

  it('mints when the cached token is within the expiry skew', async () => {
    const fetchImpl = (async (url: string | URL) => {
      if (String(url) === 'https://marketplace.walmartapis.com/v3/token') {
        return Response.json({ access_token: 'wm-refreshed', token_type: 'Bearer', expires_in: 900 })
      }
      return Response.json({})
    }) as typeof fetch

    const accessToken = await ensureAccessToken(
      env,
      {
        brandId: 'brand-1',
        clientId: 'ci',
        clientSecret: 'cs',
        cachedAccessToken: 'wm-stale',
        cachedAccessTokenExpiresAt: new Date(Date.now() + 1000).toISOString(),
      },
      fetchImpl,
    )
    expect(accessToken).toBe('wm-refreshed')
  })
})

describe('syncWalmartOrders', () => {
  it('resolves a known SKU and upserts a resolved order', async () => {
    const { fetchImpl, calls } = makeFetch([
      { purchaseOrderId: '1111111111111', orderLines: { orderLine: [{ item: { sku: 'KNOWN-SKU' } }] } },
    ])

    const result = await syncWalmartOrders(env, { brandId: 'brand-1', accessToken: 'wm-x' }, fetchImpl)

    expect(result).toEqual({ syncedCount: 1 })

    const orderUpsert = calls.find((c) => c.pathname === '/rest/v1/platform_orders')
    expect(JSON.parse(orderUpsert?.body as string)).toMatchObject({
      brand_id: 'brand-1',
      platform: 'walmart',
      platform_order_id: '1111111111111',
      resolved_master_sku: 'SKU-001',
      status: 'resolved',
    })

    expect(calls.some((c) => c.pathname === '/rest/v1/walmart_tokens' && c.method === 'PATCH')).toBe(true)
  })

  it('marks an order unmapped when its SKU has no mapping', async () => {
    const { fetchImpl, calls } = makeFetch([
      { purchaseOrderId: '2222222222222', orderLines: { orderLine: [{ item: { sku: 'NO-MAPPING' } }] } },
    ])

    await syncWalmartOrders(env, { brandId: 'brand-1', accessToken: 'wm-x' }, fetchImpl)

    const orderUpsert = calls.find((c) => c.pathname === '/rest/v1/platform_orders')
    expect(JSON.parse(orderUpsert?.body as string)).toMatchObject({ resolved_master_sku: null, status: 'unmapped' })
  })

  it('marks an order unmapped when it has no order lines at all', async () => {
    const { fetchImpl, calls } = makeFetch([{ purchaseOrderId: '3333333333333', orderLines: { orderLine: [] } }])

    await syncWalmartOrders(env, { brandId: 'brand-1', accessToken: 'wm-x' }, fetchImpl)

    const orderUpsert = calls.find((c) => c.pathname === '/rest/v1/platform_orders')
    expect(JSON.parse(orderUpsert?.body as string)).toMatchObject({ resolved_master_sku: null, status: 'unmapped' })
  })

  it('returns zero synced when Walmart has no orders', async () => {
    const { fetchImpl } = makeFetch([])
    const result = await syncWalmartOrders(env, { brandId: 'brand-1', accessToken: 'wm-x' }, fetchImpl)
    expect(result).toEqual({ syncedCount: 0 })
  })
})

describe('syncAllWalmartBrands', () => {
  it('syncs every connected brand and tallies successes', async () => {
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
      if (url.pathname === '/rest/v1/walmart_tokens' && (init?.method ?? 'GET') === 'GET') {
        return Response.json([
          { id: 't1', brand_id: 'brand-1', client_id: 'client-1', client_secret: 'secret-1', access_token: null, access_token_expires_at: null, last_synced_at: null },
          { id: 't2', brand_id: 'brand-2', client_id: 'client-2', client_secret: 'secret-2', access_token: null, access_token_expires_at: null, last_synced_at: null },
        ])
      }
      if (url.pathname === '/v3/token') {
        return Response.json({ access_token: 'wm-new', token_type: 'Bearer', expires_in: 900 })
      }
      if (url.pathname === '/v3/orders') {
        return Response.json({ list: { elements: { order: [] } } })
      }
      return Response.json({})
    }) as typeof fetch

    const result = await syncAllWalmartBrands(env, fetchImpl)
    expect(result).toEqual({ successCount: 2, failureCount: 0, errors: [] })
  })

  it("isolates one brand's token-mint failure so the rest still sync", async () => {
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
      if (url.pathname === '/rest/v1/walmart_tokens' && (init?.method ?? 'GET') === 'GET') {
        return Response.json([
          { id: 't1', brand_id: 'broken-brand', client_id: 'broken-client', client_secret: 'broken-secret', access_token: null, access_token_expires_at: null, last_synced_at: null },
          { id: 't2', brand_id: 'brand-2', client_id: 'client-2', client_secret: 'secret-2', access_token: null, access_token_expires_at: null, last_synced_at: null },
        ])
      }
      if (url.pathname === '/v3/token') {
        const authHeader = (init?.headers as Record<string, string>)?.authorization ?? ''
        const decoded = atob(authHeader.replace('Basic ', ''))
        if (decoded.startsWith('broken-client:')) {
          return new Response('invalid client credentials', { status: 401 })
        }
        return Response.json({ access_token: 'wm-new', token_type: 'Bearer', expires_in: 900 })
      }
      if (url.pathname === '/v3/orders') {
        return Response.json({ list: { elements: { order: [] } } })
      }
      return Response.json({})
    }) as typeof fetch

    const result = await syncAllWalmartBrands(env, fetchImpl)
    expect(result.successCount).toBe(1)
    expect(result.failureCount).toBe(1)
    expect(result.errors[0]).toContain('broken-brand')
  })

  it('returns zero counts when no brand is connected', async () => {
    const fetchImpl = (async () => Response.json([])) as typeof fetch
    const result = await syncAllWalmartBrands(env, fetchImpl)
    expect(result).toEqual({ successCount: 0, failureCount: 0, errors: [] })
  })
})
