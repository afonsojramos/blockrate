import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import { createServer } from "node:net";

const root = resolve(import.meta.dirname, "..");
const dir = mkdtempSync(join(tmpdir(), "blockrate-package-"));
const node = process.execPath;
const npm = join(dirname(node), "npm");
const bin = join(dir, "bin");
mkdirSync(bin);
symlinkSync(node, join(bin, "node"));
const env = {
  PATH: `${bin}:/usr/bin:/bin`,
  HOME: dir,
  npm_config_userconfig: "/dev/null",
  npm_config_cache: join(dir, "cache"),
};
function run(command: string, args: string[], cwd = dir) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...env, DB_PATH: join(dir, "consumer.db") },
    encoding: "utf8",
    timeout: 180_000,
  });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")} failed: ${result.error ?? result.stderr}\n${result.stdout}`,
  );
  return result.stdout;
}
async function freePort() {
  const socket = createServer();
  socket.listen(0, "127.0.0.1");
  await once(socket, "listening");
  const address = socket.address();
  assert(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((done, reject) => socket.close((err) => (err ? reject(err) : done())));
  return port;
}
try {
  run("/bin/sh", ["-c", "! command -v bun && ! command -v nub"]);
  const tarballs = ["core", "server", "cli"].map((name) => {
    const packed = JSON.parse(
      run(npm, ["pack", "--json", "--pack-destination", dir], join(root, "packages", name)),
    );
    return join(dir, packed[0].filename);
  });
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "consumer", private: true, type: "module" }),
  );
  const typeTools = ["typescript", "@types/node", "@types/react"].map((name) => {
    const manifest = JSON.parse(
      readFileSync(join(root, "node_modules", name, "package.json"), "utf8"),
    );
    return `${name}@${manifest.version}`;
  });
  run(npm, [
    "install",
    "--omit=dev",
    "--no-audit",
    "--no-fund",
    ...tarballs,
    "react@19.3.0",
    ...typeTools,
  ]);
  writeFileSync(
    join(dir, "consumer.ts"),
    `import * as server from "blockrate-server";
import * as ua from "blockrate-server/ua";
import * as rateLimit from "blockrate-server/rate-limit";
import * as validation from "blockrate-server/validate";
const store: Promise<server.BlockRateStore> = server.createStore({ url: ":memory:" });
void store; void ua; void rateLimit; void validation;
`,
  );
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        module: "ESNext",
        moduleResolution: "Bundler",
        target: "ES2022",
        lib: ["ES2022", "DOM"],
        strict: true,
        skipLibCheck: true,
        noEmit: true,
        types: ["node", "react"],
      },
      include: ["consumer.ts"],
    }),
  );
  run(join(dir, "node_modules/.bin/tsc"), ["--project", "tsconfig.json"]);
  // This consumer has Node only on PATH, no workspace or global Nub loader.
  run(node, [
    "--input-type=module",
    "-e",
    `
    import assert from 'node:assert/strict';
    import {createRequire} from 'node:module';
    import {createStore,PostgresStore} from 'blockrate-server';
    const require=createRequire(import.meta.url);
    assert.equal(typeof require('blockrate').BlockRate,'function');
    assert.equal(typeof require('blockrate-server').createStore,'function');
    for(const path of ['','/react','/next','/sveltekit','/tanstack-start','/astro','/remix','/nuxt','/proxy']) await import('blockrate'+path);
    for(const path of ['/ua','/rate-limit','/validate']) await import('blockrate-server'+path);
    const store=await createStore({url: 'consumer.db'});
    const tenant=await store.createTenant({name:'consumer',apiKey:'br_dummy_consumer'});
    await store.insertEvents([{tenantId:tenant.id,service:'web',timestamp:new Date(),url:'/',userAgent:'Chrome',provider:'ga4',status:'blocked',latency:1}]);
    await store.close();
    const reopened=await createStore({url:'consumer.db'});
    assert.equal((await reopened.findTenantByName('consumer')).id,tenant.id);
    assert.equal((await reopened.getStats({tenantId:tenant.id,since:new Date(0)}))[0].blockRate,1);
    await reopened.close();
    const pg=await PostgresStore.fromPglite();
    assert.equal((await pg.createTenant({name:'pg',apiKey:'br_dummy_pg'})).name,'pg');
    await pg.close();
  `,
  ]);
  const serverBin = join(dir, "node_modules/.bin/blockrate-server");
  const initBin = join(dir, "node_modules/.bin/blockrate-init");
  assert.match(run(serverBin, ["--help"]), /tenant create/);
  assert.match(run(initBin, ["--help"]), /--framework/);
  for (const framework of ["next", "tanstack-start", "sveltekit", "nuxt", "remix", "astro"]) {
    const app = join(dir, framework);
    mkdirSync(app);
    writeFileSync(join(app, "package.json"), '{"name":"fixture"}');
    assert.match(run(initBin, ["--framework", framework], app), /Created/);
  }
  const port = await freePort();
  const child = spawn(serverBin, [], {
    cwd: dir,
    env: { ...env, PORT: String(port), DB_PATH: "consumer.db" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (data) => {
    output += data;
  });
  child.stderr.on("data", (data) => {
    output += data;
  });
  const exit = once(child, "exit");
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        ready = (await fetch(`http://127.0.0.1:${port}/health`)).ok;
      } catch {
        /* Retry until the child binds. */
      }
      if (ready) break;
      if (child.exitCode !== null) throw new Error(`CLI exited early: ${output}`);
      await sleep(100);
    }
    assert(ready, `CLI failed to start: ${output}`);
    const origin = `http://127.0.0.1:${port}`;
    const preflight = await fetch(`${origin}/ingest`, { method: "OPTIONS" });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "*");
    assert.equal((await fetch(`${origin}/stats`)).status, 401);
    assert.match(await (await fetch(`${origin}/dashboard`)).text(), /blockrate/);
    const payload = {
      timestamp: new Date().toISOString(),
      url: "/",
      userAgent: "Chrome 131",
      providers: [{ name: "ga4", status: "loaded", latency: 6 }],
    };
    assert.equal(
      (
        await fetch(`${origin}/ingest`, {
          method: "POST",
          headers: { "x-blockrate-key": "br_dummy_consumer", "content-type": "application/json" },
          body: JSON.stringify(payload),
        })
      ).status,
      204,
    );
    const stats = await (
      await fetch(`${origin}/stats`, { headers: { "x-blockrate-key": "br_dummy_consumer" } })
    ).json();
    assert.equal(stats.stats[0].blockRate, 0.5);
    assert.equal(stats.stats[0].avgLatency, 6);
  } finally {
    child.kill("SIGTERM");
    const timer = setTimeout(() => child.kill("SIGKILL"), 15_000);
    const [code, signal] = await exit;
    clearTimeout(timer);
    assert.equal(code, 0, `CLI shutdown failed (${signal}): ${output}`);
  }
  assert.match(run(serverBin, ["tenant", "list"]), /consumer/);
  const core = readFileSync(join(dir, "node_modules/blockrate/dist/index.js"), "utf8");
  assert.doesNotMatch(core, /bun:|node:|better-sqlite3|drizzle-orm|@nubjs/);
  console.log(
    "npm tarballs: all SDK exports, both CLIs, SQLite persistence, PGlite migrations, HTTP ingestion/CORS/rates and graceful SIGTERM passed without Nub or Bun on consumer PATH",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
