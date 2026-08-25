import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service.js'

/** GymSettings singleton with a short cache — every guard/route reads it constantly. */
@Injectable()
export class SettingsService {
  private cached: any = null
  private at = 0
  constructor(private db: PrismaService) {}
  async get(): Promise<any> {
    if (this.cached && Date.now() - this.at < 60_000) return this.cached
    let s = await this.db.gymSettings.findUnique({ where: { id: 'main' } })
    if (!s) s = await this.db.gymSettings.create({ data: { id: 'main' } })
    this.cached = s; this.at = Date.now()
    return s
  }
  invalidate() { this.cached = null }
}

/** Append-only audit trail for admin/staff actions. Never throws into the request path. */
@Injectable()
export class AuditService {
  constructor(private db: PrismaService) {}
  log(actorId: string | null, action: string, targetType?: string, targetId?: string, meta?: any) {
    this.db.auditLog.create({ data: { actorId, action, targetType, targetId, meta: meta ?? undefined } }).catch(() => {})
  }
}
