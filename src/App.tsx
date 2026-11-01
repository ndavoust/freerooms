import { useCallback, useEffect, useRef, useState } from 'react'
import { bookingWindow, classifyRoom, withoutOverlap } from './availability.ts'
import { LoginPanel } from './components/LoginPanel.tsx'
import { OccupancyStats, type FloorStat } from './components/OccupancyStats.tsx'
import { RoomBoard } from './components/RoomBoard.tsx'
import type { CardModel } from './components/RoomCard.tsx'
import type { BookResult, BusyEntry } from './googleCalendar.ts'
import {
  bookRoom,
  bookingTitle,
  fetchBookerName,
  listPrimaryEvents,
  listRoomEvents,
  queryFreeBusy,
  releaseRoom,
} from './googleCalendar.ts'
import {
  TOKEN_EXPIRY_SKEW_MS,
  clearStoredToken,
  initAuth,
  loadGis,
  readBookerName,
  readStoredSession,
  requestToken,
  sessionNeedsRenew,
  storeBookerName,
  storeToken,
} from './googleAuth.ts'
import { MEETING_WINDOW_MS, pickNextRoomMeeting, visibleMeeting, type RoomMeeting } from './nextMeeting.ts'
import { seatOccupancy } from './occupancy.ts'
import { previewSchedule } from './preview.ts'
import { RESERVATION_LOOKBACK_MS, currentMeetingSummary, pickReservedRooms, type RoomEvent } from './reservedRooms.ts'
import { loadRooms, type Room, type RoomsConfig } from './rooms.ts'
import { formatClock, formatDay, untilSlots } from './time.ts'

const PREVIEW_NOTE =
  'Aperçu local : les occupations sont fictives, et Réserver ne crée pas d’événement Google.'

const NOTICE_MS = 5000

const preview =
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('preview')

function clientIdFromEnv(): string {
  const raw = import.meta.env.VITE_GOOGLE_CLIENT_ID
  return typeof raw === 'string' ? raw.trim() : ''
}

