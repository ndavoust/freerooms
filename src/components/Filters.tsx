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
      <label className="field">
        <span>Jusque</span>
        <select
          value={until.toISOString()}
          onChange={(event) => {
            const next = slots.find((slot) => slot.toISOString() === event.target.value)
            if (next) onUntil(next)
          }}
        >
          {slots.map((slot) => (
            <option key={slot.toISOString()} value={slot.toISOString()}>
              {formatClock(slot)}
            </option>
          ))}
        </select>
      </label>
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
