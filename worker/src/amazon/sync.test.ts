import { describe, expect, it, vi } from 'vitest'
import { ensureAccessToken, syncAmazonOrders } from './sync'

const env = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-role-key' }

interface Call {
  pathname: string
  method: string
  body: unknown
}

/** Routes a fake fetch across Amazon's LWA/SP-API hosts and Supabase's REST
 * API by hostname, recording every call — same shape as
 * worker/src/tiktok/sync.test.ts's makeFetch. `orderItemsBySku` maps an
 * AmazonOrderId to the SellerSKU its (single, first) order item carries. */
function makeFetch(amazonOrders: { AmazonOrderId: string; PurchaseDate: string; OrderStatus: string }[], orderItemsBySku: Record<string, string | null>) {
  const calls: Call[] = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
    const body = init?.body ? (typeof init.body === 'string' ? init.body : undefined) : undefined
    calls.push({ pathname: url.pathname, method: init?.method ?? 'GET', body })

    if (url.pathname === '/orders/v0/orders') {
      return Response.json({ payload: { Orders: amazonOrders } })
    }

    if (url.pathname.startsWith('/orders/v0/orders/') && url.pathname.endsWith('/orderItems')) {
      const orderId = url.pathname.split('/')[4]
      const sku = orderItemsBySku[orderId]
      return Response.json({
        payload: { OrderItems: sku ? [{ OrderItemId: 'i1', SellerSKU: sku, ASIN: 'B000000000' }] : [] },
      })
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
        refreshToken: 'Atzr|x',
        cachedAccessToken: 'Atza|cached',
        cachedAccessTokenExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      },
      fetchImpl,
    )
    expect(accessToken).toBe('Atza|cached')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('refreshes when there is no cached token', async () => {
    const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
      if (String(url) === 'https://api.amazon.com/auth/o2/token') {
        return Response.json({ access_token: 'Atza|new', token_type: 'bearer', expires_in: 3600 })
      }
      if (url instanceof URL && url.pathname === '/rest/v1/amazon_tokens' && init?.method === 'PATCH') {
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
        refreshToken: 'Atzr|x',
        cachedAccessToken: null,
        cachedAccessTokenExpiresAt: null,
      },
      fetchImpl,
    )
    expect(accessToken).toBe('Atza|new')
  })

  it('refreshes when the cached token is within the expiry skew', async () => {
    const fetchImpl = (async (url: string | URL) => {
      if (String(url) === 'https://api.amazon.com/auth/o2/token') {
        return Response.json({ access_token: 'Atza|refreshed', token_type: 'bearer', expires_in: 3600 })
      }
      return Response.json({})
    }) as typeof fetch

    const accessToken = await ensureAccessToken(
      env,
      {
        brandId: 'brand-1',
        clientId: 'ci',
        clientSecret: 'cs',
        refreshToken: 'Atzr|x',
        cachedAccessToken: 'Atza|stale',
        cachedAccessTokenExpiresAt: new Date(Date.now() + 1000).toISOString(),
      },
      fetchImpl,
    )
    expect(accessToken).toBe('Atza|refreshed')
  })
})

describe('syncAmazonOrders', () => {
  it('resolves a known SKU and upserts a resolved order', async () => {
    const { fetchImpl, calls } = makeFetch(
      [{ AmazonOrderId: '111-1111111-1111111', PurchaseDate: '2026-01-01T00:00:00Z', OrderStatus: 'Unshipped' }],
      { '111-1111111-1111111': 'KNOWN-SKU' },
    )

    const result = await syncAmazonOrders(
      env,
      { brandId: 'brand-1', marketplaceId: 'ATVPDKIKX0DER', accessToken: 'Atza|x' },
      fetchImpl,
    )

    expect(result).toEqual({ syncedCount: 1 })

    const orderUpsert = calls.find((c) => c.pathname === '/rest/v1/platform_orders')
    expect(JSON.parse(orderUpsert?.body as string)).toMatchObject({
      brand_id: 'brand-1',
      platform: 'amazon',
      platform_order_id: '111-1111111-1111111',
      resolved_master_sku: 'SKU-001',
      status: 'resolved',
    })

    expect(calls.some((c) => c.pathname === '/rest/v1/amazon_tokens' && c.method === 'PATCH')).toBe(true)
  })

  it('marks an order unmapped when its SKU has no mapping', async () => {
    const { fetchImpl, calls } = makeFetch(
      [{ AmazonOrderId: '222-2222222-2222222', PurchaseDate: '2026-01-01T00:00:00Z', OrderStatus: 'Unshipped' }],
      { '222-2222222-2222222': 'NO-MAPPING' },
    )

    await syncAmazonOrders(env, { brandId: 'brand-1', marketplaceId: 'ATVPDKIKX0DER', accessToken: 'Atza|x' }, fetchImpl)

    const orderUpsert = calls.find((c) => c.pathname === '/rest/v1/platform_orders')
    expect(JSON.parse(orderUpsert?.body as string)).toMatchObject({ resolved_master_sku: null, status: 'unmapped' })
  })

  it('marks an order unmapped when it has no order items at all', async () => {
    const { fetchImpl, calls } = makeFetch(
      [{ AmazonOrderId: '333-3333333-3333333', PurchaseDate: '2026-01-01T00:00:00Z', OrderStatus: 'Pending' }],
      { '333-3333333-3333333': null },
    )

    await syncAmazonOrders(env, { brandId: 'brand-1', marketplaceId: 'ATVPDKIKX0DER', accessToken: 'Atza|x' }, fetchImpl)

    const orderUpsert = calls.find((c) => c.pathname === '/rest/v1/platform_orders')
    expect(JSON.parse(orderUpsert?.body as string)).toMatchObject({ resolved_master_sku: null, status: 'unmapped' })
  })

  it('returns zero synced when Amazon has no orders', async () => {
    const { fetchImpl } = makeFetch([], {})
    const result = await syncAmazonOrders(
      env,
      { brandId: 'brand-1', marketplaceId: 'ATVPDKIKX0DER', accessToken: 'Atza|x' },
      fetchImpl,
    )
    expect(result).toEqual({ syncedCount: 0 })
  })
})
