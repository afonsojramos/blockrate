import { z } from "zod";

export const providerResultSchema = z.object({
  name: z.string().min(1).max(64),
  status: z.enum(["loaded", "blocked"]),
  latency: z.number().int().min(0).max(60_000),
});

export const blockRatePayloadSchema = z.object({
  timestamp: z.string().datetime(),
  url: z.string().max(2048),
  userAgent: z.string().max(1024),
  service: z.string().min(1).max(64).optional(),
  providers: z.array(providerResultSchema).min(1).max(64),
});

export type BlockRatePayload = z.infer<typeof blockRatePayloadSchema>;
