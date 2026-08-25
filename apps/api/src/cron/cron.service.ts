import { Injectable } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { PrismaService } from '../prisma.service.js'
import { SlotsService } from '../scheduling/slots.service.js'
import { PushService } from '../push/push.service.js'
import { SettingsService } from '../common/services.js'
import { runAutoBookForDate } from './auto-book.service.js'

const DAY_MS = 86400000

const isoOf = (d: Date) => d.toISOString().slice(0, 10)
const dateOf = (iso: string) => new Date(iso + 'T00:00:00.000Z')
const shiftIso = (iso: string, days: number) => isoOf(new Date(dateOf(iso).getTime() + days * DAY_MS))
const fmtMin = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

/**
 * Nightly housekeeping at 00:10. Each stage is isolated — one failing stage
 * never blocks the rest. Also callable manually via runDailyMaintenanceOnce().
 */
@Injectable()
export class CronService {
  // In-memory once-per-day dedupe so a manual re-run doesn't double-notify.
  private expirySent = new Set<string>()
  private tomorrowSent = new Set<string>()
  private workoutSent = new Set<string>()

  constructor(
    private db: PrismaService,
    private slots: SlotsService,
    private push: PushService,
    private settings: SettingsService,
  ) {}

  @Cron('10 0 * * *')
  dailyMaintenance() {
    void this.runDailyMaintenanceOnce().catch((e: any) =>
      console.warn('[cron] daily maintenance crashed:', e?.message ?? e),
    )
  }

  async runDailyMaintenanceOnce(): Promise<void> {
    const todayIso = isoOf(new Date())
    const stages: [string, () => Promise<void>][] = [
      ['generate-slots', () => this.stageGenerateSlots()],
      ['auto-book', () => this.stageAutoBook(todayIso)],
      ['no-show-sweep', () => this.stageNoShowSweep(todayIso)],
      ['expiry-reminders', () => this.stageExpiryReminders(todayIso)],
      ['stale-orders', () => this.stageStaleOrders()],
      ['tomorrow-reminders', () => this.stageTomorrowReminders(todayIso)],
      ['workout-reminders', () => this.stageWorkoutReminders(todayIso)],
    ]
    for (const [name, fn] of stages) {
      try {
        await fn()
      } catch (e: any) {
        console.warn(`[cron] ${name} failed:`, e?.message ?? e)
      }
    }
  }

  /** a) keep the booking window materialized */
  private async stageGenerateSlots() {
    const settings = await this.settings.get()
    await this.slots.ensureRange(settings.bookingWindowDays)
  }

  /** auto-book members' usual slots right after generation (tomorrow's board) */
  private async stageAutoBook(todayIso: string) {
    const created = await runAutoBookForDate(this.db, this.slots, shiftIso(todayIso, 1))
    for (const b of created) {
      await this.push.sendToUser(b.userId, {
        title: 'Auto-booked your usual slot',
        body: `${fmtMin(b.startMin)} tomorrow — see you there.`,
        tag: 'autobook',
      })
    }
  }

  /** b) yesterday's no-shows get marked */
  private async stageNoShowSweep(todayIso: string) {
    const yesterday = dateOf(shiftIso(todayIso, -1))
    const slots = await this.db.slotInstance.findMany({ where: { date: yesterday }, select: { id: true } })
    if (!slots.length) return
    const bookings = await this.db.booking.findMany({
      where: { slotId: { in: slots.map(s => s.id) }, status: 'BOOKED' },
      select: { id: true },
    })
    if (!bookings.length) return
    await this.db.booking.updateMany({
      where: { id: { in: bookings.map(b => b.id) } },
      data: { status: 'NO_SHOW' },
    })
  }

