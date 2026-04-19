import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/demo")({
  head: () =>
    seo({
      title: "live demo — blockrate",
      description:
        "Check which of 10 common third-party analytics tools (PostHog, Optimizely, GA4, Segment, Hotjar, Amplitude, Mixpanel, and more) are blocked by your browser right now.",
      path: "/demo",
    }),
  component: Demo,
});

interface ProviderResult {
  name: string;
  status: "loaded" | "blocked" | "checking";
  latency: number;
}

const PROVIDERS = [
  "optimizely",
  "posthog",
  "ga4",
  "gtm",
  "segment",
  "hotjar",
  "amplitude",
  "mixpanel",
  "meta-pixel",
  "intercom",
] as const;

function Demo() {
  const [results, setResults] = useState<ProviderResult[]>(
    PROVIDERS.map((name) => ({ name, status: "checking", latency: 0 })),
  );
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  async function runCheck() {
    setRunning(true);
    setDone(false);
    setResults(PROVIDERS.map((name) => ({ name, status: "checking", latency: 0 })));

    // Dynamic import so the library only loads when the user visits /demo
    const { BlockRate } = await import("blockrate");

    const br = new BlockRate({
      providers: [...PROVIDERS],
      delay: 0,
      sampleRate: 1,
      service: "demo",
      sessionKey: "__block_rate_demo",
      reporter: (result) => {
        // Always update the UI
        setResults(
          result.providers.map((p) => ({
            name: p.name,
            status: p.status,
            latency: p.latency,
          })),
        );
        setDone(true);
        setRunning(false);

        // Also report to our own forward route; it 204s when BLOCKRATE_API_KEY
        // is unset so dev is a no-op.
        if (typeof navigator !== "undefined" && navigator.sendBeacon) {
          navigator.sendBeacon("/api/block-rate", JSON.stringify(result));
        }
      },
    });

    // Clear session storage so re-runs work
    try {
      sessionStorage.removeItem("__block_rate_demo");
    } catch {}

    br.check();
  }

  useEffect(() => {
    runCheck();
  }, []);

  const blocked = results.filter((r) => r.status === "blocked").length;
  const loaded = results.filter((r) => r.status === "loaded").length;
  const total = PROVIDERS.length;

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 sm:py-20">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          live demo
        </p>
        <h1 className="text-4xl font-bold tracking-tight">
          What's your browser blocking right now?
        </h1>
        <p className="text-lg text-muted-foreground">
          This page checks 10 common third-party analytics tools from your browser, right now, using
          the same <code className="font-mono text-sm">blockrate</code> library your app would use.
          No data leaves your browser — this is purely client-side.
        </p>
      </header>

      {done && blocked > 0 && (
        <div className="mt-8 rounded-lg border border-rate-high/30 bg-rate-high/5 p-6">
          <div className="flex items-baseline gap-3">
            <span
              className="text-5xl font-bold tabular-nums"
              style={{
                color:
                  blocked > 5
                    ? "var(--rate-high)"
                    : blocked > 2
                      ? "var(--rate-mid)"
                      : "var(--rate-low)",
              }}
            >
              {blocked}
            </span>
            <span className="text-base text-muted-foreground">
              of {total} providers are blocked in your browser.
            </span>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-[width] duration-300 ease-out"
              style={{
                width: `${(blocked / total) * 100}%`,
                background:
                  "linear-gradient(90deg, var(--rate-low), var(--rate-mid), var(--rate-high))",
              }}
            />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            If your app depends on any of these tools, {blocked > 1 ? "those" : "that"}{" "}
            {blocked > 1 ? "services are" : "service is"} invisible for a fraction of your users.
            blockrate.app measures exactly how large that fraction is across your entire audience.
          </p>
        </div>
      )}

      {done && blocked === 0 && (
        <div className="mt-8 rounded-lg border border-rate-low/30 bg-rate-low/5 p-6">
          <div className="flex items-baseline gap-3">
            <span className="text-5xl font-bold tabular-nums" style={{ color: "var(--rate-low)" }}>
              0
            </span>
            <span className="text-base text-muted-foreground">
              providers blocked — your browser lets everything through.
            </span>
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full w-0 rounded-full" />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            You're not running an ad blocker (or it doesn't target these tools). But many of your
            users are — blockrate.app tells you exactly how many per provider.
          </p>
        </div>
      )}

      <Card className="mt-8">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">
                {done ? `${loaded} loaded · ${blocked} blocked` : running ? "Checking..." : "Ready"}
              </CardTitle>
              <CardDescription>
                Each provider is checked via a window global + a HEAD probe to its CDN.
              </CardDescription>
            </div>
            {done && (
              <button
                onClick={runCheck}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-[background-color] duration-150 hover:bg-accent"
              >
                Run again
              </button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-border">
            {results.map((r, i) => (
              <div
                key={r.name}
                className={`flex items-center justify-between py-3 transition-[opacity,transform] duration-150 ease-out ${
                  done ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
                }`}
                style={{ transitionDelay: `${i * 50}ms` }}
              >
                <span className="font-medium">{r.name}</span>
                <div className="flex items-center gap-3">
                  {r.status !== "checking" && (
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {r.latency}ms
                    </span>
                  )}
                  <Badge
                    variant={
                      r.status === "blocked"
                        ? "destructive"
                        : r.status === "loaded"
                          ? "default"
                          : "secondary"
                    }
                    className={`transition-[background-color,color] duration-150 ease-out ${
                      r.status === "loaded"
                        ? "bg-rate-low/15 text-rate-low hover:bg-rate-low/20"
                        : r.status === "checking"
                          ? "animate-pulse"
                          : ""
                    }`}
                  >
                    {r.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="mt-10 space-y-4 text-center">
        <p className="text-sm text-muted-foreground">
          This demo checks provider reachability from your browser. Results are sent to our own
          blockrate.app dashboard (we eat our own dogfood) so we can see aggregate block rates
          across demo visitors. No personal data is collected — only provider name, status, and
          browser family. See our{" "}
          <Link to="/privacy" className="underline-offset-4 hover:underline">
            privacy policy
          </Link>
          .
        </p>
        <div className="flex justify-center gap-3">
          <Link
            to="/signup"
            className="inline-flex h-10 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-[background-color,transform] duration-150 ease-out active:scale-[0.96]"
          >
            Get a hosted account
          </Link>
          <Link
            to="/docs"
            className="inline-flex h-10 items-center rounded-md border border-border px-5 text-sm font-medium transition-[background-color,transform] duration-150 ease-out hover:bg-accent active:scale-[0.96]"
          >
            Read the docs
          </Link>
        </div>
      </div>
    </main>
  );
}
