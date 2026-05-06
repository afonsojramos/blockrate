import { builtInProviders } from "./providers";
import { hasCheckedThisSession, markChecked, shouldSample } from "./session";
import type { BlockRateOptions, BlockRateResult, Provider, ProviderResult } from "./types";

export * from "./types";
export { beaconReporter, serverReporter } from "./reporter";
export type { ServerReporterOptions } from "./reporter";
export { createWebHandler } from "./handler";
export type { BlockRateHandlerOptions, ForwardError, ForwardOptions } from "./handler";
export { isValidBlockRateResult } from "./validate";
export { probe, probeImage } from "./probe";
export {
  builtInProviders,
  optimizely,
  posthog,
  ga4,
  gtm,
  segment,
  hotjar,
  amplitude,
  mixpanel,
  metaPixel,
  intercom,
} from "./providers";

export function createProvider(provider: Provider): Provider {
  return provider;
}

export class BlockRate {
  private providers: Provider[];
  private reporter: BlockRateOptions["reporter"];
  private sampleRate: number;
  private delay: number;
  private sessionKey: string;
  private service: string | undefined;
  private consentGiven: boolean | (() => boolean);
  private sanitizeUrl: ((url: string) => string) | undefined;
  private sessionDedup: boolean;

  constructor(options: BlockRateOptions) {
    this.providers = options.providers
      .map((p) => (typeof p === "string" ? builtInProviders[p] : p))
      .filter((p): p is Provider => !!p);
    this.reporter = options.reporter;
    this.sampleRate = options.sampleRate ?? 1;
    this.delay = options.delay ?? 3000;
    this.sessionKey = options.sessionKey ?? "__block_rate";
    this.service = options.service;
    this.consentGiven = options.consentGiven ?? true;
    this.sanitizeUrl = options.sanitizeUrl;
    this.sessionDedup = options.sessionDedup ?? false;
  }

  async check(): Promise<BlockRateResult | null> {
    if (typeof window === "undefined") return null;

    // Consent gate — skip if consent not (yet) given
    const consent =
      typeof this.consentGiven === "function" ? this.consentGiven() : this.consentGiven;
    if (!consent) return null;

    // Session dedup — only when explicitly opted in
    if (this.sessionDedup) {
      if (hasCheckedThisSession(this.sessionKey)) return null;
      markChecked(this.sessionKey);
    }

    if (!shouldSample(this.sampleRate)) return null;

    if (this.delay > 0) {
      await new Promise((r) => setTimeout(r, this.delay));
    }

    const providerResults = await Promise.all(
      this.providers.map(async (p): Promise<ProviderResult> => {
        const start = typeof performance !== "undefined" ? performance.now() : Date.now();
        // A throwing `detect()` is treated as "blocked" because that is the
        // closest defensible classification — but a probe bug (or a custom
        // provider crash) inflating the numerator silently is a debugging
        // hole, so log the underlying error. Use console.warn so it lands
        // in DevTools without escalating to the page's error pipeline.
        const status = await p.detect().catch((err): "blocked" => {
          try {
            console.warn(`[blockrate] provider "${p.name}" detect() threw:`, err);
          } catch {
            // ignore environments where console.warn is itself broken
          }
          return "blocked";
        });
        const end = typeof performance !== "undefined" ? performance.now() : Date.now();
        return { name: p.name, status, latency: Math.round(end - start) };
      }),
    );

    let url = typeof location !== "undefined" ? location.pathname : "";
    if (this.sanitizeUrl) url = this.sanitizeUrl(url);

    const result: BlockRateResult = {
      timestamp: new Date().toISOString(),
      url,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      providers: providerResults,
      ...(this.service ? { service: this.service } : {}),
    };

    try {
      this.reporter(result);
    } catch (err) {
      // A throwing reporter means the entire measurement pipeline is dark
      // — no events reach the dashboard, and the customer has no signal
      // about why. Surface it via console.warn so the failure is visible
      // in DevTools rather than swallowed silently.
      try {
        console.warn("[blockrate] reporter threw:", err);
      } catch {
        // ignore environments where console.warn is itself broken
      }
    }

    return result;
  }
}
