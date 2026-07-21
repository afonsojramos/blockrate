# Plan 003: Add a `blockrate-init` scaffolding CLI and a first-event checklist state

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 7c78ce5..HEAD -- packages apps/web/src/routes/_authed/app/index.tsx examples`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (a CLI that writes into user projects must be conservative)
- **Depends on**: none. Soft relationship with plan 001: land after it so the
  funnel can measure this plan's impact on time-to-first-event.
- **Category**: direction
- **Planned at**: commit `7c78ce5`, 2026-07-21

## Why this matters

The strategy (`docs/launch-strategy.md` §6.4) names the first-party reporter
requirement as the top onboarding drop-off: correct measurement demands a
first-party endpoint, which is more setup than "paste one script tag." The
fastest way to cut time-to-first-block-rate is a scaffolder that writes the
correct server route for the user's framework (the route shapes already exist
as adapters in `packages/core/src/`) plus a dashboard state that tells the
user whether their endpoint has delivered its first event yet. This plan
ships both: a `blockrate-init` CLI and a first-event checklist card on the
dashboard.

## Current state

- Framework adapters (the route shapes to scaffold) live in
  `packages/core/src/{next,sveltekit,tanstack-start,remix,nuxt,astro}/` and
  all wrap `createBlockRateHandler` from `packages/core/src/handler.ts`. The
  canonical usage, from the root `README.md`:

  ```ts
  // app/api/block-rate/route.ts
  import { createBlockRateHandler } from "blockrate/next";

  export const POST = createBlockRateHandler({
    forward: { apiKey: process.env.BLOCKRATE_API_KEY! },
  });
  ```

- `examples/` already contains minimal integrations per framework (`nextjs`,
  `tanstack-start`, `sveltekit`, `nuxt`, `solidstart`, `vanilla`,
  `cloudflare-worker`, `gtm`). These are the source of truth for what the
  CLI should write — read the relevant example before writing each template.
- `packages/core/package.json` — published as `blockrate`, currently has no
  `bin`. The monorepo is Bun workspaces (root `package.json`:
  `"workspaces": { "packages": ["packages/*", "apps/*", "examples/*"] }`).
- `packages/server/src/cli.ts` — an existing CLI entry (for
  `blockrate-server`); read it for the repo's CLI conventions (arg parsing,
  output style, shebang).
- Dashboard: `apps/web/src/routes/_authed/app/index.tsx` is the overview
  page; server data comes from `getOverviewData` in
  `apps/web/src/server/stats.ts`.
- The "has this account received any event?" signal already exists without a
  migration: `api_keys.lastUsedAt` (touched best-effort on every successful
  ingest — see `apps/web/src/routes/api/ingest.ts`, pipeline step 8) and
  `usage_counters` (incremented per ingest). Use `usage_counters` (an
  aggregate) as the authoritative check, not `lastUsedAt` (best-effort,
  fire-and-forget).
- Plan gating convention: `apps/web/src/lib/plans.ts` exports `PLANS` and
  `getPlan`; features gate on plan fields (e.g. `remediationPlaybook`). The
  checklist card is NOT plan-gated — it exists to get free users to value.
- UI conventions: shadcn-style `Card` components; design charter is
  `docs/design.md` — read it before writing any UI.

## Commands you will need

| Purpose    | Command                                  | Expected on success |
| ---------- | ---------------------------------------- | ------------------- |
| CLI local  | `bun packages/cli/src/index.ts --help`   | prints usage        |
| CLI tests  | `bun test packages/cli`                  | all pass            |
| Core tests | `bun test packages/core packages/server` | all pass            |
| Web tests  | `cd apps/web && bun test`                | all pass            |
| Full gate  | `bun run check` (repo root)              | exit 0              |

## Scope

**In scope**:

- `packages/cli/` (new workspace package, published name `blockrate-init`,
  bin `blockrate-init`)
- `apps/web/src/server/stats.ts` — extend `getOverviewData` with a
  `hasReceivedEvents: boolean`
- `apps/web/src/routes/_authed/app/index.tsx` — checklist card
- `apps/web/test/` — one new DB-real test for the flag
- Root `README.md` — one short mention of the CLI

**Out of scope**:

- Publishing the CLI to npm (release automation is a separate decision;
  leave the package publishable but do not publish).
- Interactive prompts that _modify existing files_ (e.g. editing the user's
  layout to inject the client snippet). v1 only **creates new files** and
  **prints** the client snippet for the user to paste. Auto-editing user
  code is how scaffolding tools lose trust.
- `packages/core` adapter code — the templates reference the adapters as
  they are; do not change adapter APIs.
- GTM / Cloudflare Worker / vanilla scaffolds (the worker already has a
  3-minute manual flow; v1 covers the in-app-route frameworks only).

## Git workflow

- Branch: `feat/blockrate-init-cli`
- Conventional commits, atomic, e.g. `feat(cli): scaffold blockrate-init
package`, `feat(web): show first-event checklist state on dashboard`.

## Steps

### Step 1: Scaffold `packages/cli`

- `packages/cli/package.json`: name `blockrate-init`, `"bin": {
"blockrate-init": "./dist/index.js" }`, `private: false`, version `0.1.0`,
  no runtime dependencies (arg parsing by hand, like
  `packages/server/src/cli.ts` — zero-dep is a stated product value: the
  root README advertises "Tiny, zero-dependency").
- `build` script producing `dist/index.js` via `bun build --target node`,
  preserving a `#!/usr/bin/env node` shebang.
