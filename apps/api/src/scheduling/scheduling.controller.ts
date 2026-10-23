import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import { PrismaService } from '../prisma.service.js'
import { AuthService } from '../auth/auth.service.js'
import { CurrentUser, MembershipGuard, ReqUser, Roles, bad, latestMembership, membershipStatus, startOfToday } from '../common/guards.js'
import { AuditService, SettingsService } from '../common/services.js'
import { SlotsService } from './slots.service.js'

@Controller()
export class SchedulingController {
  constructor(
    private db: PrismaService,
    private slots: SlotsService,
    private settings: SettingsService,
    private audit: AuditService,
    private auth: AuthService,
  ) {}

  @Get('slots')
  async listSlots(@CurrentUser() u: ReqUser, @Query('date') date?: string) {
    const d = this.parseDate(date)
    if (!d) throw bad('Invalid or missing date (YYYY-MM-DD)')
    await this.slots.ensureDate(d)
    const [instances, templates] = await Promise.all([
      this.db.slotInstance.findMany({
        where: { date: d },
        orderBy: [{ startMin: 'asc' }, { endMin: 'asc' }],
        include: {
          bookings: {
            where: { status: { in: ['BOOKED', 'CHECKED_IN'] } },
            select: { id: true, userId: true, status: true },
          },
          waitlist: { where: { userId: u.id, active: true }, select: { position: true }, take: 1 },
        },
      }),
      this.db.gymSlotTemplate.findMany(),
    ])
    const tmap = new Map(templates.map(t => [t.id, t]))
    return instances.map(s => {
      const booked = s.bookings.length
      const mine = s.bookings.find(b => b.userId === u.id)
      const tmpl = s.templateId ? tmap.get(s.templateId) : undefined
      return {
        id: s.id,
        startMin: s.startMin,
        endMin: s.endMin,
        name: tmpl?.name ?? this.derivedName(s.startMin),
        capacity: s.capacity,
        booked,
        mine: mine ? { bookingId: mine.id, status: mine.status } : null,
        waitlistPosition: s.waitlist[0]?.position ?? null,
        full: booked >= s.capacity,
        walkInRemaining: Math.max(0, s.capacity - booked),
      }
    })
  }

  @Post('bookings')
  @UseGuards(MembershipGuard)
  async book(@CurrentUser() u: ReqUser, @Body() body: { slotId?: string }) {
    const slotId = body?.slotId
    if (!slotId) throw bad('slotId required')
    const slot = await this.db.slotInstance.findUnique({ where: { id: slotId } })
    if (!slot) throw bad('Slot not found', 404)
    const today = startOfToday()
    if (slot.date < today) throw bad('Slot is in the past')
    if (!(slot.date > today || slot.endMin > this.nowMinutes() + 15)) throw bad('Slot entry closed')
    // GET /slots materialises any date it's asked about, so the window has to be enforced here.
    const s = await this.settings.get()
    const windowDays = Number(s.bookingWindowDays) || 7
    if (slot.date.getTime() >= today.getTime() + windowDays * 86400000) {
      throw bad(`Bookings open ${windowDays} days ahead`)
    }
    try {
      const booking = await this.db.$transaction(async tx => {
        await this.slots.lockSlot(tx, slotId)
        const bookedCount = await tx.booking.count({
          where: { slotId, status: { in: ['BOOKED', 'CHECKED_IN'] } },
        })
        if (bookedCount >= slot.capacity) throw bad('Slot full', 409)
        const others = await tx.booking.findMany({
          where: { userId: u.id, status: { in: ['BOOKED', 'CHECKED_IN'] }, slot: { date: slot.date } },
          include: { slot: true },
        })
        const clash = others.some(
          b => b.slotId !== slotId && b.slot.startMin < slot.endMin && slot.startMin < b.slot.endMin,
        )
        if (clash) throw bad('Overlaps another booking that day')
        const existing = await tx.booking.findUnique({
          where: { slotId_userId: { slotId, userId: u.id } },
        })
        if (existing) {
          if (existing.status === 'BOOKED' || existing.status === 'CHECKED_IN') throw bad('Already booked')
          return tx.booking.update({
            where: { id: existing.id },
            data: { status: 'BOOKED', source: 'APP', cancelSource: null },
          })
        }
        return tx.booking.create({ data: { slotId, userId: u.id, status: 'BOOKED', source: 'APP' } })
      })
      this.audit.log(u.id, 'booking.create', 'Booking', booking.id, { slotId })
      return { ok: true, booking }
    } catch (e: any) {
      if (e?.code === 'P2002') throw bad('Already booked')
      throw e
    }
  }

