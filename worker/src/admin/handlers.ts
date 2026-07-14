import type { AdminWorkerEnv } from './env'
import { deactivateUser, reactivateUser, verifyAdminAccessToken } from './supabaseAdmin'

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization')
  if (!header?.startsWith('Bearer ')) {
    return null
  }
  return header.slice('Bearer '.length)
}

async function requireAdmin(
  request: Request,
  env: AdminWorkerEnv,
  fetchImpl: typeof fetch,
): Promise<string | Response> {
  const token = bearerToken(request)
  if (!token) {
    return Response.json({ error: 'Missing bearer token' }, { status: 401 })
  }
  const adminId = await verifyAdminAccessToken(env, token, fetchImpl)
  if (!adminId) {
    return Response.json({ error: 'Invalid session, or caller is not an admin' }, { status: 403 })
  }
  return adminId
}

/** POST /admin/users/:id/deactivate — real lockout via Supabase Auth's ban
 * mechanism (see supabaseAdmin.ts), not just the profiles.is_active display
 * flag. This is the one action in Phase 12 that genuinely needs the
 * service-role key: RLS alone can flip a boolean, but it can't touch
 * auth.users or invalidate a session. */
export async function handleDeactivate(
  request: Request,
  env: AdminWorkerEnv,
  targetUserId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const adminIdOrResponse = await requireAdmin(request, env, fetchImpl)
  if (adminIdOrResponse instanceof Response) {
    return adminIdOrResponse
  }

  await deactivateUser(env, targetUserId, fetchImpl)
  return Response.json({ deactivated: true })
}

/** POST /admin/users/:id/reactivate — reverses handleDeactivate. */
export async function handleReactivate(
  request: Request,
  env: AdminWorkerEnv,
  targetUserId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const adminIdOrResponse = await requireAdmin(request, env, fetchImpl)
  if (adminIdOrResponse instanceof Response) {
    return adminIdOrResponse
  }

  await reactivateUser(env, targetUserId, fetchImpl)
  return Response.json({ deactivated: false })
}
