const MIN_BOOKING_MS = 60 * 1000

export type BusyInterval = {
  start: Date
  end: Date
}

export type RoomStatus =
  | { kind: 'free' }
  | { kind: 'soon'; freeAt: Date }
  | { kind: 'hidden' }

/** Drop intervals that overlap [start, end), keeping bookings that only touch the edges. */
export function withoutOverlap(busy: BusyInterval[], start: Date, end: Date): BusyInterval[] {
  const startMs = start.getTime()
  const endMs = end.getTime()
  return busy.filter((interval) => interval.end.getTime() <= startMs || interval.start.getTime() >= endMs)
}

export function classifyRoom(now: Date, until: Date, busy: BusyInterval[]): RoomStatus {
  const nowMs = now.getTime()
  const untilMs = until.getTime()
  if (untilMs <= nowMs) return { kind: 'hidden' }

  const relevant = busy
    .filter((interval) => interval.end.getTime() > nowMs && interval.start.getTime() < untilMs)
    .sort((a, b) => a.start.getTime() - b.start.getTime())

  if (relevant.length === 0) return { kind: 'free' }
  if (relevant[0].start.getTime() > nowMs) return { kind: 'hidden' }

  let coveredEnd = relevant[0].end.getTime()
  for (let index = 1; index < relevant.length; index += 1) {
    const interval = relevant[index]
    if (interval.start.getTime() > coveredEnd) break
    if (interval.end.getTime() > coveredEnd) coveredEnd = interval.end.getTime()
  }

  if (coveredEnd >= untilMs) return { kind: 'hidden' }

  const resumes = relevant.some(
    (interval) => interval.start.getTime() > coveredEnd && interval.start.getTime() < untilMs,
  )
  if (resumes) return { kind: 'hidden' }

  return { kind: 'soon', freeAt: new Date(coveredEnd) }
}

export function bookingWindow(
  now: Date,
  until: Date,
  status: RoomStatus,
): { start: Date; end: Date } | null {
  if (status.kind === 'hidden') return null
  const start = status.kind === 'soon' ? status.freeAt : now
  if (until.getTime() - start.getTime() < MIN_BOOKING_MS) return null
  return { start, end: until }
}

export function availabilityBar(
  now: Date,
  until: Date,
  status: Extract<RoomStatus, { kind: 'free' | 'soon' }>,
): { busyRatio: number } {
  const total = until.getTime() - now.getTime()
  if (total <= 0 || status.kind === 'free') return { busyRatio: 0 }
  const busy = Math.min(Math.max(status.freeAt.getTime() - now.getTime(), 0), total)
  return { busyRatio: busy / total }
}
