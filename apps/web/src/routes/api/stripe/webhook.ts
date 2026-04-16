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
        } catch {
          return new Response(JSON.stringify({ error: "invalid signature" }), { status: 400 });
        }

        // Handle each event type — all handlers are idempotent
        switch (event.type) {
          case "checkout.session.completed": {
            const session = event.data.object as Stripe.Checkout.Session;
            const accountId = Number(session.client_reference_id);
            const subscriptionId =
              typeof session.subscription === "string"
                ? session.subscription
                : session.subscription?.id;

            if (accountId && subscriptionId) {
              // Fetch the full subscription to get price + period details.
              // In Stripe SDK v22+, retrieve() returns Response<Subscription>.
              const subResponse = await stripe.subscriptions.retrieve(subscriptionId);
              const sub = subResponse as unknown as Stripe.Subscription;
              const item = sub.items.data[0];
              const priceId = item?.price.id;
              const plan = priceId ? planFromPriceId(priceId) : "free";
              // In API version 2025+, current_period_end is on SubscriptionItem, not Subscription
              const periodEnd = (item as unknown as Record<string, unknown>)?.current_period_end as
                | number
                | undefined;

              await db
                .update(appAccounts)
                .set({
                  plan,
                  stripeCustomerId: session.customer as string,
                  stripeSubscriptionId: subscriptionId,
                  stripeSubscriptionStatus: sub.status,
                  stripeCurrentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
                })
                .where(eq(appAccounts.id, accountId));
            }
            break;
          }

          case "customer.subscription.updated": {
            const sub = event.data.object as Stripe.Subscription;
            const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
            const item = sub.items.data[0];
            const priceId = item?.price.id;
            const plan = priceId ? planFromPriceId(priceId) : undefined;
            const periodEnd = (item as unknown as Record<string, unknown>)?.current_period_end as
              | number
              | undefined;

            const update: Record<string, unknown> = {
              stripeSubscriptionStatus: sub.status,
              stripeCurrentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
            };
            // Only update plan if we can resolve the price
            if (plan && plan !== "free") update.plan = plan;
            // If cancelled at period end but still active, keep the current plan
            // until subscription.deleted fires
            if (sub.cancel_at_period_end && sub.status === "active") {
              // Keep plan as-is — the user retains access until period end
            } else if (sub.status === "canceled" || sub.status === "unpaid") {
              update.plan = "free";
              update.stripeSubscriptionId = null;
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
            // Unhandled event — log and acknowledge
            console.log(`[stripe] unhandled event: ${event.type}`);
        }

        return new Response(JSON.stringify({ received: true }), { status: 200 });
      },
    },
  },
});
