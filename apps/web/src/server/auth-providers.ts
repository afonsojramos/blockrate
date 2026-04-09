/**
 * Server function that exposes which OAuth providers are configured.
 * The /login and /signup loaders call this so the client knows whether
 * to render the OAuth buttons. The capabilities object lives in
 * env.server.ts and is the single source of truth.
 */

import { createServerFn } from "@tanstack/react-start";

export const getAuthProviders = createServerFn({ method: "GET" }).handler(
  async () => {
    const { capabilities } = await import("@/lib/env.server");
    return {
      google: capabilities.google,
      github: capabilities.github,
    };
  }
);

export type AuthProviders = Awaited<ReturnType<typeof getAuthProviders>>;
