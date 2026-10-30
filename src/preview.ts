import type { BusyInterval } from './availability.ts'

/** Deterministic occupancy for the local ?preview=1 board. Not used in production. */
export function previewBusy(now: Date, calendarId: string): BusyInterval[] {
  const minute = 60 * 1000
  if (calendarId.includes('marais')) {
    return [{ start: new Date(now.getTime() - 30 * minute), end: new Date(now.getTime() + 7 * minute) }]
  }
  if (calendarId.includes('loire')) {
    return [{ start: new Date(now.getTime() - 15 * minute), end: new Date(now.getTime() + 3 * 60 * minute) }]
  }
  if (calendarId.includes('erdre')) {
    return [
      { start: new Date(now.getTime() - 20 * minute), end: new Date(now.getTime() + 4 * minute) },
      { start: new Date(now.getTime() + 12 * minute), end: new Date(now.getTime() + 3 * 60 * minute) },
    ]
  }
  return []
}
