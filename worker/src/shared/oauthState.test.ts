import { describe, expect, it, vi } from 'vitest'
import { signInstallState, verifyInstallState } from './oauthState'

describe('install state signing', () => {
  it('round-trips: a state signed for a brand verifies back to that brand id', async () => {
    const state = await signInstallState('brand-123', 'app-secret')
    expect(await verifyInstallState(state, 'app-secret')).toBe('brand-123')
  })

  it('rejects a state verified with the wrong secret', async () => {
    const state = await signInstallState('brand-123', 'app-secret')
    expect(await verifyInstallState(state, 'wrong-secret')).toBeNull()
  })

  it('rejects a state with a tampered signature', async () => {
    const state = await signInstallState('brand-123', 'app-secret')
    const tampered = state.slice(0, -4) + 'aaaa'
    expect(await verifyInstallState(tampered, 'app-secret')).toBeNull()
  })

  it('rejects a state whose embedded brand id was swapped after signing (forged payload, stale signature)', async () => {
    // An attacker who can only edit the payload (not re-sign, since they lack
    // the secret) should not be able to redirect a valid signature onto a
    // different brand id.
    const state = await signInstallState('brand-123', 'app-secret')
    const [, signature] = [state.slice(0, state.lastIndexOf('.')), state.slice(state.lastIndexOf('.') + 1)]
    const forgedPayload = btoa(`brand-999.${Date.now() + 600_000}`)
    const forgedState = `${forgedPayload}.${signature}`

    expect(await verifyInstallState(forgedState, 'app-secret')).toBeNull()
  })

  it('rejects an expired state', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const state = await signInstallState('brand-123', 'app-secret')

    vi.setSystemTime(new Date('2026-01-01T00:11:00Z')) // past the 10-minute TTL
    expect(await verifyInstallState(state, 'app-secret')).toBeNull()
    vi.useRealTimers()
  })

  it('rejects a malformed state with no separator', async () => {
    expect(await verifyInstallState('not-a-valid-state', 'app-secret')).toBeNull()
  })
})
