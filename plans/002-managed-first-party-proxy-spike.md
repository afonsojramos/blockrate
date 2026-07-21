# Plan 002: Design + spike a managed first-party proxy (Phase 3 remediation)

> **Executor instructions**: This is a **design/spike plan**, not a
> build-everything plan. The deliverables are (1) a decision-quality design
> document and (2) a single-provider proof-of-concept worker that validates the
> riskiest assumption. Do NOT build the production feature. Run every
> verification command. If anything in the "STOP conditions" section occurs,
> stop and report — do not improvise. When done, update the status row for this
> plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 7c78ce5..HEAD -- examples/cloudflare-worker apps/web/src/server/remediation.ts apps/web/src/lib/providers.ts docs/launch-strategy.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: L
- **Risk**: MED (product/ops risk, not code risk — the spike itself is LOW)
- **Depends on**: none (plan 001's funnel data will inform rollout timing, but
  is not a blocker)
- **Category**: direction
- **Planned at**: commit `7c78ce5`, 2026-07-21

## Why this matters

The committed product strategy (`docs/launch-strategy.md`, §7) sequences
blockrate as measurement (Phase 1, shipped) → monitoring/alerting (Phase 2,
shipped) → **remediation**, which it calls "where real willingness-to-pay
lives." Today the Remediation Playbook (`apps/web/src/server/remediation.ts`)
ranks each account's most-blocked providers and then tells the user to go build
a reverse proxy themselves (`apps/web/src/routes/_authed/app/remediate.tsx:128`
"The general fix: serve it first-party"). That DIY hand-off is the product gap:
a managed, per-provider first-party proxy would close a measurable
measure → fix → verified-recovered loop. But proxying third-party CDNs carries
real ToS, correctness, and operational risk, and it makes blockrate part of
customers' critical analytics path. This spike exists to answer the hard
questions _before_ committing to the build.

## Current state

