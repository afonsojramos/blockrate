# Plan 004: Show per-browser block-rate breakdowns on the dashboard

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 7c78ce5..HEAD -- apps/web/src/server/stats.ts apps/web/src/routes/_authed/app apps/web/test`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `7c78ce5`, 2026-07-21

## Why this matters

The launch-asset playbook (`docs/launch-strategy.md` §9) models blockrate's
data story on Plausible's viral post, whose impact came from **segments** —
"Firefox users block at 88%, Linux at 82%." Per-browser breakdowns are also
independently useful to customers deciding whether a block rate is a
tech-audience artifact. The key enabling fact: **the data is already
collected.** Every event row carries `userAgent` truncated at ingest to
browser family + major version (e.g. "Chrome 131") — the truncation exists
precisely so this question can be asked (`packages/server/src/ua.ts` header:
"preserves the one slice analytics actually cares about — 'does block rate
differ by browser?'"). Nobody ever built the query. This plan adds a
per-browser breakdown to the account dashboard with **zero schema changes**
and zero new data collection (the consent-free promise is untouched).

## Current state

- `apps/web/src/lib/db/schema.ts:117` — `events.userAgent` is `text`, " NEVER
  the raw UA", holding values like `Chrome 131`, `Firefox 124`, `Safari 17`,
  `unknown`, `other` (see `packages/server/src/ua.ts` for the full mapping
  table — Edge, Opera, Samsung Internet are separate families).
- `apps/web/src/server/stats.ts` — `getOverviewData` aggregates per-provider
  stats for the dashboard. Conventions to copy exactly:
  - The account-scoped `where` clause pattern (`stats.ts:107-117`): account
    filter + `gte(events.timestamp, since)` + optional service filter, with
    `sinceDays` capped by `plan.dashboardHistoryDays`.
  - The string-coercion trap (`stats.ts:119-128`): Postgres `COUNT`/`SUM`/
    `AVG` come back as strings from the pg/pglite drivers — always
    `count()` or `.mapWith(Number)`. The blocked-count expression to reuse:
    ```ts
    blocked: sql<number>`SUM(CASE WHEN ${events.status} = 'blocked' THEN 1 ELSE 0 END)`.mapWith(Number),
    ```
- `apps/web/src/routes/_authed/app/index.tsx` — the overview page that
  renders `getOverviewData`'s `stats` rows. Match its table/card markup.
- `apps/web/src/lib/providers.ts` — exports `MIN_SAMPLE_CHECKS` and
  `applyFloor(rate, total)` used to suppress noisy low-sample numbers in
  public surfaces. For the private dashboard the account's own numbers are
  shown as-is (per the `attachBenchmark` comment: "The account's own rate is
  never floored"), but a browser family with < ~20 checks should be labeled
  low-sample rather than presented with false precision. Reuse the existing
  UI's convention for this if one exists; otherwise a muted "n=X" suffix.
- Test pattern: DB-real tests against PGlite in `apps/web/test/` (see
  `admin-overview.test.ts` and the remediation tests). Server functions are
  written as a DB-parameterized core + thin `createServerFn` wrapper (see
  `setWeeklyDigestForAccount`, `stats.ts:194-207`) so they are testable
  without a session. Follow that.

## Commands you will need

| Purpose   | Command                     | Expected on success |
| --------- | --------------------------- | ------------------- |
| Tests     | `cd apps/web && bun test`   | all pass            |
| Full gate | `bun run check` (repo root) | exit 0              |

## Scope

**In scope**:

- `apps/web/src/server/stats.ts` — new `getBrowserBreakdown` server fn (or
  extend `getOverviewData`; prefer a separate fn so the overview query stays
  cheap when the section is collapsed)
- `apps/web/src/routes/_authed/app/index.tsx` — render the breakdown section
- `apps/web/test/` — one new test file for the aggregation core

**Out of scope**:

- **Any schema change / migration.** OS segmentation, device class, and geo
  are deliberately NOT collected; adding them is a separate product/privacy
  decision. If you think browser-family grouping needs a new column, STOP —
  it derives from the existing `userAgent` string.
- Public surfaces (`/report`, `/block-rate/*`, public JSON APIs,
  `daily_provider_stats`). Public per-browser pages multiply the
  small-counts problem and interact with the sealed-rollup invariant
  (`CLAUDE.md`: "seal daily rollup so free retention cannot shrink public
  rates"). Explicitly deferred.
- `packages/*` — no client or server-package changes.
- CSV export (`exportEventsCsv` already includes the browser column).

## Git workflow

- Branch: `feat/browser-breakdown`
- Conventional commits, e.g. `feat(web): aggregate block rate by browser
family`, `feat(web): render browser breakdown on dashboard`.

## Steps

### Step 1: Aggregation core + tests

Add to `apps/web/src/server/stats.ts`:

```ts
export interface BrowserRow {
  /** Browser family, e.g. "Chrome" (major versions collapsed). */
  family: string;
  total: number;
  blocked: number;
  blockRate: number;
}

