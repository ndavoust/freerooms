import { describe, expect, it } from 'vitest'
import { meetingBar, pickNextRoomMeeting, visibleMeeting, type PrimaryEvent } from './nextMeeting.ts'
import type { Location, Room } from './rooms.ts'

const at = (iso: string) => new Date(iso)
const now = at('2026-10-30T10:00:00Z')

const rooms: Room[] = [
  {
    name: 'Biarritz',
    calendarId: 'biarritz@resource.calendar.google.com',
    locationId: 'floor-2',
  },
  {
    name: 'Bordeaux',
    calendarId: 'bordeaux@resource.calendar.google.com',
    locationId: 'floor-1',
  },
]

const locations: Location[] = [
  { id: 'floor-2', label: 'Guist’hau 2e étage' },
  { id: 'floor-1', label: 'Guist’hau 1er étage' },
]

function event(partial: PrimaryEvent): PrimaryEvent {
  return {
    id: 'evt-1',
    status: 'confirmed',
    summary: 'Point d’équipe',
    organizer: { self: true },
    start: '2026-10-30T10:08:00Z',
    end: '2026-10-30T10:40:00Z',
    attendees: [
      { email: 'me@example.com', self: true, responseStatus: 'accepted' },
      { email: 'biarritz@resource.calendar.google.com', resource: true, responseStatus: 'accepted' },
    ],
    ...partial,
  }
}

describe('pickNextRoomMeeting', () => {
  it('keeps a meeting that starts within 15 minutes', () => {
    const meeting = pickNextRoomMeeting([event({})], rooms, locations, now)
    expect(meeting?.roomName).toBe('Biarritz')
    expect(meeting?.locationLabel).toBe('Guist’hau 2e étage')
    expect(meeting?.summary).toBe('Point d’équipe')
    expect(meeting?.calendarId).toBe('biarritz@resource.calendar.google.com')
    expect(meeting?.canRelease).toBe(true)
  })

  it('keeps a meeting organized by someone else, without release', () => {
    const meeting = pickNextRoomMeeting([event({ organizer: { self: false } })], rooms, locations, now)
    expect(meeting?.roomName).toBe('Biarritz')
    expect(meeting?.canRelease).toBe(false)
  })

  it('prefers a meeting that started in the last 15 minutes', () => {
    const meeting = pickNextRoomMeeting(
      [
        event({}),
        event({
          summary: 'En cours',
          start: '2026-10-30T09:52:00Z',
          end: '2026-10-30T10:30:00Z',
          attendees: [
            { email: 'me@example.com', self: true, responseStatus: 'accepted' },
            { email: 'bordeaux@resource.calendar.google.com', resource: true, responseStatus: 'accepted' },
          ],
        }),
      ],
      rooms,
      locations,
      now,
    )
    expect(meeting?.roomName).toBe('Bordeaux')
    expect(meeting?.summary).toBe('En cours')
  })

  it('ignores a meeting that started more than 15 minutes ago', () => {
    const meeting = pickNextRoomMeeting(
      [event({ start: '2026-10-30T09:30:00Z', end: '2026-10-30T11:00:00Z' })],
      rooms,
      locations,
      now,
    )
    expect(meeting).toBeNull()
  })

  it('ignores a meeting that starts in more than 15 minutes', () => {
    const meeting = pickNextRoomMeeting(
      [event({ start: '2026-10-30T10:20:00Z', end: '2026-10-30T11:00:00Z' })],
      rooms,
      locations,
      now,
    )
    expect(meeting).toBeNull()
  })

  it('ignores a declined meeting and a room that is not in the list', () => {
    expect(
      pickNextRoomMeeting(
        [event({ attendees: [{ email: 'me@example.com', self: true, responseStatus: 'declined' }] })],
        rooms,
        locations,
        now,
      ),
    ).toBeNull()
    expect(
      pickNextRoomMeeting(
        [
          event({
            attendees: [
              { email: 'me@example.com', self: true, responseStatus: 'accepted' },
              { email: 'unknown@resource.calendar.google.com', resource: true, responseStatus: 'accepted' },
            ],
          }),
        ],
        rooms,
        locations,
        now,
      ),
    ).toBeNull()
  })
})

describe('meetingBar', () => {
  it('paints the wait in the upcoming segment and the meeting as remaining', () => {
    const start = at('2026-10-30T10:08:00Z')
    const end = at('2026-10-30T10:38:00Z')
    expect(meetingBar(now, start, end)).toEqual({
      upcoming: 8 * 60 * 1000,
      elapsed: 0,
      remaining: 30 * 60 * 1000,
    })
  })

  it('paints elapsed time and what is left once the meeting has started', () => {
    const start = at('2026-10-30T09:54:00Z')
    const end = at('2026-10-30T10:24:00Z')
    expect(meetingBar(now, start, end)).toEqual({
      upcoming: 0,
      elapsed: 6 * 60 * 1000,
      remaining: 24 * 60 * 1000,
    })
  })
})

describe('visibleMeeting', () => {
  it('hides a meeting that has left the 15 minute window', () => {
    const meeting = {
      eventId: 'evt-1',
      calendarId: 'biarritz@resource.calendar.google.com',
      canRelease: true,
      roomName: 'Biarritz',
      locationLabel: 'Guist’hau 2e étage',
      summary: 'Point',
      start: at('2026-10-30T09:40:00Z'),
      end: at('2026-10-30T10:30:00Z'),
    }
    expect(visibleMeeting(meeting, now)).toBeNull()
  })
})