- `examples/cloudflare-worker/worker.ts` — a deployable worker that hosts the
  blockrate **reporter** endpoint first-party. This is the architectural
  exemplar for the spike: same shape (env secrets, `wrangler deploy`, route on
  the customer's domain), but the spike worker proxies a _provider CDN_ instead
  of the blockrate ingest API. Read it fully first.
- `apps/web/src/lib/providers.ts` (351 lines) — per-provider metadata including
  vetted `Remediation` records; `MIN_SAMPLE_CHECKS` and `applyFloor` live here
  too. The `Remediation` metadata is what the Playbook renders.
- `packages/core/src/providers/` — the 10 built-in detectors
  (`posthog.ts`, `ga4.ts`, `segment.ts`, `optimizely.ts`, …). Each pairs a
  post-load global check with a CDN probe URL.
- `packages/core/test/probe-smoke.test.ts` — the live-CDN smoke list with the
  exact probe URLs and per-provider fetch strategies (HEAD + Origin for most;
  CORS GET for meta-pixel). These URLs are the candidate upstreams for
  proxying.
- Strategy doc constraints to honor, quoted from `docs/launch-strategy.md`:
  - §5: blockrate's neutrality is a differentiator — "keep your stack, measure
    what's blocked, decide what to fix."
  - §7 Phase 3: "extend toward a managed first-party proxy / server-side
    forwarding for the providers shown as blocked. Measure leads to recommend
    leads to remediate."
- Repo ground rule (from `CLAUDE.md`): the per-provider block rate "is the
  product" and must never be silently wrong. Any remediation feature that
  changes what the number _means_ must be designed so the dashboard can never
  present a recovered-events figure as if it were a measured block rate.

## Commands you will need

| Purpose             | Command                                        | Expected on success |
| ------------------- | ---------------------------------------------- | ------------------- |
| Smoke-test baseline | `cd packages/core && bun run test:smoke`       | all providers pass  |
| Worker dev server   | `cd examples/proxy-spike && bunx wrangler dev` | serves on localhost |
| Full gate           | `bun run check` (repo root)                    | exit 0              |

## Suggested executor toolkit

- If a `wrangler` or `cloudflare` skill is available in your environment, load
  it before writing the worker — it covers current wrangler config syntax.
- Reference: Cloudflare Workers fetch/proxy docs for streaming
  request/response passthrough.

## Scope

**In scope**:

- `docs/brainstorms/2026-07-21-managed-first-party-proxy.md` (create — the
  design document; this directory holds requirement/brainstorm docs)
- `examples/proxy-spike/` (create — single-provider PoC worker + README)
- Nothing else.

**Out of scope** (do NOT touch):

- `packages/core`, `packages/server` — no library changes. If the spike
  appears to _require_ a library change, that is a design-doc finding, not a
  code change. Record it in the doc.
- `apps/web` — no dashboard work, no plan gating, no billing. Rollout design
  goes in the document only.
- `examples/cloudflare-worker/` — the reporter worker is shipped and
  documented; do not modify it. Your spike is a sibling directory.
- Multi-provider proxying, caching layers, custom-domain automation, billing
  integration. All explicitly deferred to the (future) build plan.

## Git workflow

- Branch: `spike/managed-first-party-proxy`
- Conventional commits, e.g. `docs: add managed first-party proxy design
spike`, `feat(examples): add single-provider proxy spike worker`.
- Do NOT publish any npm package. The spike worker is an example, never
  published.

## Steps

### Step 0: Baseline

`cd packages/core && bun run test:smoke` — all providers must pass. If any
fail, STOP: the probe landscape has shifted and the design assumptions need
re-evaluation first.

### Step 1: Build the single-provider PoC worker

Create `examples/proxy-spike/` containing a wrangler worker that
reverse-proxies **PostHog only** (chosen because its upstream is a simple
static asset + ingestion API on `us.i.posthog.com`, it is consistently near
the top of block lists, and the repo already probes it).

Requirements for the worker:

- Mounted on a first-party path (e.g. `https://metrics.example.com/ph/`).
- Passes through `GET /static/array.js` (the loader) and `POST` capture
  endpoints to `us.i.posthog.com`, streaming request and response bodies
  (no buffering whole payloads into memory).
- Strips/sets headers correctly: sets `Host` for the upstream, forwards the
  client IP via the header PostHog documents, removes hop-by-hop headers, and
  never caches `POST` responses.
- A wrangler `route` on the operator's own domain, exactly like
  `examples/cloudflare-worker/wrangler.toml` does.
- A README with the same "3-minute setup" shape as
  `examples/cloudflare-worker/worker.ts`'s header comment.

**Verify**: `bunx wrangler dev` serves the worker; `curl -I
http://localhost:8787/ph/static/array.js` returns a 200 with PostHog's asset;
a `curl -X POST` to the capture path returns PostHog's expected status.

### Step 2: Verify the detection question empirically

This is the spike's riskiest assumption and the reason the PoC exists.

blockrate's detector probes the **real** CDN (`us.i.posthog.com/static/array.js`
per `probe-smoke.test.ts`). When a customer serves PostHog through a
first-party proxy, the direct-CDN block rate _does not change_ — blocked users
still block the direct CDN, the customer just no longer depends on it. Answer
in the design doc, with evidence from the PoC:

1. What _should_ the dashboard show post-remediation? Options to evaluate:
   (a) keep reporting the population block rate of the direct CDN (honest,
   unchanged by remediation — the number means "what you'd lose unproxied");
   (b) add an "effective loss" signal by having the detector probe through the
   customer's configured proxy path as well; (c) both, clearly labeled.
2. Does probing through the PoC proxy actually work from a browser (CORS
   headers on the proxied response)? Test this with a real fetch from a page
   and record the result.
3. Can blockrate detect _that_ a provider is being served first-party
   (e.g. the post-load global exists but the direct CDN probe is blocked)?
   Note that `packages/core`'s detector contract (`ProviderStatus =
