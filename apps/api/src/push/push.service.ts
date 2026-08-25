import { Injectable } from '@nestjs/common'
import webpush from 'web-push'
import { PrismaService } from '../prisma.service.js'
import { SettingsService } from '../common/services.js'

export interface PushPayload {
  title: string
  body: string
  tag?: string
  data?: Record<string, unknown>
}

/**
 * Web-Push fan-out. VAPID keys are lazily initialized on first send (generated
 * once and persisted into the GymSettings singleton if missing).
 */
@Injectable()
export class PushService {
  private vapidReady: Promise<void> | null = null

  constructor(private db: PrismaService, private settings: SettingsService) {}

  /** Idempotent — controllers may await this before reading the public key. */
  ensureVapid(): Promise<void> {
    if (!this.vapidReady) this.vapidReady = this.initVapid()
    return this.vapidReady
  }

  private async initVapid(): Promise<void> {
    try {
      const s = await this.settings.get()
      let publicKey = s.vapidPublic as string | null | undefined
      let privateKey = s.vapidPrivate as string | null | undefined
      if (!publicKey || !privateKey) {
        const generated = webpush.generateVAPIDKeys()
        publicKey = generated.publicKey
        privateKey = generated.privateKey
        await this.db.gymSettings.upsert({
          where: { id: 'main' },
          create: { id: 'main', vapidPublic: publicKey, vapidPrivate: privateKey },
          update: { vapidPublic: publicKey, vapidPrivate: privateKey },
        })
        this.settings.invalidate()
      }
      webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@localhost', publicKey, privateKey)
    } catch (e: any) {
      this.vapidReady = null // don't cache a broken state; retry on next send
      throw e
    }
  }

  /** Best-effort delivery to every device of one user. Never throws. */
  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    try {
      await this.ensureVapid()
      const subs = await this.db.pushSubscription.findMany({ where: { userId } })
      await Promise.allSettled(
        subs.map(async sub => {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              JSON.stringify(payload),
              { urgency: 'high' },
            )
          } catch (err: any) {
            if (err?.statusCode === 404 || err?.statusCode === 410) {
              // subscription gone (browser unregistered / expired) — clean it up
              await this.db.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {})
            }
          }
        }),
      )
    } catch (e: any) {
      console.warn('[push] sendToUser failed:', e?.message ?? e)
    }
  }

  /** Sequential chunks of 50 so a huge audience can't stampede the event loop / gateway. */
  async broadcast(userIds: string[], payload: PushPayload): Promise<void> {
    for (let i = 0; i < userIds.length; i += 50) {
      await Promise.allSettled(userIds.slice(i, i + 50).map(id => this.sendToUser(id, payload)))
    }
  }
}
