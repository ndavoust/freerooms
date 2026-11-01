import { formatOccupancyRate, occupancyCaption, type FloorOccupancy, type SeatOccupancy } from '../occupancy.ts'
import { BoardSection } from './BoardSection.tsx'

export type FloorStat = FloorOccupancy & { label: string }

type OccupancyStatsProps = {
  occupancy: SeatOccupancy
  floors: FloorStat[]
}

export function OccupancyStats({ occupancy, floors }: OccupancyStatsProps) {
  if (occupancy.status === 'empty') return null

  return (
    <BoardSection title="Stats" titleId="stats-title" collapsible>
      {occupancy.status === 'pending' ? <p className="status-line">Lecture des agendas…</p> : null}
      {occupancy.status === 'ready' ? (
        <div className="stats-card">
          <p className="stats-rate">{formatOccupancyRate(occupancy.rate)}</p>
          <p className="stats-label">Taux d’occupation</p>
          <div className="reserved-bar" aria-hidden="true">
            <span className="reserved-bar-past" style={{ width: `${occupancy.rate * 100}%` }} />
          </div>
          <p className="stats-detail">{occupancyCaption(occupancy.occupiedSeats, occupancy.totalSeats)}</p>
          {floors.length > 0 ? (
            <ul className="stats-floors">
              {floors.map((floor) => (
                <li key={floor.locationId} className="stats-floor">
                  <div className="stats-floor-head">
                    <span>{floor.label}</span>
                    <span>{formatOccupancyRate(floor.rate)}</span>
                  </div>
                  <div className="reserved-bar" aria-hidden="true">
                    <span className="reserved-bar-past" style={{ width: `${floor.rate * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </BoardSection>
  )
}
