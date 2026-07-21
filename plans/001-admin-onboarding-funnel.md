# Plan 001: Add an onboarding-funnel panel to the admin dashboard

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 7c78ce5..HEAD -- apps/web/src/server/admin.ts apps/web/src/routes/_authed/app/admin apps/web/test`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `7c78ce5`, 2026-07-21

## Why this matters

The product strategy (`docs/launch-strategy.md`, §6 and §10) names
**time-to-first-block-rate** as the metric that matters most, and flags the
first-party reporter setup as the suspected onboarding drop-off. Today nothing
measures it: the admin dashboard shows event volumes and signups but cannot
answer "what fraction of signups ever get a first event, and how long does it
take?" Without this number, every subsequent investment decision (onboarding
tooling vs. new features) is a guess. This plan adds a signup → first API key →
first event funnel, with median transition times, to the existing operator-only
admin page. No schema changes are needed: every stage is derivable from
existing timestamps.

## Current state

- `apps/web/src/server/admin.ts` — operator-only admin server functions.
  `getAdminOverview` returns event windows, user counts, active accounts, plan
  distribution, and top accounts. Auth gate pattern (keep exactly this shape —
  the same opaque redirect for unauthenticated and non-admin, so there is no
  enumeration oracle):

  ```ts
  // apps/web/src/server/admin.ts:22-32
  const adminSessionOrRedirect = async () => {
    const { auth } = await import("@/lib/auth.server");
    const { isAdminEmail } = await import("@/lib/admin.server");

    const session = await auth.api.getSession({ headers: getRequest().headers });
    if (!session || !isAdminEmail(session.user.email)) {
      throw redirect({ to: "/app", search: { since: 7 } });
    }
    return session;
  };
  ```

- `apps/web/src/routes/_authed/app/admin/index.tsx` — the admin page. Calls
  `assertAdmin` in `beforeLoad`, loads `getAdminOverview()` in `loader`, and
  renders `Card`-based stat panels (`Card`, `CardHeader`, `CardTitle`,
  `CardContent` from `@/components/ui/card`).
- `apps/web/src/lib/db/schema.ts` — the tables, all with the timestamps needed:
  - `app_accounts` (1:1 with Better Auth `user`): `createdAt`
    (`schema.ts:46-48`).
  - `api_keys`: `createdAt`, `lastUsedAt` (touched best-effort on every
    successful ingest, `routes/api/ingest.ts` step 8), `revokedAt`.
  - `events`: `timestamp`, `accountId`.
- **Repo convention that bites here** (from `CLAUDE.md`): Postgres
  `COUNT`/`SUM`/`AVG` come back from the pg/pglite drivers as **strings**.
  Always use drizzle `count()` or `.mapWith(Number)`. `admin.ts:89` already
  does this (`sql<number>\`COUNT(\*)\`.mapWith(Number)`); match it. Raw `sql``
template inlines must be pre-stringified dates (`.toISOString()`), never raw
`Date`objects — see the comment at`admin.ts:86-89`.
- Tests: `apps/web/test/admin-overview.test.ts` exists and mirrors the query
  shape (per the header comment in `admin.ts:10`). Tests run against PGlite;
  `cd apps/web && bun test` requires `BETTER_AUTH_SECRET` (≥32 chars) in the
  environment — the repo's test setup handles this, just run the command as
  documented.
- Server functions that need DB-real testability are written as an
  account/DB-parameterized core plus a thin `createServerFn` wrapper — see
  `setWeeklyDigestForAccount` in `apps/web/src/server/stats.ts:194-201` and the
  header comment of `apps/web/src/server/remediation.ts`. Follow that pattern.

## Commands you will need

| Purpose   | Command                     | Expected on success             |
| --------- | --------------------------- | ------------------------------- |
| Tests     | `cd apps/web && bun test`   | all pass                        |
| Full gate | `bun run check` (repo root) | exit 0 (fmt + lint + typecheck) |

## Scope

**In scope** (the only files you should modify):

- `apps/web/src/server/admin.ts` — add the funnel core + extend the overview payload (or add a second server fn)
- `apps/web/src/routes/_authed/app/admin/index.tsx` — render the funnel panel
- `apps/web/test/admin-overview.test.ts` (or a new `apps/web/test/admin-funnel.test.ts`) — DB-real tests

**Out of scope** (do NOT touch, even though they look related):

- `apps/web/src/lib/db/schema.ts` — **no migration**. Everything needed already
  exists. If you believe a column is missing, STOP.
- `apps/web/src/routes/api/ingest.ts` — `lastUsedAt` is already maintained.
- Any user-facing (non-admin) surface. This is operator telemetry only.
- `packages/*` — nothing in the OSS packages changes.

## Git workflow

- Branch: `feat/admin-onboarding-funnel`
- Commit style: conventional commits, single-line, imperative — e.g.
  `feat(web): add onboarding funnel to admin overview` (see `git log`).
- One commit for the server function + tests, one for the UI panel.

## Steps

### Step 1: Write the failing tests for the funnel core

Create `apps/web/test/admin-funnel.test.ts`, modeled after
`apps/web/test/admin-overview.test.ts` (read it first and copy its PGlite
setup/teardown — note commit `6c526f6` closed per-test PGlite instances to stop
OOM; reuse whatever pattern it uses).

Test cases against a seeded database:

1. Account with a user + app_account but no API key counts only in stage
   "signed up".
2. Account with an API key but no events counts in stages "signed up" and "key
   created".
3. Account with events counts in all three stages; `firstEventAt` equals
   `MIN(events.timestamp)` for that account.
4. Median signup→first-event duration is computed over only the accounts that
   reached the last stage (do NOT let accounts that never converted drag the
   median).
5. Accounts created before a configurable lookback window (default: all time)
   are all included; revoked keys still count as "key created".

**Verify**: `cd apps/web && bun test test/admin-funnel.test.ts` → tests exist
and FAIL (the function doesn't exist yet).

### Step 2: Implement the funnel core in `admin.ts`

Add a DB-parameterized core (mirroring the `setWeeklyDigestForAccount`
pattern):

```ts
export interface OnboardingFunnel {
  accounts: number; // app_accounts rows
  withKey: number; // accounts with >= 1 api_keys row (revoked counts)
  withEvents: number; // accounts with >= 1 events row
  /** Median hours from app_accounts.created_at to first api_keys.created_at,
   *  over accounts with a key. null when no account has a key. */
  medianHoursToKey: number | null;
  /** Median hours from app_accounts.created_at to MIN(events.timestamp),
   *  over accounts with events. null when none. */
  medianHoursToFirstEvent: number | null;
}

