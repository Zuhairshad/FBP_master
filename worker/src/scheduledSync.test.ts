import { describe, expect, it } from 'vitest'
import { runScheduledSync } from './scheduledSync'
import type { Env } from './index'

const env: Env = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
  SHOPIFY_CLIENT_ID: 'shopify-client-id',
  SHOPIFY_CLIENT_SECRET: 'shopify-client-secret',
  SHOPIFY_SCOPES: 'read_orders',
  APP_URL: 'https://app.example.com',
  WORKER_URL: 'https://worker.example.com',
  TIKTOK_APP_KEY: 'tiktok-app-key',
  TIKTOK_APP_SECRET: 'tiktok-app-secret',
  AMAZON_CLIENT_ID: 'amazon-client-id',
  AMAZON_CLIENT_SECRET: 'amazon-client-secret',
  EBAY_CLIENT_ID: 'ebay-client-id',
  EBAY_CLIENT_SECRET: 'ebay-client-secret',
  EBAY_RU_NAME: 'ebay-ru-name',
  EBAY_VERIFICATION_TOKEN: 'ebay-verification-token',
}

const TOKEN_TABLES = ['shopify_tokens', 'tiktok_tokens', 'amazon_tokens', 'ebay_tokens', 'walmart_tokens']

interface Call {
  pathname: string
  method: string
  body: unknown
}

/** Every platform's token-list GET returns empty (no connected brands), so
 * each syncAllXBrands resolves immediately with { successCount: 0,
 * failureCount: 0, errors: [] } — this test is about scheduledSync's own
 * orchestration (one sync_logs row started+finished per platform), not
 * about per-brand sync behavior, which each platform's own sync.test.ts
 * already covers. `brokenTable`, if given, makes that one token table's GET
 * fail with a 500 to simulate a whole-platform crash (e.g. DB outage). */
function makeFetch(brokenTable?: string) {
  const calls: Call[] = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(init.body as string) : undefined
    calls.push({ pathname: url.pathname, method, body })

    const table = TOKEN_TABLES.find((t) => url.pathname === `/rest/v1/${t}`)
    if (table && method === 'GET') {
      if (table === brokenTable) {
        return Response.json({ message: 'connection refused' }, { status: 500 })
      }
      return Response.json([])
    }

    if (url.pathname === '/rest/v1/sync_logs' && method === 'POST') {
      return Response.json({ id: `log-${url.searchParams.toString()}-${calls.length}` })
    }

    return Response.json({})
  }) as typeof fetch

  return { fetchImpl, calls }
}

describe('runScheduledSync', () => {
  it('starts and finishes one sync_logs row per platform when every platform has no connected brands', async () => {
    const { fetchImpl, calls } = makeFetch()

    await runScheduledSync(env, fetchImpl)

    const starts = calls.filter((c) => c.pathname === '/rest/v1/sync_logs' && c.method === 'POST')
    const finishes = calls.filter((c) => c.pathname === '/rest/v1/sync_logs' && c.method === 'PATCH')
    expect(starts).toHaveLength(5)
    expect(finishes).toHaveLength(5)
    expect(starts.map((c) => (c.body as { platform: string }).platform).sort()).toEqual(
      ['amazon', 'ebay', 'shopify', 'tiktok', 'walmart'],
    )
    for (const finish of finishes) {
      expect(finish.body).toMatchObject({ success_count: 0, failure_count: 0, error_message: null })
    }
  })

  it("isolates one platform's total crash (e.g. DB outage listing tokens) so the other four still get logged", async () => {
    const { fetchImpl, calls } = makeFetch('amazon_tokens')

    await runScheduledSync(env, fetchImpl)

    const finishes = calls.filter((c) => c.pathname === '/rest/v1/sync_logs' && c.method === 'PATCH')
    expect(finishes).toHaveLength(5)

    const crashed = finishes.find((f) => (f.body as { error_message: string | null }).error_message?.includes('amazon_tokens'))
    expect(crashed).toBeDefined()
    expect(crashed?.body).toMatchObject({ success_count: 0, failure_count: 0 })

    const healthy = finishes.filter((f) => f !== crashed)
    expect(healthy).toHaveLength(4)
    for (const finish of healthy) {
      expect(finish.body).toMatchObject({ success_count: 0, failure_count: 0, error_message: null })
    }
  })
})
