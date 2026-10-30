import { describe, expect, it } from 'vitest'
import { clearStoredToken, readStoredToken, storeToken } from './googleAuth.ts'

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

  it('clears the stored token', () => {
    const store = memoryStore()
    storeToken('ya29.token', 3600, 0, store)
    clearStoredToken(store)
    expect(readStoredToken(0, store)).toBeNull()
  })
})
