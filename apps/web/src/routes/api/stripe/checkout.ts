import { createFileRoute } from "@tanstack/react-router";

/**
 * POST /api/stripe/checkout — Creates a Stripe Checkout Session or
 * updates an existing subscription (plan switch).
 *
 * Body: { plan: "pro" | "team", annual?: boolean }
 * Returns: { url: string } — redirect target (Stripe Checkout or settings)
 *
 * Creates the Stripe Customer eagerly (before the Checkout Session) so
 * the stripe_customer_id is in the DB before any webhook fires.
 */

export const Route = createFileRoute("/api/stripe/checkout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const [{ env }, { db }, { appAccounts }, { resolvePriceId }, { eq }, { default: Stripe }] =
          await Promise.all([
            import("@/lib/env.server"),
            import("@/lib/db/index.server"),
            import("@/lib/db/schema"),
            import("@/lib/plans"),
            import("drizzle-orm"),
            import("stripe"),
          ]);
        const { jsonError, requireAccountForApi } = await import("@/lib/api-utils.server");

        if (!env.STRIPE_SECRET_KEY) return jsonError("billing not configured", 503);

        const authResult = await requireAccountForApi();
        if (authResult instanceof Response) return authResult;
        const { account, session } = authResult;

        // Parse { plan, annual } from body — server resolves the price ID
        let body: { plan?: string; annual?: boolean };
        try {
          body = await request.json();
        } catch {
          return jsonError("invalid json", 400);
        }

        const priceId = resolvePriceId(body.plan, body.annual);
        if (!priceId) return jsonError("invalid plan", 400);

        // Prevent downgrade via this endpoint — use Customer Portal instead
        const planRank = { free: 0, pro: 1, team: 2 } as Record<string, number>;
        const currentRank = planRank[account.plan] ?? 0;
        const targetRank = planRank[body.plan ?? ""] ?? 0;
        if (targetRank <= currentRank && account.plan !== "free") {
          return jsonError("use the Customer Portal to downgrade or manage your subscription", 400);
        }

        const stripe = new Stripe(env.STRIPE_SECRET_KEY);
        const baseUrl = env.BETTER_AUTH_URL;

        try {
          // If user already has an active subscription, update it (plan switch)
          if (account.stripeSubscriptionId) {
            const sub = await stripe.subscriptions.retrieve(account.stripeSubscriptionId);

            if (sub.status === "active" || sub.status === "trialing") {
              const itemId = sub.items.data[0]?.id;
              if (!itemId) {
                return jsonError(
                  "subscription is in an unexpected state — please contact support",
                  500,
                );
              }

              await stripe.subscriptions.update(account.stripeSubscriptionId, {
                items: [{ id: itemId, price: priceId }],
                proration_behavior: "always_invoice",
              });
              return new Response(
                JSON.stringify({ url: `${baseUrl}/app/settings?session_id=upgraded` }),
                { status: 200, headers: { "Content-Type": "application/json" } },
              );
            }
          }

          // No existing subscription — create a Checkout Session
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
        } catch (err) {
          console.error("[stripe checkout] error:", err);
          const message =
            err instanceof Stripe.errors.StripeError
              ? err.message
              : "payment processing failed — please try again";
          return jsonError(message, 502);
        }
      },
    },
  },
});
