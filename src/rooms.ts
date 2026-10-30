export type Location = {
  id: string
  label: string
}

export type Room = {
  name: string
  calendarId: string
  locationId: string
  capacity?: number
}

export type RoomsConfig = {
  generatedAt?: string
  locations: Location[]
  rooms: Room[]
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`)
  }
  return value.trim()
}

export function parseRoomsConfig(value: unknown): RoomsConfig {
  if (!value || typeof value !== 'object') {
    throw new Error('rooms.json must be an object')
  }
  const record = value as Record<string, unknown>
  if (!Array.isArray(record.locations) || !Array.isArray(record.rooms)) {
    throw new Error('rooms.json needs locations and rooms arrays')
  }

  const locations = record.locations.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`locations[${index}] must be an object`)
    }
    const location = entry as Record<string, unknown>
    return {
      id: requiredString(location.id, `locations[${index}].id`),
      label: requiredString(location.label, `locations[${index}].label`),
    }
  })

  const rooms = record.rooms.map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`rooms[${index}] must be an object`)
    }
    const room = entry as Record<string, unknown>
    const capacity = typeof room.capacity === 'number' && room.capacity > 0 ? room.capacity : undefined
    return {
      name: requiredString(room.name, `rooms[${index}].name`),
      calendarId: requiredString(room.calendarId, `rooms[${index}].calendarId`),
      locationId: requiredString(room.locationId, `rooms[${index}].locationId`),
      capacity,
    }
  })

  return {
    generatedAt: typeof record.generatedAt === 'string' ? record.generatedAt : undefined,
    locations,
    rooms,
  }
}

export async function loadRooms(): Promise<RoomsConfig> {
  const response = await fetch(`${import.meta.env.BASE_URL}rooms.json`)
  if (!response.ok) {
    throw new Error(`rooms.json responded ${response.status}`)
  }
  return parseRoomsConfig(await response.json())
}