  @Post('bookings/:id/cancel')
  async cancel(@CurrentUser() u: ReqUser, @Param('id') id: string) {
    const booking = await this.db.booking.findUnique({ where: { id }, include: { slot: true } })
    if (!booking || booking.userId !== u.id) throw bad('Booking not found', 404)
    if (booking.status !== 'BOOKED') throw bad('Only booked slots can be cancelled')
    const s = await this.settings.get()
    const today = startOfToday()
    const dayDiff = Math.round((booking.slot.date.getTime() - today.getTime()) / 86400000)
    const nowMin = this.nowMinutes()
    const minutesUntilStart = dayDiff * 1440 + booking.slot.startMin - nowMin
    const slotOver = dayDiff < 0 || (dayDiff === 0 && booking.slot.endMin <= nowMin)

    let cancelSource: 'NORMAL' | 'GRACE' = 'NORMAL'
    if (!slotOver && minutesUntilStart < Number(s.cancelCutoffMin)) {
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      // Schema note: Booking has no updatedAt — createdAt of the GRACE-cancelled row is the proxy.
      const used = await this.db.booking.count({
        where: { userId: u.id, cancelSource: 'GRACE', createdAt: { gte: monthStart } },
      })
      if (used >= Number(s.graceCancelPerMonth)) throw bad('Cancel cutoff passed', 409)
      cancelSource = 'GRACE'
    }
    const updated = await this.db.booking.update({
      where: { id: booking.id },
      data: { status: 'CANCELLED', cancelSource },
    })
    const promotedUserId = await this.slots.promoteFromWaitlist(booking.slotId).catch(() => null)
    this.audit.log(u.id, 'booking.cancel', 'Booking', booking.id, {
      slotId: booking.slotId,
      cancelSource,
      minutesUntilStart,
      promotedUserId,
    })
    return { ok: true, booking: updated, cancelSource }
  }

  @Get('bookings/me')
  async myBookings(@CurrentUser() u: ReqUser) {
    const rows = await this.db.booking.findMany({
      where: { userId: u.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { slot: true },
    })
    const today = startOfToday()
    const nowMin = this.nowMinutes()
    return rows.map(b => {
      const dayDiff = Math.round((b.slot.date.getTime() - today.getTime()) / 86400000)
      const over = dayDiff < 0 || (dayDiff === 0 && b.slot.endMin <= nowMin)
      return {
        id: b.id,
        slot: {
          id: b.slot.id,
          date: b.slot.date,
          startMin: b.slot.startMin,
          endMin: b.slot.endMin,
          capacity: b.slot.capacity,
        },
        status: b.status,
        source: b.source,
        cancelSource: b.cancelSource,
        checkedInAt: b.checkedInAt,
        createdAt: b.createdAt,
        canCancel: b.status === 'BOOKED' && !over,
      }
    })
  }

  @Post('slots/:id/waitlist')
  @UseGuards(MembershipGuard)
  async joinWaitlist(@CurrentUser() u: ReqUser, @Param('id') id: string) {
    const slot = await this.db.slotInstance.findUnique({ where: { id } })
    if (!slot) throw bad('Slot not found', 404)
    if (slot.date < startOfToday()) throw bad('Slot is in the past')
    const booked = await this.slots.bookedCount(id)
    if (booked < slot.capacity) throw bad('Slot is not full')
    const maxPos = await this.db.waitlistEntry.aggregate({
      _max: { position: true },
      where: { slotId: id, active: true },
    })
    const position = (maxPos._max.position ?? 0) + 1
    const existing = await this.db.waitlistEntry.findUnique({
      where: { slotId_userId: { slotId: id, userId: u.id } },
    })
    if (existing) {
      if (existing.active) return { position: existing.position }
      const e = await this.db.waitlistEntry.update({ where: { id: existing.id }, data: { position, active: true } })
      return { position: e.position }
    }
    await this.db.waitlistEntry.create({ data: { slotId: id, userId: u.id, position } })
    return { position }
  }

  @Delete('slots/:id/waitlist')
  async leaveWaitlist(@CurrentUser() u: ReqUser, @Param('id') id: string) {
    await this.db.waitlistEntry.updateMany({
      where: { slotId: id, userId: u.id, active: true },
      data: { active: false },
    })
    return { ok: true }
  }

  @Get('bookings/patterns')
  async getPatterns(@CurrentUser() u: ReqUser) {
    const rows = await this.db.autoBookPattern.findMany({
      where: { userId: u.id },
      orderBy: [{ weekday: 'asc' }, { startMin: 'asc' }],
    })
    return rows.map(r => ({ id: r.id, weekday: r.weekday, startMin: r.startMin, endMin: r.endMin, active: r.active }))
  }

  @Put('bookings/patterns')
  async putPatterns(@CurrentUser() u: ReqUser, @Body() body: { patterns?: any[] }) {
    const list = Array.isArray(body?.patterns) ? body.patterns : []
    const byWeekday = new Map<number, { userId: string; weekday: number; startMin: number; endMin: number; active: boolean }>()
    for (const p of list) {
      const weekday = Number(p?.weekday)
      const startMin = Number(p?.startMin)
      const endMin = Number(p?.endMin)
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) continue
      if (!Number.isInteger(startMin) || !Number.isInteger(endMin)) continue
      if (startMin < 0 || endMin > 1440 || startMin >= endMin) continue
      byWeekday.set(weekday, { userId: u.id, weekday, startMin, endMin, active: p?.active !== false })
    }
    await this.db.$transaction([
      this.db.autoBookPattern.deleteMany({ where: { userId: u.id } }),
      ...(byWeekday.size ? [this.db.autoBookPattern.createMany({ data: [...byWeekday.values()] })] : []),
    ])
    return { ok: true, count: byWeekday.size }
  }

