export type ProviderStatus = "loaded" | "blocked";

export interface Provider {
  name: string;
  detect: () => Promise<ProviderStatus>;
}

export interface ProviderResult {
  name: string;
  status: ProviderStatus;
  latency: number;
}

export interface BlockRateResult {
  timestamp: string;
  url: string;
  userAgent: string;
  service?: string;
  providers: ProviderResult[];
}

export type Reporter = (result: BlockRateResult) => void;

export interface BlockRateOptions {
  providers: (string | Provider)[];
  reporter: Reporter;
  service?: string;
  sampleRate?: number;
  delay?: number;
  sessionKey?: string;
  /**
   * Optional consent gate for strict jurisdictions. When set to `false`,
   * `check()` is a complete no-op — no network requests, no data collection.
   * Defaults to `true` because blockrate is consent-free by design (no
   * cookies, no persistent storage, no cross-site tracking).
   *
   * Only use this if your legal counsel requires explicit consent for
   * blockrate in your jurisdiction.
   *
   * @example
   * ```ts
   * new BlockRate({
   *   consentGiven: () => window.CookieConsent?.accepted("analytics"),
   *   ...
   * })
   * ```
   */
  consentGiven?: boolean | (() => boolean);
  /**
   * Optional callback to sanitize the URL before reporting. Receives
   * `location.pathname` and should return the sanitised string. Use this
   * to strip PII that may appear in path segments (e.g. `/users/:email`).
   *
   * @example
   * ```ts
   * new BlockRate({
   *   sanitizeUrl: (path) => path.replace(/\/users\/[^/]+/, "/users/:id"),
   *   ...
   * })
   * ```
   */
  sanitizeUrl?: (url: string) => string;
  /**
   * When `true`, stores a flag in `sessionStorage` to prevent duplicate
   * checks within the same browser session. Defaults to `false`.
   *
   * Enabling this writes to `sessionStorage`, which may require visitor
   * consent under ePrivacy Article 5(3) in some jurisdictions.
   */
  sessionDedup?: boolean;
}
