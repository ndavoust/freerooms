import { describe, expect, it } from 'vitest'
import { formatOccupancyRate, occupancyCaption, seatOccupancy } from './occupancy.ts'
import type { Room } from './rooms.ts'

const now = new Date('2026-10-30T14:00:00Z')

function room(name: string, capacity: number | undefined, locationId = 'floor-1'): Room {
  return { name, calendarId: name, locationId, capacity }
}

describe('seatOccupancy', () => {
  it('weights a room by its seats', () => {
    const rooms = [room('Biarritz', 6), room('Paris', 45)]
    const result = seatOccupancy(
      rooms,
      {
        Biarritz: { busy: [{ start: new Date('2026-10-30T13:00:00Z'), end: new Date('2026-10-30T15:00:00Z') }] },
        Paris: { busy: [] },
      },
      'all',
      now,
    )
    expect(result).toEqual({ status: 'ready', occupiedSeats: 6, totalSeats: 51, rate: 6 / 51, floors: [] })
  })

  it('ignores a booking that has not started or has already ended', () => {
    const rooms = [room('Lyon', 10)]
    const later = seatOccupancy(
      rooms,
      { Lyon: { busy: [{ start: new Date('2026-10-30T14:06:00Z'), end: new Date('2026-10-30T15:00:00Z') }] } },
      'all',
      now,
    )
    const earlier = seatOccupancy(
      rooms,
      { Lyon: { busy: [{ start: new Date('2026-10-30T12:00:00Z'), end: new Date('2026-10-30T14:00:00Z') }] } },
      'all',
      now,
    )
    expect(later).toMatchObject({ occupiedSeats: 0, totalSeats: 10 })
    expect(earlier).toMatchObject({ occupiedSeats: 0, totalSeats: 10 })
  })

  it('waits until every counted room has an answer', () => {
    const rooms = [room('Biarritz', 6), room('Paris', 45)]
    expect(
      seatOccupancy(rooms, { Biarritz: { busy: [] } }, 'all', now),
    ).toEqual({ status: 'pending' })
  })

  it('skips rooms without a capacity and calendars that failed', () => {
    const rooms = [room('Inconnue', undefined), room('Cassée', 4), room('Bordeaux', 8)]
    const result = seatOccupancy(
      rooms,
      {
        Cassée: { busy: [], error: 'unavailable' },
        Bordeaux: { busy: [{ start: new Date('2026-10-30T13:00:00Z'), end: new Date('2026-10-30T16:00:00Z') }] },
      },
      'all',
      now,
    )
    expect(result).toEqual({ status: 'ready', occupiedSeats: 8, totalSeats: 8, rate: 1, floors: [] })
  })

  it('limits the rate to the selected location', () => {
    const rooms = [room('Biarritz', 6, 'floor-2'), room('Paris', 45, 'floor-1')]
    const result = seatOccupancy(
      rooms,
      {
        Biarritz: { busy: [{ start: new Date('2026-10-30T13:00:00Z'), end: new Date('2026-10-30T15:00:00Z') }] },
        Paris: { busy: [] },
      },
      'floor-2',
      now,
    )
    expect(result).toMatchObject({ occupiedSeats: 6, totalSeats: 6 })
  })

  it('breaks the rate down by floor when every location is in scope', () => {
    const rooms = [room('Paris', 45, 'floor-1'), room('Lyon', 10, 'floor-1'), room('Biarritz', 6, 'floor-2')]
    const result = seatOccupancy(
      rooms,
      {
        Paris: { busy: [] },
        Lyon: { busy: [] },
        Biarritz: { busy: [{ start: new Date('2026-10-30T13:00:00Z'), end: new Date('2026-10-30T15:00:00Z') }] },
      },
      'all',
      now,
    )
    expect(result).toEqual({
      status: 'ready',
      occupiedSeats: 6,
      totalSeats: 61,
      rate: 6 / 61,
      floors: [
        { locationId: 'floor-1', occupiedSeats: 0, totalSeats: 55, rate: 0 },
        { locationId: 'floor-2', occupiedSeats: 6, totalSeats: 6, rate: 1 },
      ],
    })
  })

  it('hides the floor breakdown when a single floor is selected', () => {
    const rooms = [room('Paris', 45, 'floor-1'), room('Biarritz', 6, 'floor-2')]
    const result = seatOccupancy(
      rooms,
      {
        Paris: { busy: [] },
        Biarritz: { busy: [{ start: new Date('2026-10-30T13:00:00Z'), end: new Date('2026-10-30T15:00:00Z') }] },
      },
      'floor-1',
      now,
    )
    expect(result).toMatchObject({ occupiedSeats: 0, totalSeats: 45, floors: [] })
  })

  it('is empty when nothing can be counted', () => {
    expect(seatOccupancy([room('Cassée', 4)], { Cassée: { busy: [], error: 'unavailable' } }, 'all', now)).toEqual({
      status: 'empty',
    })
  })
})

describe('occupancy copy', () => {
  it('rounds the rate and keeps French plurals', () => {
    expect(formatOccupancyRate(6 / 51)).toBe('12\u00a0%')
    expect(occupancyCaption(0, 116)).toBe('0 places occupées sur 116')
    expect(occupancyCaption(1, 6)).toBe('1 place occupée sur 6')
    expect(occupancyCaption(55, 116)).toBe('55 places occupées sur 116')
  })
})
