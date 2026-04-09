# block-rate-server

Self-hostable ingestion server and dashboard for [block-rate](https://github.com/afonsojramos/block-rate). One command, one binary, your data on your infrastructure.

```bash
bunx block-rate-server
# [block-rate-server] listening on http://localhost:4318
# [block-rate-server] Bootstrapped default tenant. API key: br_xxxxxxxxxxxxxxxxxxxx
# [block-rate-server] dashboard: http://localhost:4318/dashboard
```

That's the entire setup. Open the printed dashboard URL, paste the API key, point your client at the `/ingest` endpoint with the same key in `x-block-rate-key`. Done.

## What it gives you

- **POST /ingest** — accepts payloads from the OSS [`block-rate`](../core/README.md) client
- **GET /stats** — per-provider block rate aggregation, sliced by service and date range
- **/dashboard** — single-page vanilla HTML dashboard reading from `/stats`
- **Multi-tenant** — one server can ingest for many services across many teams
- **Per-tenant API keys** with rotation and revocation
- **Built-in rate limiting** (token bucket per tenant)
- **CORS preflight** handled automatically — works with any cross-origin client
- **UA truncation at ingest** — never persists raw user agents (only `Browser Family + major version`)
- **CLI for tenant management** — create, list, rotate, delete

## Storage backends

| Backend | When to use | Default |
| --- | --- | --- |
| **SQLite** | Single-instance self-host. Zero setup. Persistent file. | ✓ |
| **Postgres** | Existing Postgres infra, multi-instance, larger scale. | optional |

Both are first-class — same `BlockRateStore` interface, same migrations, same query shapes. Switch via `DB_DIALECT=postgres DATABASE_URL=postgres://...`.

## Configuration

| Env var | Default | Description |
| --- | --- | --- |
| `PORT` | `4318` | HTTP port |
| `DB_DIALECT` | `sqlite` | `sqlite` or `postgres` |
| `DB_PATH` | `./block-rate.db` | SQLite file path or Postgres connection URL |
| `BLOCK_RATE_BOOTSTRAP_KEY` | random | Pin the bootstrap tenant's API key (otherwise generated and printed once) |
| `BLOCK_RATE_BOOTSTRAP_NAME` | `default` | Name of the bootstrap tenant |

The server has **no other env vars** by design — everything else is wired through `block-rate-server tenant *` commands.

## Tenant CLI

```bash
block-rate-server tenant create <name>     # → prints a new API key
block-rate-server tenant list              # → id, name, masked key
block-rate-server tenant rotate <name>     # → new key, old key invalidated
block-rate-server tenant delete <name>     # → cascades to all events
```

The bootstrap tenant is created on first run with a random API key (printed to the terminal). For production, pin it via `BLOCK_RATE_BOOTSTRAP_KEY` so you don't lose it on container restart.

## Deployment recipes

### Docker

```dockerfile
FROM oven/bun:1.3-alpine
WORKDIR /app
RUN bun install -g block-rate-server
EXPOSE 4318
ENV PORT=4318
ENV DB_PATH=/data/block-rate.db
VOLUME /data
CMD ["block-rate-server"]
```

```bash
docker build -t block-rate-server .
docker run -d -p 4318:4318 -v /opt/block-rate-data:/data \
  -e BLOCK_RATE_BOOTSTRAP_KEY=$(openssl rand -base64 32) \
  --name block-rate block-rate-server
```

### docker-compose

```yaml
services:
  block-rate:
    image: oven/bun:1.3-alpine
    command: bunx block-rate-server
    ports: ["4318:4318"]
    volumes:
      - ./data:/app
    environment:
      PORT: 4318
      DB_PATH: /app/block-rate.db
      BLOCK_RATE_BOOTSTRAP_KEY: ${BLOCK_RATE_KEY}
    restart: unless-stopped
```

### Railway

1. Create a service from a fork of this repo (or wrap in a tiny Dockerfile per above)
2. Mount a Volume at `/data`
3. Env vars:
   ```
   PORT=4318
   DB_PATH=/data/block-rate.db
   BLOCK_RATE_BOOTSTRAP_KEY=<openssl rand -base64 32>
   ```
4. Add a custom domain pointing at the service
5. Optional: switch to Postgres by adding the Postgres addon and setting `DB_DIALECT=postgres DB_PATH=${{Postgres.DATABASE_URL}}`

### fly.io

```toml
# fly.toml
app = "block-rate"

[build]
  image = "oven/bun:1.3-alpine"

[mounts]
  source = "block_rate_data"
  destination = "/data"

[env]
  PORT = "4318"
  DB_PATH = "/data/block-rate.db"

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
# /etc/systemd/system/block-rate.service
[Unit]
Description=block-rate ingestion server
After=network.target

[Service]
Type=simple
User=blockrate
WorkingDirectory=/opt/block-rate
Environment=PORT=4318
Environment=DB_PATH=/var/lib/block-rate/block-rate.db
EnvironmentFile=/etc/block-rate/block-rate.env
ExecStart=/usr/local/bin/bun /opt/block-rate/node_modules/.bin/block-rate-server
Restart=on-failure
RestartSec=5

# Hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/block-rate

[Install]
WantedBy=multi-user.target
```

```bash
sudo useradd -r -s /bin/false blockrate
sudo mkdir -p /var/lib/block-rate /etc/block-rate
sudo chown blockrate:blockrate /var/lib/block-rate
echo "BLOCK_RATE_BOOTSTRAP_KEY=$(openssl rand -base64 32)" | sudo tee /etc/block-rate/block-rate.env
sudo chmod 600 /etc/block-rate/block-rate.env
sudo systemctl daemon-reload
sudo systemctl enable --now block-rate
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
  - path: /var/lib/block-rate/block-rate.db
    replicas:
      - url: s3://my-bucket/block-rate
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
DB_DIALECT=sqlite DB_PATH=./block-rate.db block-rate-server tenant list > tenants.txt

# 2. Stop the SQLite-backed server
# 3. Run migrations against Postgres
DB_DIALECT=postgres DB_PATH="postgres://..." block-rate-server  # creates tables

# 4. Manually copy tenants and events (the schemas are identical)
#    Use pgloader or a one-shot script reading both DBs
```

The SQLite ↔ Postgres parity is enforced at the test level (`packages/server/test/store-parity.test.ts`) — every store operation runs against both backends in CI.

## Programmatic use

You don't have to use the CLI:

```ts
import { createServer, createStore, createTenant } from "block-rate-server";

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
- `truncateUserAgent` — pure function, also exposed at `block-rate-server/ua` for use without pulling in the SQLite store
- `TokenBucketLimiter` — same, at `block-rate-server/rate-limit`

## License

MIT.
