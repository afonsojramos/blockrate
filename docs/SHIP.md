# Ship readiness

A one-page operator checklist for shipping `blockrate` (the npm package) and
`blockrate.app` (the hosted dashboard). Every item here closes a gap that
was once a real bug or a near-miss; if you remove an item, document why.

## What this product cannot get wrong

The headline number — **per-provider block rate** — is the entire value
proposition. If we report a customer is blocked at 18% when reality is 38%,
the dashboard is worse than no dashboard, because they'll trust it. Three
classes of bug invert the headline number silently:

1. **Detector misclassifies a blocked install as loaded.** The stub-vs-load
   conflation bug fixed in PR #5 was exactly this; the loader snippet runs
   even when the CDN is blocked, so any "is the global truthy?" check
   reports loaded for users who are in fact blocked. Guarded by
   `packages/core/test/provider-shapes.test.ts` (every provider, three
   shape states).
2. **CDN URL silently rots or drops CORS support.** The probe URLs are
   load-bearing — if `cdn.amplitude.com/libs/amplitude-9.js` returned a
   non-CORS redirect tomorrow, every Amplitude probe would throw and report
   blocked for the entire population. Guarded by the daily smoke workflow
   (`.github/workflows/smoke.yml`) and the gated
   `BLOCKRATE_SMOKE=1 bun test` script.
3. **Reporter endpoint gets blocklisted.** If the customer points the
   client at `blockrate.app` directly instead of their own first-party
   route, the moment that domain lands on EasyPrivacy the only events
   that arrive are the _un-blocked_ ones — silent inversion. Documented
   load-bearingly in `packages/core/README.md` ("Why the reporter
   endpoint must be first-party") and asserted via the
   `createBlockRateHandler({ forward: ... })` API shape.

## Pre-ship validation

Run before tagging a release of `blockrate` (npm) or before promoting an
`apps/web` build to `blockrate.app`:

```bash
# Format, lint, typecheck — same gates CI runs.
bun x oxfmt --check .
bun x oxlint .
cd apps/web && bun run typecheck

# Unit + integration tests across both packages.
cd packages/core && bun test
cd packages/server && bun test

# Live-CDN smoke. Required before npm publish; optional for web deploys.
# Hits every built-in provider's CDN URL with a real fetch and asserts
# CORS headers are present.
cd packages/core && bun run test:smoke
```

If smoke fails, do not publish. Investigate the failing CDN before pinning
a new probe URL — sometimes a CDN drops a path temporarily, and bumping
the probe to a less-stable URL makes the next failure worse.

## Per-customer integration checklist

For a customer adding `blockrate` to their app, verify in order:

- [ ] Reporter posts to a route on the customer's own origin (e.g.
      `/api/block-rate`), never directly to `blockrate.app` or any
      dedicated analytics host.
- [ ] `BLOCKRATE_API_KEY` is set in the server's environment, not in
      the browser bundle. Grep the customer's client output for
      `br_` prefixes — there should be zero matches.
- [ ] `forward.onError` is wired into the customer's existing logger.
      Without this, upstream 4xx/5xx and rate-limit drops are silent.
- [ ] `sampleRate` matches expected traffic — `1` for low-traffic apps,
      `0.1` or lower for high-traffic. The default is `1`, which can
      flood our ingest at scale.
- [ ] Cross-browser sanity check: load the page in (a) plain Chrome
      (no blocker), and (b) Chrome + uBlock Origin. The first should
      show 0 blocked; the second should show ≥6 blocked. If either is
      wrong, detection is broken.
- [ ] The customer's dashboard receives the events. Hit the customer's
      `/api/block-rate` route once via curl with a synthetic payload;
      verify it shows up under their tenant in the dashboard within a
      minute.

## Hosted-dashboard deploy

Required environment variables for `apps/web`:

