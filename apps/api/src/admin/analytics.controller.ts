import { Controller, Get, Query } from '@nestjs/common'
import { PrismaService } from '../prisma.service.js'
import { Roles, bad, startOfToday } from '../common/guards.js'

const DAY_MS = 86400000

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS)
const pad2 = (n: number) => String(n).padStart(2, '0')
const ymKey = (d: Date) => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`
const clampInt = (v: any, lo: number, hi: number, dflt: number) => {
  const n = Number.parseInt(String(v ?? ''), 10)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt
}
const dateParam = (s: any): Date | null => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(s + 'T00:00:00.000Z')
  return isNaN(d.getTime()) ? null : d
}
const monthStartAgo = (count: number) => {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (count - 1), 1))
}
const monthKeys = (count: number) => {
  const keys: string[] = []
  for (let i = count - 1; i >= 0; i--) keys.push(ymKey(monthStartAgo(i + 1)))
  return keys
}

@Controller()
export class AnalyticsController {
  constructor(private db: PrismaService) {}

  @Roles('ADMIN')
  @Get('admin/overview')
  async overview() {
    const today = startOfToday()
    const tomorrow = addDays(today, 1)
    const yesterday = addDays(today, -1)
    const now = new Date()
    const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes()
    const [groups, daypassAgg, checkinsToday, bookedToday, noShowsYesterday, slots, todaysBookings, expiring7, pendingApprovals, activeRows, totalMembers] =
      await Promise.all([
        this.db.payment.groupBy({ by: ['method'], where: { status: 'PAID', paidAt: { gte: today, lt: tomorrow } }, _sum: { amountPaise: true } }),
        this.db.dayPassSale.aggregate({ where: { date: { gte: today, lt: tomorrow } }, _sum: { amountPaise: true } }),
        this.db.booking.count({ where: { status: 'CHECKED_IN', slot: { date: { gte: today, lt: tomorrow } } } }),
        this.db.booking.count({ where: { status: { in: ['BOOKED', 'CHECKED_IN'] }, slot: { date: { gte: today, lt: tomorrow } } } }),
        this.db.booking.count({ where: { status: 'NO_SHOW', slot: { date: { gte: yesterday, lt: today } } } }),
        this.db.slotInstance.findMany({ where: { date: { gte: today, lt: tomorrow } }, orderBy: [{ startMin: 'asc' }, { endMin: 'asc' }] }),
        this.db.booking.findMany({
          where: { status: { in: ['BOOKED', 'CHECKED_IN'] }, slot: { date: { gte: today, lt: tomorrow } } },
          select: { status: true, slotId: true, slot: { select: { startMin: true, endMin: true } } },
        }),
        this.db.membership.count({ where: { endDate: { gte: today, lt: addDays(today, 7) } } }),
        this.db.user.count({ where: { status: 'PENDING', role: 'MEMBER' } }),
        this.db.membership.groupBy({ by: ['userId'], where: { endDate: { gte: today } } }),
        this.db.user.count({ where: { role: 'MEMBER' } }),
      ])
    const byMethod: Record<string, number> = {}
    let paidSumPaise = 0
    for (const g of groups) {
      const sum = g._sum.amountPaise ?? 0
      byMethod[g.method] = sum
      paidSumPaise += sum
    }
    const daypassSalePaise = daypassAgg._sum.amountPaise ?? 0
    const cashTodayPaise = byMethod.CASH ?? 0
    const cardTodayPaise = byMethod.CARD_POS ?? 0
    const onlineTodayPaise = byMethod.ONLINE ?? 0
    const daypassTodayPaise = daypassSalePaise + (byMethod.DAY_PASS ?? 0)
    const revenueTodayPaise = paidSumPaise + daypassSalePaise

    const liveNow = (s: { startMin: number; endMin: number }) => s.startMin <= nowMin && nowMin < s.endMin
    const checkedInNow = todaysBookings.filter(b => b.status === 'CHECKED_IN' && liveNow(b.slot)).length
    const capacityNow = slots.filter(liveNow).reduce((sum, s) => sum + s.capacity, 0)

    const bookedPerSlot = new Map<string, number>()
    for (const b of todaysBookings) bookedPerSlot.set(b.slotId, (bookedPerSlot.get(b.slotId) ?? 0) + 1)
    const hourAcc = new Map<number, { booked: number; capacity: number }>()
    for (const s of slots) {
      const h = Math.floor(s.startMin / 60)
      const e = hourAcc.get(h) ?? { booked: 0, capacity: 0 }
      e.booked += bookedPerSlot.get(s.id) ?? 0
      e.capacity += s.capacity
      hourAcc.set(h, e)
    }
    const fillByHour = [...hourAcc.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([h, e]) => ({ label: pad2(h), pct: e.capacity ? Math.round((e.booked / e.capacity) * 100) : 0 }))

    return {
      revenueTodayPaise,
      cashTodayPaise,
      cardTodayPaise,
      onlineTodayPaise,
      daypassTodayPaise,
      checkinsToday,
      bookedToday,
      noShowsYesterday,
      liveOccupancyNow: { checkedInNow, capacityNow },
      expiring7,
      pendingApprovals,
      activeMembers: activeRows.length,
      totalMembers,
      fillByHour,
    }
  }

  @Roles('ADMIN')
  @Get('admin/revenue')
  async revenue(@Query('months') months?: string) {
    const m = clampInt(months, 1, 24, 6)
    const rows = await this.db.payment.findMany({
      where: { status: 'PAID', paidAt: { gte: monthStartAgo(m) } },
      select: { paidAt: true, method: true, amountPaise: true },
    })
    const keys = monthKeys(m)
    const acc = new Map<string, { onlinePaise: number; cashPaise: number; cardPaise: number; otherPaise: number; count: number }>()
    for (const k of keys) acc.set(k, { onlinePaise: 0, cashPaise: 0, cardPaise: 0, otherPaise: 0, count: 0 })
    for (const p of rows) {
      if (!p.paidAt) continue
      const b = acc.get(ymKey(new Date(p.paidAt)))
      if (!b) continue
      if (p.method === 'ONLINE') b.onlinePaise += p.amountPaise
      else if (p.method === 'CASH') b.cashPaise += p.amountPaise
      else if (p.method === 'CARD_POS') b.cardPaise += p.amountPaise
      else b.otherPaise += p.amountPaise
      b.count++
    }
    return keys.map(k => {
      const b = acc.get(k)!
      return {
        ym: k,
        onlinePaise: b.onlinePaise,
        cashPaise: b.cashPaise,
        cardPaise: b.cardPaise,
        totalPaise: b.onlinePaise + b.cashPaise + b.cardPaise + b.otherPaise,
        count: b.count,
      }
    })
  }

  @Roles('ADMIN')
  @Get('admin/members-growth')
  async membersGrowth(@Query('months') months?: string) {
    const m = clampInt(months, 1, 24, 6)
    const rangeStart = monthStartAgo(m)
    const tomorrow = addDays(startOfToday(), 1)
    const [users, mems] = await Promise.all([
      this.db.user.findMany({ where: { role: 'MEMBER', createdAt: { gte: rangeStart } }, select: { createdAt: true } }),
      this.db.membership.findMany({ where: { endDate: { gte: rangeStart, lt: tomorrow } }, select: { endDate: true } }),
    ])
    const keys = monthKeys(m)
    const acc = new Map<string, { newMembers: number; expired: number }>()
    for (const k of keys) acc.set(k, { newMembers: 0, expired: 0 })
    for (const u of users) {
      const b = acc.get(ymKey(u.createdAt))
      if (b) b.newMembers++
    }
    for (const mm of mems) {
      const b = acc.get(ymKey(mm.endDate))
      if (b) b.expired++
    }
    return keys.map(k => ({ ym: k, ...acc.get(k)! }))
  }

  @Roles('ADMIN')
  @Get('admin/attendance')
  async attendance(@Query() q: any) {
    const today = startOfToday()
    const from = q?.from ? dateParam(q.from) : addDays(today, -29)
    const to = q?.to ? dateParam(q.to) : today
    if (!from || !to) throw bad('from/to must be YYYY-MM-DD')
    if (from > to) throw bad('from must be on or before to')
    const toEx = addDays(to, 1)
    const [slots, bookings] = await Promise.all([
      this.db.slotInstance.findMany({
        where: { date: { gte: from, lt: toEx } },
        select: { id: true, startMin: true, capacity: true },
      }),
      this.db.booking.findMany({
        where: { status: { not: 'CANCELLED' }, slot: { date: { gte: from, lt: toEx } } },
        select: { status: true, slotId: true, slot: { select: { date: true } } },
      }),
    ])
    const dayAcc = new Map<string, { checkins: number; booked: number }>()
    for (let d = new Date(from); d < toEx; d = addDays(d, 1)) dayAcc.set(d.toISOString().slice(0, 10), { checkins: 0, booked: 0 })
    const slotFill = new Map<string, number>()
    let noShows = 0
    for (const b of bookings) {
      const day = dayAcc.get(b.slot.date.toISOString().slice(0, 10))
      if (b.status === 'NO_SHOW') noShows++
      if (b.status === 'BOOKED' || b.status === 'CHECKED_IN') {
        if (day) day.booked++
        slotFill.set(b.slotId, (slotFill.get(b.slotId) ?? 0) + 1)
      }
      if (b.status === 'CHECKED_IN' && day) day.checkins++
    }
    const byDay = [...dayAcc.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([date, v]) => ({ date, checkins: v.checkins, booked: v.booked }))
    const perStart = new Map<number, { fill: number; count: number }>()
    for (const s of slots) {
      if (!s.capacity) continue
      const e = perStart.get(s.startMin) ?? { fill: 0, count: 0 }
      e.fill += (slotFill.get(s.id) ?? 0) / s.capacity
      e.count++
      perStart.set(s.startMin, e)
    }
    const peakSlots = [...perStart.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([startMin, e]) => ({ startMin, avgFill: Math.round((e.fill / e.count) * 100) / 100 }))
    const noShowRate = bookings.length ? Math.round((noShows / bookings.length) * 1000) / 1000 : 0
    return { byDay, peakSlots, noShowRate }
  }

  @Roles('ADMIN')
  @Get('admin/popular-exercises')
  async popularExercises(@Query('days') days?: string) {
    const n = clampInt(days, 1, 365, 30)
    const since = addDays(startOfToday(), -(n - 1))
    const logs = await this.db.workoutLog.findMany({
      where: { date: { gte: since } },
      orderBy: { date: 'desc' },
      take: 5000,
      select: { entries: true },
    })
    const counts = new Map<string, number>()
    for (const log of logs) {
      const entries = Array.isArray(log.entries) ? (log.entries as any[]) : []
      for (const e of entries) {
        const id = typeof e?.id === 'string' ? e.id : ''
        if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
      }
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
    const ids = top.map(([id]) => id)
    const exs = ids.length
      ? await this.db.exercise.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, bodypart: true } })
      : []
    const emap = new Map(exs.map(x => [x.id, x]))
    return top.map(([id, count]) => ({
      id,
      count,
      name: emap.get(id)?.name ?? null,
      bodypart: emap.get(id)?.bodypart ?? null,
    }))
  }
}
