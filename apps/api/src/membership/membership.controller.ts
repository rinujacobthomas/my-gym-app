import { Controller, Get, Post, Body, Req, Res } from '@nestjs/common'
import type { Response } from 'express'
import { randomUUID } from 'node:crypto'
import { PrismaService } from '../prisma.service.js'
import { Prisma } from '#prisma'
import { Public, Roles, CurrentUser, ReqUser, latestMembership, membershipStatus, startOfToday, bad } from '../common/guards.js'
import { SettingsService, AuditService } from '../common/services.js'
import { RazorpayService } from './razorpay.service.js'
import { SlotsService } from '../scheduling/slots.service.js'

const DAY_MS = 86400000
const GRACE_DAYS = 3

const isoDate = (d?: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : null)

@Controller()
export class MembershipController {
  constructor(private db: PrismaService, private settings: SettingsService, private audit: AuditService, private slots: SlotsService) {}

  @Public()
  @Get('plans')
  async plans() {
    const rows = await this.db.plan.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } })
    return rows.map(p => ({ id: p.id, name: p.name, pricePaise: p.pricePaise, durationDays: p.durationDays, description: p.description }))
  }

  @Get('membership/me')
  async me(@CurrentUser() u: ReqUser) {
    if (u.role !== 'MEMBER') return { status: 'STAFF', endDate: null }
    const [m, s] = await Promise.all([latestMembership(this.db, u.id), this.settings.get()])
    const st = membershipStatus(m)
    const i = st.info
    return {
      status: i.status ?? null,
      endDate: isoDate(i.endDate ?? null),
      startDate: isoDate(i.startDate ?? null),
      frozenUntil: isoDate(i.frozenUntil ?? null),
      freezesUsed: i.freezesUsed ?? 0,
      freezesMax: s.freezeMaxPerYear ?? 2,
      freezeMaxDays: s.freezeMaxDays ?? 30,
      daysLeft: i.daysLeft ?? null,
      planName: i.planName ?? null,
    }
  }

  @Roles('MEMBER')
  @Post('membership/freeze')
  async freeze(@CurrentUser() u: ReqUser, @Body() body: any) {
    const s = await this.settings.get()
    const days = Number(body?.days)
    if (!Number.isInteger(days) || days < 1 || days > (s.freezeMaxDays ?? 30)) throw bad('Invalid freeze duration')
    const m = await latestMembership(this.db, u.id)
    const st = membershipStatus(m)
    if (!m || (st.info.status !== 'ACTIVE' && st.info.status !== 'EXPIRING')) throw bad('Membership must be active to freeze')
    if ((m.freezesUsed ?? 0) >= (s.freezeMaxPerYear ?? 2)) throw bad('Freeze limit reached for this membership year', 409)
    // Frozen through frozenUntil inclusive, so the pause covers exactly `days` calendar days
    // starting today — and the end date moves out by the same amount, so no paid day is lost.
    const frozenUntil = new Date(startOfToday().getTime() + (days - 1) * DAY_MS)
    const endDate = new Date(new Date(m.endDate).getTime() + days * DAY_MS)
    await this.db.membership.update({ where: { id: m.id }, data: { frozenUntil, endDate, freezesUsed: { increment: 1 } } })
    // Bookings inside the pause can't be used (the membership gate blocks check-in), so release
    // the seats now instead of letting them turn into no-shows.
    const held = await this.db.booking.findMany({
      where: { userId: u.id, status: 'BOOKED', slot: { date: { gte: startOfToday(), lte: frozenUntil } } },
      select: { id: true, slotId: true },
    })
    if (held.length) {
      await this.db.booking.updateMany({ where: { id: { in: held.map(b => b.id) } }, data: { status: 'CANCELLED', cancelSource: 'NORMAL' } })
      for (const b of held) await this.slots.promoteFromWaitlist(b.slotId)
    }
    this.audit.log(u.id, 'membership.freeze', 'Membership', m.id, { days, frozenUntil, bookingsReleased: held.length })
    const updated = await latestMembership(this.db, u.id)
    return membershipStatus(updated).info
  }

  @Roles('MEMBER')
  @Post('membership/unfreeze')
  async unfreeze(@CurrentUser() u: ReqUser) {
    const m = await latestMembership(this.db, u.id)
    const today = startOfToday()
    if (!m || !m.frozenUntil || new Date(m.frozenUntil) < today) throw bad('No active freeze')
    // Ending early hands back the frozen days not used yet — today included, since the member
    // can train again from the moment they unfreeze.
    const unused = Math.max(0, Math.round((new Date(m.frozenUntil).getTime() - today.getTime()) / DAY_MS) + 1)
    const endDate = new Date(new Date(m.endDate).getTime() - unused * DAY_MS)
    await this.db.membership.update({ where: { id: m.id }, data: { frozenUntil: null, endDate } })
    this.audit.log(u.id, 'membership.unfreeze', 'Membership', m.id, { frozenUntil: m.frozenUntil })
    const updated = await latestMembership(this.db, u.id)
    return membershipStatus(updated).info
  }
}

