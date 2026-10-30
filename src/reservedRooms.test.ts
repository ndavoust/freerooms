import { describe, expect, it } from 'vitest'
import {
  currentMeetingSummary,
  OCCUPIED_LABEL,
  pickReservedRooms,
  reservationProgress,
  type RoomEvent,
} from './reservedRooms.ts'
import type { Location, Room } from './rooms.ts'
import type { BusyInterval } from './availability.ts'

const at = (iso: string) => new Date(iso)
const now = at('2026-10-30T10:00:00Z')
const until = at('2026-10-30T11:00:00Z')

const rooms: Room[] = [
  { name: 'Biarritz', calendarId: 'biarritz@resource.calendar.google.com', locationId: 'floor-2' },
  { name: 'Bordeaux', calendarId: 'bordeaux@resource.calendar.google.com', locationId: 'floor-1' },
  { name: 'Lyon', calendarId: 'lyon@resource.calendar.google.com', locationId: 'floor-1' },
]

const locations: Location[] = [
  { id: 'floor-2', label: 'Guist’hau 2e étage' },
  { id: 'floor-1', label: 'Guist’hau 1er étage' },
]

function eventsOf(start: string, end: string, summary: string): RoomEvent[] {
  return [{ summary, start: at(start), end: at(end) }]
}

function busyOf(start: string, end: string): { busy: BusyInterval[] } {
  return { busy: [{ start: at(start), end: at(end) }] }
}

describe('currentMeetingSummary', () => {
  it('uses the meeting that is in progress', () => {
    const events = eventsOf('2026-10-30T09:00:00Z', '2026-10-30T10:30:00Z', 'Point quotidien')
    expect(currentMeetingSummary(now, events)).toBe('Point quotidien')
  })

  it('prefers the meeting that started latest when two overlap', () => {
    const events = [
      ...eventsOf('2026-10-30T09:00:00Z', '2026-10-30T10:30:00Z', 'Bloc'),
      ...eventsOf('2026-10-30T09:45:00Z', '2026-10-30T10:20:00Z', 'Point quotidien'),
    ]
    expect(currentMeetingSummary(now, events)).toBe('Point quotidien')
  })

  it('ignores a later booking and a blank title', () => {
    expect(
      currentMeetingSummary(now, eventsOf('2026-10-30T10:15:00Z', '2026-10-30T11:00:00Z', 'Après')),
    ).toBeUndefined()
    expect(
      currentMeetingSummary(now, [{ summary: '   ', start: at('2026-10-30T09:00:00Z'), end: at('2026-10-30T10:30:00Z') }]),
    ).toBeUndefined()
  })
})

describe('reservationProgress', () => {
  it('measures the share of the meeting already elapsed', () => {
    const start = at('2026-10-30T09:00:00Z')
    const end = at('2026-10-30T11:00:00Z')
    expect(reservationProgress(now, start, end).elapsedRatio).toBe(0.5)
  })

  it('stays empty before the meeting and full once it is over', () => {
    const start = at('2026-10-30T10:30:00Z')
    const end = at('2026-10-30T11:00:00Z')
    expect(reservationProgress(now, start, end).elapsedRatio).toBe(0)
    expect(reservationProgress(at('2026-10-30T12:00:00Z'), start, end).elapsedRatio).toBe(1)
  })
})

