# blockrate

Know what your ad blockers are hiding from your analytics. A tiny, zero-dependency library that measures the **per-provider** block rate of the third-party tools your app depends on.

> **Reporters welcome.** Pair this OSS client with [`blockrate-server`](https://github.com/afonsojramos/blockrate/tree/main/packages/server) for a one-command self-hosted ingestion server, or use [blockrate.app](https://blockrate.app) for a hosted dashboard with zero infrastructure. The library is identical either way — pick the reporter that fits.

## Why

You're running experiments, but 20% of your users are invisible — blocked by uBlock Origin, Brave, Pi-hole, corporate firewalls. Existing "ad block detectors" only tell you _a_ blocker exists. `blockrate` tells you **which specific tools are blocked**, so you can decide whether to reverse-proxy Optimizely, migrate PostHog server-side, or just accept the gap.

## Quick start

```bash
bun add blockrate
```

```ts
import { BlockRate } from "blockrate";

const br = new BlockRate({
  providers: ["optimizely", "posthog", "ga4"],
  reporter: (result) => {
    navigator.sendBeacon("/api/block-rate", JSON.stringify(result));
  },
  sampleRate: 0.1,
});

br.check();
```

The client always posts to **your own origin** (`/api/block-rate`) — not directly to `blockrate.app` or a self-hosted instance. See [Why the reporter endpoint must be first-party](#why-the-reporter-endpoint-must-be-first-party) for why this matters, and keep reading for the matching server route.

## Why the reporter endpoint must be first-party

`blockrate` exists because ad blockers drop third-party analytics requests. For the measurement to be valid, the client must post to your own origin — **never directly to `blockrate.app`, `api.blockrate.app`, or any dedicated analytics host**. A server route on your own domain then forwards the payload to the ingest endpoint with your API key.

Two things break if you ignore this:

1. **The measurement itself fails.** `blockrate.app` is, by definition, an analytics domain — the exact shape of thing that lands on EasyPrivacy and other public blocklists. The moment it does, the tool measuring blocking only sees the blocking that _isn't_ blocking blockrate itself: a reflexive, silent failure where "loaded" counts look normal because the "blocked" reports never arrived.
2. **Your API key leaks.** If the browser needs your `br_...` key to authenticate the ingest request, the key is visible in DevTools, page source, and network inspectors to any visitor. There is no way to rotate or scope a key the browser already knows.

The `forward` option on `createBlockRateHandler` collapses the server-side forwarding into one line:

```ts
// app/api/block-rate/route.ts
import { createBlockRateHandler } from "blockrate/next";

export const POST = createBlockRateHandler({
  forward: { apiKey: process.env.BLOCKRATE_API_KEY! },
});
```

The API key stays on the server. The browser only knows about your `/api/block-rate` route, which is first-party and cannot be blocklisted independently of your app.

### `forward` options

| Option      | Default                     | Description                                                                                                                                |
| ----------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `apiKey`    | _required_                  | Your `br_...` key. Must be passed explicitly (the library never reads env vars itself). Malformed keys throw at handler construction time. |
| `endpoint`  | `https://blockrate.app/api` | Override to point at staging, a different region, or a self-hosted `blockrate-server` instance. `/ingest` is appended automatically.       |
| `onError`   | _optional_                  | `(err: ForwardError) => void`. Called on network errors, timeouts, or non-2xx upstream responses. Without this, failures are silent.       |
| `timeoutMs` | `5000`                      | Aborts the upstream fetch after this many ms.                                                                                              |

`onError` receives a discriminated union:

```ts
type ForwardError =
  | { kind: "network"; cause: unknown }
  | { kind: "upstream"; status: number; statusText: string; body: string };
```

It never contains the API key — safe to log as-is. A common pattern:

```ts
forward: {
  apiKey: process.env.BLOCKRATE_API_KEY!,
  onError: (err) => console.error("[blockrate] upstream failed", err),
}
```

### Runtime requirement

`createBlockRateHandler` returns a `(request: Request) => Promise<Response>` function built on Web-standard `Request`/`Response`. It runs unmodified in Next.js App Router, SvelteKit, TanStack Start, Nuxt / Nitro, SolidStart, Bun, Deno, Cloudflare Workers, Vercel Edge, and Hono. For classic-Node (Express, Fastify) use `@whatwg-node/server` or a similar adapter to bridge between `IncomingMessage` and `Request`.

### Pairing with `onResult`

`forward` composes with `onResult` — both fire in parallel on a valid payload. Failures are isolated (a thrown `onResult` does not prevent the forward, and vice versa), and the browser always receives `204` on a valid body.

```ts
export const POST = createBlockRateHandler({
  forward: { apiKey: process.env.BLOCKRATE_API_KEY! },
  onResult: (r) => myLogger.info({ event: "block_rate", ...r }),
});
```

## Built-in providers

`optimizely`, `posthog`, `ga4`, `gtm`, `segment`, `hotjar`, `amplitude`, `mixpanel`, `meta-pixel`, `intercom`. Each provider is checked first via a `window` global, then via a `HEAD` probe to its CDN.

## Custom providers

```ts
import { BlockRate, createProvider } from "blockrate";

const mine = createProvider({
  name: "my-analytics",
  detect: async () => (window.myAnalytics ? "loaded" : "blocked"),
});

new BlockRate({ providers: [mine], reporter: console.log }).check();
```

## Options

| Option       | Default        | Description                                        |
| ------------ | -------------- | -------------------------------------------------- |
| `providers`  | _required_     | Built-in names or custom `Provider` objects        |
| `reporter`   | _required_     | Called once with a `BlockRateResult`               |
| `sampleRate` | `1`            | 0–1 fraction of sessions to check                  |
| `delay`      | `3000`         | ms to wait before probing (let scripts initialise) |
| `sessionKey` | `__block_rate` | sessionStorage dedup key                           |

## React

```tsx
import { useBlockRate } from "blockrate/react";

useBlockRate({
  providers: ["optimizely", "posthog"],
  reporter: (r) => fetch("/api/block-rate", { method: "POST", body: JSON.stringify(r) }),
});
```

## Next.js

```tsx
// app/layout.tsx
import { BlockRateScript } from "blockrate/next";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <BlockRateScript
          providers={["optimizely", "posthog", "ga4"]}
          endpoint="/api/block-rate"
          sampleRate={0.1}
        />
      </body>
    </html>
  );
}
```

```ts
// app/api/block-rate/route.ts
import { createBlockRateHandler } from "blockrate/next";

export const POST = createBlockRateHandler({
  forward: { apiKey: process.env.BLOCKRATE_API_KEY! },
});
```

## SvelteKit

```ts
// src/routes/api/block-rate/+server.ts
import { createBlockRateHandler } from "blockrate/sveltekit";

export const POST = createBlockRateHandler({
  forward: { apiKey: process.env.BLOCKRATE_API_KEY! },
});
```

## TanStack Start

```ts
// src/routes/api/block-rate.ts
import { createFileRoute } from "@tanstack/react-router";
import { createBlockRateHandler } from "blockrate/tanstack-start";

const handler = createBlockRateHandler({
  forward: { apiKey: process.env.BLOCKRATE_API_KEY! },
});

export const Route = createFileRoute("/api/block-rate")({
  server: { handlers: { POST: ({ request }) => handler(request) } },
});
```

## Self-hosted server

If you don't want to build ingestion yourself, run `blockrate-server` — a batteries-included Bun server with SQLite storage, validation, rate limiting, multi-tenant API keys, and a one-page dashboard.

```bash
bunx blockrate-server
# [blockrate-server] listening on http://localhost:4318
# [blockrate-server] Bootstrapped default tenant. API key: br_xxxxxxxxxxxxxxxxxxxxxxxx
```

Self-hosters are first-party by definition — your server runs on infrastructure you own. The recommended integration is still a same-origin route that forwards to your `blockrate-server` instance, so the rationale above about ad blockers and key handling applies identically:

```ts
// app/api/block-rate/route.ts
import { createBlockRateHandler } from "blockrate/next";

export const POST = createBlockRateHandler({
  forward: {
    apiKey: process.env.BLOCK_RATE_API_KEY!,
    endpoint: "https://br.example.com", // your self-hosted blockrate-server
  },
});
```

If you are genuinely running `blockrate-server` on the same origin as your app (reverse-proxied under `/blockrate` or similar), the older `serverReporter` pattern is also fine — nothing cross-origin happens:

```ts
import { BlockRate, serverReporter } from "blockrate";

new BlockRate({
  providers: ["optimizely", "posthog", "ga4"],
  service: "web-app",
  reporter: serverReporter({
    endpoint: "/blockrate", // same-origin reverse proxy
    apiKey: "br_...", // still server-side-resolved; your proxy injects it
  }),
}).check();
```

Then open the dashboard, paste the API key, and you'll see per-provider block rates for every service reporting into that tenant.

**One server can serve many services.** The `service` field on each payload is stored per-row, so one organization can run a single `blockrate-server` for its entire fleet (web, mobile-web, admin, marketing site, etc.) and filter the dashboard by service.

**Managing tenants:**

```bash
blockrate-server tenant create web-app    # prints a new API key
blockrate-server tenant list
blockrate-server tenant rotate web-app    # rotates the key
blockrate-server tenant delete web-app    # deletes tenant + all events
```

**Environment variables:**

| Variable                    | Default          | Description                        |
| --------------------------- | ---------------- | ---------------------------------- |
| `PORT`                      | `4318`           | HTTP port                          |
| `DB_PATH`                   | `./blockrate.db` | SQLite file path                   |
| `BLOCK_RATE_BOOTSTRAP_KEY`  | random           | Pin the bootstrap tenant's API key |
| `BLOCK_RATE_BOOTSTRAP_NAME` | `default`        | Name of the bootstrap tenant       |

## Querying your data

Once you're collecting `BlockRateResult` payloads, the question you actually want answered is: **for each provider, what fraction of sessions had it blocked?**

### SQL

Assuming you've flattened each provider into its own row (`session_id`, `provider`, `status`):

```sql
SELECT
  provider,
  COUNT(*) FILTER (WHERE status = 'blocked')::float / COUNT(*) AS block_rate,
  COUNT(*) AS sessions
FROM block_rate_events
WHERE timestamp > now() - interval '7 days'
GROUP BY provider
ORDER BY block_rate DESC;
```

### PostHog

```sql
SELECT
  properties.provider AS provider,
  countIf(properties.status = 'blocked') / count() AS block_rate
FROM events
WHERE event = 'block_rate_check'
  AND timestamp > now() - INTERVAL 7 DAY
GROUP BY provider
ORDER BY block_rate DESC
```

### Amplitude

Create a custom event `block_rate_check` and chart `unique sessions` segmented by `provider` where `status = blocked`, divided by total sessions.

## How it works

1. **Global check** — fast, synchronous-ish check for each provider's `window` global.
2. **Probe fallback** — if no global, `fetch` a known CDN URL with `mode: "no-cors"`. A `TypeError` means blocked.
3. **Dedup** — one check per session, tracked in `sessionStorage`.
4. **Report** — your reporter is called once with all results.

## FAQ

**Won't this script get blocked too?** No — it's bundled into your first-party code. Blocklists target third-party hostnames, not your app bundle. The same reasoning is exactly why the reporter endpoint must also be first-party: see [Why the reporter endpoint must be first-party](#why-the-reporter-endpoint-must-be-first-party).

**Is this ethical?** Yes. You're measuring, not circumventing.
