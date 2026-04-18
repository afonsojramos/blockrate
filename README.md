# blockrate

> **Know what your ad blockers are hiding from your analytics.** Measure the _per-provider_ block rate of the third-party tools your app depends on — Optimizely, PostHog, GA4, Segment, and the rest. Tiny, zero-dependency, first-party.

Existing "ad block detectors" tell you whether _a_ blocker exists. `blockrate` tells you **which specific tools are blocked**, so you can decide whether to reverse-proxy Optimizely, migrate PostHog server-side, or just accept the gap.

## Three ways to use it

|                               | What                                                                                              | Where to start                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 🪶 **OSS library**            | The 1.6 KB client. Drop into any web app, point at any reporter.                                  | [`packages/core`](packages/core/README.md)                |
| 🏠 **Self-hosted server**     | Drop-in ingestion server with SQLite or Postgres + a built-in dashboard. One binary, one command. | [`packages/server`](packages/server/README.md)            |
| ☁️ **Hosted (blockrate.app)** | Sign up, get an API key, see per-provider block rates. No infrastructure.                         | [blockrate.app](https://blockrate.app) _(in development)_ |

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
    ├── nextjs, tanstack-start, sveltekit, nuxt, solidstart, vanilla
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
    navigator.sendBeacon("/api/block-rate", JSON.stringify(result));
  },
  sampleRate: 0.1,
}).check();
```

```ts
// app/api/block-rate/route.ts
import { createBlockRateHandler } from "blockrate/next";

export const POST = createBlockRateHandler({
  forward: { apiKey: process.env.BLOCKRATE_API_KEY! },
});
```

The client always posts to your own origin; the server route forwards to blockrate.app (or your self-hosted instance) with your API key attached server-side. This is load-bearing — read [Why the reporter endpoint must be first-party](packages/core/README.md#why-the-reporter-endpoint-must-be-first-party) in the core README.

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

Integration is a single-line server route: [`createBlockRateHandler({ forward: { apiKey: … } })`](packages/core/README.md#why-the-reporter-endpoint-must-be-first-party). Your `br_` key stays on the server; the browser only sees your first-party `/api/block-rate` path.

## Contributing

PRs welcome — most things in this repo are intentionally small enough to read in one sitting. The OSS library is under 200 lines of TypeScript; the self-hosted server is ~1200 lines. The web app is the largest surface (~3500 lines).

Read [`docs/design.md`](docs/design.md) before touching UI — every PR that touches `apps/web` is reviewed against the design charter.

## License

MIT. See [LICENSE](LICENSE).
