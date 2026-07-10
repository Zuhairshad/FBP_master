import { createExecutionContext, createScheduledController, SELF, waitOnExecutionContext } from 'cloudflare:test'
import { afterEach, describe, expect, it } from 'vitest'
import worker from './index'
import type { Env } from './index'

describe('worker', () => {
  it('responds ok on /health', async () => {
    const res = await SELF.fetch('https://example.com/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('404s on unknown routes', async () => {
    const res = await SELF.fetch('https://example.com/nope')
    expect(res.status).toBe(404)
  })
})

describe('scheduled', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  /** Phase 10: exercises the real exported `scheduled()` handler through
   * the Workers runtime (createScheduledController/createExecutionContext),
   * not just its extracted orchestration logic — scheduledSync.test.ts
   * already covers per-platform failure isolation in detail via injected
   * fetchImpl; this test's job is only to prove the runtime entry point
   * itself dispatches correctly. Stubs the global fetch (rather than
   * injecting one — scheduled()'s signature is fixed by
   * ExportedHandler and takes no fetchImpl param) so every platform's
   * token-list call resolves empty instead of hitting a real network. */
  it('runs the scheduled sync across every platform without throwing', async () => {
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
      const method = init?.method ?? 'GET'

      if (url.pathname.endsWith('_tokens') && method === 'GET') {
        return Response.json([])
      }
      if (url.pathname === '/rest/v1/sync_logs' && method === 'POST') {
        return Response.json({ id: 'log-1' })
      }
      return Response.json({})
    }) as typeof fetch

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

    const controller = createScheduledController()
    const ctx = createExecutionContext()

    await worker.scheduled?.(controller, env, ctx)
    await waitOnExecutionContext(ctx)
  })
})