  @Get('bookings/checkin-code')
  async checkinCode(@CurrentUser() u: ReqUser) {
    const secret = await this.checkInSecret()
    const todayISO = startOfToday().toISOString().slice(0, 10)
    return { code: this.auth.checkInCode(u.id, todayISO, secret) }
  }

  @Post('bookings/check-in')
  @Roles('ADMIN', 'TRAINER', 'STAFF')
  async checkIn(@CurrentUser() staff: ReqUser, @Body() body: { code?: string; slotId?: string }) {
    const code = String(body?.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (!code) throw bad('Code required')
    const secret = await this.checkInSecret()
    const today = startOfToday()
    const todayISO = today.toISOString().slice(0, 10)
    const candidates = await this.db.user.findMany({ where: { status: 'ACTIVE' }, select: { id: true } })
    // Codes roll over at UTC midnight but phones refresh at local midnight, so a code shown
    // in the early morning can still be yesterday's (UTC) — accept both.
    const yesterdayISO = new Date(today.getTime() - 86400000).toISOString().slice(0, 10)
    const ownerId = this.auth.parseCheckInCode(code, secret, candidates, todayISO)
      ?? this.auth.parseCheckInCode(code, secret, candidates, yesterdayISO)
    if (!ownerId) throw bad('Invalid code', 404)
    const owner = await this.db.user.findUnique({ where: { id: ownerId } })
    if (!owner || owner.status !== 'ACTIVE') throw bad('Member account not active', 403)
    if (owner.role === 'MEMBER') {
      // Same rule as MembershipGuard: the desk shouldn't wave in a lapsed or frozen member.
      const st = membershipStatus(await latestMembership(this.db, owner.id))
      if (!st.ok) throw bad(st.reason === 'frozen' ? `${owner.name}'s membership is frozen` : `${owner.name}'s membership has expired`, 403)
    }
    const now = new Date()

    const todays = await this.db.booking.findMany({
      where: { userId: ownerId, slot: { date: today } },
      include: { slot: true },
      orderBy: [{ slot: { startMin: 'asc' } }],
    })
    const alreadyIn = todays.find(b => b.status === 'CHECKED_IN')
    if (alreadyIn) {
      return { ok: true, already: true, mode: 'already', member: { id: owner.id, name: owner.name }, bookingId: alreadyIn.id }
    }

    const nowMin = this.nowMinutes()
    const bookedToday = todays.filter(b => b.status === 'BOOKED')
    const target =
      bookedToday.find(b => b.slot.startMin <= nowMin && nowMin < b.slot.endMin) ?? bookedToday[0]
    if (target) {
      const updated = await this.db.booking.update({
        where: { id: target.id },
        data: { status: 'CHECKED_IN', checkedInAt: now },
      })
      this.audit.log(staff.id, 'booking.checkin', 'Booking', updated.id, { memberId: ownerId, mode: 'booked' })
      return { ok: true, member: { id: owner.id, name: owner.name }, mode: 'booked', bookingId: updated.id }
    }

    const allToday = await this.db.slotInstance.findMany({ where: { date: today }, orderBy: { startMin: 'asc' } })
    let pool = allToday.filter(c => c.endMin > nowMin)
    if (body?.slotId) pool = allToday.filter(c => c.id === body.slotId)
    const counts = await this.db.booking.groupBy({
      by: ['slotId'],
      where: { slot: { date: today }, status: { in: ['BOOKED', 'CHECKED_IN'] } },
      _count: { _all: true },
    })
    const cmap = new Map(counts.map(c => [c.slotId, c._count._all]))
    const withRoom = pool.filter(c => c.capacity - (cmap.get(c.id) ?? 0) > 0)
    if (!withRoom.length) throw bad('No walk-in capacity', 409)
    withRoom.sort((a, b) => Math.abs(a.startMin - nowMin) - Math.abs(b.startMin - nowMin))
    const chosen = withRoom[0]
    const existing = await this.db.booking.findUnique({
      where: { slotId_userId: { slotId: chosen.id, userId: ownerId } },
    })
    let booking
    if (existing) {
      booking = await this.db.booking.update({
        where: { id: existing.id },
        data: { status: 'CHECKED_IN', source: 'WALK_IN', cancelSource: null, checkedInAt: now },
      })
    } else {
      booking = await this.db.booking.create({
        data: { slotId: chosen.id, userId: ownerId, status: 'CHECKED_IN', source: 'WALK_IN', checkedInAt: now },
      })
    }
    this.audit.log(staff.id, 'booking.checkin.walkin', 'Booking', booking.id, {
      memberId: ownerId,
      slotId: chosen.id,
    })
    return { ok: true, member: { id: owner.id, name: owner.name }, mode: 'walkin', bookingId: booking.id, slotId: chosen.id }
  }

  @Get('slots/:id/attendees')
  @Roles('ADMIN', 'TRAINER', 'STAFF')
  async attendees(@Param('id') id: string) {
    const slot = await this.db.slotInstance.findUnique({
      where: { id },
      include: {
        bookings: {
          where: { status: { in: ['BOOKED', 'CHECKED_IN'] } },
          include: { user: { select: { id: true, name: true, avatarUrl: true } } },
        },
      },
    })
    if (!slot) throw bad('Slot not found', 404)
    const attendees = slot.bookings
      .map(b => ({
        bookingId: b.id,
        userId: b.user.id,
        name: b.user.name,
        avatarUrl: b.user.avatarUrl,
        status: b.status,
        checkedInAt: b.checkedInAt,
      }))
      .sort((a, b) => {
        const av = a.checkedInAt ? a.checkedInAt.getTime() : Infinity
        const bv = b.checkedInAt ? b.checkedInAt.getTime() : Infinity
        if (av === bv) return 0
        return av < bv ? -1 : 1
      })
    return { capacity: slot.capacity, attendees }
  }

  @Get('schedule/templates')
  @Roles('ADMIN')
  async listTemplates() {
    const rows = await this.db.gymSlotTemplate.findMany({
      orderBy: [{ weekday: 'asc' }, { startMin: 'asc' }, { endMin: 'asc' }],
    })
    return rows
  }

  @Put('schedule/templates')
  @Roles('ADMIN')
  async putTemplates(@CurrentUser() u: ReqUser, @Body() body: { templates?: any[] }) {
    const list = Array.isArray(body?.templates) ? body.templates : []
    const seenIds = new Set<string>()
    const clean: any[] = []
    for (const t of list) {
      const weekday = Number(t?.weekday)
      const startMin = Number(t?.startMin)
      const endMin = Number(t?.endMin)
      const capacity = Number(t?.capacity)
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) continue
      if (!Number.isInteger(startMin) || !Number.isInteger(endMin)) continue
      if (startMin < 0 || endMin > 1440 || startMin >= endMin) continue
      if (!Number.isInteger(capacity) || capacity < 1) continue
      const name = typeof t?.name === 'string' && t.name.trim() ? t.name.trim().slice(0, 80) : 'Slot'
      const id = typeof t?.id === 'string' && t.id && !seenIds.has(t.id) ? (seenIds.add(t.id), t.id) : undefined
      clean.push({ ...(id ? { id } : {}), name, weekday, startMin, endMin, capacity, isActive: t?.isActive !== false })
    }
    await this.db.$transaction([
      this.db.gymSlotTemplate.deleteMany({}),
      ...(clean.length ? [this.db.gymSlotTemplate.createMany({ data: clean })] : []),
    ])
    this.audit.log(u.id, 'schedule.templates.replace', 'GymSlotTemplate', undefined, { count: clean.length })
    const s = await this.settings.get()
    await this.slots.ensureRange(Number(s.bookingWindowDays) || 7)
    return { ok: true, count: clean.length }
  }

  private async checkInSecret() {
    const s = await this.settings.get()
    return process.env.SESSION_SECRET || s.vapidPrivate || 'opengym-dev-secret'
  }

  private parseDate(v?: string | null): Date | null {
    if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
    const d = new Date(v + 'T00:00:00.000Z')
    if (isNaN(d.getTime())) return null
    return d.toISOString().slice(0, 10) === v ? d : null
  }

  private nowMinutes(): number {
    const n = new Date()
    return n.getHours() * 60 + n.getMinutes()
  }

  private derivedName(startMin: number): string {
    if (startMin < 300) return 'Night'
    if (startMin < 720) return 'Morning'
    if (startMin < 1020) return 'Afternoon'
    return 'Evening'
  }
}
