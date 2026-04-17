// TanStack Start example: client side of the integration. The reporter
// posts to a same-origin /api/block-rate route that forwards upstream
// with the API key held on the server. See the matching server file at
// src/routes/api/block-rate.ts.
//
// The reporter endpoint must be first-party — see
// https://github.com/afonsojramos/blockrate/tree/main/packages/core#why-the-reporter-endpoint-must-be-first-party
import { Outlet, createRootRoute } from "@tanstack/react-router";
import { useBlockRate } from "blockrate/react";

function RootComponent() {
  useBlockRate({
    providers: ["optimizely", "posthog", "ga4"],
    reporter: (result) => {
      fetch("/api/block-rate", {
        method: "POST",
        body: JSON.stringify(result),
        headers: { "Content-Type": "application/json" },
        keepalive: true,
      }).catch(() => {});
    },
    sampleRate: 0.1,
  });

  return <Outlet />;
}

export const Route = createRootRoute({ component: RootComponent });
