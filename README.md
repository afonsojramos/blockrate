# block-rate

Know what your ad blockers are hiding from your analytics. A tiny, zero-dependency library that measures the **per-provider** block rate of the third-party tools your app depends on.

## Why

You're running experiments, but 20% of your users are invisible — blocked by uBlock Origin, Brave, Pi-hole, corporate firewalls. Existing "ad block detectors" only tell you _a_ blocker exists. `block-rate` tells you **which specific tools are blocked**, so you can decide whether to reverse-proxy Optimizely, migrate PostHog server-side, or just accept the gap.

## Quick start

```bash
bun add block-rate
```

```ts
import { BlockRate } from "block-rate";

const br = new BlockRate({
  providers: ["optimizely", "posthog", "ga4"],
  reporter: (result) => {
    navigator.sendBeacon("/api/block-rate", JSON.stringify(result));
  },
  sampleRate: 0.1,
});

br.check();
```

## Built-in providers

`optimizely`, `posthog`, `ga4` (v0.1.0). Each provider is checked first via a `window` global, then via a `HEAD` probe to its CDN.

## Custom providers

```ts
import { BlockRate, createProvider } from "block-rate";

const mine = createProvider({
  name: "my-analytics",
  detect: async () => (window.myAnalytics ? "loaded" : "blocked"),
});

new BlockRate({ providers: [mine], reporter: console.log }).check();
```

## Options

| Option | Default | Description |
| --- | --- | --- |
| `providers` | _required_ | Built-in names or custom `Provider` objects |
| `reporter` | _required_ | Called once with a `BlockRateResult` |
| `sampleRate` | `1` | 0–1 fraction of sessions to check |
| `delay` | `3000` | ms to wait before probing (let scripts initialise) |
| `sessionKey` | `__block_rate` | sessionStorage dedup key |

## React

```tsx
import { useBlockRate } from "block-rate-react";

useBlockRate({
  providers: ["optimizely", "posthog"],
  reporter: (r) =>
    fetch("/api/block-rate", { method: "POST", body: JSON.stringify(r) }),
});
```

## How it works

1. **Global check** — fast, synchronous-ish check for each provider's `window` global.
2. **Probe fallback** — if no global, `fetch` a known CDN URL with `mode: "no-cors"`. A `TypeError` means blocked.
3. **Dedup** — one check per session, tracked in `sessionStorage`.
4. **Report** — your reporter is called once with all results.

## FAQ

**Won't this script get blocked too?** No — it's bundled into your first-party code. Blocklists target third-party hostnames, not your app bundle.

**Is this ethical?** Yes. You're measuring, not circumventing.
