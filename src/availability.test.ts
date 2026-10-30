import { describe, expect, it } from 'vitest'
import { availabilityBar, bookingWindow, classifyRoom, withoutOverlap, type BusyInterval } from './availability.ts'

const at = (iso: string) => new Date(iso)

describe('withoutOverlap', () => {
  it('drops the released meeting and keeps a later booking', () => {
    const released = { start: at('2026-01-15T09:00:00Z'), end: at('2026-01-15T09:30:00Z') }
    const later: BusyInterval = { start: at('2026-01-15T11:00:00Z'), end: at('2026-01-15T12:00:00Z') }
    expect(withoutOverlap([released, later], released.start, released.end)).toEqual([later])
  })
})

describe('classifyRoom', () => {
  const now = at('2026-01-15T09:05:00Z')
  const until = at('2026-01-15T10:00:00Z')

  it('is free when nothing overlaps the window', () => {
    const earlier: BusyInterval = { start: at('2026-01-15T08:00:00Z'), end: at('2026-01-15T09:00:00Z') }
    expect(classifyRoom(now, until, [earlier])).toEqual({ kind: 'free' })
  })

  it('is soon when the current meeting ends before the slot', () => {
    const busy: BusyInterval[] = [{ start: at('2026-01-15T08:30:00Z'), end: at('2026-01-15T09:12:00Z') }]
    expect(classifyRoom(now, until, busy)).toEqual({ kind: 'soon', freeAt: busy[0].end })
  })

  it('hides a room that stays busy through the slot', () => {
    const busy: BusyInterval[] = [{ start: at('2026-01-15T08:30:00Z'), end: at('2026-01-15T10:30:00Z') }]
    expect(classifyRoom(now, until, busy)).toEqual({ kind: 'hidden' })
  })

  it('hides a room that frees and is booked again before the slot', () => {
    const busy: BusyInterval[] = [
      { start: at('2026-01-15T08:30:00Z'), end: at('2026-01-15T09:12:00Z') },
      { start: at('2026-01-15T09:30:00Z'), end: at('2026-01-15T09:45:00Z') },
    ]
    expect(classifyRoom(now, until, busy)).toEqual({ kind: 'hidden' })
  })

  it('hides a room that is free now but booked before the slot', () => {
    const busy: BusyInterval[] = [{ start: at('2026-01-15T09:20:00Z'), end: at('2026-01-15T09:40:00Z') }]
    expect(classifyRoom(now, until, busy)).toEqual({ kind: 'hidden' })
  })

  it('hides a room whose current meeting ends exactly at the slot', () => {
    const busy: BusyInterval[] = [{ start: at('2026-01-15T09:00:00Z'), end: until }]
    expect(classifyRoom(now, until, busy)).toEqual({ kind: 'hidden' })
  })

  it('extends the current block across overlapping meetings', () => {
    const laterNow = at('2026-01-15T09:15:00Z')
    const laterUntil = at('2026-01-15T11:00:00Z')
    const busy: BusyInterval[] = [
      { start: at('2026-01-15T09:00:00Z'), end: at('2026-01-15T10:00:00Z') },
      { start: at('2026-01-15T09:30:00Z'), end: at('2026-01-15T10:30:00Z') },
    ]
    expect(classifyRoom(laterNow, laterUntil, busy)).toEqual({
      kind: 'soon',
      freeAt: at('2026-01-15T10:30:00Z'),
    })
  })
})

describe('bookingWindow', () => {
  const now = at('2026-01-15T09:05:00Z')
  const until = at('2026-01-15T10:00:00Z')

  it('books a free room from now until the slot', () => {
    expect(bookingWindow(now, until, { kind: 'free' })).toEqual({ start: now, end: until })
  })

  it('books a soon room from the moment it frees', () => {
    const freeAt = at('2026-01-15T09:12:00Z')
    expect(bookingWindow(now, until, { kind: 'soon', freeAt })).toEqual({ start: freeAt, end: until })
  })

  it('drops a window shorter than one minute', () => {
    const late = at('2026-01-15T09:59:30Z')
    expect(bookingWindow(late, until, { kind: 'free' })).toBeNull()
  })
})

describe('availabilityBar', () => {
  it('fills the bar when the room is free', () => {
    const now = at('2026-01-15T09:00:00Z')
    const until = at('2026-01-15T10:00:00Z')
    expect(availabilityBar(now, until, { kind: 'free' })).toEqual({ busyRatio: 0 })
  })

  it('marks the busy prefix until the room frees', () => {
    const now = at('2026-01-15T09:00:00Z')
    const until = at('2026-01-15T10:00:00Z')
    const freeAt = at('2026-01-15T09:15:00Z')
    expect(availabilityBar(now, until, { kind: 'soon', freeAt })).toEqual({ busyRatio: 0.25 })
  })
})
