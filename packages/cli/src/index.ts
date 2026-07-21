#!/usr/bin/env node
/**
 * blockrate-init — scaffold a first-party blockrate reporter route.
 *
 * Zero-dependency, create-only: writes ONE new route file for the detected
 * (or requested) framework and prints the client snippet to paste. It never
 * edits existing files — auto-editing user code is how scaffolding tools
 * lose trust.
 *
 * Usage:
 *   blockrate-init                     Detect framework from package.json
 *   blockrate-init --framework <name>  Skip detection
 *   blockrate-init --help
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const FRAMEWORKS = [
  "next",
  "tanstack-start",
  "sveltekit",
  "nuxt",
  "remix",
  "astro",
] as const;
export type Framework = (typeof FRAMEWORKS)[number];

/** Where the reporter route lives in each framework's conventions. All six
 *  serve POST /api/block-rate. */
export const ROUTE_PATHS: Record<Framework, string> = {
  next: "app/api/block-rate/route.ts",
  "tanstack-start": "src/routes/api/block-rate.ts",
  sveltekit: "src/routes/api/block-rate/+server.ts",
  nuxt: "server/api/block-rate.post.ts",
  remix: "app/routes/api.block-rate.ts",
  astro: "src/pages/api/block-rate.ts",
};

/** package.json dependency marker → framework. First match wins; keep the
 *  specific markers above any that could co-occur. `@react-router/dev` is
 *  the React Router v7 framework-mode marker (plain `react-router` may be
 *  library mode, which has no file routes to scaffold into). */
const DETECTION_MARKERS: [string, Framework][] = [
  ["next", "next"],
  ["@tanstack/react-start", "tanstack-start"],
  ["@sveltejs/kit", "sveltekit"],
  ["nuxt", "nuxt"],
  ["@remix-run/node", "remix"],
  ["@react-router/dev", "remix"],
  ["astro", "astro"],
];

const TEMPLATES_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "templates");

export function detectFramework(pkg: {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}): Framework | null {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const [marker, framework] of DETECTION_MARKERS) {
    if (marker in deps) return framework;
  }
  return null;
}

/** Walk up from `start` looking for a package.json. Returns its directory. */
export function findProjectRoot(start: string): string | null {
  let dir = resolve(start);
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, "package.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
  return null;
}

function usage(exitCode = 0): never {
  const msg = `\
blockrate-init — scaffold a first-party blockrate reporter route

Usage:
  blockrate-init                        Detect framework from package.json
  blockrate-init --framework <name>     Skip detection (${FRAMEWORKS.join(", ")})
  blockrate-init --help                 Show this message

What it does:
  Writes the reporter route for your framework (POST /api/block-rate) that
  forwards to blockrate.app with your API key held server-side. Create-only:
  it never modifies existing files.
`;
  (exitCode === 0 ? console.log : console.error)(msg);
  process.exit(exitCode);
}

const FIRST_PARTY_RATIONALE =
  "https://github.com/afonsojramos/blockrate/tree/main/packages/core#why-the-reporter-endpoint-must-be-first-party";

function printNextSteps(framework: Framework, routePath: string): void {
  console.log(`\nCreated ${routePath} (${framework}).\n`);
  console.log("Next steps:\n");
  console.log("  1. Set your API key in the server environment:");
  console.log("       BLOCKRATE_API_KEY=br_...   (from https://blockrate.app/app/keys)\n");
  console.log("  2. Add the client to any page you want measured:\n");
  console.log('       import { BlockRate } from "blockrate";\n');
  console.log("       new BlockRate({");
  console.log('         providers: ["posthog", "ga4"],');
  console.log("         reporter: (result) =>");
  console.log('           navigator.sendBeacon("/api/block-rate", JSON.stringify(result)),');
  console.log("         sampleRate: 0.1,");
  console.log("       }).check();\n");
  console.log("  Critical: the reporter posts to /api/block-rate on YOUR domain —");
  console.log("  never to blockrate.app directly. Why:");
  console.log(`  ${FIRST_PARTY_RATIONALE}\n`);
  console.log("  3. Deploy. Your dashboard lights up with the first event.\n");
}

export function run(argv: string[], cwd: string): number {
  let frameworkArg: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") usage(0);
    if (arg === "--framework") {
      frameworkArg = argv[++i] ?? null;
    } else if (arg && arg.startsWith("--framework=")) {
      frameworkArg = arg.slice("--framework=".length);
    } else {
      console.error(`error: unknown argument "${arg}"`);
      usage(1);
    }
  }

  if (frameworkArg !== null && !FRAMEWORKS.includes(frameworkArg as Framework)) {
    console.error(
      `error: unknown framework "${frameworkArg}". Supported: ${FRAMEWORKS.join(", ")}`,
    );
    return 1;
  }

  const root = findProjectRoot(cwd);
  if (!root) {
    console.error(
      "error: no package.json found in this directory or any parent.\n" +
        `Run blockrate-init from your app project. Supported frameworks: ${FRAMEWORKS.join(", ")}`,
    );
    return 1;
  }

  let framework: Framework | null = (frameworkArg as Framework | null) ?? null;
  if (!framework) {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    framework = detectFramework(pkg);
  }

  if (!framework) {
    console.log(
      "Could not detect a supported framework from package.json.\n" +
        `Supported: ${FRAMEWORKS.join(", ")}.\n` +
        "Re-run with --framework <name>, or see the manual integrations:\n" +
        "https://github.com/afonsojramos/blockrate/tree/main/examples",
    );
    return 0;
  }

  const routePath = ROUTE_PATHS[framework];
  const target = join(root, routePath);
  if (existsSync(target)) {
    console.error(`error: ${routePath} already exists — not overwriting.`);
    console.error("blockrate-init never modifies existing files. Edit it by hand or remove it.");
    return 1;
  }

  const template = readFileSync(join(TEMPLATES_DIR, `${framework}.ts`), "utf8");
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, template);

  printNextSteps(framework, routePath);
  return 0;
}

if (import.meta.main) {
  process.exit(run(process.argv.slice(2), process.cwd()));
}
