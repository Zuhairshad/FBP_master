import { describe, expect, it } from 'vitest'
import { handleConnect, handleStatus, handleSync } from './handlers'
import type { WalmartWorkerEnv } from './env'

const env: WalmartWorkerEnv = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
}

/** Routes a fake fetch across Supabase Auth/REST and Walmart's token/orders
 * hosts. Each test supplies just the response shapes its scenario needs via
 * `overrides` keyed by pathname — same shape as
 * worker/src/amazon/handlers.test.ts's makeFetch. */
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
    const res = await handleStatus(new Request('https://worker.example.com/walmart/status'), env)
    expect(res.status).toBe(401)
  })

  it('returns connected: false when the brand has no stored token', async () => {
    const fetchImpl = makeFetch({
      '/auth/v1/user': () => Response.json({ id: 'brand-1' }),
      '/rest/v1/walmart_tokens': () => new Response('', { status: 200, headers: { 'content-length': '0' } }),
    })
    const res = await handleStatus(authedRequest('https://worker.example.com/walmart/status'), env, fetchImpl)
    expect(await res.json()).toEqual({ connected: false })
  })

  it('returns last-synced time, never the client secret', async () => {
    const fetchImpl = makeFetch({
      '/auth/v1/user': () => Response.json({ id: 'brand-1' }),
      '/rest/v1/walmart_tokens': () =>
        Response.json({
          id: 't1',
          brand_id: 'brand-1',
          client_id: 'client-id',
          client_secret: 'super-secret',
          access_token: 'wm-secret-access',
          access_token_expires_at: '2026-01-01T00:15:00Z',
          last_synced_at: '2026-01-01T00:00:00Z',
        }),
    })
    const res = await handleStatus(authedRequest('https://worker.example.com/walmart/status'), env, fetchImpl)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toEqual({ connected: true, lastSyncedAt: '2026-01-01T00:00:00Z' })
    expect(JSON.stringify(body)).not.toContain('super-secret')
    expect(JSON.stringify(body)).not.toContain('wm-secret-access')
  })
})

describe('handleConnect', () => {
  it('rejects a request with no bearer token', async () => {
    const res = await handleConnect(new Request('https://worker.example.com/walmart/connect', { method: 'POST' }), env)
    expect(res.status).toBe(401)
  })

  it('rejects a body missing clientId or clientSecret', async () => {
    const fetchImpl = makeFetch({ '/auth/v1/user': () => Response.json({ id: 'brand-1' }) })
    const res = await handleConnect(
      authedRequest('https://worker.example.com/walmart/connect', {
        method: 'POST',
        body: JSON.stringify({ clientId: 'x' }),
      }),
      env,
      fetchImpl,
    )
    expect(res.status).toBe(400)
  })

  it('stores the client_id/client_secret for a valid brand', async () => {
    const calls: string[] = []
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
      calls.push(url.pathname)
      if (url.pathname === '/auth/v1/user') return Response.json({ id: 'brand-1' })
      return Response.json({})
    }) as typeof fetch

    const res = await handleConnect(
      authedRequest('https://worker.example.com/walmart/connect', {
        method: 'POST',
        body: JSON.stringify({ clientId: 'client-id', clientSecret: 'client-secret' }),
      }),
      env,
      fetchImpl,
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ connected: true })
    expect(calls).toContain('/rest/v1/walmart_tokens')
  })
})

describe('handleSync', () => {
  it('rejects a request with no bearer token', async () => {
    const res = await handleSync(new Request('https://worker.example.com/walmart/sync', { method: 'POST' }), env)
    expect(res.status).toBe(401)
  })

  it('returns 400 when the brand has no connected Walmart account', async () => {
    const fetchImpl = makeFetch({
      '/auth/v1/user': () => Response.json({ id: 'brand-1' }),
      '/rest/v1/walmart_tokens': () => new Response('', { status: 200, headers: { 'content-length': '0' } }),
    })
    const res = await handleSync(authedRequest('https://worker.example.com/walmart/sync', { method: 'POST' }), env, fetchImpl)
    expect(res.status).toBe(400)
  })

  it('syncs orders for a connected brand, minting the access token first', async () => {
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
      if (url.pathname === '/auth/v1/user') return Response.json({ id: 'brand-1' })
      if (url.hostname === 'marketplace.walmartapis.com' && url.pathname === '/v3/token') {
        return Response.json({ access_token: 'wm-new', token_type: 'Bearer', expires_in: 900 })
      }
      if (url.pathname === '/v3/orders') {
        return Response.json({ list: { elements: { order: [] } } })
      }
      if (url.pathname === '/rest/v1/walmart_tokens' && init?.method !== 'PATCH') {
        return Response.json({
          id: 't1',
          brand_id: 'brand-1',
          client_id: 'client-id',
          client_secret: 'client-secret',
          access_token: null,
          access_token_expires_at: null,
          last_synced_at: null,
        })
      }
      return Response.json({})
    }) as typeof fetch

    const res = await handleSync(authedRequest('https://worker.example.com/walmart/sync', { method: 'POST' }), env, fetchImpl)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ syncedCount: 0 })
  })
})
