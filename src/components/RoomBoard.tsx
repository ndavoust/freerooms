import type { Location } from '../rooms.ts'
import { Filters } from './Filters.tsx'
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
  loading: boolean
  message: string | null
  messageTone: 'neutral' | 'warn'
  notices: string[]
  previewNote: string | null
  onReserve: (calendarId: string) => void
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
  loading,
  message,
  messageTone,
  notices,
  previewNote,
  onReserve,
}: RoomBoardProps) {
  return (
    <>
      <Filters
        slots={slots}
        until={until}
        onUntil={onUntil}
        locations={locations}
        locationId={locationId}
        onLocation={onLocation}
      />
      {previewNote ? (
        <div className="banner banner-preview" role="status">
          <p>{previewNote}</p>
        </div>
      ) : null}
      {notices.length > 0 ? (
        <div className="banner" role="status">
          {notices.map((notice) => (
            <p key={notice}>{notice}</p>
          ))}
        </div>
      ) : null}
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
    </>
  )
}
