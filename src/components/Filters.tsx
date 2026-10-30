import type { Location } from '../rooms.ts'
import { formatClock } from '../time.ts'

type FiltersProps = {
  slots: Date[]
  until: Date
  onUntil: (value: Date) => void
  locations: Location[]
  locationId: string
  onLocation: (id: string) => void
}

export function Filters({ slots, until, onUntil, locations, locationId, onLocation }: FiltersProps) {
  return (
    <div className="filters">
      <div className="field field-times">
        <span id="until-label">Jusque</span>
        <div className="pills" role="radiogroup" aria-labelledby="until-label">
          {slots.map((slot) => {
            const selected = slot.getTime() === until.getTime()
            return (
              <button
                key={slot.toISOString()}
                type="button"
                role="radio"
                aria-checked={selected}
                className={selected ? 'pill pill-on' : 'pill'}
                onClick={() => onUntil(slot)}
              >
                {formatClock(slot)}
              </button>
            )
          })}
        </div>
      </div>
      <div className="field field-locations">
        <span id="location-label">Lieu</span>
        <div className="pills" role="radiogroup" aria-labelledby="location-label">
          <button
            type="button"
            role="radio"
            aria-checked={locationId === 'all'}
            className={locationId === 'all' ? 'pill pill-on' : 'pill'}
            onClick={() => onLocation('all')}
          >
            Tous les lieux
          </button>
          {locations.map((location) => {
            const selected = location.id === locationId
            return (
              <button
                key={location.id}
                type="button"
                role="radio"
                aria-checked={selected}
                className={selected ? 'pill pill-on' : 'pill'}
                onClick={() => onLocation(location.id)}
              >
                {location.label}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