describe('pickReservedRooms', () => {
  it('shows a hidden room with the in-progress meeting title and its real start', () => {
    const reserved = pickReservedRooms(
      rooms,
      locations,
      { 'biarritz@resource.calendar.google.com': eventsOf('2026-10-30T09:00:00Z', '2026-10-30T12:00:00Z', 'Comité produit') },
      { 'biarritz@resource.calendar.google.com': busyOf('2026-10-30T10:00:00Z', '2026-10-30T12:00:00Z') },
      'all',
      now,
      until,
      new Set(),
    )
    expect(reserved).toEqual([
      {
        calendarId: 'biarritz@resource.calendar.google.com',
        roomName: 'Biarritz',
        locationLabel: 'Guist’hau 2e étage',
        summary: 'Comité produit',
        start: at('2026-10-30T09:00:00Z'),
        end: at('2026-10-30T12:00:00Z'),
      },
    ])
  })

  it('prefers the meeting in progress over a later one', () => {
    const reserved = pickReservedRooms(
      rooms,
      locations,
      {
        'biarritz@resource.calendar.google.com': [
          { summary: 'Après', start: at('2026-10-30T10:30:00Z'), end: at('2026-10-30T12:00:00Z') },
          { summary: 'En cours', start: at('2026-10-30T09:30:00Z'), end: at('2026-10-30T10:40:00Z') },
        ],
      },
      { 'biarritz@resource.calendar.google.com': busyOf('2026-10-30T09:30:00Z', '2026-10-30T12:00:00Z') },
      'all',
      now,
      until,
      new Set(),
    )
    expect(reserved.map((room) => room.summary)).toEqual(['En cours'])
  })

  it('shows the next booking when the room is free now but taken before the slot', () => {
    const reserved = pickReservedRooms(
      rooms,
      locations,
      { 'bordeaux@resource.calendar.google.com': eventsOf('2026-10-30T10:20:00Z', '2026-10-30T10:50:00Z', 'Entretien') },
      { 'bordeaux@resource.calendar.google.com': busyOf('2026-10-30T10:20:00Z', '2026-10-30T10:50:00Z') },
      'all',
      now,
      until,
      new Set(),
    )
    expect(reserved.map((room) => room.summary)).toEqual(['Entretien'])
    expect(reserved[0]?.start).toEqual(at('2026-10-30T10:20:00Z'))
  })

  it('falls back to the busy block when the calendar has no title', () => {
    const reserved = pickReservedRooms(
      rooms,
      locations,
      { 'lyon@resource.calendar.google.com': [] },
      { 'lyon@resource.calendar.google.com': busyOf('2026-10-30T09:00:00Z', '2026-10-30T12:00:00Z') },
      'all',
      now,
      until,
      new Set(),
    )
    expect(reserved.map((room) => room.summary)).toEqual([OCCUPIED_LABEL])
    expect(reserved[0]?.start).toEqual(at('2026-10-30T09:00:00Z'))
  })

  it('leaves free, soon, and already listed rooms out', () => {
    const reserved = pickReservedRooms(
      rooms,
      locations,
      {
        'biarritz@resource.calendar.google.com': eventsOf('2026-10-30T09:00:00Z', '2026-10-30T12:00:00Z', 'Comité'),
        'bordeaux@resource.calendar.google.com': eventsOf('2026-10-30T09:40:00Z', '2026-10-30T10:10:00Z', 'Bientôt'),
        'lyon@resource.calendar.google.com': eventsOf('2026-10-30T12:00:00Z', '2026-10-30T13:00:00Z', 'Plus tard'),
      },
      {
        'biarritz@resource.calendar.google.com': busyOf('2026-10-30T09:00:00Z', '2026-10-30T12:00:00Z'),
        'bordeaux@resource.calendar.google.com': busyOf('2026-10-30T09:40:00Z', '2026-10-30T10:10:00Z'),
        'lyon@resource.calendar.google.com': { busy: [] },
      },
      'all',
      now,
      until,
      new Set(['biarritz@resource.calendar.google.com']),
    )
    expect(reserved).toEqual([])
  })

  it('respects the selected floor', () => {
    const reserved = pickReservedRooms(
      rooms,
      locations,
      {
        'biarritz@resource.calendar.google.com': eventsOf('2026-10-30T09:00:00Z', '2026-10-30T12:00:00Z', 'Étage 2'),
        'lyon@resource.calendar.google.com': eventsOf('2026-10-30T09:00:00Z', '2026-10-30T12:00:00Z', 'Étage 1'),
      },
      {
        'biarritz@resource.calendar.google.com': busyOf('2026-10-30T09:00:00Z', '2026-10-30T12:00:00Z'),
        'lyon@resource.calendar.google.com': busyOf('2026-10-30T09:00:00Z', '2026-10-30T12:00:00Z'),
      },
      'floor-1',
      now,
      until,
      new Set(),
    )
    expect(reserved.map((room) => room.roomName)).toEqual(['Lyon'])
  })
})