@Controller('payments')
export class PaymentsController {
  constructor(private db: PrismaService, private razor: RazorpayService) {}

  @Roles('MEMBER')
  @Post('order')
  async order(@CurrentUser() u: ReqUser, @Body() body: any) {
    if (!this.razor.configured) throw bad('Online payments are not configured', 503)
    const plan = await this.db.plan.findFirst({ where: { id: String(body?.planId || ''), isActive: true } })
    if (!plan) throw bad('Plan not found', 404)
    // Double-click guard: reuse a still-open order for the same plan from the last day.
    const existing = await this.db.payment.findFirst({
      where: { userId: u.id, planId: plan.id, status: 'CREATED', createdAt: { gt: new Date(Date.now() - DAY_MS) }, razorpayOrderId: { not: null } },
      orderBy: { createdAt: 'desc' },
    })
    if (existing?.razorpayOrderId) {
      return { orderId: existing.razorpayOrderId, amountPaise: existing.amountPaise, keyId: this.razor.keyId, planName: plan.name }
    }
    const order: any = await this.razor.createOrder(plan.pricePaise, 'm_' + randomUUID().replace(/-/g, '').slice(0, 10), { userId: u.id, planId: plan.id })
    await this.db.payment.create({
      data: { userId: u.id, planId: plan.id, amountPaise: plan.pricePaise, method: 'ONLINE', status: 'CREATED', razorpayOrderId: order.id },
    })
    return { orderId: order.id, amountPaise: plan.pricePaise, keyId: this.razor.keyId, planName: plan.name }
  }

