import { builtInProviders } from "./providers";
import { hasCheckedThisSession, markChecked, shouldSample } from "./session";
import { warn } from "./warn";
import type {
  BlockRateOptions,
  BlockRateResult,
  Provider,
  ProviderResult,
  ProviderStatus,
} from "./types";

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

const DEFAULT_DETECT_TIMEOUT_MS = 3000;

function warnReporter(error: unknown): void {
  warn("[blockrate] reporter threw:", error);
}

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
    for (const provider of this.providers) {
      const timeoutMs = provider.timeoutMs;
      if (
        timeoutMs !== undefined &&
        (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2147483647)
      ) {
        throw new RangeError(
          `[blockrate] provider "${provider.name}" timeoutMs must be an integer from 1 to 2147483647`,
        );
      }
    }
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
        let status: ProviderStatus;
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const timeoutMs =
            p.timeoutMs ?? (builtInProviders[p.name] === p ? undefined : DEFAULT_DETECT_TIMEOUT_MS);
          const controller =
            timeoutMs !== undefined && typeof AbortController !== "undefined"
              ? new AbortController()
              : undefined;
          const detection = p.detect(controller?.signal);
          status = await (timeoutMs === undefined
            ? detection
            : Promise.race([
                detection,
                new Promise<ProviderStatus>((_, reject) => {
                  timer = setTimeout(() => {
                    reject(new Error(`detect() timed out after ${timeoutMs} ms`));
                    controller?.abort();
                  }, timeoutMs);
                }),
              ]));
        } catch (err) {
          status = "blocked";
          warn(`[blockrate] provider "${p.name}" detect() threw:`, err);
        } finally {
          if (timer !== undefined) clearTimeout(timer);
        }
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
      Promise.resolve(this.reporter(result)).catch(warnReporter);
    } catch (err) {
      warnReporter(err);
    }

    return result;
  }
}
