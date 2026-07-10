import { describe, expect, it } from 'vitest'
import { ingestTiktokWebhookOrder, syncAllTiktokBrands, syncTiktokOrders } from './sync'

const env = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-role-key' }

interface Call {
  pathname: string
  method: string
  body: unknown
}

/** Routes a fake fetch across both TikTok's open-api host and Supabase's
 * REST API by hostname, recording every call — same shape as
 * worker/src/shopify/sync.test.ts's makeFetch. */
function makeFetch(tiktokOrders: unknown[]) {
  const calls: Call[] = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
    const body = init?.body ? JSON.parse(init.body as string) : undefined
    calls.push({ pathname: url.pathname, method: init?.method ?? 'GET', body })

    if (url.hostname === 'open-api.tiktokglobalshop.com') {
      return Response.json({ code: 0, message: 'success', data: { orders: tiktokOrders } })
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

describe('syncTiktokOrders', () => {
  it('resolves a known SKU and upserts a resolved order', async () => {
    const { fetchImpl, calls } = makeFetch([{ id: '1001', create_time: 1, line_items: [{ seller_sku: 'KNOWN-SKU' }] }])

    const result = await syncTiktokOrders(
      env,
      { brandId: 'brand-1', shopId: 'shop-1', accessToken: 'act_x', appKey: 'ak', appSecret: 'as' },
      fetchImpl,
    )

    expect(result).toEqual({ syncedCount: 1 })

    const orderUpsert = calls.find((c) => c.pathname === '/rest/v1/platform_orders')
    expect(orderUpsert?.body).toMatchObject({
      brand_id: 'brand-1',
      platform: 'tiktok',
      platform_order_id: '1001',
      resolved_master_sku: 'SKU-001',
      status: 'resolved',
    })

    expect(calls.some((c) => c.pathname === '/rest/v1/tiktok_tokens' && c.method === 'PATCH')).toBe(true)
  })

  it('marks an order unmapped when its SKU has no mapping', async () => {
    const { fetchImpl, calls } = makeFetch([{ id: '2002', create_time: 1, line_items: [{ seller_sku: 'NO-MAPPING' }] }])

    await syncTiktokOrders(
      env,
      { brandId: 'brand-1', shopId: 'shop-1', accessToken: 'act_x', appKey: 'ak', appSecret: 'as' },
      fetchImpl,
    )

    const orderUpsert = calls.find((c) => c.pathname === '/rest/v1/platform_orders')
    expect(orderUpsert?.body).toMatchObject({ resolved_master_sku: null, status: 'unmapped' })
  })

  it('marks an order unmapped when it has no line items at all', async () => {
    const { fetchImpl, calls } = makeFetch([{ id: '3003', create_time: 1, line_items: [] }])

    await syncTiktokOrders(
      env,
      { brandId: 'brand-1', shopId: 'shop-1', accessToken: 'act_x', appKey: 'ak', appSecret: 'as' },
      fetchImpl,
    )

    const orderUpsert = calls.find((c) => c.pathname === '/rest/v1/platform_orders')
    expect(orderUpsert?.body).toMatchObject({ resolved_master_sku: null, status: 'unmapped' })
  })

  it('returns zero synced when TikTok has no orders', async () => {
    const { fetchImpl } = makeFetch([])
    const result = await syncTiktokOrders(
      env,
      { brandId: 'brand-1', shopId: 'shop-1', accessToken: 'act_x', appKey: 'ak', appSecret: 'as' },
      fetchImpl,
    )
    expect(result).toEqual({ syncedCount: 0 })
  })
})

describe('syncAllTiktokBrands', () => {
  const appParams = { appKey: 'ak', appSecret: 'as' }

  it('syncs every connected brand and tallies successes', async () => {
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
      if (url.pathname === '/rest/v1/tiktok_tokens' && (init?.method ?? 'GET') === 'GET') {
        return Response.json([
          { id: 't1', brand_id: 'brand-1', shop_id: 'shop-1', access_token: 'act_1', refresh_token: 'rft_1', access_token_expires_at: '2026-01-01T00:00:00Z', last_synced_at: null },
          { id: 't2', brand_id: 'brand-2', shop_id: 'shop-2', access_token: 'act_2', refresh_token: 'rft_2', access_token_expires_at: '2026-01-01T00:00:00Z', last_synced_at: null },
        ])
      }
      if (url.hostname === 'open-api.tiktokglobalshop.com') {
        return Response.json({ code: 0, message: 'success', data: { orders: [] } })
      }
      return Response.json({})
    }) as typeof fetch

    const result = await syncAllTiktokBrands(env, appParams, fetchImpl)
    expect(result).toEqual({ successCount: 2, failureCount: 0, errors: [] })
  })

  it("isolates one brand's failure so the rest still sync", async () => {
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
      if (url.pathname === '/rest/v1/tiktok_tokens' && (init?.method ?? 'GET') === 'GET') {
        return Response.json([
          { id: 't1', brand_id: 'broken-brand', shop_id: 'shop-broken', access_token: 'act_bad', refresh_token: 'rft_bad', access_token_expires_at: '2026-01-01T00:00:00Z', last_synced_at: null },
          { id: 't2', brand_id: 'brand-2', shop_id: 'shop-2', access_token: 'act_2', refresh_token: 'rft_2', access_token_expires_at: '2026-01-01T00:00:00Z', last_synced_at: null },
        ])
      }
      if (url.hostname === 'open-api.tiktokglobalshop.com') {
        if (url.searchParams.get('shop_id') === 'shop-broken') {
          return Response.json({ code: 10003, message: 'invalid shop_id' })
        }
        return Response.json({ code: 0, message: 'success', data: { orders: [] } })
      }
      return Response.json({})
    }) as typeof fetch

    const result = await syncAllTiktokBrands(env, appParams, fetchImpl)
    expect(result.successCount).toBe(1)
    expect(result.failureCount).toBe(1)
    expect(result.errors[0]).toContain('broken-brand')
  })

  it('returns zero counts when no brand is connected', async () => {
    const fetchImpl = (async () => Response.json([])) as typeof fetch
    const result = await syncAllTiktokBrands(env, appParams, fetchImpl)
    expect(result).toEqual({ successCount: 0, failureCount: 0, errors: [] })
  })
})

describe('ingestTiktokWebhookOrder', () => {
  it('resolves and upserts a single webhook-delivered order', async () => {
    const { fetchImpl, calls } = makeFetch([])

    await ingestTiktokWebhookOrder(
      env,
      { brandId: 'brand-1', order: { id: '4004', create_time: 1, line_items: [{ seller_sku: 'KNOWN-SKU' }] } },
      fetchImpl,
    )

    const orderUpsert = calls.find((c) => c.pathname === '/rest/v1/platform_orders')
    expect(orderUpsert?.body).toMatchObject({ platform_order_id: '4004', status: 'resolved' })
  })
})
