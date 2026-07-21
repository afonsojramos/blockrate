# Plan 005: Publish a live detector-health page

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 7c78ce5..HEAD -- apps/web/src/routes apps/web/src/server packages/core/test/probe-smoke.test.ts packages/core/src/providers`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `7c78ce5`, 2026-07-21

## Why this matters

The strategy (`docs/launch-strategy.md` §3) identifies "trust in the
number" as blockrate's real moat: naive detectors silently invert the rate,
and the repo's whole correctness apparatus (provider-shape tests, daily
live-CDN smoke tests) exists to defend against it. That defense is
currently invisible — the daily smoke suite runs in GitHub Actions and only
the maintainer sees failures. A public detector-health page turns an
existing cost center into marketing ("we probe every provider's CDN daily
and show you the receipts") and gives customers a place to check before
blaming their own integration. The cheapest honest implementation needs **no
database and no CI changes**: the page's server loader probes the CDNs
on-demand, cached.

## Current state

- `packages/core/test/probe-smoke.test.ts` — the canonical provider-URL
  list and per-provider fetch strategy, in a `TARGETS` array (lines
  ~36-58): 11 targets (10 providers, PostHog has US + EU), each
  `{ name, url, strategy }` where strategy is `"head"` (HEAD + Origin,
  expect 2xx/3xx/4xx + CORS header) or `"get-range"` (meta-pixel only —
  Meta refuses CORS on HEAD but serves it on GET; see the header comment
  lines 16-23). The page must use THE SAME URLs and strategies; copy the
  array and the `verify()` helper logic, do not reinvent them.
- `.github/workflows/smoke.yml` — the daily 13:00 UTC run of that test.
  The page should link to it (and optionally embed the Actions badge SVG)
  but must NOT depend on CI writing anything anywhere.
- `apps/web/src/server/hero-stats.ts` — the caching exemplar: a public,
  account-free server function with an in-process TTL cache
  (`let cache: { at: number; value } | null`, `CACHE_TTL_MS`). Copy this
  pattern exactly, including its comment style.
- Public route exemplars: `apps/web/src/routes/report.tsx`,
  `apps/web/src/routes/block-rate[.]json.ts` (a public JSON endpoint), and
  `apps/web/src/routes/block-rate/$provider/index.tsx`. File-route naming
  uses TanStack Router conventions (`foo[.]bar.ts` for dotted paths).
- `apps/web/src/routes/sitemap[.]xml.ts` — public pages are enumerated
  here; a new public page should be added (check how `report` and
  `block-rate/$provider` entries are done).
- Design charter: `docs/design.md` — read before writing any UI. Public
  pages must match the site's existing tokens and voice.
- `llms[.]txt.ts` exists; if it enumerates public data surfaces, add the
  new page there too (read it and decide).

## Commands you will need

| Purpose   | Command                                     | Expected on success |
| --------- | ------------------------------------------- | ------------------- |
| Tests     | `cd apps/web && bun test`                   | all pass            |
| Full gate | `bun run check` (repo root)                 | exit 0              |
| Manual    | `cd apps/web && bun run dev`, open the page | rows render         |

## Scope

**In scope**:

- `apps/web/src/server/detector-health.ts` (new — probe + cache logic)
- `apps/web/src/routes/status.tsx` or `apps/web/src/routes/block-rate/status.tsx`
  (new — the public page; pick whichever fits the existing IA after reading
  `report.tsx` and the `block-rate/` directory, and state your choice in the
  PR description)
- `apps/web/src/routes/sitemap[.]xml.ts` — add the route
- `apps/web/test/detector-health.test.ts` (new)
- Optionally `apps/web/src/routes/llms[.]txt.ts` — one line if it lists data
  surfaces

**Out of scope**:

- **No database table, no migration, no CI workflow changes.** The
  on-demand-probe-with-cache design is deliberate. A historical uptime
  record (persisted results, incident history) is a possible follow-up, not
  this plan.
- `packages/core` — the smoke test is the source of truth to copy from; do
  not move or refactor it in this plan.
- Alerting the maintainer off this page (the GHA failure notification path
  already exists).
- Probing customer-defined custom providers — built-ins only.

## Git workflow

- Branch: `feat/detector-health-page`
- Conventional commits, e.g. `feat(web): add live detector-health page`.

## Steps

### Step 1: Probe module with cache

Create `apps/web/src/server/detector-health.ts`:

- Copy the `TARGETS` array and per-strategy fetch logic from
  `packages/core/test/probe-smoke.test.ts` (keep the same per-provider
  strategy semantics; add a code comment naming the source file and
  instructing future editors to keep the two in sync).
- `async function checkDetectorHealth(): Promise<HealthReport>` where
  `HealthReport = { checkedAt: string; targets: { name, ok, status, hasCors,
latencyMs }[]; allOk: boolean }`. Run the 11 probes with
  `Promise.allSettled`, per-target timeout ~5s (a hung CDN must not hang the
  page), and never throw — a failed probe is data (`ok: false`), not an
  error page.
- Cache the report in-process with a 15-minute TTL, mirroring
  `hero-stats.ts`'s cache pattern. Serve stale on upstream total failure if
  simple; do not over-engineer.
- Export a `getDetectorHealth = createServerFn({ method: "GET" })` wrapper —
  public, no auth (like `getHeroStats`).
- Unit test (`apps/web/test/detector-health.test.ts`): mock `fetch` to
  assert (a) meta-pixel uses GET while others use HEAD, (b) a target
  without the CORS header reports `ok: false` rather than throwing, (c) a
  rejected fetch reports `ok: false`, (d) `allOk` is the AND of targets.

**Verify**: `cd apps/web && bun test test/detector-health.test.ts` → all
pass.

### Step 2: The public page

Create the route (see Scope for placement). Content:

- Heading + one-paragraph explanation: blockrate's detectors depend on
  these CDN endpoints and CORS policies; this page probes them the same way
  the daily CI smoke suite does; link to the methodology/docs and to the
  GitHub workflow.
- A table: provider, endpoint host (not the full URL — full URLs are fine
  too, they're public knowledge in the OSS repo), status (ok/degraded),
  latency, last checked (from `checkedAt`, "x minutes ago").
- An overall banner: "All detectors healthy" vs "N degraded — block rates
  for these providers may under-report 'loaded'."
- Match the existing public pages' layout/tokens (`report.tsx` is the
  closest sibling). Numbers use the tabular-nums convention
  (`todos/003-resolved-p1-missing-tabular-nums-on-stats.md`).
- Add the route to `sitemap[.]xml.ts`.

**Verify**: `bun run check` exit 0; `bun run dev` shows the page with real
probe results; disable network or stub a failure to confirm the degraded
banner renders.

### Step 3: Cross-links

One link from `/docs` (find the methodology/first-party section) to the new
status page, and optionally the GitHub Actions badge SVG pointing at
`smoke.yml`. Keep it to two small edits.

## Test plan

- `apps/web/test/detector-health.test.ts` — the four cases in Step 1.
- Full suite: `cd apps/web && bun test` → all pass.

## Done criteria

- [ ] `bun run check` exits 0
- [ ] `cd apps/web && bun test` exits 0 with the new tests
- [ ] Page renders live probe results; a simulated failure shows the
      degraded state rather than an error page
- [ ] Route appears in the sitemap; no DB migrations; no workflow changes
      (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `probe-smoke.test.ts` no longer contains the `TARGETS` array described
  (drift) — re-derive from the live file and note the difference in the PR.
- Probing from the deployed host turns out to be blocked by egress policy
  (Railway outbound is normally open; if not, STOP and report — the
  fallback design is CI-pushed results, which is a bigger plan).
- Verification fails twice after a reasonable fix attempt.

## Maintenance notes

- The duplicated `TARGETS` array is a deliberate trade-off (moving it into
  `packages/core` would entangle the OSS package with the web app for one
  consumer). The comment in Step 1 is the guard; if a provider is added,
  both lists change in the same PR — consider a tiny test later that
  asserts the two name sets match.
- 11 probes × every 15 min per instance is negligible egress, but if the
  app ever runs multi-instance the caches are per-instance (same caveat as
  `hero-stats.ts`).
- Follow-up candidates (not this plan): persisted history + incident
  timeline; a `Retry-After`-aware stale-while-revalidate; embedding the
  page's JSON as another public API surface.
