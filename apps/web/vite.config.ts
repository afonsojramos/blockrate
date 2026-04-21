import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";
import tsconfigPaths from "vite-tsconfig-paths";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

// `bun` is a runtime-only module (no npm package). Rollup must leave
// `import { SQL } from "bun"` as an external so the Bun runtime can
// resolve it at execution time.
const config = defineConfig({
  plugins: [
    devtools(),
    nitro({ rollupConfig: { external: [/^@sentry\//, "bun"] } }),
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
  ssr: {
    external: ["bun"],
    noExternal: [],
  },
  build: {
    rollupOptions: {
      external: ["bun"],
    },
  },
});

export default config;
