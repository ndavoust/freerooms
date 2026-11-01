const SCOPES = [
  'https://www.googleapis.com/auth/calendar.freebusy',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ')

export type TokenResult =
  | { ok: true; token: string; expiresIn: number }
  | { ok: false; error: string }

type TokenClient = {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void
}

const TOKEN_STORAGE_KEY = 'freerooms.google-token'
const NAME_STORAGE_KEY = 'freerooms.booker-name'
export const TOKEN_EXPIRY_SKEW_MS = 60_000
export const RENEW_LEAD_MS = 5 * 60 * 1000

type TokenStore = {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

type StoredToken = {
  token: string
  expiresAt: number
}

let tokenClient: TokenClient | null = null
let pending: ((result: TokenResult) => void) | null = null

function browserStore(): TokenStore | null {
  try {
    if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') return null
    return localStorage
  } catch {
    return null
  }
}

function isStoredToken(value: unknown): value is StoredToken {
  if (typeof value !== 'object' || value === null) return false
  const record = value as { token?: unknown; expiresAt?: unknown }
  return typeof record.token === 'string' && record.token.length > 0 && typeof record.expiresAt === 'number'
}

export function loadGis(timeoutMs = 10000): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const timer = window.setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        window.clearInterval(timer)
        resolve()
      } else if (Date.now() - started > timeoutMs) {
        window.clearInterval(timer)
        reject(new Error('Google Identity Services did not load'))
      }
    }, 40)
  })
}

export function initAuth(clientId: string): void {
  if (tokenClient) return
  const google = window.google
  if (!google?.accounts?.oauth2) {
    throw new Error('Google Identity Services is not loaded')
  }
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPES,
    callback: (response) => {
      const settle = pending
      pending = null
      if (!settle) return
      if (response.error || !response.access_token) {
        settle({ ok: false, error: response.error || 'missing_token' })
        return
      }
      settle({
        ok: true,
        token: response.access_token,
        expiresIn: response.expires_in ?? 3600,
      })
    },
    error_callback: (error) => {
      const settle = pending
      pending = null
      settle?.({ ok: false, error: error.type || 'auth_error' })
    },
  })
}

export function requestToken(prompt?: string): Promise<TokenResult> {
  return new Promise((resolve) => {
    if (!tokenClient) {
      resolve({ ok: false, error: 'auth_not_ready' })
      return
    }
    pending = resolve
    if (prompt === undefined) tokenClient.requestAccessToken()
    else tokenClient.requestAccessToken({ prompt })
  })
}

export function sessionNeedsRenew(expiresAt: number, now = Date.now()): boolean {
  return expiresAt - now <= RENEW_LEAD_MS
}

export function readStoredSession(
  now = Date.now(),
  store: TokenStore | null = browserStore(),
): { token: string; expiresAt: number } | null {
  const token = readStoredToken(now, store)
  if (!token || !store) return null
  try {
    const parsed: unknown = JSON.parse(store.getItem(TOKEN_STORAGE_KEY) ?? '')
    if (!isStoredToken(parsed)) return { token, expiresAt: now + RENEW_LEAD_MS }
    return { token, expiresAt: parsed.expiresAt }
  } catch {
    return { token, expiresAt: now + RENEW_LEAD_MS }
  }
}

export function readBookerName(store: TokenStore | null = browserStore()): string | null {
  if (!store) return null
  try {
    const name = store.getItem(NAME_STORAGE_KEY)?.trim()
    return name ? name : null
  } catch {
    return null
  }
}

export function storeBookerName(name: string, store: TokenStore | null = browserStore()): void {
  if (!store) return
  const trimmed = name.trim()
  if (!trimmed) return
  try {
    store.setItem(NAME_STORAGE_KEY, trimmed)
  } catch {
    // The in-memory name still works until the page is closed.
  }
}

export function readStoredToken(now = Date.now(), store: TokenStore | null = browserStore()): string | null {
  if (!store) return null
  try {
    const raw = store.getItem(TOKEN_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (!isStoredToken(parsed) || parsed.expiresAt <= now + TOKEN_EXPIRY_SKEW_MS) {
      store.removeItem(TOKEN_STORAGE_KEY)
      store.removeItem(NAME_STORAGE_KEY)
      return null
    }
    return parsed.token
  } catch {
    try {
      store.removeItem(TOKEN_STORAGE_KEY)
      store.removeItem(NAME_STORAGE_KEY)
    } catch {
      // Storage can be blocked in private mode.
    }
    return null
  }
}

export function storeToken(
  token: string,
  expiresIn: number,
  now = Date.now(),
  store: TokenStore | null = browserStore(),
): void {
  if (!store) return
  const expiresAt = now + Math.max(0, expiresIn) * 1000
  try {
    store.setItem(TOKEN_STORAGE_KEY, JSON.stringify({ token, expiresAt }))
  } catch {
    // The in-memory session still works until the page is closed.
  }
}

export function clearStoredToken(store: TokenStore | null = browserStore()): void {
  if (!store) return
  try {
    store.removeItem(TOKEN_STORAGE_KEY)
    store.removeItem(NAME_STORAGE_KEY)
  } catch {
    // Ignore storage failures.
  }
}
