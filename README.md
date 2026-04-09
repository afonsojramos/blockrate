# blockrate

> **Know what your ad blockers are hiding from your analytics.** Measure the *per-provider* block rate of the third-party tools your app depends on — Optimizely, PostHog, GA4, Segment, and the rest. Tiny, zero-dependency, first-party.

Existing "ad block detectors" tell you whether *a* blocker exists. `blockrate` tells you **which specific tools are blocked**, so you can decide whether to reverse-proxy Optimizely, migrate PostHog server-side, or just accept the gap.

## Three ways to use it

| | What | Where to start |
| --- | --- | --- |
| 🪶 **OSS library** | The 1.6 KB client. Drop into any web app, point at any reporter. | [`packages/core`](packages/core/README.md) |
| 🏠 **Self-hosted server** | Drop-in ingestion server with SQLite or Postgres + a built-in dashboard. One binary, one command. | [`packages/server`](packages/server/README.md) |
| ☁️ **Hosted (blockrate.app)** | Sign up, get an API key, see per-provider block rates. No infrastructure. | [blockrate.app](https://blockrate.app) *(in development)* |

## Repository layout

```
blockrate/
├── packages/
│   ├── core/                 OSS client library — published as `blockrate` on npm
│   │   └── src/              core + react + next + sveltekit + tanstack-start subpaths
│   └── server/               self-hostable ingestion server — `blockrate-server` on npm
│       └── src/              Bun + Drizzle, SQLite default, Postgres optional
├── apps/
│   └── web/                  blockrate.app hosted dashboard — TanStack Start + Better Auth
├── docs/
│   ├── design.md             v0 design charter (tokens, voice, polish principles)
│   └── plans/                phased build plans
└── examples/                 minimal integration snippets per framework
```

## Quick start (OSS library)

```bash
bun add blockrate
```

```ts
import { BlockRate } from "blockrate";

new BlockRate({
  providers: ["optimizely", "posthog", "ga4"],
  reporter: (result) => {
    navigator.sendBeacon("/api/blockrate", JSON.stringify(result));
  },
  sampleRate: 0.1,
}).check();
```

Full library docs (built-in providers, custom providers, framework adapters, query examples) in [`packages/core/README.md`](packages/core/README.md).

## Quick start (self-hosted)

```bash
bunx blockrate-server
# [blockrate-server] listening on http://localhost:4318
# [blockrate-server] Bootstrapped default tenant. API key: br_xxxxxxxxxxxxxxxxxxxx
# [blockrate-server] dashboard: http://localhost:4318/dashboard
```

That's the entire setup. Open the dashboard, paste the printed API key, point your client at it. Full self-host guide (Docker, Railway, fly.io, systemd, reverse proxy, backups) in [`packages/server/README.md`](packages/server/README.md).

## Hosted version

If you don't want to operate any infrastructure, [blockrate.app](https://blockrate.app) is the hosted version of the self-hosted server with:

- **Free tier**: 100k events/month, 3 API keys, 7-day retention
- Sign-in with magic link, Google, or GitHub
- Per-account API keys, cascading delete, CSV export
- Same OSS library — you can move on or off any time

## Project status

| Tag | Phase | What |
| --- | --- | --- |
| `v0.5.0` | 0 | `packages/server` SQLite ↔ Postgres parity |
| `v0.6.0` | 1 | `apps/web` scaffold + auth + design charter |
| `v0.7.0` | 2 | ingest endpoint + key management + quota |
| `v0.8.0` | 3 | dashboard with stats query + settings |
| `v0.9.0` | 4 | retention sweep + cron |
| `v0.10.0` | 5 | OAuth + Resend + dogfooding + production smoke |
| `v0.11.0` | 6 | Documentation polish (this) |

The hosted service code is feature-complete; production deployment is gated on OAuth client provisioning + a Railway project. See [`docs/plans/`](docs/plans/) for the full build plans.

## Contributing

PRs welcome — most things in this repo are intentionally small enough to read in one sitting. The OSS library is under 200 lines of TypeScript; the self-hosted server is ~1200 lines. The web app is the largest surface (~3500 lines).

Read [`docs/design.md`](docs/design.md) before touching UI — every PR that touches `apps/web` is reviewed against the design charter.

## License

MIT. See [LICENSE](LICENSE).
