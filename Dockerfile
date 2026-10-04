# Railway deploys the hosted dashboard from the repository root.
FROM node:24.21.0-bookworm-slim AS base
RUN npm install --global @nubjs/nub@0.9.6

FROM base AS deps
WORKDIR /app
# Native SQLite can fall back to a source build when no prebuilt addon exists.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json bun.lock .npmrc ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
COPY packages/cli/package.json packages/cli/
COPY apps/web/package.json apps/web/
COPY examples/vanilla/package.json examples/vanilla/
RUN nub --no-env-file install --frozen-lockfile

FROM base AS build
WORKDIR /app
# The hoisted install stays entirely under /app, including workspace links.
COPY --from=deps /app .
COPY . .
RUN nub --no-env-file run build:packages

# Vite inlines these public values at build time, not server startup.
ARG VITE_BLOCKRATE_PUBLIC_KEY
ENV VITE_BLOCKRATE_PUBLIC_KEY=$VITE_BLOCKRATE_PUBLIC_KEY
ARG VITE_SITE_URL
ENV VITE_SITE_URL=$VITE_SITE_URL
RUN cd apps/web && NODE_ENV=production nub --no-env-file run build

FROM base AS runtime
WORKDIR /app
# Startup migrations use workspace dependencies; keep their links and assets.
COPY --from=build /app .
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
# exec delivers shutdown signals to Nitro after migrations finish successfully.
CMD ["sh", "-c", "cd apps/web && nub --no-env-file run db:migrate && exec node .output/server/index.mjs"]
