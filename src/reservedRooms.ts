import { classifyRoom, type BusyInterval } from './availability.ts'
import type { Location, Room } from './rooms.ts'

/** How far back to read a booking so its real start is not clipped to "now". */
export const RESERVATION_LOOKBACK_MS = 12 * 60 * 60 * 1000

export const OCCUPIED_LABEL = 'Occupé'

export type RoomEvent = {
  summary?: string
  start: Date
  end: Date
}

export type ReservedRoom = {
  calendarId: string
  roomName: string
  locationLabel: string
  summary: string
  start: Date
  end: Date
}

type BusyLookup = Record<string, { busy: BusyInterval[]; error?: string } | undefined>

export function reservationProgress(now: Date, start: Date, end: Date): { elapsedRatio: number } {
  const total = end.getTime() - start.getTime()
  if (total <= 0) return { elapsedRatio: 0 }
  const elapsed = Math.min(Math.max(now.getTime() - start.getTime(), 0), total)
  return { elapsedRatio: elapsed / total }
}

/**
 * Rooms hidden from the free list, with the meeting that blocks them.
 * An in-progress booking wins over a later one. Event titles win over bare busy blocks.
 */
export function pickReservedRooms(
  rooms: Room[],
  locations: Location[],
  eventsByCalendar: Record<string, RoomEvent[] | undefined>,
  busyByCalendar: BusyLookup,
  locationId: string,
  now: Date,
  until: Date,
  shownIds: ReadonlySet<string>,
): ReservedRoom[] {
  const labels = new Map(locations.map((location) => [location.id, location.label]))
  const reserved: ReservedRoom[] = []

  for (const room of rooms) {
    if (locationId !== 'all' && room.locationId !== locationId) continue
    if (shownIds.has(room.calendarId)) continue
    const entry = busyByCalendar[room.calendarId]
    if (!entry || entry.error) continue
    if (classifyRoom(now, until, entry.busy).kind !== 'hidden') continue

    const booking = blockingBooking(now, until, eventsByCalendar[room.calendarId] ?? [], entry.busy)
    if (!booking) continue
    const summary = booking.summary?.trim() || OCCUPIED_LABEL
    reserved.push({
      calendarId: room.calendarId,
      roomName: room.name,
      locationLabel: labels.get(room.locationId) ?? '',
      summary,
      start: booking.start,
      end: booking.end,
    })
  }

  reserved.sort(
    (a, b) => a.start.getTime() - b.start.getTime() || a.roomName.localeCompare(b.roomName, 'fr'),
  )
  return reserved
}

function blockingBooking(
  now: Date,
  until: Date,
  events: RoomEvent[],
  busy: BusyInterval[],
): { start: Date; end: Date; summary?: string } | null {
  const eventNow = pickCurrent(now, events)
  if (eventNow) return eventNow
  const busyNow = pickCurrent(now, busy)
  if (busyNow) return busyNow
  const eventNext = pickUpcoming(now, until, events)
  if (eventNext) return eventNext
  return pickUpcoming(now, until, busy)
}

/** Title of the meeting in progress, when the calendar event has one. */
export function currentMeetingSummary(now: Date, events: RoomEvent[]): string | undefined {
  const time = now.getTime()
  const current = events
    .filter((event) => event.start.getTime() <= time && event.end.getTime() > time)
    .sort((a, b) => b.start.getTime() - a.start.getTime())
  for (const event of current) {
    const summary = event.summary?.trim()
    if (summary) return summary
  }
  return undefined
}

function pickCurrent<T extends { start: Date; end: Date }>(now: Date, intervals: T[]): T | null {
  const time = now.getTime()
  const current = intervals.filter(
    (interval) => interval.start.getTime() <= time && interval.end.getTime() > time,
  )
  current.sort((a, b) => b.start.getTime() - a.start.getTime())
  return current[0] ?? null
}

function pickUpcoming<T extends { start: Date; end: Date }>(now: Date, until: Date, intervals: T[]): T | null {
  const time = now.getTime()
  const untilMs = until.getTime()
  const upcoming = intervals.filter((interval) => {
    const start = interval.start.getTime()
    return start > time && start < untilMs && interval.end.getTime() > start
  })
  upcoming.sort((a, b) => a.start.getTime() - b.start.getTime())
  return upcoming[0] ?? null
}
