import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBlockRate } from "../src/react";
import { BlockRateScript } from "../src/next/component";
import type { Provider } from "../src/types";

const effects = vi.hoisted(() => {
  const callbacks: (() => void)[] = [];
  return callbacks;
});

vi.mock("react", () => ({
  useEffect: (effect: () => void) => effects.push(effect),
  useRef: (current: boolean) => ({ current }),
}));

describe("client adapters", () => {
  beforeEach(() => {
    effects.length = 0;
    vi.stubGlobal("window", {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe.each([
    {
      name: "React",
      mount: (providers: Provider[]) => useBlockRate({ providers, reporter: () => {}, delay: 0 }),
    },
    {
      name: "Next",
      mount: (providers: Provider[]) =>
        BlockRateScript({ providers, endpoint: "/api/block-rate", delay: 0 }),
    },
  ])("$name", ({ mount }) => {
    it.each([0, NaN])("contains invalid timeoutMs %s in the mount effect", (timeoutMs) => {
      const detect = vi.fn(async () => "loaded" as const);
      mount([{ name: "invalid", timeoutMs, detect }]);

      expect(effects).toHaveLength(1);
      expect(() => effects[0]()).not.toThrow();
      expect(detect).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalledExactlyOnceWith(
        "[blockrate] initialization failed:",
        expect.any(RangeError),
      );
    });

    it("contains initialization errors when the diagnostic throws", () => {
      vi.mocked(console.warn).mockImplementation(() => {
        throw new Error("console unavailable");
      });
      mount([{ name: "invalid", timeoutMs: 0, detect: async () => "loaded" }]);

      expect(effects).toHaveLength(1);
      expect(() => effects[0]()).not.toThrow();
      expect(console.warn).toHaveBeenCalledOnce();
    });
  });
});
