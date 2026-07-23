/**
 * Guards the root Dockerfile's `deps` stage against workspace-member rot.
 *
 * The deps stage copies each workspace member's package.json by hand before
 * `bun install --frozen-lockfile` (only manifests, so the install layer caches
 * on source edits). Miss one and bun recomputes a different resolution graph
 * and the Railway build fails with "lockfile had changes, but lockfile is
 * frozen" — silently, only after a push. This test turns that into a loud,
 * local failure that names the exact COPY line to add.
 *
 * It lives in apps/web/test because the Dockerfile deploys the web app and
 * this suite already runs in CI (`cd apps/web && bun test`); the guard is
 * about repo-root infra, not the web app itself.
 */

import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(__dirname, "..", "..", "..");

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
            `Add before \`RUN bun install --frozen-lockfile\`:\n` +
            missing.map((m) => `  COPY ${m}/package.json ${m}/`).join("\n"),
    ).toEqual([]);
  });
});
