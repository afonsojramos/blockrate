/**
 * Stripe webhook handler — signature verification, plan transitions, idempotency.
 *
 * Strategy: invoke the real route handler against the real `index.server` db
 * singleton, pointed at an in-memory PGlite via DATABASE_URL so the handler and
 * the test share one database. Payloads are signed with a node:crypto HMAC in
 * the exact Stripe scheme, so the handler's constructEventAsync verification
 * runs for real (no network). The only branch that touches the Stripe network
 * is checkout.session.completed's subscriptions.retrieve — here we cover its
 * pre-network guard (missing data → 400); the full provisioning path is
 * exercised manually against Stripe, not in unit tests.
 *
 * Env (DATABASE_URL, Stripe secrets, price IDs) is set by test/setup.ts, the
 * Vitest setup, before any module that reads it is imported.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/pglite/migrator";
import { eq } from "drizzle-orm";
import { createHmac } from "node:crypto";
import { resolve } from "node:path";

import * as schema from "@/lib/db/schema";
import { user as userTable } from "@/lib/db/auth-schema";

const MIGRATIONS_FOLDER = resolve(import.meta.dirname, "..", "drizzle");

// The real db singleton — same instance the handler resolves via index.server.
// The production postgres.js shape is cast to the in-memory PGlite adapter
// selected by the test setup.
type PgliteDb = ReturnType<typeof import("drizzle-orm/pglite").drizzle<typeof schema>>;
const { db } = (await import("@/lib/db/index.server")) as unknown as { db: PgliteDb };
await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

const CUSTOMER = "cus_test_123";

async function reset() {
  // Deleting the user cascades to app_accounts → events/api_keys via FKs.
  await db.delete(userTable);
}

async function seedAccount(
  plan = "free",
  subId: string | null = "sub_test_123",
  status = "active",
): Promise<number> {
  await db.insert(userTable).values({
    id: "u1",
    name: "u1",
    email: "u1@example.com",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const [account] = await db
    .insert(schema.appAccounts)
    .values({
      userId: "u1",
      plan,
      stripeCustomerId: CUSTOMER,
      stripeSubscriptionId: subId,
      stripeSubscriptionStatus: status,
    })
    .returning();
  if (!account) throw new Error("seed: no account");
  return account.id;
}

async function readAccount(id: number) {
  const [row] = await db.select().from(schema.appAccounts).where(eq(schema.appAccounts.id, id));
  return row!;
}

const { Route } = await import("@/routes/api/stripe/webhook");

const POST = (
  Route as unknown as {
    options: { server: { handlers: { POST: (ctx: { request: Request }) => Promise<Response> } } };
  }
).options.server.handlers.POST;

/**
 * Sign a payload exactly as Stripe does: HMAC-SHA256 over `${t}.${payload}` with
 * the webhook secret, formatted `t=<ts>,v1=<hex>`. Computed with node:crypto so
 * the test signs synchronously; the handler verifies with constructEventAsync.
 */
function sign(payload: string): string {
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", process.env.STRIPE_WEBHOOK_SECRET!)
    .update(`${t}.${payload}`)
    .digest("hex");
  return `t=${t},v1=${v1}`;
}

/** Build a signed webhook Request for the given event object. */
function signedRequest(event: Record<string, unknown>, opts?: { signature?: string }): Request {
  const payload = JSON.stringify(event);
  const signature = opts?.signature ?? sign(payload);
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": signature, "content-type": "application/json" },
    body: payload,
  });
}

function subscriptionEvent(
  type: string,
  object: Record<string, unknown>,
  id = "evt_1",
): Record<string, unknown> {
  return { id, type, data: { object } };
}

function subObject(opts: {
  status: string;
  priceId?: string;
  cancelAtPeriodEnd?: boolean;
  periodEnd?: number;
  subscriptionId?: string;
}): Record<string, unknown> {
  return {
    id: opts.subscriptionId ?? "sub_test_123",
    customer: CUSTOMER,
    status: opts.status,
    cancel_at_period_end: opts.cancelAtPeriodEnd ?? false,
    items: {
      data: [
        {
          id: "si_1",
          price: { id: opts.priceId ?? "price_pro_monthly" },
          current_period_end: opts.periodEnd ?? 1_900_000_000,
        },
      ],
    },
  };
}

