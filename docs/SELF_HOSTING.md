# Self-hosting openGym

openGym is a few containers — Postgres, an API, one nginx serving all three consoles — plus a
volume of your data and ~140 MB of exercise media fetched once. This guide takes you from
"just cloned it" to "my gym is running on my own box".

## 1. Get your keys first

Two accounts are needed before `docker compose up` will do anything useful:

**Google OAuth** ([console](https://console.cloud.google.com/apis/credentials)):

1. Create OAuth client credentials (Web application).
2. Add authorized redirect URI: `{PUBLIC_APP_URL}/api/auth/google/callback` — e.g.
   `http://localhost:8080/api/auth/google/callback` for local testing,
   `https://gym.example.com/api/auth/google/callback` in production.

**Razorpay** ([dashboard](https://dashboard.razorpay.com/app/keys)):

- Grab the **test** keys to start; switch to live keys when you go real. You'll need the key
  ID, key secret, and (for webhooks) the webhook secret.

## 2. Run it

Requirements: [Docker](https://docs.docker.com/get-docker/) with the Compose plugin.

```bash
git clone https://github.com/DuarteSantos8/openGym
cd openGym
cp .env.example .env
# fill in: PUBLIC_APP_URL, GOOGLE_CLIENT_ID/SECRET, ADMIN_EMAILS,
#          RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET, POSTGRES_PASSWORD + DATABASE_URL
docker compose up -d
```

- First start clones the exercise images/GIFs (~140 MB) into `./media` once, then starts
  Postgres, the API and nginx.
- Open **http://localhost:8080** and sign in with a Google account listed in `ADMIN_EMAILS`
  (comma-separated in `.env`) — that account becomes an active admin on the spot.
- Starter plans (Monthly/Quarterly/Annual), five daily slot templates and sensible gym settings
  come seeded. Edit them from the admin console whenever you like.

Check it's healthy:

```bash
docker compose ps
curl http://localhost:8080/api/health      # {"ok":true,...}
```

Logs: `docker compose logs -f`. Stop: `docker compose down`.

## 3. Put it on a real domain

Members sign in with Google over HTTPS, so production needs a real hostname.

1. Point DNS at your server.
2. Terminate TLS however you already do — Caddy, Traefik, nginx, Cloudflare Tunnel — and route
   `gym.example.com` → the `web` container (`WEB_PORT`, default 8080).
3. In `.env`: set `PUBLIC_APP_URL=https://gym.example.com`, add the matching redirect URI in
   the Google console, restart with `docker compose up -d`.
4. If frontends run off-origin somewhere, list them in `CORS_ORIGINS`. Same-origin deployments
   need nothing here.

> Set `PUBLIC_APP_URL` correctly before inviting anyone: it's baked into OAuth redirects and
> session cookies. Razorpay webhook URL should be `{PUBLIC_APP_URL}/api/payments/webhook`.

## 4. Who gets in

Signups are **admin-approved by default**: anyone can sign in with Google, but they land in a
waiting room until someone approves them from the admin console. Roles:

| Role | Can |
|---|---|
| ADMIN | everything |
| TRAINER | coach console: attendance, check-in, programs, PT |
| STAFF | reception desk only: check-ins + recording cash payments |
| MEMBER | the member app |

Put your own Gmail in `ADMIN_EMAILS` before first login (that account skips the queue as an
active admin); promote everyone else from **People → role** afterwards.

## 5. Backups

Everything that matters is in Postgres plus the media folder:

```bash
docker compose exec postgres pg_dump -U opengym opengym > opengym-backup-$(date +%F).sql
tar czf media-backup-$(date +%F).tar.gz media/   # optional — re-clones if lost
```

Restore by piping the dump back into a fresh `postgres` container. Members can also export
their own workout history as JSON from the app.

## 6. Notifications

Push notifications (booking confirmations, expiry reminders, tomorrow nudges, rest-timer
alerts) use Web Push. VAPID keys are generated on first run into gym settings — the only knob
is `VAPID_SUBJECT` in `.env`, a `mailto:` contact address browsers may show. Push requires
HTTPS, like every modern browser capability worth having.

## 7. Updating

```bash
git pull
docker compose pull        # prebuilt images — or skip and rebuild below
docker compose up -d
```

Building from source instead:

```bash
git pull
docker compose up -d --build
```

Database schema changes ship as Prisma migrations applied automatically on API start. Your
Postgres volume and downloaded media are untouched.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Login loops back to the start | `PUBLIC_APP_URL` doesn't match the URL in the address bar, or the Google redirect URI is missing/wrong. Make them exact, restart. |
| "Account not active" after login | Signup approval queue — approve from Admin console → People, or add the email to `ADMIN_EMAILS`. |
| Checkout fails / signature error | Wrong or test/live-mixed Razorpay keys; key ID in `.env` must pair with the secret. |
| Payments never confirm | Webhook not configured — point Razorpay at `{PUBLIC_APP_URL}/api/payments/webhook` with the matching `RAZORPAY_WEBHOOK_SECRET`. |
| No exercise images | First-start media clone didn't finish — check `docker compose logs media`, re-run `docker compose up -d`. |
| Port 8080 already used | Set `WEB_PORT=9090` in `.env`. |
| Push option missing for members | Needs HTTPS (or `localhost`) and a granted notification permission. |
| DB connection refused | Postgres container down or `DATABASE_URL` password doesn't match `POSTGRES_PASSWORD`. Check `docker compose logs postgres`. |
