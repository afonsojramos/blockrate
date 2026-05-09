# Google Tag Manager install

Install blockrate via GTM without modifying your app code. Pair with the
[Cloudflare Worker template](../cloudflare-worker/) for a true no-app-code
install — together, ~5 minutes from zero to events landing in the dashboard.

## What you need

1. A first-party reporter endpoint at your own domain. Easiest path: deploy
   the [Cloudflare Worker](../cloudflare-worker/) at e.g.
   `metrics.example.com/block-rate`. Any first-party URL works — same-origin
   API route, reverse-proxy, etc.
2. A blockrate API key (`br_...`), set as the worker's `BLOCKRATE_API_KEY`
   secret. **The browser never sees this key**; the worker injects it
   server-side.
3. GTM container access for your domain.

## Steps

### 1. Create a GTM variable for the endpoint

GTM → **Variables** → **New** → **User-Defined Variable**:

- Name: `Block Rate Reporter Endpoint`
- Type: **Constant**
- Value: `https://metrics.example.com/block-rate` (your first-party URL)

Using a variable rather than hard-coding the URL means you can change
endpoints later (staging vs production, or moving the worker to a
different subdomain) without editing the tag.

### 2. Create the Custom HTML tag

GTM → **Tags** → **New** → **Custom HTML**:

- Tag Name: `blockrate`
- HTML: paste the contents of [`blockrate-tag.html`](./blockrate-tag.html)
- Triggering: `All Pages` (or `Initialization - All Pages` if you want it
  to fire as early as possible)

### 3. Verify in Preview mode

GTM → **Preview** → enter your site URL. On the page, open DevTools →
Network. You should see one POST to your reporter endpoint per page load
(or per `sampleRate` of page loads — the default in this snippet is
`0.1`, i.e. one in ten).

In the GTM debug console you should see the `blockrate` tag fire on
every page. If it fires but no network request appears, check the
DevTools console for `[blockrate-gtm]` errors — typically a typo in
the endpoint URL or a CSP blocking `esm.sh`.

### 4. Validate in the dashboard

[blockrate.app dashboard](https://blockrate.app/app) (or your self-hosted
equivalent). Within ~1 minute you should see events under the tenant
whose API key the worker is using. If not:

- Cloudflare dashboard → Workers → Logs → look for `[blockrate] forward failed:` lines.
- Confirm the worker's `BLOCKRATE_API_KEY` secret matches the dashboard tenant.

## Tradeoffs vs. bundling blockrate via npm

| Aspect              | GTM install                                              | npm install                              |
| ------------------- | -------------------------------------------------------- | ---------------------------------------- |
| Code changes        | None to the app                                          | Add `blockrate` to deps + 1 server route |
| Third-party deps    | Loads from `esm.sh` at tag fire time                     | Bundled into your own JS                 |
| CSP                 | Need to allow `esm.sh` in `script-src` and `connect-src` | None                                     |
| Best for            | Marketing-team-managed sites, no engineering loop        | Engineering-managed apps                 |
| Time to first event | ~5 minutes                                               | ~30 minutes                              |

If your CSP is strict and you can't allow `esm.sh`, host the
blockrate ESM bundle yourself (it's ~1.6 KB) and edit the `import()`
URL in `blockrate-tag.html` to point at your hosted copy.

## CSP fragment

If your site has a Content Security Policy, GTM's Custom HTML tag will
hit it. Add to your CSP:

```
script-src   ... https://www.googletagmanager.com https://esm.sh
connect-src  ... https://metrics.example.com
```

(replace `https://metrics.example.com` with your actual reporter URL)