function invoiceObject(subscription: string | { id: string } = "sub_test_123") {
  return {
    customer: CUSTOMER,
    parent: {
      type: "subscription_details",
      subscription_details: { subscription },
    },
  };
}

describe("stripe webhook — signature verification", () => {
  beforeEach(async () => {
    await reset();
  });

  it("rejects a request with no stripe-signature header (400)", async () => {
    const req = new Request("http://localhost/api/stripe/webhook", {
      method: "POST",
      body: JSON.stringify(subscriptionEvent("invoice.paid", { customer: CUSTOMER })),
    });
    const res = await POST({ request: req });
    expect(res.status).toBe(400);
  });

  it("rejects a forged/invalid signature (400)", async () => {
    const req = signedRequest(subscriptionEvent("invoice.paid", { customer: CUSTOMER }), {
      signature: "t=123,v1=deadbeef",
    });
    const res = await POST({ request: req });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid signature" });
  });

  it("accepts a validly signed event (200)", async () => {
    await seedAccount();
    const req = signedRequest(subscriptionEvent("invoice.paid", { customer: CUSTOMER }));
    const res = await POST({ request: req });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ received: true });
  });
});

describe("stripe webhook — plan transitions", () => {
  beforeEach(async () => {
    await reset();
  });

  it("subscription.updated to an active pro plan upgrades the account", async () => {
    const id = await seedAccount("free");
    const req = signedRequest(
      subscriptionEvent(
        "customer.subscription.updated",
        subObject({ status: "active", priceId: "price_team_monthly" }),
      ),
    );
    const res = await POST({ request: req });
    expect(res.status).toBe(200);
    const acct = await readAccount(id);
    expect(acct.plan).toBe("team");
    expect(acct.stripeSubscriptionStatus).toBe("active");
    expect(acct.stripeCurrentPeriodEnd).toBeInstanceOf(Date);
  });

  it("subscription.updated with cancel_at_period_end keeps the plan, updates status", async () => {
    const id = await seedAccount("pro");
    const req = signedRequest(
      subscriptionEvent(
        "customer.subscription.updated",
        subObject({ status: "active", priceId: "price_pro_monthly", cancelAtPeriodEnd: true }),
      ),
    );
    await POST({ request: req });
    const acct = await readAccount(id);
    // Still pro (not downgraded) but the cancellation is reflected in status fields.
    expect(acct.plan).toBe("pro");
  });

  it("subscription.updated to canceled reverts to free and clears the sub id", async () => {
    const id = await seedAccount("team");
    const req = signedRequest(
      subscriptionEvent(
        "customer.subscription.updated",
        subObject({ status: "canceled", priceId: "price_team_monthly" }),
      ),
    );
    await POST({ request: req });
    const acct = await readAccount(id);
    expect(acct.plan).toBe("free");
    expect(acct.stripeSubscriptionId).toBeNull();
    expect(acct.stripeSubscriptionStatus).toBe("canceled");
  });

  it("subscription.deleted reverts to free", async () => {
    const id = await seedAccount("pro");
    const req = signedRequest(
      subscriptionEvent("customer.subscription.deleted", {
        id: "sub_test_123",
        customer: CUSTOMER,
      }),
    );
    await POST({ request: req });
    const acct = await readAccount(id);
    expect(acct.plan).toBe("free");
    expect(acct.stripeSubscriptionId).toBeNull();
    expect(acct.stripeSubscriptionStatus).toBe("canceled");
  });

  it("invoice.paid marks the subscription active", async () => {
    const id = await seedAccount("pro");
    // Knock it into past_due first so the transition is observable.
    await db
      .update(schema.appAccounts)
      .set({ stripeSubscriptionStatus: "past_due" })
      .where(eq(schema.appAccounts.id, id));
    await POST({
      request: signedRequest(subscriptionEvent("invoice.paid", invoiceObject())),
    });
    const acct = await readAccount(id);
    expect(acct.stripeSubscriptionStatus).toBe("active");
  });

  it("invoice.payment_failed marks the subscription past_due", async () => {
    const id = await seedAccount("pro");
    await POST({
      request: signedRequest(subscriptionEvent("invoice.payment_failed", invoiceObject())),
    });
    const acct = await readAccount(id);
    expect(acct.stripeSubscriptionStatus).toBe("past_due");
  });

  it("checkout.session.completed with missing data returns 400 before any network call", async () => {
    await seedAccount("free");
    const req = signedRequest(
      subscriptionEvent("checkout.session.completed", {
        client_reference_id: "",
        subscription: null,
        customer: CUSTOMER,
      }),
    );
    const res = await POST({ request: req });
    expect(res.status).toBe(400);
  });

  it("ignores unhandled event types with a 200", async () => {
    await seedAccount("free");
    const req = signedRequest(subscriptionEvent("customer.created", { id: CUSTOMER }));
    const res = await POST({ request: req });
    expect(res.status).toBe(200);
  });
});

