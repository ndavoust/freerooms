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
      <label className="field">
        <span>Lieu</span>
        <select value={locationId} onChange={(event) => onLocation(event.target.value)}>
          <option value="all">Tous les lieux</option>
          {locations.map((location) => (
            <option key={location.id} value={location.id}>
              {location.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
