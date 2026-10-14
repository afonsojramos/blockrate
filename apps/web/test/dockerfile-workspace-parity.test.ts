/**
 * Guards the root Dockerfile's `deps` stage against workspace-member rot.
 *
 * The deps stage copies each workspace member's package.json by hand before
 * `nub --no-env-file install --frozen-lockfile` (only manifests, so the install layer caches
 * on source edits). Miss one and the installer recomputes a different resolution graph
 * and the Railway build fails with "lockfile had changes, but lockfile is
 * frozen" — silently, only after a push. This test turns that into a loud,
 * local failure that names the exact COPY line to add.
 *
 * It lives in apps/web/test because the Dockerfile deploys the web app and
 * this suite already runs in CI (`cd apps/web && nub run test`); the guard is
 * about repo-root infra, not the web app itself.
 */

import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..", "..");

/** Workspace members are the glob matches that actually carry a package.json;
 *  only those end up in bun.lock and so must be staged in the deps layer. */
function workspaceMembers(): string[] {
  const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
    workspaces?: { packages?: string[] } | string[];
  };
  const globs = Array.isArray(pkg.workspaces) ? pkg.workspaces : (pkg.workspaces?.packages ?? []);

  const members: string[] = [];
  for (const glob of globs) {
    // All current globs are single-level "<prefix>/*". Fail loudly if that
    // assumption ever changes rather than silently under-matching.
    const match = glob.match(/^([^*]+)\/\*$/);
    if (!match) throw new Error(`unsupported workspace glob "${glob}" — extend this test`);
    const prefix = match[1]!;
    const dir = resolve(ROOT, prefix);
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory() && existsSync(resolve(dir, entry.name, "package.json"))) {
        members.push(`${prefix}/${entry.name}`);
      }
    }
  }
  return members.sort();
}

/** The text of the `FROM base AS deps` stage, up to the next FROM. */
function depsStage(): string {
  const dockerfile = readFileSync(resolve(ROOT, "Dockerfile"), "utf8");
  const start = dockerfile.search(/^FROM .+ AS deps$/m);
  if (start === -1)
    throw new Error("could not find the `FROM ... AS deps` stage in the Dockerfile");
  const rest = dockerfile.slice(start);
  const nextFrom = rest.slice(1).search(/^FROM /m);
  return nextFrom === -1 ? rest : rest.slice(0, nextFrom + 1);
}

describe("Dockerfile deps stage stages every workspace manifest", () => {
  it("copies each workspace member's package.json before frozen-lockfile install", () => {
    const stage = depsStage();
    const missing = workspaceMembers().filter((m) => !stage.includes(`${m}/package.json`));
    expect(
      missing,
      missing.length === 0
        ? ""
        : `Dockerfile deps stage is missing COPY lines for new workspace members.\n` +
            `Add before \`RUN nub --no-env-file install --frozen-lockfile\`:\n` +
            missing.map((m) => `  COPY ${m}/package.json ${m}/`).join("\n"),
    ).toEqual([]);
  });
});

describe("Docker Node packaging", () => {
  it("pins the same runtime as mise and keeps a portable workspace install", () => {
    const dockerfile = readFileSync(resolve(ROOT, "Dockerfile"), "utf8");
    const manifest = readFileSync(resolve(ROOT, "mise.toml"), "utf8");
    expect(dockerfile).toContain("FROM node:24.21.0-");
    expect(manifest).toContain('node = "24.21.0"');
    expect(dockerfile).toContain("@nubjs/nub@0.9.6");
    expect(manifest).toContain('"npm:@nubjs/nub" = "0.9.6"');
    expect(depsStage()).toContain(".npmrc");
    expect(readFileSync(resolve(ROOT, ".npmrc"), "utf8")).toContain("node-linker=hoisted");
    expect(dockerfile).toContain("COPY --from=deps /app .");
    expect(dockerfile).toContain("exec node .output/server/index.mjs");
    expect(dockerfile).not.toMatch(/\bbun (?:install|run)|oven\/bun/);
  });
});

it("uses round-trippable local dependency edges with Nub's bun.lock writer", () => {
  const members = workspaceMembers();
  const names = new Map(
    members.map((member) => [
      JSON.parse(readFileSync(resolve(ROOT, member, "package.json"), "utf8")).name,
      member,
    ]),
  );
  for (const member of members) {
    const pkg = JSON.parse(readFileSync(resolve(ROOT, member, "package.json"), "utf8"));
    for (const [name, specifier] of Object.entries({
      ...pkg.dependencies,
      ...pkg.devDependencies,
    })) {
      const target = names.get(name);
      if (!target) continue;
      // Nub 0.9.6's workspace:* writer loses package records on a round trip.
      expect(specifier).toMatch(/^link:/);
      expect(resolve(ROOT, member, String(specifier).slice(5))).toBe(resolve(ROOT, target));
    }
  }
});
