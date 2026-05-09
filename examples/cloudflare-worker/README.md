# Cloudflare Worker reporter

A drop-in Cloudflare Worker that gives you a **first-party blockrate reporter
endpoint at your own domain**, without modifying your app. ~3 minutes to
deploy. Pair it with a tag-manager snippet (or a `<script>` in your HTML) for
a no-code-on-the-app-side install.

## Why this exists

[The reporter endpoint must be first-party](https://github.com/afonsojramos/blockrate/tree/main/packages/core#why-the-reporter-endpoint-must-be-first-party).
If the browser posts directly to `blockrate.app`, the moment that domain
lands on EasyPrivacy your "blocked" reports stop arriving and the
dashboard silently shows "everything loaded." This worker bound to a
route on your own domain is a first-party endpoint — no app changes
required.

## Setup (3 minutes)

Prereqs: a Cloudflare account, your domain on Cloudflare, [`wrangler`](https://developers.cloudflare.com/workers/wrangler/) installed.

```bash
bun add -g wrangler
wrangler login
```

Edit `wrangler.toml`:

- Set `account_id` to your Cloudflare account ID (find it in `dash.cloudflare.com` → right sidebar).
- Uncomment and configure the `routes` block. Bind the worker to a route on **your** domain — typically a subdomain like `metrics.example.com/block-rate`.

Set the API key as a secret (the worker never sees it as plaintext in the source):

```bash
wrangler secret put BLOCKRATE_API_KEY
# Paste your `br_...` key when prompted
```

Deploy:

```bash
wrangler deploy
```

## Use it from your app

```html
<script type="module">
  import { BlockRate } from "https://esm.sh/blockrate";

  new BlockRate({
    providers: ["optimizely", "posthog", "ga4"],
    reporter: (r) =>
      navigator.sendBeacon("https://metrics.example.com/block-rate", JSON.stringify(r)),
  }).check();
</script>
```

The URL is **on your domain**, not `blockrate.app`. That is the whole point.

## Self-hosting upstream

If you run `blockrate-server` yourself instead of using `blockrate.app`,
point the worker at it:

```bash
wrangler secret put BLOCKRATE_ENDPOINT
# Paste e.g. https://br.internal.example.com (no trailing /ingest)
```

## Tightening CORS

By default the worker mirrors the request `Origin` (safe — no cookies, no
client-known credentials). For tighter posture, allowlist your origins:

```bash
wrangler secret put BLOCKRATE_ALLOWED_ORIGINS
# Paste e.g. https://www.example.com,https://app.example.com
```

## Observing failures

Worker logs (`Cloudflare dashboard → Workers → Logs → Real-time logs`)
will show `[blockrate] forward failed:` lines if the upstream rejects
the API key, times out, or rate-limits. Without surfacing these you'll
have no idea why your dashboard stopped receiving events.
