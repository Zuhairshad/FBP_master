import { describe, expect, it } from 'vitest'
import {
  handleCallback,
  handleDeletionChallenge,
  handleDeletionNotification,
  handleInstall,
  handleStatus,
  handleSync,
} from './handlers'
import type { EbayWorkerEnv } from './env'
import { signInstallState } from '../shared/oauthState'

const env: EbayWorkerEnv = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  EBAY_CLIENT_ID: 'client-id',
  EBAY_CLIENT_SECRET: 'client-secret',
  EBAY_RU_NAME: 'seller-account-RuName-1234',
  APP_URL: 'http://localhost:5173',
  WORKER_URL: 'https://worker.example.com',
  EBAY_VERIFICATION_TOKEN: 'verification-token',
}

/** Routes a fake fetch across Supabase Auth/REST and eBay's identity/
 * fulfillment hosts. Each test supplies just the response shapes its
 * scenario needs via `overrides` keyed by pathname — same shape as
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
    const res = await handleStatus(new Request('https://worker.example.com/ebay/status'), env)
    expect(res.status).toBe(401)
  })

  it('returns connected: false when the brand has no stored token', async () => {
    const fetchImpl = makeFetch({
      '/auth/v1/user': () => Response.json({ id: 'brand-1' }),
      '/rest/v1/ebay_tokens': () => new Response('', { status: 200, headers: { 'content-length': '0' } }),
    })
    const res = await handleStatus(authedRequest('https://worker.example.com/ebay/status'), env, fetchImpl)
    expect(await res.json()).toEqual({ connected: false })
  })

  it('returns last-synced time, never the tokens', async () => {
    const fetchImpl = makeFetch({
      '/auth/v1/user': () => Response.json({ id: 'brand-1' }),
      '/rest/v1/ebay_tokens': () =>
        Response.json({
          id: 't1',
          brand_id: 'brand-1',
          refresh_token: 'v^1.1#secret-refresh',
          refresh_token_expires_at: '2027-01-01T00:00:00Z',
          access_token: 'v^1.1#secret-access',
          access_token_expires_at: '2026-01-01T02:00:00Z',
          last_synced_at: '2026-01-01T00:00:00Z',
        }),
    })
    const res = await handleStatus(authedRequest('https://worker.example.com/ebay/status'), env, fetchImpl)
    const body = (await res.json()) as Record<string, unknown>
    expect(body).toEqual({ connected: true, lastSyncedAt: '2026-01-01T00:00:00Z' })
    expect(JSON.stringify(body)).not.toContain('secret-refresh')
    expect(JSON.stringify(body)).not.toContain('secret-access')
  })
})

describe('handleInstall', () => {
  it('rejects a request with no bearer token', async () => {
    const res = await handleInstall(new Request('https://worker.example.com/ebay/install', { method: 'POST' }), env)
    expect(res.status).toBe(401)
  })

  it('returns an authorize URL with redirect_uri set to the RuName', async () => {
    const fetchImpl = makeFetch({ '/auth/v1/user': () => Response.json({ id: 'brand-1' }) })
    const res = await handleInstall(
      authedRequest('https://worker.example.com/ebay/install', { method: 'POST' }),
      env,
      fetchImpl,
    )
    expect(res.status).toBe(200)
    const { url } = (await res.json()) as { url: string }
    const parsed = new URL(url)
    expect(parsed.hostname).toBe('auth.ebay.com')
    expect(parsed.searchParams.get('redirect_uri')).toBe('seller-account-RuName-1234')
    expect(parsed.searchParams.get('state')).toBeTruthy()
  })
})

describe('handleCallback', () => {
  it('redirects with an error when code or state is missing', async () => {
    const res = await handleCallback(new Request('https://worker.example.com/ebay/callback'), env)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('error=invalid_callback')
  })

  it('redirects with an error when the state signature is invalid', async () => {
    const res = await handleCallback(
      new Request('https://worker.example.com/ebay/callback?code=abc&state=forged'),
      env,
    )
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toContain('error=expired_state')
  })

  it('exchanges the code, stores both tokens, and redirects to the connected app URL', async () => {
    const state = await signInstallState('brand-1', env.EBAY_CLIENT_SECRET)
    const calls: string[] = []
    const fetchImpl = (async (input: string | URL | Request) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
      calls.push(url.pathname)
      if (url.hostname === 'api.ebay.com') {
        return Response.json({
          access_token: 'v^1.1#access',
          expires_in: 7200,
          refresh_token: 'v^1.1#refresh',
          refresh_token_expires_in: 47304000,
          token_type: 'User Access Token',
        })
      }
      return Response.json({})
    }) as typeof fetch

    const res = await handleCallback(
      new Request(`https://worker.example.com/ebay/callback?code=abc&state=${encodeURIComponent(state)}`),
      env,
      fetchImpl,
    )

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('http://localhost:5173/brand/ebay?connected=1')
    expect(calls).toContain('/rest/v1/ebay_tokens')
  })
})

describe('handleSync', () => {
  it('rejects a request with no bearer token', async () => {
    const res = await handleSync(new Request('https://worker.example.com/ebay/sync', { method: 'POST' }), env)
    expect(res.status).toBe(401)
  })

  it('returns 400 when the brand has no connected eBay account', async () => {
    const fetchImpl = makeFetch({
      '/auth/v1/user': () => Response.json({ id: 'brand-1' }),
      '/rest/v1/ebay_tokens': () => new Response('', { status: 200, headers: { 'content-length': '0' } }),
    })
    const res = await handleSync(authedRequest('https://worker.example.com/ebay/sync', { method: 'POST' }), env, fetchImpl)
    expect(res.status).toBe(400)
  })

  it('syncs orders for a connected brand, refreshing the access token first', async () => {
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
      if (url.pathname === '/auth/v1/user') return Response.json({ id: 'brand-1' })
      if (url.hostname === 'api.ebay.com' && url.pathname === '/identity/v1/oauth2/token') {
        return Response.json({ access_token: 'v^1.1#new', expires_in: 7200, token_type: 'User Access Token' })
      }
      if (url.pathname === '/sell/fulfillment/v1/order') {
        return Response.json({ orders: [] })
      }
      if (url.pathname === '/rest/v1/ebay_tokens' && init?.method !== 'PATCH') {
        return Response.json({
          id: 't1',
          brand_id: 'brand-1',
          refresh_token: 'v^1.1#refresh',
          refresh_token_expires_at: '2027-01-01T00:00:00Z',
          access_token: null,
          access_token_expires_at: null,
          last_synced_at: null,
        })
      }
      return Response.json({})
    }) as typeof fetch

    const res = await handleSync(authedRequest('https://worker.example.com/ebay/sync', { method: 'POST' }), env, fetchImpl)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ syncedCount: 0 })
  })
})

describe('handleDeletionChallenge', () => {
  it('returns 400 when challenge_code is missing', async () => {
    const res = await handleDeletionChallenge(
      new Request('https://worker.example.com/webhooks/ebay/account-deletion'),
      env,
    )
    expect(res.status).toBe(400)
  })

  it('returns the SHA-256 challengeResponse hash over challengeCode + verificationToken + endpoint', async () => {
    const res = await handleDeletionChallenge(
      new Request('https://worker.example.com/webhooks/ebay/account-deletion?challenge_code=abc123'),
      env,
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { challengeResponse: string }
    expect(body.challengeResponse).toMatch(/^[0-9a-f]{64}$/)
  })
})

describe('handleDeletionNotification', () => {
  it('acknowledges every notification with 200', async () => {
    const res = await handleDeletionNotification(
      new Request('https://worker.example.com/webhooks/ebay/account-deletion', {
        method: 'POST',
        body: JSON.stringify({ notification: { data: { username: 'seller1' } } }),
      }),
    )
    expect(res.status).toBe(200)
  })
})
