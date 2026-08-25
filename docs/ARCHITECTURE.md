# openGym architecture

A pnpm/Turborepo monorepo: three React frontends, one NestJS API, PostgreSQL, and shared
packages. Every rule that matters — who may sign up, who may book, what a rupee does — is
enforced server-side in `apps/api`; the frontends render and ask.

## Monorepo layout

```
openGym/
├── apps/
│   ├── web/        # member PWA: train, book, eat, pay            → served at /
│   ├── trainer/    # coach console: attendance, programs, PT      → served at /coach
│   ├── admin/      # management console: approvals, money, stats  → served at /admin
│   └── api/        # NestJS 11 + Prisma 6 REST API (port 3000)
│       ├── src/
│       │   ├── auth/         # Google OAuth, sessions, check-in HMAC codes
│       │   ├── common/       # guards (session/roles/membership), settings, audit
│       │   ├── state/        # AppState JSON blob get/put
│       │   ├── workouts/     # WorkoutLog write-once endpoints
│       │   ├── membership/   # plans, Razorpay orders/verify/webhook, freeze
│       │   ├── scheduling/   # templates → slot instances, bookings, waitlist, QR
│       │   ├── trainers/     # availability, PT bookings, member notes
│       │   ├── programs/     # program builder, enrollment, day unlocks
│       │   ├── exercises/    # catalog mirror, unlocks, presets, experienced flag
│       │   ├── nutrition/    # entries, water, favorites, OpenFoodFacts proxy
│       │   ├── push/         # Web Push subscriptions + senders
│       │   ├── admin/        # users, payments ledger, plans, day passes,
│       │   │                 # announcements, analytics, CSV export, audit, settings
│       │   ├── cron/         # nightly maintenance + auto-book
│       │   └── prisma.service.ts
│       └── prisma/
│           ├── schema.prisma # the whole feature surface
│           └── seed.ts       # gym settings, starter plans, slot templates, premium flags
├── packages/
│   ├── core/       # pure training logic: progression, 1RM, effort, muscles, history
│   │               # (plain JS + Vitest suites, zero runtime deps)
│   ├── ui/         # shared components: LineChart, Heatmap, BodyMap, Icon, primitives
│   └── api-client/ # fetch wrapper + endpoint functions + React Query factory/key helpers
├── docker-compose.yml   # postgres + api + web(nginx) + one-shot media clone
├── Dockerfile           # builds all three SPAs, serves them from nginx at /, /coach, /admin
├── turbo.json           # build/test/dev task graph; global env allowlist
└── scripts/import-legacy.mjs  # v1 → v2 history exporter
```

The three SPAs share `@og/ui`, `@og/core` and `@og/api-client`. The client registers an
`onUnauthorized` handler per app so a dead session lands on the login screen instead of
leaking 401s out of unrelated queries.

## Data split: one blob plus real tables

Member-authored training data lives in two shapes, chosen per shape:

- **`AppState`** — one JSON blob per user (`data Json`). Routines, weekly plan, day overrides,
  per-exercise weights, body-weight log, custom exercises, display settings. This mirrors the
  client's Zustand store exactly and syncs with last-write-wins semantics. It exists because
  this data is *documents*: the client owns the shape, reads it wholesale, writes it wholesale,
  and nothing else needs to query into it.
- **Relational tables** for anything the server must reason about or aggregate:
  `WorkoutLog` (finished sessions — written once at finish time, client UUID as idempotency
  key), `NutritionEntry`, `Booking`, `Payment`, `Membership`, `ProgramEnrollment`, …

The rule of thumb: if only the owner's UI reads it, it's the blob; if admin analytics,
guards, money or capacity ever need it, it's a table. `WorkoutLog` is relational even though
it's member data because revenue-adjacent features (attendance stats, popular exercises) and
the renew wall read it server-side.

## Auth flow

```
browser                    api/auth                        Google
   │  GET /api/auth/google?next=/bookings                     │
   │──────────────────────────▶│  state cookie + redirect    │
   │◀──────302─────────────────│────────────────────────────▶│ consent
   │  GET /api/auth/google/callback?code=…                   │
   │──────────────────────────▶│  code→tokens, id_token      │
   │                           │  upsert (rules below)       │
   │◀──Set-Cookie: og_session──│  opaque session row         │
```

Upsert rules, in order:

