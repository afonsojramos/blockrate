import { createFileRoute } from "@tanstack/react-router";
import type Stripe from "stripe";

/**
 * POST /api/stripe/checkout — Creates a Stripe Checkout Session for
 * upgrading to Pro or Team. Auth-gated via requireAccount().
 *
 * Body: { priceId: string }
 * Returns: { url: string } — the Stripe Checkout URL to redirect to
 *
 * Creates the Stripe Customer eagerly (before the Checkout Session) so
 * the stripe_customer_id is in the DB before any webhook fires. This
 * eliminates the race condition where checkout.session.completed
 * references a customer we haven't stored yet.
 */

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/stripe/checkout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const [{ env }, { db }, { appAccounts }, { validPriceIds }, { eq }, { default: Stripe }] =
          await Promise.all([
            import("@/lib/env.server"),
            import("@/lib/db/index.server"),
            import("@/lib/db/schema"),
            import("@/lib/plans"),
            import("drizzle-orm"),
            import("stripe"),
          ]);

        if (!env.STRIPE_SECRET_KEY) {
          return jsonError("billing not configured", 503);
        }

        // Auth gate — reuses the same pattern as requireAccount()
        const { auth } = await import("@/lib/auth.server");
        const { getRequest } = await import("@tanstack/react-start/server");
        const session = await auth.api.getSession({ headers: getRequest().headers });
        if (!session) return jsonError("unauthorized", 401);

        const rows = await db
          .select()
          .from(appAccounts)
          .where(eq(appAccounts.userId, session.user.id))
          .limit(1);
        const account = rows[0];
        if (!account) return jsonError("no account", 404);

        // Parse and validate the requested price
        let body: { priceId?: string };
        try {
          body = await request.json();
        } catch {
          return jsonError("invalid json", 400);
        }
        const { priceId } = body;
        if (!priceId || !validPriceIds().has(priceId)) {
          return jsonError("invalid priceId", 400);
        }

        const stripe = new Stripe(env.STRIPE_SECRET_KEY);
        const baseUrl = env.BETTER_AUTH_URL;

        // If user already has an active subscription, update it (plan switch)
        // instead of creating a second subscription via Checkout.
        if (account.stripeSubscriptionId) {
          const sub = (await stripe.subscriptions.retrieve(
            account.stripeSubscriptionId,
          )) as unknown as Stripe.Subscription;

          if (sub.status === "active" || sub.status === "trialing") {
            const itemId = sub.items.data[0]?.id;
            if (itemId) {
              await stripe.subscriptions.update(account.stripeSubscriptionId, {
                items: [{ id: itemId, price: priceId }],
                proration_behavior: "always_invoice",
              });
              // The subscription.updated webhook will update the plan in the DB.
              return new Response(
                JSON.stringify({ url: `${baseUrl}/app/settings?session_id=upgraded` }),
                { status: 200, headers: { "Content-Type": "application/json" } },
              );
            }
          }
        }

        // No existing subscription — create a Checkout Session (new subscriber)
        let stripeCustomerId = account.stripeCustomerId;
        if (!stripeCustomerId) {
          const customer = await stripe.customers.create({
            email: session.user.email,
            metadata: { account_id: String(account.id) },
          });
          stripeCustomerId = customer.id;
          await db
            .update(appAccounts)
            .set({ stripeCustomerId })
            .where(eq(appAccounts.id, account.id));
        }

        const checkoutSession = await stripe.checkout.sessions.create({
          mode: "subscription",
          customer: stripeCustomerId,
          client_reference_id: String(account.id),
          metadata: { account_id: String(account.id) },
          line_items: [{ price: priceId, quantity: 1 }],
          success_url: `${baseUrl}/app/settings?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${baseUrl}/pricing`,
          subscription_data: {
            metadata: { account_id: String(account.id) },
          },
        });

        return new Response(JSON.stringify({ url: checkoutSession.url }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
