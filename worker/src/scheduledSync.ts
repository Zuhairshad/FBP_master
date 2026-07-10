import { syncAllAmazonBrands } from './amazon/sync'
import { syncAllEbayBrands } from './ebay/sync'
import { syncAllShopifyBrands } from './shopify/sync'
import { finishSyncLog, startSyncLog } from './shared/syncLogs'
import { syncAllTiktokBrands } from './tiktok/sync'
import { syncAllWalmartBrands } from './walmart/sync'
import type { Env } from './index'

/** Phase 10: runs every platform's scheduled order sync, called from the
 * Worker's `scheduled()` export (see index.ts). Each platform gets its own
 * sync_logs row and runs independently — one platform crashing entirely
 * (e.g. listXTokens itself throwing on a DB outage) must not prevent the
 * other four from running or from getting their own log row, which is why
 * each is wrapped in its own try/catch here rather than relying solely on
 * syncAllXBrands's per-brand isolation. */
async function runPlatformSync(
  env: Env,
  platform: string,
  sync: () => Promise<{ successCount: number; failureCount: number; errors: string[] }>,
  fetchImpl: typeof fetch,
): Promise<void> {
  const logId = await startSyncLog(env, platform, fetchImpl)

  try {
    const result = await sync()
    await finishSyncLog(
      env,
      logId,
      {
        successCount: result.successCount,
        failureCount: result.failureCount,
        errorMessage: result.errors[0] ?? null,
      },
      fetchImpl,
    )
  } catch (err) {
    await finishSyncLog(
      env,
      logId,
      { successCount: 0, failureCount: 0, errorMessage: err instanceof Error ? err.message : String(err) },
      fetchImpl,
    )
  }
}

export async function runScheduledSync(env: Env, fetchImpl: typeof fetch = fetch): Promise<void> {
  await Promise.all([
    runPlatformSync(env, 'shopify', () => syncAllShopifyBrands(env, fetchImpl), fetchImpl),
    runPlatformSync(
      env,
      'tiktok',
      () => syncAllTiktokBrands(env, { appKey: env.TIKTOK_APP_KEY, appSecret: env.TIKTOK_APP_SECRET }, fetchImpl),
      fetchImpl,
    ),
    runPlatformSync(
      env,
      'amazon',
      () => syncAllAmazonBrands(env, { clientId: env.AMAZON_CLIENT_ID, clientSecret: env.AMAZON_CLIENT_SECRET }, fetchImpl),
      fetchImpl,
    ),
    runPlatformSync(
      env,
      'ebay',
      () => syncAllEbayBrands(env, { clientId: env.EBAY_CLIENT_ID, clientSecret: env.EBAY_CLIENT_SECRET }, fetchImpl),
      fetchImpl,
    ),
    runPlatformSync(env, 'walmart', () => syncAllWalmartBrands(env, fetchImpl), fetchImpl),
  ])
}
