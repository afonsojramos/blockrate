/**
 * Boots the production build in `.output/` and asserts that an HTML page, an
 * API route and a static asset all carry the security headers from
 * `src/lib/security-headers.ts`, and that the ingest preflight keeps its CORS
 * headers. Run after `bun run build`.
 */
import { readdirSync } from "node:fs";
import { SECURITY_HEADERS } from "../src/lib/security-headers";

const PORT = 4319;
const origin = `http://127.0.0.1:${PORT}`;

const server = Bun.spawn(["bun", ".output/server/index.mjs"], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(PORT),
    HOST: "127.0.0.1",
    DATABASE_URL: "pglite://",
    BETTER_AUTH_SECRET:
      process.env.BETTER_AUTH_SECRET ?? "local-placeholder-secret-at-least-32-characters",
  },
  stdout: "inherit",
  stderr: "inherit",
});

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      await fetch(`${origin}/api/health`);
      return;
    } catch {
      await Bun.sleep(200);
    }
  }
  throw new Error(`server did not start on ${origin}`);
}

const failures: string[] = [];

function expectHeader(label: string, response: Response, name: string, expected: string) {
  const actual = response.headers.get(name);
  if (actual !== expected) failures.push(`${label}: ${name} was ${actual}, expected ${expected}`);
}

function expectSecurityHeaders(label: string, response: Response) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    expectHeader(label, response, name, value);
  }
}

try {
  await waitForServer();

  const html = await fetch(`${origin}/pricing`);
  if (!html.headers.get("content-type")?.includes("text/html")) {
    failures.push(`/pricing: expected an HTML response, got ${html.headers.get("content-type")}`);
  }
  expectSecurityHeaders("/pricing", html);

  expectSecurityHeaders("/api/health", await fetch(`${origin}/api/health`));

  const asset = readdirSync(".output/public/assets").find((file) => file.endsWith(".js"));
  if (!asset) throw new Error("no built JS asset found in .output/public/assets");
  expectSecurityHeaders(`/assets/${asset}`, await fetch(`${origin}/assets/${asset}`));

  const preflight = await fetch(`${origin}/api/ingest`, {
    method: "OPTIONS",
    headers: { Origin: "https://customer.example", "Access-Control-Request-Method": "POST" },
  });
  expectHeader("OPTIONS /api/ingest", preflight, "access-control-allow-origin", "*");
  expectSecurityHeaders("OPTIONS /api/ingest", preflight);
} finally {
  server.kill();
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("security headers present on HTML, API, asset and CORS preflight responses");
