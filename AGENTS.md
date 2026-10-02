# blockrate — agent guide

blockrate measures the **per-provider block rate** of third-party tools (Optimizely,
PostHog, GA4, …). Three surfaces:

- `packages/core` — the OSS client, published as `blockrate`.
- `packages/server` — self-hostable ingestion server (Bun + Drizzle, SQLite default).
- `apps/web` — the hosted dashboard `blockrate.app` (TanStack Start + Better Auth).

## The one number that must never be wrong

The per-provider block rate **is** the product. Reporting "18% blocked" when reality is
38% is worse than no dashboard, because users trust it. Three bug classes silently
invert it — guard against all three:

1. **Detector reports a blocked install as loaded.** Loader snippets run even when the
   CDN is blocked, so any "is the global truthy?" check reports loaded for blocked
   users. Guarded by `packages/core/test/provider-shapes.test.ts` (every provider ×
   three shape states). Re-verify each provider's post-load global per major version.
2. **CDN probe URL rots or drops CORS.** A non-CORS redirect makes the probe throw →
   reports blocked for the whole population. Guarded by the daily
   `.github/workflows/smoke.yml` and `cd packages/core && bun run test:smoke`
   (`BLOCKRATE_SMOKE=1`). Investigate smoke failures same-day; never repoint a probe to
   a less-stable URL just to make it pass.
3. **Reporter endpoint is not first-party.** If the client posts to `blockrate.app`
   directly instead of the customer's own `/api/...` route, the day that domain lands on
   EasyPrivacy only the _un-blocked_ events arrive — silent inversion. Enforced by the
   `createBlockRateHandler({ forward })` API shape; see `packages/core/README.md`
   ("Why the reporter endpoint must be first-party").

Database aggregates are a fourth trap: Postgres `COUNT`/`SUM`/`AVG` come back from the
pg/pglite drivers as **strings**. Always coerce with drizzle `count()` /
`.mapWith(Number)`, or the rate is computed on strings (see `apps/web/src/server/stats.ts`).

## Pre-ship validation

```bash
bun run check                              # fmt + lint + typecheck
bun test packages/core packages/server
cd apps/web && bun test                    # needs BETTER_AUTH_SECRET (≥32 chars)
cd packages/core && bun run test:smoke     # live CDNs; required before an npm publish
```

Production build: `cd packages/core && bun run build && cd apps/web && NODE_ENV=production bun run build`.

## Deploy — apps/web

| Var                                           | Used for                     | Notes                                                                                                     |
| --------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`                          | session signing              | ≥32 chars; rotating logs everyone out                                                                     |
| `DATABASE_URL`                                | Postgres                     | bun:sql driver; `pglite://` is local/dev only                                                             |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | billing                      | per-environment                                                                                           |
| `STRIPE_{PRO,TEAM}_{MONTHLY,ANNUAL}_PRICE_ID` | plan ↔ price mapping         | read at call time by `lib/plans.ts`                                                                       |
| `RESEND_API_KEY`                              | magic-link email             | required for sign-in                                                                                      |
| `CRON_SECRET`                                 | retention endpoint           | ≥32 chars; unset ⇒ endpoint 503s                                                                          |
| `VITE_SITE_URL`                               | canonical + robots + sitemap | **must be set at BUILD time** (Vite-inlined). Unset ⇒ the site serves `Disallow: /` and is non-indexable. |

Gate, in order: `bun run check` green → tests green → prod build green → migrations
applied (`drizzle-kit check` shows no drift). After deploy, hit `/api/health`, `/demo`,
and `/api/block-rate` with a synthetic payload. The schema is the only one-way door —
never drop/rename a column in a single PR (add → backfill → switch reads → drop across
two deploys).

## Known limitations — do NOT "fix" these without thinking

- **3-second probe delay** — the reported rate is "engaged users," not all visitors.
  Deliberate.
- **`sessionDedup` defaults to `false`** — refresh-heavy users skew the rate up; `false`
  keeps the consent-free promise (no `sessionStorage` writes). See `types.ts`.
- **/demo latency uniformity** — browsers batch blocked-fetch rejections into one
  microtask flush, so blocked providers share a latency. A browser artifact, not a bug.
- **meta-pixel uses a CORS GET probe** — `fbq` sets `loaded` on its own stub, so the
  global can't be gated. `facebook.com/tr` serves CORS on GET (not HEAD), so detection is a
  CORS GET fetch. It used an `<img>` probe until Meta switched `/tr` from a 1x1 gif to an
  empty `text/plain` 200, which made onerror fire for every visitor (100% false-blocked).

## Conventions

- Runtime: Bun. Lint/format: oxlint / oxfmt. ORM: Drizzle — use the CLI for migrations,
  never hand-edit; consolidate a PR's migrations into one.
- Ship with confidence, not feature flags. Build the confidence with tests and review,
  then ship the feature on.
- Never reference Claude in commits or docs. Conventional-commit titles, imperative mood,
  atomic commits.
