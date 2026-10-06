import { useEffect, useRef } from "react";
import { BlockRate } from "../index";
import type { BlockRateOptions } from "../types";
import { warn } from "../warn";

export function useBlockRate(options: BlockRateOptions): void {
  const ranRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (ranRef.current) return;
    ranRef.current = true;

    let br: BlockRate;
    try {
      br = new BlockRate(options);
    } catch (error) {
      warn("[blockrate] initialization failed:", error);
      return;
    }
    br.check().catch(() => {});
    // Intentionally runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
