import { describe, expect, it } from 'vitest'
import { fetchOrderItems, fetchOrders, refreshAccessToken } from './client'

describe('refreshAccessToken', () => {
  it('posts the LWA refresh_token grant and returns an access token', async () => {
    const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.amazon.com/auth/o2/token')
      const body = new URLSearchParams(init?.body as string)
      expect(body.get('grant_type')).toBe('refresh_token')
      expect(body.get('refresh_token')).toBe('Atzr|refresh')
      expect(body.get('client_id')).toBe('client-id')
      expect(body.get('client_secret')).toBe('client-secret')
      return new Response(
        JSON.stringify({ access_token: 'Atza|access', token_type: 'bearer', expires_in: 3600 }),
        { status: 200 },
      )
    }) as typeof fetch

    const result = await refreshAccessToken(
      { clientId: 'client-id', clientSecret: 'client-secret', refreshToken: 'Atzr|refresh' },
      fakeFetch,
    )

    expect(result.accessToken).toBe('Atza|access')
    expect(new Date(result.accessTokenExpiresAt).getTime()).toBeGreaterThan(Date.now())
  })

  it('throws when Amazon responds with a non-2xx status', async () => {
    const fakeFetch = (async () => new Response('invalid_grant', { status: 400 })) as typeof fetch

    await expect(
      refreshAccessToken({ clientId: 'x', clientSecret: 'y', refreshToken: 'bad-token' }, fakeFetch),
    ).rejects.toThrow(/Amazon LWA token refresh failed: 400/)
  })
})

describe('fetchOrders', () => {
  it('sends the access token header and MarketplaceIds, returns the orders array', async () => {
    const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
      const parsed = new URL(String(url))
      expect(parsed.pathname).toBe('/orders/v0/orders')
      expect(parsed.searchParams.get('MarketplaceIds')).toBe('ATVPDKIKX0DER')
      const headers = init?.headers as Record<string, string> | undefined
      expect(headers?.['x-amz-access-token']).toBe('Atza|access')
      return Response.json({
        payload: { Orders: [{ AmazonOrderId: '111-1111111-1111111', PurchaseDate: '2026-01-01T00:00:00Z', OrderStatus: 'Unshipped' }] },
      })
    }) as typeof fetch

    const orders = await fetchOrders({ accessToken: 'Atza|access', marketplaceId: 'ATVPDKIKX0DER' }, fakeFetch)
    expect(orders).toHaveLength(1)
    expect(orders[0].AmazonOrderId).toBe('111-1111111-1111111')
  })

  it('includes CreatedAfter when provided, defaults otherwise', async () => {
    const fakeFetch = (async (url: string | URL) => {
      const parsed = new URL(String(url))
      expect(parsed.searchParams.get('CreatedAfter')).toBe('2026-01-01T00:00:00Z')
      return Response.json({ payload: { Orders: [] } })
    }) as typeof fetch

    await fetchOrders(
      { accessToken: 'act', marketplaceId: 'ATVPDKIKX0DER', createdAfter: '2026-01-01T00:00:00Z' },
      fakeFetch,
    )
  })

  it('throws on a non-2xx status', async () => {
    const fakeFetch = (async () => new Response('unauthorized', { status: 403 })) as typeof fetch

    await expect(fetchOrders({ accessToken: 'bad', marketplaceId: 'x' }, fakeFetch)).rejects.toThrow(
      /Amazon order fetch failed: 403/,
    )
  })
})

describe('fetchOrderItems', () => {
  it('fetches items for the given order id', async () => {
    const fakeFetch = (async (url: string | URL) => {
      const parsed = new URL(String(url))
      expect(parsed.pathname).toBe('/orders/v0/orders/111-1111111-1111111/orderItems')
      return Response.json({ payload: { OrderItems: [{ OrderItemId: 'i1', SellerSKU: 'SKU-A', ASIN: 'B000000000' }] } })
    }) as typeof fetch

    const items = await fetchOrderItems({ accessToken: 'act', amazonOrderId: '111-1111111-1111111' }, fakeFetch)
    expect(items).toEqual([{ OrderItemId: 'i1', SellerSKU: 'SKU-A', ASIN: 'B000000000' }])
  })

  it('throws on a non-2xx status', async () => {
    const fakeFetch = (async () => new Response('not found', { status: 404 })) as typeof fetch

    await expect(fetchOrderItems({ accessToken: 'act', amazonOrderId: 'bad-id' }, fakeFetch)).rejects.toThrow(
      /Amazon order-items fetch failed: 404/,
    )
  })
})
