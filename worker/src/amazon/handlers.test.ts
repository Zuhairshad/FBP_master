import { describe, expect, it } from 'vitest'
import { handleConnect, handleStatus, handleSync } from './handlers'
import type { AmazonWorkerEnv } from './env'

const env: AmazonWorkerEnv = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  AMAZON_CLIENT_ID: 'client-id',
  AMAZON_CLIENT_SECRET: 'client-secret',
}

/** Routes a fake fetch across Supabase Auth/REST and Amazon's LWA/SP-API
 * hosts. Each test supplies just the response shapes its scenario needs
 * via `overrides` keyed by pathname — same shape as
 * worker/src/tiktok/handlers.test.ts's makeFetch. */
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
    const res = await handleStatus(new Request('https://worker.example.com/amazon/status'), env)
    expect(res.status).toBe(401)
  })

  it('returns connected: false when the brand has no stored token', async () => {
    const fetchImpl = makeFetch({
      '/auth/v1/user': () => Response.json({ id: 'brand-1' }),
      '/rest/v1/amazon_tokens': () => new Response('', { status: 200, headers: { 'content-length': '0' } }),
    })
    const res = await handleStatus(authedRequest('https://worker.example.com/amazon/status'), env, fetchImpl)
    expect(await res.json()).toEqual({ connected: false })
  })

  it('returns the marketplace id and last-synced time, never the tokens', async () => {
    const fetchImpl = makeFetch({
      '/auth/v1/user': () => Response.json({ id: 'brand-1' }),
      '/rest/v1/amazon_tokens': () =>
        Response.json({
          id: 't1',
          brand_id: 'brand-1',
          marketplace_id: 'ATVPDKIKX0DER',
          refresh_token: 'Atzr|secret',
          access_token: 'Atza|secret',
          access_token_expires_at: '2026-01-01T00:00:00Z',
          last_synced_at: '2026-01-01T00:00:00Z',
        }),
    })
    const res = await handleStatus(authedRequest('https://worker.example.com/amazon/status'), env, fetchImpl)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toEqual({ connected: true, marketplaceId: 'ATVPDKIKX0DER', lastSyncedAt: '2026-01-01T00:00:00Z' })
    expect(JSON.stringify(body)).not.toContain('Atzr|secret')
    expect(JSON.stringify(body)).not.toContain('Atza|secret')
  })
})

describe('handleConnect', () => {
  it('rejects a request with no bearer token', async () => {
    const res = await handleConnect(new Request('https://worker.example.com/amazon/connect', { method: 'POST' }), env)
    expect(res.status).toBe(401)
  })

  it('rejects a body missing refreshToken or marketplaceId', async () => {
    const fetchImpl = makeFetch({ '/auth/v1/user': () => Response.json({ id: 'brand-1' }) })
    const res = await handleConnect(
      authedRequest('https://worker.example.com/amazon/connect', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: 'Atzr|x' }),
      }),
      env,
      fetchImpl,
    )
    expect(res.status).toBe(400)
  })

  it('stores the refresh token + marketplace id for a valid brand', async () => {
    const calls: string[] = []
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
      calls.push(url.pathname)
      if (url.pathname === '/auth/v1/user') return Response.json({ id: 'brand-1' })
      return Response.json({})
    }) as typeof fetch

    const res = await handleConnect(
      authedRequest('https://worker.example.com/amazon/connect', {
        method: 'POST',
        body: JSON.stringify({ refreshToken: 'Atzr|x', marketplaceId: 'ATVPDKIKX0DER' }),
      }),
      env,
      fetchImpl,
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ connected: true })
    expect(calls).toContain('/rest/v1/amazon_tokens')
  })
})

describe('handleSync', () => {
  it('rejects a request with no bearer token', async () => {
    const res = await handleSync(new Request('https://worker.example.com/amazon/sync', { method: 'POST' }), env)
    expect(res.status).toBe(401)
  })

  it('returns 400 when the brand has no connected seller account', async () => {
    const fetchImpl = makeFetch({
      '/auth/v1/user': () => Response.json({ id: 'brand-1' }),
      '/rest/v1/amazon_tokens': () => new Response('', { status: 200, headers: { 'content-length': '0' } }),
    })
    const res = await handleSync(authedRequest('https://worker.example.com/amazon/sync', { method: 'POST' }), env, fetchImpl)
    expect(res.status).toBe(400)
  })

  it('syncs orders for a connected brand, refreshing the access token first', async () => {
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
      if (url.pathname === '/auth/v1/user') return Response.json({ id: 'brand-1' })
      if (url.hostname === 'api.amazon.com') {
        return Response.json({ access_token: 'Atza|new', token_type: 'bearer', expires_in: 3600 })
      }
      if (url.hostname === 'sellingpartnerapi-na.amazon.com') {
        return Response.json({ payload: { Orders: [] } })
      }
      if (url.pathname === '/rest/v1/amazon_tokens' && init?.method !== 'PATCH') {
        return Response.json({
          id: 't1',
          brand_id: 'brand-1',
          marketplace_id: 'ATVPDKIKX0DER',
          refresh_token: 'Atzr|x',
          access_token: null,
          access_token_expires_at: null,
          last_synced_at: null,
        })
      }
      return Response.json({})
    }) as typeof fetch

    const res = await handleSync(authedRequest('https://worker.example.com/amazon/sync', { method: 'POST' }), env, fetchImpl)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ syncedCount: 0 })
  })
})
