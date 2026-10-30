export const PARIS = 'Europe/Paris'

const QUARTER_MS = 15 * 60 * 1000
const LEAD_MS = 10 * 60 * 1000

export type ParisParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

export function parisParts(date: Date): ParisParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: PARIS,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const bag: Record<string, string> = {}
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') bag[part.type] = part.value
  }
  let hour = Number(bag.hour)
  if (hour === 24) hour = 0
  return {
    year: Number(bag.year),
    month: Number(bag.month),
    day: Number(bag.day),
    hour,
    minute: Number(bag.minute),
    second: Number(bag.second),
  }
}

export function formatClock(date: Date): string {
  const parts = parisParts(date)
  const hour = String(parts.hour).padStart(2, '0')
  const minute = String(parts.minute).padStart(2, '0')
  return `${hour}h${minute}`
}

export function formatDay(date: Date): string {
  return new Intl.DateTimeFormat('fr-FR', {
    timeZone: PARIS,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date)
}

/** Wall-clock Paris time without an offset, for Calendar API dateTime + timeZone. */
export function formatParisDateTime(date: Date): string {
  const parts = parisParts(date)
  const month = String(parts.month).padStart(2, '0')
  const day = String(parts.day).padStart(2, '0')
  const hour = String(parts.hour).padStart(2, '0')
  const minute = String(parts.minute).padStart(2, '0')
  const second = String(parts.second).padStart(2, '0')
  return `${parts.year}-${month}-${day}T${hour}:${minute}:${second}`
}

function ceilToQuarter(date: Date): Date {
  const time = date.getTime()
  const remainder = time % QUARTER_MS
  if (remainder === 0) return new Date(time)
  return new Date(time + (QUARTER_MS - remainder))
}

/**
 * Four quarter-hour options. The first is the next quarter at least 10 minutes
 * ahead; an instant that lands exactly on a quarter is kept.
 * Europe/Paris is a whole-hour offset from UTC, so UTC quarter boundaries
 * match Paris quarter boundaries.
 */
export function untilSlots(now: Date): Date[] {
  const first = ceilToQuarter(new Date(now.getTime() + LEAD_MS))
  return [0, 1, 2, 3].map((step) => new Date(first.getTime() + step * QUARTER_MS))
}
