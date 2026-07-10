import type { WalmartOrder, WalmartOrderListResponse } from './types'

const WALMART_API_HOST = 'https://marketplace.walmartapis.com'
const TOKEN_PATH = '/v3/token'
const ORDERS_PATH = '/v3/orders'

// Walmart's own docs portal (developer.walmart.com) returned HTTP 403 when
// fetched directly via WebFetch from this sandbox's network policy — same
// class of block as every other marketplace platform's docs site in this
// repo (see CLAUDE.md Landmines). WebSearch's result synthesis quoted
// developer.walmart.com's own page content directly (the token endpoint
// URL, the client-credentials grant shape, the required WM_* headers, the
// 15-minute token lifetime, the orders response's nested list/elements
// shape) — a first-party *source*, not a first-party *fetch*, same posture
// as Phase 8's eBay integration. Everything below is unit-tested against
// this documented format; UNVERIFIED end-to-end against a live Walmart
// seller account.

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${btoa(`${clientId}:${clientSecret}`)}`
}

interface WalmartTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

/** Mints an access token directly from a brand's own client_id/client_secret
 * via Walmart's client-credentials grant — no browser redirect, no
 * long-lived refresh_token: unlike every other platform in this repo,
 * client_id/client_secret themselves are the durable credential, re-used on
 * every mint (see the walmart_tokens migration's header comment). */
export async function mintAccessToken(
  params: { clientId: string; clientSecret: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ accessToken: string; accessTokenExpiresAt: string }> {
  const res = await fetchImpl(`${WALMART_API_HOST}${TOKEN_PATH}`, {
    method: 'POST',
    headers: {
      authorization: basicAuthHeader(params.clientId, params.clientSecret),
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
      'wm_svc.name': 'Walmart Marketplace',
      'wm_qos.correlation_id': crypto.randomUUID(),
    },
    body: new URLSearchParams({ grant_type: 'client_credentials' }).toString(),
  })

  if (!res.ok) {
    throw new Error(`Walmart token mint failed: ${res.status} ${await res.text()}`)
  }

  const body = (await res.json()) as WalmartTokenResponse
  return {
    accessToken: body.access_token,
    accessTokenExpiresAt: new Date(Date.now() + body.expires_in * 1000).toISOString(),
  }
}

export async function fetchOrders(
  params: { accessToken: string; createdStartDate?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<WalmartOrder[]> {
  const url = new URL(`${WALMART_API_HOST}${ORDERS_PATH}`)
  if (params.createdStartDate) {
    url.searchParams.set('createdStartDate', params.createdStartDate)
  }
  url.searchParams.set('limit', '50')

  const res = await fetchImpl(url.toString(), {
    headers: {
      accept: 'application/json',
      'wm_sec.access_token': params.accessToken,
      'wm_svc.name': 'Walmart Marketplace',
      'wm_qos.correlation_id': crypto.randomUUID(),
    },
  })

  if (!res.ok) {
    throw new Error(`Walmart order fetch failed: ${res.status} ${await res.text()}`)
  }

  const body = (await res.json()) as WalmartOrderListResponse
  return body.list?.elements?.order ?? []
}
