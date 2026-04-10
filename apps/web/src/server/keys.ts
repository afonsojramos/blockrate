/**
 * Server functions for API key management. Auth-gated — every function
 * resolves the caller's app_account from the Better Auth session before
 * touching the database.
 */

import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

const requireAccount = async () => {
  const { auth } = await import("@/lib/auth.server");
  const { db } = await import("@/lib/db/index.server");
  const { appAccounts } = await import("@/lib/db/schema");

  const session = await auth.api.getSession({
    headers: getRequest().headers,
  });
  if (!session) throw new Error("unauthorized");

  const rows = await db
    .select()
    .from(appAccounts)
    .where(eq(appAccounts.userId, session.user.id))
    .limit(1);
  const account = rows[0];
  if (!account) {
    throw new Error("no app_account for user — bootstrap hook missed");
  }
  return { session, account, db, appAccounts };
};

// ─── listKeys ────────────────────────────────────────────────────────────

export const listKeys = createServerFn({ method: "GET" }).handler(async () => {
  const { account } = await requireAccount();
  const { db } = await import("@/lib/db/index.server");
  const { apiKeys } = await import("@/lib/db/schema");

  const rows = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      keyPrefix: apiKeys.keyPrefix,
      service: apiKeys.service,
      lastUsedAt: apiKeys.lastUsedAt,
      createdAt: apiKeys.createdAt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.accountId, account.id))
    .orderBy(apiKeys.createdAt);
  return rows;
});

// ─── createKey ───────────────────────────────────────────────────────────

const createKeyInput = z.object({
  name: z.string().min(1).max(64),
  service: z.string().min(1).max(64).default("default"),
});

export const createKey = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => createKeyInput.parse(input))
  .handler(async ({ data }) => {
    const { account } = await requireAccount();
    const { db } = await import("@/lib/db/index.server");
    const { apiKeys } = await import("@/lib/db/schema");
    const { generateApiKey } = await import("@/lib/keys.server");
    const { getPlan } = await import("@/lib/plans");

    // Enforce plan key limit (security: count non-revoked only)
    const existing = await db
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(and(eq(apiKeys.accountId, account.id), isNull(apiKeys.revokedAt)));
    const plan = getPlan(account.plan);
    if (existing.length >= plan.maxKeys) {
      throw new Error(`key limit reached (${plan.maxKeys} on the ${plan.label} plan)`);
    }

    const generated = generateApiKey();
    const inserted = await db
      .insert(apiKeys)
      .values({
        accountId: account.id,
        name: data.name,
        keyPrefix: generated.prefix,
        keyHash: generated.hash,
        service: data.service,
      })
      .returning({
        id: apiKeys.id,
        keyPrefix: apiKeys.keyPrefix,
        name: apiKeys.name,
        service: apiKeys.service,
      });

    // Plaintext is returned ONCE — never again readable from the DB
    return { ...inserted[0], plaintext: generated.plaintext };
  });

// ─── revokeKey ───────────────────────────────────────────────────────────

const idInput = z.object({ id: z.number().int().positive() });

export const revokeKey = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => idInput.parse(input))
  .handler(async ({ data }) => {
    const { account } = await requireAccount();
    const { db } = await import("@/lib/db/index.server");
    const { apiKeys } = await import("@/lib/db/schema");

    const result = await db
      .update(apiKeys)
      .set({ revokedAt: new Date() })
      .where(and(eq(apiKeys.id, data.id), eq(apiKeys.accountId, account.id)))
      .returning({ id: apiKeys.id });
    if (result.length === 0) throw new Error("key not found");
    return { id: result[0].id };
  });

// ─── deleteKey ───────────────────────────────────────────────────────────

export const deleteKey = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => idInput.parse(input))
  .handler(async ({ data }) => {
    const { account } = await requireAccount();
    const { db } = await import("@/lib/db/index.server");
    const { apiKeys } = await import("@/lib/db/schema");

    const result = await db
      .delete(apiKeys)
      .where(and(eq(apiKeys.id, data.id), eq(apiKeys.accountId, account.id)))
      .returning({ id: apiKeys.id });
    if (result.length === 0) throw new Error("key not found");
    return { id: result[0].id };
  });
