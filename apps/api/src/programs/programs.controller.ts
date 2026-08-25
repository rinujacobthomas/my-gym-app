import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common'
import { Prisma } from '../../generated/prisma/index.js'
import { PrismaService } from '../prisma.service.js'
import { CurrentUser, ReqUser, Roles, bad } from '../common/guards.js'
import { AuditService } from '../common/services.js'

interface NormEx {
  exerciseId: string
  mode: string
  sets: number
  reps: number | null
  sec: number | null
  min: number | null
  speed: number | null
  weightKg: number | null
  bodyweight: boolean
  perSide: boolean
  restSec: number | null
  notes: string | null
}
interface NormDay { label: string; focusNote: string | null; exercises: NormEx[] }
interface NormWeek { days: NormDay[] }

@Controller()
export class ProgramsController {
  constructor(private db: PrismaService, private audit: AuditService) {}

  @Get('programs')
  async list(@CurrentUser() u: ReqUser) {
    if (u.role === 'MEMBER') {
      const enrolls = await this.db.programEnrollment.findMany({
        where: { memberId: u.id },
        orderBy: { startedAt: 'desc' },
        include: { program: { include: { _count: { select: { enrollments: true } } } } },
      })
      const counts = await this.countsFor(enrolls.map(e => e.program.id))
      return enrolls.map(e => {
        const c = counts.get(e.program.id) ?? { weeks: 0, days: 0, exercises: 0 }
        return {
          id: e.program.id,
          title: e.program.title,
          description: e.program.description,
          level: e.program.level,
          isPublished: e.program.isPublished,
          createdAt: e.program.createdAt,
          counts: { ...c, enrollments: e.program._count.enrollments },
          enrollment: { enrollmentId: e.id, unlockedDays: e.unlockedDays, completedDays: e.completedDays, active: e.active },
        }
      })
    }
    const where = u.role === 'ADMIN' ? {} : { OR: [{ isPublished: true }, { createdById: u.id }] }
    const programs = await this.db.program.findMany({
      where,
      orderBy: [{ isPublished: 'desc' }, { createdAt: 'desc' }],
      include: { _count: { select: { enrollments: true } } },
    })
    const counts = await this.countsFor(programs.map(p => p.id))
    return programs.map(p => {
      const c = counts.get(p.id) ?? { weeks: 0, days: 0, exercises: 0 }
      return {
        id: p.id,
        title: p.title,
        description: p.description,
        level: p.level,
        isPublished: p.isPublished,
        mine: p.createdById === u.id,
        createdAt: p.createdAt,
        counts: { ...c, enrollments: p._count.enrollments },
      }
    })
  }

  @Get('programs/assigned')
  @Roles('MEMBER')
  async assigned(@CurrentUser() u: ReqUser) {
    const enrolls = await this.db.programEnrollment.findMany({
      where: { memberId: u.id, active: true },
      orderBy: { startedAt: 'desc' },
      include: {
        program: {
          include: {
            weeks: { orderBy: { order: 'asc' }, include: { days: { orderBy: { order: 'asc' }, include: { exercises: { orderBy: { order: 'asc' } } } } } },
          },
        },
      },
    })
    return enrolls.map(e => this.mapEnrollment(e))
  }

  @Post('programs')
  @Roles('TRAINER', 'ADMIN')
  async create(@CurrentUser() u: ReqUser, @Body() body: any) {
    const tree = this.normalizeTree(body)
    const id = await this.db.$transaction(async tx => {
      const program = await tx.program.create({
        data: { title: tree.title, description: tree.description, level: tree.level, createdById: u.id },
      })
      await this.writeTree(tx, program.id, tree.weeks)
      return program.id
    })
    this.audit.log(u.id, 'program.create', 'Program', id, {
      title: tree.title,
      weeks: tree.weeks.length,
      days: tree.weeks.reduce((n, w) => n + w.days.length, 0),
    })
    return { id }
  }

