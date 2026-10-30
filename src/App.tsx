import { useCallback, useEffect, useState } from 'react'
import { bookingWindow, classifyRoom } from './availability.ts'
import { LoginPanel } from './components/LoginPanel.tsx'
import { RoomBoard } from './components/RoomBoard.tsx'
import type { CardModel } from './components/RoomCard.tsx'
import type { BookResult, BusyEntry } from './googleCalendar.ts'
import { bookRoom, queryFreeBusy } from './googleCalendar.ts'
import {
  initAuth,
  loadGis,
  requestToken,
  resetAuthAttempt,
  revokeToken,
  trySilentSignIn,
} from './googleAuth.ts'
import { loadRooms, type Room, type RoomsConfig } from './rooms.ts'
import { formatClock, formatDay, untilSlots } from './time.ts'

const PREVIEW_NOTE =
  'Aperçu local : les occupations sont fictives, et Réserver ne crée pas d’événement Google.'

const preview =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('preview')

function clientIdFromEnv(): string {
  const raw = import.meta.env.VITE_GOOGLE_CLIENT_ID
  return typeof raw === 'string' ? raw.trim() : ''
}

const clientId = clientIdFromEnv()

type AuthPhase = 'checking' | 'signedOut' | 'ready'

function bookMessage(reason: Exclude<BookResult, { ok: true }>['reason']): string {
  if (reason === 'declined') return 'La salle a refusé ce créneau.'
  if (reason === 'forbidden') return 'Accès refusé à l’agenda.'
  if (reason === 'unauthorized') return 'La session Google a expiré. Reconnecte-toi.'
  return 'La réservation n’a pas abouti.'
}

function errorStatus(error: unknown): number | undefined {
  if (typeof error === 'object' && error !== null && 'status' in error && typeof error.status === 'number') {
    return error.status
  }
  return undefined
}

function currentUntil(slots: Date[], untilIso: string | null): Date {
  const match = untilIso ? slots.find((slot) => slot.toISOString() === untilIso) : undefined
  return match ?? slots[0] ?? new Date()
}

