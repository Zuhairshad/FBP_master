import { describe, expect, it } from 'vitest'
import { deactivateUser, reactivateUser, verifyAdminAccessToken } from './supabaseAdmin'

const env = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-role-key' }

// validateUUID (inside supabase-js's updateUserById) rejects anything that
// isn't a well-formed UUID before making a request at all.
const targetUserId = '11111111-1111-1111-1111-111111111111'

function fakeFetch(responder: (url: URL, init?: RequestInit) => Response): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
    return responder(url, init)
  }) as typeof fetch
}

describe('verifyAdminAccessToken', () => {
  it("returns the user id when the token is valid and the profile's role is admin", async () => {
    const fetchImpl = fakeFetch((url) => {
      if (url.pathname === '/auth/v1/user') return Response.json({ id: 'admin-1' })
      if (url.pathname === '/rest/v1/profiles') return Response.json({ role: 'admin' })
      throw new Error(`unexpected request to ${url.pathname}`)
    })

    expect(await verifyAdminAccessToken(env, 'valid-token', fetchImpl)).toBe('admin-1')
  })

  it('returns null for an invalid/expired token', async () => {
    const fetchImpl = fakeFetch(() => Response.json({ error: 'invalid token' }, { status: 401 }))
    expect(await verifyAdminAccessToken(env, 'bad-token', fetchImpl)).toBeNull()
  })

  it("returns null when the caller's profile role isn't admin", async () => {
    const fetchImpl = fakeFetch((url) => {
      if (url.pathname === '/auth/v1/user') return Response.json({ id: 'brand-1' })
      if (url.pathname === '/rest/v1/profiles') return Response.json({ role: 'brand' })
      throw new Error(`unexpected request to ${url.pathname}`)
    })

    expect(await verifyAdminAccessToken(env, 'valid-token', fetchImpl)).toBeNull()
  })
})

describe('deactivateUser', () => {
  it('bans the account for ~100 years and flips is_active off', async () => {
    const calls: { pathname: string; method: string | undefined; body: unknown }[] = []
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
      calls.push({ pathname: url.pathname, method: init?.method, body: init?.body ? JSON.parse(init.body as string) : null })
      if (url.pathname === `/auth/v1/admin/users/${targetUserId}`) return Response.json({ id: targetUserId })
      return Response.json({})
    }) as typeof fetch

    await deactivateUser(env, targetUserId, fetchImpl)

    const banCall = calls.find((c) => c.pathname === `/auth/v1/admin/users/${targetUserId}`)
    expect(banCall?.method).toBe('PUT')
    expect(banCall?.body).toEqual({ ban_duration: '876000h' })

    const profileCall = calls.find((c) => c.pathname === '/rest/v1/profiles')
    expect(profileCall?.method).toBe('PATCH')
    expect(profileCall?.body).toEqual({ is_active: false })
  })

  it('throws a descriptive error when the ban itself fails', async () => {
    const fetchImpl = fakeFetch((url) => {
      if (url.pathname === `/auth/v1/admin/users/${targetUserId}`) {
        return Response.json({ message: 'user not found' }, { status: 404 })
      }
      return Response.json({})
    })

    await expect(deactivateUser(env, targetUserId, fetchImpl)).rejects.toThrow(/Failed to ban user/)
  })
})

describe('reactivateUser', () => {
  it('lifts the ban and flips is_active back on', async () => {
    const calls: { pathname: string; method: string | undefined; body: unknown }[] = []
    const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
      calls.push({ pathname: url.pathname, method: init?.method, body: init?.body ? JSON.parse(init.body as string) : null })
      if (url.pathname === `/auth/v1/admin/users/${targetUserId}`) return Response.json({ id: targetUserId })
      return Response.json({})
    }) as typeof fetch

    await reactivateUser(env, targetUserId, fetchImpl)

    const banCall = calls.find((c) => c.pathname === `/auth/v1/admin/users/${targetUserId}`)
    expect(banCall?.body).toEqual({ ban_duration: 'none' })

    const profileCall = calls.find((c) => c.pathname === '/rest/v1/profiles')
    expect(profileCall?.body).toEqual({ is_active: true })
  })
})
