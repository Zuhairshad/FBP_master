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
import {
  handleConnect as handleAmazonConnect,
  handleStatus as handleAmazonStatus,
  handleSync as handleAmazonSync,
} from './amazon/handlers'
import type { AmazonWorkerEnv } from './amazon/env'
import {
  handleCallback as handleEbayCallback,
  handleDeletionChallenge as handleEbayDeletionChallenge,
  handleDeletionNotification as handleEbayDeletionNotification,
  handleInstall as handleEbayInstall,
  handleStatus as handleEbayStatus,
  handleSync as handleEbaySync,
} from './ebay/handlers'
import type { EbayWorkerEnv } from './ebay/env'
import {
  handleConnect as handleWalmartConnect,
  handleStatus as handleWalmartStatus,
  handleSync as handleWalmartSync,
} from './walmart/handlers'
import type { WalmartWorkerEnv } from './walmart/env'
import { runScheduledSync } from './scheduledSync'

export interface Env
  extends ShopifyWorkerEnv,
    TiktokWorkerEnv,
    AmazonWorkerEnv,
    EbayWorkerEnv,
    WalmartWorkerEnv {}

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

    if (method === 'GET' && url.pathname === '/amazon/status') {
      return handleAmazonStatus(request, env)
    }

    if (method === 'POST' && url.pathname === '/amazon/connect') {
      return handleAmazonConnect(request, env)
    }

    if (method === 'POST' && url.pathname === '/amazon/sync') {
      return handleAmazonSync(request, env)
    }

    if (method === 'GET' && url.pathname === '/ebay/status') {
      return handleEbayStatus(request, env)
    }

    if (method === 'POST' && url.pathname === '/ebay/install') {
      return handleEbayInstall(request, env)
    }

    if (method === 'GET' && url.pathname === '/ebay/callback') {
      return handleEbayCallback(request, env)
    }

    if (method === 'POST' && url.pathname === '/ebay/sync') {
      return handleEbaySync(request, env)
    }

    if (method === 'GET' && url.pathname === '/webhooks/ebay/account-deletion') {
      return handleEbayDeletionChallenge(request, env)
    }

    if (method === 'POST' && url.pathname === '/webhooks/ebay/account-deletion') {
      return handleEbayDeletionNotification(request)
    }

    if (method === 'GET' && url.pathname === '/walmart/status') {
      return handleWalmartStatus(request, env)
    }

    if (method === 'POST' && url.pathname === '/walmart/connect') {
      return handleWalmartConnect(request, env)
    }

    if (method === 'POST' && url.pathname === '/walmart/sync') {
      return handleWalmartSync(request, env)
    }

    return new Response('Not found', { status: 404 })
  },

  // Phase 10: replaces "manual sync button only" with real background sync
  // across every connected platform. Fires on the wrangler.toml cron
  // schedule below; the actual orchestration (per platform, per brand,
  // sync_logs bookkeeping) lives in scheduledSync.ts, kept out of this
  // dispatch-only file the same way fetch()'s routes delegate to each
  // platform's own handlers.ts.
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runScheduledSync(env))
  },
} satisfies ExportedHandler<Env>
