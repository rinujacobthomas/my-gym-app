import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import { PrismaService } from '../prisma.service.js'
import { CurrentUser, MembershipGuard, Public, ReqUser, Roles, bad, startOfToday } from '../common/guards.js'
import { AuditService } from '../common/services.js'

const PT_INCLUDE = {
  member: { select: { id: true, name: true, avatarUrl: true } },
  trainer: { select: { id: true, user: { select: { name: true } } } },
}

@Controller()
export class TrainersController {
  constructor(private db: PrismaService, private audit: AuditService) {}

  @Public()
  @Get('trainers')
  async listTrainers() {
    const users = await this.db.user.findMany({
      where: {
        status: 'ACTIVE',
        OR: [{ role: 'TRAINER' }, { role: 'ADMIN', trainerProfile: { isNot: null } }],
      },
      orderBy: { name: 'asc' },
      include: { trainerProfile: { include: { availability: true } } },
    })
    // Taken times for the coming week (no member details) so the app only offers free sessions.
    const today = startOfToday()
    const weekOut = new Date(today.getTime() + 7 * 86400000)
    const taken = await this.db.ptBooking.findMany({
      where: { status: 'BOOKED', date: { gte: today, lte: weekOut }, trainerId: { in: users.map(u => u.trainerProfile?.id).filter((x): x is string => !!x) } },
      select: { trainerId: true, date: true, startMin: true, endMin: true },
    })
    return users.map(u => {
      const t = u.trainerProfile
      const availability = (t?.availability ?? [])
        .filter(a => a.kind === 'PUBLIC' && a.isActive)
        .sort((a, b) => a.weekday - b.weekday || a.startMin - b.startMin || a.endMin - b.endMin)
        .map(a => ({ weekday: a.weekday, startMin: a.startMin, endMin: a.endMin }))
      return {
        // POST /pt/bookings takes the trainer-profile id; a coach without a profile has no hours yet.
        id: t?.id ?? null,
        userId: u.id,
        name: u.name,
        avatarUrl: u.avatarUrl,
        bio: t?.bio ?? null,
        specialties: t?.specialties ?? [],
        bufferMin: t?.bufferMin ?? 10,
        availability,
        booked: taken.filter(b => b.trainerId === t?.id).map(b => ({ date: b.date.toISOString().slice(0, 10), startMin: b.startMin, endMin: b.endMin })),
      }
    })
  }

  /** Gym-floor member lookup for coaches and the desk (name/email search, active members only). */
  @Get('staff/members')
  @Roles('TRAINER', 'STAFF')
  async searchMembers(@Query('q') q?: string) {
    const needle = String(q ?? '').trim().slice(0, 80)
    if (needle.length < 2) return []
    const rows = await this.db.user.findMany({
      where: {
        role: 'MEMBER', status: 'ACTIVE',
        OR: [{ name: { contains: needle, mode: 'insensitive' } }, { email: { contains: needle, mode: 'insensitive' } }],
      },
      orderBy: { name: 'asc' },
      take: 20,
      select: { id: true, name: true, email: true, avatarUrl: true },
    })
    return rows
  }

  @Get('trainers/me')
  @Roles('TRAINER')
  async myProfile(@CurrentUser() u: ReqUser) {
    return this.ensureProfile(u.id)
  }

  @Put('trainers/me')
  @Roles('TRAINER')
  async updateMyProfile(
    @CurrentUser() u: ReqUser,
    @Body() body: { bio?: string | null; specialties?: unknown; bufferMin?: number; availability?: unknown },
  ) {
    const data: any = {}
    if (body?.bio !== undefined) {
      if (body.bio !== null && typeof body.bio !== 'string') throw bad('bio must be a string or null')
      data.bio = typeof body.bio === 'string' ? body.bio.trim().slice(0, 2000) || null : null
    }
    if (body?.specialties !== undefined) {
      if (!Array.isArray(body.specialties)) throw bad('specialties must be an array of strings')
      data.specialties = [
        ...new Set(body.specialties.map(s => (typeof s === 'string' ? s.trim().slice(0, 60) : '')).filter(Boolean)),
      ]
    }
    if (body?.bufferMin !== undefined) {
      const bm = Number(body.bufferMin)
      if (!Number.isInteger(bm) || bm < 0 || bm > 600) throw bad('bufferMin must be an integer between 0 and 600')
      data.bufferMin = bm
    }
    const slots = body?.availability !== undefined ? this.normalizeAvailability(body.availability) : null
    const trainer = await this.db.$transaction(async tx => {
      const t = await tx.trainer.upsert({ where: { userId: u.id }, create: { userId: u.id }, update: data })
      if (slots) {
        await tx.availabilitySlot.deleteMany({ where: { trainerId: t.id } })
        if (slots.length) {
          await tx.availabilitySlot.createMany({
            data: slots.map(s => ({ trainerId: t.id, weekday: s.weekday, startMin: s.startMin, endMin: s.endMin, kind: s.kind })),
          })
        }
      }
      return t
    })
    this.audit.log(u.id, 'trainer.profile.update', 'Trainer', trainer.id, { availabilityReplaced: !!slots, bufferMin: data.bufferMin })
    return this.loadProfile(u.id)
  }

