# Web performance playbook

Blockrate has three performance surfaces with different success criteria. Optimize
them independently and never trade measurement correctness for a faster-looking
benchmark.

| Surface           | Primary budget                                                                 |
| ----------------- | ------------------------------------------------------------------------------ |
| `packages/core`   | tiny browser payload, low runtime/network overhead, correct provider detection |
| `packages/server` | ingestion latency/throughput and bounded dashboard queries                     |
| `apps/web`        | public and authenticated Core Web Vitals, origin latency, client bundle size   |

## Product invariants

Performance work must preserve these load-bearing behaviors:

- The client reports to a first-party endpoint. Posting directly to blockrate.app would
  bias the dataset toward unblocked visitors.
- Provider probes retain their verified HTTP method, URL, CORS behavior, and post-load
  shape checks.
- The three-second probe delay and `sessionDedup: false` defaults are deliberate product
  semantics, not accidental latency to remove.
- PostgreSQL aggregate values are coerced to numbers before calculating rates.
- A smaller bundle that changes the measured population or inverts a provider result is
  a regression.

## Measurement protocol

### OSS client

Record the built bytes for every published subpath, both raw and gzip/brotli where
appropriate. Exercise the provider-shape suite and live smoke test with performance
marks around probe scheduling, completion, and reporting. Measure the customer's
first-party request path, not an artificial direct post to the hosted service.

The README's 1.6 KB statement is a dated release claim. Enforce an explicit build
budget and update the claim only from the publish artifact.

### Hosted web app

Use representative public routes (`/`, `/demo`, `/docs`, `/pricing`, `/report`, and a
provider page) plus authenticated dashboard/settings routes. Run five iterations with
the same account, data, device, and network; preserve the first as cold and report the
median of the remaining four as warm.

Capture:

- document response start/TTFB and server timings;
- FCP, LCP, CLS, request/transfer totals, and DOM size;
- Event Timing/INP plus wall-clock action-to-ready latency for navigation, filtering,
  date-range changes, and dialogs;
- long tasks and long animation frames;
- eager entry size, route chunks, and hydrated network requests;
- cache headers and public source-map exposure.

Use a non-production environment when it matches production. Otherwise keep production
checks read-only and never create alert, billing, or ingestion data solely for a trace.
Store trace/auth artifacts mode `0600` and delete credentials/cookies afterward.

### Ingestion server

Measure accepted events per second, p50/p95 response latency, database write batches,
retention/alert/digest sweep duration, and memory under a realistic provider/event
mix. Keep SQLite and Postgres baselines separate.

## Diagnosis order

1. Origin and database round trips.
2. Delivery/cache behavior.
3. Eager client dependency graph.
4. Rendering/DOM/image/font work.
5. Interaction main-thread cost.

An excellent INP candidate can coexist with a slow async navigation. Report both Event
Timing and action-to-ready latency.

## Proven patterns already present

- The router preloads on intent.
- Auth initialization was moved behind dynamic imports so Better Auth does not inflate
  anonymous pages.
- The Latin Geist subset is explicitly preloaded to reduce font discovery delay and
  layout shift.
- Public JSON, badge, robots, sitemap, and related machine-readable responses have
  deliberate cache windows.
- Retention groups deletes by plan rather than issuing one deletion per account.

Keep these patterns and test their production output rather than adding duplicate
configuration.

## Candidate improvements

### Add build-output budgets

- Gate each `packages/core` public subpath by raw and compressed size.
- Gate the hosted app's anonymous entry and authenticated preload separately.
- Walk the static dependency graph instead of matching generated chunk names.
- Fail when server/database/auth implementation markers enter anonymous client chunks.
- Fail when public source maps ship unintentionally.

### Instrument origin work

Add server-only timings for auth, account resolution, dashboard aggregates, trend
queries, and public report/index queries. Coalesce request-scoped auth/account promises
only when traces prove repeated work; key them by `Request`, never global account state.
Parallelize independent aggregates while preserving account/API-key scoping.

### Verify delivery on the platform that serves it

`apps/web` deploys through Nitro/Railway, not Cloudflare static assets. Do not copy a
Workers `_headers` file and assume it works. Inspect Nitro output and verify the live
hashed asset response. Only content-hashed files may receive one-year immutable cache
headers; HTML, auth, APIs, and report data must not.

### Bound dashboards with real data

Profile provider lists, trend points, alerts, and public index pages at realistic
account sizes. Prefer server pagination/range queries when the database already owns
filtering and totals. Preserve CSV/report completeness and make bulk/selection semantics
explicit.

## React Doctor

React Doctor is relevant only to the React hosted app and is supplementary. Exclude
generated output, dependencies, and stale worktrees; it is not a replacement for core
payload budgets, provider smoke tests, production bundle inspection, or runtime traces.

## Completion gates

1. Run `bun run check`, core/server tests, hosted-app tests, the production build, and
   the live provider smoke test when publishing the client.
2. Inspect publish tarballs and hosted production output.
3. Deploy through the normal environment and repeat the same route/interaction trace.
4. Verify cache headers and source-map policy on the deployed revision.
5. Record date, commit, environment, data volume, and cold/warm methodology beside all
   baselines.