  @Put('programs/:id')
  @Roles('TRAINER', 'ADMIN')
  async update(@CurrentUser() u: ReqUser, @Param('id') id: string, @Body() body: any) {
    const p = await this.db.program.findUnique({ where: { id }, select: { id: true, title: true, createdById: true, isPublished: true } })
    if (!p) throw bad('Program not found', 404)
    if (p.isPublished) throw bad('Published programs are immutable — clone instead', 400)
    if (u.role !== 'ADMIN' && p.createdById !== u.id) throw bad('Not your program', 403)
    const wantsPublish = body?.isPublished === true
    const hasWeeks = Array.isArray(body?.weeks)
    const hasMeta = !!body && (typeof body.title === 'string' || 'description' in body || 'level' in body)
    if (!hasWeeks && !hasMeta && !wantsPublish) throw bad('Nothing to update')
    const tree = hasWeeks ? this.normalizeTree({ ...body, title: typeof body.title === 'string' && body.title.trim() ? body.title : p.title }) : null
    await this.db.$transaction(async tx => {
      await tx.program.update({
        where: { id },
        data: {
          ...(tree ? { title: tree.title, description: tree.description, level: tree.level } : {}),
          ...(wantsPublish ? { isPublished: true } : {}),
        },
      })
      if (tree) {
        await tx.programWeek.deleteMany({ where: { programId: id } })
        await this.writeTree(tx, id, tree.weeks)
      }
    })
    this.audit.log(u.id, wantsPublish ? 'program.publish' : 'program.update', 'Program', id, { replacedTree: hasWeeks })
    return { ok: true, id, isPublished: wantsPublish || p.isPublished }
  }

  @Delete('programs/:id')
  @Roles('TRAINER', 'ADMIN')
  async remove(@CurrentUser() u: ReqUser, @Param('id') id: string) {
    const p = await this.db.program.findUnique({ where: { id }, select: { id: true, createdById: true, isPublished: true } })
    if (!p) throw bad('Program not found', 404)
    if (p.isPublished) throw bad('Only drafts can be deleted')
    if (u.role !== 'ADMIN' && p.createdById !== u.id) throw bad('Not your program', 403)
    await this.db.program.delete({ where: { id } })
    this.audit.log(u.id, 'program.delete', 'Program', id)
    return { ok: true }
  }

  @Post('programs/:id/enroll')
  @Roles('TRAINER', 'ADMIN')
  async enroll(@CurrentUser() u: ReqUser, @Param('id') id: string, @Body() body: { memberIds?: unknown }) {
    const program = await this.db.program.findUnique({ where: { id }, select: { id: true } })
    if (!program) throw bad('Program not found', 404)
    const ids = [...new Set((Array.isArray(body?.memberIds) ? body.memberIds : []).map((m: any) => String(m)).filter(Boolean))]
    if (!ids.length) throw bad('memberIds required')
    const members = await this.db.user.findMany({
      where: { id: { in: ids }, role: 'MEMBER', status: 'ACTIVE' },
      select: { id: true },
    })
    const validIds = members.map(m => m.id)
    if (!validIds.length) return { created: 0, skipped: ids.length }
    const existing = await this.db.programEnrollment.findMany({
      where: { programId: id, memberId: { in: validIds } },
      select: { memberId: true },
    })
    const have = new Set(existing.map(e => e.memberId))
    const toCreate = validIds.filter(mid => !have.has(mid))
    let attributedTrainerId: string | null = null
    if (u.role === 'TRAINER') attributedTrainerId = (await this.ensureTrainerProfile(u.id)).id
    if (toCreate.length) {
      await this.db.programEnrollment.createMany({
        data: toCreate.map(memberId => ({ programId: id, memberId, assignedById: u.id, attributedTrainerId })),
        skipDuplicates: true,
      })
    }
    this.audit.log(u.id, 'program.enroll', 'Program', id, { memberIds: toCreate, count: toCreate.length })
    return { created: toCreate.length, skipped: ids.length - toCreate.length }
  }

  @Post('enrollments/:id/advance')
  @Roles('TRAINER', 'ADMIN')
  async advance(@CurrentUser() u: ReqUser, @Param('id') id: string, @Body() body: { days?: number }) {
    const days = Number(body?.days)
    if (!Number.isInteger(days) || days < 0) throw bad('days must be an integer ≥ 0')
    const e = await this.db.programEnrollment.findUnique({ where: { id } })
    if (!e) throw bad('Enrollment not found', 404)
    await this.assertEnrollmentManager(u, e)
    const total = await this.db.programDay.count({ where: { week: { programId: e.programId } } })
    const unlockedDays = Math.min(e.unlockedDays + days, Math.max(total, 1))
    const updated = await this.db.programEnrollment.update({ where: { id }, data: { unlockedDays } })
    this.audit.log(u.id, 'enrollment.advance', 'ProgramEnrollment', id, { days, unlockedDays })
    return updated
  }

