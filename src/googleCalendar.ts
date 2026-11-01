import type { BusyInterval } from './availability.ts'
import type { PrimaryEvent } from './nextMeeting.ts'
import type { RoomEvent } from './reservedRooms.ts'
import { formatParisDateTime } from './time.ts'

const FREE_BUSY_CHUNK = 50
const EVENT_SUMMARY = 'Réservé last minute'

export function bookingTitle(name: string | null | undefined): string {
  const trimmed = name?.trim() ?? ''
  if (!trimmed) return EVENT_SUMMARY
  const at = trimmed.indexOf('@')
  if (at >= 0) {
    const local = trimmed.slice(0, at).trim()
    return local || EVENT_SUMMARY
  }
  return trimmed
}

export type BusyEntry = {
  busy: BusyInterval[]
  error?: string
}

export type BookResult =
  | { ok: true }
  | { ok: false; reason: 'declined' | 'forbidden' | 'unauthorized' | 'failed'; detail?: string }

type FreeBusyResponse = {
  calendars?: Record<
    string,
    {
      busy?: { start?: string; end?: string }[]
      errors?: { reason?: string }[]
    }
  >
}

type EventResponse = {
  id?: string
  attendees?: { email?: string; responseStatus?: string }[]
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } }
    return body.error?.message || `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
}

async function queryFreeBusyChunk(
  accessToken: string,
  calendarIds: string[],
  timeMin: Date,
  timeMax: Date,
): Promise<Record<string, BusyEntry>> {
  const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      timeZone: 'Europe/Paris',
      items: calendarIds.map((id) => ({ id })),
    }),
  })

  if (response.status === 401) {
    throw Object.assign(new Error('unauthorized'), { status: 401 })
  }
  if (!response.ok) {
    throw new Error(await readError(response))
  }

  const body = (await response.json()) as FreeBusyResponse
  const result: Record<string, BusyEntry> = {}
  for (const calendarId of calendarIds) {
    const entry = body.calendars?.[calendarId]
    if (!entry || (entry.errors && entry.errors.length > 0)) {
      result[calendarId] = {
        busy: [],
        error: entry?.errors?.[0]?.reason || 'notFound',
      }
      continue
    }
    result[calendarId] = {
      busy: (entry.busy ?? []).flatMap((interval) => {
        if (!interval.start || !interval.end) return []
        const start = new Date(interval.start)
        const end = new Date(interval.end)
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return []
        return [{ start, end }]
      }),
    }
  }
  return result
}

type EventsResponse = {
  items?: {
    id?: string
    status?: string
    summary?: string
    transparency?: string
    organizer?: { self?: boolean }
    start?: { dateTime?: string }
    end?: { dateTime?: string }
    attendees?: PrimaryEvent['attendees']
  }[]
}

type EventAttendee = {
  email?: string
  displayName?: string
  responseStatus?: string
  resource?: boolean
  optional?: boolean
  comment?: string
  additionalGuests?: number
}

export async function listPrimaryEvents(
  accessToken: string,
  timeMin: Date,
  timeMax: Date,
): Promise<PrimaryEvent[]> {
  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '20',
    showDeleted: 'false',
  })
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (response.status === 401) {
    throw Object.assign(new Error('unauthorized'), { status: 401 })
  }
  if (!response.ok) {
    throw new Error(await readError(response))
  }
  const body = (await response.json()) as EventsResponse
  return (body.items ?? []).map((item) => ({
    id: item.id,
    status: item.status,
    summary: item.summary,
    transparency: item.transparency,
    organizer: item.organizer,
    start: item.start?.dateTime,
    end: item.end?.dateTime,
    attendees: item.attendees,
  }))
}

type RoomEventsResponse = {
  items?: {
    status?: string
    summary?: string
    transparency?: string
    start?: { dateTime?: string }
    end?: { dateTime?: string }
  }[]
}

export async function listRoomEvents(
  accessToken: string,
  calendarIds: string[],
  timeMin: Date,
  timeMax: Date,
): Promise<Record<string, RoomEvent[]>> {
  const entries = await Promise.all(
    calendarIds.map(async (calendarId) => {
      const events = await listOneRoom(accessToken, calendarId, timeMin, timeMax)
      return [calendarId, events] as const
    }),
  )
  return Object.fromEntries(entries)
}

async function listOneRoom(
  accessToken: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<RoomEvent[]> {
  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '50',
    showDeleted: 'false',
  })
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  )
  if (response.status === 401) {
    throw Object.assign(new Error('unauthorized'), { status: 401 })
  }
  if (!response.ok) return []

  const body = (await response.json()) as RoomEventsResponse
  return (body.items ?? []).flatMap((item) => {
    if (item.status === 'cancelled' || item.transparency === 'transparent') return []
    if (!item.start?.dateTime || !item.end?.dateTime) return []
    const start = new Date(item.start.dateTime)
    const end = new Date(item.end.dateTime)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return []
    return [{ summary: item.summary, start, end }]
  })
}

export async function releaseRoom(
  accessToken: string,
  eventId: string,
  calendarId: string,
): Promise<BookResult> {
  const eventUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`
  const current = await fetch(eventUrl, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (current.status === 401) {
    return { ok: false, reason: 'unauthorized', detail: await readError(current) }
  }
  if (current.status === 403) {
    return { ok: false, reason: 'forbidden', detail: await readError(current) }
  }
  if (!current.ok) {
    return { ok: false, reason: 'failed', detail: await readError(current) }
  }

  const body = (await current.json()) as { attendees?: EventAttendee[] }
  const attendees = body.attendees ?? []
  const roomEmail = calendarId.toLowerCase()
  const remaining = attendees.filter((attendee) => attendee.email?.toLowerCase() !== roomEmail)
  if (remaining.length === attendees.length) {
    return { ok: false, reason: 'failed', detail: 'Room was not on the event' }
  }

  const response = await fetch(`${eventUrl}?sendUpdates=none`, {
    method: 'PATCH',
    headers: authHeaders(accessToken),
    body: JSON.stringify({
      attendees: remaining.map((attendee) => ({
        email: attendee.email,
        displayName: attendee.displayName,
        responseStatus: attendee.responseStatus,
        resource: attendee.resource,
        optional: attendee.optional,
        comment: attendee.comment,
        additionalGuests: attendee.additionalGuests,
      })),
    }),
  })
  if (response.status === 401) {
    return { ok: false, reason: 'unauthorized', detail: await readError(response) }
  }
  if (response.status === 403) {
    return { ok: false, reason: 'forbidden', detail: await readError(response) }
  }
  if (!response.ok) {
    return { ok: false, reason: 'failed', detail: await readError(response) }
  }
  return { ok: true }
}

