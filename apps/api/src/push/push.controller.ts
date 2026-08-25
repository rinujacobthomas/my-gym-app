import { Body, Controller, Get, Post } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { PrismaService } from '../prisma.service.js'
import { CurrentUser, ReqUser, bad } from '../common/guards.js'
import { SettingsService } from '../common/services.js'
import { PushService } from './push.service.js'

@Controller('push')
export class PushController {
  constructor(
    private db: PrismaService,
    private push: PushService,
    private settings: SettingsService,
  ) {}

  /** Client fetches this before calling subscribe(). Also triggers lazy VAPID generation. */
  @Get('public-key')
  async publicKey() {
    await this.push.ensureVapid()
    const s = await this.settings.get()
    return { key: (s.vapidPublic as string) ?? null }
  }

  @Post('subscribe')
  async subscribe(@CurrentUser() u: ReqUser, @Body() body: any) {
    const endpoint = body?.subscription?.endpoint
    const p256dh = body?.subscription?.keys?.p256dh
    const auth = body?.subscription?.keys?.auth
    if (typeof endpoint !== 'string' || !endpoint) throw bad('Invalid subscription.endpoint')
    if (typeof p256dh !== 'string' || !p256dh) throw bad('Invalid subscription.keys.p256dh')
    if (typeof auth !== 'string' || !auth) throw bad('Invalid subscription.keys.auth')
    // Deterministic id so re-subscribing the same browser updates in place.
    const id = createHash('sha256').update(endpoint).digest('hex').slice(0, 24)
    // Endpoint may linger under another account — it belongs to this user now.
    await this.db.pushSubscription.deleteMany({ where: { endpoint, userId: { not: u.id } } })
    await this.db.pushSubscription.upsert({
      where: { id },
      create: { id, endpoint, p256dh, auth, userId: u.id },
      update: { endpoint, p256dh, auth, userId: u.id },
    })
    return { ok: true }
  }

  @Post('unsubscribe')
  async unsubscribe(@CurrentUser() u: ReqUser, @Body() body: { endpoint?: string }) {
    const endpoint = body?.endpoint
    if (typeof endpoint !== 'string' || !endpoint) throw bad('endpoint required')
    await this.db.pushSubscription.deleteMany({ where: { endpoint, userId: u.id } })
    return { ok: true }
  }

  @Post('test')
  async test(@CurrentUser() u: ReqUser) {
    await this.push.sendToUser(u.id, { title: 'Test notification', body: 'It works 💪', tag: 'test' })
    return { ok: true }
  }

  // ---- rest-timer fallback: fires only if the tab was backgrounded and never cancelled ----
  private restTimers = new Map<string, ReturnType<typeof setTimeout>>()

  @Post('rest-timer')
  async restTimer(@CurrentUser() u: ReqUser, @Body() body: { seconds?: number }) {
    const sec = Math.min(Math.max(Number(body?.seconds) || 0, 5), 3600)
    const prev = this.restTimers.get(u.id)
    if (prev) clearTimeout(prev)
    this.restTimers.set(u.id, setTimeout(() => {
      this.restTimers.delete(u.id)
      this.push.sendToUser(u.id, { title: 'Rest over 💪', body: 'Time for your next set.', tag: 'rest-timer' })
    }, sec * 1000))
    return { ok: true }
  }

  @Post('rest-timer/cancel')
  async restTimerCancel(@CurrentUser() u: ReqUser) {
    const t = this.restTimers.get(u.id)
    if (t) { clearTimeout(t); this.restTimers.delete(u.id) }
    return { ok: true }
  }
}
