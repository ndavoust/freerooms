import type { BusyInterval } from './availability.ts'
import type { Room } from './rooms.ts'

type BusyLookup = Record<string, { busy: BusyInterval[]; error?: string } | undefined>

export type SeatOccupancy =
  | { status: 'pending' }
  | { status: 'empty' }
  | { status: 'ready'; occupiedSeats: number; totalSeats: number; rate: number }

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
    if (entry.busy.some((interval) => interval.start.getTime() <= time && interval.end.getTime() > time)) {
      occupiedSeats += seats
    }
  }

  if (pending) return { status: 'pending' }
  if (totalSeats === 0) return { status: 'empty' }
  return { status: 'ready', occupiedSeats, totalSeats, rate: occupiedSeats / totalSeats }
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
