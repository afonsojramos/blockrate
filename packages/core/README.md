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
    navigator.sendBeacon("/api/blockrate", JSON.stringify(result));
  },
  sampleRate: 0.1,
});

br.check();
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
  reporter: (r) => fetch("/api/blockrate", { method: "POST", body: JSON.stringify(r) }),
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
          endpoint="/api/blockrate"
          sampleRate={0.1}
        />
      </body>
    </html>
  );
}
```

```ts
// app/api/blockrate/route.ts
import { createBlockRateHandler } from "blockrate/next";

export const POST = createBlockRateHandler({
  onResult: async (result) => {
    console.log(JSON.stringify({ event: "block_rate_check", ...result }));
  },
});
```

## Self-hosted server

If you don't want to build ingestion yourself, run `blockrate-server` — a batteries-included Bun server with SQLite storage, validation, rate limiting, multi-tenant API keys, and a one-page dashboard.

```bash
bunx blockrate-server
# [blockrate-server] listening on http://localhost:4318
# [blockrate-server] Bootstrapped default tenant. API key: br_xxxxxxxxxxxxxxxxxxxxxxxx
```

Point your client at it with `serverReporter`:

```ts
import { BlockRate, serverReporter } from "blockrate";

new BlockRate({
  providers: ["optimizely", "posthog", "ga4"],
  service: "web-app",
  reporter: serverReporter({
    endpoint: "https://br.example.com",
    apiKey: process.env.NEXT_PUBLIC_BLOCK_RATE_KEY!,
  }),
}).check();
```

Then open `http://localhost:4318/dashboard`, paste the API key, and you'll see per-provider block rates for every service reporting into that tenant.

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

**Won't this script get blocked too?** No — it's bundled into your first-party code. Blocklists target third-party hostnames, not your app bundle.

**Is this ethical?** Yes. You're measuring, not circumventing.
