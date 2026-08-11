// First-party PostHog proxy. Serves PostHog's SDK and event ingestion
// through a subpath on your own domain, so hostname-based filter rules
// can't block it without blocking your whole site.
//
// The mount segment ("m" here) should be unguessable in production —
// avoid /analytics or /track, which path-token rules already target.
//
// Point the SDK at the proxy:
//
//   posthog.init(token, {
//     api_host: `${window.location.origin}/m`,
//     ui_host: "https://us.posthog.com",
//   });
//
// EU cloud projects: pass `region: "eu"`.
import { createBlockRateProxy } from "blockrate/proxy";

const proxy = createBlockRateProxy({ provider: "posthog", prefix: "/m" });

export const GET = proxy;
export const POST = proxy;
export const OPTIONS = proxy;
