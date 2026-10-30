import { availabilityBar } from '../availability.ts'
import { formatClock } from '../time.ts'

export type CardModel = {
  calendarId: string
  name: string
  locationLabel: string
  capacity?: number
  mode: 'free' | 'soon' | 'reserved'
  freeAt?: Date
  summary?: string
  canBook: boolean
  pending: boolean
  error?: string
}

type RoomCardProps = {
  card: CardModel
  now: Date
  until: Date
  onReserve: (calendarId: string) => void
}

function statusLabel(card: CardModel): string {
  if (card.mode === 'reserved') return 'Réservé'
  if (card.mode === 'soon' && card.freeAt) return `Libre à ${formatClock(card.freeAt)}`
  return 'Libre'
}

function barLabel(card: CardModel): string {
  if (card.mode === 'reserved') return 'Salle réservée sur ce créneau'
  if (card.mode === 'soon' && card.freeAt) {
    const untilFree = `Occupée jusqu’à ${formatClock(card.freeAt)}, puis libre`
    return card.summary ? `${card.summary}. ${untilFree}` : untilFree
  }
  return 'Libre sur tout le créneau'
}

export function RoomCard({ card, now, until, onReserve }: RoomCardProps) {
  const busyRatio =
    card.mode === 'reserved'
      ? 1
      : availabilityBar(
          now,
          until,
          card.mode === 'soon' && card.freeAt
            ? { kind: 'soon', freeAt: card.freeAt }
            : { kind: 'free' },
        ).busyRatio

  const meta = [
    card.capacity ? `${card.capacity} pers.` : null,
    card.locationLabel,
  ]
    .filter(Boolean)
    .join(' · ')

  const titleId = `room-${card.calendarId.replace(/[^a-z0-9]+/gi, '-')}`

  return (
    <li>
      <article className="room-card" aria-labelledby={titleId}>
        <div className="card-head">
          <div className="card-title">
            <h2 id={titleId} className="room-name">
              {card.name}
            </h2>
            {card.mode === 'soon' && card.summary ? <p className="card-summary">{card.summary}</p> : null}
          </div>
          <p className={`status status-${card.mode}`}>
            <span className={`dot dot-${card.mode}`} aria-hidden="true" />
            {statusLabel(card)}
          </p>
          {card.mode === 'reserved' ? (
            <button type="button" className="reserve reserve-done" disabled>
              Réservé
            </button>
          ) : card.canBook ? (
            <button
              type="button"
              className="reserve"
              disabled={card.pending}
              aria-busy={card.pending}
              onClick={() => onReserve(card.calendarId)}
            >
              {card.pending ? 'Réservation…' : 'Réserver'}
            </button>
          ) : null}
        </div>
        <div>
          <div className="bar" role="img" aria-label={barLabel(card)}>
            <span className="bar-busy" style={{ width: `${busyRatio * 100}%` }} />
          </div>
          <div className="bar-scale">
            <span>Maintenant</span>
            <span>{formatClock(until)}</span>
          </div>
        </div>
        {meta ? <p className="meta">{meta}</p> : null}
        {card.error ? <p className="card-error">{card.error}</p> : null}
      </article>
    </li>
  )
}