  @Roles('MEMBER')
  @Post('verify')
  async verify(@CurrentUser() u: ReqUser, @Body() body: any) {
    const orderId = String(body?.orderId || '')
    const paymentId = String(body?.paymentId || '')
    const signature = String(body?.signature || '')
    const payment = await this.db.payment.findUnique({ where: { razorpayOrderId: orderId }, include: { plan: true } })
    if (!payment || payment.userId !== u.id) throw bad('Order not found')
    if (payment.status === 'PAID') return { ok: true }
    if (!this.razor.verifyCheckoutSignature(orderId, paymentId, signature)) {
      await this.db.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } }).catch(() => {})
      throw bad('Signature verification failed')
    }
    await this.markPaidAndExtend(payment.id, payment.userId, payment.planId!, payment.plan!.durationDays, paymentId)
    return { ok: true }
  }

  /**
   * Webhooks post the raw body; signature verification needs those exact bytes,
   * so we bypass Nest's parsed body and answer with @Res directly.
   * Always 200 after handling — non-200 makes Razorpay retry forever.
   */
  @Public()
  @Post('webhook')
  async webhook(@Req() req: any, @Res() res: Response) {
    const sig = String(req.headers['x-razorpay-signature'] || '')
    const raw: Buffer | undefined = req.rawBody
    if (!raw || !this.razor.verifyWebhookSignature(raw, sig)) return res.status(400).json({ ok: false })
    try {
      const event = String(req.body?.event || '')
      const p = req.body?.payload?.payment?.entity || {}
      if (event === 'payment.captured' || event === 'order.paid') {
        const payment = await this.db.payment.findFirst({
          where: { OR: [{ razorpayOrderId: p.order_id }, { razorpayPaymentId: p.id }] },
          include: { plan: true },
        })
        // Already activated (checkout verify won the race) → idempotent no-op.
        if (payment && payment.status !== 'PAID' && payment.plan) {
          if (p.amount && p.amount !== payment.amountPaise) {
            await this.db.payment.update({
              where: { id: payment.id },
              data: { disputeNote: `webhook amount ${p.amount} != order ${payment.amountPaise}` },
            })
          } else {
            const paidAt = p.created_at ? new Date(p.created_at * 1000) : new Date()
            await this.markPaidAndExtend(payment.id, payment.userId, payment.planId!, payment.plan.durationDays, p.id, paidAt)
          }
        }
      } else if (event === 'payment.failed') {
        const payment = await this.db.payment.findFirst({ where: { razorpayOrderId: p.order_id } })
        if (payment && payment.status === 'CREATED') {
          await this.db.payment.update({ where: { id: payment.id }, data: { status: 'FAILED', razorpayPaymentId: p.id || undefined } })
        }
      }
    } catch {
      // swallow: processing errors must not trigger webhook retries
    }
    res.json({ ok: true })
  }

  @Get('me')
  async mine(@CurrentUser() u: ReqUser) {
    const rows = await this.db.payment.findMany({ where: { userId: u.id }, orderBy: { createdAt: 'desc' }, take: 50, include: { plan: true } })
    return rows.map(p => ({
      id: p.id,
      amountPaise: p.amountPaise,
      method: p.method,
      status: p.status,
      createdAt: p.createdAt,
      paidAt: p.paidAt,
      planName: p.plan?.name ?? null,
      note: p.note,
    }))
  }

  /** Shared by checkout verify and webhook: PAID + extend/create the Membership atomically. */
  private async markPaidAndExtend(
    paymentRowId: string,
    userId: string,
    planId: string,
    durationDays: number,
    razorpayPaymentId: string,
    paidAt: Date = new Date(),
  ) {
    await this.db.$transaction(async tx => {
      // Checkout verify and the webhook routinely race each other. The conditional update takes
      // the row lock and re-checks status, so only one of them ever extends the membership.
      const claimed = await tx.payment.updateMany({
        where: { id: paymentRowId, status: { not: 'PAID' } },
        data: { status: 'PAID', razorpayPaymentId, paidAt },
      })
      if (!claimed.count) return
      const m = await this.extendMembership(tx as Prisma.TransactionClient, userId, planId, durationDays)
      await tx.payment.update({ where: { id: paymentRowId }, data: { membershipId: m.id } })
    })
  }

  /** Extend an unexpired (or within-grace) membership from its own endDate; otherwise start fresh today. */
  private async extendMembership(tx: Prisma.TransactionClient, userId: string, planId: string, durationDays: number) {
    const today = startOfToday()
    const latest = await tx.membership.findFirst({ where: { userId }, orderBy: { endDate: 'desc' } })
    const endMs = latest ? new Date(latest.endDate).getTime() : -Infinity
    const extendable = !!latest && endMs >= today.getTime() - GRACE_DAYS * DAY_MS
    const base = Math.max(today.getTime(), extendable ? endMs : today.getTime())
    const endDate = new Date(base + durationDays * DAY_MS)
    const data = { status: 'ACTIVE' as const, planId, frozenUntil: null }
    return extendable
      ? tx.membership.update({ where: { id: latest!.id }, data: { ...data, endDate } })
      : tx.membership.create({ data: { userId, ...data, startDate: today, endDate } })
  }
}
