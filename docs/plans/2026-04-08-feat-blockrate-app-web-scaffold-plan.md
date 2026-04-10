---
title: "Scaffold blockrate.app web app (TanStack Start + Base UI + shadcn + design charter)"
type: feat
status: active
date: 2026-04-08
origin: ~/.claude/plans/fizzy-gliding-pike.md
revision: 3 (post-deepen)
---

# Scaffold blockrate.app web app

> Phase 1 of the blockrate.app hosted-service buildout. Establishes the `apps/web` workspace and the smallest auth-gated scaffold that proves the stack works end-to-end. Phase 2 builds the real ingest endpoint, key management UI, and quota enforcement; Phase 3 builds the real dashboard.

## Overview

Scaffold a new TanStack Start app at `apps/web` inside the existing Bun monorepo. Wire **Tailwind v4** + **Base UI** primitives via **shadcn**'s `--base base` flag. Add **Better Auth** with **magic-link only** (OAuth deferred to Phase 5). Add **Drizzle + Postgres** with `apps/web` owning **all** hosted-deployment tables (no schema split with `packages/server`). Author a **`docs/design.md` v0 design charter** (principles + tokens, ~150 lines, grows with real screens). Stop at: "magic link works end-to-end in dev, `/app` route is gated by `_authed` layout, placeholder dashboard renders, theme toggle persists." Tag `v0.6.0`.

## Origin & review history

This plan operationalises **Phase 1** of `~/.claude/plans/fizzy-gliding-pike.md`.

**Revision 2** integrated feedback from three independent reviewers (kieran-typescript, architecture-strategist, code-simplicity). The convergent finding: **Phase 1 was wearing Phase 2/3's clothes**. Cut speculative scope, fixed type-safety errors, resolved the schema-ownership ambiguity.

**Revision 3** integrates a deepen-plan pass with six more agents/skills (tailwind-v4-shadcn, better-auth-best-practices, make-interfaces-feel-better, performance-oracle, security-sentinel, julik-frontend-races-reviewer). Convergent findings:

| Issue                                                                                                          | Flagged by                               |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Magic link defaults need explicit hardening (`expiresIn`, `disableSignUp`, `storeToken: "hashed"`, rate limit) | better-auth, security-sentinel           |
| `trustedOrigins` missing → cross-origin POSTs blocked or accepted depending on version                         | better-auth, security-sentinel           |
| Unguarded `console.log` of magic-link URL → prod log access = account takeover                                 | security-sentinel, better-auth           |
| `postgres-js` SSL + pool config missing                                                                        | performance-oracle, security-sentinel    |
| Theme flash triple-source-of-truth (SSR class, inline script, React state)                                     | julik-races, make-interfaces-feel-better |
| Session cookie cache absent → `_authed` `beforeLoad` hits DB on every navigation                               | performance-oracle, better-auth          |
| `--accent` token missing from charter — shadcn components hard-reference `bg-accent`                           | tailwind-v4-shadcn                       |
| 200 KB landing budget at risk; defer TanStack Query install to Phase 3                                         | performance-oracle                       |
| Open redirect on Better Auth's `callbackURL` query parameter                                                   | security-sentinel                        |
| Magic link form double-submit + setState on unmounted component                                                | julik-races                              |

**What changed in revision 3:**

- `auth.ts` config block now includes `trustedOrigins`, `rateLimit`, `cookieCache`, hardened `magicLink({})` options, fail-closed `sendMagicLink` callback
- `env.server.ts` zod schema enforces `BETTER_AUTH_SECRET: z.string().min(32)`
- `db/index.ts` postgres client gets explicit `ssl`, `prepare: false`, `max` config tuned for Railway
- Phase 1.2 ships the **full canonical `app.css`** (not just a description)
- Phase 1.6 ships the **full inline `<head>` theme script** + the React `useLayoutEffect` theme hook + `suppressHydrationWarning` strategy
- Phase 1.5 magic-link form uses an explicit state machine (`idle | submitting | sent | error`) with `AbortController` for unmount safety
- Design charter: `--accent` tokens added, polish principles list added, font-display + preload spec added, inline head script documented
- Phase 1.7: `apps/web/.env.example` is now a required commit; bundle-import lint check is an acceptance criterion
- TanStack Query install **deferred to Phase 3** (was Phase 1) — saves ~13 KB on the landing
- Acceptance criteria: explicit perf budgets (FCP < 1.2 s, LCP < 1.8 s, JS ≤ 200 KB gzip, `_authed` nav < 100 ms p50)
- New `_authed` `errorComponent` redirects to `/login` to fail closed on DB outage

**What changed in revision 2:**

| Change                                                                                                           | Driven by                                                                           |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Schema ownership: `apps/web` owns ALL hosted Postgres tables (no split with `packages/server`)                   | architecture-strategist (blocker), kieran-typescript (workspace TS resolution risk) |
| Cut speculative tables: `app_accounts`, `api_keys`, `usage_counters` deferred to Phase 2                         | code-simplicity (YAGNI), architecture-strategist ("decisions made too early")       |
| Cut OAuth providers (Google, GitHub) and their env vars from Phase 1; magic-link only                            | code-simplicity (Phase 1 stops at "auth works" — pick the cheapest auth)            |
| Cut bulk shadcn import (50 → ~10 components actually used in Phase 1)                                            | code-simplicity                                                                     |
| design.md scope: from "600+ lines, 10 sections" to "v0 charter, ~150 lines, grows with real screens"             | code-simplicity (premature spec)                                                    |
| Inline marketing/auth components instead of pre-extracting three files each                                      | code-simplicity (YAGNI)                                                             |
| One placeholder dashboard route instead of three                                                                 | code-simplicity (one is enough to prove the guard)                                  |
| Wrap `getHeaders()` in `new Headers(...)` before `auth.api.getSession`                                           | kieran-typescript (critical type error)                                             |
| Use TanStack Start's generated route types for the catch-all (not a hand-written `createFileRoute` snippet)      | kieran-typescript (critical)                                                        |
| Use `serverOnly()` from `@tanstack/react-start` instead of the npm `server-only` package                         | kieran-typescript (Next.js convention, not idiomatic in Start)                      |
| Generate Better Auth schema FIRST, then layer app tables on top — no placeholder `users` table                   | kieran-typescript (avoids migration churn)                                          |
| Cut CI typecheck job + actions/cache step from Phase 1 (deferred to Phase 5/6 polish)                            | code-simplicity                                                                     |
| Cut `env.server.ts` validation for OAuth/Resend secrets that Phase 1 doesn't use                                 | code-simplicity (env validation should match what's actually consumed)              |
| Resolve framework-version uncertainties in 10 minutes at the top of Phase 1.1 (not as a separate Phase 1.0 task) | code-simplicity (ceremony reduction)                                                |

**What was kept against simplicity pressure** (and why):

- **Tailwind v4 four-step pattern in `app.css`** — non-trivial to retrofit, easier to do right once
- **Reusing `truncateUserAgent`, `TokenBucketLimiter`, `blockRatePayloadSchema` from `packages/server`** — these are pure functions/types, no schema coupling, zero downside to importing
- **`_authed.tsx` as a single auth seam** — architecture-strategist explicitly endorsed this as right-shaped for Phase 1
- **Migrations on `start`, not `build`** — Railway-specific gotcha that's free to bake in now and painful to fix later
- **Side-quest `createAPIFileRoute` doc fix in `packages/core/src/tanstack-start/index.ts`** — small, adjacent, contributor is already in TanStack Start headspace
- **Pinning exact versions** for the TanStack Start RC stack — caret ranges on RC software are dangerous

## Locked-in decisions

