const workerUrl = import.meta.env.VITE_WORKER_URL

if (!workerUrl) {
  throw new Error('Missing VITE_WORKER_URL — copy .env.example to .env.local and fill it in.')
}

async function callWorker<T>(path: string, accessToken: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${workerUrl}${path}`, {
    ...init,
    headers: { ...init.headers, authorization: `Bearer ${accessToken}` },
  })

  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null

  if (!res.ok) {
    throw new Error(body?.error ?? `Worker request to ${path} failed with status ${res.status}`)
  }

  return body as T
}

export function requestShopifyInstallUrl(accessToken: string, shop: string): Promise<{ url: string }> {
  return callWorker('/shopify/install', accessToken, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ shop }),
  })
}

export function triggerShopifySync(accessToken: string): Promise<{ syncedCount: number }> {
  return callWorker('/shopify/sync', accessToken, { method: 'POST' })
}

export interface ShopifyStatus {
  connected: boolean
  shopDomain?: string
  lastSyncedAt?: string | null
}

export function getShopifyStatus(accessToken: string): Promise<ShopifyStatus> {
  return callWorker('/shopify/status', accessToken)
}
