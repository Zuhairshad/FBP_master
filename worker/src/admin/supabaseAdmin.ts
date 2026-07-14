import { createClient } from '@supabase/supabase-js'
import type { AdminWorkerEnv } from './env'

function adminClient(env: AdminWorkerEnv, fetchImpl: typeof fetch) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    global: { fetch: fetchImpl },
  })
}

/** Verifies the caller's Supabase session token and that their profile role
 * is 'admin'. Returns their user id, or null if the token is invalid or the
 * caller isn't an admin — same "never trust a client-supplied id, always
 * verify against the Auth server" posture as every other platform's
 * requireBrand-equivalent, plus the role check every admin route needs
 * since the service-role client bypasses RLS entirely (there is no RLS
 * backstop here the way there is for a browser's own Supabase queries). */
export async function verifyAdminAccessToken(
  env: AdminWorkerEnv,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const client = adminClient(env, fetchImpl)
  const { data: userData, error: userError } = await client.auth.getUser(accessToken)
  if (userError || !userData.user) {
    return null
  }

  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('role')
    .eq('id', userData.user.id)
    .maybeSingle()

  if (profileError || profile?.role !== 'admin') {
    return null
  }

  return userData.user.id
}

/** Real lockout, not just the profiles.is_active display flag: bans the
 * account via Supabase Auth so its session can't be refreshed once the
 * current access token expires (short-lived by default), then mirrors the
 * flag onto profiles so the admin UI/directory can show status without a
 * Worker round-trip for every read. ban_duration accepts a duration string;
 * '876000h' (~100 years) is Supabase's own documented idiom for "banned
 * indefinitely" — there's no separate "permanent" value. */
export async function deactivateUser(
  env: AdminWorkerEnv,
  targetUserId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const client = adminClient(env, fetchImpl)

  const { error: banError } = await client.auth.admin.updateUserById(targetUserId, {
    ban_duration: '876000h',
  })
  if (banError) {
    throw new Error(`Failed to ban user ${targetUserId}: ${banError.message}`)
  }

  const { error: profileError } = await client
    .from('profiles')
    .update({ is_active: false })
    .eq('id', targetUserId)
  if (profileError) {
    throw new Error(`Failed to set is_active=false for ${targetUserId}: ${profileError.message}`)
  }
}

/** Reverses deactivateUser: lifts the ban and flips is_active back on. */
export async function reactivateUser(
  env: AdminWorkerEnv,
  targetUserId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const client = adminClient(env, fetchImpl)

  const { error: banError } = await client.auth.admin.updateUserById(targetUserId, {
    ban_duration: 'none',
  })
  if (banError) {
    throw new Error(`Failed to unban user ${targetUserId}: ${banError.message}`)
  }

  const { error: profileError } = await client
    .from('profiles')
    .update({ is_active: true })
    .eq('id', targetUserId)
  if (profileError) {
    throw new Error(`Failed to set is_active=true for ${targetUserId}: ${profileError.message}`)
  }
}
