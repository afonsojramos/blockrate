#!/usr/bin/env bun
import { createServer } from "./server";
import { createStore } from "./stores";
import { createTenant, listTenants, deleteTenant, rotateTenantKey } from "./tenant";
import type { Dialect } from "./store";

const dbPath = process.env.DB_PATH || "./blockrate.db";
const port = Number(process.env.PORT) || 4318;
const dialect: Dialect = (process.env.DB_DIALECT as Dialect) || "sqlite";

const [cmd, sub, ...rest] = process.argv.slice(2);

function usage(exitCode = 0): never {
  const msg = `\
blockrate-server — self-hostable blockrate ingestion + dashboard

Usage:
  blockrate-server                       Start the server (default)
  blockrate-server serve                 Start the server
  blockrate-server tenant create <name>  Create a tenant and print its API key
  blockrate-server tenant list           List all tenants
  blockrate-server tenant delete <name>  Delete a tenant and all its events
  blockrate-server tenant rotate <name>  Rotate a tenant's API key

Environment:
  PORT                       HTTP port (default 4318)
  DB_DIALECT                 sqlite | postgres (default sqlite)
  DB_PATH                    SQLite file path or Postgres connection URL
                             (default ./blockrate.db)
  BLOCK_RATE_BOOTSTRAP_KEY   Pin the bootstrap tenant's API key
  BLOCK_RATE_BOOTSTRAP_NAME  Name of the bootstrap tenant (default "default")
`;
  (exitCode === 0 ? console.log : console.error)(msg);
  process.exit(exitCode);
}

if (cmd === "tenant") {
  const store = await createStore({ dialect, url: dbPath });
  switch (sub) {
    case "create": {
      const name = rest[0];
      if (!name) {
        console.error("error: tenant name is required");
        usage(1);
      }
      try {
        const tenant = await createTenant(store, name);
        console.log(`Created tenant "${tenant.name}"`);
        console.log(`API key: ${tenant.apiKey}`);
        console.log("Store this securely — it will not be shown again.");
      } catch (err) {
        console.error((err as Error).message);
        process.exit(1);
      }
      break;
    }
    case "list": {
      const rows = await listTenants(store);
      if (rows.length === 0) {
        console.log("(no tenants)");
      } else {
        for (const t of rows) {
          const masked = t.apiKey.slice(0, 6) + "…" + t.apiKey.slice(-4);
          console.log(`${t.id}\t${t.name}\t${masked}`);
        }
      }
      break;
    }
    case "delete": {
      const name = rest[0];
      if (!name) {
        console.error("error: tenant name is required");
        usage(1);
      }
      const ok = await deleteTenant(store, name);
      if (!ok) {
        console.error(`tenant "${name}" not found`);
        process.exit(1);
      }
      console.log(`Deleted tenant "${name}"`);
      break;
    }
    case "rotate": {
      const name = rest[0];
      if (!name) {
        console.error("error: tenant name is required");
        usage(1);
      }
      const key = await rotateTenantKey(store, name);
      if (!key) {
        console.error(`tenant "${name}" not found`);
        process.exit(1);
      }
      console.log(`Rotated API key for "${name}"`);
      console.log(`API key: ${key}`);
      break;
    }
    default:
      usage(1);
  }
  store.close();
  process.exit(0);
}

if (cmd === "help" || cmd === "--help" || cmd === "-h") {
  usage(0);
}

if (cmd && cmd !== "serve") {
  console.error(`unknown command: ${cmd}`);
  usage(1);
}

const app = await createServer({ port, dbPath, dialect });

Bun.serve({ port, fetch: app.fetch });

console.log(`[blockrate-server] listening on http://localhost:${port} (${dialect})`);
console.log(`[blockrate-server] dashboard: http://localhost:${port}/dashboard`);
