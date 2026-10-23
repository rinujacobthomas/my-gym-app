import { describe, it, expect } from 'vitest'
import { dayOf, fmtDate } from './format.js'

const ymd = d => [d.getFullYear(), d.getMonth() + 1, d.getDate()].join('-')

describe('dayOf', () => {
  it('reads a plain YYYY-MM-DD as that calendar day', () => {
    expect(ymd(dayOf('2026-10-23'))).toBe('2026-10-23')
  })

  it('reads a Prisma @db.Date (midnight UTC) as the same calendar day in any time zone', () => {
    expect(ymd(dayOf('2026-10-23T00:00:00.000Z'))).toBe('2026-10-23')
  })

  it('reads a real timestamp as the local day it happened', () => {
    const ts = new Date(2026, 9, 23, 18, 30)
    expect(ymd(dayOf(ts.toISOString()))).toBe('2026-10-23')
    expect(ymd(dayOf(ts))).toBe('2026-10-23')
  })
})

describe('fmtDate', () => {
  it('formats API dates instead of printing "Invalid Date"', () => {
    expect(fmtDate('2026-10-23T00:00:00.000Z')).toBe(fmtDate('2026-10-23'))
    expect(fmtDate('2026-10-23T00:00:00.000Z', true)).not.toMatch(/Invalid/)
  })

  it('shows a dash for missing or unparseable input', () => {
    expect(fmtDate(undefined)).toBe('—')
    expect(fmtDate('not a date')).toBe('—')
  })
})
