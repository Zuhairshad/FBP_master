import type { AmazonOrder, AmazonOrderItem } from './types'

const LWA_TOKEN_HOST = 'https://api.amazon.com'
const SP_API_HOST = 'https://sellingpartnerapi-na.amazon.com'

// Verified against Amazon's own documentation where fetchable: the LWA
// refresh-token flow (multiple independent sources, including Amazon's own
// "Retrieve an Access Token and Refresh Token" doc) and the Oct 2023
// changelog entry "SP-API no longer requires AWS IAM or AWS Signature
// Version 4" (developer-docs.amazon.com/sp-api/changelog/...) — SP-API
// requests now need only the LWA access token in the `x-amz-access-token`
// header, no SigV4 request signing. developer-docs.amazon.com's main docs
// portal itself returned HTTP 403 from this sandbox (same class of block as
// TikTok's docs site), so the getOrders/getOrderItems field names are
// verified instead against Amazon's own selling-partner-api-models GitHub
// repo (a first-party, machine-readable source), not a secondary
// description — see types.ts's header comment.

interface LwaTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

export async function refreshAccessToken(
  params: { clientId: string; clientSecret: string; refreshToken: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ accessToken: string; accessTokenExpiresAt: string }> {
  const res = await fetchImpl(`${LWA_TOKEN_HOST}/auth/o2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: params.refreshToken,
      client_id: params.clientId,
      client_secret: params.clientSecret,
    }).toString(),
  })

  if (!res.ok) {
    throw new Error(`Amazon LWA token refresh failed: ${res.status} ${await res.text()}`)
  }

  const body = (await res.json()) as LwaTokenResponse
  return {
    accessToken: body.access_token,
    accessTokenExpiresAt: new Date(Date.now() + body.expires_in * 1000).toISOString(),
  }
}

interface GetOrdersResponse {
  payload?: { Orders: AmazonOrder[] }
}

export async function fetchOrders(
  params: { accessToken: string; marketplaceId: string; createdAfter?: string },
  fetchImpl: typeof fetch = fetch,
): Promise<AmazonOrder[]> {
  const url = new URL(`${SP_API_HOST}/orders/v0/orders`)
  url.searchParams.set('MarketplaceIds', params.marketplaceId)
  url.searchParams.set('CreatedAfter', params.createdAfter ?? '1970-01-01T00:00:00Z')

  const res = await fetchImpl(url.toString(), { headers: { 'x-amz-access-token': params.accessToken } })

  if (!res.ok) {
    throw new Error(`Amazon order fetch failed: ${res.status} ${await res.text()}`)
  }

  const body = (await res.json()) as GetOrdersResponse
  return body.payload?.Orders ?? []
}

interface GetOrderItemsResponse {
  payload?: { OrderItems: AmazonOrderItem[] }
}

export async function fetchOrderItems(
  params: { accessToken: string; amazonOrderId: string },
  fetchImpl: typeof fetch = fetch,
): Promise<AmazonOrderItem[]> {
  const url = new URL(`${SP_API_HOST}/orders/v0/orders/${params.amazonOrderId}/orderItems`)

  const res = await fetchImpl(url.toString(), { headers: { 'x-amz-access-token': params.accessToken } })

  if (!res.ok) {
    throw new Error(`Amazon order-items fetch failed: ${res.status} ${await res.text()}`)
  }

  const body = (await res.json()) as GetOrderItemsResponse
  return body.payload?.OrderItems ?? []
}