- Run `bun install` at the repo root so the workspace links.

**Verify**: `bun packages/cli/src/index.ts --help` prints usage.

### Step 2: Framework detection + route scaffolding

Behavior:

1. `blockrate-init` (no args) reads the nearest `package.json` and detects
   the framework from dependencies: `next` → next, `@tanstack/react-start`
   → tanstack-start, `@sveltejs/kit` → sveltekit, `nuxt` → nuxt,
   `@remix-run/*` → remix, `astro` → astro. Unknown → print all supported
   frameworks and exit 0 with guidance (never error out on an unrecognized
   project).
2. `--framework <name>` overrides detection.
3. Writes the reporter route file for that framework, modeled byte-for-byte
   on the corresponding `examples/<framework>` integration. Refuse to
   overwrite an existing file (print the path and exit 1) — never clobber
   user code.
4. Prints: the env var to set (`BLOCKRATE_API_KEY`), the first-party path
   the route serves, and the client snippet (`new BlockRate({ reporter: (r)
=> navigator.sendBeacon("<path>", JSON.stringify(r)) })`) pointing at
   the first-party path — never at `blockrate.app` (the load-bearing
   invariant from `packages/core/README.md`).

Templates: one per framework under `packages/cli/templates/`, kept as plain
text files so they are auditable; each carries a header comment pointing
back to `examples/<framework>` as the source of truth.

**Verify**: in a scratch directory with a fake `package.json` containing
`next`, `bun packages/cli/src/index.ts` creates the route file; re-running
refuses to overwrite; `--framework sveltekit` writes the sveltekit route.

### Step 3: Tests for the CLI

`packages/cli/test/` using `bun:test`, running the CLI against temp dirs
with fixture `package.json` files. Cases: each supported framework
detection; unknown framework exits 0 with guidance; existing file is never
overwritten; `--framework` override beats detection; printed client snippet
contains a first-party relative path and never `blockrate.app`.

**Verify**: `bun test packages/cli` → all pass.

### Step 4: `hasReceivedEvents` on the dashboard

- In `apps/web/src/server/stats.ts`, extend `getOverviewData`'s return with
  `hasReceivedEvents: boolean`, computed from `usage_counters` (any row for
  the account with `event_count > 0`). Reuse the query patterns in
  `apps/web/src/lib/quota.server.ts` (`getUsage` lives there).
- DB-real test in `apps/web/test/` (model after the existing stats or
  remediation tests): account with no counters → false; account with a
  positive counter → true.

**Verify**: `cd apps/web && bun test` → all pass.

### Step 5: Checklist card on the overview page

In `apps/web/src/routes/_authed/app/index.tsx`: when
`hasReceivedEvents === false`, render a Card at the top of the dashboard
with the three onboarding stages — "1. Create an API key ✓ (the user is on
the dashboard, so this is done) / 2. Add the reporter route (run `bunx
blockrate-init`) / 3. Send your first event — waiting…" — and a link to
`/docs`. When true, render nothing extra (the dashboard already shows
data). Match `docs/design.md` tokens and the existing empty-state copy
style (commit `1a2c66c` aligned empty-state copy with PLANS; read the
current empty state first and reuse its tone).

**Verify**: `bun run check` exit 0; manual `cd apps/web && bun run dev`
shows the card on a fresh account and not after seeding an event.

### Step 6: Docs touch-up

One short paragraph in root `README.md` under "Quick start (OSS library)"
mentioning `bunx blockrate-init` as the scaffolding shortcut.

## Test plan

- `packages/cli/test/` — cases from Step 3.
- `apps/web/test/` — `hasReceivedEvents` true/false cases (Step 4).
- Existing suites must stay green: `bun test packages/core
packages/server` and `cd apps/web && bun test`.

## Done criteria

- [ ] `bun run check` exits 0
- [ ] `bun test packages/cli packages/core packages/server` passes
- [ ] `cd apps/web && bun test` passes with the new `hasReceivedEvents`
      tests
- [ ] CLI refuses to overwrite existing files; never prints a
      `blockrate.app` reporter URL
- [ ] Dashboard shows the checklist card iff `hasReceivedEvents` is false
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- Scaffolding a framework's route correctly requires changing that
  framework's adapter in `packages/core` — adapters are out of scope;
  report the gap and ship the CLI without that framework's template.
- You feel the need to edit the user's existing files (client snippet
  injection). v1 is create-only by design; report the desire as follow-up.
- `packages/server/src/cli.ts` does not exist or uses a CLI framework —
  re-evaluate the zero-dep constraint with the operator before adding a
  dependency.
- Verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Template rot is the standing risk: when an adapter's API changes, its
  template in `packages/cli/templates/` must change in the same PR.
  Consider a test that imports each adapter's public symbol the template
  references.
- `packages/core`'s `build` script enumerates subpaths by hand; if a new
  framework adapter is added, add a matching template in the same change.
- Follow-up explicitly deferred: client-snippet injection, `init` for the
  Cloudflare Worker flow, npm publish automation, and a `blockrate-init
--verify` mode that pings the hosted API to confirm first event (needs a
  public per-key status endpoint that doesn't exist yet — candidate for a
  future plan).
