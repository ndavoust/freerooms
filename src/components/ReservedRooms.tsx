import { reservationProgress, type ReservedRoom } from '../reservedRooms.ts'
import { formatClock } from '../time.ts'

type ReservedRoomsProps = {
  rooms: ReservedRoom[]
  now: Date
}

function barLabel(room: ReservedRoom): string {
  return `${room.roomName}, ${room.summary}, de ${formatClock(room.start)} à ${formatClock(room.end)}`
}

export function ReservedRooms({ rooms, now }: ReservedRoomsProps) {
  if (rooms.length === 0) return null

  return (
    <ul className="room-list">
        {rooms.map((room) => {
          const titleId = `reserved-${room.calendarId.replace(/[^a-z0-9]+/gi, '-')}`
          const { elapsedRatio } = reservationProgress(now, room.start, room.end)
          return (
            <li key={room.calendarId}>
              <article className="room-card" aria-labelledby={titleId}>
                <div className="reserved-head">
                  <h3 id={titleId} className="room-name">
                    {room.roomName}
                  </h3>
                  <p className="reserved-summary">{room.summary}</p>
                </div>
                <div>
                  <div className="reserved-bar" role="img" aria-label={barLabel(room)}>
                    <span className="reserved-bar-past" style={{ width: `${elapsedRatio * 100}%` }} />
                  </div>
                  <div className="bar-scale">
                    <span>{formatClock(room.start)}</span>
                    <span>{formatClock(room.end)}</span>
                  </div>
                </div>
                {room.locationLabel ? <p className="meta">{room.locationLabel}</p> : null}
              </article>
            </li>
          )
        })}
      </ul>
  )
}
