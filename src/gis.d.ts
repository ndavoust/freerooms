export type GoogleTokenResponse = {
  access_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

type TokenClient = {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void
}

type GoogleIdentity = {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string
        scope: string
        callback: (response: GoogleTokenResponse) => void
        error_callback?: (error: { type?: string; message?: string }) => void
      }) => TokenClient
      revoke: (accessToken: string, done?: () => void) => void
    }
  }
}

declare global {
  interface Window {
    google?: GoogleIdentity
  }
}
