import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common'
import { PrismaService } from '../prisma.service.js'
import { CurrentUser, MembershipGuard, ReqUser, bad, startOfToday } from '../common/guards.js'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function parseDate(s?: string): Date | null {
  if (!s || !DATE_RE.test(s)) return null
  const d = new Date(s + 'T00:00:00.000Z')
  return isNaN(d.getTime()) ? null : d
}

function optDate(v: any): Date | null {
  if (v == null || v === '') return null
  const d = new Date(String(v))
  if (isNaN(d.getTime())) throw bad('Invalid datetime')
  return d
}

function num0(v: any): number {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

@Controller('workouts')
export class WorkoutsController {
  constructor(private db: PrismaService) {}

  @Post()
  @UseGuards(MembershipGuard)
  async save(@CurrentUser() u: ReqUser, @Body() body: any) {
    const id = String(body?.id ?? '')
    if (!id) throw bad('id required')
    if (id.length > 64) throw bad('id too long (max 64)')
    const date = parseDate(body?.date)
    if (!date) throw bad('Invalid or missing date (YYYY-MM-DD)')
    if (!Array.isArray(body?.entries)) throw bad('entries must be an array')
    if (body.entries.length > 500) throw bad('Too many entries (max 500)')
    const existing = await this.db.workoutLog.findUnique({ where: { id } })
    if (existing) return { ok: true, duplicate: true }
    try {
      await this.db.workoutLog.create({
        data: {
          id,
          userId: u.id,
          date,
          startedAt: optDate(body.startedAt),
          endedAt: optDate(body.endedAt),
          routineName: body.routineName != null ? String(body.routineName) : null,
          totalVolume: num0(body.totalVolume),
          prCount: Math.round(num0(body.prCount)),
          offSite: !!body.offSite,
          entries: body.entries,
        },
      })
      return { ok: true }
    } catch (e: any) {
      if (e?.code === 'P2002') return { ok: true, duplicate: true }
      throw e
    }
  }

  @Get()
  async history(@CurrentUser() u: ReqUser, @Query('from') from?: string, @Query('to') to?: string, @Query('limit') limit?: string) {
    const parsed = parseInt(limit ?? '', 10)
    const lim = Math.min(Math.max(Number.isFinite(parsed) ? parsed : 60, 1), 200)
    const where: any = { userId: u.id, deletedAt: null }
    const f = parseDate(from)
    const t = parseDate(to)
    if (f || t) {
      where.date = {}
      if (f) where.date.gte = f
      if (t) where.date.lte = t
    }
    const rows = await this.db.workoutLog.findMany({ where, orderBy: { date: 'desc' }, take: lim })
    return rows.map(r => ({ ...r, entries: r.entries }))
  }

  @Get('stats')
  async stats(@CurrentUser() u: ReqUser) {
    const today = startOfToday()
    const weekAgo = new Date(today)
    weekAgo.setUTCDate(weekAgo.getUTCDate() - 6)
    const [agg, dates, thisWeek] = await Promise.all([
      this.db.workoutLog.aggregate({
        where: { userId: u.id, deletedAt: null },
        _count: { _all: true },
        _sum: { totalVolume: true },
      }),
      this.db.workoutLog.findMany({
        where: { userId: u.id, deletedAt: null },
        select: { date: true },
        distinct: ['date'],
        orderBy: { date: 'desc' },
        take: 90,
      }),
      this.db.workoutLog.count({ where: { userId: u.id, deletedAt: null, date: { gte: weekAgo } } }),
    ])
    const last90 = dates.map(r => r.date.toISOString().slice(0, 10))
    const weekOf = (iso: string) => Math.floor(Date.parse(iso + 'T00:00:00Z') / 86400000 / 7)
    const weeks = new Set(last90.map(weekOf))
    let w = weekOf(today.toISOString().slice(0, 10))
    if (!weeks.has(w)) w -= 1
    let streakWeeks = 0
    while (weeks.has(w)) {
      streakWeeks += 1
      w -= 1
    }
    return {
      count: agg._count._all,
      volumeTotal: agg._sum.totalVolume ?? 0,
      thisWeek,
      streakWeeks,
      last90,
    }
  }

  @Delete(':id')
  async remove(@CurrentUser() u: ReqUser, @Param('id') id: string) {
    const log = await this.db.workoutLog.findUnique({ where: { id } })
    if (!log || log.userId !== u.id) throw bad('Not found', 404)
    const cutoff = startOfToday()
    cutoff.setUTCDate(cutoff.getUTCDate() - 30)
    if (new Date(log.date) < cutoff) throw bad('Too old to delete', 403)
    await this.db.workoutLog.update({ where: { id }, data: { deletedAt: new Date() } })
    return { ok: true }
  }
}