| Var                     | Where it's used     | Notes                                  |
| ----------------------- | ------------------- | -------------------------------------- |
| `BETTER_AUTH_SECRET`    | session signing     | Min 32 chars. Rotate ⇒ all logged out. |
| `DATABASE_URL`          | Postgres connection | bun:sql driver since #4                |
| `STRIPE_SECRET_KEY`     | billing             | Live vs test selected by prefix        |
| `STRIPE_WEBHOOK_SECRET` | billing             | Per-environment                        |
| `RESEND_API_KEY`        | magic-link email    | Required for sign-in                   |

Deploy gate, in order:

1. `bun run check` (fmt + lint + typecheck) — **green**.
2. `bun test packages/core packages/server` — **green** (or exit 99 from
   PGlite cleanup, masked in CI).
3. `cd apps/web && NODE_ENV=production bun run build` — **green**.
4. Schema migrations applied to the target Postgres before deploy.
   Drizzle drift check: `cd apps/web && bun x drizzle-kit check` should
   show no pending changes against the live schema.
5. After deploy: hit `/health`, `/demo`, and `/api/block-rate` (with a
   synthetic payload) on the live URL.

## Rollback

- **Web app**: previous build is one Railway redeploy / one Vercel
  redeploy away. The schema is the only one-way door — never drop or
  rename columns in a single PR; do `add → backfill → switch reads →
remove writes → drop` across at least two deploys.
- **`blockrate` npm**: `npm deprecate blockrate@<bad-version>` with a
  message pointing at the prior good version. Customers pinning the bad
  version see the deprecation warning. We never `npm unpublish` after
  the 72-hour grace.

## Recurring health

- **Daily**: GitHub Actions runs `Smoke (live CDNs)`. Investigate any
  failure same-day. CDN URL rot is the single likeliest source of a
  silent population-wide misclassification.
- **Weekly**: glance at the dashboard's overall block-rate distribution
  per provider for our own (`service: "demo"`) tenant — if Optimizely
  or PostHog jumps from 30% to 95% week-over-week without an obvious
  cause (new EasyList rule, new browser default), suspect detector
  drift.
- **Per major-version of any provider**: re-verify the post-load global
  used in that provider's detector still exists. The fixtures in
  `packages/core/test/provider-shapes.test.ts` paraphrase the snippet
  shape; cross-check against the provider's current docs.

## Known limitations (don't ship a "fix" without thinking)

- **3-second `delay` default.** Probes don't fire until 3 s after page
  load, so users who bounce earlier are never observed. The reported
  rate is a "engaged-users" rate, not a "all-visitors" rate. Worth
  shortening now that post-load globals (PR #5) make a shorter delay
  safer, but it's a meaningful design call.
- **`sessionDedup` defaults to `false`.** Each `check()` is its own
  observation, so refresh-heavy users skew the rate upward. Customers
  who want session-level rates should set `sessionDedup: true`. We
  default to false for the consent-free promise (no `sessionStorage`
  writes). Documented in `types.ts:48`.
- **Latency uniformity in /demo.** Browsers/extensions batch
  blocked-fetch rejections into a single microtask flush, so all
  blocked providers show roughly the same latency in /demo. This is a
  browser artifact, not a bug; the diagnostic distinction we care
  about (fast-blocked ≪ 3000 ms timeout-blocked) is preserved.
- **`Image` probe for `meta-pixel`.** The fbq global sets `loaded = !0`
  on its own stub, so we can never gate on the global. The
  image-onerror probe is the only ground-truth signal.

## Incident playbook

If aggregate block rate flips for a provider population-wide:

1. Check the Smoke workflow's last run. CDN rot? Bump URL to the
   provider's current path; re-deploy.
2. Check whether the provider's loader snippet shape changed. Real-world
   snippets evolve; if the `__loaded` flag (or equivalent) is gone,
   update the detector and the fixture.
3. Check whether a new ad-block list (EasyList, EasyPrivacy) added a
   broader rule. This is a real signal, not a bug — but worth
   communicating to customers as a population shift.

If `blockrate.app` ingest stops receiving events:

1. Check `/api/health` on the deploy.
2. Check that the customer's `forward.onError` is firing — it'll tell us
   what they see (network vs upstream non-2xx).
3. Check rate-limit drops in server logs; high traffic + small bucket
   silently 429s the customer's forward.
