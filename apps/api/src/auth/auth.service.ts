import { Injectable, Res } from '@nestjs/common'
import { randomBytes, createHmac } from 'node:crypto'
import { PrismaService } from '../prisma.service.js'

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo'
const COOKIE = 'og_session'
const SESSION_DAYS = 90

@Injectable()
export class AuthService {
  constructor(private db: PrismaService) {}

  loginUrl(next: string, stateCookieSetter: (v: string) => void): string {
    const state = randomBytes(16).toString('hex')
    stateCookieSetter(state)
    const p = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || '',
      redirect_uri: this.redirectUri(),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    })
    return GOOGLE_AUTH + '?' + p.toString()
  }

  redirectUri() {
    const base = process.env.PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 3000}`
    return base.replace(/\/$/, '') + '/api/auth/google/callback'
  }

  /**
   * Exchange the code, upsert the user, decide account status:
   *  - email in ADMIN_EMAILS → ACTIVE ADMIN (bootstrap + second-admin seat)
   *  - very first account on a fresh instance → ACTIVE ADMIN
   *  - existing user (by googleId or verified email) → keep status/role
   *  - everyone else → PENDING MEMBER (admin approval flow)
   */
  async handleCallback(code: string, res: any, next: string) {
    if (!process.env.GOOGLE_CLIENT_ID) throw new Error('GOOGLE_CLIENT_ID not configured')
    const tokRes = await fetch(GOOGLE_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
        redirect_uri: this.redirectUri(),
        grant_type: 'authorization_code',
      }),
    })
    if (!tokRes.ok) throw new Error('token exchange failed')
    const { access_token } = await tokRes.json()
    const uiRes = await fetch(GOOGLE_USERINFO, { headers: { Authorization: 'Bearer ' + access_token } })
    if (!uiRes.ok) throw new Error('userinfo failed')
    const g: any = await uiRes.json()
    if (!g.email_verified) throw new Error('Google email not verified')

    const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    const isFirst = (await this.db.user.count()) === 0
    const wantAdmin = adminEmails.includes(g.email.toLowerCase())

    let user = await this.db.user.findUnique({ where: { googleId: g.sub } })
    if (!user && g.email) {
      // Same human, new Google button/device: link by verified email instead of duplicating.
      const byEmail = await this.db.user.findUnique({ where: { email: g.email } })
      if (byEmail) user = await this.db.user.update({ where: { id: byEmail.id }, data: { googleId: g.sub, avatarUrl: g.picture ?? null, name: g.name || byEmail.name } })
    }
    if (!user) {
      user = await this.db.user.create({
        data: {
          googleId: g.sub, email: g.email, name: g.name || g.email.split('@')[0],
          avatarUrl: g.picture ?? null,
          role: wantAdmin || isFirst ? 'ADMIN' : 'MEMBER',
          status: wantAdmin || isFirst ? 'ACTIVE' : 'PENDING',
        },
      })
    } else {
      const patch: any = {}
      if (wantAdmin && user.role !== 'ADMIN') { patch.role = 'ADMIN'; patch.status = 'ACTIVE' }
      if (user.name !== g.name && g.name) patch.name = g.name
      if (Object.keys(patch).length) user = await this.db.user.update({ where: { id: user.id }, data: patch })
    }

    const sid = randomBytes(36).toString('base64url')
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000)
    await this.db.session.create({ data: { id: sid, userId: user.id, expiresAt, userAgent: null } })
    const secure = (process.env.PUBLIC_APP_URL || '').startsWith('https:') ? '; Secure' : ''
    // Cookie lives on the API origin; same-origin nginx deployment means no cross-site worries.
    res.setHeader('Set-Cookie', `${COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}`)
    const safeNext = typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/home'
    res.redirect(safeNext)
  }

  async logout(sessionId?: string) {
    if (sessionId) await this.db.session.delete({ where: { id: sessionId } }).catch(() => {})
  }

  async logoutAll(userId: string) {
    await this.db.session.deleteMany({ where: { userId } })
  }

  /** Daily rotating check-in token: HMAC(secret, userId|date). No storage, expires at midnight. */
  checkInCode(userId: string, dateISO: string, secret: string) {
    return createHmac('sha256', secret).update(userId + '|' + dateISO).digest('hex').slice(0, 24).toUpperCase().match(/.{4}/g)!.join('-')
  }
  parseCheckInCode(code: string, secret: string, users: { id: string }[], dateISO: string): string | null {
    const norm = code.toUpperCase().replace(/[^A-Z0-9]/g, '')
    for (const u of users) {
      const expect = this.checkInCode(u.id, dateISO, secret).replace(/-/g, '')
      if (expect === norm) return u.id
    }
    return null
  }
}
