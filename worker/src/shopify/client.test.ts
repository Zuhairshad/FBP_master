import { describe, expect, it } from 'vitest'
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchOrders,
  isValidShopDomain,
  verifyOAuthCallbackHmac,
  verifyWebhookHmac,
} from './client'
import { hmacSha256Hex } from './hmac'

describe('isValidShopDomain', () => {
  it('accepts a bare *.myshopify.com domain', () => {
    expect(isValidShopDomain('my-store-123.myshopify.com')).toBe(true)
  })

  it('rejects a non-myshopify.com host (SSRF guard)', () => {
    expect(isValidShopDomain('evil.example.com')).toBe(false)
  })

  it('rejects an embedded-host trick like myshopify.com.evil.example.com', () => {
    expect(isValidShopDomain('myshopify.com.evil.example.com')).toBe(false)
  })

  it('rejects a domain with a scheme or path', () => {
    expect(isValidShopDomain('https://my-store.myshopify.com/admin')).toBe(false)
  })
})

describe('buildAuthorizeUrl', () => {
  it('builds the Shopify OAuth authorize URL with all required params', () => {
    const url = buildAuthorizeUrl({
      shop: 'my-store.myshopify.com',
      clientId: 'client-id',
      redirectUri: 'https://worker.example.com/shopify/callback',
      scopes: 'read_orders',
      state: 'signed-state',
    })

    const parsed = new URL(url)
    expect(parsed.origin + parsed.pathname).toBe('https://my-store.myshopify.com/admin/oauth/authorize')
    expect(parsed.searchParams.get('client_id')).toBe('client-id')
    expect(parsed.searchParams.get('scope')).toBe('read_orders')
    expect(parsed.searchParams.get('redirect_uri')).toBe('https://worker.example.com/shopify/callback')
    expect(parsed.searchParams.get('state')).toBe('signed-state')
  })
})

describe('exchangeCodeForToken', () => {
  it('posts the code and returns the access token + scope', async () => {
    const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://my-store.myshopify.com/admin/oauth/access_token')
      const body = JSON.parse(init?.body as string)
      expect(body).toEqual({ client_id: 'client-id', client_secret: 'client-secret', code: 'auth-code' })
      return new Response(JSON.stringify({ access_token: 'shpat_abc', scope: 'read_orders' }), { status: 200 })
    }) as typeof fetch

    const result = await exchangeCodeForToken(
      { shop: 'my-store.myshopify.com', clientId: 'client-id', clientSecret: 'client-secret', code: 'auth-code' },
      fakeFetch,
    )

    expect(result).toEqual({ accessToken: 'shpat_abc', scope: 'read_orders' })
  })

  it('throws when Shopify responds with a non-2xx status', async () => {
    const fakeFetch = (async () => new Response('invalid_grant', { status: 400 })) as typeof fetch

    await expect(
      exchangeCodeForToken(
        { shop: 'my-store.myshopify.com', clientId: 'x', clientSecret: 'y', code: 'bad-code' },
        fakeFetch,
      ),
    ).rejects.toThrow(/Shopify token exchange failed: 400/)
  })
})

describe('fetchOrders', () => {
  it('sends the access token header and returns the orders array', async () => {
    const fakeFetch = (async (url: string | URL) => {
      const parsed = new URL(String(url))
      expect(parsed.searchParams.get('status')).toBe('any')
      return new Response(JSON.stringify({ orders: [{ id: 1, name: '#1001', line_items: [], created_at: 'x' }] }), {
        status: 200,
      })
    }) as typeof fetch

    const orders = await fetchOrders({ shop: 'my-store.myshopify.com', accessToken: 'shpat_abc' }, fakeFetch)
    expect(orders).toHaveLength(1)
    expect(orders[0].id).toBe(1)
  })

  it('includes updated_at_min when provided', async () => {
    const fakeFetch = (async (url: string | URL) => {
      const parsed = new URL(String(url))
      expect(parsed.searchParams.get('updated_at_min')).toBe('2026-01-01T00:00:00Z')
      return new Response(JSON.stringify({ orders: [] }), { status: 200 })
    }) as typeof fetch

    await fetchOrders(
      { shop: 'my-store.myshopify.com', accessToken: 'shpat_abc', updatedAtMin: '2026-01-01T00:00:00Z' },
      fakeFetch,
    )
  })
})

describe('verifyWebhookHmac', () => {
  it('accepts a correctly computed signature', async () => {
    const rawBody = '{"id":1}'
    const secret = 'webhook-secret'
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
    const hmacHeader = btoa(String.fromCharCode(...new Uint8Array(signature)))

    expect(await verifyWebhookHmac({ rawBody, hmacHeader, clientSecret: secret })).toBe(true)
  })

  it('rejects a tampered body', async () => {
    const secret = 'webhook-secret'
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('{"id":1}'))
    const hmacHeader = btoa(String.fromCharCode(...new Uint8Array(signature)))

    expect(await verifyWebhookHmac({ rawBody: '{"id":2}', hmacHeader, clientSecret: secret })).toBe(false)
  })

  it('rejects the correct signature computed with the wrong secret', async () => {
    const rawBody = '{"id":1}'
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('wrong-secret'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
    const hmacHeader = btoa(String.fromCharCode(...new Uint8Array(signature)))

    expect(await verifyWebhookHmac({ rawBody, hmacHeader, clientSecret: 'webhook-secret' })).toBe(false)
  })
})

describe('verifyOAuthCallbackHmac', () => {
  it('accepts a signature computed over the sorted, hmac-excluded query string', async () => {
    const secret = 'app-secret'
    const message = 'code=abc&shop=my-store.myshopify.com&state=xyz'
    const hmac = await hmacSha256Hex(message, secret)

    const searchParams = new URLSearchParams({ shop: 'my-store.myshopify.com', code: 'abc', state: 'xyz', hmac })

    expect(await verifyOAuthCallbackHmac({ searchParams, clientSecret: secret })).toBe(true)
  })

  it('rejects when a query param is tampered with after signing', async () => {
    const secret = 'app-secret'
    const message = 'code=abc&shop=my-store.myshopify.com&state=xyz'
    const hmac = await hmacSha256Hex(message, secret)

    const searchParams = new URLSearchParams({
      shop: 'my-store.myshopify.com',
      code: 'tampered-code',
      state: 'xyz',
      hmac,
    })

    expect(await verifyOAuthCallbackHmac({ searchParams, clientSecret: secret })).toBe(false)
  })

  it('rejects when the hmac param is missing entirely', async () => {
    const searchParams = new URLSearchParams({ shop: 'my-store.myshopify.com', code: 'abc' })
    expect(await verifyOAuthCallbackHmac({ searchParams, clientSecret: 'app-secret' })).toBe(false)
  })
})
