import type { PrismaService } from '../prisma.service.js'
import type { SlotsService } from '../scheduling/slots.service.js'
import { latestMembership, membershipStatus } from '../common/guards.js'

/**
 * Plain exported functions on purpose — CronService calls these directly after
 * daily slot generation, so auto-book needs no Nest DI wiring of its own.
 */

export interface AutoBookedSlot {
  userId: string
  startMin: number
  endMin: number
}

/**
 * Books every ACTIVE AutoBookPattern matching `dateISO`'s weekday into the exact
 * (date, startMin, endMin) SlotInstance — capacity permitting, no overlapping
 * active booking, membership in good standing. Best-effort per user.
 */
export async function runAutoBookForDate(
  db: PrismaService,
  _slots: SlotsService,
  dateISO: string,
): Promise<AutoBookedSlot[]> {
  const booked: AutoBookedSlot[] = []
  const date = new Date(dateISO + 'T00:00:00.000Z')
  const weekday = (date.getUTCDay() + 6) % 7 // Mon=0 … Sun=6
  let patterns: Awaited<ReturnType<typeof db.autoBookPattern.findMany>>
  try {
    patterns = await db.autoBookPattern.findMany({ where: { active: true, weekday } })
  } catch (e: any) {
    console.warn('[auto-book] pattern fetch failed:', e?.message ?? e)
    return booked
  }
  if (!patterns.length) return booked

  const daySlots = await db.slotInstance.findMany({ where: { date } })

  for (const p of patterns) {
    try {
      const slot = daySlots.find(s => s.startMin === p.startMin && s.endMin === p.endMin)
      if (!slot) continue

      // Any BOOKED/CHECKED_IN booking overlapping this slot that day blocks us.
      const mine = await db.booking.findMany({
        where: { userId: p.userId, status: { in: ['BOOKED', 'CHECKED_IN'] }, slot: { date } },
        select: { slotId: true, slot: { select: { startMin: true, endMin: true } } },
      })
      const clash = mine.some(b => b.slotId === slot.id || (b.slot.startMin < slot.endMin && slot.startMin < b.slot.endMin))
      if (clash) continue

      const bookedCount = await db.booking.count({
        where: { slotId: slot.id, status: { in: ['BOOKED', 'CHECKED_IN'] } },
      })
      if (bookedCount >= slot.capacity) continue

      const membership = await latestMembership(db, p.userId)
      if (!membershipStatus(membership).ok) continue

      const existing = await db.booking.findUnique({
        where: { slotId_userId: { slotId: slot.id, userId: p.userId } },
      })
      if (existing) {
        // Revive a CANCELLED/NO_SHOW row rather than hitting the unique constraint.
        await db.booking.update({
          where: { id: existing.id },
          data: { status: 'BOOKED', source: 'APP', cancelSource: null },
        })
      } else {
        await db.booking.create({
          data: { slotId: slot.id, userId: p.userId, status: 'BOOKED', source: 'APP' },
        })
      }
      booked.push({ userId: p.userId, startMin: slot.startMin, endMin: slot.endMin })
    } catch (e: any) {
      console.warn('[auto-book] pattern skipped:', e?.message ?? e)
    }
  }
  return booked
}
