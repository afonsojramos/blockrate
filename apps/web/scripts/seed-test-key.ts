/**
 * Dev-only seed script: creates a test user + app_account + api_key,
 * prints the plaintext key. Use to smoke-test /api/ingest end-to-end
 * without going through the magic-link flow.
 *
 * Usage:
 *   bun run scripts/seed-test-key.ts
 */

import { db } from "../src/lib/db/index.server";
import { user as userTable } from "../src/lib/db/auth-schema";
import { appAccounts, apiKeys } from "../src/lib/db/schema";
import { generateApiKey } from "../src/lib/keys.server";
import { eq } from "drizzle-orm";

const TEST_EMAIL = "smoke@blockrate.local";
const TEST_USER_ID = "smoke-test-user";

async function main() {
  // 1. Upsert user
  await db
    .insert(userTable)
    .values({
      id: TEST_USER_ID,
      email: TEST_EMAIL,
      name: "Smoke Test",
      emailVerified: true,
    })
    .onConflictDoNothing();

  // 2. Upsert app_account (1:1 with user)
  let account = (
    await db
      .select()
      .from(appAccounts)
      .where(eq(appAccounts.userId, TEST_USER_ID))
      .limit(1)
  )[0];
  if (!account) {
    const inserted = await db
      .insert(appAccounts)
      .values({ userId: TEST_USER_ID, plan: "free" })
      .returning();
    account = inserted[0];
  }

  // 3. Generate a key
  const generated = generateApiKey();
  await db.insert(apiKeys).values({
    accountId: account.id,
    name: "smoke-test-key",
    keyPrefix: generated.prefix,
    keyHash: generated.hash,
    service: "smoke",
  });

  console.log(`account_id: ${account.id}`);
  console.log(`api_key:    ${generated.plaintext}`);
  console.log(`prefix:     ${generated.prefix}`);
  console.log("");
  console.log("test with:");
  console.log(
    `curl -X POST http://localhost:3001/api/ingest \\\n  -H "Content-Type: application/json" \\\n  -H "x-block-rate-key: ${generated.plaintext}" \\\n  -d '{"timestamp":"${new Date().toISOString()}","url":"/test","userAgent":"Mozilla/5.0 Chrome/131","providers":[{"name":"posthog","status":"blocked","latency":12},{"name":"ga4","status":"loaded","latency":5}]}'`
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