"loaded" | "blocked"`, see `packages/core/src/types.ts`) may need a third
   state or a companion signal — this is a library-change finding for the
   doc, not code to write.

**Verify**: the doc contains a decision on (1) backed by the empirical
results of (2) and (3).

### Step 3: Write the design document

`docs/brainstorms/2026-07-21-managed-first-party-proxy.md`, matching the
style of the existing brainstorm docs in that directory (read
`docs/brainstorms/2026-04-16-first-party-reporter-requirements.md` first for
format). Must contain:

1. **Problem and target user** — one paragraph; reference the Playbook's
   existing "blocked checks" ranking as the demand signal.
2. **Per-provider proxyability matrix** — one row per built-in provider:
   upstream URL(s), static-asset-only vs. ingestion-API, regional endpoints
   (PostHog US/EU), documented customer-proxy support (PostHog publicly
   documents reverse-proxying; Plausible's docs are a reference for the
   pattern), ToS red flags, websocket/SSE requirements. It is fine and
   expected that some providers come out "do not proxy."
3. **The measurement semantics decision** from Step 2, including the "number
   must never be wrong" analysis.
4. **Filter-list counter-risk** — what happens when a proxy path pattern
   (`/ph/`) itself lands on EasyPrivacy; cite that this is exactly the
   failure mode the first-party-reporter invariant was built against
   (`packages/core/README.md`, "Why the reporter endpoint must be
   first-party").
5. **Operational model** — who runs the worker (customer-deployed from a
   template vs. blockrate-managed), custom domains, uptime blast radius
   (blockrate becoming critical path for customer analytics), and what that
   implies for plan gating in `apps/web/src/lib/plans.ts` (design only — do
   not edit the file).
6. **Phased build proposal** — what a build plan would contain, with rough
   sizing, and explicit go/no-go criteria.
7. **Rejected alternatives** — at minimum: "blockrate-hosted shared proxy
   domain" (violates first-party invariant the moment it is listed) and "do
   nothing / keep DIY guidance" (status quo, leaves Phase 3 revenue
   unrealized).

**Verify**: `bun run check` exits 0 (markdown isn't linted, but the examples
workspace must still typecheck); the doc exists with all 7 sections.

### Step 4: Self-review against the strategy

Re-read `docs/launch-strategy.md` §5–§7 and confirm the design is consistent
with the positioning (vendor-neutral measurement first; remediation as an
option, never a bundled lock-in). Note any tension explicitly in the doc.

## Test plan

- The PoC worker needs no unit tests (it is a spike), but its README must
  contain copy-paste `curl` verification commands that you have actually run
  and whose output is pasted into the PR description.
- The design doc's proxyability matrix must be fact-checked against
  `packages/core/test/probe-smoke.test.ts`'s URL list — every built-in
  provider appears in the matrix.

## Done criteria

- [ ] `cd packages/core && bun run test:smoke` passes (baseline recorded)
- [ ] `examples/proxy-spike/` exists; `bunx wrangler dev` + the README's curl
      commands verify static-asset and capture-POST passthrough
- [ ] `docs/brainstorms/2026-07-21-managed-first-party-proxy.md` exists with
      all 7 sections, including the measurement-semantics decision and the
      per-provider matrix
- [ ] No changes to `packages/*` or `apps/web` (`git status`)
- [ ] `bun run check` exits 0
- [ ] `plans/README.md` status row updated

## STOP conditions

- The smoke baseline fails — the probe landscape shifted; reassess first.
- You find yourself editing `packages/core` or `apps/web`. This plan produces
  a document and an example only.
- PostHog's upstream behavior makes even the single-provider proxy
  impractical (e.g. required headers that cannot be set from a worker) —
  record the finding and pick the next-simplest provider from the smoke
  list, noting the substitution in the doc.
- Empirical results in Step 2 contradict the assumption that proxy
  passthrough is detectable/measure-safe — that is a valid spike outcome;
  write it up as "no-go" with evidence rather than forcing a yes.

## Maintenance notes

- The proxyability matrix will rot as providers change CDNs — the daily
  `.github/workflows/smoke.yml` is the early-warning system; if a build plan
  follows, it must extend smoke coverage to the proxy paths.
- If a build plan is commissioned afterward, its first step should be the
  library-level measurement-semantics change identified in Step 2, gated
  behind new tests in `packages/core/test/provider-shapes.test.ts`'s style.