  @Get('pt/bookings')
  async ptBookings(@CurrentUser() u: ReqUser) {
    const today = startOfToday()
    let rows: any[]
    if (u.role === 'MEMBER') {
      rows = await this.db.ptBooking.findMany({ where: { memberId: u.id }, take: 500, include: PT_INCLUDE })
    } else if (u.role === 'TRAINER' || u.role === 'ADMIN') {
      const t = await this.ensureProfile(u.id)
      rows = await this.db.ptBooking.findMany({ where: { trainerId: t.id }, take: 500, include: PT_INCLUDE })
    } else {
      return []
    }
    rows.sort((a, b) => {
      const au = a.date >= today
      const bu = b.date >= today
      if (au !== bu) return au ? -1 : 1
      const d = a.date.getTime() - b.date.getTime() || a.startMin - b.startMin
      return au ? d : -d
    })
    return rows.map(r => ({
      id: r.id,
      date: r.date,
      startMin: r.startMin,
      endMin: r.endMin,
      status: r.status,
      notes: r.notes,
      member: r.member,
      trainer: { id: r.trainer.id, name: r.trainer.user.name },
    }))
  }

  @Post('pt/bookings')
  @UseGuards(MembershipGuard)
  async bookPt(
    @CurrentUser() u: ReqUser,
    @Body() body: { trainerId?: string; date?: string; startMin?: number; endMin?: number; notes?: string },
  ) {
    const trainerId = String(body?.trainerId || '')
    if (!trainerId) throw bad('trainerId required')
    const startMin = Number(body?.startMin)
    const endMin = Number(body?.endMin)
    if (!Number.isInteger(startMin) || !Number.isInteger(endMin)) throw bad('startMin and endMin are required integers')
    if (startMin < 0 || endMin > 1440 || startMin >= endMin) throw bad('Window must satisfy 0 ≤ start < end ≤ 1440')
    const date = this.parseDate(body?.date)
    if (!date) throw bad('Invalid date (YYYY-MM-DD)')
    if (date < startOfToday()) throw bad('Cannot book in the past')
    const trainer = await this.db.trainer.findUnique({ where: { id: trainerId } })
    if (!trainer) throw bad('Trainer not found', 404)
    const weekday = (date.getUTCDay() + 6) % 7
    const windows = await this.db.availabilitySlot.findMany({
      where: { trainerId, weekday, kind: 'PUBLIC', isActive: true },
    })
    if (!windows.some(w => w.startMin <= startMin && endMin <= w.endMin)) {
      throw bad('Time is outside the trainer\'s public availability')
    }
    const others = await this.db.ptBooking.findMany({
      where: { trainerId, date, status: { in: ['BOOKED', 'COMPLETED'] } },
    })
    for (const o of others) {
      if (startMin < o.endMin && o.startMin < endMin) throw bad('Overlaps another session that day')
      if (o.endMin <= startMin && startMin - o.endMin < trainer.bufferMin) {
        throw bad(`Needs a ${trainer.bufferMin}min buffer after the previous session`)
      }
      if (endMin <= o.startMin && o.startMin - endMin < trainer.bufferMin) {
        throw bad(`Needs a ${trainer.bufferMin}min buffer before the next session`)
      }
    }
    try {
      const booking = await this.db.ptBooking.create({
        data: {
          memberId: u.id,
          trainerId,
          date,
          startMin,
          endMin,
          status: 'BOOKED',
          notes: typeof body?.notes === 'string' && body.notes.trim() ? body.notes.trim().slice(0, 500) : null,
        },
      })
      this.audit.log(u.id, 'pt.book', 'PtBooking', booking.id, { trainerId, date: body?.date, startMin })
      return booking
    } catch (e: any) {
      if (e?.code === 'P2002') throw bad('Time just got taken', 409)
      throw e
    }
  }