const clientId = clientIdFromEnv()
const restored = !preview && clientId ? readStoredSession() : null
const restoredToken = restored?.token ?? null

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
  const [authPhase, setAuthPhase] = useState<AuthPhase>(preview || restoredToken ? 'ready' : 'signedOut')
  const [token, setToken] = useState<string | null>(restoredToken)
  const [expiresAt, setExpiresAt] = useState<number | null>(restored?.expiresAt ?? null)
  const [sessionBlocked, setSessionBlocked] = useState(false)
  const [renewing, setRenewing] = useState(false)
  const [renewError, setRenewError] = useState<string | null>(null)
  const [bookerName, setBookerName] = useState<string | null>(restored ? readBookerName() : null)
  const renewingRef = useRef(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [locationId, setLocationId] = useState('all')
  const [untilIso, setUntilIso] = useState<string | null>(null)
  const [busy, setBusy] = useState<Record<string, BusyEntry>>({})
  const [roomEvents, setRoomEvents] = useState<Record<string, RoomEvent[]>>({})
  const [busyError, setBusyError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({})
  const [notices, setNotices] = useState<string[]>([])
  const noticeTimers = useRef(new Map<string, number>())
  const [reserved, setReserved] = useState<Record<string, true>>({})
  const [refreshKey, setRefreshKey] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const refreshLeft = useRef(0)
  const [nextMeeting, setNextMeeting] = useState<RoomMeeting | null | undefined>(undefined)
  const [releasing, setReleasing] = useState(false)
  const [releaseError, setReleaseError] = useState<string | null>(null)
  const [previewReleased, setPreviewReleased] = useState(false)

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (preview || !token || bookerName) return
    let active = true
    void fetchBookerName(token).then((name) => {
      if (!active || !name) return
      const title = bookingTitle(name)
      storeBookerName(title)
      setBookerName(title)
    })
    return () => {
      active = false
    }
  }, [token, bookerName])

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

  const slots = untilSlots(now)
  const selected = currentUntil(slots, untilIso)
  const horizonMs = (slots[slots.length - 1] ?? selected).getTime()
  const onBoard = Boolean(config) && (preview || (authPhase === 'ready' && token !== null))
  const renewDue = expiresAt !== null && sessionNeedsRenew(expiresAt, now.getTime())
  const tokenExpired = expiresAt !== null && expiresAt <= now.getTime() + TOKEN_EXPIRY_SKEW_MS
  const showRenew = renewDue || sessionBlocked
  const pollsStopped = sessionBlocked || tokenExpired

  useEffect(() => {
    if (!onBoard || !config || pollsStopped) return
    const ids = config.rooms
      .filter((room) => locationId === 'all' || room.locationId === locationId)
      .map((room) => room.calendarId)
    let active = true

    const run = async () => {
      try {
        const fetchedAt = new Date()
        const lookback = new Date(fetchedAt.getTime() - RESERVATION_LOOKBACK_MS)
        const horizon = new Date(horizonMs)
        if (import.meta.env.DEV && preview) {
          const { previewSchedule } = await import('./preview.ts')
          const nextBusy: Record<string, BusyEntry> = {}
          const nextEvents: Record<string, RoomEvent[]> = {}
          for (const room of config.rooms) {
            if (!ids.includes(room.calendarId)) continue
            const schedule = previewSchedule(fetchedAt, room)
            nextBusy[room.calendarId] = { busy: schedule.busy }
            nextEvents[room.calendarId] = schedule.events
          }
          if (!active) return
          setBusy((current) => ({ ...current, ...nextBusy }))
          setRoomEvents((current) => ({ ...current, ...nextEvents }))
          setBusyError(null)
          return
        }
        if (!token) return
        const next = await queryFreeBusy(token, ids, lookback, horizon)
        if (!active) return
        setBusy((current) => ({ ...current, ...next }))
        setBusyError(null)
        try {
          const listed = await listRoomEvents(token, ids, lookback, horizon)
          if (!active) return
          setRoomEvents((current) => ({ ...current, ...listed }))
        } catch (error) {
          if (errorStatus(error) === 401) holdSession()
        }
      } catch (error) {
        if (!active) return
        if (errorStatus(error) === 401) {
          holdSession()
          return
        }
        setBusyError('Les agendas n’ont pas répondu. Réessaie dans un instant.')
      }
    }

    void run().finally(() => {
      if (active) finishRefresh()
    })
    const timer = window.setInterval(() => {
      void run()
    }, 60_000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [onBoard, config, locationId, token, horizonMs, refreshKey, pollsStopped])

  useEffect(() => {
    if (!onBoard || !config || pollsStopped) return
    let active = true

    const run = async () => {
      try {
        if (import.meta.env.DEV && preview) {
          if (previewReleased) return
          const { previewNextMeeting } = await import('./preview.ts')
          if (!active) return
          setNextMeeting(previewNextMeeting(new Date(), config))
          return
        }
        if (!token) return
        const fetchedAt = new Date()
        const events = await listPrimaryEvents(
          token,
          new Date(fetchedAt.getTime() - MEETING_WINDOW_MS),
          new Date(fetchedAt.getTime() + MEETING_WINDOW_MS),
        )
        if (!active) return
        setNextMeeting(pickNextRoomMeeting(events, config.rooms, config.locations, fetchedAt))
      } catch (error) {
        if (!active) return
        if (errorStatus(error) === 401) {
          holdSession()
          return
        }
        setNextMeeting(null)
      }
    }

    void run().finally(() => {
      if (active) finishRefresh()
    })
    const timer = window.setInterval(() => {
      void run()
    }, 60_000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [onBoard, config, token, refreshKey, previewReleased, pollsStopped])

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
      acceptToken(result.token, result.expiresIn)
    } catch {
      setAuthPhase('signedOut')
      setAuthError('Le service de connexion Google ne répond pas. Recharge la page.')
    }
  }, [])

  function clearNoticeTimers() {
    for (const timer of noticeTimers.current.values()) window.clearTimeout(timer)
    noticeTimers.current.clear()
  }

  useEffect(() => clearNoticeTimers, [])

  function dismissNotice(notice: string) {
    const timer = noticeTimers.current.get(notice)
    if (timer !== undefined) {
      window.clearTimeout(timer)
      noticeTimers.current.delete(notice)
    }
    setNotices((current) => current.filter((item) => item !== notice))
  }

  function pushNotice(notice: string) {
    const previous = noticeTimers.current.get(notice)
    if (previous !== undefined) window.clearTimeout(previous)
    setNotices((current) => [notice, ...current.filter((item) => item !== notice)])
    const timer = window.setTimeout(() => dismissNotice(notice), NOTICE_MS)
    noticeTimers.current.set(notice, timer)
  }

  function finishRefresh() {
    if (refreshLeft.current === 0) return
    refreshLeft.current -= 1
    if (refreshLeft.current === 0) setRefreshing(false)
  }

  function refreshBoardNow() {
    refreshLeft.current = 2
    setRefreshing(true)
    setReserved({})
    setRefreshKey((value) => value + 1)
  }

  function refreshBoard() {
    if (showRenew) {
      void renewSession().then((next) => {
        if (next) refreshBoardNow()
      })
      return
    }
    refreshBoardNow()
  }

  function requestSignOut() {
    const confirmed = window.confirm('Se déconnecter ?')
    if (confirmed) signOut()
  }

  function holdSession() {
    setSessionBlocked(true)
  }

  function acceptToken(nextToken: string, expiresIn: number) {
    const issuedAt = Date.now()
    storeToken(nextToken, expiresIn, issuedAt)
    setToken(nextToken)
    setExpiresAt(issuedAt + expiresIn * 1000)
    setSessionBlocked(false)
    setRenewError(null)
    setAuthPhase('ready')
  }

  async function renewSession(): Promise<string | null> {
    if (renewingRef.current) return null
    renewingRef.current = true
    setRenewing(true)
    setRenewError(null)
    try {
      await loadGis()
      initAuth(clientId)
      const result = await requestToken('')
      if (!result.ok) {
        if (result.error === 'access_denied') loseSession('L’accès à l’agenda a été refusé.')
        else if (result.error !== 'popup_closed') setRenewError('La connexion Google a échoué. Réessaie.')
        return null
      }
      acceptToken(result.token, result.expiresIn)
      return result.token
    } catch {
      setRenewError('Le service de connexion Google ne répond pas. Réessaie.')
      return null
    } finally {
      renewingRef.current = false
      setRenewing(false)
    }
  }

  async function ensureToken(): Promise<string | null> {
    if (!token) return null
    if (!showRenew) return token
    return renewSession()
  }

  function loseSession(message: string) {
    clearStoredToken()
    setToken(null)
    setExpiresAt(null)
    setBookerName(null)
    setSessionBlocked(false)
    setRenewError(null)
    setAuthPhase('signedOut')
    setAuthError(message)
  }

  function signOut() {
    refreshLeft.current = 0
    setRefreshing(false)
    // Forget the local token only. Revoking the Google grant ends the account session.
    clearStoredToken()
    setToken(null)
    setExpiresAt(null)
    setBookerName(null)
    setSessionBlocked(false)
    setRenewError(null)
    setAuthPhase('signedOut')
    setBusy({})
    setRoomEvents({})
    setReserved({})
    clearNoticeTimers()
    setNotices([])
    setCardErrors({})
    setNextMeeting(undefined)
    setReleasing(false)
    setReleaseError(null)
    setPreviewReleased(false)
  }

  function releaseMessage(reason: Exclude<BookResult, { ok: true }>['reason']): string {
    if (reason === 'forbidden') return 'Seul l’organisateur peut libérer cette salle.'
    if (reason === 'unauthorized') return 'La session Google a expiré. Reconnecte-toi.'
    return 'La salle n’a pas pu être libérée.'
  }

  async function release() {
    const meeting = visibleMeeting(nextMeeting ?? null, new Date())
    if (!meeting?.canRelease || releasing) return
    setReleaseError(null)
    setReleasing(true)
    const notice = `${meeting.roomName} · salle libérée.`
    const markReleased = () => {
      setNextMeeting(null)
      setReserved((current) => {
        if (!current[meeting.calendarId]) return current
        const next = { ...current }
        delete next[meeting.calendarId]
        return next
      })
      setBusy((current) => {
        const entry = current[meeting.calendarId]
        if (!entry || entry.error) return current
        return {
          ...current,
          [meeting.calendarId]: {
            busy: withoutOverlap(entry.busy, meeting.start, meeting.end),
          },
        }
      })
      pushNotice(notice)
      setRefreshKey((value) => value + 1)
    }

    if (preview) {
      setPreviewReleased(true)
      markReleased()
      setReleasing(false)
      return
    }
    const accessToken = await ensureToken()
    if (!accessToken) {
      setReleasing(false)
      return
    }

    const result = await releaseRoom(accessToken, meeting.eventId, meeting.calendarId)
    setReleasing(false)
    if (!result.ok) {
      if (result.detail) console.error(result.detail)
      if (result.reason === 'unauthorized') {
        holdSession()
        return
      }
      setReleaseError(releaseMessage(result.reason))
      return
    }
    markReleased()
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
      pushNotice(notice)
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
    const accessToken = await ensureToken()
    if (!accessToken) {
      setPendingId(null)
      return
    }

    let title = bookerName
    if (!title) {
      const fetched = await fetchBookerName(accessToken)
      if (fetched) {
        title = bookingTitle(fetched)
        storeBookerName(title)
        setBookerName(title)
      }
    }

    const result = await bookRoom(accessToken, calendarId, slot.start, slot.end, bookingTitle(title))
    setPendingId(null)
    if (!result.ok) {
      if (result.detail) console.error(result.detail)
      if (result.reason === 'unauthorized') {
        holdSession()
        return
      }
      setCardErrors((current) => ({ ...current, [calendarId]: bookMessage(result.reason) }))
      setRefreshKey((value) => value + 1)
      return
    }
    markReserved()
    setRefreshKey((value) => value + 1)
  }

  const cards = config
    ? buildCards(config, locationId, busy, roomEvents, reserved, cardErrors, pendingId, now, selected)
    : []
  const occupancy = config ? seatOccupancy(config.rooms, busy, locationId, now) : null
  const floors: FloorStat[] =
    config && occupancy?.status === 'ready'
      ? occupancy.floors
          .flatMap((floor) => {
            const label = config.locations.find((location) => location.id === floor.locationId)?.label
            return label ? [{ ...floor, label }] : []
          })
          .sort((a, b) => {
            const rank = (id: string) => config.locations.findIndex((location) => location.id === id)
            return rank(a.locationId) - rank(b.locationId)
          })
      : []
  const reservedRooms = config
    ? pickReservedRooms(
        config.rooms,
        config.locations,
        roomEvents,
        busy,
        locationId,
        now,
        selected,
        new Set(cards.map((card) => card.calendarId)),
      )
    : []
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

  const loading = onBoard && missingCount > 0 && !busyError && !pollsStopped
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
  } else if (onBoard && !loading && cards.length === 0 && !pollsStopped) {
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
              <h1>Guist'hau</h1>
              <p className="day">{formatDay(now)}</p>
            </div>
          </div>
          <div className="top-side">
            {onBoard ? (
              <button
                type="button"
                className={refreshing ? 'icon-btn refreshing' : 'icon-btn'}
                aria-label="Actualiser"
                disabled={refreshing}
                onClick={refreshBoard}
              >
                <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.75 10h-2.1A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"
                  />
                </svg>
              </button>
            ) : null}
            <time className="clock" dateTime={now.toISOString()}>
              {formatClock(now)}
            </time>
          </div>
        </div>
      </header>
      <main className="app">
        {loadError ? <p className="empty empty-warn">{loadError}</p> : null}
        {!loadError && !config ? <p className="status-line">Chargement des salles…</p> : null}
        {config && !onBoard ? (
          <LoginGate
            config={config}
            now={now}
            slots={slots}
            until={selected}
            checking={authPhase === 'checking'}
            needsConfig={!clientId && !preview}
            error={authError}
            onSignIn={() => {
              void signIn()
            }}
          />
        ) : null}
        {config && onBoard ? (
          <>
          <RoomBoard
            now={now}
            slots={slots}
            until={selected}
            onUntil={(value) => setUntilIso(value.toISOString())}
            locations={config.locations}
            locationId={locationId}
            onLocation={setLocationId}
            cards={cards}
            reservedRooms={reservedRooms}
            loading={loading}
            message={message}
            messageTone={messageTone}
            notices={notices}
            onDismissNotice={dismissNotice}
          previewNote={preview ? PREVIEW_NOTE : null}
          meeting={visibleMeeting(nextMeeting ?? null, now)}
          meetingKnown={nextMeeting !== undefined || pollsStopped}
          releasing={releasing}
          releaseError={releaseError}
          onRelease={() => {
            void release()
          }}
          onReserve={(id) => {
            void reserve(id)
          }}
          sessionRenew={
            showRenew
              ? {
                  blocked: pollsStopped,
                  renewing,
                  error: renewError,
                  onRenew: () => {
                    void renewSession().then((next) => {
                      if (next) refreshBoardNow()
                    })
                  },
                }
              : null
          }
          />
          {occupancy ? <OccupancyStats occupancy={occupancy} floors={floors} /> : null}
          <footer className="page-foot">
            <button type="button" className="foot-action" onClick={requestSignOut}>
              Se déconnecter
            </button>
          </footer>
          </>
        ) : null}
      </main>
    </>
  )
}

