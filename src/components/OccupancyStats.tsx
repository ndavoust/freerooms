import { formatOccupancyRate, occupancyCaption, type SeatOccupancy } from '../occupancy.ts'

type OccupancyStatsProps = {
  occupancy: SeatOccupancy
}

export function OccupancyStats({ occupancy }: OccupancyStatsProps) {
  if (occupancy.status === 'empty') return null

  return (
    <section className="stats" aria-labelledby="stats-title">
      <h2 id="stats-title" className="section-title">
        Stats
      </h2>
      {occupancy.status === 'pending' ? <p className="status-line">Lecture des agendas…</p> : null}
      {occupancy.status === 'ready' ? (
        <div className="stats-card">
          <p className="stats-rate">{formatOccupancyRate(occupancy.rate)}</p>
          <p className="stats-label">Taux d’occupation</p>
          <div className="reserved-bar" aria-hidden="true">
            <span className="reserved-bar-past" style={{ width: `${occupancy.rate * 100}%` }} />
          </div>
          <p className="stats-detail">{occupancyCaption(occupancy.occupiedSeats, occupancy.totalSeats)}</p>
        </div>
      ) : null}
    </section>
  )
}