  @Post('pt/:id/cancel')
  async cancelPt(@CurrentUser() u: ReqUser, @Param('id') id: string) {
    const b = await this.db.ptBooking.findUnique({ where: { id }, include: { trainer: { select: { userId: true } } } })
    if (!b) throw bad('Booking not found', 404)
    if (b.memberId !== u.id && b.trainer.userId !== u.id) throw bad('Not your booking', 403)
    if (b.status === 'COMPLETED' || b.status === 'NO_SHOW') throw bad('Session already finished')
    if (b.status === 'CANCELLED') return { ok: true, already: true, booking: b }
    const updated = await this.db.ptBooking.update({ where: { id }, data: { status: 'CANCELLED' } })
    this.audit.log(u.id, 'pt.cancel', 'PtBooking', id, { byMember: b.memberId === u.id })
    return { ok: true, booking: updated }
  }

  @Post('pt/:id/complete')
  @Roles('TRAINER', 'ADMIN')
  async completePt(@CurrentUser() u: ReqUser, @Param('id') id: string) {
    const b = await this.db.ptBooking.findUnique({ where: { id }, include: { trainer: { select: { userId: true } } } })
    if (!b) throw bad('Booking not found', 404)
    if (u.role !== 'ADMIN' && b.trainer.userId !== u.id) throw bad('Not your session', 403)
    if (b.status === 'COMPLETED') return { ok: true, already: true, booking: b }
    if (b.status !== 'BOOKED') throw bad('Only booked sessions can be completed')
    const updated = await this.db.ptBooking.update({ where: { id }, data: { status: 'COMPLETED' } })
    this.audit.log(u.id, 'pt.complete', 'PtBooking', id)
    return { ok: true, booking: updated }
  }

  private async loadProfile(userId: string) {
    return this.db.trainer.findUnique({
      where: { userId },
      include: { availability: { orderBy: [{ weekday: 'asc' }, { startMin: 'asc' }, { endMin: 'asc' }] } },
    })
  }

  private async ensureProfile(userId: string): Promise<any> {
    const found = await this.loadProfile(userId)
    if (found) return found
    try {
      await this.db.trainer.create({ data: { userId } })
    } catch (e: any) {
      if (e?.code !== 'P2002') throw e
    }
    const created = await this.loadProfile(userId)
    if (!created) throw bad('Trainer profile could not be created', 500)
    return created
  }

  private normalizeAvailability(raw: any): { weekday: number; startMin: number; endMin: number; kind: 'PUBLIC' | 'PRIVATE_BREAK' }[] {
    if (!Array.isArray(raw)) throw bad('availability must be an array')
    const out: { weekday: number; startMin: number; endMin: number; kind: 'PUBLIC' | 'PRIVATE_BREAK' }[] = []
    const publicByDay = new Map<number, { startMin: number; endMin: number }[]>()
    for (const a of raw) {
      const weekday = Number(a?.weekday)
      const startMin = Number(a?.startMin)
      const endMin = Number(a?.endMin)
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw bad('weekday must be an integer 0–6')
      if (!Number.isInteger(startMin) || !Number.isInteger(endMin)) throw bad('startMin/endMin must be integers')
      if (startMin < 0 || endMin > 1440 || startMin >= endMin) throw bad('Window must satisfy 0 ≤ start < end ≤ 1440')
      const kind = a?.kind === 'PRIVATE_BREAK' ? ('PRIVATE_BREAK' as const) : ('PUBLIC' as const)
      if (kind === 'PUBLIC') {
        const list = publicByDay.get(weekday) ?? []
        for (const w of list) {
          if (startMin < w.endMin && w.startMin < endMin) throw bad(`Overlapping PUBLIC windows on weekday ${weekday}`)
        }
        list.push({ startMin, endMin })
        publicByDay.set(weekday, list)
      }
      out.push({ weekday, startMin, endMin, kind })
    }
    return out
  }

  private parseDate(v?: string | null): Date | null {
    if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null
    const d = new Date(v + 'T00:00:00.000Z')
    if (isNaN(d.getTime())) return null
    return d.toISOString().slice(0, 10) === v ? d : null
  }
}
