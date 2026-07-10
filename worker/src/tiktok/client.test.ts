import { describe, expect, it } from 'vitest'
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchOrders,
  getAuthorizedShops,
  signRequest,
  verifyWebhookSignature,
} from './client'
import { hmacSha256Hex } from '../shared/hmac'

describe('signRequest', () => {
  it('produces the documented secret-wrapped, sorted-params HMAC (uppercase hex)', async () => {
    const params = { path: '/order/202309/orders/search', queryParams: { app_key: 'ak', timestamp: '100' }, appSecret: 'secret' }
    const expectedString = `secret${params.path}app_keyaktimestamp100secret`
    const expectedHex = (await hmacSha256Hex(expectedString, 'secret')).toUpperCase()

    expect(await signRequest(params)).toBe(expectedHex)
  })

  it('excludes "sign" and "access_token" from the sorted param string', async () => {
    const withExtras = await signRequest({
      path: '/p',
      queryParams: { app_key: 'ak', sign: 'ignored', access_token: 'ignored-too' },
      appSecret: 'secret',
    })
    const withoutExtras = await signRequest({ path: '/p', queryParams: { app_key: 'ak' }, appSecret: 'secret' })

    expect(withExtras).toBe(withoutExtras)
  })

  it('includes the body in the signed string when present', async () => {
    const withBody = await signRequest({ path: '/p', queryParams: { app_key: 'ak' }, body: '{"a":1}', appSecret: 'secret' })
    const withoutBody = await signRequest({ path: '/p', queryParams: { app_key: 'ak' }, appSecret: 'secret' })

    expect(withBody).not.toBe(withoutBody)
  })
})

describe('buildAuthorizeUrl', () => {
  it('builds the TikTok Shop OAuth authorize URL with app_key + state, no redirect_uri', () => {
    const url = buildAuthorizeUrl({ appKey: 'app-key', state: 'signed-state' })
    const parsed = new URL(url)

    expect(parsed.origin + parsed.pathname).toBe('https://auth.tiktok-shops.com/oauth/authorize')
    expect(parsed.searchParams.get('app_key')).toBe('app-key')
    expect(parsed.searchParams.get('state')).toBe('signed-state')
    expect(parsed.searchParams.has('redirect_uri')).toBe(false)
  })
})

describe('exchangeCodeForToken', () => {
  it('gets the auth code and returns access/refresh tokens', async () => {
    const fakeFetch = (async (url: string | URL) => {
      const parsed = new URL(String(url))
      expect(parsed.origin + parsed.pathname).toBe('https://auth.tiktok-shops.com/api/v2/token/get')
      expect(parsed.searchParams.get('app_key')).toBe('app-key')
      expect(parsed.searchParams.get('app_secret')).toBe('app-secret')
      expect(parsed.searchParams.get('auth_code')).toBe('auth-code')
      expect(parsed.searchParams.get('grant_type')).toBe('authorized_code')
      return new Response(
        JSON.stringify({ code: 0, message: 'success', data: { access_token: 'act_abc', access_token_expire_in: 7200, refresh_token: 'rft_abc' } }),
        { status: 200 },
      )
    }) as typeof fetch

    const result = await exchangeCodeForToken({ appKey: 'app-key', appSecret: 'app-secret', authCode: 'auth-code' }, fakeFetch)

    expect(result.accessToken).toBe('act_abc')
    expect(result.refreshToken).toBe('rft_abc')
    expect(new Date(result.accessTokenExpiresAt).getTime()).toBeGreaterThan(Date.now())
  })

  it('throws when TikTok responds with a non-2xx status', async () => {
    const fakeFetch = (async () => new Response('server error', { status: 500 })) as typeof fetch

    await expect(
      exchangeCodeForToken({ appKey: 'x', appSecret: 'y', authCode: 'bad-code' }, fakeFetch),
    ).rejects.toThrow(/TikTok token exchange failed: 500/)
  })

  it('throws when TikTok responds 200 with a non-zero error code', async () => {
    const fakeFetch = (async () => Response.json({ code: 10001, message: 'invalid auth_code' })) as typeof fetch

    await expect(
      exchangeCodeForToken({ appKey: 'x', appSecret: 'y', authCode: 'bad-code' }, fakeFetch),
    ).rejects.toThrow(/TikTok token exchange returned an error: 10001/)
  })
})

