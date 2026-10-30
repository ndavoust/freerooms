import type { BusyInterval } from './availability.ts'
import { formatParisDateTime } from './time.ts'

const FREE_BUSY_CHUNK = 50
const EVENT_SUMMARY = 'Réservé last minute'

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

export async function bookRoom(
  accessToken: string,
  calendarId: string,
  start: Date,
  end: Date,
): Promise<BookResult> {
  const response = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=none',
    {
      method: 'POST',
      headers: authHeaders(accessToken),
      body: JSON.stringify({
        summary: EVENT_SUMMARY,
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
