import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

import { SECURITY_HEADERS } from "./src/lib/security-headers.ts";

const config = defineConfig({
  envDir: false,
  plugins: [
    devtools(),
    nitro({
      preset: "node-server",
      features: { runtimeHooks: true },
      rollupConfig: { external: [/^@sentry\//, /^@electric-sql\/pglite/] },
      routeRules: { "/**": { headers: SECURITY_HEADERS } },
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
  ssr: { external: ["@electric-sql/pglite"] },
  resolve: {
    tsconfigPaths: true,
  },
});

export default config;
