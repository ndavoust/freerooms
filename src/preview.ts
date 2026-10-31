import type { BusyInterval } from './availability.ts'
import type { RoomMeeting } from './nextMeeting.ts'
import type { RoomEvent } from './reservedRooms.ts'
import type { Room, RoomsConfig } from './rooms.ts'

const MINUTE_MS = 60 * 1000

/** Long enough that every “Jusque” slot still falls inside the booking. */
const PREVIEW_END_MIN = 180

const PREVIEW_BOOKINGS: Record<string, { summary: string; startMin: number; endMin?: number }> = {
  Paris: { summary: 'Comité produit', startMin: -60 },
  Lyon: { summary: 'Revue design', startMin: -12 },
  Toulouse: { summary: 'Atelier marque', startMin: 6 },
  Deauville: { summary: 'Point quotidien', startMin: -20, endMin: 8 },
}

/** Deterministic occupancy for the signed-out backdrop and the local ?preview=1 board. */
export function previewSchedule(now: Date, room: Room): { busy: BusyInterval[]; events: RoomEvent[] } {
  const booking = PREVIEW_BOOKINGS[room.name]
  if (!booking) return { busy: [], events: [] }
  const start = new Date(now.getTime() + booking.startMin * MINUTE_MS)
  const end = new Date(now.getTime() + (booking.endMin ?? PREVIEW_END_MIN) * MINUTE_MS)
  return {
    busy: [{ start, end }],
    events: [{ summary: booking.summary, start, end }],
  }
}

/** A meeting starting soon, so the preview shows the orange wait and the light-green remainder. */
export function previewNextMeeting(now: Date, config: RoomsConfig): RoomMeeting | null {
  const room = config.rooms[0]
  if (!room) return null
  const minute = 60 * 1000
  const location = config.locations.find((item) => item.id === room.locationId)
  return {
    eventId: 'preview',
    calendarId: room.calendarId,
    canRelease: true,
    roomName: room.name,
    locationLabel: location?.label ?? '',
    summary: 'Point d’équipe',
    start: new Date(now.getTime() + 8 * minute),
    end: new Date(now.getTime() + 38 * minute),
  }
}
