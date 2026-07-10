import { SELF } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

describe('worker', () => {
  it('responds ok on /health', async () => {
    const res = await SELF.fetch('https://example.com/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('404s on unknown routes', async () => {
    const res = await SELF.fetch('https://example.com/nope')
    expect(res.status).toBe(404)
  })
})
