import { describe, expect, it } from 'vitest'
import { hmacSha256Hex } from '../shared/hmac'
import { handleCallback, handleInstall, handleOrderWebhook, handleStatus, handleSync } from './handlers'
import { signInstallState } from '../shared/oauthState'
import type { TiktokWorkerEnv } from './env'

const env: TiktokWorkerEnv = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  TIKTOK_APP_KEY: 'app-key',
  TIKTOK_APP_SECRET: 'app-secret',
  APP_URL: 'https://app.example.com',
}

/** Routes a fake fetch across Supabase Auth/REST and TikTok's API. Each
 * test supplies just the response shapes its scenario needs via
 * `overrides` keyed by pathname — same shape as
 * worker/src/shopify/handlers.test.ts's makeFetch. */
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
    const res = await handleStatus(new Request('https://worker.example.com/tiktok/status'), env)
    expect(res.status).toBe(401)
  })

  it('returns connected: false when the brand has no stored token', async () => {
    const fetchImpl = makeFetch({
      '/auth/v1/user': () => Response.json({ id: 'brand-1' }),
      '/rest/v1/tiktok_tokens': () => new Response('', { status: 200, headers: { 'content-length': '0' } }),
    })
    const res = await handleStatus(authedRequest('https://worker.example.com/tiktok/status'), env, fetchImpl)
    expect(await res.json()).toEqual({ connected: false })
  })

  it('returns the shop id and last-synced time, never the access token', async () => {
    const fetchImpl = makeFetch({
      '/auth/v1/user': () => Response.json({ id: 'brand-1' }),
      '/rest/v1/tiktok_tokens': () =>
        Response.json({
          id: 't1',
          brand_id: 'brand-1',
          shop_id: 'shop-1',
          access_token: 'act_secret',
          refresh_token: 'rft_secret',
          access_token_expires_at: '2026-01-01T00:00:00Z',
          last_synced_at: '2026-01-01T00:00:00Z',
        }),
    })
    const res = await handleStatus(authedRequest('https://worker.example.com/tiktok/status'), env, fetchImpl)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toEqual({ connected: true, shopId: 'shop-1', lastSyncedAt: '2026-01-01T00:00:00Z' })
    expect(JSON.stringify(body)).not.toContain('act_secret')
    expect(JSON.stringify(body)).not.toContain('rft_secret')
  })
})

describe('handleInstall', () => {
  it('rejects a request with no bearer token', async () => {
    const res = await handleInstall(new Request('https://worker.example.com/tiktok/install', { method: 'POST' }), env)
    expect(res.status).toBe(401)
  })

  it('rejects an invalid/expired session token', async () => {
    const fetchImpl = makeFetch({ '/auth/v1/user': () => Response.json({ error: 'bad' }, { status: 401 }) })
    const res = await handleInstall(
      authedRequest('https://worker.example.com/tiktok/install', { method: 'POST' }),
      env,
      fetchImpl,
    )
    expect(res.status).toBe(401)
  })

  it('returns a signed-state authorize URL for a valid brand', async () => {
    const fetchImpl = makeFetch({ '/auth/v1/user': () => Response.json({ id: 'brand-1' }) })
    const res = await handleInstall(
      authedRequest('https://worker.example.com/tiktok/install', { method: 'POST' }),
      env,
      fetchImpl,
    )
    expect(res.status).toBe(200)
    const { url } = (await res.json()) as { url: string }
    const parsed = new URL(url)
    expect(parsed.hostname).toBe('auth.tiktok-shops.com')
    expect(parsed.searchParams.get('app_key')).toBe('app-key')
    expect(parsed.searchParams.get('state')).toBeTruthy()
  })
})

describe('handleCallback', () => {
  it('redirects with an error when required query params are missing', async () => {
    const res = await handleCallback(new Request('https://worker.example.com/tiktok/callback'), env)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('error=invalid_callback')
  })

  it('redirects with an error when the state is invalid/expired', async () => {
    const params = new URLSearchParams({ code: 'auth-code', state: 'not-a-real-state' })
    const res = await handleCallback(new Request(`https://worker.example.com/tiktok/callback?${params}`), env)
    expect(res.headers.get('location')).toContain('error=expired_state')
  })

  it('redirects with an error when the brand has no authorized shop', async () => {
    const state = await signInstallState('brand-1', env.TIKTOK_APP_SECRET)
    const params = new URLSearchParams({ code: 'auth-code', state })
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
      if (url.pathname === '/api/v2/token/get') {
        return Response.json({ code: 0, message: 'success', data: { access_token: 'act_new', access_token_expire_in: 7200, refresh_token: 'rft_new' } })
      }
      if (url.pathname === '/authorization/202309/shops') {
        return Response.json({ code: 0, message: 'success', data: { shops: [] } })
      }
      return Response.json({})
    }) as typeof fetch

    const res = await handleCallback(new Request(`https://worker.example.com/tiktok/callback?${params}`), env, fetchImpl)
    expect(res.headers.get('location')).toBe('https://app.example.com/brand/tiktok?error=no_shop_authorized')
  })

  it('exchanges the code, resolves the shop, stores the token, and redirects to connected=1 on success', async () => {
    const state = await signInstallState('brand-1', env.TIKTOK_APP_SECRET)
    const params = new URLSearchParams({ code: 'auth-code', state })
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
      if (url.pathname === '/api/v2/token/get') {
        return Response.json({ code: 0, message: 'success', data: { access_token: 'act_new', access_token_expire_in: 7200, refresh_token: 'rft_new' } })
      }
      if (url.pathname === '/authorization/202309/shops') {
        return Response.json({ code: 0, message: 'success', data: { shops: [{ shop_id: 'shop-1' }] } })
      }
      return Response.json({})
    }) as typeof fetch

    const res = await handleCallback(new Request(`https://worker.example.com/tiktok/callback?${params}`), env, fetchImpl)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://app.example.com/brand/tiktok?connected=1')
  })
})