| Decision                                                                                                                                                                                                                                                                                               | Source                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Stack: TanStack Start + Better Auth (magic link only) + Drizzle/Postgres + Tailwind v4 + Base UI + shadcn                                                                                                                                                                                              | parent plan + this conversation                               |
| **Schema ownership: `apps/web` owns all hosted Postgres tables.** `packages/server` keeps SQLite as its self-host default. Web app declares its own `events` and `tenants` (or whatever they're renamed to) Drizzle definitions — ~30 lines duplicated, but each deployment has unambiguous ownership. | architecture-strategist review (revision 2)                   |
| Auth providers Phase 1: **magic link only** (console-logged in dev). Google + GitHub move to Phase 5 alongside Resend integration.                                                                                                                                                                     | code-simplicity review (revision 2)                           |
| `--base base` flag for shadcn — verified live by framework-docs researcher 2026-04-08                                                                                                                                                                                                                  | https://ui.shadcn.com/docs/cli                                |
| Postgres driver: `postgres-js`                                                                                                                                                                                                                                                                         | https://orm.drizzle.team/docs/get-started/postgresql-new      |
| Migrations: committed via `drizzle-kit generate`, applied via `drizzle-kit migrate` in the **start** script (NOT build)                                                                                                                                                                                | https://orm.drizzle.team/docs/migrations + Railway constraint |
| Better Auth schema generated by `bunx @better-auth/cli@latest generate`                                                                                                                                                                                                                                | https://www.better-auth.com/docs/adapters/drizzle             |
| Better Auth Drizzle adapter `experimental: { joins: true }` enabled (2–3× faster session endpoints)                                                                                                                                                                                                    | https://www.better-auth.com/docs/adapters/drizzle             |
| `serverOnly()` from `@tanstack/react-start` for server-only module guards (NOT the npm `server-only` package — that's a Next.js convention)                                                                                                                                                            | kieran-typescript review                                      |
| Better Auth UI: hand-built with shadcn `Form`+`Input`+`Button`. **Do NOT** install `@daveyplate/better-auth-ui` for v1                                                                                                                                                                                 | researcher recommendation                                     |
| Design language: single repo-level `docs/design.md`, **v0 charter** (principles + tokens + voice in ~150 lines), grows with real screens                                                                                                                                                               | code-simplicity review                                        |
| Default theme: dark                                                                                                                                                                                                                                                                                    | parent plan / design language                                 |
| Reuse from `packages/server`: `truncateUserAgent`, `TokenBucketLimiter`, `blockRatePayloadSchema` (and their types). **NOT** the schema files.                                                                                                                                                         | revision 2                                                    |
| Better Auth `session.cookieCache` enabled — `_authed.tsx beforeLoad` becomes a signed-cookie verify, not a DB hit                                                                                                                                                                                      | revision 3 (performance-oracle, better-auth)                  |
| `postgres-js` client config: `ssl: "require"` in prod, `prepare: false`, `max: 5` (Phase 1) / `max: 8` (Phase 5 multi-instance)                                                                                                                                                                        | revision 3 (performance-oracle, security-sentinel)            |
| Magic link config: `expiresIn: 600`, `disableSignUp: false`, `storeToken: "hashed"`, hardcoded `callbackURL: "/app"`, fail-closed `sendMagicLink` in prod                                                                                                                                              | revision 3 (security-sentinel, better-auth)                   |
| `trustedOrigins: [env.BETTER_AUTH_URL]` and built-in `rateLimit` enabled on `/api/auth/*`                                                                                                                                                                                                              | revision 3 (security-sentinel, better-auth)                   |
| TanStack Query install **deferred to Phase 3** (was Phase 1) — saves ~13 KB on the landing                                                                                                                                                                                                             | revision 3 (performance-oracle)                               |
| `lucide-react` per-icon subpath imports mandatory (`import { Sun } from "lucide-react/icons/sun"`)                                                                                                                                                                                                     | revision 3 (performance-oracle)                               |
| Inline `<head>` theme script + `useLayoutEffect` hook + `suppressHydrationWarning` on toggle                                                                                                                                                                                                           | revision 3 (julik-races, make-interfaces-feel-better)         |
| Magic-link form uses explicit state machine (`idle`/`submitting`/`sent`/`error`) + `AbortController`                                                                                                                                                                                                   | revision 3 (julik-races)                                      |
| `_authed.tsx` ships an explicit `errorComponent: () => <Navigate to="/login" />` for fail-closed DB outage                                                                                                                                                                                             | revision 3 (security-sentinel)                                |
| `apps/web/.env.example` ships in Phase 1 with placeholder values                                                                                                                                                                                                                                       | revision 3 (security-sentinel)                                |
| `/api/health` returns static `200 OK`, never touches the DB                                                                                                                                                                                                                                            | revision 3 (security-sentinel)                                |

## Open uncertainties (resolve at top of Phase 1.1, ~10 minutes)

These were flagged by the framework-docs researcher as "couldn't verify against npm in 403 environment." Just run the commands and pick.

```bash
bun pm view @tanstack/react-start version
bun pm view @base-ui/react version
bun pm view @base-ui-components/react version  # one of these resolves; use it
bunx shadcn@latest init --help                  # confirm --base base flag exists
```

If `--base base` is missing in the deployed CLI version: fall back to `bunx shadcn@latest init --template start` (Radix default), then in Phase 1.2 manually port the ~10 components to Base UI primitives. **Do not** silently accept Radix as a permanent dependency. The design.md v0 charter is unaffected by this fallback.

## Out of scope for Phase 1

- The real `/api/ingest` endpoint, key issuance, key management UI, quota enforcement (**Phase 2**)
- `app_accounts`, `api_keys`, `usage_counters` tables (**Phase 2** — add when their consumers land)
- Google + GitHub OAuth wiring + Resend transactional email (**Phase 5**)
- Real `/app/overview` dashboard with stats queries (**Phase 3**)
- `/api/internal/retention` + Railway Cron (**Phase 4**)
- Production deploy to Railway, custom domain, dogfooding (**Phase 5**)
- `packages/server/README.md` deployment recipes (**Phase 6**)
- Stripe / billing
- MDX docs at `/docs/*` (Phase 6)
- CI typecheck job + actions/cache step (**Phase 5/6** polish)
- Multi-instance rate-limiter story (Postgres-backed or Redis) — flagged by architecture-strategist for Phase 5 deploy

## Stack inventory (versions to pin)

| Package                                              | Why                                                                                                        | Verify                                                 |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `@tanstack/react-start`                              | full-stack framework                                                                                       | `bun pm view @tanstack/react-start version`, pin exact |
| `@tanstack/react-router`                             | routing primitives                                                                                         | match Start peer, pin exact                            |
| ~~`@tanstack/react-query`~~ **DEFERRED TO PHASE 3**  | performance-oracle: ~13 KB gzipped that the Phase 1 landing never uses; install when actual consumers land |
| `react`, `react-dom`                                 | already at 19.2.x in workspace root                                                                        | reuse                                                  |
| `tailwindcss`, `@tailwindcss/vite`                   | v4                                                                                                         | `^4.0.0`                                               |
| `tailwind-merge`, `class-variance-authority`, `clsx` | shadcn deps                                                                                                | latest                                                 |
| `@base-ui/react` **or** `@base-ui-components/react`  | primitives layer                                                                                           | resolve via uncertainty check                          |
| `lucide-react`                                       | icons                                                                                                      | latest                                                 |
| `better-auth`                                        | auth core                                                                                                  | latest                                                 |
| `drizzle-orm`, `drizzle-kit`, `postgres`, `zod`      | already in workspace via `packages/server`                                                                 | reuse                                                  |
| `block-rate`                                         | workspace link (used in Phase 5 for dogfooding, but install now)                                           | `workspace:*`                                          |
| `block-rate-server`                                  | workspace link — for `truncateUserAgent`, `TokenBucketLimiter`, `blockRatePayloadSchema` only              | `workspace:*`                                          |

**Dev:**

- `@better-auth/cli` — generate Better Auth Drizzle schema
- `vite` — ships via Start scaffold
- `typescript`, `@types/react`, `@types/react-dom` — already at workspace root

**Workspace TS resolution preflight (Kieran's blocker):**

Before running Phase 1.3, verify `packages/server/package.json` has either an `exports` map or `main`/`types` fields pointing at `./src/index.ts`. The package currently ships TS source with no build step. If the fields are missing, the web app's `tsc` will fail to resolve `import { truncateUserAgent } from "block-rate-server"`. Fix in `packages/server/package.json` before Phase 1.3.

## Project structure (target)

```
apps/web/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── components.json                  (shadcn — base: "base", template: "start")
├── drizzle.config.ts                (postgres dialect, OWNS all hosted PG schema)
├── drizzle/                         (generated migrations — committed)
├── public/favicon.svg
├── src/
│   ├── routes/
│   │   ├── __root.tsx
│   │   ├── index.tsx                (landing — single file, no premature splits)
│   │   ├── pricing.tsx              (placeholder)
│   │   ├── docs.tsx                 (placeholder)
│   │   ├── login.tsx                (magic link form, OAuth buttons NOT shipped Phase 1)
│   │   ├── signup.tsx               (imports the form from login.tsx)
│   │   ├── _authed.tsx              (layout — beforeLoad guard)
│   │   ├── _authed/app.index.tsx    (placeholder)
│   │   └── api/
│   │       ├── auth.$.ts            (Better Auth catch-all)
│   │       └── health.ts            (Railway health check)
│   ├── components/
│   │   ├── ui/                      (~10 shadcn components only)
│   │   ├── nav.tsx
│   │   └── theme-toggle.tsx
│   ├── lib/
│   │   ├── auth.ts                  (Better Auth instance — server-only via serverOnly())
│   │   ├── auth-client.ts
│   │   ├── env.server.ts            (zod validation for ONLY what Phase 1 consumes)
│   │   ├── cn.ts                    (shadcn helper)
│   │   └── db/
│   │       ├── index.ts             (drizzle client)
│   │       ├── schema.ts            (single source of truth for ALL hosted PG tables)
│   │       └── auth-schema.ts       (generated by @better-auth/cli — re-exported from schema.ts)
│   ├── styles/app.css               (Tailwind v4 + @theme inline)
│   └── vite-env.d.ts                (augment ImportMetaEnv for typed env vars)
└── README.md
```

**Notable shape decisions:**

- `src/lib/db/schema.ts` is the **single Drizzle schema file for the hosted deployment**. It defines:
  1. Re-exports of `auth-schema.ts` (Better Auth's `users`, `sessions`, `accounts`, `verification`)
  2. The `tenants` and `events` tables (declared HERE, not imported from `packages/server` — fully owned by the web app)
- `src/components/ui/` is the shadcn dump zone, but Phase 1 imports only ~10 components: `button`, `input`, `label`, `form`, `card`, `dialog`, `dropdown-menu`, `separator`, `sonner`, `avatar`. Add more in Phase 2/3 as actual consumers appear.
- `src/server/` is **not** created in Phase 1 — Phase 2's ingest logic will create it.

## Implementation phases

### Phase 1.0 — Workspace + design charter

1. Add `"apps/*"` to root `package.json` workspaces glob (currently `["packages/*", "examples/*"]`).
2. Create `apps/` directory.
3. Verify `packages/server/package.json` has `exports`/`main`/`types` for workspace TS resolution. Fix if missing — this is Kieran's preflight blocker.
4. Create **`docs/design.md` v0 charter** — full content in [Design Charter](#design-charter-content-for-docsdesignmd) below. Target ~150 lines: principles, color tokens (light + dark), type scale, motion, voice rules. **No** per-component spec, **no** copywriting do's/don'ts catalogue, **no** detailed accessibility runbook. Those grow when real screens demand them.
5. Update root `README.md` with a one-line "Hosted at blockrate.app (in development) — see docs/plans/..." callout.

**Acceptance:** `bun install` succeeds with new workspace glob. `docs/design.md` exists and is referenced from root README.

### Phase 1.1 — TanStack Start scaffold + uncertainty resolution

1. **First 10 minutes**: run the four uncertainty-resolution commands. Pick exact versions and Base UI package name. Note them in `apps/web/README.md`.
2. From `apps/`: `bun create @tanstack/start` (project name `web`, opt out of Tailwind/UI prompts).
3. `name: "web"`, `private: true` in the generated `package.json`. Pin all `@tanstack/*` deps to **exact versions** (no carets).
4. `tsconfig.json` extends `../../tsconfig.base.json`.
5. Strip the demo routes, replace `__root.tsx` and `index.tsx` with one-line skeletons.
6. Add `"workspace:*"` deps for `block-rate` and `block-rate-server`.
7. `bun install` at root → `cd apps/web && bun run dev` → confirm skeleton renders.
8. Add `apps/web` to `.github/workflows/ci.yml`: one new `web-build` job (`cd apps/web && bun run build`). **No** typecheck job, **no** cache step — those are Phase 5/6 polish per Simplicity review.
9. **Side quest**: fix the outdated `createAPIFileRoute` example in `packages/core/src/tanstack-start/index.ts`. Replace with the current `createFileRoute('/api/block-rate')({ server: { handlers: { POST } } })` shape (or `createServerFileRoute` if that's the current API — verify when patching).

**Acceptance:** Skeleton boots in dev and prod, CI passes, adapter doc is current.

### Phase 1.2 — Tailwind v4 + shadcn (Base UI variant) + targeted component install

1. `bun add -D tailwindcss @tailwindcss/vite tw-animate-css` (versions from uncertainty resolution).
2. Add `@tailwindcss/vite` plugin to `vite.config.ts`.
3. Create `src/styles/app.css` with this exact content (verified by tailwind-v4-shadcn skill against its 8 documented errors — all dodged):

```css
/*
  blockrate.app — Tailwind v4 + shadcn/ui + Base UI
  Four-step pattern (per tailwind-v4-shadcn skill):
    1. CSS variables at :root / .dark   (NOT inside @layer base)
    2. @theme inline mapping → generates bg-*, text-*, border-* utilities
    3. Base styles at root level         (skill error #8: avoid @layer base)
    4. @custom-variant dark              → enables `dark:` variant via .dark class
  Tokens are the single source of truth in docs/design.md — do not edit here
  without updating the charter.
*/

@import "tailwindcss";
@import "tw-animate-css";

@custom-variant dark (&:is(.dark *));

/* ---------- Step 1: Light tokens (oklch) ---------- */
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.15 0.02 240);
  --card: var(--background);
  --card-foreground: var(--foreground);
  --popover: oklch(0.99 0.005 240);
  --popover-foreground: var(--foreground);
  --primary: oklch(0.45 0.18 250);
  --primary-foreground: oklch(0.985 0.005 240);
  --secondary: oklch(0.96 0.01 240);
  --secondary-foreground: oklch(0.25 0.02 240);
  --muted: oklch(0.965 0.01 240);
  --muted-foreground: oklch(0.5 0.02 240);
  --accent: var(--secondary);
  --accent-foreground: var(--secondary-foreground);
  --border: oklch(0.92 0.01 240);
  --input: var(--border);
  --ring: var(--primary);
  --destructive: oklch(0.58 0.22 25);
  --destructive-foreground: oklch(0.985 0.005 240);

  --rate-low: oklch(0.7 0.15 145);
  --rate-mid: oklch(0.72 0.18 75);
  --rate-high: oklch(0.62 0.22 25);

  --radius: 0.5rem;
}

/* ---------- Step 1: Dark tokens (the default surface) ---------- */
.dark {
  --background: oklch(0.1 0.01 240);
  --foreground: oklch(0.97 0.005 240);
  --card: oklch(0.13 0.01 240);
  --card-foreground: var(--foreground);
  --popover: oklch(0.15 0.012 240);
  --popover-foreground: var(--foreground);
  --primary: oklch(0.7 0.2 250);
  --primary-foreground: oklch(0.1 0.01 240);
  --secondary: oklch(0.18 0.01 240);
  --secondary-foreground: oklch(0.97 0.005 240);
  --muted: oklch(0.18 0.01 240);
  --muted-foreground: oklch(0.62 0.015 240);
  --accent: var(--secondary);
  --accent-foreground: var(--secondary-foreground);
  --border: oklch(0.22 0.01 240);
  --input: var(--border);
  --ring: var(--primary);
  --destructive: oklch(0.66 0.23 25);
  --destructive-foreground: oklch(0.97 0.005 240);

  --rate-low: oklch(0.7 0.18 145);
  --rate-mid: oklch(0.77 0.2 75);
  --rate-high: oklch(0.7 0.24 25);
}

/* ---------- Step 2: Map tokens → Tailwind utilities ---------- */
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-rate-low: var(--rate-low);
  --color-rate-mid: var(--rate-mid);
  --color-rate-high: var(--rate-high);
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
}

/* ---------- Step 3: Base styles at root (NOT @layer base) ---------- */
* {
  border-color: var(--border);
}
:root {
  color-scheme: light dark;
}

html {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

body {
  margin: 0;
  background-color: var(--background);
  color: var(--foreground);
  font-family:
    ui-sans-serif,
    system-ui,
    -apple-system,
    "Segoe UI",
    Roboto,
    sans-serif;
}

h1,
h2,
h3 {
  text-wrap: balance;
}
p {
  text-wrap: pretty;
}

.tabular {
  font-variant-numeric: tabular-nums slashed-zero;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

4. Import `app.css` from `__root.tsx`.
5. `bunx shadcn@latest init --template start --base base` (or fall back path if uncertainty resolution showed `--base base` is missing).
6. **Targeted install** — exactly the components Phase 1 actually renders:
   ```bash
   bunx shadcn@latest add button input label form card dialog dropdown-menu separator sonner avatar
   ```
   Anything else gets added in Phase 2/3 as a consumer appears. Per Simplicity review: bulk import is gold-plating.
7. Run `bun run build`, fix any Base UI variant type drift.

**Acceptance:** `bun run build` passes. The 10 components render in `__root.tsx` smoke test (one-screen sanity check, not a full playground route).

### Phase 1.3 — Drizzle Postgres setup + Better Auth schema generation

> **Order matters**: per Kieran's review, generate Better Auth schema FIRST, then layer the app's own tables on top. Avoids the placeholder-users-table-then-overwrite migration churn from revision 1.

1. `bun add postgres` (already have `drizzle-orm`, `drizzle-kit`, `zod` via workspace).
2. Create `src/lib/env.server.ts` — zod schema for **only** what Phase 1 consumes, with hard constraints (security-sentinel: don't ship `min(1)` on a secret):

   ```ts
   import { serverOnly } from "@tanstack/react-start";
   import { z } from "zod";

   const schema = z.object({
     NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
     DATABASE_URL: z.string().url(),
     BETTER_AUTH_SECRET: z.string().min(32, "≥32 chars; generate via openssl rand -base64 32"),
     BETTER_AUTH_URL: z.string().url(),
   });

   export const env = serverOnly(() => {
     const parsed = schema.safeParse(process.env);
     if (!parsed.success) {
       console.error("[env] invalid environment:", parsed.error.flatten().fieldErrors);
       throw new Error("env validation failed");
     }
     return parsed.data;
   })();
   ```

   No Resend, no Google, no GitHub — those land in Phase 5.

3. Create `src/lib/db/index.ts` with **explicit** postgres-js options (security-sentinel + performance-oracle):

   ```ts
   import { serverOnly } from "@tanstack/react-start";
   import { drizzle } from "drizzle-orm/postgres-js";
   import postgres from "postgres";
   import { env } from "../env.server";
   import * as schema from "./schema";

   const client = serverOnly(() =>
     postgres(env.DATABASE_URL, {
       ssl: env.NODE_ENV === "production" ? "require" : false,
       prepare: false, // PgBouncer/Railway-pooler safe
       max: 5, // Phase 1 single instance; Phase 5 multi-instance: 8 per instance
       idle_timeout: 20,
       connect_timeout: 10,
     }),
   )();

   export const db = drizzle(client, { schema });
   ```

   Phase 5 deploy notes (do NOT do these in Phase 1, but document them so Phase 5 doesn't forget):
   - Multi-instance: `max: 8` per instance, ≤2 instances under Railway's 20-conn cap
   - 3+ instances: switch to PgBouncer or Railway's pooled URL

3a. **Create `apps/web/.env.example`** with placeholder values + the exact secret-generation command:

```
NODE_ENV=development
DATABASE_URL=postgres://postgres:postgres@localhost:5432/blockrate_dev
# generate with: openssl rand -base64 32
BETTER_AUTH_SECRET=replace-me-with-≥32-char-secret
BETTER_AUTH_URL=http://localhost:3000
```

This ships in the Phase 1.7 commit list. Prevents the first contributor from pasting a weak secret. 4. Create a minimal `src/lib/db/schema.ts` containing just the `tenants` and `events` table definitions (port the shape from `packages/server/src/schema.postgres.ts` — duplicated, by explicit decision). Add the indexes. 5. Create `drizzle.config.ts` pointing at `src/lib/db/schema.ts`, dialect `postgresql`, out `./drizzle`. 6. **Now** run `bunx @better-auth/cli@latest generate --output src/lib/db/auth-schema.ts`. This needs the Better Auth instance to exist — so first create a stub `src/lib/auth.ts` with **just** `betterAuth({ database: drizzleAdapter(db, { provider: "pg" }) })` so the CLI can introspect. 7. Re-export everything from `auth-schema.ts` in `schema.ts` so a single Drizzle config sees all tables. 8. Add `package.json` scripts:

```json
"db:generate": "drizzle-kit generate",
"db:migrate":  "drizzle-kit migrate",
"start":       "bun run db:migrate && node .output/server/index.mjs"
```

9. Run `bun run db:generate` → one combined migration with `users`, `sessions`, `accounts` (Better Auth's), `verification`, `tenants`, `events`.
10. Apply against a local Postgres: `DATABASE_URL=postgres://localhost/blockrate_dev bun run db:migrate`.

**Acceptance:** One migration file. Local PG accepts it. The DB has all tables, no name collisions.

### Phase 1.4 — Better Auth wiring (magic link only)

1. Flesh out `src/lib/auth.ts` (replacing the stub from 1.3 step 6) with all hardening from the deepen pass baked in:

   ```ts
   import { serverOnly } from "@tanstack/react-start";
   import { betterAuth } from "better-auth";
   import { drizzleAdapter } from "better-auth/adapters/drizzle";
   import { magicLink } from "better-auth/plugins";
   import { tanstackStartCookies } from "better-auth/tanstack-start";
   import { db } from "./db";
   import { env } from "./env.server";

   export const auth = serverOnly(() =>
     betterAuth({
       appName: "blockrate",
       baseURL: env.BETTER_AUTH_URL,
       secret: env.BETTER_AUTH_SECRET,
       database: drizzleAdapter(db, { provider: "pg" }),
       experimental: { joins: true }, // 2–3× faster session reads

       // security-sentinel + better-auth: explicit, not implicit
       trustedOrigins: [env.BETTER_AUTH_URL],

       // performance-oracle: cookieCache turns _authed beforeLoad from a DB hit
       // into a signed-cookie verify. The single biggest perf win in Phase 1.
       session: {
         expiresIn: 60 * 60 * 24 * 7, // 7 days
         updateAge: 60 * 60 * 24, // refresh once per day
         cookieCache: { enabled: true, maxAge: 60 * 5 },
       },

       advanced: {
         useSecureCookies: env.NODE_ENV === "production",
         defaultCookieAttributes: { sameSite: "lax", httpOnly: true },
       },

       // built-in rate limit on /api/auth/* — covers magic-link send + verify
       rateLimit: {
         enabled: true,
         window: 60, // 60s window
         max: 10, // 10 requests per IP per window
         storage: "memory",
       },

       plugins: [
         magicLink({
           expiresIn: 60 * 10, // 10 min, one-time use
           disableSignUp: false, // Phase 1: open signup. Flip to true if invite-only.
           storeToken: "hashed", // never store raw tokens in DB
           callbackURL: "/app", // hardcoded — closes the open-redirect gap
           sendMagicLink: async ({ email, url }) => {
             // security-sentinel: fail-closed in production so a missed Phase 5
             // wiring can never accidentally leak tokens to Railway logs.
             if (env.NODE_ENV === "production") {
               throw new Error("magic-link delivery not configured (Phase 5: Resend)");
             }
             console.log(`[magic-link:dev] ${email}: ${url}`);
           },
         }),
         tanstackStartCookies(), // MUST be last
       ],
     }),
   )();
   ```

   Notes on this config (each line answers to a specific reviewer finding):
   - `serverOnly()` from `@tanstack/react-start` — NOT the npm `server-only` package (kieran-typescript)
   - `experimental: { joins: true }` — 2–3× faster session endpoints (better-auth docs, framework-docs researcher)
   - `trustedOrigins` — without this, cross-origin POSTs to `/api/auth/*` may bypass origin check (better-auth + security-sentinel)
   - `session.cookieCache` — eliminates the per-navigation DB hit on `_authed.tsx beforeLoad` (performance-oracle)
   - `rateLimit` — built-in, covers send+verify endpoints (better-auth + security-sentinel)
   - `magicLink({ expiresIn: 600, storeToken: "hashed", disableSignUp, callbackURL: "/app" })` — 4 hardenings flagged by security-sentinel
   - `sendMagicLink` callback **throws** in production — fail-closed against the "forgot to wire Resend" footgun
   - `defaultCookieAttributes` — explicit so cookie posture is auditable, not implicit-default

**Confirm** when running `bunx @better-auth/cli@latest generate` (in Phase 1.3 step 6) that the generated `verification` table schema stores tokens hashed (Better Auth handles the hashing because we set `storeToken: "hashed"`). Smoke-test by inserting a token and `SELECT`ing the row — the value should not equal the URL-embedded token.

2. Create `src/lib/auth-client.ts`:

   ```ts
   import { createAuthClient } from "better-auth/react";
   import { magicLinkClient } from "better-auth/client/plugins";
   export const authClient = createAuthClient({
     baseURL: import.meta.env.VITE_BETTER_AUTH_URL,
     plugins: [magicLinkClient()],
   });
   ```

   Add `vite-env.d.ts` augmentation so `import.meta.env.VITE_BETTER_AUTH_URL` is typed `string`, not `string | undefined`:

   ```ts
   /// <reference types="vite/client" />
   interface ImportMetaEnv {
     readonly VITE_BETTER_AUTH_URL: string;
   }
   interface ImportMeta {
     readonly env: ImportMetaEnv;
   }
   ```

3. Create the catch-all API route at `src/routes/api/auth.$.ts`. **Use the route file the scaffold generates** — Kieran's review flagged that hand-writing `createFileRoute` snippets risks fighting the generated route types. The shape inside is:

   ```ts
   export const ServerRoute = createServerFileRoute().methods({
     GET: ({ request }) => auth.handler(request),
     POST: ({ request }) => auth.handler(request),
   });
   ```

   The exact import (`createServerFileRoute` vs `createFileRoute` from generated routeTree) depends on the Start version pinned in 1.1 — verify against the scaffold's example file before writing this.

4. Create `_authed.tsx` layout route with `beforeLoad` guard, **Headers wrap fix**, and **fail-closed errorComponent**:

   ```ts
   import { createFileRoute, redirect, Navigate, Outlet } from "@tanstack/react-router";
   import { getHeaders } from "@tanstack/react-start/server";
   import { auth } from "@/lib/auth";

   export const Route = createFileRoute("/_authed")({
     beforeLoad: async () => {
       // kieran-typescript fix: getHeaders() returns Record<string, string|undefined>,
       // auth.api.getSession expects a Headers instance. Wrap explicitly, filter undefined.
       const headers = new Headers();
       for (const [k, v] of Object.entries(getHeaders())) {
         if (v !== undefined) headers.set(k, String(v));
       }
       const session = await auth.api.getSession({ headers });
       if (!session) throw redirect({ to: "/login" });
       return { user: session.user };
     },
     // security-sentinel: explicit errorComponent ensures DB outage fails CLOSED
     // (redirect to login) instead of any default behavior that might render the
     // matched route. NEVER let an auth error reveal a gated page.
     errorComponent: () => <Navigate to="/login" />,
     component: () => <Outlet />,
   });
   ```

   **Performance note** (performance-oracle): with the `cookieCache` setting in `auth.ts`, this `beforeLoad` does NOT hit the DB on every navigation — it verifies a signed cookie. The DB is only touched when the cache is stale (every 5 min) or the cookie is missing. Without this, dashboard navigation would feel laggy at 20–60 ms per nav against Railway Postgres.

5. Create `_authed/app.index.tsx` as a single placeholder route: "Welcome, $email. Phase 2 will put real stats here." Use `Route.useRouteContext()` to read `user` from the parent's beforeLoad return. **Only one** placeholder — Simplicity flagged three as ceremony.

**Acceptance:** Hitting `/app` while logged out redirects to `/login`. Magic-link dev flow: submit on `/login`, see URL in console, paste it, end up at `/app`. Sign-out clears the cookie and re-redirects.

### Phase 1.5 — Landing + auth pages (single file each, no pre-extraction)

1. **`src/routes/index.tsx`** — single file. Hero, code snippet, three feature cards, CTA buttons. Plain JSX, shadcn `Button` + `Card`. No `marketing/` subfolder. If a second page later wants to share the hero, **then** extract.
2. **`src/routes/login.tsx`** — single file. Header, magic-link form (shadcn `Form` + `Input` + `Button`, zod resolver, calls `authClient.signIn.magicLink()`). No OAuth buttons. Inline error display. Submit shows "Check your email" message.

   **Use an explicit state machine** (julik-races: `useState<boolean>` is a footgun for double-submit + unmount races):

   ```ts
   type FormState = "idle" | "submitting" | "sent" | "error";
   const [state, setState] = useState<FormState>("idle");
   const ctrlRef = useRef<AbortController | null>(null);
   useEffect(() => () => ctrlRef.current?.abort(), []); // cleanup on unmount

   async function onSubmit({ email }: { email: string }) {
     // Reject re-entry: state machine, not button.disabled
     if (state !== "idle" && state !== "error") return;
     setState("submitting");
     ctrlRef.current = new AbortController();
     try {
       await authClient.signIn.magicLink(
         { email, callbackURL: "/app" },
         { signal: ctrlRef.current.signal },
       );
       if (!ctrlRef.current.signal.aborted) setState("sent");
     } catch (err) {
       if (!ctrlRef.current.signal.aborted) setState("error");
     }
   }
   ```

   - `aria-disabled={state === "submitting"}` (NOT `disabled` — keeps focus reachable per make-interfaces-feel-better)
   - Button visual: spinner overlay, text fades to opacity-0 (the "alive frozen button" anti-pattern fix)
   - On `sent`: cross-fade to "Check your email" message with `animate-in fade-in slide-in-from-bottom-1 duration-300`
   - Move focus to the success heading (`tabIndex={-1}` + ref)
   - Reserve error-slot space with `min-h-5` so layout doesn't shift
   - Inline error uses `role="alert"` for screen readers

3. **`src/routes/signup.tsx`** — imports the magic-link form component from `login.tsx` (or duplicate the 15 lines, that's also fine for two callers). Different heading/subhead.
4. **`src/routes/pricing.tsx`** — placeholder card listing three tiers, "Free" enabled, "Pro/Team" with "coming soon" badges. Real copy in Phase 5.
5. **`src/routes/docs.tsx`** — one paragraph linking to the GitHub README. Real MDX in Phase 6.

**Acceptance:** All five routes render and visually match `docs/design.md` charter (token usage, voice).

### Phase 1.6 — Root layout, nav, theme toggle

1. **`src/routes/__root.tsx`**: HTML shell with `app.css` link, **the exact inline `<head>` theme script below** (prevents the SSR theme flash — must run before any CSS, before any React, blocking, no imports), `<meta name="color-scheme" content="light dark">`, sticky nav, `<Outlet />`, footer.

   **Inline `<head>` script** (place as the **first** child of `<head>`, before any `<link>`):

   ```html
   <script>
     (function () {
       try {
         var s = localStorage.getItem("theme");
         var m = window.matchMedia("(prefers-color-scheme: dark)").matches;
         var d = s === "dark" || (s !== "light" && m);
         document.documentElement.classList.toggle("dark", d);
         document.documentElement.style.colorScheme = d ? "dark" : "light";
       } catch (e) {}
     })();
   </script>
   ```

   This script is ≤500 bytes, fully synchronous, never throws (try/catch around `localStorage` for private browsing). The default fallback is **dark** when no preference is set (per the design charter: "if no preference, fall through to dark"). The `style.colorScheme` line ensures native form controls match the chosen theme.

2. **`src/components/nav.tsx`**: logo, primary nav (Pricing, Docs, GitHub external), right side: "Sign in" button if logged out, "Sign out" button if logged in. **No** avatar dropdown in Phase 1.

3. **`src/components/theme-toggle.tsx`**: single 40×40 button cycling Light → Dark → System (one button, not a dropdown). All three icons (sun/moon/monitor) live in the DOM, absolutely positioned, cross-faded by `data-active` (per make-interfaces-feel-better polish principles — opacity 0→1, scale 0.25→1, blur 4px→0, 200ms `cubic-bezier(0.2, 0, 0, 1)`). `aria-label` includes both current state and next action: `"Theme: dark. Click to switch to system."`.

   **Theme React hook** (julik-races: do NOT let React own the initial value — three sources of truth = guaranteed hydration mismatch):

   ```ts
   import { useState, useEffect, useLayoutEffect } from "react";

   type Theme = "light" | "dark" | "system";

   export function useTheme() {
     // Initial value is null so SSR matches client. Real value populated on mount.
     const [theme, setTheme] = useState<Theme | null>(null);

     // useLayoutEffect on mount: read from DOM (which the inline head script set)
     useLayoutEffect(() => {
       const stored = (localStorage.getItem("theme") as Theme | null) ?? "system";
       setTheme(stored);
     }, []);

     // Apply changes synchronously before paint
     useLayoutEffect(() => {
       if (!theme) return;
       const m = window.matchMedia("(prefers-color-scheme: dark)").matches;
       const dark = theme === "dark" || (theme === "system" && m);
       document.documentElement.classList.toggle("dark", dark);
       document.documentElement.style.colorScheme = dark ? "dark" : "light";
     }, [theme]);

     // Persist async (non-critical)
     useEffect(() => {
       if (theme) localStorage.setItem("theme", theme);
     }, [theme]);

     return { theme, setTheme };
   }
   ```

   The toggle button renders a placeholder icon while `theme === null` (SSR + first frame), then transitions to the real icon after mount. Add `suppressHydrationWarning` on the button itself because the `aria-label` differs between SSR and client. Without this discipline you get React hydration warnings on every theme toggle render.

4. Footer: OSS link, privacy placeholder (route not built yet, link to `#`), self-host link.

**Acceptance:** Nav reflects auth state. Theme toggle persists, no flash on hard reload, `prefers-reduced-motion` respected.

### Phase 1.7 — README + commits + tag

1. Create `apps/web/README.md`: prerequisites (Bun ≥1.3, local Postgres), the Phase 1 env vars (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`), `bun run dev` / `bun run build` / `bun run start` instructions, link to `docs/design.md` and `~/.claude/plans/fizzy-gliding-pike.md`. Note that this is Phase 1 of 6; OAuth and real dashboard are coming.
2. Manual smoke flow (locally):
   - `DATABASE_URL=...` etc. → `bun run db:migrate` → `bun run dev`
   - Click through `/`, `/pricing`, `/docs`, `/login`, `/signup`
   - Magic-link flow → `/app`
   - Sign out → `/app` redirects to `/login`
   - Theme toggle persists
   - Same flow against `bun run build && bun run start` to verify production bundle + migrations-on-start
3. **Atomic commits** (revision 3 — adds `.env.example`):
   1. `chore: include apps/* in workspaces; verify packages/server exports`
   2. `docs: add design charter`
   3. `chore(web): scaffold tanstack start app and tailwind v4 + shadcn`
   4. `feat(web): add drizzle postgres client and combined schema (auth + events + tenants)`
   5. `chore(web): add .env.example`
   6. `feat(web): wire better auth (hardened: cookieCache, trustedOrigins, rateLimit, hashed tokens, fail-closed sendMagicLink)`
   7. `feat(web): add _authed guard with errorComponent and dashboard placeholder`
   8. `feat(web): add landing, pricing, docs, login (state machine), signup, root layout, theme toggle`
   9. `ci(web): add web-build job`
   10. `docs(tanstack-start): update adapter example to current api` (side quest)
4. Tag `v0.6.0`.

**Bundle-import check** (performance-oracle blocker): before tagging, run `bun run build` and grep the landing chunk manifest. The landing page chunk MUST NOT contain references to:

- `auth-client` / `better-auth/client`
- `_authed/*` route modules
- `@tanstack/react-query` (it's deferred to Phase 3 anyway, but fail loudly if it sneaks in)

Mandate `lucide-react` per-icon subpath imports (`import { Sun } from "lucide-react/icons/sun"`) — never the barrel `import { Sun } from "lucide-react"` (tree-shaking footgun). Add a one-line note in `apps/web/README.md` and consider an ESLint rule for Phase 5 polish.

**`src/routes/api/health.ts`** (security-sentinel): return `new Response("ok", { status: 200 })` unconditionally. **Do not** touch the DB. Railway needs liveness, not readiness, in Phase 1. Touching the DB risks leaking connection-string fragments via stringified errors.

**Acceptance:** All commits atomic, conventional, tag exists, smoke flow passes against both dev and prod builds.

---

## Design Charter (content for `docs/design.md`)

> Copy this section verbatim into `docs/design.md`. **v0** — establishes principles and the few tokens that constrain the rest. Per-component rules grow with real screens, not in advance.

### Brand & voice

**blockrate.app exists because your analytics are lying to you, and we want to tell you exactly by how much.**

- **Calm over urgent.** No exclamation marks. No "amazing." No countdown timers.
- **Concrete over abstract.** "20% of your Optimizely calls never reached the server" beats "optimize your data quality."
- **Honest about limits.** If Phase 1 only ships magic link, the page says so.
- **Numbers are the hero.** Tabular numerals everywhere stats appear.
- **Lowercase product name** in body copy: `blockrate.app` / `blockrate`. Capitalised only at sentence start.

**Forbidden:** stock photos of people, mascots, "trusted by" walls, parallax, scroll-jacking, modal newsletter prompts, spinners (use skeletons).

### Color (oklch, dark-first)

**Dark is the default surface.** Theme toggle defaults to System; if no preference, fall through to dark.

**Tokens — light:**

```css
:root {
  --background: oklch(1 0 0);
  --foreground: oklch(0.15 0.02 240);
  --card: var(--background);
  --card-foreground: var(--foreground);
  --popover: oklch(0.99 0.005 240);
  --popover-foreground: var(--foreground);
  --primary: oklch(0.45 0.18 250);
  --primary-foreground: oklch(0.985 0.005 240);
  --secondary: oklch(0.96 0.01 240);
  --secondary-foreground: oklch(0.25 0.02 240);
  --muted: oklch(0.965 0.01 240);
  --muted-foreground: oklch(0.5 0.02 240);
  --accent: var(--secondary); /* shadcn components hard-reference --accent */
  --accent-foreground: var(--secondary-foreground);
  --border: oklch(0.92 0.01 240);
  --input: var(--border);
  --ring: var(--primary);
  --destructive: oklch(0.58 0.22 25);
  --destructive-foreground: oklch(0.985 0.005 240);

  /* The block-rate gradient — the only place colour is loud */
  --rate-low: oklch(0.7 0.15 145); /* < 5% */
  --rate-mid: oklch(0.72 0.18 75); /* 5–15% */
  --rate-high: oklch(0.62 0.22 25); /* > 15% */

  --radius: 0.5rem;
}
```

**Tokens — dark (the default):**

```css
.dark {
  --background: oklch(0.1 0.01 240);
  --foreground: oklch(0.97 0.005 240);
  --card: oklch(0.13 0.01 240);
  --card-foreground: var(--foreground);
  --popover: oklch(0.15 0.012 240);
  --popover-foreground: var(--foreground);
  --primary: oklch(0.7 0.2 250);
  --primary-foreground: oklch(0.1 0.01 240);
  --secondary: oklch(0.18 0.01 240);
  --secondary-foreground: oklch(0.97 0.005 240);
  --muted: oklch(0.18 0.01 240);
  --muted-foreground: oklch(0.62 0.015 240);
  --accent: var(--secondary);
  --accent-foreground: var(--secondary-foreground);
  --border: oklch(0.22 0.01 240);
  --input: var(--border);
  --ring: var(--primary);
  --destructive: oklch(0.66 0.23 25);
  --destructive-foreground: oklch(0.97 0.005 240);

  --rate-low: oklch(0.7 0.18 145);
  --rate-mid: oklch(0.77 0.2 75);
  --rate-high: oklch(0.7 0.24 25);
}
```

**Rules:**

- `--primary` only on primary actions, links, active nav. No decorative use.
- `--destructive` only on literal destruction + the high end of the block-rate gradient.
- The block-rate gradient is the brand. It appears nowhere else.
- Greys are cool-tinted (`oklch(L 0.005-0.020 240)`). No pure neutral.
- WCAG AA minimum (4.5:1 body, 3:1 large).

### Typography

- **Sans:** Inter (variable, self-hosted), fallback `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- **Mono:** JetBrains Mono, fallback `ui-monospace, SFMono-Regular, monospace`. Used for code AND all numerals in tables.
- **`font-variant-numeric: tabular-nums slashed-zero`** wherever stats appear. Non-negotiable.
- Scale: `text-xs` 12px, `text-sm` 14px, `text-base` 16px, `text-lg` 18px, `text-xl` 20px, `text-2xl` 24px, `text-3xl` 30px, `text-4xl` 36px, `text-5xl` 48px (hero only). Never `text-6xl`.
- Weights: 400 body, 500 UI labels, 600 subheadings, 700 page headings only. **Never bold inside body sentences** — restructure.

### Spacing & motion

- 4px base, 8px rhythm (Tailwind defaults). Never odd values (`5`, `7`, `9`).
- Container max-widths: marketing `max-w-6xl`, dashboard `max-w-5xl`, auth `max-w-md`.
- Motion: **150ms default**, `cubic-bezier(0.16, 1, 0.3, 1)` ease-out. 250ms for dialog/drawer. Never spring physics. Translate / opacity / scale only — never `width`, `height`, `top`, `left`.
- Skeletons not spinners. Spinners reserved for indeterminate full-page transitions.
- Respect `prefers-reduced-motion: reduce` always.

### Iconography

- `lucide-react` only. 20px default, 16px dense, 24px marketing hero. Stroke 1.5 (override Lucide's default 2). Same color as adjacent text unless communicating state.
- **Always use the per-icon subpath** to avoid the barrel-import bundle bloat: `import { Sun } from "lucide-react/icons/sun"`. Never `import { Sun } from "lucide-react"`.

### Fonts

- **Sans**: Inter, self-hosted woff2, **400 + 600 only** for Phase 1 (preload both). Other weights load on-demand.
- **Mono**: JetBrains Mono, self-hosted woff2, 400 + 500. **Do not preload** — below the fold.
- `font-display: swap` on every `@font-face`. Never `block`.
- Subset to Latin range for Phase 1; ext-Latin/Cyrillic/etc. when content demands.
- Preload pattern (in `__root.tsx` `<head>`):
  ```html
  <link rel="preload" as="font" type="font/woff2" crossorigin href="/fonts/inter-400.woff2" />
  <link rel="preload" as="font" type="font/woff2" crossorigin href="/fonts/inter-600.woff2" />
  ```

### Theme flash mitigation (non-negotiable)

The inline `<head>` script is **mandatory**. It runs synchronously, before any CSS, before React, before paint. The script in Phase 1.6 step 1 is the canonical version — do not modify without re-validating against the SSR/hydration timing in the System-Wide Impact section.

The React side **must NOT** own the initial theme value (julik-frontend-races: triple source of truth → guaranteed hydration mismatch). Use `useLayoutEffect` to read from the DOM (which the inline script set), `useLayoutEffect` to apply changes synchronously, `useEffect` to persist to localStorage. Render any theme-dependent text/icon/aria-label inside a placeholder slot until `theme !== null` (after mount), and tag the wrapping element `suppressHydrationWarning`.

### Polish principles (12)

These are the operational rules every interactive component answers to. Cite by number in PR reviews.

1. **Transitions are explicit.** Never `transition: all`. Always name properties: `transition-[background-color,transform,box-shadow]`.
2. **150ms default ease-out** for hover/focus; **200ms `cubic-bezier(0.2, 0, 0, 1)`** for icon cross-fades; **300ms** for form→success swaps.
3. **Scale-on-press 0.96** on every primary button. Never on ghost nav links.
4. **Focus-visible ring, not hover ring.** Keyboard gets a 2px offset ring (`focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`); mouse gets background/shadow only.
5. **Icons cross-fade, never toggle.** Both states in DOM, opacity 0→1, scale 0.25→1, blur 4px→0.
6. **Reserve space for dynamic content.** Error slots use `min-h-5`, numbers use `tabular-nums` — state changes must never shift layout.
7. **`text-balance` on headings, `text-pretty` on body.** Set once on `html` in `app.css`, never repeat.
8. **Font smoothing on root.** `antialiased` already in body.
9. **Minimum 40×40 hit area** on every interactive element, including the theme toggle.
10. **Placeholders are intentional surfaces.** Dashed border + generous padding + Phase-N copy treatment, never a blank `<div>`.
11. **Focus moves with state.** After submit success → heading. After submit error → input (with selection). After theme toggle → announce via `aria-live`.
12. **Disabled buttons stay focusable.** Use `aria-disabled`, not `disabled`, so screen readers still announce them and focus doesn't jump to `<body>`.

### Charter discipline

- **This is v0.** Per-component rules, copywriting catalogue, accessibility runbook all grow when real screens demand them. Don't add sections speculatively — add them when a PR review surfaces a question this charter doesn't answer.
- **Every PR that touches UI must answer to this file.** Reviewers cite section names.
- **Revise via PR**, not in passing. Charter changes get their own commits.

---

## Critical files

**Created:**

- `docs/design.md` (v0 charter)
- `docs/plans/2026-04-08-feat-blockrate-app-web-scaffold-plan.md` (this file)
- `apps/web/package.json`, `tsconfig.json`, `vite.config.ts`, `components.json`, `drizzle.config.ts`, `drizzle/0000_*.sql`, `README.md`
- `apps/web/src/routes/__root.tsx`, `index.tsx`, `pricing.tsx`, `docs.tsx`, `login.tsx`, `signup.tsx`, `_authed.tsx`, `_authed/app.index.tsx`, `api/auth.$.ts`, `api/health.ts`
- `apps/web/src/components/ui/*` (10 components only)
- `apps/web/src/components/nav.tsx`, `theme-toggle.tsx`
- `apps/web/src/lib/cn.ts`, `auth.ts`, `auth-client.ts`, `env.server.ts`, `db/index.ts`, `db/schema.ts`, `db/auth-schema.ts`
- `apps/web/src/styles/app.css`, `vite-env.d.ts`
- `apps/web/public/favicon.svg`

**Modified:**

- `package.json` (workspace glob)
- `README.md` (hosted callout)
- `.github/workflows/ci.yml` (single `web-build` job, no typecheck/cache)
- `packages/core/src/tanstack-start/index.ts` (adapter doc fix)
- `packages/server/package.json` (verify `exports`/`main`/`types` if missing — kieran preflight)

## Acceptance criteria

**Functional:**

- [ ] `bun install` at root succeeds with new workspace glob
- [ ] `cd apps/web && bun run dev` boots without errors
- [ ] `bun run build && bun run start` boots a production server (migrations run on start)
- [ ] `/`, `/pricing`, `/docs`, `/login`, `/signup` render and respect `docs/design.md`
- [ ] `/app` redirects to `/login` when logged out
- [ ] Magic-link dev flow: submit email → console URL → paste → land on `/app`
- [ ] Sign out → `/app` redirects to `/login`
- [ ] Theme toggle (Light/Dark/System) persists across reloads
- [ ] Default theme is dark
- [ ] No FOUC theme flash on hard reload

**Non-functional (concrete budgets per performance-oracle):**

- [ ] Landing **JS ≤ 200 KB gzipped** AND **≤ 80 KB per route chunk** (verify in Vite build output)
- [ ] Landing chunk does NOT import `auth-client`, `better-auth/client`, `@tanstack/react-query`, or `_authed/*` (grep the manifest)
- [ ] Landing **FCP < 1.2 s**, **LCP < 1.8 s**, **TTI < 2.5 s** on Railway cold (manual Lighthouse run, not CI)
- [ ] `_authed` navigation **< 100 ms p50** (only achievable with `cookieCache` enabled — verify by hitting `/app/index` 5× in a row and measuring)
- [ ] Magic-link form submit-to-feedback **< 350 ms** in dev
- [ ] WCAG AA contrast in both light and dark modes (manual check on landing + login)
- [ ] Focus rings visible on every interactive element via keyboard navigation
- [ ] `prefers-reduced-motion: reduce` disables all transitions
- [ ] No FOUC / theme flash on hard reload (verify in fresh incognito → toggle to light → hard reload → no flash)
- [ ] All `lucide-react` imports use the per-icon subpath form

**Quality gates:**

- [ ] CI green (web-build job + existing tests)
- [ ] All commits atomic and conventional
- [ ] `docs/design.md` exists, referenced from apps/web README and root README
- [ ] `apps/web/.env.example` exists with placeholders only (no real secrets)
- [ ] No `console.error`/`console.warn` during smoke flow
- [ ] No `TODO Phase 1` comments left committed
- [ ] All Kieran-flagged TS issues addressed (Headers wrap, env typing, server-only convention, schema generation order)
- [ ] All security-sentinel blockers addressed (`min(32)` zod, `ssl: "require"` in prod, fail-closed `sendMagicLink`, `trustedOrigins`, `errorComponent`, hardcoded `callbackURL`)
- [ ] Better Auth `verification` table stores tokens **hashed** (verify post-`@better-auth/cli generate` by inspecting the schema)
- [ ] Submit `/login` with malformed email → validation error, no network call. Submit valid email twice within 60 s → second request rate-limited.

## System-wide impact

### Interaction graph (Phase 1 magic-link flow)

1. User submits email on `/login` → form calls `authClient.signIn.magicLink({ email })`
2. Better Auth client POSTs to `/api/auth/sign-in/magic-link`
3. The catch-all `routes/api/auth.$.ts` forwards to `auth.handler(request)`
4. `auth.handler` invokes the `magicLink` plugin's `sendMagicLink` callback
5. Callback writes a verification token to the `verification` table (Drizzle adapter → `postgres-js`)
6. Callback calls `console.log` (Phase 1) — Resend wires up in Phase 5
7. User clicks the URL → GET `/api/auth/magic-link/verify?token=...`
8. Catch-all → `auth.handler` validates the token, creates a session row, sets `Set-Cookie` (via `tanstackStartCookies()`)
9. Redirect to `/app`
10. `_authed.tsx`'s `beforeLoad` calls `auth.api.getSession({ headers: new Headers(getHeaders()) })`, returns the session, exposes `user` via route context
11. `app.index.tsx` renders with `user` from `Route.useRouteContext()`

### Error & failure propagation

- **Magic link send failure**: Better Auth returns 500. Inline error in the form, **not** a toast.
- **Token expired/used**: Better Auth returns 401 from verify. Catch and redirect to `/login?error=expired`.
- **DB unreachable on `_authed.tsx` `beforeLoad`**: throws → TanStack Start route error component. Add a Phase 1 `errorComponent` saying "Service temporarily unavailable."
- **Migration failure on `start`**: container fails to boot. **Loud failure intentional** — we want this visible.

### State lifecycle risks

- **Verification token races**: Better Auth's generated `verification` table has a `consumed_at` column — confirm during Phase 1.3 step 9 inspection.
- **SSR theme flash**: mitigated by the inline `<head>` script in Phase 1.6 step 1.

### Integration test scenarios

These are the verification flows (manual in Phase 1, Playwright candidates for Phase 6):

1. **Cold start signup**: nuke DB → `db:migrate` → `start` → magic link flow → land on `/app`. Verifies migrations apply cleanly + start script.
2. **Theme persistence across hard reload**: toggle to light → hard reload → renders without flash. Verifies the inline head script.
3. **Logged-in nav state**: log in → refresh → nav shows "Sign out". Verifies session is read on every navigation.
4. **Sign-out clears session**: log in → sign out → hit `/app` → redirected. Verifies cookie is cleared.
5. **Production build + start**: `bun run build && bun run start` → repeat the flow against `node .output/...`. Verifies migrations run on start, not build.

## Risks & mitigations

| Risk                                                                                       | L                                      | I            | Mitigation                                                                                                                         |
| ------------------------------------------------------------------------------------------ | -------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| TanStack Start RC breaking changes between Phase 1 and Phase 5                             | M                                      | M            | Pin exact versions; budget 1h per minor bump                                                                                       |
| `--base base` flag missing in deployed shadcn CLI                                          | L                                      | M            | Verify in Phase 1.1; fall back path documented in Phase 1.2 step 5                                                                 |
| Base UI package name divergence                                                            | M                                      | L            | Verify in Phase 1.1; document choice in design.md                                                                                  |
| Better Auth schema generation drift from expectations                                      | L                                      | M            | Generate first, inspect, then layer                                                                                                |
| Theme flash on hard reload                                                                 | H if not fixed                         | M            | Inline head script in Phase 1.6 step 1                                                                                             |
| Workspace TS resolution from web app to `block-rate-server`                                | M                                      | H            | **Kieran preflight in Phase 1.0 step 3** — verify `packages/server/package.json` exports/main/types                                |
| `_authed.tsx` `beforeLoad` slow per navigation                                             | L (Phase 1)                            | M (Phase 3+) | Defer — no perf to measure until real loaders exist. Architecture-strategist agreed.                                               |
| In-process rate limiter doesn't survive multi-instance Railway                             | L (Phase 1)                            | M (Phase 5)  | Architecture-strategist flagged for Phase 5 deploy decision (Postgres-backed or Redis)                                             |
| Drizzle migration runs on Railway build (where DB is unreachable)                          | L                                      | H            | `start` script includes `db:migrate`, **not** `build`                                                                              |
| Schema definitions duplicated between `apps/web` and `packages/server`                     | M                                      | L            | Explicit decision (revision 2). Drift caught by review. ~30 lines, low cost.                                                       |
| design.md becomes a graveyard nobody updates                                               | M                                      | M            | v0 charter is small enough to actually maintain; PR reviewers cite sections; revisit at v0.7.0                                     |
| Magic-link `console.log` callback ships to production unguarded → Railway logs leak tokens | L (with fail-closed) / **H** (without) | **Critical** | **Phase 1.4 step 1: callback throws in `NODE_ENV === "production"`.** Cannot be deployed accidentally.                             |
| Open redirect via Better Auth `callbackURL` query parameter                                | M                                      | H            | **Hardcode `callbackURL: "/app"`** in `magicLink({})` config — client cannot pass arbitrary URLs                                   |
| Bundle size blows past 200 KB on landing                                                   | H without discipline                   | M            | Defer TanStack Query to Phase 3. Mandate `lucide-react` per-icon subpath. Bundle-import grep check before tag.                     |
| Theme flash on hard reload (FOUC)                                                          | H without inline script                | M            | Inline `<head>` script in Phase 1.6 step 1 + React `useLayoutEffect` hook + `suppressHydrationWarning` on the toggle (julik-races) |
| `_authed` `beforeLoad` DB hit on every navigation feels laggy                              | H without `cookieCache`                | M            | Better Auth `session.cookieCache` enabled in Phase 1.4 — verifies signed cookie instead of DB round-trip                           |
| Postgres connection without TLS in production → MITM                                       | L (Railway internal) / H (public URL)  | H            | `ssl: "require"` in production via `env.NODE_ENV` check in `db/index.ts`                                                           |
| `BETTER_AUTH_SECRET` shipped weak (< 32 chars)                                             | M                                      | Critical     | `z.string().min(32)` enforced in `env.server.ts` zod schema; `.env.example` shows `openssl rand -base64 32`                        |
| Magic-link form double-submit / setState on unmounted component                            | M                                      | L            | State machine + `AbortController` pattern in Phase 1.5 step 2                                                                      |
| Better Auth `verification` table stores plaintext tokens                                   | L                                      | Critical     | `storeToken: "hashed"` in `magicLink({})` config; verify post-generation via SELECT                                                |
| Auth bypass on DB partial failure / read replica drift                                     | L (Phase 1)                            | H            | `errorComponent: () => <Navigate to="/login" />` on `_authed` — fails closed                                                       |
| Health endpoint leaks DB connection details on error                                       | L                                      | M            | `/api/health` returns static `200 OK` body, never touches DB                                                                       |

## Sources & references

### Origin

- **Parent plan:** `~/.claude/plans/fizzy-gliding-pike.md` (Phases 0–6)
- **Reviews integrated (revision 2)**: kieran-typescript-reviewer, architecture-strategist, code-simplicity-reviewer (this session)
- **Phase 0 already shipped at v0.5.0**: `BlockRateStore` interface, `SqliteStore`, `PostgresStore`, `truncateUserAgent`, refactored handlers. The web app reuses the **pure-function bits** (`truncateUserAgent`, `TokenBucketLimiter`, `blockRatePayloadSchema`), not the schema files.

### Internal references

- `packages/server/src/index.ts` — public surface (`truncateUserAgent`, `TokenBucketLimiter`, `blockRatePayloadSchema`, types — schemas NOT consumed by web app)
- `packages/server/src/schema.postgres.ts` — **reference shape** for the `tenants` and `events` tables that `apps/web/src/lib/db/schema.ts` will declare independently
- `packages/server/package.json` — verify `exports`/`main`/`types` in Phase 1.0 step 3 (Kieran preflight)
- `packages/core/src/tanstack-start/index.ts` — adapter with outdated doc example, fixed in Phase 1.1 step 9
- `tailwind-v4-shadcn` skill — canonical v4 + shadcn integration pattern

### External references (verified 2026-04-08)

- TanStack Start quick start: https://tanstack.com/start/latest/docs/framework/react/quick-start
- TanStack Start server routes: https://tanstack.com/start/latest/docs/framework/react/guide/server-routes
- TanStack Start hosting: https://tanstack.com/start/latest/docs/framework/react/guide/hosting
- shadcn CLI: https://ui.shadcn.com/docs/cli
- Base UI: https://base-ui.com/react/overview/quick-start
- Base UI components: https://base-ui.com/react/components
- Better Auth installation: https://www.better-auth.com/docs/installation
- Better Auth TanStack: https://www.better-auth.com/docs/integrations/tanstack
- Better Auth Drizzle adapter: https://www.better-auth.com/docs/adapters/drizzle
- Better Auth magic link: https://www.better-auth.com/docs/plugins/magic-link
- Drizzle Postgres get-started: https://orm.drizzle.team/docs/get-started/postgresql-new
- Drizzle migrations: https://orm.drizzle.team/docs/migrations
- awesome-design-md: https://github.com/VoltAgent/awesome-design-md

## Process notes

- **Revision 1**: original draft from `/workflows:plan` (comprehensive, ambitious).
- **Revision 2**: integrated three independent reviews — kieran-typescript (3 critical type issues, 5 majors, 4 nits), architecture-strategist (3 blockers, 3 coupling concerns), code-simplicity (cut 11 things, deferred 2). Convergent finding: Phase 1 was wearing Phase 2/3's clothes. Cut speculative scope, fixed type-safety errors, resolved schema-ownership ambiguity (`apps/web` owns all hosted Postgres).
- **Revision 3** (this version): integrated `/deepen-plan` pass with six more agents/skills (tailwind-v4-shadcn skill, better-auth-best-practices skill, make-interfaces-feel-better skill, performance-oracle, security-sentinel, julik-frontend-races-reviewer). Six issues were flagged by 2+ independent agents (see the "Origin & review history" section's table) — those are the production-hardening additions. All concrete artifacts the agents produced (full `app.css`, hardened `auth.ts`, inline head theme script, theme React hook, form state machine, polish principles) are baked inline rather than appended as a "Research insights" section, to keep the plan readable as a single coherent spec.
- **SpecFlow analyzer skipped intentionally** in all three revisions — feature is a scaffold + library install, not a branching user journey. The verification scenarios in System-Wide Impact + the explicit perf budgets in Acceptance Criteria serve the same purpose.
- **Decisions held against simplicity pressure**: see the "What was kept against simplicity pressure" subsection above. Revision 3 added one more category — the _performance hardening_ items (cookieCache, postgres-js pool config, font preload) all looked like premature optimization until the deepen pass justified each with concrete numbers.
- **Sub-agent token cost discipline**: the deepen pass ran 6 focused agents instead of the 30+ the workflow allows, because category-error agents (Rails/Python/etc on a TypeScript plan) produce noise that drowns signal. Quality > quantity.
