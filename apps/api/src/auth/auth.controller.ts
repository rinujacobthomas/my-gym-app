import { Controller, Get, Post, Req, Res, Query, UseGuards, UnauthorizedException } from '@nestjs/common'
import { Request, Response } from 'express'
import { AuthService } from './auth.service.js'
import { PrismaService } from '../prisma.service.js'
import { Public, AllowPending, CurrentUser, ReqUser, parseCookie, latestMembership, membershipStatus } from '../common/guards.js'
import { SettingsService } from '../common/services.js'

const COOKIE = 'og_session'

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService, private db: PrismaService, private settings: SettingsService) {}

  @Public()
  @Get('google')
  async google(@Req() req: Request, @Res() res: Response, @Query('next') next = '/home') {
    const url = this.auth.loginUrl(next, v => {
      res.setHeader('Set-Cookie', `og_oauth_state=${v}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=600`)
    })
    res.redirect(url)
  }

  @Public()
  @Get('google/callback')
  async callback(@Req() req: Request, @Res() res: Response, @Query('code') code?: string, @Query('state') state?: string) {
    try {
      if (!code) throw new Error('missing code')
      const cookies = req.headers.cookie || ''
      const expect = parseCookie(cookies, 'og_oauth_state')
      // State mismatch → CSRF; bounce to login without a session.
      if (!expect || !state || expect !== state) return res.redirect('/?error=state')
      await this.auth.handleCallback(code, res, '/home')
    } catch (e: any) {
      res.redirect('/?error=' + encodeURIComponent(e.message || 'login failed'))
    }
  }

  @AllowPending()
  @Post('logout')
  async logout(@Req() req: Request, @Res() res: Response) {
    await this.auth.logout(parseCookie(req.headers.cookie || '', COOKIE) ?? undefined)
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
    res.json({ ok: true })
  }

  @AllowPending()
  @Post('logout-all')
  async logoutAll(@Req() req: any, @Res() res: Response) {
    await this.auth.logoutAll(req.user.id)
    res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`)
    res.json({ ok: true })
  }
}

@Controller('me')
@AllowPending()
export class MeController {
  constructor(private db: PrismaService, private settings: SettingsService) {}

  @Get()
  async me(@CurrentUser() u: ReqUser) {
    let membership = null as any
    if (u.role === 'MEMBER') {
      const m = await latestMembership(this.db, u.id)
      const st = membershipStatus(m)
      membership = st.info
    } else {
      membership = { status: 'STAFF' } // staff never see a renew wall
    }
    return {
      user: { id: u.id, name: u.name, email: u.email, avatarUrl: u.avatarUrl, role: u.role, status: u.status },
      membership,
    }
  }
}
