import { builtInProviders } from "./providers";
import { hasCheckedThisSession, markChecked, shouldSample } from "./session";
import type { BlockRateOptions, BlockRateResult, Provider, ProviderResult } from "./types";

export * from "./types";
export { beaconReporter, serverReporter } from "./reporter";
export type { ServerReporterOptions } from "./reporter";
export { probe } from "./probe";
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

  constructor(options: BlockRateOptions) {
    this.providers = options.providers
      .map((p) => (typeof p === "string" ? builtInProviders[p] : p))
      .filter((p): p is Provider => !!p);
    this.reporter = options.reporter;
    this.sampleRate = options.sampleRate ?? 1;
    this.delay = options.delay ?? 3000;
    this.sessionKey = options.sessionKey ?? "__block_rate";
    this.service = options.service;
  }

  async check(): Promise<BlockRateResult | null> {
    if (typeof window === "undefined") return null;
    if (hasCheckedThisSession(this.sessionKey)) return null;
    if (!shouldSample(this.sampleRate)) {
      markChecked(this.sessionKey);
      return null;
    }
    markChecked(this.sessionKey);

    if (this.delay > 0) {
      await new Promise((r) => setTimeout(r, this.delay));
    }

    const providerResults = await Promise.all(
      this.providers.map(async (p): Promise<ProviderResult> => {
        const start = typeof performance !== "undefined" ? performance.now() : Date.now();
        const status = await p.detect().catch((): "blocked" => "blocked");
        const end = typeof performance !== "undefined" ? performance.now() : Date.now();
        return { name: p.name, status, latency: Math.round(end - start) };
      }),
    );

    const result: BlockRateResult = {
      timestamp: new Date().toISOString(),
      url: typeof location !== "undefined" ? location.pathname : "",
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      providers: providerResults,
      ...(this.service ? { service: this.service } : {}),
    };

    try {
      this.reporter(result);
    } catch {
      // Silently fail
    }

    return result;
  }
}
