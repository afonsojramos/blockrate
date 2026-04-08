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
  providers: ProviderResult[];
}

export type Reporter = (result: BlockRateResult) => void;

export interface BlockRateOptions {
  providers: (string | Provider)[];
  reporter: Reporter;
  sampleRate?: number;
  delay?: number;
  sessionKey?: string;
}
