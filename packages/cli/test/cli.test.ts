/**
 * blockrate-init CLI — end-to-end against temp directories with fixture
 * package.json files. Spawns the CLI from source (bun runs TS directly);
 * the build artifact is verified separately by `bun run build`.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";

const CLI = resolve(__dirname, "..", "src", "index.ts");

function runCli(cwd: string, args: string[] = []) {
  const proc = Bun.spawnSync(["bun", CLI, ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    code: proc.exitCode,
    stdout: proc.stdout.toString(),
    stderr: proc.stderr.toString(),
  };
}

function writePkg(dir: string, deps: Record<string, string>) {
  writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "fixture", dependencies: deps }));
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "blockrate-init-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("blockrate-init", () => {
  it("detects Next.js and writes the App Router route", () => {
    writePkg(dir, { next: "15.0.0" });
    const r = runCli(dir);
    expect(r.code).toBe(0);
    const route = readFileSync(join(dir, "app/api/block-rate/route.ts"), "utf8");
    expect(route).toContain('from "blockrate/next"');
    expect(route).toContain("BLOCKRATE_API_KEY");
  });

  it("detects each supported framework from its dependency marker", () => {
    const cases: [Record<string, string>, string][] = [
      [{ next: "15.0.0" }, "app/api/block-rate/route.ts"],
      [{ "@tanstack/react-start": "1.0.0" }, "src/routes/api/block-rate.ts"],
      [{ "@sveltejs/kit": "2.0.0" }, "src/routes/api/block-rate/+server.ts"],
      [{ nuxt: "4.0.0" }, "server/api/block-rate.post.ts"],
      [{ "@remix-run/node": "2.0.0" }, "app/routes/api.block-rate.ts"],
      [{ "@react-router/dev": "7.0.0" }, "app/routes/api.block-rate.ts"],
      [{ astro: "5.0.0" }, "src/pages/api/block-rate.ts"],
    ];
    for (const [deps, routePath] of cases) {
      rmSync(join(dir, "package.json"), { force: true });
      writePkg(dir, deps);
      const r = runCli(dir);
      expect(r.code).toBe(0);
      expect(existsSync(join(dir, routePath))).toBe(true);
      // Reset for the next case.
      rmSync(join(dir, routePath.split("/")[0]!), { recursive: true, force: true });
    }
  });

  it("--framework overrides detection", () => {
    writePkg(dir, { next: "15.0.0" });
    const r = runCli(dir, ["--framework", "sveltekit"]);
    expect(r.code).toBe(0);
    expect(existsSync(join(dir, "src/routes/api/block-rate/+server.ts"))).toBe(true);
    expect(existsSync(join(dir, "app/api/block-rate/route.ts"))).toBe(false);
  });

  it("exits 0 with guidance on an unrecognized project", () => {
    writePkg(dir, { react: "19.0.0" });
    const r = runCli(dir);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Could not detect");
    expect(r.stdout).toContain("tanstack-start");
    expect(existsSync(join(dir, "app"))).toBe(false);
  });

  it("never overwrites an existing route file", () => {
    writePkg(dir, { next: "15.0.0" });
    const routePath = join(dir, "app/api/block-rate/route.ts");
    mkdirSync(dirname(routePath), { recursive: true });
    writeFileSync(routePath, "// user code — do not touch\n");
    const r = runCli(dir);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain("already exists");
    expect(readFileSync(routePath, "utf8")).toBe("// user code — do not touch\n");
  });

  it("prints a first-party client snippet and never blockrate.app as the reporter", () => {
    writePkg(dir, { next: "15.0.0" });
    const r = runCli(dir);
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('navigator.sendBeacon("/api/block-rate"');
    expect(r.stdout).toContain("BLOCKRATE_API_KEY");
    // The only allowed mention of blockrate.app is the "never post directly"
    // warning and the dashboard URL for keys.
    for (const line of r.stdout.split("\n")) {
      if (line.includes("sendBeacon")) expect(line).not.toContain("blockrate.app");
    }
  });

  it("finds the project root from a nested cwd", () => {
    writePkg(dir, { next: "15.0.0" });
    const nested = join(dir, "src", "deep", "nest");
    mkdirSync(nested, { recursive: true });
    const r = runCli(nested);
    expect(r.code).toBe(0);
    expect(existsSync(join(dir, "app/api/block-rate/route.ts"))).toBe(true);
  });

  it("rejects an unknown --framework value", () => {
    writePkg(dir, { next: "15.0.0" });
    const r = runCli(dir, ["--framework", "rails"]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('unknown framework "rails"');
  });

  it("errors cleanly when no package.json exists anywhere above", () => {
    const empty = mkdtempSync(join(tmpdir(), "blockrate-init-empty-"));
    try {
      // /tmp itself has no package.json; the walk-up must exhaust.
      const r = runCli(empty);
      expect(r.code).toBe(1);
      expect(r.stderr).toContain("no package.json");
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