describe('getAuthorizedShops', () => {
  it('returns the shops list on success', async () => {
    const fakeFetch = (async () =>
      Response.json({ code: 0, message: 'success', data: { shops: [{ shop_id: 'shop-1', shop_name: 'My Shop' }] } })) as typeof fetch

    const shops = await getAuthorizedShops({ appKey: 'ak', appSecret: 'as', accessToken: 'act' }, fakeFetch)
    expect(shops).toEqual([{ shop_id: 'shop-1', shop_name: 'My Shop' }])
  })

  it('throws on an error response code', async () => {
    const fakeFetch = (async () => Response.json({ code: 10002, message: 'invalid access_token' })) as typeof fetch

    await expect(
      getAuthorizedShops({ appKey: 'ak', appSecret: 'as', accessToken: 'bad' }, fakeFetch),
    ).rejects.toThrow(/TikTok authorized-shops fetch returned an error: 10002/)
  })
})

describe('fetchOrders', () => {
  it('sends the access token header and returns the orders array', async () => {
    const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
      const parsed = new URL(String(url))
      expect(parsed.searchParams.get('shop_id')).toBe('shop-1')
      const headers = init?.headers as Record<string, string> | undefined
      expect(headers?.['x-tts-access-token']).toBe('act_abc')
      return Response.json({ code: 0, message: 'success', data: { orders: [{ id: '1001', line_items: [], create_time: 1 }] } })
    }) as typeof fetch

    const orders = await fetchOrders({ shopId: 'shop-1', accessToken: 'act_abc', appKey: 'ak', appSecret: 'as' }, fakeFetch)
    expect(orders).toHaveLength(1)
    expect(orders[0].id).toBe('1001')
  })

  it('includes update_time_ge in the request body when provided', async () => {
    const fakeFetch = (async (_url: string | URL, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string)
      expect(body.update_time_ge).toBe(1700000000)
      return Response.json({ code: 0, message: 'success', data: { orders: [] } })
    }) as typeof fetch

    await fetchOrders(
      { shopId: 'shop-1', accessToken: 'act_abc', appKey: 'ak', appSecret: 'as', updateTimeGe: 1700000000 },
      fakeFetch,
    )
  })

  it('throws on an error response code', async () => {
    const fakeFetch = (async () => Response.json({ code: 10003, message: 'invalid shop_id' })) as typeof fetch

    await expect(
      fetchOrders({ shopId: 'bad-shop', accessToken: 'act', appKey: 'ak', appSecret: 'as' }, fakeFetch),
    ).rejects.toThrow(/TikTok order fetch returned an error: 10003/)
  })
})

describe('verifyWebhookSignature', () => {
  it('accepts a correctly computed signature', async () => {
    const rawBody = '{"order_id":"1"}'
    const secret = 'webhook-secret'
    const wrapped = `${secret}${rawBody}${secret}`
    const signatureHeader = (await hmacSha256Hex(wrapped, secret)).toUpperCase()

    expect(await verifyWebhookSignature({ rawBody, signatureHeader, appSecret: secret })).toBe(true)
  })

  it('rejects a tampered body', async () => {
    const secret = 'webhook-secret'
    const wrapped = `${secret}{"order_id":"1"}${secret}`
    const signatureHeader = (await hmacSha256Hex(wrapped, secret)).toUpperCase()

    expect(await verifyWebhookSignature({ rawBody: '{"order_id":"2"}', signatureHeader, appSecret: secret })).toBe(false)
  })

  it('rejects the correct signature computed with the wrong secret', async () => {
    const rawBody = '{"order_id":"1"}'
    const wrapped = `wrong-secret${rawBody}wrong-secret`
    const signatureHeader = (await hmacSha256Hex(wrapped, 'wrong-secret')).toUpperCase()

    expect(await verifyWebhookSignature({ rawBody, signatureHeader, appSecret: 'webhook-secret' })).toBe(false)
  })
})
