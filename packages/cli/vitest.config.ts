import { defineConfig } from "vitest/config";

export default defineConfig({
  envDir: false,
  test: { name: "cli", include: ["test/**/*.test.ts"], testTimeout: 15000 },
});
