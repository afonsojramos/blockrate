import { defineConfig } from "vitest/config";

export default defineConfig({
  envDir: false,
  test: { name: "server", include: ["test/**/*.test.ts"], testTimeout: 15000 },
});
