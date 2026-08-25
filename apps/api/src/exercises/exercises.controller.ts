import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common'
import { PrismaService } from '../prisma.service.js'
import { CurrentUser, ReqUser, Roles, bad } from '../common/guards.js'
import { AuditService } from '../common/services.js'

@Controller()
export class ExercisesController {
  constructor(private db: PrismaService, private audit: AuditService) {}

  @Get('exercises/premium')
  async premium() {
    const rows = await this.db.exercise.findMany({ where: { isPremium: true }, select: { id: true } })
    return { premiumIds: rows.map(r => r.id) }
  }

  @Get('exercises/unlocks')
  async myUnlocks(@CurrentUser() u: ReqUser) {
    return this.unlockShape(u.id)
  }

  @Get('exercises/unlocks/:memberId')
  @Roles('TRAINER', 'ADMIN')
  async memberUnlocks(@Param('memberId') memberId: string) {
    const member = await this.db.user.findUnique({ where: { id: memberId }, select: { id: true } })
    if (!member) throw bad('Member not found', 404)
    const shape = await this.unlockShape(memberId)
    const rows = await this.db.exerciseUnlock.findMany({
      where: { memberId },
      orderBy: { createdAt: 'desc' },
    })
    return {
      ...shape,
      rows: rows.map(r => ({ id: r.id, exerciseId: r.exerciseId, bodypart: r.bodypart, presetName: r.presetName, createdAt: r.createdAt })),
    }
  }

  @Post('exercises/experienced/:memberId')
  @Roles('TRAINER', 'ADMIN')
  async setExperienced(@CurrentUser() u: ReqUser, @Param('memberId') memberId: string, @Body() body: { experienced?: unknown }) {
    if (typeof body?.experienced !== 'boolean') throw bad('experienced boolean required')
    const member = await this.db.user.findUnique({ where: { id: memberId }, select: { id: true } })
    if (!member) throw bad('Member not found', 404)
    await this.db.profile.upsert({
      where: { userId: memberId },
      create: { userId: memberId, experienced: body.experienced },
      update: { experienced: body.experienced },
    })
    this.audit.log(u.id, 'profile.experienced', 'User', memberId, { experienced: body.experienced })
    return { ok: true, memberId, experienced: body.experienced }
  }

  @Patch('trainers/member-notes/:memberId')
  @Roles('TRAINER', 'ADMIN')
  async setInjuryNotes(@CurrentUser() u: ReqUser, @Param('memberId') memberId: string, @Body() body: { injuryNotes?: unknown }) {
    if (body?.injuryNotes !== null && typeof body?.injuryNotes !== 'string') throw bad('injuryNotes must be a string or null')
    const member = await this.db.user.findUnique({ where: { id: memberId }, select: { id: true } })
    if (!member) throw bad('Member not found', 404)
    const notes =
      typeof body.injuryNotes === 'string' && body.injuryNotes.trim() ? body.injuryNotes.trim().slice(0, 2000) : null
    await this.db.profile.upsert({
      where: { userId: memberId },
      create: { userId: memberId, injuryNotes: notes },
      update: { injuryNotes: notes },
    })
    this.audit.log(u.id, 'profile.injuryNotes', 'User', memberId, { set: !!notes })
    return { ok: true, memberId, injuryNotes: notes }
  }

