"use client";

import { useEffect, useRef } from "react";
import { BlockRate } from "../index";
import type { BlockRateOptions } from "../types";

export interface BlockRateScriptProps extends Omit<BlockRateOptions, "reporter"> {
  endpoint: string;
}

export function BlockRateScript({ endpoint, ...rest }: BlockRateScriptProps) {
  const ranRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || ranRef.current) return;
    ranRef.current = true;

    const br = new BlockRate({
      ...rest,
      reporter: (result) => {
        const body = JSON.stringify(result);
        try {
          if (navigator.sendBeacon) {
            navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
            return;
          }
        } catch {
          // fall through
        }
        fetch(endpoint, {
          method: "POST",
          body,
          headers: { "Content-Type": "application/json" },
          keepalive: true,
        }).catch(() => {});
      },
    });
    br.check().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
