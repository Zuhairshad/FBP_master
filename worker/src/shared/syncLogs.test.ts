import { describe, expect, it } from 'vitest'
import { finishSyncLog, startSyncLog } from './syncLogs'

const env = { SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'service-role-key' }

function fakeFetch(responder: (url: URL, init?: RequestInit) => Response): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
    return responder(url, init)
  }) as typeof fetch
}

describe('startSyncLog', () => {
  it('inserts a row for the given platform and returns its id', async () => {
    const fetchImpl = fakeFetch((url, init) => {
      expect(url.pathname).toBe('/rest/v1/sync_logs')
      expect(init?.method).toBe('POST')
      const body = JSON.parse(init?.body as string)
      expect(body).toEqual({ platform: 'amazon' })
      return Response.json({ id: 'log-1' })
    })

    expect(await startSyncLog(env, 'amazon', fetchImpl)).toBe('log-1')
  })

  it('throws when the insert fails', async () => {
    const fetchImpl = fakeFetch(() => Response.json({ message: 'insert failed' }, { status: 500 }))
    await expect(startSyncLog(env, 'amazon', fetchImpl)).rejects.toThrow(/Failed to start sync_logs row/)
  })
})

describe('finishSyncLog', () => {
  it('patches the row with finished_at and the result counts', async () => {
    const fetchImpl = fakeFetch((url, init) => {
      expect(url.pathname).toBe('/rest/v1/sync_logs')
      expect(init?.method).toBe('PATCH')
      const body = JSON.parse(init?.body as string)
      expect(body.success_count).toBe(3)
      expect(body.failure_count).toBe(1)
      expect(body.error_message).toBe('brand brand-1: network error')
      expect(typeof body.finished_at).toBe('string')
      return Response.json({})
    })

    await finishSyncLog(
      env,
      'log-1',
      { successCount: 3, failureCount: 1, errorMessage: 'brand brand-1: network error' },
      fetchImpl,
    )
  })

  it('throws when the update fails', async () => {
    const fetchImpl = fakeFetch(() => Response.json({ message: 'update failed' }, { status: 500 }))
    await expect(
      finishSyncLog(env, 'log-1', { successCount: 0, failureCount: 0, errorMessage: null }, fetchImpl),
    ).rejects.toThrow(/Failed to finish sync_logs row/)
  })
})
