#!/usr/bin/env bun
/**
 * Lockstep version bump for `blockrate` and `blockrate-server`.
 *
 * Usage:
 *   bun run bump 0.2.0
 *   bun run bump 1.0.0-rc.1
 *
 * Updates packages/core/package.json and packages/server/package.json to
 * the same version. Commits and tags are deliberately left for you —
 * this script only edits files so you can review the diff before
 * landing it.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const version = process.argv[2];
if (!version) {
  console.error("usage: bun run bump <semver>");
  console.error("  e.g. bun run bump 0.2.0");
  console.error("       bun run bump 1.0.0-rc.1");
  process.exit(1);
}
if (!SEMVER.test(version)) {
  console.error(`"${version}" is not a valid semver.`);
  process.exit(1);
}

const repoRoot = resolve(import.meta.dir, "..");
const packages = ["packages/core/package.json", "packages/server/package.json"];

for (const rel of packages) {
  const path = resolve(repoRoot, rel);
  const pkg = JSON.parse(readFileSync(path, "utf-8"));
  const from = pkg.version;
  pkg.version = version;
  writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`${pkg.name.padEnd(20)} ${from} → ${version}`);
}

console.log("\nnext steps:");
console.log("  git add packages/core/package.json packages/server/package.json");
console.log(`  git commit -m "chore: bump to ${version}"`);
console.log("  # merge to main, then:");
console.log(`  git tag v${version} && git push origin v${version}`);
