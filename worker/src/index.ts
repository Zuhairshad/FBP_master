import {
  handleCallback as handleShopifyCallback,
  handleInstall as handleShopifyInstall,
  handleOrderWebhook as handleShopifyOrderWebhook,
  handleStatus as handleShopifyStatus,
  handleSync as handleShopifySync,
} from './shopify/handlers'
import type { ShopifyWorkerEnv } from './shopify/env'
import {
  handleCallback as handleTiktokCallback,
  handleInstall as handleTiktokInstall,
  handleOrderWebhook as handleTiktokOrderWebhook,
  handleStatus as handleTiktokStatus,
  handleSync as handleTiktokSync,
} from './tiktok/handlers'
import type { TiktokWorkerEnv } from './tiktok/env'

export interface Env extends ShopifyWorkerEnv, TiktokWorkerEnv {
  // Further per-marketplace bindings (Phases 7-9) land here as they're wired up.
}

export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url)
    const method = request.method

    if (method === 'GET' && url.pathname === '/health') {
      return Response.json({ ok: true })
    }

    if (method === 'GET' && url.pathname === '/shopify/status') {
      return handleShopifyStatus(request, env)
    }

    if (method === 'POST' && url.pathname === '/shopify/install') {
      return handleShopifyInstall(request, env)
    }

    if (method === 'GET' && url.pathname === '/shopify/callback') {
      return handleShopifyCallback(request, env)
    }

    if (method === 'POST' && url.pathname === '/shopify/sync') {
      return handleShopifySync(request, env)
    }

    if (method === 'POST' && url.pathname === '/webhooks/shopify/orders') {
      return handleShopifyOrderWebhook(request, env)
    }

    if (method === 'GET' && url.pathname === '/tiktok/status') {
      return handleTiktokStatus(request, env)
    }

    if (method === 'POST' && url.pathname === '/tiktok/install') {
      return handleTiktokInstall(request, env)
    }

    if (method === 'GET' && url.pathname === '/tiktok/callback') {
      return handleTiktokCallback(request, env)
    }

    if (method === 'POST' && url.pathname === '/tiktok/sync') {
      return handleTiktokSync(request, env)
    }

    if (method === 'POST' && url.pathname === '/webhooks/tiktok/orders') {
      return handleTiktokOrderWebhook(request, env)
    }

    return new Response('Not found', { status: 404 })
  },
} satisfies ExportedHandler<Env>
