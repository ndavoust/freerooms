import type { Location, Room } from './rooms.ts'

export const MEETING_WINDOW_MS = 15 * 60 * 1000

export type PrimaryEvent = {
  id?: string
  status?: string
  summary?: string
  transparency?: string
  start?: string
  end?: string
  organizer?: { self?: boolean }
  attendees?: {
    email?: string
    resource?: boolean
    responseStatus?: string
    self?: boolean
  }[]
}

export type RoomMeeting = {
  eventId: string
  calendarId: string
  canRelease: boolean
  roomName: string
  locationLabel: string
  summary: string
  start: Date
  end: Date
}

export type MeetingBar = {
  upcoming: number
  elapsed: number
  remaining: number
}

export function meetingBar(now: Date, start: Date, end: Date): MeetingBar {
  const time = now.getTime()
  const startMs = start.getTime()
  const endMs = end.getTime()
  return {
    upcoming: Math.max(0, startMs - time),
    elapsed: Math.max(0, Math.min(time, endMs) - startMs),
    remaining: Math.max(0, endMs - Math.max(time, startMs)),
  }
}

export function visibleMeeting(meeting: RoomMeeting | null, now: Date): RoomMeeting | null {
  if (!meeting) return null
  const time = now.getTime()
  const start = meeting.start.getTime()
  if (meeting.end.getTime() <= time) return null
  if (start < time - MEETING_WINDOW_MS) return null
  if (start > time + MEETING_WINDOW_MS) return null
  return meeting
}

export function pickNextRoomMeeting(
  events: PrimaryEvent[],
  rooms: Room[],
  locations: Location[],
  now: Date,
): RoomMeeting | null {
  const roomsById = new Map(rooms.map((room) => [room.calendarId.toLowerCase(), room]))
  const labels = new Map(locations.map((location) => [location.id, location.label]))
  const matches: RoomMeeting[] = []

  for (const event of events) {
    const meeting = toMeeting(event, roomsById, labels)
    if (meeting) matches.push(meeting)
  }

  const time = now.getTime()
  const started = matches
    .filter(
      (meeting) =>
        meeting.start.getTime() <= time &&
        meeting.start.getTime() >= time - MEETING_WINDOW_MS &&
        meeting.end.getTime() > time,
    )
    .sort((a, b) => b.start.getTime() - a.start.getTime())
  if (started[0]) return started[0]

  const upcoming = matches
    .filter(
      (meeting) => meeting.start.getTime() > time && meeting.start.getTime() <= time + MEETING_WINDOW_MS,
    )
    .sort((a, b) => a.start.getTime() - b.start.getTime())
  return upcoming[0] ?? null
}

function toMeeting(
  event: PrimaryEvent,
  roomsById: Map<string, Room>,
  labels: Map<string, string>,
): RoomMeeting | null {
  if (event.status === 'cancelled' || event.transparency === 'transparent') return null
  const self = event.attendees?.find((attendee) => attendee.self)
  if (self?.responseStatus === 'declined') return null
  if (!event.start || !event.end) return null
  const start = new Date(event.start)
  const end = new Date(event.end)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return null

  const roomAttendee = event.attendees?.find((attendee) => {
    const email = attendee.email?.toLowerCase()
    if (!email || !roomsById.has(email)) return false
    return attendee.responseStatus !== 'declined'
  })
  const room = roomAttendee?.email ? roomsById.get(roomAttendee.email.toLowerCase()) : undefined
  if (!room) return null

  const eventId = event.id ?? ''
  return {
    eventId,
    calendarId: room.calendarId,
    canRelease: eventId !== '' && event.organizer?.self === true,
    roomName: room.name,
    locationLabel: labels.get(room.locationId) ?? '',
    summary: event.summary?.trim() ?? '',
    start,
    end,
  }
}