  /** c) memberships ending within the next 3 days → one push per user per day */
  private async stageExpiryReminders(todayIso: string) {
    const memberships = await this.db.membership.findMany({
      where: {
        status: 'ACTIVE',
        frozenUntil: null,
        endDate: { gte: dateOf(todayIso), lte: dateOf(shiftIso(todayIso, 3)) },
      },
      include: { plan: true },
      orderBy: { endDate: 'desc' },
    })
    const perUser = new Map<string, (typeof memberships)[number]>()
    for (const m of memberships) if (!perUser.has(m.userId)) perUser.set(m.userId, m)
    for (const m of perUser.values()) {
      const key = `expiry:${todayIso}:${m.userId}`
      if (this.expirySent.has(key)) continue
      this.expirySent.add(key)
      await this.push.sendToUser(m.userId, {
        title: 'Membership ending soon',
        body: `${m.plan?.name ?? 'Membership'} ends ${isoOf(m.endDate)} — renew in the app.`,
        tag: 'membership-expiry',
      })
    }
  }

  /** d) payment orders left CREATED for over 24h are dead */
  private async stageStaleOrders() {
    await this.db.payment.updateMany({
      where: { status: 'CREATED', createdAt: { lt: new Date(Date.now() - DAY_MS) } },
      data: { status: 'FAILED' },
    })
  }

  /** e) "you're booked tomorrow" nudges for users with a registered device */
  private async stageTomorrowReminders(todayIso: string) {
    const bookings = await this.db.booking.findMany({
      where: { status: 'BOOKED', slot: { date: dateOf(shiftIso(todayIso, 1)) } },
      select: { userId: true, slot: { select: { startMin: true } } },
      orderBy: { slot: { startMin: 'asc' } },
    })
    if (!bookings.length) return
    const userIds = [...new Set(bookings.map(b => b.userId))]
    const withSubs = new Set(
      (
        await this.db.pushSubscription.findMany({
          where: { userId: { in: userIds } },
          select: { userId: true },
        })
      ).map(r => r.userId),
    )
    for (const b of bookings) {
      if (!withSubs.has(b.userId)) continue
      const key = `tomorrow:${todayIso}:${b.userId}`
      if (this.tomorrowSent.has(key)) continue
      this.tomorrowSent.add(key)
      await this.push.sendToUser(b.userId, {
        title: 'Gym tomorrow',
        body: `${fmtMin(b.slot.startMin)} — see you there.`,
        tag: 'gym-tomorrow',
      })
    }
  }

  /** f) ported workout-day reminder: reminder.on && local HH:mm match && routine today && not yet logged */
  private async stageWorkoutReminders(todayIso: string) {
    const now = new Date()
    const hhmm = fmtMin(now.getHours() * 60 + now.getMinutes()) // local server time
    const dayIdx = (now.getDay() + 6) % 7 // Mon=0 … Sun=6
    const states = await this.db.appState.findMany({ select: { userId: true, data: true } })
    const due: { userId: string; routine: string }[] = []
    for (const st of states) {
      const data: any = st.data
      const rem = data?.reminder
      if (!rem?.on || rem.time !== hhmm) continue
      const week = Array.isArray(data?.week) ? data.week : null
      const day = week ? week[dayIdx] : null
      if (!day || day === 'rest' || (typeof day === 'object' && (day as any).rest)) continue
      due.push({ userId: st.userId, routine: typeof day === 'string' ? day : String((day as any)?.name ?? '') })
    }
    if (!due.length) return
    const userIds = due.map(d => d.userId)
    const [logged, withSubs] = await Promise.all([
      this.db.workoutLog
        .findMany({ where: { userId: { in: userIds }, date: dateOf(todayIso), deletedAt: null }, select: { userId: true } })
        .then(rows => new Set(rows.map(r => r.userId))),
      this.db.pushSubscription
        .findMany({ where: { userId: { in: userIds } }, select: { userId: true } })
        .then(rows => new Set(rows.map(r => r.userId))),
    ])
    for (const d of due) {
      if (logged.has(d.userId) || !withSubs.has(d.userId)) continue
      const key = `workout:${todayIso}:${d.userId}`
      if (this.workoutSent.has(key)) continue
      this.workoutSent.add(key)
      await this.push.sendToUser(d.userId, {
        title: 'Workout time',
        body: `${d.routine ? d.routine + ' — ' : ''}time to train 💪`,
        tag: 'workout-reminder',
      })
    }
  }
}