describe('handleSync', () => {
  it('rejects a request with no bearer token', async () => {
    const res = await handleSync(new Request('https://worker.example.com/tiktok/sync', { method: 'POST' }), env)
    expect(res.status).toBe(401)
  })

  it('returns 400 when the brand has no connected shop', async () => {
    const fetchImpl = makeFetch({
      '/auth/v1/user': () => Response.json({ id: 'brand-1' }),
      '/rest/v1/tiktok_tokens': () => new Response('', { status: 200, headers: { 'content-length': '0' } }),
    })
    const res = await handleSync(authedRequest('https://worker.example.com/tiktok/sync', { method: 'POST' }), env, fetchImpl)
    expect(res.status).toBe(400)
  })

  it('syncs orders for a connected brand', async () => {
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
      if (url.pathname === '/auth/v1/user') return Response.json({ id: 'brand-1' })
      if (url.hostname === 'open-api.tiktokglobalshop.com') return Response.json({ code: 0, message: 'success', data: { orders: [] } })
      if (url.pathname === '/rest/v1/tiktok_tokens') {
        return Response.json({
          id: 't1',
          brand_id: 'brand-1',
          shop_id: 'shop-1',
          access_token: 'act_x',
          refresh_token: 'rft_x',
          access_token_expires_at: '2026-01-01T00:00:00Z',
          last_synced_at: null,
        })
      }
      return Response.json({})
    }) as typeof fetch

    const res = await handleSync(authedRequest('https://worker.example.com/tiktok/sync', { method: 'POST' }), env, fetchImpl)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ syncedCount: 0 })
  })
})

describe('handleOrderWebhook', () => {
  const rawBody = JSON.stringify({ id: '5005', create_time: 1, line_items: [] })

  async function signBody(body: string, secret: string): Promise<string> {
    const wrapped = `${secret}${body}${secret}`
    return (await hmacSha256Hex(wrapped, secret)).toUpperCase()
  }

  it('rejects a request missing the required headers', async () => {
    const res = await handleOrderWebhook(
      new Request('https://worker.example.com/webhooks/tiktok/orders', { method: 'POST', body: rawBody }),
      env,
    )
    expect(res.status).toBe(400)
  })

  it('rejects an invalid signature', async () => {
    const res = await handleOrderWebhook(
      new Request('https://worker.example.com/webhooks/tiktok/orders', {
        method: 'POST',
        body: rawBody,
        headers: { 'x-tts-signature': 'wrong', 'x-tts-shop-id': 'shop-1' },
      }),
      env,
    )
    expect(res.status).toBe(401)
  })

  it('acks with 200 for an unknown shop so TikTok stops retrying', async () => {
    const validSignature = await signBody(rawBody, env.TIKTOK_APP_SECRET)
    const fetchImpl = makeFetch({
      '/rest/v1/tiktok_tokens': () => new Response('', { status: 200, headers: { 'content-length': '0' } }),
    })

    const res = await handleOrderWebhook(
      new Request('https://worker.example.com/webhooks/tiktok/orders', {
        method: 'POST',
        body: rawBody,
        headers: { 'x-tts-signature': validSignature, 'x-tts-shop-id': 'unknown-shop' },
      }),
      env,
      fetchImpl,
    )
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('Unknown shop')
  })

  it('ingests the order for a known shop', async () => {
    const validSignature = await signBody(rawBody, env.TIKTOK_APP_SECRET)
    const calls: string[] = []
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
      calls.push(url.pathname)
      if (url.pathname === '/rest/v1/tiktok_tokens' && init?.method !== 'PATCH') {
        return Response.json({
          id: 't1',
          brand_id: 'brand-1',
          shop_id: 'shop-1',
          access_token: 'act_x',
          refresh_token: 'rft_x',
          access_token_expires_at: '2026-01-01T00:00:00Z',
          last_synced_at: null,
        })
      }
      return Response.json({})
    }) as typeof fetch

    const res = await handleOrderWebhook(
      new Request('https://worker.example.com/webhooks/tiktok/orders', {
        method: 'POST',
        body: rawBody,
        headers: { 'x-tts-signature': validSignature, 'x-tts-shop-id': 'shop-1' },
      }),
      env,
      fetchImpl,
    )
    expect(res.status).toBe(200)
    expect(calls).toContain('/rest/v1/platform_orders')
  })
})
