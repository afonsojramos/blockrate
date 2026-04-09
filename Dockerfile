# Monorepo Dockerfile for deploying the blockrate.app web app.
# Railway auto-detects this at the repo root.
#
# Uses Bun throughout because:
#   1. The lockfile is bun.lock (npm/yarn can't read it)
#   2. The migration runner (src/lib/db/migrate.ts) is TypeScript — Bun runs it natively
#   3. The Nitro output (.output/server/index.mjs) runs fine under both Node and Bun
#   4. oven/bun:1.3-alpine is ~150MB, comparable to node:22-alpine

FROM oven/bun:1.3-alpine AS base

# ─── Dependencies ────────────────────────────────────────────────────────

FROM base AS deps
WORKDIR /app

# Copy workspace root + all package.json files for dep resolution
COPY package.json bun.lock ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
COPY apps/web/package.json apps/web/

RUN bun install

# ─── Build ───────────────────────────────────────────────────────────────

FROM base AS build
WORKDIR /app

COPY --from=deps /app/node_modules node_modules
COPY --from=deps /app/packages/core/node_modules packages/core/node_modules
COPY --from=deps /app/packages/server/node_modules packages/server/node_modules
COPY --from=deps /app/apps/web/node_modules apps/web/node_modules
COPY . .

# Build packages/core first (apps/web imports from it at build time)
RUN cd packages/core && bun run build

# Build apps/web — production Vite + Nitro bundle
RUN cd apps/web && NODE_ENV=production bun run build

# ─── Runtime ─────────────────────────────────────────────────────────────

FROM base AS runtime
WORKDIR /app

# Copy the built server output
COPY --from=build /app/apps/web/.output apps/web/.output

# Copy the migration runner + drizzle SQL + its deps
COPY --from=build /app/apps/web/drizzle apps/web/drizzle
COPY --from=build /app/apps/web/src apps/web/src
COPY --from=build /app/apps/web/package.json apps/web/package.json
COPY --from=build /app/apps/web/node_modules apps/web/node_modules

# packages/server is needed at runtime for:
#   - block-rate-server/ua (truncateUserAgent) used by /api/ingest
#   - block-rate-server/rate-limit (TokenBucketLimiter)
#   - block-rate-server/validate (blockRatePayloadSchema)
COPY --from=build /app/packages/server/src packages/server/src
COPY --from=build /app/packages/server/package.json packages/server/package.json
COPY --from=build /app/packages/core/src packages/core/src
COPY --from=build /app/packages/core/dist packages/core/dist
COPY --from=build /app/packages/core/package.json packages/core/package.json
COPY --from=build /app/package.json package.json

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

# Migrations run before server boot. On Railway, DATABASE_URL is the
# managed Postgres addon's URL — the migration runner detects postgres://
# vs pglite:// automatically.
CMD ["sh", "-c", "cd apps/web && bun run db:migrate && bun .output/server/index.mjs"]
