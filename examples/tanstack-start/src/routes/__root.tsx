import { Outlet, createRootRoute } from "@tanstack/react-router";
import { useBlockRate } from "block-rate/react";

function RootComponent() {
  useBlockRate({
    providers: ["optimizely", "posthog", "ga4"],
    reporter: (result) => {
      fetch("/api/block-rate", {
        method: "POST",
        body: JSON.stringify(result),
        headers: { "Content-Type": "application/json" },
      });
    },
    sampleRate: 0.1,
  });

  return <Outlet />;
}

export const Route = createRootRoute({ component: RootComponent });
