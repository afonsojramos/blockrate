/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BETTER_AUTH_URL: string;
  /**
   * Public blockrate API key used for dogfooding the OSS library on
   * blockrate.app itself. The landing/marketing surface reports to its own
   * /api/ingest. When unset, the dogfood hook is a no-op (dev mode).
   */
  readonly VITE_BLOCKRATE_PUBLIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
