import type { RoomMeeting } from '../nextMeeting.ts'
import type { ReservedRoom } from '../reservedRooms.ts'
import type { Location } from '../rooms.ts'
import { BoardSection } from './BoardSection.tsx'
import { Filters } from './Filters.tsx'
import { NextMeeting } from './NextMeeting.tsx'
import { ReservedRooms } from './ReservedRooms.tsx'
import { RoomCard, type CardModel } from './RoomCard.tsx'

type RoomBoardProps = {
  now: Date
  slots: Date[]
  until: Date
  onUntil: (value: Date) => void
  locations: Location[]
  locationId: string
  onLocation: (id: string) => void
  cards: CardModel[]
  reservedRooms: ReservedRoom[]
  loading: boolean
  message: string | null
  messageTone: 'neutral' | 'warn'
  notices: string[]
  onDismissNotice: (notice: string) => void
  previewNote: string | null
  meeting: RoomMeeting | null
  meetingKnown: boolean
  releasing: boolean
  releaseError: string | null
  onRelease: () => void
  onReserve: (calendarId: string) => void
  sessionRenew: SessionRenew | null
}

type SessionRenew = {
  blocked: boolean
  renewing: boolean
  error: string | null
  onRenew: () => void
}

export function RoomBoard({
  now,
  slots,
  until,
  onUntil,
  locations,
  locationId,
  onLocation,
  cards,
  reservedRooms,
  loading,
  message,
  messageTone,
  notices,
  onDismissNotice,
  previewNote,
  meeting,
  meetingKnown,
  releasing,
  releaseError,
  onRelease,
  onReserve,
  sessionRenew,
}: RoomBoardProps) {
  const status = (
    <>
      {sessionRenew ? (
        <div className="renew" role="status">
          <div>
            <p>{sessionRenew.blocked ? 'La session Google a expiré.' : 'La session Google expire bientôt.'}</p>
            {sessionRenew.error ? <p className="renew-error">{sessionRenew.error}</p> : null}
          </div>
          <button type="button" className="renew-action" onClick={sessionRenew.onRenew} disabled={sessionRenew.renewing}>
            {sessionRenew.renewing ? 'Connexion…' : 'Continuer'}
          </button>
        </div>
      ) : null}
      {previewNote ? (
        <div className="banner banner-preview" role="status">
          <p>{previewNote}</p>
        </div>
      ) : null}
      {notices.length > 0 ? (
        <div className="notices">
          {notices.map((notice) => (
            <div className="notice" key={notice} role="status">
              <p>{notice}</p>
              <button
                type="button"
                className="notice-dismiss"
                aria-label="Fermer le message"
                onClick={() => onDismissNotice(notice)}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </>
  )

  return (
    <>
      {status}
      {meetingKnown ? (
        <>
          {meeting ? (
            <BoardSection title="Prochaine réunion" titleId="next-meeting-section" collapsible={false}>
              <NextMeeting
                meeting={meeting}
                now={now}
                pending={releasing}
                error={releaseError}
                onRelease={onRelease}
              />
            </BoardSection>
          ) : null}
          <BoardSection title="Salles libres" titleId="free-rooms-section" collapsible={meeting !== null}>
            <Filters
              slots={slots}
              until={until}
              onUntil={onUntil}
              locations={locations}
              locationId={locationId}
              onLocation={onLocation}
            />
            {loading ? (
              <p className="status-line" role="status">
                Lecture des agendas…
              </p>
            ) : null}
            {message ? (
              <p className={messageTone === 'warn' ? 'empty empty-warn' : 'empty'} role="status">
                {message}
              </p>
            ) : null}
            <ul className="room-list">
              {cards.map((card) => (
                <RoomCard key={card.calendarId} card={card} now={now} until={until} onReserve={onReserve} />
              ))}
            </ul>
          </BoardSection>
          {reservedRooms.length > 0 ? (
            <BoardSection title="Salles réservées" titleId="reserved-title" collapsible>
              <ReservedRooms rooms={reservedRooms} now={now} />
            </BoardSection>
          ) : null}
        </>
      ) : (
        <p className="status-line" role="status">
          Lecture des agendas…
        </p>
      )}
    </>
  )
}