describe("stripe webhook — idempotency", () => {
  beforeEach(async () => {
    await reset();
  });

  it("replaying the same subscription.updated event yields the same end state", async () => {
    const id = await seedAccount("free");
    const event = subscriptionEvent(
      "customer.subscription.updated",
      subObject({ status: "active", priceId: "price_pro_monthly" }),
      "evt_replay",
    );

    await POST({ request: signedRequest(event) });
    const first = await readAccount(id);
    await POST({ request: signedRequest(event) });
    const second = await readAccount(id);

    expect(second.plan).toBe("pro");
    expect(second.plan).toBe(first.plan);
    expect(second.stripeSubscriptionStatus).toBe(first.stripeSubscriptionStatus);
    expect(second.stripeCurrentPeriodEnd?.getTime()).toBe(first.stripeCurrentPeriodEnd?.getTime());
  });

  it("replaying subscription.deleted stays free, not a worse state", async () => {
    const id = await seedAccount("pro");
    const event = subscriptionEvent("customer.subscription.deleted", {
      id: "sub_test_123",
      customer: CUSTOMER,
    });
    await POST({ request: signedRequest(event) });
    await POST({ request: signedRequest(event) });
    const acct = await readAccount(id);
    expect(acct.plan).toBe("free");
    expect(acct.stripeSubscriptionId).toBeNull();
  });
});

describe("stripe webhook subscription ownership", () => {
  beforeEach(reset);

  const staleEvents = [
    subscriptionEvent(
      "customer.subscription.updated",
      subObject({ status: "canceled", subscriptionId: "sub_replaced" }),
    ),
    subscriptionEvent("customer.subscription.deleted", {
      id: "sub_replaced",
      customer: CUSTOMER,
    }),
    subscriptionEvent("invoice.paid", invoiceObject("sub_replaced")),
    subscriptionEvent("invoice.payment_failed", invoiceObject({ id: "sub_replaced" })),
  ];

  it.each(staleEvents)("ignores a replaced subscription's $type event", async (event) => {
    const id = await seedAccount(
      "team",
      "sub_current",
      event.type === "invoice.paid" ? "past_due" : "active",
    );
    const before = await readAccount(id);
    const response = await POST({ request: signedRequest(event) });
    expect(response.status).toBe(200);
    expect(await readAccount(id)).toEqual(before);
  });

  it.each(staleEvents)("does not relink a cleared subscription from $type", async (event) => {
    const id = await seedAccount(
      "free",
      null,
      event.type === "invoice.paid" ? "canceled" : "active",
    );
    const before = await readAccount(id);
    const response = await POST({ request: signedRequest(event) });
    expect(response.status).toBe(200);
    expect(await readAccount(id)).toEqual(before);
  });

  it("accepts an expanded invoice subscription for the linked subscription", async () => {
    const id = await seedAccount("pro");
    const response = await POST({
      request: signedRequest(
        subscriptionEvent("invoice.payment_failed", invoiceObject({ id: "sub_test_123" })),
      ),
    });
    expect(response.status).toBe(200);
    expect((await readAccount(id)).stripeSubscriptionStatus).toBe("past_due");
  });

  it("does not change subscription status for a one-time invoice", async () => {
    const id = await seedAccount("pro");
    const before = await readAccount(id);
    const response = await POST({
      request: signedRequest(subscriptionEvent("invoice.payment_failed", { customer: CUSTOMER })),
    });
    expect(response.status).toBe(200);
    expect(await readAccount(id)).toEqual(before);
  });
});

afterAll(async () => {
  await db.$client.close();
});
