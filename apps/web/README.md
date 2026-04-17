# blockrate.app web

The hosted dashboard at [blockrate.app](https://blockrate.app). TanStack Start + Better Auth (magic link) + Drizzle/Postgres + Tailwind v4 + Base UI via shadcn.

> **This is Phase 1 of 6**. Auth works end-to-end (magic link only), the dashboard is a placeholder. Phase 2 builds the real ingest endpoint and key management; Phase 3 builds the real dashboard. See [`../../docs/plans/2026-04-08-feat-blockrate-app-web-scaffold-plan.md`](../../docs/plans/2026-04-08-feat-blockrate-app-web-scaffold-plan.md).

## Prerequisites

- **Bun ≥ 1.3** (the monorepo's package manager)
- **No local Postgres needed for dev** — we use [PGlite](https://pglite.dev), an in-process embedded postgres. Production runs real Postgres on Railway.

## First run

```bash
cd apps/web
cp .env.example .env
# Generate a real secret (the .env.example placeholder won't pass zod validation):
echo "BETTER_AUTH_SECRET=$(openssl rand -base64 32)" >> .env

# Apply migrations (creates apps/web/.local/blockrate.db with PGlite)
bun run db:migrate

# Start the dev server
bun run dev
```

Open `http://localhost:3000`. Sign in via `/login` — the magic link URL prints to your terminal in dev mode (Resend wires up in Phase 5).

## Scripts

| Script                  | What it does                                                        |
| ----------------------- | ------------------------------------------------------------------- |
| `bun run dev`           | Vite dev server on port 3000                                        |
| `bun run build`         | Production build via Vite + Nitro                                   |
| `bun run start`         | Run migrations, then serve `.output/server/index.mjs`               |
| `bun run typecheck`     | `tsc --noEmit`                                                      |
| `bun run db:generate`   | `drizzle-kit generate` — produces SQL migration files               |
| `bun run db:migrate`    | Custom runner that handles both PGlite (dev) and postgres-js (prod) |
| `bun run auth:generate` | Regenerate `src/lib/db/auth-schema.ts` from `auth.server.ts`        |

## Environment variables

**Do not set `NODE_ENV` in `.env`.** Vite reads `.env` at build time, and a hardcoded `NODE_ENV=development` causes `vite build` to bundle a dev-mode build. Mode is determined by the script you run (`bun run dev` vs `bun run start`, the latter sets `NODE_ENV=production`).

| Variable               | Required  | Default                           | Notes                                                         |
| ---------------------- | --------- | --------------------------------- | ------------------------------------------------------------- |
| `DATABASE_URL`         | no        | `pglite://./.local/blockrate.db`  | Either `pglite://...` (dev) or `postgres://...` (prod)        |
| `BETTER_AUTH_SECRET`   | **yes**   | —                                 | ≥32 chars; `openssl rand -base64 32`                          |
| `BETTER_AUTH_URL`      | no        | `http://localhost:3000`           | Set to `https://blockrate.app` in prod                        |
| `CRON_SECRET`          | prod only | —                                 | ≥32 chars; bearer for `/api/internal/retention`               |
| `RESEND_API_KEY`       | prod only | —                                 | sendMagicLink falls back to console.log when unset (dev only) |
| `EMAIL_FROM`           | no        | `blockrate <magic@blockrate.app>` | From address for transactional email                          |
| `GOOGLE_CLIENT_ID`     | optional  | —                                 | Enables Google OAuth button when set with secret              |
| `GOOGLE_CLIENT_SECRET` | optional  | —                                 |                                                               |
| `GITHUB_CLIENT_ID`     | optional  | —                                 | Enables GitHub OAuth button when set with secret              |
| `GITHUB_CLIENT_SECRET` | optional  | —                                 | Required scope: `user:email`                                  |
| `BLOCKRATE_API_KEY`    | optional  | —                                 | Dogfood key — server-only. When unset `/api/block-rate` 204s  |

## Retention sweep (Phase 4)

`/api/internal/retention` deletes events older than each plan's `retentionDays` (free = 7 days). It's bearer-authenticated via `CRON_SECRET` and **fails closed** in two ways:

- If `CRON_SECRET` is unset → **503** (deployment misconfigured)
- If the bearer is missing or wrong → **401**

Trigger from Railway by adding a separate "Cron" service in the same project, scheduled nightly at `0 3 * * *`:

```bash
curl -fsS -X POST \
  -H "Authorization: Bearer $CRON_SECRET" \
  https://blockrate.app/api/internal/retention
```

Response shape:

```json
{
  "ok": true,
  "accountsProcessed": 12,
  "eventsDeleted": 38194,
  "byPlan": {
    "free": {
      "accounts": 12,
      "eventsDeleted": 38194,
      "cutoff": "2026-04-02T03:00:00.000Z"
    }
  },
  "ranAt": "2026-04-09T03:00:00.123Z"
}
```

Manual smoke locally:

```bash
echo "CRON_SECRET=$(openssl rand -base64 32)" >> .env
bun run dev

# in another terminal, with the same secret
curl -X POST -H "Authorization: Bearer <secret>" \
  http://localhost:3001/api/internal/retention
```

The implementation groups accounts by plan name and runs **one DELETE per plan tier** with `IN (account_ids)` — N queries where N is the number of plans (currently 3), not N accounts. Scales fine to thousands of users.

## OAuth (Phase 5)

Google and GitHub providers are wired in `lib/auth.server.ts` and **conditionally enabled** based on env vars. With neither configured (dev default), only the magic-link form renders on `/login` and `/signup`. As soon as a provider's `_CLIENT_ID` and `_CLIENT_SECRET` pair appears in env, the corresponding button shows up.

### Google

1. Provision an OAuth client at <https://console.cloud.google.com/apis/credentials>
2. Authorized redirect URI: `${BETTER_AUTH_URL}/api/auth/callback/google` (e.g. `https://blockrate.app/api/auth/callback/google`)
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the deployment env

### GitHub

1. Create an OAuth app at <https://github.com/settings/developers>
2. Authorization callback URL: `${BETTER_AUTH_URL}/api/auth/callback/github`
3. **Required scope: `user:email`** — without it, signup fails with `email_not_found` for any user with a private email. The auth config requests this explicitly.
4. Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in the deployment env

## Magic-link email via Resend (Phase 5)

`lib/mailer.server.ts` chooses dev console-log vs real Resend send via this matrix:

| `NODE_ENV`     | `RESEND_API_KEY` | Behaviour                                        |
| -------------- | ---------------- | ------------------------------------------------ |
| development    | unset            | `console.log` (dev convenience)                  |
| development    | set              | real Resend send (handy for QA)                  |
| **production** | unset            | **throws** — fail-closed against deployment bugs |
| production     | set              | real Resend send                                 |

Setup:

1. Get an API key at <https://resend.com/api-keys>
2. Set `RESEND_API_KEY` in production env
3. Optionally override `EMAIL_FROM` (default: `blockrate <magic@blockrate.app>`)
4. Verify your sending domain in Resend before deploying

## Dogfooding (Phase 5)

`components/dogfood.tsx` adds `useBlockRate` from the OSS `blockrate` library to the root layout. The browser posts to the same-origin `/api/block-rate` route (`src/routes/api/block-rate.ts`), which uses `createWebHandler({ forward })` to forward upstream to `/api/ingest` on the same instance — exactly the first-party pattern we recommend to every customer. The blockrate.app marketing surface measures itself the same way customers measure theirs, putting our money where our mouth is for a "your analytics are blocked more than you think" product.

Setup post-deploy:

1. Sign up on the deployed blockrate.app with an internal admin email
2. Visit `/app/keys`, create a new key named "blockrate-app" with service "blockrate-app"
3. **Copy the plaintext** (it's shown only once)
4. Set `BLOCKRATE_API_KEY=<plaintext>` as a Railway env var on the web service — **server-side only**; do not prefix it with `VITE_`
5. Trigger a redeploy so the forward route picks up the new env var

When the var is unset (dev or pre-bootstrap), the `/api/block-rate` route returns 204 without forwarding — the client can keep posting, nothing lands upstream. Safe default for local dev.

## Railway deploy (Phase 5)

The `nixpacks.toml` shipped with the TanStack Start scaffold + the `start` script in `package.json` are sufficient. Steps:

1. **Create a Railway project** with three services:
   - `web` — this directory, deploys via Nixpacks
   - `Postgres` — managed addon
   - `Cron` — separate service for the nightly retention sweep
2. **Set web service env vars** (in Railway → Variables):
   ```
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   BETTER_AUTH_SECRET=<openssl rand -base64 32>
   BETTER_AUTH_URL=https://blockrate.app
   CRON_SECRET=<openssl rand -base64 32>
   RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GITHUB_CLIENT_ID=...
   GITHUB_CLIENT_SECRET=...
   ```
3. **Custom domain**: Railway → Settings → Domains, add `blockrate.app` and `www.blockrate.app`. TLS auto-provisioned via Let's Encrypt.
4. **Cron service** (separate Railway service, same project):
   - Schedule: `0 3 * * *`
   - Command: `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://blockrate.app/api/internal/retention`
5. **Bootstrap dogfood key**: see "Dogfooding" above. Then add `BLOCKRATE_API_KEY` to the web service vars and redeploy.
6. **Smoke tests** post-deploy:
   ```bash
   curl -fsS https://blockrate.app/api/health                     # → "ok"
   curl -fsS -o /dev/null -w "%{http_code}\n" https://blockrate.app/  # → 200
   curl -fsS -X POST https://blockrate.app/api/ingest \
     -H "Content-Type: application/json" -H "x-blockrate-key: $YOUR_KEY" \
     -d '{"timestamp":"...","url":"/","userAgent":"...","providers":[...]}'
   # → 204
   ```

### Migrations on start (not build)

The `start` script runs `bun run db:migrate` before booting the server. **Do not** put migration in the build step — Railway's build image cannot reach the Postgres addon. Migrations are no-op if already applied.

### Multi-instance scaling

The in-process `TokenBucketLimiter` doesn't survive horizontal scaling. For Phase 1 single-instance Railway this is fine. When you go multi-instance:

- Switch the limiter to a Postgres-backed or Redis-backed implementation
- Bump `postgres-js` `max` from 5 to ~8 per instance, with ≤2 instances under Railway's 20-conn cap (or move to PgBouncer)

## Project structure

```
src/
├── routes/                    file-based routes (TanStack Router)
│   ├── __root.tsx            HTML shell + inline theme script + nav + footer
│   ├── index.tsx             landing
│   ├── pricing.tsx, docs.tsx
│   ├── login.tsx, signup.tsx
│   ├── _authed.tsx           layout route — beforeLoad guard via createServerFn
│   ├── _authed/app.tsx       placeholder dashboard
│   └── api/
│       ├── auth.$.ts         Better Auth catch-all
│       └── health.ts         liveness for Railway
├── components/
│   ├── ui/                   shadcn (Base UI variant, Nova preset)
│   ├── nav.tsx
│   └── theme-toggle.tsx
├── lib/
│   ├── auth.server.ts        Better Auth instance (server-only via .server.ts)
│   ├── auth-client.ts
│   ├── env.server.ts         zod-validated env
│   ├── utils.ts              cn() helper
│   └── db/
│       ├── index.server.ts   PGlite/postgres-js switch
│       ├── schema.ts         single source of truth — events, tenants + auth tables
│       ├── auth-schema.ts    generated by @better-auth/cli
│       └── migrate.ts        runs at start, supports both dialects
└── styles/
    └── app.css               Tailwind v4 + shadcn (Base UI / Nova preset)
```

## Charter

Every UI change answers to [`docs/design.md`](../../docs/design.md). Reviewers cite section names. Charter changes get their own commits.

## Smoke flow (manual)

1. `bun run db:migrate && bun run dev`
2. Visit `/`, `/pricing`, `/docs` — each renders
3. `/login` → enter your email → check terminal for magic link URL → paste in browser → end up on `/app`
4. Hit `/app` while signed out → redirected to `/login`
5. Theme toggle (top-right): Light → Dark → System persists across reload

## Production build smoke

```bash
bun run build
NODE_ENV=production \
  DATABASE_URL=postgres://... \
  BETTER_AUTH_SECRET=... \
  BETTER_AUTH_URL=https://... \
  bun run start
```

The `start` script runs migrations before booting the server. Migrations are no-op if already applied.

## Bundle health

After `bun run build`, the landing's first-load JS should be **≤ 200 KB gzipped** with no references to `auth-client`, `better-auth`, `postgres`, `pglite`, or `drizzle`. Verify:

```bash
cd .output/public/assets
gzip -c main-*.js | wc -c    # should be ~110 KB
grep -l 'auth-client\|better-auth\|postgres\|pglite\|drizzle' *.js  # should be empty
```