  @Post('exercises/unlock')
  @Roles('TRAINER', 'ADMIN')
  async unlock(@CurrentUser() u: ReqUser, @Body() body: { memberId?: string; exerciseId?: string; bodypart?: string; presetId?: string }) {
    const memberId = String(body?.memberId || '')
    if (!memberId) throw bad('memberId required')
    const member = await this.db.user.findUnique({ where: { id: memberId }, select: { id: true } })
    if (!member) throw bad('Member not found', 404)
    let fresh: { exerciseId: string | null; bodypart: string | null; presetName: string | null }[] = []
    let source = 'direct'
    if (body?.presetId) {
      const preset = await this.db.unlockPreset.findUnique({ where: { id: String(body.presetId) } })
      if (!preset) throw bad('Preset not found', 404)
      source = `preset:${preset.name}`
      const c: any = preset.content ?? {}
      if (c.all === true) {
        const bps = await this.db.exercise.findMany({
          select: { bodypart: true },
          distinct: ['bodypart'],
          orderBy: { bodypart: 'asc' },
        })
        fresh = bps.map(b => ({ exerciseId: null, bodypart: b.bodypart, presetName: preset.name }))
      } else {
        fresh = [
          ...(Array.isArray(c.exerciseIds) ? c.exerciseIds.map((id: any) => ({ exerciseId: String(id), bodypart: null, presetName: preset.name })) : []),
          ...(Array.isArray(c.bodyparts) ? c.bodyparts.map((bp: any) => ({ exerciseId: null, bodypart: String(bp), presetName: preset.name })) : []),
        ]
      }
    } else if (body?.exerciseId) {
      fresh = [{ exerciseId: String(body.exerciseId), bodypart: null, presetName: null }]
    } else if (body?.bodypart) {
      fresh = [{ exerciseId: null, bodypart: String(body.bodypart), presetName: null }]
    } else {
      throw bad('Provide exerciseId, bodypart or presetId')
    }
    const existing = await this.db.exerciseUnlock.findMany({
      where: { memberId },
      select: { exerciseId: true, bodypart: true },
    })
    const have = new Set(existing.map(r => (r.exerciseId ? `e:${r.exerciseId}` : `b:${r.bodypart}`)))
    const pending: typeof fresh = []
    for (const r of fresh) {
      const key = r.exerciseId ? `e:${r.exerciseId}` : `b:${r.bodypart}`
      if (have.has(key)) continue
      have.add(key)
      pending.push(r)
    }
    if (pending.length) {
      await this.db.exerciseUnlock.createMany({
        data: pending.map(r => ({
          memberId,
          exerciseId: r.exerciseId,
          bodypart: r.bodypart,
          presetName: r.presetName,
          unlockedById: u.id,
        })),
      })
    }
    this.audit.log(u.id, 'exercise.unlock', 'User', memberId, { count: pending.length, source })
    return { ok: true, created: pending.length }
  }

  @Delete('exercises/unlock/:id')
  @Roles('TRAINER', 'ADMIN')
  async revokeUnlock(@CurrentUser() u: ReqUser, @Param('id') id: string) {
    const row = await this.db.exerciseUnlock.findUnique({ where: { id } })
    if (!row) throw bad('Unlock not found', 404)
    await this.db.exerciseUnlock.delete({ where: { id } })
    this.audit.log(u.id, 'exercise.unlock.revoke', 'ExerciseUnlock', id, { memberId: row.memberId })
    return { ok: true }
  }

  @Get('exercises/presets')
  @Roles('TRAINER', 'ADMIN')
  async presets() {
    return this.db.unlockPreset.findMany({ orderBy: { createdAt: 'desc' } })
  }

  @Post('exercises/presets')
  @Roles('TRAINER', 'ADMIN')
  async createPreset(@CurrentUser() u: ReqUser, @Body() body: { name?: string; content?: unknown }) {
    const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 80) : ''
    if (!name) throw bad('name required')
    const content = body?.content
    if (!content || typeof content !== 'object' || Array.isArray(content)) throw bad('content object required')
    const preset = await this.db.unlockPreset.create({ data: { name, content: content as any, createdById: u.id } })
    this.audit.log(u.id, 'preset.create', 'UnlockPreset', preset.id, { name })
    return preset
  }

  @Delete('exercises/presets/:id')
  @Roles('TRAINER', 'ADMIN')
  async deletePreset(@CurrentUser() u: ReqUser, @Param('id') id: string) {
    const preset = await this.db.unlockPreset.findUnique({ where: { id } })
    if (!preset) throw bad('Preset not found', 404)
    if (u.role !== 'ADMIN' && preset.createdById !== u.id) throw bad('Not your preset', 403)
    await this.db.unlockPreset.delete({ where: { id } })
    this.audit.log(u.id, 'preset.delete', 'UnlockPreset', id, { name: preset.name })
    return { ok: true }
  }

  private async unlockShape(memberId: string) {
    const [rows, profile] = await Promise.all([
      this.db.exerciseUnlock.findMany({ where: { memberId }, select: { exerciseId: true, bodypart: true } }),
      this.db.profile.findUnique({ where: { userId: memberId }, select: { experienced: true } }),
    ])
    return {
      exerciseIds: [...new Set(rows.map(r => r.exerciseId).filter((v): v is string => !!v))],
      bodyparts: [...new Set(rows.map(r => r.bodypart).filter((v): v is string => !!v))],
      experienced: profile?.experienced ?? false,
    }
  }
}
