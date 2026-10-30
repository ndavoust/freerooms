import { describe, expect, it } from 'vitest'
import { parseRoomsConfig } from './rooms.ts'

describe('parseRoomsConfig', () => {
  it('reads locations, rooms, and optional capacity', () => {
    const config = parseRoomsConfig({
      generatedAt: '2026-10-30T09:00:00.000Z',
      locations: [{ id: 'paris', label: 'Paris' }],
      rooms: [
        {
          name: 'Salle Seine',
          calendarId: 'seine@resource.calendar.google.com',
          locationId: 'paris',
          capacity: 8,
        },
        {
          name: 'Salle Marais',
          calendarId: 'marais@resource.calendar.google.com',
          locationId: 'paris',
          capacity: 0,
        },
      ],
    })

    expect(config.locations).toEqual([{ id: 'paris', label: 'Paris' }])
    expect(config.rooms[0]?.capacity).toBe(8)
    expect(config.rooms[1]?.capacity).toBeUndefined()
  })

  it('rejects a file without rooms', () => {
    expect(() => parseRoomsConfig({ locations: [] })).toThrow(/rooms/)
  })
})
