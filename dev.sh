#!/usr/bin/env bash
#
# openGym local dev bootstrapper.
#
#   ./dev.sh
#     1. ensures .env exists (copies .env.example on first run)
#     2. starts Postgres via docker compose (warns + continues if docker is missing)
#     3. waits for the DB, runs prisma migrations + seed once it's reachable
#     4. runs `turbo run dev` in the foreground:
#          api     :3000   (nest --watch)
#          web     :5173   member PWA, /api proxied to :3000
#          trainer :5174   coach app, /api proxied to :3000
#          admin   :5175   admin app, /api proxied to :3000
#
#   Ctrl+C stops turbo and prints cleanup info; the Postgres volume persists.
#
set -euo pipefail
cd "$(dirname "$0")"

# ---- 1. environment --------------------------------------------------------
if [ ! -f .env ]; then
  echo "→ no .env found — copying .env.example (fill in OAuth/Razorpay keys)"
  cp .env.example .env
fi

# shellcheck disable=SC1091
set -a; source .env; set +a

# ---- 2. postgres via docker compose ---------------------------------------
STARTED_PG=0
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  echo "→ starting postgres (docker compose)…"
  docker compose up -d postgres
  STARTED_PG=1

  PG_USER="${POSTGRES_USER:-opengym}"
  PG_DB="${POSTGRES_DB:-opengym}"
  echo -n "→ waiting for postgres "
  for _ in $(seq 1 30); do
    if docker compose exec -T postgres pg_isready -U "$PG_USER" -d "$PG_DB" >/dev/null 2>&1; then
      echo " ready"
      break
    fi
    echo -n "."
    sleep 1
  done
  docker compose exec -T postgres pg_isready -U "$PG_USER" -d "$PG_DB" >/dev/null 2>&1 \
    || { echo "✗ postgres did not become healthy — check: docker compose logs postgres"; exit 1; }
else
  echo "⚠ docker not available — assuming a database is already running at"
  echo "  ${DATABASE_URL:-<unset DATABASE_URL>}. Migrations will fail if it isn't."
fi

# ---- 3. migrations + seed ---------------------------------------------------
# The API runs on the HOST during turbo dev, so it must reach Postgres over
# localhost, not the compose service name baked into .env's DATABASE_URL.
export DATABASE_URL="postgresql://${POSTGRES_USER:-opengym}:${POSTGRES_PASSWORD:-change-me-now}@127.0.0.1:${POSTGRES_PORT:-5432}/${POSTGRES_DB:-opengym}"

echo "→ applying migrations…"
pnpm --filter @og/api db:migrate
echo "→ seeding…"
pnpm --filter @og/api db:seed

# ---- 4. run everything -----------------------------------------------------
cleanup() {
  echo ""
  echo "→ shutting down. Dev servers stopped."
  [ "$STARTED_PG" = "1" ] && echo "  Postgres left running (data persists). Stop with: docker compose down"
}
trap cleanup EXIT INT TERM

echo "→ starting turbo dev (api :3000 · web :5173 · trainer :5174 · admin :5175)"
pnpm exec turbo run dev
