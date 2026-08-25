import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Res } from '@nestjs/common'
import type { Response } from 'express'
import { randomBytes } from 'node:crypto'
import { PrismaService } from '../prisma.service.js'
import { CurrentUser, ReqUser, Roles, bad, startOfToday, membershipStatus } from '../common/guards.js'
import { SettingsService, AuditService } from '../common/services.js'

const DAY_MS = 86400000
const EXPORT_MAX_ROWS = 50000
const ROLES_ALL = ['ADMIN', 'TRAINER', 'STAFF', 'MEMBER']
const PAY_STATUSES = ['CREATED', 'PAID', 'FAILED', 'REFUNDED']
const PAY_METHODS = ['ONLINE', 'CASH', 'CARD_POS', 'DAY_PASS']

const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS)
const isoDate = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : null)
const paging = (q: any) => {
  const page = Math.max(1, parseInt(q?.page, 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(q?.pageSize, 10) || 25))
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize }
}
const dateParam = (s: any): Date | null => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(s + 'T00:00:00.000Z')
  return isNaN(d.getTime()) ? null : d
}
const optStr = (v: any, max: number) => {
  if (v === undefined || v === null) return null
  const s = String(v).trim().slice(0, max)
  return s || null
}
const intOrThrow = (v: any, name: string, min: number, max: number) => {
  const n = Number(v)
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${name} must be an integer between ${min} and ${max}`)
  return n
}
const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}
const csvRow = (cells: unknown[]) => cells.map(csvCell).join(',')

@Controller()
export class AdminController {
  constructor(private db: PrismaService, private settings: SettingsService, private audit: AuditService) {}

  /* ------------------------------- users ------------------------------- */

  @Get('admin/users')
  @Roles('ADMIN')
  async listUsers(@Query() q: any) {
    const { page, pageSize, skip, take } = paging(q)
    const where: any = {}
    if (['PENDING', 'ACTIVE', 'DISABLED'].includes(q?.status)) where.status = q.status
    if (ROLES_ALL.includes(q?.role)) where.role = q.role
    if (q?.q) {
      const needle = String(q.q)
      where.OR = [
        { name: { contains: needle, mode: 'insensitive' } },
        { email: { contains: needle, mode: 'insensitive' } },
      ]
    }
    const rows = await this.db.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: { id: true, name: true, email: true, avatarUrl: true, role: true, status: true, createdAt: true },
    })
    const total = await this.db.user.count({ where })
    const ids = rows.map(r => r.id)
    const mems = ids.length
      ? await this.db.membership.findMany({
          where: { userId: { in: ids } },
          orderBy: { endDate: 'desc' },
          include: { plan: { select: { name: true } } },
        })
      : []
    const latest = new Map<string, any>()
    for (const m of mems) if (!latest.has(m.userId)) latest.set(m.userId, m)
    return {
      rows: rows.map(u => {
        const m = latest.get(u.id)
        return {
          ...u,
          membershipEnd: m ? m.endDate.toISOString() : null,
          membershipStatus: m ? membershipStatus(m as any).info.status : null,
        }
      }),
      total,
      page,
      pageSize,
    }
  }

  @Get('admin/users/pending-count')
  @Roles('ADMIN')
  async pendingCount() {
    const count = await this.db.user.count({ where: { status: 'PENDING', role: 'MEMBER' } })
    return { count }
  }

  @Post('admin/users/approve')
  @Roles('ADMIN')
  async approveUsers(@CurrentUser() u: ReqUser, @Body() body: any) {
    const ids = Array.isArray(body?.ids) ? body.ids.filter((x: any) => typeof x === 'string' && x) : []
    if (!ids.length) throw bad('ids must be a non-empty array of user ids')
    const r = await this.db.user.updateMany({ where: { id: { in: ids }, status: 'PENDING' }, data: { status: 'ACTIVE' } })
    this.audit.log(u.id, 'user.approve', undefined, undefined, { ids, count: r.count })
    return { count: r.count }
  }

  @Post('admin/users/disable')
  @Roles('ADMIN')
  async setUserDisabled(@CurrentUser() u: ReqUser, @Body() body: any) {
    const id = String(body?.id || '')
    const disabled = !!body?.disabled
    if (!id) throw bad('id required')
    if (disabled && id === u.id) throw bad('You cannot disable your own account')
    const target = await this.db.user.findUnique({ where: { id } })
    if (!target) throw bad('User not found', 404)
    if (disabled && target.role === 'ADMIN') {
      const activeAdmins = await this.db.user.count({ where: { role: 'ADMIN', status: 'ACTIVE' } })
      if (activeAdmins <= 1) throw bad('Cannot disable the last active admin', 409)
    }
    await this.db.$transaction(async tx => {
      await tx.user.update({ where: { id }, data: { status: disabled ? 'DISABLED' : 'ACTIVE' } })
      if (disabled) {
        await tx.session.deleteMany({ where: { userId: id } })
        await tx.booking.updateMany({
          where: { userId: id, status: 'BOOKED', slot: { date: { gte: startOfToday() } } },
          data: { status: 'CANCELLED' },
        })
      }
    })
    this.audit.log(u.id, disabled ? 'user.disable' : 'user.enable', 'User', id, { email: target.email })
    return { ok: true, id, status: disabled ? 'DISABLED' : 'ACTIVE' }
  }

  @Post('admin/users/role')
  @Roles('ADMIN')
  async setUserRole(@CurrentUser() u: ReqUser, @Body() body: any) {
    const id = String(body?.id || '')
    const role = String(body?.role || '')
    if (!id) throw bad('id required')
    if (!ROLES_ALL.includes(role)) throw bad('Invalid role')
    const target = await this.db.user.findUnique({ where: { id } })
    if (!target) throw bad('User not found', 404)
    if (target.role === 'ADMIN' && role !== 'ADMIN') {
      const activeAdmins = await this.db.user.count({ where: { role: 'ADMIN', status: 'ACTIVE' } })
      if (activeAdmins <= 1) throw bad('Cannot demote the last active admin', 409)
    }
    await this.db.$transaction(async tx => {
      await tx.user.update({ where: { id }, data: { role: role as any } })
      if (role === 'TRAINER') await tx.trainer.upsert({ where: { userId: id }, create: { userId: id }, update: {} })
    })
    this.audit.log(u.id, 'user.role', 'User', id, { from: target.role, to: role })
    return { ok: true, id, role }
  }

  /* ------------------------------ payments ----------------------------- */

  @Get('admin/payments')
  @Roles('ADMIN')
  async listPayments(@Query() q: any) {
    const { page, pageSize, skip, take } = paging(q)
    const where: any = {}
    if (PAY_STATUSES.includes(q?.status)) where.status = q.status
    if (PAY_METHODS.includes(q?.method)) where.method = q.method
    if (q?.q) {
      const needle = String(q.q)
      where.OR = [
        { razorpayOrderId: { contains: needle, mode: 'insensitive' } },
        { razorpayPaymentId: { contains: needle, mode: 'insensitive' } },
        { utr: { contains: needle, mode: 'insensitive' } },
        { user: { email: { contains: needle, mode: 'insensitive' } } },
      ]
    }
    const [rows, total] = await Promise.all([
      this.db.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: {
          user: { select: { name: true, email: true } },
          plan: { select: { name: true } },
        },
      }),
      this.db.payment.count({ where }),
    ])
    return {
      rows: rows.map(p => ({
        id: p.id,
        userId: p.userId,
        userName: p.user.name,
        userEmail: p.user.email,
        amountPaise: p.amountPaise,
        method: p.method,
        status: p.status,
        planName: p.plan?.name ?? null,
        razorpayOrderId: p.razorpayOrderId,
        razorpayPaymentId: p.razorpayPaymentId,
        utr: p.utr,
        note: p.note,
        disputeNote: p.disputeNote,
        disputedAt: p.disputedAt,
        resolvedAt: p.resolvedAt,
        paidAt: p.paidAt,
        createdAt: p.createdAt,
      })),
      total,
      page,
      pageSize,
    }
  }

  @Post('admin/payments/manual')
  @Roles('ADMIN')
  async manualPayment(@CurrentUser() u: ReqUser, @Body() body: any) {
    const userId = String(body?.userId || '')
    const method = String(body?.method || '')
    if (!userId) throw bad('userId required')
    if (!['CASH', 'CARD_POS'].includes(method)) throw bad("method must be 'CASH' or 'CARD_POS'")
    const user = await this.db.user.findUnique({ where: { id: userId } })
    if (!user) throw bad('User not found', 404)
    let plan: any = null
    if (body?.planId) {
      plan = await this.db.plan.findUnique({ where: { id: String(body.planId) } })
      if (!plan) throw bad('Plan not found', 404)
    }
    const amountPaise = Number(body?.amountPaise ?? plan?.pricePaise)
    if (!Number.isInteger(amountPaise) || amountPaise <= 0) throw bad('amountPaise must be a positive integer')
    const paidAt = new Date()
    const payment = await this.db.$transaction(async tx => {
      const p = await tx.payment.create({
        data: {
          userId,
          planId: plan?.id,
          amountPaise,
          method: method as any,
          status: 'PAID',
          note: optStr(body?.note, 500),
          recordedById: u.id,
          paidAt,
        },
      })
      if (plan) {
        const today = startOfToday()
        const latest = await tx.membership.findFirst({ where: { userId }, orderBy: { endDate: 'desc' } })
        const latestEnd = latest ? new Date(latest.endDate).getTime() : -Infinity
        const endDate = new Date(Math.max(today.getTime(), latestEnd) + plan.durationDays * DAY_MS)
        const membership =
          latest && latestEnd >= today.getTime()
            ? await tx.membership.update({
                where: { id: latest.id },
                data: { endDate, status: 'ACTIVE', planId: plan.id, frozenUntil: null },
              })
            : await tx.membership.create({
                data: { userId, planId: plan.id, startDate: today, endDate, status: 'ACTIVE' },
              })
        await tx.payment.update({ where: { id: p.id }, data: { membershipId: membership.id } })
      }
      return p
    })
    this.audit.log(u.id, 'payment.manual', 'Payment', payment.id, {
      userId,
      amountPaise,
      method,
      planId: plan?.id ?? null,
    })
    return { id: payment.id, userId, amountPaise, method, planId: plan?.id ?? null, paidAt }
  }

  @Post('admin/payments/match-utr')
  @Roles('ADMIN')
  async matchUtr(@CurrentUser() u: ReqUser, @Body() body: any) {
    const paymentId = String(body?.paymentId || '')
    const utr = optStr(body?.utr, 100)
    if (!paymentId) throw bad('paymentId required')
    if (!utr) throw bad('utr required')
    const existing = await this.db.payment.findUnique({ where: { id: paymentId } })
    if (!existing) throw bad('Payment not found', 404)
    if (existing.method !== 'ONLINE') throw bad('UTR matching applies to ONLINE payments only')
    const payment = await this.db.payment.update({ where: { id: paymentId }, data: { utr } })
    this.audit.log(u.id, 'payment.utr.match', 'Payment', paymentId, { utr })
    return payment
  }

  @Post('admin/payments/:id/refund-mark')
  @Roles('ADMIN')
  async refundMark(@CurrentUser() u: ReqUser, @Param('id') id: string, @Body() body: any) {
    const result = await this.db.$transaction(async tx => {
      const p = await tx.payment.findUnique({ where: { id }, include: { membership: true } })
      if (!p) throw bad('Payment not found', 404)
      const note = optStr(body?.note, 1000)
      const payment = await tx.payment.update({
        where: { id },
        data: { status: 'REFUNDED', resolvedAt: new Date(), ...(note ? { note } : {}) },
      })
      const today = startOfToday()
      if (p.membership && new Date(p.membership.endDate) > today) {
        await tx.membership.update({ where: { id: p.membership.id }, data: { endDate: today } })
      }
      return payment
    })
    this.audit.log(u.id, 'payment.refund.mark', 'Payment', id)
    return result
  }

  @Post('admin/payments/:id/dispute')
  @Roles('ADMIN')
  async markDispute(@CurrentUser() u: ReqUser, @Param('id') id: string, @Body() body: any) {
    const existing = await this.db.payment.findUnique({ where: { id } })
    if (!existing) throw bad('Payment not found', 404)
    const disputeNote = optStr(body?.note, 1000)
    if (!disputeNote) throw bad('note required')
    const payment = await this.db.payment.update({ where: { id }, data: { disputeNote, disputedAt: new Date() } })
    this.audit.log(u.id, 'payment.dispute', 'Payment', id, { disputeNote })
    return payment
  }

  @Post('admin/payments/:id/resolve-dispute')
  @Roles('ADMIN')
  async resolveDispute(@CurrentUser() u: ReqUser, @Param('id') id: string, @Body() body: any) {
    const existing = await this.db.payment.findUnique({ where: { id } })
    if (!existing) throw bad('Payment not found', 404)
    const note = optStr(body?.note, 1000)
    const payment = await this.db.payment.update({
      where: { id },
      data: { resolvedAt: new Date(), ...(note ? { note } : {}) },
    })
    this.audit.log(u.id, 'payment.dispute.resolve', 'Payment', id, { hadDispute: !!existing.disputedAt })
    return payment
  }

  /* -------------------------------- plans ------------------------------ */

  @Get('admin/plans')
  @Roles('ADMIN')
  async listPlans() {
    const rows = await this.db.plan.findMany({ orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })
    return rows
  }

  @Post('admin/plans')
  @Roles('ADMIN')
  async createPlan(@CurrentUser() u: ReqUser, @Body() body: any) {
    const name = optStr(body?.name, 120)
    if (!name) throw bad('name required')
    const pricePaise = intOrThrow(body?.pricePaise, 'pricePaise', 0, 100000000)
    const durationDays = intOrThrow(body?.durationDays, 'durationDays', 1, 3650)
    const sortOrder = body?.sortOrder !== undefined ? intOrThrow(body.sortOrder, 'sortOrder', 0, 10000) : 0
    const plan = await this.db.plan.create({
      data: { name, pricePaise, durationDays, sortOrder, description: optStr(body?.description, 500) },
    })
    this.audit.log(u.id, 'plan.create', 'Plan', plan.id, { name, pricePaise, durationDays })
    return plan
  }

  @Patch('admin/plans/:id')
  @Roles('ADMIN')
  async updatePlan(@CurrentUser() u: ReqUser, @Param('id') id: string, @Body() body: any) {
    const data: any = {}
    if (body?.name !== undefined) {
      const name = optStr(body.name, 120)
      if (!name) throw bad('name required')
      data.name = name
    }
    if (body?.pricePaise !== undefined) data.pricePaise = intOrThrow(body.pricePaise, 'pricePaise', 0, 100000000)
    if (body?.durationDays !== undefined) data.durationDays = intOrThrow(body.durationDays, 'durationDays', 1, 3650)
    if (body?.sortOrder !== undefined) data.sortOrder = intOrThrow(body.sortOrder, 'sortOrder', 0, 10000)
    if (body?.isActive !== undefined) data.isActive = !!body.isActive
    if (body?.description !== undefined) data.description = optStr(body.description, 500)
    if (!Object.keys(data).length) throw bad('Nothing to update')
    const plan = await this.db.plan.update({ where: { id }, data }).catch(() => null)
    if (!plan) throw bad('Plan not found', 404)
    this.audit.log(u.id, 'plan.update', 'Plan', id, data)
    return plan
  }

  @Delete('admin/plans/:id')
  @Roles('ADMIN')
  async deletePlan(@CurrentUser() u: ReqUser, @Param('id') id: string) {
    const used = await this.db.membership.count({ where: { planId: id } })
    if (used > 0) throw bad('Deactivate instead', 409)
    try {
      await this.db.plan.delete({ where: { id } })
    } catch (e: any) {
      if (e?.code === 'P2025') throw bad('Plan not found', 404)
      if (e?.code === 'P2003') throw bad('Plan has recorded payments — deactivate instead', 409)
      throw e
    }
    this.audit.log(u.id, 'plan.delete', 'Plan', id)
    return { ok: true }
  }

  /* ------------------------------ settings ----------------------------- */

  @Get('admin/settings')
  @Roles('ADMIN')
  async getSettings() {
    return this.settings.get()
  }

  @Put('admin/settings')
  @Roles('ADMIN')
  async putSettings(@CurrentUser() u: ReqUser, @Body() body: any) {
    const current = await this.settings.get()
    const data: any = {}
    if (body?.gymName !== undefined) {
      const gymName = optStr(body.gymName, 120)
      if (!gymName) throw bad('gymName required')
      data.gymName = gymName
    }
    const numeric: Array<[string, number, number]> = [
      ['openMin', 0, 1440],
      ['closeMin', 0, 1440],
      ['bookingWindowDays', 1, 60],
      ['cancelCutoffMin', 0, 1440],
      ['graceCancelPerMonth', 0, 10],
      ['freezeMaxDays', 0, 366],
      ['freezeMaxPerYear', 0, 52],
      ['dayPassPricePaise', 0, 10000000],
      ['noShowStrikes', 0, 20],
    ]
    for (const [key, min, max] of numeric) {
      if (body?.[key] !== undefined) data[key] = intOrThrow(body[key], key, min, max)
    }
    const openMin = data.openMin ?? current.openMin
    const closeMin = data.closeMin ?? current.closeMin
    if (openMin >= closeMin) throw bad('openMin must be earlier than closeMin')
    const saved = await this.db.gymSettings.upsert({ where: { id: 'main' }, create: { id: 'main', ...data }, update: data })
    this.settings.invalidate()
    this.audit.log(u.id, 'settings.update', 'GymSettings', 'main', data)
    return saved
  }

  /* -------------------------------- misc ------------------------------- */

  @Get('admin/templates')
  @Roles('ADMIN')
  async listTemplates() {
    const rows = await this.db.gymSlotTemplate.findMany({ orderBy: [{ weekday: 'asc' }, { startMin: 'asc' }] })
    return rows.map(t => ({ id: t.id, name: t.name, weekday: t.weekday, startMin: t.startMin, endMin: t.endMin, capacity: t.capacity, isActive: t.isActive }))
  }

  @Get('admin/audit')
  @Roles('ADMIN')
  async listAudit(@Query() q: any) {
    const { page, pageSize, skip, take } = paging(q)
    const [rows, total] = await Promise.all([
      this.db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, skip, take }),
      this.db.auditLog.count(),
    ])
    const actorIds = [...new Set(rows.map(r => r.actorId).filter(Boolean) as string[])]
    const actors = actorIds.length
      ? await this.db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } })
      : []
    const amap = new Map(actors.map(a => [a.id, a]))
    return {
      rows: rows.map(r => ({
        id: r.id,
        actorId: r.actorId,
        actorName: r.actorId ? amap.get(r.actorId)?.name ?? null : null,
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        meta: r.meta,
        createdAt: r.createdAt,
      })),
      total,
      page,
      pageSize,
    }
  }

  @Post('admin/daypass')
  @Roles('ADMIN')
  async createDayPass(@CurrentUser() u: ReqUser, @Body() body: any) {
    const name = optStr(body?.name, 120)
    if (!name) throw bad('name required')
    const s = await this.settings.get()
    const amountPaise = Number(body?.amountPaise ?? s.dayPassPricePaise)
    if (!Number.isInteger(amountPaise) || amountPaise < 0) throw bad('amountPaise must be a non-negative integer')
    const sale = await this.db.dayPassSale.create({
      data: {
        name,
        phone: optStr(body?.phone, 20),
        amountPaise,
        date: startOfToday(),
        code: randomBytes(4).toString('hex').toUpperCase(),
        recordedById: u.id,
      },
    })
    this.audit.log(u.id, 'daypass.create', 'DayPassSale', sale.id, { name, amountPaise })
    return { id: sale.id, code: sale.code }
  }

  @Get('admin/daypass')
  @Roles('ADMIN')
  async listDayPass(@Query('date') date?: string) {
    const d = date ? dateParam(date) : startOfToday()
    if (!d) throw bad('date must be YYYY-MM-DD')
    const rows = await this.db.dayPassSale.findMany({ where: { date: d }, orderBy: { createdAt: 'desc' } })
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      amountPaise: r.amountPaise,
      date: r.date,
      code: r.code,
      checkedInAt: r.checkedInAt,
      createdAt: r.createdAt,
    }))
  }

  @Post('admin/daypass/:id/checkin')
  @Roles('ADMIN')
  async dayPassCheckin(@CurrentUser() u: ReqUser, @Param('id') id: string) {
    const existing = await this.db.dayPassSale.findUnique({ where: { id } })
    if (!existing) throw bad('Day pass not found', 404)
    const sale = await this.db.dayPassSale.update({ where: { id }, data: { checkedInAt: new Date() } })
    this.audit.log(u.id, 'daypass.checkin', 'DayPassSale', id, { code: existing.code })
    return sale
  }

  @Post('admin/announcements')
  @Roles('ADMIN')
  async sendAnnouncement(@CurrentUser() u: ReqUser, @Body() body: any) {
    const title = optStr(body?.title, 200)
    const text = optStr(body?.body, 4000)
    const audience = String(body?.audience || '')
    if (!title) throw bad('title required')
    if (!text) throw bad('body required')
    if (!['ALL', 'ACTIVE', 'EXPIRING', 'LAPSED'].includes(audience)) throw bad('audience must be ALL, ACTIVE, EXPIRING or LAPSED')
    const today = startOfToday()
    let ids: string[] = []
    if (audience === 'ALL') {
      const users = await this.db.user.findMany({ where: { status: 'ACTIVE' }, select: { id: true }, take: 5000 })
      ids = users.map(x => x.id)
    } else {
      const w: any =
        audience === 'ACTIVE'
          ? { endDate: { gte: today } }
          : audience === 'EXPIRING'
            ? { endDate: { gte: today, lt: addDays(today, 7) } }
            : { endDate: { lt: today, gte: addDays(today, -60) } }
      const ms = await this.db.membership.findMany({ where: w, select: { userId: true }, distinct: ['userId'], take: 5000 })
      ids = ms.map(m => m.userId)
    }
    ids = [...new Set(ids)].slice(0, 5000)
    const announcement = await this.db.announcement.create({
      data: { title, body: text, audience: audience as any, sentById: u.id, sentCount: ids.length },
    })
    this.audit.log(u.id, 'announcement.send', 'Announcement', announcement.id, { audience, count: ids.length })
    return { announcement, userIds: ids }
  }

  @Get('admin/trainers')
  @Roles('ADMIN')
  async trainers() {
    const users = await this.db.user.findMany({
      where: { role: 'TRAINER' },
      orderBy: { name: 'asc' },
      include: { trainerProfile: { include: { availability: true } } },
    })
    const userIds = users.map(x => x.id)
    const profileIds = users.map(x => x.trainerProfile?.id).filter(Boolean) as string[]
    const today = startOfToday()
    const [pts, enrolls] = await Promise.all([
      this.db.ptBooking.findMany({ where: { trainerId: { in: profileIds } }, select: { trainerId: true, status: true, date: true } }),
      this.db.programEnrollment.findMany({
        where: { OR: [{ assignedById: { in: userIds } }, { attributedTrainerId: { in: userIds } }] },
        select: { memberId: true, assignedById: true, attributedTrainerId: true },
      }),
    ])
    const ptMap = new Map<string, { done: number; upcoming: number }>()
    for (const p of pts) {
      const e = ptMap.get(p.trainerId) ?? { done: 0, upcoming: 0 }
      if (p.status === 'COMPLETED') e.done++
      else if (p.status === 'BOOKED' && p.date >= today) e.upcoming++
      ptMap.set(p.trainerId, e)
    }
    const memberMap = new Map<string, Set<string>>()
    for (const e of enrolls) {
      const owners = [...new Set([e.assignedById, e.attributedTrainerId].filter(Boolean) as string[])]
      for (const uid of owners) {
        if (!userIds.includes(uid)) continue
        const set = memberMap.get(uid) ?? new Set<string>()
        set.add(e.memberId)
        memberMap.set(uid, set)
      }
    }
    return users.map(x => {
      const t = x.trainerProfile
      const pt = ptMap.get(t?.id ?? '') ?? { done: 0, upcoming: 0 }
      const weeklyMinutes = (t?.availability ?? [])
        .filter(a => a.kind === 'PUBLIC' && a.isActive)
        .reduce((sum, a) => sum + Math.max(0, a.endMin - a.startMin), 0)
      return {
        id: x.id,
        name: x.name,
        email: x.email,
        avatarUrl: x.avatarUrl,
        ptCompleted: pt.done,
        ptUpcoming: pt.upcoming,
        assignedMembers: memberMap.get(x.id)?.size ?? 0,
        weeklyHours: Math.round((weeklyMinutes / 60) * 100) / 100,
      }
    })
  }

  /* ------------------------------- exports ----------------------------- */

  @Get('admin/export/:file')
  @Roles('ADMIN')
  async exportCsv(@Param('file') file: string, @Res() res: Response) {
    const m = /^(members|payments|attendance)\.csv$/.exec(String(file))
    if (!m) throw bad('Unsupported export', 404)
    const what = m[1]
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="opengym-${what}-${isoDate(startOfToday())}.csv"`)
    res.send(await this.csvFor(what))
  }

  private async csvFor(what: string): Promise<string> {
    if (what === 'members') {
      const users = await this.db.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: EXPORT_MAX_ROWS,
        select: { id: true, name: true, email: true, role: true, status: true, createdAt: true },
      })
      const ids = users.map(x => x.id)
      const mems = ids.length
        ? await this.db.membership.findMany({
            where: { userId: { in: ids } },
            orderBy: { endDate: 'desc' },
            select: { userId: true, endDate: true },
          })
        : []
      const latest = new Map<string, Date>()
      for (const mm of mems) if (!latest.has(mm.userId)) latest.set(mm.userId, mm.endDate)
      const lines = ['id,name,email,role,status,createdAt,membershipEnd']
      for (const x of users) {
        lines.push(csvRow([x.id, x.name, x.email, x.role, x.status, x.createdAt.toISOString(), latest.get(x.id)?.toISOString() ?? '']))
      }
      return lines.join('\n')
    }
    if (what === 'payments') {
      const rows = await this.db.payment.findMany({
        orderBy: { createdAt: 'desc' },
        take: EXPORT_MAX_ROWS,
        include: { user: { select: { email: true } } },
      })
      const lines = ['id,email,amountPaise,method,status,paidAt,orderId,paymentId,utr']
      for (const p of rows) {
        lines.push(csvRow([
          p.id,
          p.user.email,
          p.amountPaise,
          p.method,
          p.status,
          p.paidAt?.toISOString() ?? '',
          p.razorpayOrderId ?? '',
          p.razorpayPaymentId ?? '',
          p.utr ?? '',
        ]))
      }
      return lines.join('\n')
    }
    const rows = await this.db.booking.findMany({
      orderBy: { createdAt: 'desc' },
      take: EXPORT_MAX_ROWS,
      include: {
        slot: { select: { date: true, startMin: true, endMin: true } },
        user: { select: { name: true } },
      },
    })
    const lines = ['date,slotStartMin,slotEndMin,userName,status,checkedInAt']
    for (const b of rows) {
      lines.push(csvRow([
        b.slot.date.toISOString().slice(0, 10),
        b.slot.startMin,
        b.slot.endMin,
        b.user.name,
        b.status,
        b.checkedInAt?.toISOString() ?? '',
      ]))
    }
    return lines.join('\n')
  }
}
