import { build } from "esbuild";
import { chmodSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const name = process.argv[2];
if (!["core", "server", "cli"].includes(name)) throw new Error(`unknown package: ${name}`);
const root = resolve(import.meta.dirname, "../packages", name);
const dist = resolve(root, "dist");
rmSync(dist, { recursive: true, force: true });

if (name === "core") {
  const entrypoints = [
    "index",
    "react/index",
    "next/index",
    "sveltekit/index",
    "tanstack-start/index",
    "astro/index",
    "remix/index",
    "nuxt/index",
    "proxy/index",
  ];
  for (const entry of entrypoints) {
    await build({
      entryPoints: [resolve(root, `src/${entry}.ts`)],
      outfile: resolve(dist, `${entry}.js`),
      bundle: true,
      format: "esm",
      platform: "browser",
      target: "es2020",
      minify: true,
      external: ["react"],
      logLevel: "info",
    });
  }
  await build({
    entryPoints: [resolve(root, "src/index.ts")],
    outfile: resolve(dist, "index.cjs"),
    bundle: true,
    format: "cjs",
    platform: "browser",
    target: "es2020",
    minify: true,
    logLevel: "info",
  });
} else if (name === "server") {
  // Keep entrypoints two directories below the package root so both migration
  // folders resolve identically from source stores and bundled entrypoints.
  await build({
    entryPoints: ["index", "cli", "ua", "rate-limit", "validate"].map((entry) =>
      resolve(root, `src/${entry}.ts`),
    ),
    outdir: resolve(dist, "src"),
    bundle: true,
    packages: "external",
    format: "esm",
    platform: "node",
    target: "node24",
    logLevel: "info",
  });
  chmodSync(resolve(dist, "src/cli.js"), 0o755);
} else {
  await build({
    entryPoints: [resolve(root, "src/index.ts")],
    outfile: resolve(dist, "index.js"),
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node24",
    logLevel: "info",
  });
  chmodSync(resolve(dist, "index.js"), 0o755);
}
