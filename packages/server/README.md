# blockrate-server

Self-hostable ingestion server and dashboard for [blockrate](https://github.com/afonsojramos/blockrate). One command, one binary, your data on your infrastructure.

```bash
bunx blockrate-server
# [blockrate-server] listening on http://localhost:4318
# [blockrate-server] Bootstrapped default tenant. API key: br_xxxxxxxxxxxxxxxxxxxx
# [blockrate-server] dashboard: http://localhost:4318/dashboard
```

That's the entire setup. Open the printed dashboard URL, paste the API key, then wire your client through a same-origin route on your app that forwards to this server with the key attached server-side. See [Why the reporter endpoint must be first-party](../core/README.md#why-the-reporter-endpoint-must-be-first-party) in the core README — self-hosters are first-party by definition, but the rationale (ad blocker list hits, credential leakage) still applies to any browser-to-analytics traffic.

## What it gives you

- **POST /ingest** — accepts payloads from the OSS [`blockrate`](../core/README.md) client
- **GET /stats** — per-provider block rate aggregation, sliced by service and date range
- **/dashboard** — single-page vanilla HTML dashboard reading from `/stats`
- **Multi-tenant** — one server can ingest for many services across many teams
- **Per-tenant API keys** with rotation and revocation
- **Built-in rate limiting** (token bucket per tenant)
- **CORS preflight** handled automatically — works with any cross-origin client
- **UA truncation at ingest** — never persists raw user agents (only `Browser Family + major version`)
- **CLI for tenant management** — create, list, rotate, delete

## Storage backends

| Backend      | When to use                                             | Default  |
| ------------ | ------------------------------------------------------- | -------- |
| **SQLite**   | Single-instance self-host. Zero setup. Persistent file. | ✓        |
| **Postgres** | Existing Postgres infra, multi-instance, larger scale.  | optional |

Both are first-class — same `BlockRateStore` interface, same migrations, same query shapes. Switch via `DB_DIALECT=postgres DATABASE_URL=postgres://...`.

## Configuration

| Env var                     | Default          | Description                                                               |
| --------------------------- | ---------------- | ------------------------------------------------------------------------- |
| `PORT`                      | `4318`           | HTTP port                                                                 |
| `DB_DIALECT`                | `sqlite`         | `sqlite` or `postgres`                                                    |
| `DB_PATH`                   | `./blockrate.db` | SQLite file path or Postgres connection URL                               |
| `BLOCK_RATE_BOOTSTRAP_KEY`  | random           | Pin the bootstrap tenant's API key (otherwise generated and printed once) |
| `BLOCK_RATE_BOOTSTRAP_NAME` | `default`        | Name of the bootstrap tenant                                              |

The server has **no other env vars** by design — everything else is wired through `blockrate-server tenant *` commands.

## Tenant CLI

```bash
blockrate-server tenant create <name>     # → prints a new API key
blockrate-server tenant list              # → id, name, masked key
blockrate-server tenant rotate <name>     # → new key, old key invalidated
blockrate-server tenant delete <name>     # → cascades to all events
```

The bootstrap tenant is created on first run with a random API key (printed to the terminal). For production, pin it via `BLOCK_RATE_BOOTSTRAP_KEY` so you don't lose it on container restart.

## Deployment recipes

### Docker

```dockerfile
FROM oven/bun:1.3-alpine
WORKDIR /app
RUN bun install -g blockrate-server
EXPOSE 4318
ENV PORT=4318
ENV DB_PATH=/data/blockrate.db
VOLUME /data
CMD ["blockrate-server"]
```

```bash
docker build -t blockrate-server .
docker run -d -p 4318:4318 -v /opt/blockrate-data:/data \
  -e BLOCK_RATE_BOOTSTRAP_KEY=$(openssl rand -base64 32) \
  --name blockrate blockrate-server
```

### docker-compose

```yaml
services:
  blockrate:
    image: oven/bun:1.3-alpine
    command: bunx blockrate-server
    ports: ["4318:4318"]
    volumes:
      - ./data:/app
    environment:
      PORT: 4318
      DB_PATH: /app/blockrate.db
      BLOCK_RATE_BOOTSTRAP_KEY: ${BLOCK_RATE_KEY}
    restart: unless-stopped
```

### Railway

1. Create a service from a fork of this repo (or wrap in a tiny Dockerfile per above)
2. Mount a Volume at `/data`
3. Env vars:
   ```
   PORT=4318
   DB_PATH=/data/blockrate.db
   BLOCK_RATE_BOOTSTRAP_KEY=<openssl rand -base64 32>
   ```
4. Add a custom domain pointing at the service
5. Optional: switch to Postgres by adding the Postgres addon and setting `DB_DIALECT=postgres DB_PATH=${{Postgres.DATABASE_URL}}`

### fly.io

```toml
# fly.toml
app = "blockrate"

[build]
  image = "oven/bun:1.3-alpine"

[mounts]
  source = "block_rate_data"
  destination = "/data"

[env]
  PORT = "4318"
  DB_PATH = "/data/blockrate.db"

[[services]]
  internal_port = 4318
  protocol = "tcp"
  [[services.ports]]
    handlers = ["tls", "http"]
    port = 443
```

```bash
fly launch --no-deploy
fly volumes create block_rate_data --size 1
fly secrets set BLOCK_RATE_BOOTSTRAP_KEY=$(openssl rand -base64 32)
fly deploy
```

### systemd (bare metal / VPS)

```ini
# /etc/systemd/system/blockrate.service
[Unit]
Description=blockrate ingestion server
After=network.target

[Service]
Type=simple
User=blockrate
WorkingDirectory=/opt/blockrate
Environment=PORT=4318
Environment=DB_PATH=/var/lib/blockrate/blockrate.db
EnvironmentFile=/etc/blockrate/blockrate.env
ExecStart=/usr/local/bin/bun /opt/blockrate/node_modules/.bin/blockrate-server
Restart=on-failure
RestartSec=5

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/blockrate

[Install]
WantedBy=multi-user.target
```

```bash
sudo useradd -r -s /bin/false blockrate
sudo mkdir -p /var/lib/blockrate /etc/blockrate
sudo chown blockrate:blockrate /var/lib/blockrate
echo "BLOCK_RATE_BOOTSTRAP_KEY=$(openssl rand -base64 32)" | sudo tee /etc/blockrate/blockrate.env
sudo chmod 600 /etc/blockrate/blockrate.env
sudo systemctl daemon-reload
sudo systemctl enable --now blockrate
```

## Reverse proxy

The server speaks plain HTTP — terminate TLS at a reverse proxy.

### Caddy

```caddyfile
br.example.com {
  reverse_proxy localhost:4318
}
```

### nginx

```nginx
server {
  listen 443 ssl http2;
  server_name br.example.com;

  ssl_certificate     /etc/letsencrypt/live/br.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/br.example.com/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:4318;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

### Cloudflare

Just add a Cloudflare Tunnel pointing at `localhost:4318`. No port-forwarding, no certs to renew.

## Security hardening

The server is **defaults-on**:

- **Built-in rate limit** — 60-burst / 10/sec per tenant (token bucket, in-process)
- **CORS preflight** allows any origin — necessary for browser POSTs from arbitrary client sites
- **API keys** are random 51-char tokens (`br_` + 24 random hex bytes), never plaintext-logged
- **`user_agent` is truncated at ingest** — only `Browser Family + major version` is persisted, never the raw UA. This is the single biggest privacy lever and it's non-negotiable.
- **Zod validation** on every payload — bad shapes return 400 without touching the DB

What it does **not** do (you handle these at the proxy / infra layer):

- TLS termination (use Caddy / nginx / Cloudflare)
- IP allow-listing (use a firewall or proxy ACL)
- Distributed rate limiting (in-process token bucket only — single-instance only; for multi-instance, see "Multi-instance" below)
- Authentication beyond the bearer API key (no users, no sessions, no OAuth — that's what [blockrate.app](https://blockrate.app) is for)

## Backups

### SQLite

Use [Litestream](https://litestream.io) for continuous replication to S3/B2/etc:

```yaml
# /etc/litestream.yml
dbs:
  - path: /var/lib/blockrate/blockrate.db
    replicas:
      - url: s3://my-bucket/blockrate
```

WAL mode is already enabled. Litestream sees writes immediately.

### Postgres

Whatever your Postgres provider offers — Railway/Supabase/Neon all do automatic backups + PITR. For self-hosted Postgres, use `pg_dump` on a schedule or `pgbackrest`/`barman` for incremental.

## Multi-instance considerations

The default in-process token bucket rate limiter doesn't survive horizontal scaling. If you run more than one instance:

- Switch to a Postgres-backed limiter (write your own — the `BlockRateStore` interface is small enough to extend)
- Or front the cluster with a proxy that does the rate limiting (nginx `limit_req`, Caddy `rate_limit`, Cloudflare WAF rules)
- The `events` insert path is already concurrency-safe — Postgres handles it; SQLite serializes via WAL

For Phase 1 of any deployment, **start with one instance**. Postgres connection pooling becomes the next bottleneck, not the request handler.

## Migrating from SQLite to Postgres

```bash
# 1. Export from SQLite
DB_DIALECT=sqlite DB_PATH=./blockrate.db blockrate-server tenant list > tenants.txt

# 2. Stop the SQLite-backed server
# 3. Run migrations against Postgres
DB_DIALECT=postgres DB_PATH="postgres://..." blockrate-server  # creates tables

# 4. Manually copy tenants and events (the schemas are identical)
#    Use pgloader or a one-shot script reading both DBs
```

The SQLite ↔ Postgres parity is enforced at the test level (`packages/server/test/store-parity.test.ts`) — every store operation runs against both backends in CI.

## Programmatic use

You don't have to use the CLI:

```ts
import { createServer, createStore, createTenant } from "blockrate-server";

const store = await createStore({ dialect: "postgres", url: process.env.DATABASE_URL });
await createTenant(store, "my-app");
const app = await createServer({ store });

Bun.serve({ port: 4318, fetch: app.fetch });
```

The full public surface is in [`src/index.ts`](src/index.ts):

- `createStore`, `SqliteStore`, `PostgresStore` + the `BlockRateStore` interface
- `createServer`, `ServerOptions`
- `createTenant`, `listTenants`, `deleteTenant`, `rotateTenantKey`, `generateApiKey`
- `blockRatePayloadSchema` (Zod)
- `truncateUserAgent` — pure function, also exposed at `blockrate-server/ua` for use without pulling in the SQLite store
- `TokenBucketLimiter` — same, at `blockrate-server/rate-limit`

## License

MIT.
