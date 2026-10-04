/** Boots the production Node bundle against a disposable database and verifies
 * security headers, CORS, SSR, auth denial and the persisted ingestion path. */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { once } from "node:events";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createServer } from "node:net";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { postgresOptions } from "../src/lib/db/postgres-options";
import { SECURITY_HEADERS } from "../src/lib/security-headers";
import { hashKey, keyPrefix } from "../src/lib/keys.server";
import * as schema from "../src/lib/db/schema";
import { user } from "../src/lib/db/auth-schema";

const dir = mkdtempSync(join(tmpdir(), "blockrate-web-"));
const dataDir = join(dir, "pg");
const postgresFixture = process.argv.includes("--postgres-fixture");
const dummyKey = "br_" + "0".repeat(48);
const socket = createServer();
socket.listen(0, "127.0.0.1");
await once(socket, "listening");
const address = socket.address();
assert(address && typeof address !== "string");
const port = address.port;
await new Promise<void>((done, reject) => socket.close((err) => (err ? reject(err) : done())));
const origin = `http://127.0.0.1:${port}`;
const env = {
  PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
  NODE_ENV: "production",
  PORT: String(port),
  HOST: "127.0.0.1",
  DATABASE_URL: postgresFixture
    ? "postgres://fixture:dummy@blockrate-postgres:5432/web_fixture"
    : `pglite://${dataDir}`,
  NODE_EXTRA_CA_CERTS: postgresFixture ? "/fixture/server.crt" : undefined,
  BETTER_AUTH_SECRET: "local-placeholder-secret-at-least-32-characters",
  BETTER_AUTH_URL: origin,
};
function openFixture() {
  if (postgresFixture) {
    const client = postgres(env.DATABASE_URL, postgresOptions("production", 1));
    return {
      // SAFETY: Both fixture adapters insert and return identical PostgreSQL row schemas.
      db: drizzlePostgres(client) as unknown as ReturnType<typeof drizzle>,
      query: async <T extends Record<string, unknown>>(statement: string) => ({
        rows: await client.unsafe<T[]>(statement),
      }),
      close: () => client.end({ timeout: 2 }),
    };
  }
  const client = new PGlite(dataDir);
  return {
    db: drizzle(client),
    query: <T extends Record<string, unknown>>(statement: string) => client.query<T>(statement),
    close: () => client.close(),
  };
}
const failures: string[] = [];
function expectSecurityHeaders(label: string, response: Response) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    assert.equal(response.headers.get(name), value, `${label}: ${name}`);
  }
}
try {
  // Running the real startup runner twice must preserve its migration ledger.
  const nub = resolve(import.meta.dirname, "../../../node_modules/.bin/nub");
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = spawnSync(nub, ["--no-env-file", "run", "db:migrate"], {
      env,
      encoding: "utf8",
      timeout: 30_000,
    });
    assert.equal(result.status, 0, `startup migrations failed: ${result.stderr}`);
  }
  const fixture = openFixture();
  const db = fixture.db;
  try {
    const ledger = await fixture.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations",
    );
    const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
    assert.equal(ledger.rows[0].count, journal.entries.length);
    await db.insert(user).values({
      id: "http-smoke",
      email: "smoke@example.invalid",
      name: "Smoke",
      emailVerified: true,
    });
    const [account] = await db
      .insert(schema.appAccounts)
      .values({ userId: "http-smoke", plan: "free" })
      .returning();
    await db.insert(schema.apiKeys).values({
      accountId: account.id,
      name: "dummy",
      keyPrefix: keyPrefix(dummyKey),
      keyHash: hashKey(dummyKey),
      service: "web",
    });
  } finally {
    await fixture.close();
  }

  const server = spawn(process.execPath, [".output/server/index.mjs"], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const exited = once(server, "exit");
  let output = "";
  server.stdout.on("data", (data) => {
    output += data;
  });
  server.stderr.on("data", (data) => {
    output += data;
  });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        ready = (await fetch(`${origin}/api/health`)).ok;
      } catch {
        /* Retry while Nitro binds. */
      }
      if (ready) break;
      assert.equal(server.exitCode, null, `server exited early: ${output}`);
      await sleep(100);
    }
    assert(ready, `server did not start: ${output}`);
    for (const path of ["/pricing", "/login", "/demo", "/api/health"]) {
      const response = await fetch(origin + path);
      assert.equal(response.status, 200, path);
      expectSecurityHeaders(path, response);
      if (path !== "/api/health")
        assert.match(response.headers.get("content-type") ?? "", /text\/html/);
    }
    const asset = readdirSync(".output/public/assets").find((file) => file.endsWith(".js"));
    assert(asset, "no built JS asset found");
    const staticResponse = await fetch(`${origin}/assets/${asset}`);
    assert.equal(staticResponse.status, 200);
    expectSecurityHeaders("static asset", staticResponse);
    const preflight = await fetch(`${origin}/api/ingest`, {
      method: "OPTIONS",
      headers: { Origin: "https://customer.example", "Access-Control-Request-Method": "POST" },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "*");
    expectSecurityHeaders("CORS preflight", preflight);
    const denied = await fetch(`${origin}/api/ingest`, { method: "POST", body: "{}" });
    assert.equal(denied.status, 401);
    expectSecurityHeaders("auth denial", denied);
    const ingest = await fetch(`${origin}/api/ingest`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-blockrate-key": dummyKey },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        url: "/smoke",
        userAgent: "Mozilla/5.0 Chrome/131.0.0.0",
        providers: [
          { name: "ga4", status: "blocked", latency: 3000 },
          { name: "ga4", status: "loaded", latency: 6 },
        ],
      }),
    });
    assert.equal(ingest.status, 204);
    expectSecurityHeaders("ingest", ingest);
  } finally {
    server.kill("SIGTERM");
    const deadline = setTimeout(() => server.kill("SIGKILL"), 15_000);
    const [code, signal] = await exited;
    clearTimeout(deadline);
    if (code !== 0) failures.push(`Nitro shutdown failed (${code}, ${signal})`);
    if (/unhandledRejection|ENOENT|uncaughtException/.test(output)) failures.push(output);
  }
  const persisted = openFixture();
  try {
    const events = await persisted.query<{ user_agent: string }>("SELECT user_agent FROM events");
    assert.equal(events.rows.length, 2);
    assert.equal(events.rows[0].user_agent, "Chrome 131");
    const usage = await persisted.query<{ event_count: number }>(
      "SELECT event_count FROM usage_counters",
    );
    assert.equal(usage.rows[0].event_count, 2);
  } finally {
    await persisted.close();
  }
  assert.equal(failures.length, 0, failures.join("\n"));
  console.log(
    "production Node bundle: idempotent startup migrations, SSR/health/assets, security headers, CORS, auth denial, persisted ingestion/UA truncation/quota and graceful shutdown passed",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