export async function getOnboardingFunnel(
  db: BunSQLDatabase<typeof schema>,
): Promise<OnboardingFunnel>;
```

Implementation notes:

- Stage counts are three cheap aggregate queries; run them in one
  `Promise.all` like `getAdminOverview` does.
- For the medians, fetch per-account `createdAt`, first-key `createdAt`
  (`MIN(api_keys.created_at) GROUP BY account_id`), and first-event timestamp
  (`MIN(events.timestamp) GROUP BY account_id`), then compute medians in JS.
  Median = middle element of the sorted durations (average of the two middles
  for even counts). Do not attempt SQL `percentile_cont` — PGlite compatibility
  is unverified, and account counts are small.
- Every aggregate goes through `count()` or `.mapWith(Number)` (see the string
  trap above).
- Extend the `AdminOverview` type and `getAdminOverview` to include
  `funnel: OnboardingFunnel`, OR expose a separate
  `getAdminFunnel = createServerFn({ method: "GET" })` gated by
  `requireAdmin()`. Prefer the separate server fn: it keeps the overview query
  cheap and the test surface clean.
- `requireAdmin()` already logs an audit line (`admin.ts:44-50`). Reuse it; do
  not add a second log.

**Verify**: `cd apps/web && bun test test/admin-funnel.test.ts` → all pass.

### Step 3: Render the funnel panel on the admin page

In `apps/web/src/routes/_authed/app/admin/index.tsx`:

- Load `getAdminFunnel()` alongside the overview (add it to the route `loader`;
  keep `assertAdmin` in `beforeLoad` untouched).
- Add a "Signup → first value" `Card` below the existing stat cards, showing:
  the three stage counts with conversion percentages between stages
  (e.g. "142 signed up → 96 created a key (68%) → 51 sent events (36%)"), and
  the two medians rendered as "median 3.2h to first event" (render ≥48h values
  in days, one decimal; render `null` as "—").
- Match the existing card markup and typography on that page exactly. Numbers
  that must align must use the tabular-nums convention the repo already
  established (see `todos/003-resolved-p1-missing-tabular-nums-on-stats.md` —
  read it and copy the class it used).
- Honor `docs/design.md` (the design charter) — no new colors or components.

**Verify**: `bun run check` (repo root) → exit 0.

### Step 4: Manual sanity pass

Run the web app locally (`cd apps/web && bun run dev`), sign in as an admin
email, and open `/app/admin`. Confirm the funnel card renders with the seeded
local data and that a non-admin account still gets bounced by the opaque
redirect.

**Verify**: visual check + `bun run check` still exit 0.

## Test plan

- New file `apps/web/test/admin-funnel.test.ts`, modeled after
  `apps/web/test/admin-overview.test.ts`.
- Cases: the five listed in Step 1, plus "empty database returns zeroed funnel
  with null medians".
- Verification: `cd apps/web && bun test` → all pass, including the new file.

## Done criteria

- [ ] `bun run check` exits 0
- [ ] `cd apps/web && bun test` exits 0; `admin-funnel.test.ts` covers the
      three-stage counts, both medians, and the empty-DB case
- [ ] `/app/admin` renders the funnel panel for an admin; non-admin redirect
      behavior unchanged
- [ ] No migration created (`git status` shows no changes under
      `apps/web/drizzle/` or wherever drizzle-kit outputs — there must be none)
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP conditions

- The excerpts above don't match the live code (drift since `7c78ce5`).
- You find yourself wanting a schema change (e.g. a `first_event_at` column).
  The whole point of this plan is that the data already exists. STOP.
- A step's verification fails twice after a reasonable fix attempt.
- `apps/web/test/admin-overview.test.ts` does not exist or has a completely
  different harness than described — report what you found instead of
  inventing a new test harness.

## Maintenance notes

- `admin.ts:10` warns that query shapes are mirrored in tests; keep
  `admin-funnel.test.ts` in sync with any future change to the funnel queries.
- When plan 003 (setup verifier) lands, this funnel is how you measure its
  impact — compare `medianHoursToFirstEvent` before/after.
- If `api_keys.lastUsedAt` is ever replaced by a different "first ingest"
  signal, update stage 3's definition. It currently uses
  `MIN(events.timestamp)`, which is independent of `lastUsedAt`; keep it that
  way (retention deletes old events, so very old accounts will eventually
  fall out of stage 3 — acceptable for an operator funnel, but note it in the
  UI copy as "accounts with events in retained history" if it becomes
  confusing).
