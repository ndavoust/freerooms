type LoginPanelProps = {
  checking: boolean
  needsConfig: boolean
  error: string | null
  onSignIn: () => void
}

export function LoginPanel({ checking, needsConfig, error, onSignIn }: LoginPanelProps) {
  return (
    <section className="login">
      <p className="login-copy">Connecte ton agenda Google pour voir les salles libres et en réserver une.</p>
      {needsConfig ? (
        <p className="login-note">
          Ajoute VITE_GOOGLE_CLIENT_ID dans un fichier .env, puis relance le serveur. Le README décrit le
          client OAuth interne.
        </p>
      ) : (
        <button type="button" className="google-signin" onClick={onSignIn} disabled={checking}>
          <svg className="google-g" viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84c-.21 1.13-.84 2.08-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.87 2.69-6.62z"
            />
            <path
              fill="#34A853"
              d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33C2.44 15.98 5.48 18 9 18z"
            />
            <path
              fill="#FBBC05"
              d="M3.96 10.71A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.17.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3-2.33z"
            />
            <path
              fill="#EA4335"
              d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0 5.48 0 2.44 2.02.96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58z"
            />
          </svg>
          {checking ? 'Connexion…' : 'Se connecter avec Google'}
        </button>
      )}
      {error ? <p className="login-note">{error}</p> : null}
    </section>
  )
}
