import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common'
import { PrismaService } from '../prisma.service.js'
import { CurrentUser, MembershipGuard, ReqUser, bad } from '../common/guards.js'
import { OffService } from './off.service.js'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MEALS = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK']
const SOURCES = ['MANUAL', 'OFF_SEARCH', 'OFF_BARCODE']
const GOALS = ['LOSE_FAT', 'MAINTAIN', 'BUILD_MUSCLE']
const ACTIVITY = ['SEDENTARY', 'LIGHT', 'MODERATE', 'HIGH', 'ATHLETE']

function parseDate(s?: string): Date | null {
  if (!s || !DATE_RE.test(s)) return null
  const d = new Date(s + 'T00:00:00.000Z')
  return isNaN(d.getTime()) ? null : d
}

function clamp0(v: any): number {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

@Controller()
export class NutritionController {
  constructor(private db: PrismaService, private off: OffService) {}

  @Get('nutrition')
  async day(@CurrentUser() u: ReqUser, @Query('date') date?: string) {
    const d = parseDate(date)
    if (!d) throw bad('Invalid or missing date (YYYY-MM-DD)')
    const [entries, water, profile] = await Promise.all([
      this.db.nutritionEntry.findMany({ where: { userId: u.id, date: d }, orderBy: { createdAt: 'asc' } }),
      this.db.hydrationLog.findUnique({ where: { userId_date: { userId: u.id, date: d } } }),
      this.db.profile.findUnique({ where: { userId: u.id } }),
    ])
    return {
      entries,
      water: { ml: water?.ml ?? 0 },
      target:
        profile?.dailyCalorieTarget != null
          ? { kcal: profile.dailyCalorieTarget, proteinPct: profile.proteinPct, carbsPct: profile.carbsPct, fatPct: profile.fatPct }
          : null,
    }
  }

  @Post('nutrition')
  @UseGuards(MembershipGuard)
  async add(@CurrentUser() u: ReqUser, @Body() body: any) {
    const d = parseDate(body?.date)
    if (!d) throw bad('Invalid or missing date (YYYY-MM-DD)')
    const meal = String(body?.meal ?? '').toUpperCase()
    if (!MEALS.includes(meal as any)) throw bad('Invalid meal')
    const name = String(body?.name ?? '').trim()
    if (!name) throw bad('Name required')
    if (name.length > 120) throw bad('Name too long (max 120 chars)')
    const kcalRaw = Number(body?.kcal)
    if (!Number.isFinite(kcalRaw)) throw bad('kcal required')
    const source = body?.source != null ? String(body.source).toUpperCase() : 'MANUAL'
    if (!SOURCES.includes(source as any)) throw bad('Invalid source')
    const row = await this.db.nutritionEntry.create({
      data: {
        userId: u.id,
        date: d,
        meal: meal as any,
        name,
        servings: clamp0(body.servings ?? 1),
        kcal: clamp0(kcalRaw),
        proteinG: clamp0(body.proteinG),
        carbsG: clamp0(body.carbsG),
        fatG: clamp0(body.fatG),
        source: source as any,
        offId: body.offId != null ? String(body.offId) : null,
      },
    })
    return row
  }

  @Delete('nutrition/:id')
  async removeEntry(@CurrentUser() u: ReqUser, @Param('id') id: string) {
    const r = await this.db.nutritionEntry.deleteMany({ where: { id, userId: u.id } })
    if (!r.count) throw bad('Not found', 404)
    return { ok: true }
  }

  @Put('nutrition/water')
  @UseGuards(MembershipGuard)
  async water(@CurrentUser() u: ReqUser, @Body() body: any) {
    const d = parseDate(body?.date)
    if (!d) throw bad('Invalid or missing date (YYYY-MM-DD)')
    const ml = Math.round(Math.min(15000, Math.max(0, Number(body?.ml) || 0)))
    const row = await this.db.hydrationLog.upsert({
      where: { userId_date: { userId: u.id, date: d } },
      update: { ml },
      create: { userId: u.id, date: d, ml },
    })
    return { ok: true, ml: row.ml }
  }

  @Get('nutrition/favorites')
  async favorites(@CurrentUser() u: ReqUser) {
    return this.db.nutritionFavorite.findMany({ where: { userId: u.id }, orderBy: { name: 'asc' } })
  }

  @Post('nutrition/favorites')
  async addFavorite(@CurrentUser() u: ReqUser, @Body() body: any) {
    const meal = String(body?.meal ?? '').toUpperCase()
    if (!MEALS.includes(meal as any)) throw bad('Invalid meal')
    const name = String(body?.name ?? '').trim()
    if (!name) throw bad('Name required')
    if (name.length > 120) throw bad('Name too long (max 120 chars)')
    return this.db.nutritionFavorite.create({
      data: {
        userId: u.id,
        name,
        meal: meal as any,
        kcal: clamp0(body.kcal),
        proteinG: clamp0(body.proteinG),
        carbsG: clamp0(body.carbsG),
        fatG: clamp0(body.fatG),
      },
    })
  }

  @Delete('nutrition/favorites/:id')
  async removeFavorite(@CurrentUser() u: ReqUser, @Param('id') id: string) {
    const r = await this.db.nutritionFavorite.deleteMany({ where: { id, userId: u.id } })
    if (!r.count) throw bad('Not found', 404)
    return { ok: true }
  }

  @Get('profile')
  async getProfile(@CurrentUser() u: ReqUser) {
    let p = await this.db.profile.findUnique({ where: { userId: u.id } })
    if (!p) p = await this.db.profile.create({ data: { userId: u.id } })
    return p
  }

  @Put('profile')
  async putProfile(@CurrentUser() u: ReqUser, @Body() body: any) {
    const data: any = {}
    if (body?.heightCm != null) {
      const h = Number(body.heightCm)
      if (!(h >= 80 && h <= 250)) throw bad('Height must be 80–250 cm')
      data.heightCm = h
    }
    if (body?.goal != null) {
      const g = String(body.goal).toUpperCase()
      if (!GOALS.includes(g as any)) throw bad('Invalid goal')
      data.goal = g
    }
    if (body?.activityLevel != null) {
      const a = String(body.activityLevel).toUpperCase()
      if (!ACTIVITY.includes(a as any)) throw bad('Invalid activity level')
      data.activityLevel = a
    }
    if (body?.dailyCalorieTarget != null) {
      const t = Math.round(Number(body.dailyCalorieTarget))
      if (!(t >= 800 && t <= 6000)) throw bad('Calorie target must be 800–6000')
      data.dailyCalorieTarget = t
    }
    for (const k of ['proteinPct', 'carbsPct', 'fatPct'] as const) {
      if (body?.[k] != null) {
        const v = Math.round(Number(body[k]))
        if (!(v >= 5 && v <= 70)) throw bad('Macro percent must be 5–70')
        data[k] = v
      }
    }
    return this.db.profile.upsert({
      where: { userId: u.id },
      update: data,
      create: { userId: u.id, ...data },
    })
  }

  @Get('nutrition/tdee')
  tdee(
    @Query('weight') weight?: string,
    @Query('height') height?: string,
    @Query('age') age?: string,
    @Query('sex') sex?: string,
    @Query('activity') activity?: string,
    @Query('goal') goal?: string,
  ) {
    const w = Number(weight)
    const h = Number(height)
    const a = Number(age)
    if (!(w > 0) || !(h > 0) || !(a > 0)) throw bad('weight, height and age are required numbers')
    const s = String(sex ?? '').toLowerCase()
    const male = s === 'm' || s === 'male'
    const female = s === 'f' || s === 'female'
    if (!male && !female) throw bad("sex must be 'm' or 'f'")
    const mults: Record<string, number> = { sedentary: 1.2, light: 1.375, moderate: 1.55, high: 1.725, active: 1.725, athlete: 1.9 }
    const actKey = String(activity ?? '').toLowerCase()
    if (!(actKey in mults)) throw bad('Invalid activity level')
    const g = String(goal ?? '').toLowerCase().replace(/[-\s]/g, '_')
    const adjust = g === 'lose' || g === 'lose_fat' ? -450 : g === 'gain' || g === 'build_muscle' ? 300 : 0
    const bmr = male ? 10 * w + 6.25 * h - 5 * a + 5 : 10 * w + 6.25 * h - 5 * a - 161
    return {
      kcal: Math.round(bmr * mults[actKey] + adjust),
      suggestion: { proteinPct: 30, carbsPct: 40, fatPct: 30 },
    }
  }

  // ---- OpenFoodFacts proxy (cached server-side; never sends user data upstream) ----

  @Get('nutrition/off/search')
  async offSearch(@CurrentUser() u: ReqUser, @Query('q') q?: string) {
    if (!q || q.trim().length < 2) return { results: [] }
    return { results: await this.off.search(q.trim().slice(0, 80)) }
  }

  @Get('nutrition/off/barcode/:code')
  async offBarcode(@CurrentUser() u: ReqUser, @Param('code') code: string) {
    const product = await this.off.barcode(code.replace(/[^0-9A-Za-z\-]/g, '').slice(0, 32))
    return { product }
  }
}

