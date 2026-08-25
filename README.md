<div align="center">

<img src="assets/banner.png" alt="openGym" width="720">

<br>

**Run your gym on your own box — front desk, trainers and members, one system.**

Members book slots, train guided workouts and pay online. Trainers run classes,
check people in and build programs. You approve signups, take cash at the desk and
watch the numbers. Three apps, one API, one database — `docker compose up` and it's yours.

<br>

[![License: AGPL v3](https://img.shields.io/badge/license-AGPL--3.0-a3e635?style=flat-square)](LICENSE)
![Self-hosted](https://img.shields.io/badge/self--hosted-%F0%9F%8F%A0-60a5fa?style=flat-square)
![React](https://img.shields.io/badge/React-19-38bdf8?style=flat-square&logo=react&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-11-e0234e?style=flat-square&logo=nestjs&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![No tracking](https://img.shields.io/badge/telemetry-none-f472b6?style=flat-square)
<br>
![GitHub last commit](https://img.shields.io/github/last-commit/DuarteSantos8/openGym?style=flat-square)
[![GitHub stars](https://img.shields.io/github/stars/DuarteSantos8/openGym?style=flat-square)](https://github.com/DuarteSantos8/openGym/stargazers)
[![GitHub issues](https://img.shields.io/github/issues/DuarteSantos8/openGym/issues?style=flat-square)](https://github.com/DuarteSantos8/openGym/issues)

</div>

<div align="center">
<table>
<tr>
<td align="center"><img src="assets/screenshots/home.png" alt="Home" width="230"><br><sub><b>Member app</b> — today's workout & booking</sub></td>
<td align="center"><img src="assets/screenshots/workout.png" alt="Workout" width="230"><br><sub><b>Guided workout</b> — animated demos & sets</sub></td>
<td align="center"><img src="assets/screenshots/stats.png" alt="Stats" width="230"><br><sub><b>Stats</b> — heatmap, charts & PRs</sub></td>
</tr>
</table>
</div>

## Why

Gym software is priced per-member and holds your data hostage. openGym is the opposite:
it runs on hardware you control, your members' data stays in a database you can back up
with one command, and the whole thing is yours to fork. It still feels modern — installable
as a home-screen app, Google sign-in, push notifications, offline-friendly training screens.

## Features

### Members (the training app)

- 🔑 **Google login** — no passwords to forget; new signups land in an approval queue
- ▶️ **Guided workouts** — animated demos, rest timer, pre-filled weights, PR detection, and progression rules (linear, Greyskull LP, double progression, timed) that decide the next target and *say why*
- 📈 **Stats that answer questions** — activity heatmap, muscle map, estimated 1RM curves, PRs
- 🍽️ **Calorie & macro tracker** — search **OpenFoodFacts** or scan a barcode, water intake, favorites, TDEE-derived targets
- 🗓️ **Slot booking** — live capacity, a waitlist that auto-promotes you when a seat frees up, and weekly auto-book for your usual slots
- 📷 **QR check-in** — a daily code on your phone; the desk scans it, you're in
- 💳 **Membership in the app** — buy, renew and freeze plans via **Razorpay** (UPI, cards); full payment history
- 🎯 **Trainer-assigned programs** — assigned to you by your coach, days unlock as you complete them
- 🔒 **A library that opens up** — beginners start with a safe subset; your trainer unlocks more (or flips you to experienced and everything's open)
- 🔔 **Push notifications** — booking confirmations, expiry reminders, workout-day nudges, rest-timer alerts

### Trainers (the coach console)

- 🟢 **Live attendance per slot** — who booked, who checked in, who didn't show
- 📷 **QR scanner check-in** — point the camera, done; walk-ins get created on the spot
- 🗓️ **Your availability** — weekly PT hours plus private breaks with enforced buffers between sessions
- 🏗️ **Program builder** — weeks → days → exercises; assign to clients and unlock days as they progress
- 🔓 **Exercise unlock presets** — "Beginner set", "Rehab subset", "Full library" — apply once, per client
- 🩹 **Injury notes** — a red banner on the member's profile you can't scroll past
- 🤝 **PT bookings** — members book into your open hours; you cancel or complete from the same board

### Admins (the management console)

- ✅ **Approval queue** — nobody trains until you say so
- 👥 **People & roles** — admins, trainers, **STAFF** (reception: check-in + cash only), members; disable accounts
- 💰 **Plans & payments ledger** — online payments land automatically; record manual **cash/card** entries, match UTR references, mark refunds, log disputes
- 🎟️ **Day passes** — sell a walk-in a single visit, hand them a check-in code
- 📣 **Announcements** — push to everyone, active members only, expiring soon, or lapsed
- 📊 **Analytics** — revenue, attendance, member growth, popular exercises
- 📤 **CSV exports** — payments, members, attendance; yours to keep
- 🧾 **Audit log** — who approved, refunded, refunded again…
- ⚙️ **Gym settings** — opening hours, booking window, cancel cutoff, freeze limits, day-pass price

## House rules (all enforced server-side)

| Policy | What it means |
|---|---|
| Approved signups | A fresh Google login gets a waiting room; an admin approves before anything else works |
| Renew wall | Expired members can't book, check in, or log new workouts — but their whole history stays readable |
| 3-day grace | Membership ended today isn't expired yet; there's a 3-day window to renew without losing access |
| Staff exemption | Trainer/staff/admin accounts aren't gated by memberships |
| Grace cancel | Cancel inside the cutoff window freely; past it, one free late-cancel per month |
| Waitlist | Full slot? Join the list — the first cancellation promotes you automatically |
| Walk-ins | No booking, no problem — the desk creates one at check-in while capacity lasts |

## Quick start (self-host)

You need [Docker](https://docs.docker.com/get-docker/) with Compose, plus two sets of keys:

- **Google OAuth credentials** ([console](https://console.cloud.google.com/apis/credentials)) with authorized redirect URI `{PUBLIC_APP_URL}/api/auth/google/callback`
- **Razorpay test keys** ([dashboard](https://dashboard.razorpay.com/app/keys)) — switch to live keys when you go real

```bash
git clone https://github.com/DuarteSantos8/openGym
cd openGym
cp .env.example .env    # fill in OAuth, Razorpay, DB password, PUBLIC_APP_URL
docker compose up -d
```

First start clones the exercise media (~140 MB, one time). Then open **http://localhost:8080**
and sign in with a Google account listed in `ADMIN_EMAILS` — that account becomes an active
admin immediately. Everyone else signs up and waits for your approval. Starter plans, slot
templates and gym settings come seeded, so the gym works before you touch anything.

> Putting it on a real domain? Set `PUBLIC_APP_URL=https://gym.example.com`, point your TLS
> proxy at the web container, and restart. Details in **[docs/SELF_HOSTING.md](docs/SELF_HOSTING.md)**.

## Developing

```bash
pnpm i                          # pnpm 10
docker compose up postgres -d   # just the database
pnpm db:migrate && pnpm db:seed
pnpm dev                        # turbo runs everything
```

| URL | What |
|---|---|
| http://localhost:5173 | Member app |
| http://localhost:5174 | Coach console |
| http://localhost:5175 | Admin console |
| http://localhost:3000 | NestJS API |

Each Vite dev server proxies `/api` to :3000, so cookies just work. See
**[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for how the pieces fit.

## How it fits together

```
            ┌────────────────────────── one origin, one nginx ──────────────────────────┐
 browser ──▶│  /  member app · /coach  trainer console · /admin  admin console          │
            │      /api ─────────────▶ NestJS + Prisma ────────▶ PostgreSQL 16          │
            │      /img /gif ◀──────── media (cloned once, ~140 MB)                     │
            └────────────────────────────────────────────────────────────────────────────┘
```

- **apps/web** — the member PWA: training, booking, nutrition, payments
- **apps/trainer** — coach console: attendance, check-in, programs, PT
- **apps/admin** — management console: approvals, money, analytics, settings
- **apps/api** — NestJS 11 REST API; every money/capacity decision happens here
- **packages/** — shared core (progression, 1RM, muscles — pure functions), UI kit, typed API client

## Tech

Turborepo + pnpm workspace · React 19 + Vite + Tailwind 4 + Zustand + TanStack Query ·
NestJS 11 + Prisma 6 + PostgreSQL 16 · Razorpay (orders, checkout, webhooks) · Web Push ·
nginx + Docker Compose. Web-only by design — the old Capacitor mobile shell was removed;
every screen is a responsive installable PWA.

The training logic — progression rules, 1RM estimation, how a logged session is read back —
lives in pure functions in `packages/core` with Vitest suites next to them: `pnpm test`.

## Coming from openGym v1?

v1 was a single-user passkey tracker. Passkey profiles have no email, so they can't be
migrated automatically: sign up with Google, then run `node scripts/import-legacy.mjs`
against your old `./data` folder — it exports each profile's workout history and body-weight
log so the new account can reattach what it recognizes. Best effort, never destructive.

## Community

- **[Q&A](https://github.com/DuarteSantos8/openGym/discussions/categories/q-a)** — self-hosting help, OAuth/Razorpay trouble, "how do I…"
- **[Ideas](https://github.com/DuarteSantos8/openGym/discussions/categories/ideas)** — features worth talking through before anyone writes code
- **[Issues](https://github.com/DuarteSantos8/openGym/issues)** — bugs, and work that's already been agreed on

## Contributing

Issues and PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). **A ⭐ helps more people find it.**

openGym is free and stays free: AGPL, no subscription, no paid tier, nothing held back for
sponsors. If it replaced paid software for your gym and you want to chip in, the Sponsor
button at the top of the page is there.

## License

[GNU AGPL v3.0](LICENSE) — free and open source. You can self-host, use, modify and share it;
if you run a modified version as a network service, you must offer that version's source under
the same license. Nobody can turn openGym into a closed, proprietary product.

Exercise images/GIFs are fetched from the upstream dataset and keep their own terms; the body
diagram geometry is derived from MuscleMap (MIT) — see [NOTICE.md](NOTICE.md).
