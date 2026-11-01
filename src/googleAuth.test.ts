import { describe, expect, it } from 'vitest'
import {
  clearStoredToken,
  readBookerName,
  readStoredSession,
  readStoredToken,
  sessionNeedsRenew,
  storeBookerName,
  storeToken,
} from './googleAuth.ts'

function memoryStore() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
    removeItem: (key: string) => {
      values.delete(key)
    },
  }
}

describe('stored Google token', () => {
  it('keeps a token that is still valid', () => {
    const store = memoryStore()
    const now = 1_700_000_000_000
    storeToken('ya29.token', 3600, now, store)
    expect(readStoredToken(now + 30 * 60 * 1000, store)).toBe('ya29.token')
  })

  it('drops a token inside the expiry margin', () => {
    const store = memoryStore()
    const now = 1_700_000_000_000
    storeToken('ya29.token', 30, now, store)
    expect(readStoredToken(now, store)).toBeNull()
    expect(store.getItem('freerooms.google-token')).toBeNull()
  })

  it('drops a corrupt value', () => {
    const store = memoryStore()
    store.setItem('freerooms.google-token', '{')
    expect(readStoredToken(0, store)).toBeNull()
    expect(store.getItem('freerooms.google-token')).toBeNull()
  })

  it('clears the stored token and the booker name', () => {
    const store = memoryStore()
    storeToken('ya29.token', 3600, 0, store)
    storeBookerName('Nicolas Davoust', store)
    clearStoredToken(store)
    expect(readStoredToken(0, store)).toBeNull()
    expect(readBookerName(store)).toBeNull()
  })

  it('returns the expiry with a live token', () => {
    const store = memoryStore()
    const now = 1_700_000_000_000
    storeToken('ya29.token', 3600, now, store)
    expect(readStoredSession(now, store)).toEqual({ token: 'ya29.token', expiresAt: now + 3_600_000 })
  })

  it('asks to renew during the last five minutes', () => {
    const expiresAt = 1_700_000_000_000
    expect(sessionNeedsRenew(expiresAt, expiresAt - 6 * 60 * 1000)).toBe(false)
    expect(sessionNeedsRenew(expiresAt, expiresAt - 4 * 60 * 1000)).toBe(true)
  })
})
