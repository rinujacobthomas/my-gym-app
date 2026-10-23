# openGym — single Dockerfile, three targets.
#
#   docker build --target web .   → nginx serving the member PWA (/), trainer
#                                   bundle (/coach/) and admin bundle (/admin/),
#                                   proxying /api to the api container.
#   docker build --target api .   → NestJS API (pruned node_modules via
#                                   `pnpm deploy`), entry dist/apps/api/src/main.js.
#
# Packages (@og/ui, @og/core, @og/api-client) are consumed as SOURCE, so the
# build stage needs the full workspace — turbo handles dependency ordering.

# ---------------------------------------------------------------------------
# base: node 22 + pnpm 10.15.0 via corepack (version pinned to packageManager)
# ---------------------------------------------------------------------------
FROM --platform=$BUILDPLATFORM node:22-alpine AS base
WORKDIR /app
RUN corepack enable \
 && corepack prepare pnpm@10.15.0 --activate

# ---------------------------------------------------------------------------
# deps: install workspace dependencies first (cacheable layer).
# Only package manifests are copied so source changes don't bust this layer.
# pnpm 10 blocks arbitrary postinstalls; root package.json already whitelists
# esbuild / sharp / @tailwindcss/oxide via onlyBuiltDependencies, so running
# WITH scripts is safe and required for those native tools to work.
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/trainer/package.json apps/trainer/
COPY apps/admin/package.json apps/admin/
COPY apps/api/package.json apps/api/
COPY packages/ui/package.json packages/ui/
COPY packages/core/package.json packages/core/
COPY packages/api-client/package.json packages/api-client/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# build: full workspace → turbo builds all four apps + their package deps,
# then prune @og/api's runtime tree into /out/api with `pnpm deploy`.
# `--legacy` keeps pnpm-10 behaviour (plain copy + pruned node_modules)
# without requiring inject-workspace-packages in pnpm-workspace.yaml.
# The deployed layout preserves apps/api relative paths, so:
#   dist/apps/api/src/main.js        (nest output)
#   generated/prisma                 (prisma client, imported relatively)
#   prisma/{schema.prisma,migrations} (needed by migrate deploy)
#   scripts/migrate.js               (migration runner, see compose command)
# prisma CLI stays available because deploy runs WITHOUT --prod on purpose.
# ---------------------------------------------------------------------------
FROM base AS build
COPY . .
# Restore installed dependencies over the copied sources (pnpm materializes a
# node_modules dir per workspace package; relative symlinks stay valid because
# destinations mirror the original layout).
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/apps/trainer/node_modules ./apps/trainer/node_modules
COPY --from=deps /app/apps/admin/node_modules ./apps/admin/node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages/ui/node_modules ./packages/ui/node_modules
COPY --from=deps /app/packages/core/node_modules ./packages/core/node_modules
COPY --from=deps /app/packages/api-client/node_modules ./packages/api-client/node_modules
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm turbo run build \
      --filter=@og/web --filter=@og/trainer --filter=@og/admin --filter=@og/api
# The api package's "files" field ships dist/, generated/, prisma/ and scripts/.
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm --filter=@og/api deploy --legacy /out/api

# ---------------------------------------------------------------------------
# web runtime: nginx with the three static bundles at fixed prefixes.
# Exercise media (img/gif) is NOT baked in — compose mounts ./media read-only
# at /usr/share/nginx/media (populated by the one-shot `media` service).
# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine AS web
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist     /usr/share/nginx/html/app
COPY --from=build /app/apps/trainer/dist /usr/share/nginx/html/coach
COPY --from=build /app/apps/admin/dist   /usr/share/nginx/html/admin
RUN mkdir -p /usr/share/nginx/media/img /usr/share/nginx/media/gif \
 && chown -R nginx:nginx /usr/share/nginx/media
EXPOSE 80

# ---------------------------------------------------------------------------
# api runtime: minimal node image containing only the deployed @og/api tree.
# CMD starts the server; orchestrators that want migrations first override
# with: sh -c "node scripts/migrate.js && node dist/apps/api/src/main.js"
# Stateless by design — no volumes.
# ---------------------------------------------------------------------------
FROM node:22-alpine AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out/api ./
EXPOSE 3000
CMD ["node", "dist/apps/api/src/main.js"]