export async function getBrowserBreakdownForAccount(
  db: BunSQLDatabase<typeof schema>,
  accountId: number,
  sinceDays: number,
  service?: string,
): Promise<BrowserRow[]>;
```

Implementation:

- Query: `SELECT user_agent, COUNT(*), SUM(CASE WHEN status='blocked' …)`
  grouped by `user_agent` over the same account/window/service `where` shape
  as `getOverviewData` (reuse — do not duplicate — the where-builder; extract
  a small helper if that is cleaner than copying).
- In JS, collapse `Chrome 131` → `Chrome` by stripping the trailing space +
  digits (keep `unknown` and `other` as their own rows), summing counts.
- Compute `blockRate = blocked / total` (0 when total is 0), sort
  descending by `total` (volume-first reads better than rate-first for
  segments; the provider table already sorts by rate, so add a code comment
  noting the deliberate difference).
- Wrap in `getBrowserBreakdown = createServerFn({ method: "GET" })` with the
  same `overviewInput`-style zod validation and `requireAccount()` +
  plan-window capping as `getOverviewData`.

Tests (`apps/web/test/browser-breakdown.test.ts`, modeled after
`admin-overview.test.ts`'s PGlite setup):

1. Seeds events across `Chrome 131`, `Chrome 130`, `Firefox 124` → two
   family rows with correctly summed counts and rates.
2. `unknown` and `other` values group as their own families.
3. Events outside the window are excluded.
4. Events from another account are excluded.
5. Service filter restricts the rows.
6. Window capped at plan limit (mirror how existing tests handle
   `dashboardHistoryDays`, or test the core directly with explicit
   `sinceDays`).

**Verify**: `cd apps/web && bun test test/browser-breakdown.test.ts` → all
pass.

### Step 2: Render the section

In `apps/web/src/routes/_authed/app/index.tsx`, below the per-provider
table, add a "By browser" section: a small table of family / checks /
blocked / block rate. Respect the same `since` window and service filter
the page already controls (pass them to `getBrowserBreakdown` so the two
tables always agree). Numbers right-aligned with the repo's tabular-nums
convention (see `todos/003-resolved-p1-missing-tabular-nums-on-stats.md`).
Empty state: if there are no events, render nothing (the page's existing
empty state covers it). Honor `docs/design.md`.

**Verify**: `bun run check` exit 0; manual `cd apps/web && bun run dev`
with seeded data shows the section and the numbers match a hand-computed
`GROUP BY` in the DB.

## Test plan

- `apps/web/test/browser-breakdown.test.ts` — the six cases above.
- Full suite stays green: `cd apps/web && bun test`.

## Done criteria

- [ ] `bun run check` exits 0
- [ ] `cd apps/web && bun test` exits 0 with the new breakdown tests
- [ ] Dashboard shows per-browser rows that agree with a hand-run
      `GROUP BY` query on the same window
- [ ] No migration created; no changes to `packages/*` or public routes
      (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpts/conventions above don't match the live code (drift).
- You find yourself wanting to change `truncateUserAgent` or the events
  schema — out of scope by design; report instead.
- `userAgent` values in the seeded test DB don't match the documented
  "Family Major" shape — check `packages/server/src/ua.ts` before assuming.
- Verification fails twice after a reasonable fix attempt.

## Maintenance notes

- New browser families added to `truncateUserAgent` patterns flow through
  automatically; no dashboard change needed.
- If a per-provider × browser cross-tab is requested later, add it as a
  separate group-by — do not widen this query's row cardinality by default
  (the events table is the hot table).
- Deferred follow-ups (do not build without a new decision): OS/device
  segmentation (new collection, privacy review), public per-browser report
  pages (interacts with the sealed rollup and sample floors).
