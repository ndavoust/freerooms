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

let tokenClient: TokenClient | null = null
let pending: ((result: TokenResult) => void) | null = null
let silentPromise: Promise<TokenResult> | null = null

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

export function trySilentSignIn(clientId: string): Promise<TokenResult> {
  if (!silentPromise) {
    silentPromise = loadGis()
      .then(() => {
        initAuth(clientId)
        return requestToken('')
      })
      .catch(() => ({ ok: false as const, error: 'gis_unavailable' }))
  }
  return silentPromise
}

export function resetAuthAttempt(): void {
  silentPromise = null
}

export function revokeToken(token: string): void {
  window.google?.accounts.oauth2.revoke(token, () => {})
}
