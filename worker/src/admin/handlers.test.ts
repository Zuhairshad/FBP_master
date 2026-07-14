import { describe, expect, it } from 'vitest'
import { handleDeactivate, handleReactivate } from './handlers'
import type { AdminWorkerEnv } from './env'

const env: AdminWorkerEnv = {
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'service-role-key',
}

const targetUserId = '11111111-1111-1111-1111-111111111111'

function makeFetch(overrides: Partial<Record<string, (url: URL, init?: RequestInit) => Response>>): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
    const handler = overrides[url.pathname]
    if (handler) {
      return handler(url, init)
    }
    return Response.json({})
  }) as typeof fetch
}

function authedRequest(url: string, init: RequestInit = {}): Request {
  return new Request(url, {
    ...init,
    method: 'POST',
    headers: { ...init.headers, authorization: 'Bearer valid-token' },
  })
}

describe('handleDeactivate', () => {
  it('rejects a request with no bearer token', async () => {
    const res = await handleDeactivate(
      new Request(`https://worker.example.com/admin/users/${targetUserId}/deactivate`, { method: 'POST' }),
      env,
      targetUserId,
    )
    expect(res.status).toBe(401)
  })

  it('rejects a caller whose profile role is not admin', async () => {
    const fetchImpl = makeFetch({
      '/auth/v1/user': () => Response.json({ id: 'brand-1' }),
      '/rest/v1/profiles': () => Response.json({ role: 'brand' }),
    })
    const res = await handleDeactivate(
      authedRequest(`https://worker.example.com/admin/users/${targetUserId}/deactivate`),
      env,
      targetUserId,
      fetchImpl,
    )
    expect(res.status).toBe(403)
  })

  it('deactivates the target user for a verified admin', async () => {
    const fetchImpl = makeFetch({
      '/auth/v1/user': () => Response.json({ id: 'admin-1' }),
      '/rest/v1/profiles': () => Response.json({ role: 'admin' }),
      [`/auth/v1/admin/users/${targetUserId}`]: () => Response.json({ id: targetUserId }),
    })
    const res = await handleDeactivate(
      authedRequest(`https://worker.example.com/admin/users/${targetUserId}/deactivate`),
      env,
      targetUserId,
      fetchImpl,
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deactivated: true })
  })
})

describe('handleReactivate', () => {
  it('rejects a request with no bearer token', async () => {
    const res = await handleReactivate(
      new Request(`https://worker.example.com/admin/users/${targetUserId}/reactivate`, { method: 'POST' }),
      env,
      targetUserId,
    )
    expect(res.status).toBe(401)
  })

  it('reactivates the target user for a verified admin', async () => {
    const fetchImpl = makeFetch({
      '/auth/v1/user': () => Response.json({ id: 'admin-1' }),
      '/rest/v1/profiles': () => Response.json({ role: 'admin' }),
      [`/auth/v1/admin/users/${targetUserId}`]: () => Response.json({ id: targetUserId }),
    })
    const res = await handleReactivate(
      authedRequest(`https://worker.example.com/admin/users/${targetUserId}/reactivate`),
      env,
      targetUserId,
      fetchImpl,
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deactivated: false })
  })
})
