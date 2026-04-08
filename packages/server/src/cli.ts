#!/usr/bin/env bun
import { createServer } from "./server";

const port = Number(process.env.PORT) || 4318;
const dbPath = process.env.DB_PATH || "./block-rate.db";

const app = createServer({ port, dbPath });

Bun.serve({
  port,
  fetch: app.fetch,
});

console.log(`[block-rate-server] listening on http://localhost:${port}`);
console.log(`[block-rate-server] dashboard: http://localhost:${port}/dashboard`);
