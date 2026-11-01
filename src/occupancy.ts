import type { BusyInterval } from './availability.ts'
import type { Room } from './rooms.ts'

type BusyLookup = Record<string, { busy: BusyInterval[]; error?: string } | undefined>

export type FloorOccupancy = {
  locationId: string
  occupiedSeats: number
  totalSeats: number
  rate: number
}

export type SeatOccupancy =
  | { status: 'pending' }
  | { status: 'empty' }
  | { status: 'ready'; occupiedSeats: number; totalSeats: number; rate: number; floors: FloorOccupancy[] }

export function seatOccupancy(
  rooms: Room[],
  busyByCalendar: BusyLookup,
  locationId: string,
  now: Date,
): SeatOccupancy {
  const time = now.getTime()
  let occupiedSeats = 0
  let totalSeats = 0
  let pending = false
  const byLocation = new Map<string, { occupiedSeats: number; totalSeats: number }>()

  for (const room of rooms) {
    if (locationId !== 'all' && room.locationId !== locationId) continue
    const seats = room.capacity
    if (seats === undefined || seats <= 0) continue
    const entry = busyByCalendar[room.calendarId]
    if (!entry) {
      pending = true
      continue
    }
    if (entry.error) continue
    totalSeats += seats
    const occupied = entry.busy.some(
      (interval) => interval.start.getTime() <= time && interval.end.getTime() > time,
    )
    if (occupied) occupiedSeats += seats
    const tally = byLocation.get(room.locationId) ?? { occupiedSeats: 0, totalSeats: 0 }
    tally.totalSeats += seats
    if (occupied) tally.occupiedSeats += seats
    byLocation.set(room.locationId, tally)
  }

  if (pending) return { status: 'pending' }
  if (totalSeats === 0) return { status: 'empty' }
  const floors =
    locationId === 'all' && byLocation.size > 1
      ? [...byLocation.entries()].map(([id, tally]) => ({
          locationId: id,
          occupiedSeats: tally.occupiedSeats,
          totalSeats: tally.totalSeats,
          rate: tally.occupiedSeats / tally.totalSeats,
        }))
      : []
  return { status: 'ready', occupiedSeats, totalSeats, rate: occupiedSeats / totalSeats, floors }
}

export function formatOccupancyRate(rate: number): string {
  return `${Math.round(rate * 100)}\u00a0%`
}

export function occupancyCaption(occupiedSeats: number, totalSeats: number): string {
  const occupied = countLabel(occupiedSeats, 'place occupée', 'places occupées')
  return `${occupied} sur ${totalSeats}`
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}
