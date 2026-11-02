import { describe, expect, it } from 'vitest'
import { bookingTitle } from './googleCalendar.ts'

describe('bookingTitle', () => {
  it('prefixes the first name from the calendar title', () => {
    expect(bookingTitle('  Nicolas Davoust  ')).toBe('Last minute Nicolas')
    expect(bookingTitle('Jean-Pierre Martin')).toBe('Last minute Jean-Pierre')
  })

  it('uses the first name from an email calendar title', () => {
    expect(bookingTitle('nicolas.davoust@gensdeconfiance.com')).toBe('Last minute Nicolas')
  })

  it('stays stable when the title was already formatted', () => {
    expect(bookingTitle('Last minute Nicolas')).toBe('Last minute Nicolas')
    expect(bookingTitle('Réservé last minute')).toBe('Last minute')
  })

  it('falls back when the name is missing', () => {
    expect(bookingTitle(null)).toBe('Last minute')
    expect(bookingTitle('   ')).toBe('Last minute')
    expect(bookingTitle('@gensdeconfiance.com')).toBe('Last minute')
  })
})
