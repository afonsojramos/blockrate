import { useEffect, useRef } from "react";
import { BlockRate, type BlockRateOptions } from "block-rate";

export function useBlockRate(options: BlockRateOptions): void {
  const ranRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (ranRef.current) return;
    ranRef.current = true;

    const br = new BlockRate(options);
    br.check().catch(() => {});
    // Options are intentionally captured on mount; this hook runs once per session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