export default function App() {
  const [now, setNow] = useState(() => new Date())
  const [config, setConfig] = useState<RoomsConfig | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [authPhase, setAuthPhase] = useState<AuthPhase>(
    preview ? 'ready' : clientId ? 'checking' : 'signedOut',
  )
  const [token, setToken] = useState<string | null>(null)
  const [authError, setAuthError] = useState<string | null>(null)
  const [locationId, setLocationId] = useState('all')
  const [untilIso, setUntilIso] = useState<string | null>(null)
  const [busy, setBusy] = useState<Record<string, BusyEntry>>({})
  const [busyError, setBusyError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({})
  const [notices, setNotices] = useState<string[]>([])
  const [reserved, setReserved] = useState<Record<string, true>>({})
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    let active = true
    loadRooms()
      .then((value) => {
        if (active) setConfig(value)
      })
      .catch(() => {
        if (active) setLoadError('Le fichier rooms.json est illisible.')
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (preview || !clientId) return
    let active = true
    trySilentSignIn(clientId).then((result) => {
      if (!active) return
      if (result.ok) {
        setToken(result.token)
        setAuthPhase('ready')
      } else {
        setAuthPhase('signedOut')
      }
    })
    return () => {
      active = false
    }
  }, [])

  const slots = untilSlots(now)
  const selected = currentUntil(slots, untilIso)
  const horizonMs = (slots[slots.length - 1] ?? selected).getTime()
  const onBoard = Boolean(config) && (preview || (authPhase === 'ready' && token !== null))

  useEffect(() => {
    if (!onBoard || !config) return
    const ids = config.rooms
      .filter((room) => locationId === 'all' || room.locationId === locationId)
      .map((room) => room.calendarId)
    let active = true

    const run = async () => {
      try {
        if (import.meta.env.DEV && preview) {
          const { previewBusy } = await import('./preview.ts')
          const fetchedAt = new Date()
          const next: Record<string, BusyEntry> = {}
          for (const id of ids) next[id] = { busy: previewBusy(fetchedAt, id) }
          if (!active) return
          setBusy((current) => ({ ...current, ...next }))
          setBusyError(null)
          return
        }
        if (!token) return
        const next = await queryFreeBusy(token, ids, new Date(), new Date(horizonMs))
        if (!active) return
        setBusy((current) => ({ ...current, ...next }))
        setBusyError(null)
      } catch (error) {
        if (!active) return
        if (errorStatus(error) === 401) {
          setToken(null)
          setAuthPhase('signedOut')
          setAuthError('La session Google a expiré. Reconnecte-toi.')
          return
        }
        setBusyError('Les agendas n’ont pas répondu. Réessaie dans un instant.')
      }
    }

    void run()
    const timer = window.setInterval(() => {
      void run()
    }, 60_000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [onBoard, config, locationId, token, horizonMs, refreshKey])

  const signIn = useCallback(async () => {
    setAuthError(null)
    setAuthPhase('checking')
    try {
      await loadGis()
      initAuth(clientId)
      const result = await requestToken('select_account')
      if (!result.ok) {
        setAuthPhase('signedOut')
        if (result.error === 'access_denied') setAuthError('L’accès à l’agenda a été refusé.')
        else if (result.error !== 'popup_closed') setAuthError('La connexion Google a échoué. Réessaie.')
        return
      }
      setToken(result.token)
      setAuthPhase('ready')
    } catch {
      setAuthPhase('signedOut')
      setAuthError('Le service de connexion Google ne répond pas. Recharge la page.')
    }
  }, [])

  function signOut() {
    if (token) revokeToken(token)
    resetAuthAttempt()
    setToken(null)
    setAuthPhase('signedOut')
    setBusy({})
    setReserved({})
    setNotices([])
    setCardErrors({})
  }

  async function reserve(calendarId: string) {
    if (!config || pendingId) return
    const room = config.rooms.find((item) => item.calendarId === calendarId)
    const entry = busy[calendarId]
    if (!room || !entry || entry.error) return
    const status = classifyRoom(now, selected, entry.busy)
    const slot = bookingWindow(now, selected, status)
    if (!slot) return

    setPendingId(calendarId)
    setCardErrors((current) => {
      const next = { ...current }
      delete next[calendarId]
      return next
    })

    const notice = `${room.name} · réservé jusqu’à ${formatClock(selected)}.`
    const markReserved = () => {
      setReserved((current) => ({ ...current, [calendarId]: true }))
      setNotices((current) => [notice, ...current.filter((item) => item !== notice)])
      setBusy((current) => ({
        ...current,
        [calendarId]: {
          busy: [...(current[calendarId]?.busy ?? []), slot],
        },
      }))
    }

    if (preview) {
      markReserved()
      setPendingId(null)
      return
    }
    if (!token) {
      setPendingId(null)
      return
    }

    const result = await bookRoom(token, calendarId, slot.start, slot.end)
    setPendingId(null)
    if (!result.ok) {
      if (result.detail) console.error(result.detail)
      if (result.reason === 'unauthorized') {
        setToken(null)
        setAuthPhase('signedOut')
        setAuthError(bookMessage(result.reason))
        return
      }
      setCardErrors((current) => ({ ...current, [calendarId]: bookMessage(result.reason) }))
      setRefreshKey((value) => value + 1)
      return
    }
    markReserved()
    setRefreshKey((value) => value + 1)
  }

  const cards = config ? buildCards(config, locationId, busy, reserved, cardErrors, pendingId, now, selected) : []
  const visibleCount = config
    ? config.rooms.filter((room) => locationId === 'all' || room.locationId === locationId).length
    : 0
  const missingCount = config
    ? config.rooms.filter(
        (room) =>
          (locationId === 'all' || room.locationId === locationId) && busy[room.calendarId] === undefined,
      ).length
    : 0
  const failedCount = config
    ? config.rooms.filter(
        (room) =>
          (locationId === 'all' || room.locationId === locationId) && Boolean(busy[room.calendarId]?.error),
      ).length
    : 0

  const loading = onBoard && missingCount > 0 && !busyError
  const allFailed = visibleCount > 0 && failedCount === visibleCount
  let message: string | null = null
  let messageTone: 'neutral' | 'warn' = 'neutral'
  if (onBoard && visibleCount === 0) {
    message = locationId === 'all' ? 'Le fichier ne contient aucune salle.' : 'Aucune salle dans ce lieu.'
  } else if (onBoard && allFailed) {
    message = 'Ces agendas ne répondent pas. Remplace public/rooms.json par l’export admin.'
    messageTone = 'warn'
  } else if (onBoard && busyError && cards.length === 0 && !loading) {
    message = busyError
    messageTone = 'warn'
  } else if (onBoard && !loading && cards.length === 0) {
    message =
      locationId === 'all'
        ? `Aucune salle libre jusqu’à ${formatClock(selected)}.`
        : `Aucune salle libre jusqu’à ${formatClock(selected)} dans ce lieu.`
  } else if (onBoard && failedCount > 0 && cards.length > 0) {
    message = 'Certaines salles n’ont pas répondu.'
    messageTone = 'warn'
  }

  return (
    <>
      <header className="top">
        <div className="top-inner">
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="32" height="32">
                <rect width="24" height="24" rx="6" fill="#1a73e8" />
                <rect x="4" y="5" width="16" height="4" rx="1" fill="#fff" />
                <rect x="5" y="12" width="6" height="6" rx="1" fill="#fff" opacity="0.95" />
                <rect x="13" y="12" width="6" height="6" rx="1" fill="#fff" opacity="0.55" />
              </svg>
            </span>
            <div className="titles">
              <h1>Salles libres</h1>
              <p className="day">{formatDay(now)}</p>
            </div>
          </div>
          <div className="top-side">
            <time className="clock" dateTime={now.toISOString()}>
              {formatClock(now)}
            </time>
            {onBoard && !preview ? (
              <button type="button" className="ghost" onClick={signOut}>
                Se déconnecter
              </button>
            ) : null}
          </div>
        </div>
      </header>
      <main className="app">
        {loadError ? <p className="empty empty-warn">{loadError}</p> : null}
        {!loadError && !config ? <p className="status-line">Chargement des salles…</p> : null}
        {config && !onBoard ? (
          <LoginPanel
            checking={authPhase === 'checking'}
            needsConfig={!clientId && !preview}
            error={authError}
            onSignIn={() => {
              void signIn()
            }}
          />
        ) : null}
        {config && onBoard ? (
          <RoomBoard
            now={now}
            slots={slots}
            until={selected}
            onUntil={(value) => setUntilIso(value.toISOString())}
            locations={config.locations}
            locationId={locationId}
            onLocation={setLocationId}
            cards={cards}
            loading={loading}
            message={message}
            messageTone={messageTone}
            notices={notices}
            previewNote={preview ? PREVIEW_NOTE : null}
            onReserve={(id) => {
              void reserve(id)
            }}
          />
        ) : null}
      </main>
    </>
  )
}

function buildCards(
  config: RoomsConfig,
  locationId: string,
  busy: Record<string, BusyEntry>,
  reserved: Record<string, true>,
  cardErrors: Record<string, string>,
  pendingId: string | null,
  now: Date,
  until: Date,
): CardModel[] {
  const labels = new Map(config.locations.map((location) => [location.id, location.label]))
  const cards: CardModel[] = []

  for (const room of config.rooms) {
    if (locationId !== 'all' && room.locationId !== locationId) continue
    const entry = busy[room.calendarId]
    if (!entry || entry.error) continue
    const card = toCard(
      room,
      labels.get(room.locationId) ?? room.locationId,
      entry,
      reserved,
      cardErrors,
      pendingId,
      now,
      until,
    )
    if (card) cards.push(card)
  }

  cards.sort((a, b) => {
    const rank = (mode: CardModel['mode']) => (mode === 'reserved' ? 0 : mode === 'free' ? 1 : 2)
    const byMode = rank(a.mode) - rank(b.mode)
    if (byMode !== 0) return byMode
    return a.name.localeCompare(b.name, 'fr')
  })
  return cards
}

function toCard(
  room: Room,
  locationLabel: string,
  entry: BusyEntry,
  reserved: Record<string, true>,
  cardErrors: Record<string, string>,
  pendingId: string | null,
  now: Date,
  until: Date,
): CardModel | null {
  if (reserved[room.calendarId]) {
    return {
      calendarId: room.calendarId,
      name: room.name,
      locationLabel,
      capacity: room.capacity,
      mode: 'reserved',
      canBook: false,
      pending: false,
    }
  }

  const status = classifyRoom(now, until, entry.busy)
  if (status.kind === 'hidden') return null
  return {
    calendarId: room.calendarId,
    name: room.name,
    locationLabel,
    capacity: room.capacity,
    mode: status.kind,
    freeAt: status.kind === 'soon' ? status.freeAt : undefined,
    canBook: bookingWindow(now, until, status) !== null,
    pending: pendingId === room.calendarId,
    error: cardErrors[room.calendarId],
  }
}
