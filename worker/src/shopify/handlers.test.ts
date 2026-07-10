import { describe, expect, it } from 'vitest'
import { hmacSha256Base64, hmacSha256Hex } from '../shared/hmac'
import { handleCallback, handleInstall, handleOrderWebhook, handleStatus, handleSync } from './handlers'
import { signInstallState } from '../shared/oauthState'
import type { ShopifyWorkerEnv } from './env'

const env: ShopifyWorkerEnv = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  SHOPIFY_CLIENT_ID: 'client-id',
  SHOPIFY_CLIENT_SECRET: 'client-secret',
  SHOPIFY_SCOPES: 'read_orders',
  APP_URL: 'https://app.example.com',
  WORKER_URL: 'https://worker.example.com',
}

/** Routes a fake fetch across Supabase Auth/REST and Shopify's API. Each
 * test supplies just the response shapes its scenario needs via `overrides`
 * keyed by pathname. */
function makeFetch(overrides: Partial<Record<string, (url: URL, init?: RequestInit) => Response>>): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
    const handler = overrides[url.pathname]
    if (handler) {
      return handler(url, init)
    }
    return Response.json({})
  }) as typeof fetch
}

function authedRequest(url: string, init: RequestInit = {}): Request {
  return new Request(url, {
    ...init,
    headers: { ...init.headers, authorization: 'Bearer valid-token' },
  })
}

describe('handleStatus', () => {
  it('rejects a request with no bearer token', async () => {
    const res = await handleStatus(new Request('https://worker.example.com/shopify/status'), env)
    expect(res.status).toBe(401)
  })

  it('returns connected: false when the brand has no stored token', async () => {
    const fetchImpl = makeFetch({
      '/auth/v1/user': () => Response.json({ id: 'brand-1' }),
      '/rest/v1/shopify_tokens': () => new Response('', { status: 200, headers: { 'content-length': '0' } }),
    })
    const res = await handleStatus(authedRequest('https://worker.example.com/shopify/status'), env, fetchImpl)
    expect(await res.json()).toEqual({ connected: false })
  })

  it('returns the shop domain and last-synced time, never the access token', async () => {
    const fetchImpl = makeFetch({
      '/auth/v1/user': () => Response.json({ id: 'brand-1' }),
      '/rest/v1/shopify_tokens': () =>
        Response.json({
          id: 't1',
          brand_id: 'brand-1',
          shop_domain: 'my-store.myshopify.com',
          access_token: 'shpat_secret',
          scope: 'read_orders',
          last_synced_at: '2026-01-01T00:00:00Z',
        }),
    })
    const res = await handleStatus(authedRequest('https://worker.example.com/shopify/status'), env, fetchImpl)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toEqual({
      connected: true,
      shopDomain: 'my-store.myshopify.com',
      lastSyncedAt: '2026-01-01T00:00:00Z',
    })
    expect(JSON.stringify(body)).not.toContain('shpat_secret')
  })
})

describe('handleInstall', () => {
  it('rejects a request with no bearer token', async () => {
    const res = await handleInstall(new Request('https://worker.example.com/shopify/install', { method: 'POST' }), env)
    expect(res.status).toBe(401)
  })

  it('rejects an invalid/expired session token', async () => {
    const fetchImpl = makeFetch({ '/auth/v1/user': () => Response.json({ error: 'bad' }, { status: 401 }) })
    const res = await handleInstall(authedRequest('https://worker.example.com/shopify/install', { method: 'POST' }), env, fetchImpl)
    expect(res.status).toBe(401)
  })

  it('rejects a shop domain that is not a bare *.myshopify.com host', async () => {
    const fetchImpl = makeFetch({ '/auth/v1/user': () => Response.json({ id: 'brand-1' }) })
    const res = await handleInstall(
      authedRequest('https://worker.example.com/shopify/install', {
        method: 'POST',
        body: JSON.stringify({ shop: 'evil.example.com' }),
      }),
      env,
      fetchImpl,
    )
    expect(res.status).toBe(400)
  })

  it('returns a signed-state authorize URL for a valid brand + shop', async () => {
    const fetchImpl = makeFetch({ '/auth/v1/user': () => Response.json({ id: 'brand-1' }) })
    const res = await handleInstall(
      authedRequest('https://worker.example.com/shopify/install', {
        method: 'POST',
        body: JSON.stringify({ shop: 'my-store.myshopify.com' }),
      }),
      env,
      fetchImpl,
    )
    expect(res.status).toBe(200)
    const { url } = (await res.json()) as { url: string }
    const parsed = new URL(url)
    expect(parsed.hostname).toBe('my-store.myshopify.com')
    expect(parsed.searchParams.get('redirect_uri')).toBe('https://worker.example.com/shopify/callback')
    expect(parsed.searchParams.get('state')).toBeTruthy()
  })
})

