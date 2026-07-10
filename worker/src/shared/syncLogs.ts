import { createClient } from '@supabase/supabase-js'

/** Records one sync_logs row per platform per scheduled sync run (Phase 10).
 * Platform-agnostic — every platform's scheduled orchestration
 * (worker/src/*\/sync.ts's syncAllXBrands) calls startSyncLog before
 * looping its connected brands and finishSyncLog once done, same shape as
 * hmac.ts/oauthState.ts's "no platform-specific logic" bar for living in
 * shared/ rather than duplicated per platform. */

export interface SyncLogsEnv {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
}

function adminClient(env: SyncLogsEnv, fetchImpl: typeof fetch) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    global: { fetch: fetchImpl },
  })
}

export async function startSyncLog(
  env: SyncLogsEnv,
  platform: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const { data, error } = await adminClient(env, fetchImpl)
    .from('sync_logs')
    .insert({ platform })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(`Failed to start sync_logs row for platform ${platform}: ${error?.message}`)
  }
  return (data as { id: string }).id
}

export async function finishSyncLog(
  env: SyncLogsEnv,
  logId: string,
  result: { successCount: number; failureCount: number; errorMessage: string | null },
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const { error } = await adminClient(env, fetchImpl)
    .from('sync_logs')
    .update({
      finished_at: new Date().toISOString(),
      success_count: result.successCount,
      failure_count: result.failureCount,
      error_message: result.errorMessage,
    })
    .eq('id', logId)

  if (error) {
    throw new Error(`Failed to finish sync_logs row ${logId}: ${error.message}`)
  }
}
