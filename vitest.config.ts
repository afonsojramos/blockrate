import { defineConfig } from "vitest/config";

export default defineConfig({
  envDir: false,
  test: {
    projects: ["packages/*/vitest.config.ts", "apps/web/vitest.config.ts"],
    maxWorkers: 1,
    coverage: { provider: "v8" },
  },
});
