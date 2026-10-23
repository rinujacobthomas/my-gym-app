import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service.js'
import { Prisma } from '#prisma'
import { startOfToday } from '../common/guards.js'
import { SettingsService } from '../common/services.js'

type TemplateLite = { id: string; startMin: number; endMin: number; capacity: number; weekday: number }

@Injectable()
export class SlotsService {
  constructor(private db: PrismaService, private settings: SettingsService) {}

  async ensureRange(daysAhead: number) {
    const s = await this.settings.get()
    const requested = Number(daysAhead) > 0 ? Math.floor(Number(daysAhead)) : Number(s.bookingWindowDays) || 1
    const days = Math.max(1, requested)
    const templates = await this.db.gymSlotTemplate.findMany({ where: { isActive: true } })
    if (!templates.length) return
    const today = startOfToday()
    for (let i = 0; i < days; i++) {
      const date = new Date(today.getTime() + i * 86400000)
      await this.materialize(date, templates)
    }
  }

  async ensureDate(date: Date) {
    const d = new Date(date.getTime())
    d.setUTCHours(0, 0, 0, 0)
    const templates = await this.db.gymSlotTemplate.findMany({ where: { isActive: true } })
    await this.materialize(d, templates)
  }

  private async materialize(date: Date, templates: TemplateLite[]) {
    const weekday = (date.getUTCDay() + 6) % 7
    const todays = templates.filter(t => t.weekday === weekday)
    await Promise.all(
      todays.map(t =>
        this.db.slotInstance
          .upsert({
            where: { date_startMin_endMin: { date, startMin: t.startMin, endMin: t.endMin } },
            create: { templateId: t.id, date, startMin: t.startMin, endMin: t.endMin, capacity: t.capacity },
            update: {},
          })
          .catch(() => null),
      ),
    )
  }

  /**
   * Row-locks a slot for the rest of the transaction. Capacity checks are count-then-insert,
   * which two concurrent requests can both pass under READ COMMITTED; serialising on the slot
   * row makes the second one see the first one's seat.
   */
  async lockSlot(tx: Prisma.TransactionClient, slotId: string) {
    await tx.$queryRaw`SELECT id FROM "SlotInstance" WHERE id = ${slotId} FOR UPDATE`
  }

  /** Promotes the head of the waitlist into a freed seat. Returns the promoted userId or null. */
  async promoteFromWaitlist(slotInstanceId: string): Promise<string | null> {
    return this.db
      .$transaction(async tx => {
        await this.lockSlot(tx, slotInstanceId)
        const slot = await tx.slotInstance.findUnique({ where: { id: slotInstanceId } })
        if (!slot) return null
        const booked = await tx.booking.count({
          where: { slotId: slotInstanceId, status: { in: ['BOOKED', 'CHECKED_IN'] } },
        })
        if (booked >= slot.capacity) return null
        const entry = await tx.waitlistEntry.findFirst({
          where: { slotId: slotInstanceId, active: true },
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        })
        if (!entry) return null
        await tx.waitlistEntry.delete({ where: { id: entry.id } })
        const existing = await tx.booking.findUnique({
          where: { slotId_userId: { slotId: slotInstanceId, userId: entry.userId } },
        })
        if (existing) {
          await tx.booking.update({
            where: { id: existing.id },
            data: { status: 'BOOKED', source: 'APP', cancelSource: null },
          })
        } else {
          await tx.booking.create({
            data: { slotId: slotInstanceId, userId: entry.userId, status: 'BOOKED', source: 'APP' },
          })
        }
        return entry.userId
      })
      .catch(() => null)
  }

  bookedCount(slotId: string) {
    return this.db.booking.count({ where: { slotId, status: { in: ['BOOKED', 'CHECKED_IN'] } } })
  }
}