  @Post('enrollments/:id/reset')
  @Roles('TRAINER', 'ADMIN')
  async reset(@CurrentUser() u: ReqUser, @Param('id') id: string) {
    const e = await this.db.programEnrollment.findUnique({ where: { id } })
    if (!e) throw bad('Enrollment not found', 404)
    await this.assertEnrollmentManager(u, e)
    const updated = await this.db.programEnrollment.update({ where: { id }, data: { unlockedDays: 1 } })
    this.audit.log(u.id, 'enrollment.reset', 'ProgramEnrollment', id)
    return updated
  }

  @Get('enrollments/:id')
  async getEnrollment(@CurrentUser() u: ReqUser, @Param('id') id: string) {
    const e = await this.db.programEnrollment.findUnique({
      where: { id },
      include: {
        program: {
          include: {
            weeks: { orderBy: { order: 'asc' }, include: { days: { orderBy: { order: 'asc' }, include: { exercises: { orderBy: { order: 'asc' } } } } } },
          },
        },
      },
    })
    if (!e) throw bad('Enrollment not found', 404)
    let allowed = e.memberId === u.id || u.role === 'ADMIN' || e.assignedById === u.id
    if (!allowed && (u.role === 'TRAINER' || u.role === 'STAFF')) {
      const tp = await this.db.trainer.findUnique({ where: { userId: u.id }, select: { id: true } })
      allowed = !!tp && e.attributedTrainerId === tp.id
    }
    if (!allowed) throw bad('Not your enrollment', 403)
    return this.mapEnrollment(e)
  }

  private mapEnrollment(e: any) {
    const days: any[] = []
    for (const w of e.program.weeks) for (const d of w.days) days.push(d)
    days.sort((a, b) => a.seq - b.seq)
    const next = days.find(d => d.seq === e.unlockedDays) ?? null
    return {
      enrollmentId: e.id,
      memberId: e.memberId,
      assignedById: e.assignedById,
      attributedTrainerId: e.attributedTrainerId,
      unlockedDays: e.unlockedDays,
      completedDays: e.completedDays,
      active: e.active,
      startedAt: e.startedAt,
      program: {
        id: e.program.id,
        title: e.program.title,
        description: e.program.description,
        level: e.program.level,
        totalDays: days.length,
        nextDay: next ? { seq: next.seq, label: next.label, focusNote: next.focusNote, exerciseCount: next.exercises.length } : null,
        weeks: e.program.weeks.map((w: any) => ({
          id: w.id,
          order: w.order,
          days: w.days.map((d: any) => ({
            id: d.id,
            order: d.order,
            seq: d.seq,
            label: d.label,
            focusNote: d.focusNote,
            locked: d.seq > e.unlockedDays,
            exercises: d.exercises.map((x: any) => ({
              id: x.id,
              exerciseId: x.exerciseId,
              mode: x.mode,
              sets: x.sets,
              reps: x.reps,
              sec: x.sec,
              min: x.min,
              speed: x.speed,
              weightKg: x.weightKg,
              bodyweight: x.bodyweight,
              perSide: x.perSide,
              restSec: x.restSec,
              notes: x.notes,
              order: x.order,
              locked: d.seq > e.unlockedDays,
            })),
          })),
        })),
      },
    }
  }

  private async countsFor(ids: string[]) {
    const map = new Map<string, { weeks: number; days: number; exercises: number }>()
    if (!ids.length) return map
    for (const id of ids) map.set(id, { weeks: 0, days: 0, exercises: 0 })
    const [weekRows, dayRows] = await Promise.all([
      this.db.programWeek.groupBy({ by: ['programId'], where: { programId: { in: ids } }, _count: { _all: true } }),
      this.db.programDay.findMany({
        where: { week: { programId: { in: ids } } },
        select: { week: { select: { programId: true } }, _count: { select: { exercises: true } } },
      }),
    ])
    for (const w of weekRows) {
      const c = map.get(w.programId)
      if (c) c.weeks = w._count._all
    }
    for (const d of dayRows) {
      const c = map.get(d.week.programId)
      if (c) {
        c.days += 1
        c.exercises += d._count.exercises
      }
    }
    return map
  }