function LoginGate({
  config,
  now,
  slots,
  until,
  checking,
  needsConfig,
  error,
  onSignIn,
}: {
  config: RoomsConfig
  now: Date
  slots: Date[]
  until: Date
  checking: boolean
  needsConfig: boolean
  error: string | null
  onSignIn: () => void
}) {
  const board = fictionalBoard(config, now, until)
  return (
    <div className="login-stage">
      <div className="login-backdrop" inert aria-hidden="true">
        <RoomBoard
          now={now}
          slots={slots}
          until={until}
          onUntil={() => {}}
          locations={config.locations}
          locationId="all"
          onLocation={() => {}}
          cards={board.cards}
          reservedRooms={board.reservedRooms}
          loading={false}
          message={null}
          messageTone="neutral"
          notices={[]}
          onDismissNotice={() => {}}
          previewNote={null}
          meeting={null}
          meetingKnown
          releasing={false}
          releaseError={null}
          onRelease={() => {}}
          onReserve={() => {}}
          sessionRenew={null}
        />
      </div>
      <div className="login-scrim" />
      <div className="login-slot">
        <LoginPanel checking={checking} needsConfig={needsConfig} error={error} onSignIn={onSignIn} />
      </div>
    </div>
  )
}

function fictionalBoard(config: RoomsConfig, now: Date, until: Date) {
  const busy: Record<string, BusyEntry> = {}
  const events: Record<string, RoomEvent[]> = {}
  for (const room of config.rooms) {
    const schedule = previewSchedule(now, room)
    busy[room.calendarId] = { busy: schedule.busy }
    events[room.calendarId] = schedule.events
  }
  const cards = buildCards(config, 'all', busy, events, {}, {}, null, now, until)
  const reservedRooms = pickReservedRooms(
    config.rooms,
    config.locations,
    events,
    busy,
    'all',
    now,
    until,
    new Set(cards.map((card) => card.calendarId)),
  )
  return { cards, reservedRooms }
}

function buildCards(
  config: RoomsConfig,
  locationId: string,
  busy: Record<string, BusyEntry>,
  roomEvents: Record<string, RoomEvent[]>,
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
      roomEvents[room.calendarId] ?? [],
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
  events: RoomEvent[],
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
    summary: status.kind === 'soon' ? currentMeetingSummary(now, events) : undefined,
    canBook: bookingWindow(now, until, status) !== null,
    pending: pendingId === room.calendarId,
    error: cardErrors[room.calendarId],
  }
}
