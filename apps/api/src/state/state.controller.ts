import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common'
import { CurrentUser, ReqUser, MembershipGuard } from '../common/guards.js'
import { PrismaService } from '../prisma.service.js'

/// The legacy-style blob: routines, week plan, settings, bodyweight. Last-write-wins with a
/// client-side dirty flag; `active` (in-progress workout) is device-local and stripped here.
@Controller('state')
@UseGuards(MembershipGuard)
export class StateController {
  constructor(private db: PrismaService) {}

  @Get()
  async get(@CurrentUser() u: ReqUser) {
    const row = await this.db.appState.findUnique({ where: { userId: u.id } })
    return { state: row?.data ?? null }
  }

  @Put()
  async put(@CurrentUser() u: ReqUser, @Body() body: { state?: any }) {
    if (!body.state || typeof body.state !== 'object') return { ok: false }
    const state = { ...body.state }
    delete state.active // never sync an in-progress workout across devices
    await this.db.appState.upsert({
      where: { userId: u.id },
      create: { userId: u.id, data: state },
      update: { data: state },
    })
    return { ok: true }
  }
}
