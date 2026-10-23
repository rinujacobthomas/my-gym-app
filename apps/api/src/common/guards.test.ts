import { describe, it, expect, vi } from 'vitest'
import { Reflector } from '@nestjs/core'
import { ForbiddenException } from '@nestjs/common'

import { RolesGuard, membershipStatus, IS_PUBLIC_KEY, ALLOW_PENDING_KEY, ROLES_KEY } from './guards.js'

// The guards only need PrismaService as a type here; keep the generated client out of the test
// (vi.mock is hoisted above the imports).
vi.mock('../prisma.service.js', () => ({ PrismaService: class {} }))

function ctxFor(user: any, meta: Record<string, any> = {}) {
  const handler = () => {}
  for (const [k, v] of Object.entries(meta)) Reflect.defineMetadata(k, v, handler)
  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any
}

const guard = new RolesGuard(new Reflector())
const member = (status: string) => ({ id: 'u1', role: 'MEMBER', status })

describe('RolesGuard', () => {
  it('lets ACTIVE accounts through routes without @Roles', () => {
    expect(guard.canActivate(ctxFor(member('ACTIVE')))).toBe(true)
  })

  it('stops PENDING accounts on ordinary routes', () => {
    expect(() => guard.canActivate(ctxFor(member('PENDING')))).toThrow(ForbiddenException)
  })

  it('lets PENDING accounts reach @AllowPending routes', () => {
    expect(guard.canActivate(ctxFor(member('PENDING'), { [ALLOW_PENDING_KEY]: true }))).toBe(true)
  })

  it('never lets DISABLED accounts through, even on @AllowPending routes', () => {
    expect(() => guard.canActivate(ctxFor(member('DISABLED'), { [ALLOW_PENDING_KEY]: true }))).toThrow(ForbiddenException)
  })

  it('skips the check entirely on @Public routes', () => {
    expect(guard.canActivate(ctxFor(undefined, { [IS_PUBLIC_KEY]: true }))).toBe(true)
  })

  it('enforces @Roles, with ADMIN passing every gate', () => {
    const meta = { [ROLES_KEY]: ['TRAINER'] }
    expect(() => guard.canActivate(ctxFor(member('ACTIVE'), meta))).toThrow(ForbiddenException)
    expect(guard.canActivate(ctxFor({ id: 'a', role: 'ADMIN', status: 'ACTIVE' }, meta))).toBe(true)
    expect(guard.canActivate(ctxFor({ id: 't', role: 'TRAINER', status: 'ACTIVE' }, meta))).toBe(true)
  })
})

describe('membershipStatus', () => {
  const DAY = 86400000
  const today = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d.getTime() }
  const m = (endOffsetDays: number, extra: any = {}) => ({
    id: 'm', userId: 'u', planId: null, plan: null, startDate: new Date(today() - 30 * DAY),
    endDate: new Date(today() + endOffsetDays * DAY), frozenUntil: null, freezesUsed: 0, ...extra,
  }) as any

  it('treats no membership as expired', () => {
    expect(membershipStatus(null)).toMatchObject({ ok: false, reason: 'expired' })
  })

  it('classifies active, expiring, grace and expired', () => {
    expect(membershipStatus(m(30)).info.status).toBe('ACTIVE')
    expect(membershipStatus(m(5)).info.status).toBe('EXPIRING')
    expect(membershipStatus(m(-2))).toMatchObject({ ok: true, info: { status: 'GRACE' } })
    expect(membershipStatus(m(-4))).toMatchObject({ ok: false, reason: 'expired' })
  })

  it('blocks while frozen, through the last frozen day inclusive', () => {
    expect(membershipStatus(m(30, { frozenUntil: new Date(today()) }))).toMatchObject({ ok: false, reason: 'frozen' })
    expect(membershipStatus(m(30, { frozenUntil: new Date(today() - DAY) })).ok).toBe(true)
  })
})