describe('handleCallback', () => {
  async function signedCallbackParams(brandId: string, extra: Record<string, string> = {}) {
    const state = await signInstallState(brandId, env.SHOPIFY_CLIENT_SECRET)
    const base = { shop: 'my-store.myshopify.com', code: 'auth-code', state, ...extra }
    const pairs = Object.entries(base)
      .map(([k, v]) => `${k}=${v}`)
      .sort()
    const hmac = await hmacSha256Hex(pairs.join('&'), env.SHOPIFY_CLIENT_SECRET)
    return new URLSearchParams({ ...base, hmac })
  }

  it('redirects with an error when required query params are missing', async () => {
    const res = await handleCallback(new Request('https://worker.example.com/shopify/callback?shop=x'), env)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('error=invalid_callback')
  })

  it('redirects with an error when the hmac signature is invalid', async () => {
    const params = new URLSearchParams({ shop: 'my-store.myshopify.com', code: 'x', state: 'y', hmac: 'wrong' })
    const res = await handleCallback(new Request(`https://worker.example.com/shopify/callback?${params}`), env)
    expect(res.headers.get('location')).toContain('error=invalid_signature')
  })

  it('redirects with an error when the state is invalid/expired', async () => {
    const params = await signedCallbackParams('brand-1', { state: 'not-a-real-state' })
    const res = await handleCallback(new Request(`https://worker.example.com/shopify/callback?${params}`), env)
    expect(res.headers.get('location')).toContain('error=expired_state')
  })

  it('exchanges the code, stores the token, and redirects to connected=1 on success', async () => {
    const params = await signedCallbackParams('brand-1')
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
      if (url.pathname === '/admin/oauth/access_token') {
        return Response.json({ access_token: 'shpat_new', scope: 'read_orders' })
      }
      return Response.json({})
    }) as typeof fetch

    const res = await handleCallback(new Request(`https://worker.example.com/shopify/callback?${params}`), env, fetchImpl)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://app.example.com/brand/shopify?connected=1')
  })
})

describe('handleSync', () => {
  it('rejects a request with no bearer token', async () => {
    const res = await handleSync(new Request('https://worker.example.com/shopify/sync', { method: 'POST' }), env)
    expect(res.status).toBe(401)
  })

  it('returns 400 when the brand has no connected store', async () => {
    const fetchImpl = makeFetch({
      '/auth/v1/user': () => Response.json({ id: 'brand-1' }),
      '/rest/v1/shopify_tokens': () => new Response('', { status: 200, headers: { 'content-length': '0' } }),
    })
    const res = await handleSync(authedRequest('https://worker.example.com/shopify/sync', { method: 'POST' }), env, fetchImpl)
    expect(res.status).toBe(400)
  })

  it('syncs orders for a connected brand', async () => {
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
      if (url.pathname === '/auth/v1/user') return Response.json({ id: 'brand-1' })
      if (url.hostname.endsWith('.myshopify.com')) return Response.json({ orders: [] })
      if (url.pathname === '/rest/v1/shopify_tokens') {
        return Response.json({
          id: 't1',
          brand_id: 'brand-1',
          shop_domain: 'my-store.myshopify.com',
          access_token: 'shpat_x',
          scope: 'read_orders',
          last_synced_at: null,
        })
      }
      return Response.json({})
    }) as typeof fetch

    const res = await handleSync(authedRequest('https://worker.example.com/shopify/sync', { method: 'POST' }), env, fetchImpl)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ syncedCount: 0 })
  })
})

describe('handleOrderWebhook', () => {
  const rawBody = JSON.stringify({ id: 5005, name: '#5005', created_at: '2026-01-01T00:00:00Z', line_items: [] })

  it('rejects a request missing the required headers', async () => {
    const res = await handleOrderWebhook(
      new Request('https://worker.example.com/webhooks/shopify/orders', { method: 'POST', body: rawBody }),
      env,
    )
    expect(res.status).toBe(400)
  })

  it('rejects an invalid signature', async () => {
    const res = await handleOrderWebhook(
      new Request('https://worker.example.com/webhooks/shopify/orders', {
        method: 'POST',
        body: rawBody,
        headers: { 'x-shopify-hmac-sha256': 'wrong', 'x-shopify-shop-domain': 'my-store.myshopify.com' },
      }),
      env,
    )
    expect(res.status).toBe(401)
  })

  it('acks with 200 for an unknown shop so Shopify stops retrying', async () => {
    const validHmac = await hmacSha256Base64(rawBody, env.SHOPIFY_CLIENT_SECRET)
    const fetchImpl = makeFetch({
      '/rest/v1/shopify_tokens': () => new Response('', { status: 200, headers: { 'content-length': '0' } }),
    })

    const res = await handleOrderWebhook(
      new Request('https://worker.example.com/webhooks/shopify/orders', {
        method: 'POST',
        body: rawBody,
        headers: { 'x-shopify-hmac-sha256': validHmac, 'x-shopify-shop-domain': 'unknown.myshopify.com' },
      }),
      env,
      fetchImpl,
    )
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('Unknown shop')
  })

  it('ingests the order for a known shop', async () => {
    const validHmac = await hmacSha256Base64(rawBody, env.SHOPIFY_CLIENT_SECRET)
    const calls: string[] = []
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
      calls.push(url.pathname)
      if (url.pathname === '/rest/v1/shopify_tokens' && init?.method !== 'PATCH') {
        return Response.json({
          id: 't1',
          brand_id: 'brand-1',
          shop_domain: 'my-store.myshopify.com',
          access_token: 'shpat_x',
          scope: 'read_orders',
          last_synced_at: null,
        })
      }
      return Response.json({})
    }) as typeof fetch

    const res = await handleOrderWebhook(
      new Request('https://worker.example.com/webhooks/shopify/orders', {
        method: 'POST',
        body: rawBody,
        headers: { 'x-shopify-hmac-sha256': validHmac, 'x-shopify-shop-domain': 'my-store.myshopify.com' },
      }),
      env,
      fetchImpl,
    )
    expect(res.status).toBe(200)
    expect(calls).toContain('/rest/v1/platform_orders')
  })
})
