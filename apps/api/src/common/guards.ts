import { CanActivate, ExecutionContext, Injectable, SetMetadata, UnauthorizedException, ForbiddenException, HttpException, createParamDecorator } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PrismaService } from '../prisma.service.js'

export type Role = 'ADMIN' | 'TRAINER' | 'STAFF' | 'MEMBER'
export interface ReqUser { id: string; email: string; name: string; role: Role; status: 'PENDING' | 'ACTIVE' | 'DISABLED'; avatarUrl?: string }

export const IS_PUBLIC_KEY = 'isPublic'
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)

export const ROLES_KEY = 'roles'
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles)

export const CurrentUser = createParamDecorator((_data, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().user as ReqUser)

const COOKIE = 'og_session'

/** Reads the opaque session cookie, loads the user fresh — status/role changes bite instantly. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private reflector: Reflector, private db: PrismaService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()])
    const req = ctx.switchToHttp().getRequest()
    if (isPublic) return true
    const sid = parseCookie(req.headers.cookie || '', COOKIE)
    if (!sid) throw new UnauthorizedException({ error: 'Not signed in' })
    const session = await this.db.session.findUnique({ where: { id: sid }, include: { user: true } }).catch(() => null)
    if (!session || session.expiresAt < new Date()) throw new UnauthorizedException({ error: 'Session expired' })
    const u = session.user
    if (u.status === 'DISABLED') throw new UnauthorizedException({ error: 'Account disabled' })
    // PENDING accounts may pass only to reach their own waiting-room endpoints (GET /me etc.)
    req.user = { id: u.id, email: u.email, name: u.name, role: u.role, status: u.status, avatarUrl: u.avatarUrl ?? undefined }
    req.sessionId = sid
    return true
  }
}

/** Role gate. No @Roles() metadata = any ACTIVE authenticated account. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [ctx.getHandler(), ctx.getClass()])
    if (!required?.length) return true
    const req = ctx.switchToHttp().getRequest()
    const u: ReqUser | undefined = req.user
    if (!u) throw new UnauthorizedException({ error: 'Not signed in' })
    if (u.status !== 'ACTIVE') throw new ForbiddenException({ error: 'Account not active', pending: u.status === 'PENDING', silent: false })
    if (!required.includes(u.role)) {
      // ADMIN passes every role gate.
      if (u.role === 'ADMIN') return true
      throw new ForbiddenException({ error: 'Not allowed for your role' })
    }
    return true
  }
}

/**
 * Membership gate for member-facing value features (book/check-in/log/nutrition-write).
 * Staff roles pass free (N-policy: staff exempt). Expired members get 403 {reason:'expired'}
 * with a 3-day grace window after endDate before it bites (N-amended policy).
 */
@Injectable()
export class MembershipGuard implements CanActivate {
  constructor(private db: PrismaService) {}
  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest()
    const u: ReqUser = req.user
    if (!u) throw new UnauthorizedException({ error: 'Not signed in' })
    if (u.role !== 'MEMBER') return true
    const m = await latestMembership(this.db, u.id)
    req.membership = m
    const st = membershipStatus(m)
    if (st.ok) return true
    throw new ForbiddenException({ error: st.reason === 'frozen' ? 'Membership frozen' : 'Membership expired', reason: st.reason, silent: true })
  }
}

export interface MembershipInfo { planName?: string | null; startDate?: Date; endDate?: Date; status: 'ACTIVE' | 'EXPIRING' | 'GRACE' | 'EXPIRED' | 'FROZEN' | null; daysLeft?: number; frozenUntil?: Date | null; freezesUsed?: number }

export async function latestMembership(db: PrismaService, userId: string) {
  return db.membership.findFirst({ where: { userId }, orderBy: { endDate: 'desc' }, include: { plan: true } })
}

const GRACE_DAYS = 3
const DAY_MS = 86400000

export function membershipStatus(m: Awaited<ReturnType<typeof latestMembership>>): { ok: boolean; info: MembershipInfo; reason?: 'expired' | 'frozen' } {
  if (!m) return { ok: false, reason: 'expired', info: { status: null } }
  const today = startOfToday()
  const end = new Date(m.endDate)
  const daysLeft = Math.ceil((end.getTime() - today.getTime()) / DAY_MS)
  const base = { planName: m.plan?.name ?? null, startDate: m.startDate, endDate: m.endDate, frozenUntil: m.frozenUntil, freezesUsed: m.freezesUsed }
  if (m.frozenUntil && new Date(m.frozenUntil) >= today) return { ok: false, reason: 'frozen', info: { ...base, status: 'FROZEN', daysLeft } }
  if (daysLeft < 0 && daysLeft >= -GRACE_DAYS) return { ok: true, info: { ...base, status: 'GRACE', daysLeft } }
  if (daysLeft < 0) return { ok: false, reason: 'expired', info: { ...base, status: 'EXPIRED', daysLeft } }
  return { ok: true, info: { ...base, status: daysLeft <= 7 ? 'EXPIRING' : 'ACTIVE', daysLeft } }
}

export function startOfToday(): Date {
  // Gym-local dates come in as UTC midnight from @db.Date comparisons; build the same shape.
  const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d
}

export function parseCookie(header: string, name: string): string | null {
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i === -1) continue
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim())
  }
  return null
}

export const bad = (msg: string, status = 400) => new HttpException({ error: msg }, status)
