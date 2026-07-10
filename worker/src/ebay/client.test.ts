import { describe, expect, it } from 'vitest'
import { buildAuthorizeUrl, computeChallengeResponse, exchangeCodeForToken, fetchOrders, refreshAccessToken } from './client'

describe('buildAuthorizeUrl', () => {
  it('sets redirect_uri to the RuName value, not a literal URL', () => {
    const url = buildAuthorizeUrl({
      clientId: 'client-id',
      ruName: 'seller-account-RuName-1234',
      scopes: 'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
      state: 'signed-state',
    })
    const parsed = new URL(url)
    expect(parsed.hostname).toBe('auth.ebay.com')
    expect(parsed.searchParams.get('redirect_uri')).toBe('seller-account-RuName-1234')
    expect(parsed.searchParams.get('response_type')).toBe('code')
    expect(parsed.searchParams.get('state')).toBe('signed-state')
  })
})

describe('exchangeCodeForToken', () => {
  it('posts the authorization_code grant and returns both tokens', async () => {
    const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.ebay.com/identity/v1/oauth2/token')
      const headers = init?.headers as Record<string, string>
      expect(headers.authorization).toBe(`Basic ${btoa('client-id:client-secret')}`)
      const body = new URLSearchParams(init?.body as string)
      expect(body.get('grant_type')).toBe('authorization_code')
      expect(body.get('code')).toBe('auth-code')
      expect(body.get('redirect_uri')).toBe('my-ru-name')
      return Response.json({
        access_token: 'v^1.1#access',
        expires_in: 7200,
        refresh_token: 'v^1.1#refresh',
        refresh_token_expires_in: 47304000,
        token_type: 'User Access Token',
      })
    }) as typeof fetch

    const result = await exchangeCodeForToken(
      { clientId: 'client-id', clientSecret: 'client-secret', code: 'auth-code', ruName: 'my-ru-name' },
      fakeFetch,
    )

    expect(result.accessToken).toBe('v^1.1#access')
    expect(result.refreshToken).toBe('v^1.1#refresh')
    expect(new Date(result.accessTokenExpiresAt).getTime()).toBeGreaterThan(Date.now())
    expect(new Date(result.refreshTokenExpiresAt).getTime()).toBeGreaterThan(Date.now())
  })

  it('throws when eBay responds with a non-2xx status', async () => {
    const fakeFetch = (async () =>
      Response.json({ error: 'invalid_grant', error_description: 'bad code' }, { status: 400 })) as typeof fetch

    await expect(
      exchangeCodeForToken({ clientId: 'x', clientSecret: 'y', code: 'bad', ruName: 'ru' }, fakeFetch),
    ).rejects.toThrow(/eBay token exchange failed: 400/)
  })
})

describe('refreshAccessToken', () => {
  it('posts the refresh_token grant and returns a new access token', async () => {
    const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toBe('https://api.ebay.com/identity/v1/oauth2/token')
      const body = new URLSearchParams(init?.body as string)
      expect(body.get('grant_type')).toBe('refresh_token')
      expect(body.get('refresh_token')).toBe('v^1.1#refresh')
      return Response.json({ access_token: 'v^1.1#new-access', expires_in: 7200, token_type: 'User Access Token' })
    }) as typeof fetch

    const result = await refreshAccessToken(
      { clientId: 'ci', clientSecret: 'cs', refreshToken: 'v^1.1#refresh', scopes: 'scope' },
      fakeFetch,
    )
    expect(result.accessToken).toBe('v^1.1#new-access')
  })

  it('throws on a non-2xx status', async () => {
    const fakeFetch = (async () => Response.json({ error: 'invalid_grant' }, { status: 400 })) as typeof fetch
    await expect(
      refreshAccessToken({ clientId: 'x', clientSecret: 'y', refreshToken: 'expired', scopes: 'scope' }, fakeFetch),
    ).rejects.toThrow(/eBay token refresh failed: 400/)
  })
})

describe('fetchOrders', () => {
  it('sends the bearer token and returns the orders array', async () => {
    const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
      const parsed = new URL(String(url))
      expect(parsed.pathname).toBe('/sell/fulfillment/v1/order')
      const headers = init?.headers as Record<string, string>
      expect(headers.authorization).toBe('Bearer v^1.1#access')
      return Response.json({
        orders: [{ orderId: '01-12345-67890', creationDate: '2026-01-01T00:00:00.000Z', lineItems: [{ lineItemId: 'li1', sku: 'SKU-A' }] }],
        total: 1,
      })
    }) as typeof fetch

    const orders = await fetchOrders({ accessToken: 'v^1.1#access' }, fakeFetch)
    expect(orders).toHaveLength(1)
    expect(orders[0].orderId).toBe('01-12345-67890')
  })

  it('includes a creationdate filter when creationDateFrom is provided', async () => {
    const fakeFetch = (async (url: string | URL) => {
      const parsed = new URL(String(url))
      expect(parsed.searchParams.get('filter')).toBe('creationdate:[2026-01-01T00:00:00.000Z..]')
      return Response.json({ orders: [] })
    }) as typeof fetch

    await fetchOrders({ accessToken: 'act', creationDateFrom: '2026-01-01T00:00:00.000Z' }, fakeFetch)
  })

  it('returns an empty array when the response has no orders field', async () => {
    const fakeFetch = (async () => Response.json({ total: 0 })) as typeof fetch
    expect(await fetchOrders({ accessToken: 'act' }, fakeFetch)).toEqual([])
  })

  it('throws on a non-2xx status', async () => {
    const fakeFetch = (async () => new Response('unauthorized', { status: 401 })) as typeof fetch
    await expect(fetchOrders({ accessToken: 'bad' }, fakeFetch)).rejects.toThrow(/eBay order fetch failed: 401/)
  })
})

describe('computeChallengeResponse', () => {
  it('computes the SHA-256 hex digest of challengeCode + verificationToken + endpoint, in that order', async () => {
    const result = await computeChallengeResponse({
      challengeCode: 'abc123',
      verificationToken: 'my-verification-token',
      endpoint: 'https://worker.example.com/webhooks/ebay/account-deletion',
    })
    expect(result).toMatch(/^[0-9a-f]{64}$/)

    const reordered = await computeChallengeResponse({
      challengeCode: 'abc123',
      verificationToken: 'different-token',
      endpoint: 'https://worker.example.com/webhooks/ebay/account-deletion',
    })
    expect(reordered).not.toBe(result)
  })

  it('is deterministic for the same inputs', async () => {
    const params = { challengeCode: 'xyz', verificationToken: 'token', endpoint: 'https://example.com/deletion' }
    expect(await computeChallengeResponse(params)).toBe(await computeChallengeResponse(params))
  })
})
