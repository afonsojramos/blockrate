import { useEffect, useRef } from "react";
import { BlockRate } from "../index";
import type { BlockRateOptions } from "../types";

export function useBlockRate(options: BlockRateOptions): void {
  const ranRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (ranRef.current) return;
    ranRef.current = true;

    const br = new BlockRate(options);
    br.check().catch(() => {});
    // Intentionally runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
