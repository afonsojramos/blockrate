import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  envDir: false,
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "#": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    name: "web",
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    maxWorkers: 1,
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});
