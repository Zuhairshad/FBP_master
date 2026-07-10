import { describe, expect, it } from 'vitest'
import { fetchOrders, mintAccessToken } from './client'

describe('mintAccessToken', () => {
  it('posts the client_credentials grant with Basic auth and returns an access token', async () => {
    const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://marketplace.walmartapis.com/v3/token')
      const headers = init?.headers as Record<string, string>
      expect(headers.authorization).toBe(`Basic ${btoa('client-id:client-secret')}`)
      expect(headers['wm_svc.name']).toBe('Walmart Marketplace')
      expect(headers['wm_qos.correlation_id']).toBeTruthy()
      const body = new URLSearchParams(init?.body as string)
      expect(body.get('grant_type')).toBe('client_credentials')
      return Response.json({ access_token: 'wm-access-token', token_type: 'Bearer', expires_in: 900 })
    }) as typeof fetch

    const result = await mintAccessToken({ clientId: 'client-id', clientSecret: 'client-secret' }, fakeFetch)

    expect(result.accessToken).toBe('wm-access-token')
    expect(new Date(result.accessTokenExpiresAt).getTime()).toBeGreaterThan(Date.now())
  })

  it('throws when Walmart responds with a non-2xx status', async () => {
    const fakeFetch = (async () => new Response('invalid_client', { status: 401 })) as typeof fetch

    await expect(
      mintAccessToken({ clientId: 'bad-id', clientSecret: 'bad-secret' }, fakeFetch),
    ).rejects.toThrow(/Walmart token mint failed: 401/)
  })
})

describe('fetchOrders', () => {
  it('sends the access token header and returns the orders array', async () => {
    const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
      const parsed = new URL(String(url))
      expect(parsed.pathname).toBe('/v3/orders')
      const headers = init?.headers as Record<string, string>
      expect(headers['wm_sec.access_token']).toBe('wm-access-token')
      return Response.json({
        list: {
          elements: {
            order: [
              {
                purchaseOrderId: '1234567890123',
                orderLines: { orderLine: [{ item: { sku: 'SKU-A', productName: 'Widget' } }] },
              },
            ],
          },
        },
      })
    }) as typeof fetch

    const orders = await fetchOrders({ accessToken: 'wm-access-token' }, fakeFetch)
    expect(orders).toHaveLength(1)
    expect(orders[0].purchaseOrderId).toBe('1234567890123')
  })

  it('includes createdStartDate when provided', async () => {
    const fakeFetch = (async (url: string | URL) => {
      const parsed = new URL(String(url))
      expect(parsed.searchParams.get('createdStartDate')).toBe('2026-01-01T00:00:00.000Z')
      return Response.json({ list: { elements: { order: [] } } })
    }) as typeof fetch

    await fetchOrders({ accessToken: 'act', createdStartDate: '2026-01-01T00:00:00.000Z' }, fakeFetch)
  })

  it('returns an empty array when the response has no orders', async () => {
    const fakeFetch = (async () => Response.json({ list: {} })) as typeof fetch
    expect(await fetchOrders({ accessToken: 'act' }, fakeFetch)).toEqual([])
  })

  it('throws on a non-2xx status', async () => {
    const fakeFetch = (async () => new Response('unauthorized', { status: 401 })) as typeof fetch
    await expect(fetchOrders({ accessToken: 'bad' }, fakeFetch)).rejects.toThrow(/Walmart order fetch failed: 401/)
  })
})
