import { describe, it, expect, beforeEach, beforeAll, afterAll } from "bun:test";
import {
  hasCheckedThisSession,
  markChecked,
  shouldSample,
} from "../src/session";

const storage: Record<string, string> = {};

describe("session", () => {
  beforeAll(() => {
    (globalThis as any).sessionStorage = {
      getItem: (k: string) => storage[k] ?? null,
      setItem: (k: string, v: string) => {
        storage[k] = v;
      },
      removeItem: (k: string) => {
        delete storage[k];
      },
    };
  });

  afterAll(() => {
    delete (globalThis as any).sessionStorage;
  });

  beforeEach(() => {
    for (const k of Object.keys(storage)) delete storage[k];
  });

  it("marks and detects checked state", () => {
    expect(hasCheckedThisSession("k")).toBe(false);
    markChecked("k");
    expect(hasCheckedThisSession("k")).toBe(true);
  });

  it("sample rate 1 always samples", () => {
    expect(shouldSample(1)).toBe(true);
  });

  it("sample rate 0 never samples", () => {
    expect(shouldSample(0)).toBe(false);
  });
});
