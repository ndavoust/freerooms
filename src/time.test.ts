import { describe, expect, it } from 'vitest'
import { formatClock, untilSlots } from './time.ts'

describe('untilSlots', () => {
  it('shows 10h15 through 11h00 at 09h55 and at 10h05 Paris', () => {
    const at0955 = new Date('2026-01-15T08:55:00.000Z')
    const at1005 = new Date('2026-01-15T09:05:00.000Z')
    const expected = ['10h15', '10h30', '10h45', '11h00']
    expect(untilSlots(at0955).map(formatClock)).toEqual(expected)
    expect(untilSlots(at1005).map(formatClock)).toEqual(expected)
  })

  it('moves to the next quarter at 10h06 Paris', () => {
    const at1006 = new Date('2026-01-15T09:06:00.000Z')
    expect(untilSlots(at1006).map(formatClock)).toEqual(['10h30', '10h45', '11h00', '11h15'])
  })

  it('keeps a quarter that is exactly 10 minutes ahead', () => {
    const at0950 = new Date('2026-01-15T08:50:00.000Z')
    expect(untilSlots(at0950).map(formatClock)).toEqual(['10h00', '10h15', '10h30', '10h45'])
  })

  it('uses the same quarters in summer time', () => {
    const at0955 = new Date('2026-07-15T07:55:00.000Z')
    expect(untilSlots(at0955).map(formatClock)).toEqual(['10h15', '10h30', '10h45', '11h00'])
  })

  it('crosses midnight in Paris', () => {
    const at2355 = new Date('2026-01-15T22:55:00.000Z')
    expect(untilSlots(at2355).map(formatClock)).toEqual(['00h15', '00h30', '00h45', '01h00'])
  })
})
