import { Controller, Get } from '@nestjs/common'
import { Public } from './common/guards.js'
import { PrismaService } from './prisma.service.js'

@Controller('health')
export class HealthController {
  constructor(private db: PrismaService) {}
  @Public()
  @Get()
  async health() {
    await this.db.$queryRaw`SELECT 1`
    return { ok: true }
  }
}
