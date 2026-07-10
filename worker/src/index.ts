import { handleCallback, handleInstall, handleOrderWebhook, handleStatus, handleSync } from './shopify/handlers'
import type { ShopifyWorkerEnv } from './shopify/env'

export interface Env extends ShopifyWorkerEnv {
  // Further per-marketplace bindings (Phases 6-9) land here as they're wired up.
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const method = request.method

    if (method === 'GET' && url.pathname === '/health') {
      return Response.json({ ok: true })
    }

    if (method === 'GET' && url.pathname === '/shopify/status') {
      return handleStatus(request, env)
    }

    if (method === 'POST' && url.pathname === '/shopify/install') {
      return handleInstall(request, env)
    }

    if (method === 'GET' && url.pathname === '/shopify/callback') {
      return handleCallback(request, env)
    }

    if (method === 'POST' && url.pathname === '/shopify/sync') {
      return handleSync(request, env)
    }

    if (method === 'POST' && url.pathname === '/webhooks/shopify/orders') {
      return handleOrderWebhook(request, env)
    }

    return new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler<Env>
