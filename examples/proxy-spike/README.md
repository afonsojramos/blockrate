# proxy-spike — single-provider first-party reverse proxy (PostHog)

**Status: spike, not a shipped feature.** This worker is the proof-of-concept
behind `docs/brainstorms/2026-07-21-managed-first-party-proxy.md`. It exists
to validate, on one provider, that a thin streaming worker can serve a
blocked analytics provider first-party. Do not point production traffic at
it without reading the design doc's operational model first.

## What it does

`https://<your-domain>/ph/*` → `https://us.i.posthog.com/*` (or the EU host),
streaming request and response bodies, forwarding the client IP, and
stripping hop-by-hop headers. Both surfaces the PostHog SDK needs work
through it:

- `GET /ph/static/array.js` — the loader script
- `POST /ph/e/`, `/ph/batch`, `/ph/decide`, … — event ingestion

## Setup (3 minutes)

1. Install wrangler: `bun add -g wrangler`
2. Edit `wrangler.toml`: uncomment the route on your domain (and set
   `account_id`). EU projects: set `POSTHOG_UPSTREAM = "https://eu.i.posthog.com"`.
3. Deploy: `wrangler deploy`
4. Point the SDK at the proxy:

   ```js
   posthog.init("<project token>", {
     api_host: "https://metrics.example.com/ph",
     ui_host: "https://us.posthog.com",
   });
   ```

## Verify

With `bunx wrangler dev` running in this directory:

```bash
# 1. The loader script passes through (200, JavaScript body):
curl -sI http://localhost:8787/ph/static/array.js | head -5
#    HTTP/1.1 200 OK
#    content-type: application/javascript; charset=utf-8

# 2. Event ingestion passes through (PostHog answers 200 on a well-formed capture):
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:8787/ph/e/ \
  -H "content-type: application/json" \
  -d '{"api_key":"phc_test","event":"spike_probe","distinct_id":"spike","properties":{}}'
#    200

# 3. Paths outside /ph are not proxied:
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8787/other
#    404
```

Actual output from the spike run is recorded in the design doc,
`docs/brainstorms/2026-07-21-managed-first-party-proxy.md` (§measurement
semantics, empirical results).

## Deliberate limitations (spike scope)

- PostHog only. The per-provider proxyability matrix lives in the design doc.
- No edge caching. A production version may cache `/static/*` GETs; event
  ingestion must never be cached.
- No allowlist of upstream paths beyond the `/ph` prefix. A production
  version should 404 anything that isn't a known SDK path, so the worker
  can't be abused as an open proxy to PostHog.
