import { describe, expect, it } from 'vitest'
import { bookingTitle } from './googleCalendar.ts'

describe('bookingTitle', () => {
  it('uses the signed-in name when the calendar has one', () => {
    expect(bookingTitle('  Nicolas Davoust  ')).toBe('Nicolas Davoust')
  })

  it('keeps the local part of an email calendar title', () => {
    expect(bookingTitle('nicolas.davoust@gensdeconfiance.com')).toBe('nicolas.davoust')
  })

  it('falls back when the name is missing', () => {
    expect(bookingTitle(null)).toBe('Réservé last minute')
    expect(bookingTitle('   ')).toBe('Réservé last minute')
    expect(bookingTitle('@gensdeconfiance.com')).toBe('Réservé last minute')
  })
})