  private normalizeTree(body: any): { title: string; description: string | null; level: string | null; weeks: NormWeek[] } {
    const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 200) : ''
    if (!title) throw bad('title required')
    const description =
      typeof body?.description === 'string' && body.description.trim() ? body.description.trim().slice(0, 4000) : null
    const level = typeof body?.level === 'string' && body.level.trim() ? body.level.trim().slice(0, 40) : null
    const rawWeeks = Array.isArray(body?.weeks) ? body.weeks : []
    const weeks: NormWeek[] = rawWeeks.map((w: any, wi: number) => {
      const rawDays = Array.isArray(w?.days) ? w.days : []
      const days: NormDay[] = rawDays.map((d: any, di: number) => {
        const label = typeof d?.label === 'string' && d.label.trim() ? d.label.trim().slice(0, 120) : ''
        if (!label) throw bad(`Week ${wi + 1} day ${di + 1}: label required`)
        const focusNote =
          typeof d?.focusNote === 'string' && d.focusNote.trim() ? d.focusNote.trim().slice(0, 1000) : null
        const rawEx = Array.isArray(d?.exercises) ? d.exercises : []
        const exercises = rawEx.map((x: any, xi: number) => this.normalizeExercise(x, `week ${wi + 1} day ${di + 1} #${xi + 1}`))
        return { label, focusNote, exercises }
      })
      return { days }
    })
    return { title, description, level, weeks }
  }

  private normalizeExercise(x: any, at: string): NormEx {
    const exerciseId = typeof x?.exerciseId === 'string' && x.exerciseId.trim() ? x.exerciseId.trim() : ''
    if (!exerciseId) throw bad(`Exercise ${at}: exerciseId required`)
    const mode = ['reps', 'time', 'cardio'].includes(x?.mode) ? (x.mode as string) : 'reps'
    const sets = Number(x?.sets)
    if (!Number.isInteger(sets) || sets < 1 || sets > 99) throw bad(`Exercise ${at}: sets must be an integer 1–99`)
    const optInt = (v: any, field: string): number | null => {
      if (v === undefined || v === null || v === '') return null
      const n = Number(v)
      if (!Number.isInteger(n)) throw bad(`Exercise ${at}: ${field} must be an integer`)
      return n
    }
    const optFloat = (v: any, field: string): number | null => {
      if (v === undefined || v === null || v === '') return null
      const n = Number(v)
      if (!Number.isFinite(n)) throw bad(`Exercise ${at}: ${field} must be a number`)
      return n
    }
    return {
      exerciseId,
      mode,
      sets,
      reps: optInt(x.reps, 'reps'),
      sec: optInt(x.sec, 'sec'),
      min: optInt(x.min, 'min'),
      restSec: optInt(x.restSec, 'restSec'),
      speed: optFloat(x.speed, 'speed'),
      weightKg: optFloat(x.weightKg, 'weightKg'),
      bodyweight: x.bodyweight === true,
      perSide: x.perSide === true,
      notes: typeof x.notes === 'string' && x.notes.trim() ? x.notes.trim().slice(0, 500) : null,
    }
  }

  private async writeTree(tx: Prisma.TransactionClient, programId: string, weeks: NormWeek[]) {
    let seq = 0
    for (let wi = 0; wi < weeks.length; wi++) {
      const week = await tx.programWeek.create({ data: { programId, order: wi + 1 } })
      for (let di = 0; di < weeks[wi].days.length; di++) {
        const d = weeks[wi].days[di]
        seq += 1
        const day = await tx.programDay.create({
          data: { weekId: week.id, order: di + 1, label: d.label, focusNote: d.focusNote, seq },
        })
        if (d.exercises.length) {
          await tx.programExercise.createMany({
            data: d.exercises.map((x, i) => ({ ...x, dayId: day.id, order: i + 1 })),
          })
        }
      }
    }
  }

  private async ensureTrainerProfile(userId: string) {
    const found = await this.db.trainer.findUnique({ where: { userId } })
    if (found) return found
    try {
      return await this.db.trainer.create({ data: { userId } })
    } catch (e: any) {
      if (e?.code !== 'P2002') throw e
      return this.db.trainer.findUniqueOrThrow({ where: { userId } })
    }
  }

  private async assertEnrollmentManager(u: ReqUser, e: { assignedById: string; attributedTrainerId: string | null }) {
    if (u.role === 'ADMIN') return
    if (e.assignedById === u.id) return
    const tp = await this.db.trainer.findUnique({ where: { userId: u.id }, select: { id: true } })
    if (tp && e.attributedTrainerId === tp.id) return
    throw bad('Not your client', 403)
  }
}