export async function queryFreeBusy(
  accessToken: string,
  calendarIds: string[],
  timeMin: Date,
  timeMax: Date,
): Promise<Record<string, BusyEntry>> {
  const merged: Record<string, BusyEntry> = {}
  for (let index = 0; index < calendarIds.length; index += FREE_BUSY_CHUNK) {
    const chunk = calendarIds.slice(index, index + FREE_BUSY_CHUNK)
    const part = await queryFreeBusyChunk(accessToken, chunk, timeMin, timeMax)
    Object.assign(merged, part)
  }
  return merged
}

async function deleteEvent(accessToken: string, eventId: string): Promise<void> {
  await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=none`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  )
}

export async function fetchBookerName(accessToken: string): Promise<string | null> {
  const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!response.ok) return null
  const body = (await response.json()) as { summary?: string }
  const summary = body.summary?.trim()
  return summary || null
}

export async function bookRoom(
  accessToken: string,
  calendarId: string,
  start: Date,
  end: Date,
  summary?: string,
): Promise<BookResult> {
  const response = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none',
    {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        summary: summary?.trim() || EVENT_SUMMARY,
        start: { dateTime: formatParisDateTime(start), timeZone: 'Europe/Paris' },
        end: { dateTime: formatParisDateTime(end), timeZone: 'Europe/Paris' },
        attendees: [{ email: calendarId, resource: true }],
      }),
    },
  )

  if (response.status === 401) {
    return { ok: false, reason: 'unauthorized', detail: await readError(response) }
  }
  if (response.status === 403) {
    return { ok: false, reason: 'forbidden', detail: await readError(response) }
  }
  if (!response.ok) {
    return { ok: false, reason: 'failed', detail: await readError(response) }
  }

  const event = (await response.json()) as EventResponse
  const attendee = event.attendees?.find(
    (item) => item.email?.toLowerCase() === calendarId.toLowerCase(),
  )
  if (!attendee || attendee.responseStatus === 'declined') {
    if (event.id) await deleteEvent(accessToken, event.id)
    return attendee?.responseStatus === 'declined'
      ? { ok: false, reason: 'declined' }
      : { ok: false, reason: 'failed', detail: 'Room was not added to the event' }
  }
  return { ok: true }
}
