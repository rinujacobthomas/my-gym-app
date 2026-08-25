/**
 * Seed: gym settings, starter plans, slot templates, exercise catalog premium flags.
 * Idempotent — safe to run on every deploy. Run: pnpm --filter @og/api db:seed
 */
import { PrismaClient } from '../generated/prisma/index.js'
import { EXDB } from '../../../packages/core/src/exercises-data.js'

const db = new PrismaClient()

// ~18% of strength exercises are "premium" — locked until a trainer unlocks them.
// Deterministic hash so reseeding doesn't shuffle which ones are gated.
const hash = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h) }
const PREMIUM_RATE = 0.18

async function main() {
  await db.gymSettings.upsert({
    where: { id: 'main' },
    create: { id: 'main' },
    update: {},
  })

  const plans = [
    { name: 'Monthly', pricePaise: 150000, durationDays: 30, description: 'Full gym access for 30 days', sortOrder: 1 },
    { name: 'Quarterly', pricePaise: 400000, durationDays: 90, description: '3 months — save ₹500', sortOrder: 2 },
    { name: 'Annual', pricePaise: 1400000, durationDays: 365, description: 'Best value — 12 months', sortOrder: 3 },
  ]
  for (const p of plans) {
    await db.plan.upsert({ where: { id: 'plan-' + p.name.toLowerCase() }, create: { id: 'plan-' + p.name.toLowerCase(), ...p }, update: p })
  }

  const templates = [
    { name: 'Early morning', weekday: -1, startMin: 300, endMin: 540, capacity: 40 }, // weekday=-1 → all days
    { name: 'Late morning', weekday: -1, startMin: 540, endMin: 720, capacity: 30 },
    { name: 'Afternoon', weekday: -1, startMin: 720, endMin: 960, capacity: 25 },
    { name: 'Evening peak', weekday: -1, startMin: 960, endMin: 1260, capacity: 45 },
    { name: 'Night', weekday: -1, startMin: 1260, endMin: 1380, capacity: 20 },
  ]
  const existing = await db.gymSlotTemplate.count()
  if (existing === 0) {
    for (let wd = 0; wd < 7; wd++) {
      for (const t of templates) {
        await db.gymSlotTemplate.create({ data: { ...t, weekday: wd } })
      }
    }
    console.log('Seeded slot templates (7 days × 5 slots)')
  }

  // Exercise catalog mirror — only premium flags matter here; the dataset itself ships to clients.
  let premium = 0
  for (const e of EXDB as any[]) {
    const isPremium = /cardio/i.test(e.bp || '') ? false : hash(e.id) % 100 < PREMIUM_RATE * 100
    if (isPremium) premium++
    await db.exercise.upsert({
      where: { id: e.id },
      create: { id: e.id, name: e.n || e.id, bodypart: e.bp || 'other', equipment: e.eq || null, isPremium },
      update: { isPremium },
    })
  }
  console.log(`Seeded ${EXDB.length} exercises (${premium} premium)`)

  console.log('Seed complete. First Google login with an email in ADMIN_EMAILS becomes ADMIN.')
}

main().finally(() => db.$disconnect())
