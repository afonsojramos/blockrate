import { createFileRoute } from "@tanstack/react-router";
import type Stripe from "stripe";

/**
 * POST /api/stripe/webhook — Receives Stripe lifecycle events.
 *
 * NO session auth — Stripe signature verification instead. The raw body
 * is read via request.text() (Web Request API) before any JSON parsing,
 * which is critical for HMAC verification to succeed.
 *
 * Events handled:
 *   checkout.session.completed   → provision plan + store IDs
 *   customer.subscription.updated → plan changes, cancel scheduling
 *   customer.subscription.deleted → revert to free
 *   invoice.paid                  → confirm active status
 *   invoice.payment_failed        → mark past_due
 */

/** Extract current_period_end from a SubscriptionItem (Stripe SDK v22+). */
function getItemPeriodEnd(item: Stripe.SubscriptionItem | undefined): Date | null {
  if (!item) return null;
  const end = item.current_period_end;
  return end ? new Date(end * 1000) : null;
}

export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const [{ env }, { db }, { appAccounts }, { planFromPriceId }, { eq }, { default: Stripe }] =
          await Promise.all([
            import("@/lib/env.server"),
            import("@/lib/db/index.server"),
            import("@/lib/db/schema"),
            import("@/lib/plans"),
            import("drizzle-orm"),
            import("stripe"),
          ]);

        if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
          return new Response(JSON.stringify({ error: "stripe not configured" }), { status: 503 });
        }

        const stripe = new Stripe(env.STRIPE_SECRET_KEY);

        // Read raw body BEFORE any .json() — required for signature verification
        const rawBody = await request.text();
        const signature = request.headers.get("stripe-signature");
        if (!signature) {
          return new Response(JSON.stringify({ error: "missing stripe-signature" }), {
            status: 400,
          });
        }

        let event: Stripe.Event;
        try {
          event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
        } catch (err) {
          console.error("[stripe webhook] signature verification failed:", err);
          return new Response(JSON.stringify({ error: "invalid signature" }), { status: 400 });
        }

        try {
          switch (event.type) {
            case "checkout.session.completed": {
              const session = event.data.object as Stripe.Checkout.Session;
              const accountId = Number(session.client_reference_id);
              const subscriptionId =
                typeof session.subscription === "string"
                  ? session.subscription
                  : session.subscription?.id;

              if (!accountId || !subscriptionId) {
                console.error(
                  `[stripe webhook] checkout.session.completed missing data: accountId=${accountId}, subscriptionId=${subscriptionId}, event=${event.id}`,
                );
                return new Response(JSON.stringify({ error: "missing account or subscription" }), {
                  status: 400,
                });
              }

              const sub = await stripe.subscriptions.retrieve(subscriptionId);
              const item = sub.items.data[0];
              const priceId = item?.price.id;
              const plan = priceId ? planFromPriceId(priceId) : null;

              if (!plan) {
                console.error(
                  `[stripe webhook] unrecognized priceId=${priceId} for event=${event.id}`,
                );
                // Return 500 so Stripe retries — likely env misconfiguration
                return new Response(JSON.stringify({ error: "unrecognized price" }), {
                  status: 500,
                });
              }

              // Verify the customer matches the account (defense in depth)
              const customerId = session.customer as string;
              const result = await db
                .update(appAccounts)
                .set({
                  plan,
                  stripeCustomerId: customerId,
                  stripeSubscriptionId: subscriptionId,
                  stripeSubscriptionStatus: sub.status,
                  stripeCurrentPeriodEnd: getItemPeriodEnd(item),
                })
                .where(eq(appAccounts.id, accountId))
                .returning({ id: appAccounts.id });

              if (result.length === 0) {
                console.error(
                  `[stripe webhook] checkout.session.completed: no account found for id=${accountId}, event=${event.id}`,
                );
                return new Response(JSON.stringify({ error: "account not found" }), {
                  status: 500,
                });
              }
              break;
            }

            case "customer.subscription.updated": {
              const sub = event.data.object as Stripe.Subscription;
              const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
              const item = sub.items.data[0];
              const priceId = item?.price.id;
              const plan = priceId ? planFromPriceId(priceId) : null;

              const update: Partial<typeof appAccounts.$inferInsert> = {
                stripeSubscriptionStatus: sub.status,
                stripeCurrentPeriodEnd: getItemPeriodEnd(item),
              };

              if (sub.status === "canceled" || sub.status === "unpaid") {
                update.plan = "free";
                update.stripeSubscriptionId = null;
              } else if (plan && !sub.cancel_at_period_end) {
                update.plan = plan;
              }

              await db
                .update(appAccounts)
                .set(update)
                .where(eq(appAccounts.stripeCustomerId, customerId));
              break;
            }

            case "customer.subscription.deleted": {
              const sub = event.data.object as Stripe.Subscription;
              const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

              await db
                .update(appAccounts)
                .set({
                  plan: "free",
                  stripeSubscriptionId: null,
                  stripeSubscriptionStatus: "canceled",
                  stripeCurrentPeriodEnd: null,
                })
                .where(eq(appAccounts.stripeCustomerId, customerId));
              break;
            }

            case "invoice.paid": {
              const invoice = event.data.object as Stripe.Invoice;
              const customerId =
                typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
              if (customerId) {
                await db
                  .update(appAccounts)
                  .set({ stripeSubscriptionStatus: "active" })
                  .where(eq(appAccounts.stripeCustomerId, customerId));
              }
              break;
            }

            case "invoice.payment_failed": {
              const invoice = event.data.object as Stripe.Invoice;
              const customerId =
                typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
              if (customerId) {
                await db
                  .update(appAccounts)
                  .set({ stripeSubscriptionStatus: "past_due" })
                  .where(eq(appAccounts.stripeCustomerId, customerId));
              }
              break;
            }

            default:
              console.log(`[stripe] unhandled event: ${event.type}`);
          }
        } catch (err) {
          console.error(`[stripe webhook] handler error for ${event.type} (${event.id}):`, err);
          // Return 500 so Stripe retries
          return new Response(JSON.stringify({ error: "internal error" }), { status: 500 });
        }

        return new Response(JSON.stringify({ received: true }), { status: 200 });
      },
    },
  },
});
