import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

import { SECURITY_HEADERS } from "./src/lib/security-headers.ts";

// `bun` is a runtime-only module (no npm package). The bundler must leave
// `import { SQL } from "bun"` as an external so the Bun runtime can
// resolve it at execution time.
const config = defineConfig({
  plugins: [
    devtools(),
    nitro({
      rollupConfig: { external: [/^@sentry\//, "bun"] },
      routeRules: { "/**": { headers: SECURITY_HEADERS } },
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  ssr: {
    external: ["bun"],
    noExternal: [],
  },
  build: {
    rolldownOptions: {
      external: ["bun"],
    },
  },
});

export default config;
