import { describe, expect, it } from 'vitest'
import { hmacSha256Base64, hmacSha256Hex, timingSafeEqual } from './hmac'

describe('hmac', () => {
  it('produces a stable base64 HMAC for the same message and secret', async () => {
    const a = await hmacSha256Base64('hello', 'secret')
    const b = await hmacSha256Base64('hello', 'secret')
    expect(a).toBe(b)
  })

  it('produces a different base64 HMAC for a different message', async () => {
    const a = await hmacSha256Base64('hello', 'secret')
    const b = await hmacSha256Base64('goodbye', 'secret')
    expect(a).not.toBe(b)
  })

  it('produces a hex string of the expected length (SHA-256 = 32 bytes = 64 hex chars)', async () => {
    const hex = await hmacSha256Hex('hello', 'secret')
    expect(hex).toMatch(/^[0-9a-f]{64}$/)
  })

  describe('timingSafeEqual', () => {
    it('returns true for identical strings', () => {
      expect(timingSafeEqual('abc123', 'abc123')).toBe(true)
    })

    it('returns false for different strings of the same length', () => {
      expect(timingSafeEqual('abc123', 'abc124')).toBe(false)
    })

    it('returns false for strings of different lengths', () => {
      expect(timingSafeEqual('abc', 'abc123')).toBe(false)
    })
  })
})
