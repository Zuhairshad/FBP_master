import { describe, expect, it } from 'vitest'
import { ingestShopifyWebhookOrder, syncAllShopifyBrands, syncShopifyOrders } from './sync'

const env = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-role-key' }

interface Call {
  pathname: string
  method: string
  body: unknown
}

/** Routes a fake fetch across both Shopify's API and Supabase's REST API by
 * hostname, recording every call so tests can assert on what sync.ts wrote
 * without re-implementing PostgREST's query semantics. */
function makeFetch(shopifyOrders: unknown[]) {
  const calls: Call[] = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
    const body = init?.body ? JSON.parse(init.body as string) : undefined
    calls.push({ pathname: url.pathname, method: init?.method ?? 'GET', body })

    if (url.hostname.endsWith('.myshopify.com')) {
      return Response.json({ orders: shopifyOrders })
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

describe('syncShopifyOrders', () => {
  it('resolves a known SKU and upserts a resolved order', async () => {
    const { fetchImpl, calls } = makeFetch([
      { id: 1001, name: '#1001', created_at: '2026-01-01T00:00:00Z', line_items: [{ sku: 'KNOWN-SKU' }] },
    ])

    const result = await syncShopifyOrders(
      env,
      { brandId: 'brand-1', shopDomain: 'brand-1.myshopify.com', accessToken: 'shpat_x' },
      fetchImpl,
    )

    expect(result).toEqual({ syncedCount: 1 })

    const orderUpsert = calls.find((c) => c.pathname === '/rest/v1/platform_orders')
    expect(orderUpsert?.body).toMatchObject({
      brand_id: 'brand-1',
      platform: 'shopify',
      platform_order_id: '1001',
      resolved_master_sku: 'SKU-001',
      status: 'resolved',
    })

    expect(calls.some((c) => c.pathname === '/rest/v1/shopify_tokens' && c.method === 'PATCH')).toBe(true)
  })

  it('marks an order unmapped when its SKU has no mapping', async () => {
    const { fetchImpl, calls } = makeFetch([
      { id: 2002, name: '#2002', created_at: '2026-01-01T00:00:00Z', line_items: [{ sku: 'NO-MAPPING' }] },
    ])

    await syncShopifyOrders(
      env,
      { brandId: 'brand-1', shopDomain: 'brand-1.myshopify.com', accessToken: 'shpat_x' },
      fetchImpl,
    )

    const orderUpsert = calls.find((c) => c.pathname === '/rest/v1/platform_orders')
    expect(orderUpsert?.body).toMatchObject({ resolved_master_sku: null, status: 'unmapped' })
  })

  it('marks an order unmapped when it has no line items at all', async () => {
    const { fetchImpl, calls } = makeFetch([{ id: 3003, name: '#3003', created_at: '2026-01-01T00:00:00Z', line_items: [] }])

    await syncShopifyOrders(
      env,
      { brandId: 'brand-1', shopDomain: 'brand-1.myshopify.com', accessToken: 'shpat_x' },
      fetchImpl,
    )

    const orderUpsert = calls.find((c) => c.pathname === '/rest/v1/platform_orders')
    expect(orderUpsert?.body).toMatchObject({ resolved_master_sku: null, status: 'unmapped' })
  })

  it('returns zero synced when Shopify has no orders', async () => {
    const { fetchImpl } = makeFetch([])
    const result = await syncShopifyOrders(
      env,
      { brandId: 'brand-1', shopDomain: 'brand-1.myshopify.com', accessToken: 'shpat_x' },
      fetchImpl,
    )
    expect(result).toEqual({ syncedCount: 0 })
  })
})

describe('syncAllShopifyBrands', () => {
  it('syncs every connected brand and tallies successes', async () => {
    const calls: Call[] = []
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
      calls.push({ pathname: url.pathname, method: init?.method ?? 'GET', body: undefined })

      if (url.pathname === '/rest/v1/shopify_tokens' && (init?.method ?? 'GET') === 'GET') {
        return Response.json([
          { id: 't1', brand_id: 'brand-1', shop_domain: 'brand-1.myshopify.com', access_token: 'shpat_1', scope: 'read_orders', last_synced_at: null },
          { id: 't2', brand_id: 'brand-2', shop_domain: 'brand-2.myshopify.com', access_token: 'shpat_2', scope: 'read_orders', last_synced_at: null },
        ])
      }
      if (url.hostname.endsWith('.myshopify.com')) {
        return Response.json({ orders: [] })
      }
      return Response.json({})
    }) as typeof fetch

    const result = await syncAllShopifyBrands(env, fetchImpl)
    expect(result).toEqual({ successCount: 2, failureCount: 0, errors: [] })
  })

  it("isolates one brand's failure so the rest still sync", async () => {
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)

      if (url.pathname === '/rest/v1/shopify_tokens' && (init?.method ?? 'GET') === 'GET') {
        return Response.json([
          { id: 't1', brand_id: 'broken-brand', shop_domain: 'broken.myshopify.com', access_token: 'shpat_bad', scope: 'read_orders', last_synced_at: null },
          { id: 't2', brand_id: 'brand-2', shop_domain: 'brand-2.myshopify.com', access_token: 'shpat_2', scope: 'read_orders', last_synced_at: null },
        ])
      }
      if (url.hostname === 'broken.myshopify.com') {
        return new Response('server error', { status: 500 })
      }
      if (url.hostname.endsWith('.myshopify.com')) {
        return Response.json({ orders: [] })
      }
      return Response.json({})
    }) as typeof fetch

    const result = await syncAllShopifyBrands(env, fetchImpl)
    expect(result.successCount).toBe(1)
    expect(result.failureCount).toBe(1)
    expect(result.errors[0]).toContain('broken-brand')
  })

  it('returns zero counts when no brand is connected', async () => {
    const fetchImpl = (async () => Response.json([])) as typeof fetch
    const result = await syncAllShopifyBrands(env, fetchImpl)
    expect(result).toEqual({ successCount: 0, failureCount: 0, errors: [] })
  })
})

describe('ingestShopifyWebhookOrder', () => {
  it('resolves and upserts a single webhook-delivered order', async () => {
    const { fetchImpl, calls } = makeFetch([])

    await ingestShopifyWebhookOrder(
      env,
      {
        brandId: 'brand-1',
        order: { id: 4004, name: '#4004', created_at: '2026-01-01T00:00:00Z', line_items: [{ sku: 'KNOWN-SKU' }] },
      },
      fetchImpl,
    )

    const orderUpsert = calls.find((c) => c.pathname === '/rest/v1/platform_orders')
    expect(orderUpsert?.body).toMatchObject({ platform_order_id: '4004', status: 'resolved' })
  })
})