1. Google's `email_verified` must be true — no verified email, no account.
2. Email in **`ADMIN_EMAILS`** → role ADMIN, status ACTIVE (bootstrap *and* second-admin seat).
3. Very first account on a fresh instance → ACTIVE ADMIN (so a solo self-hoster is never locked out).
4. Existing user matched by `googleId`, or by verified email (same human, new Google button) → keep existing role/status, update googleId/avatar/name.
5. Anyone else → MEMBER, status **PENDING**: they can see `/api/me` and a waiting room until an admin approves.

Sessions are opaque high-entropy tokens stored in the `Session` table; the cookie carries
exactly that token — nothing signed to reverse, revocation is a DELETE. Logout-all kills every
session for the user. The user is loaded fresh from DB on every request, so role/status changes
bite instantly.

Every request then passes three guards:

1. **SessionGuard** — valid unexpired session; DISABLED accounts are rejected outright; PENDING accounts pass only far enough to reach their own waiting-room endpoints.
2. **RolesGuard** — `@Roles('ADMIN','STAFF',…)` metadata; no metadata = any ACTIVE account. ADMIN passes every gate.
3. **MembershipGuard** — member-facing value features only (booking, check-in, workout/nutrition writes). Non-MEMBER roles pass free (staff exemption).

Membership status matrix (computed fresh per request):

| days left vs `endDate` | status | booking/check-in/log |
|---|---|---|
| > 7 | ACTIVE | ✅ |
| 0–7 | EXPIRING | ✅ (+ renewal nudges) |
| −3 … <0 | GRACE | ✅ — renew without losing access |
| < −3 | EXPIRED | ❌ 403 `{reason:'expired'}` — history stays readable |
| frozen | FROZEN | ❌ — freeze pauses expiry but blocks booking |

## Money flow

Razorpay handles online payment; the server owns every state transition.

```
member                api/membership                 Razorpay
  │ POST /payments/order  │                            │
  │──────────────────────▶│ createOrder(amount, receipt)
  │                       │ Payment row: CREATED       │
  │◀─ orderId + keyId ────│                            │
  │  checkout.js (UPI/card)                            │
  │ POST /payments/verify {orderId,paymentId,signature}│
  │──────────────────────▶│ HMAC verify ──fail──▶ FAILED
  │                       │ markPaidAndExtend()        │
webhook (backup path): raw-body signature verify; events
payment.captured / order.paid / payment.failed
```

- **Idempotency:** both paths converge on `markPaidAndExtend()`, which checks `status !== 'PAID'`
  before acting — checkout verify and webhook can race and only one extension happens. Webhooks
  always answer 200 after handling so Razorpay doesn't retry forever; amount mismatch against
  the order is recorded as a `disputeNote`, never silently accepted. Stale CREATED orders are
  failed by the nightly cron after 24 h.
- **Extension rule:** renewing extends the latest membership iff its `endDate ≥ today − 3d`
  (grace window): new end = `max(today, endDate) + durationDays`. Lapsed longer than grace
  starts a fresh membership today. So renewing early never wastes paid days, and a lapsed
  renewal doesn't resurrect ghost months.
- **Manual money:** desk records CASH/CARD_POS payments (`recordedById` attribution), matches a
  bank UTR to an order, marks refunds after gateway refund, and logs disputes ("member claims
  they paid") with resolve/refund-mark actions. Day passes bypass memberships entirely:
  `DayPassSale` with a walk-in check-in code.
- All money is integer paise. Nothing trusts the client for amounts.

## Scheduling model

Two layers:

- **`GymSlotTemplate`** — the recurring weekly board: weekday (or all-days), start/end minutes,
  capacity. Admin edits templates via `GET/PUT /api/schedule/templates` (full-board replace,
  validated, audited).
- **`SlotInstance`** — materialized concrete slots per date, regenerated to fill the rolling
  `bookingWindowDays` window each night. Bookings hang off instances, so editing a template
  never rewrites history.

Booking races are handled inside a transaction: recount BOOKED+CHECKED_IN for the slot and
bail with 409 if `count ≥ capacity` — two members tapping the last seat can't both win.
`@@unique([slotId, userId])` stops double-booking.

Waitlist: joining requires the slot to actually be full; entries carry explicit positions.
Every confirmed cancellation calls `promoteFromWaitlist()` in a transaction — recount capacity,
take the head of the active list, delete the entry, create the booking — and the API response
tells the canceller who got promoted (which drives their push notification).

Cancel cutoff: cancelling within `cancelCutoffMin` of slot start consumes the month's
`graceCancelPerMonth` freebie (`cancelSource: GRACE`, counted per calendar month); outside the
cutoff it's refused. Slots already over can't be cancelled.

QR check-in: the member shows `GET /api/bookings/checkin-code`, which returns
`HMAC-SHA256(secret, userId + '|' + dateISO)` truncated to 24 hex chars, uppercased, grouped
`XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`. Properties: rotates daily, reveals nothing about the user,
can't be replayed tomorrow. The scanner endpoint iterates ACTIVE users recomputing the HMAC —
no token table to leak. Staff/trainer/admin scan via coach console; if there was no booking,
a WALK_IN booking is created while capacity lasts.

Weekly auto-book: `AutoBookPattern` rows (weekday + times); after nightly slot generation the
cron books matching instances for tomorrow and pushes a confirmation. Members opt in/out via
`GET/PUT /api/bookings/patterns`.

## Programs & unlocks

A program is weeks → days → exercises. Each `ProgramDay` carries a flat **`seq`** counter
across the whole program; an enrollment stores `unlockedDays` (starts at 1). The trainer
advances an enrollment via `POST /api/enrollments/:id/advance` (and can reset), so members
see completed days plus the next one — progressive delivery, not a dump of week 12 on day one.
`assignedById` attributes the assignment; `attributedTrainerId` can redirect PT credit.

Library gating is separate: the `Exercise` table mirrors the client dataset with only
`isPremium` flags added. `ExerciseUnlock` rows grant either a single exerciseId or a whole
bodypart. Trainers apply **`UnlockPreset`s** — named JSON blobs (`{ exerciseIds?, bodyparts?,
all? }`) like "Beginner set" or "Full library" — instead of hand-picking per client. A member's
`Profile.experienced` flag short-circuits gating to default-open for veterans.

## Nutrition: OpenFoodFacts proxy

Search and barcode lookups go through the API (`/api/nutrition/off/search`,
`/api/nutrition/off/barcode/:code`) rather than browser-to-OFF. Reasons: rate limits shared by
all members instead of per-browser, response normalization, and no member data (not even IPs
tied to queries beyond what OFF sees from the server) flows upstream. Results are cached
in-memory for 24 h with a bounded map (oldest-evicted at capacity), so repeated barcode scans
of the same product cost nothing.

## Cron jobs

One nightly run at 00:10 (`CronService`), stages isolated so one failure never blocks the rest;
each stage dedupes in-memory so manual re-runs don't double-notify:

| Stage | What |
|---|---|
| generate-slots | materialize SlotInstances across the booking window |
| auto-book | book members' weekly patterns for tomorrow + push confirmations |
| no-show sweep | yesterday's still-BOOKED rows → NO_SHOW |
| expiry reminders | push once/day for memberships ending ≤3 days out |
| stale orders | Payment CREATED >24 h → FAILED |
| tomorrow reminders | "gym tomorrow HH:MM" for booked members with devices |
| workout reminders | ported v1 behavior: reminder enabled + local HH:MM match + routine scheduled + nothing logged yet |

Plus rest-timer pushes, which are request-driven from the app (`POST /api/push/rest-timer`),
not cron.

## Analytics & exports

Read-only rollups over relational tables (no client trust involved):

- `GET /api/admin/overview` — headline counts
- `GET /api/admin/revenue` — payments grouped by period/method/status
- `GET /api/admin/members-growth` — joins vs lapses over time
- `GET /api/admin/attendance` — check-ins/no-shows per slot/period
- `GET /api/admin/popular-exercises` — aggregated from WorkoutLog entries
- `GET /api/admin/export/:file` — CSV downloads (payments, members, attendance)

## Testing story

Training math lives in `packages/core` as pure functions precisely so it can be tested without
DOM, network or database: Vitest suites sit next to the sources (`progression`, `onerm`,
`effort`, `history`) and pin the behaviors that must never drift — missed reps don't advance
load, stalls deload, 1RM refuses >12 reps, effort scales convert losslessly. `turbo test` runs
them through the task graph, and `test` depends on `^build`, so a suite never runs against a
stale workspace package. Frontend/API integration tests are not there yet; the API currently
ships none — the guards and money paths above are the highest-value next candidates.

## Deploying

`docker compose up -d` brings up: Postgres 16 (named volume — back this up), the NestJS API,
a one-shot media service cloning the exercise dataset (~140 MB, skipped when present), and one
nginx serving the member app at `/`, the coach console at `/coach`, the admin console at
`/admin`, proxying `/api` to the API container and serving media statically. All config is
environment-driven — see `.env.example` for the full list.
