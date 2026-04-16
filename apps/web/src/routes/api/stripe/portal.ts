import { createFileRoute } from "@tanstack/react-router";

/**
 * POST /api/stripe/portal — Creates a Stripe Customer Portal session
 * and returns the URL for redirect. Auth-gated.
 *
 * Requires the user to have a stripe_customer_id (i.e. they've checked
 * out at least once). Free users without a Stripe customer are redirected
 * to the pricing page instead.
 */

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/stripe/portal")({
  server: {
    handlers: {
      POST: async () => {
        const [{ env }, { db }, { appAccounts }, { eq }, { default: Stripe }] = await Promise.all([
          import("@/lib/env.server"),
          import("@/lib/db/index.server"),
          import("@/lib/db/schema"),
          import("drizzle-orm"),
          import("stripe"),
        ]);

        if (!env.STRIPE_SECRET_KEY) {
          return jsonError("billing not configured", 503);
        }

        // Auth gate
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

        if (!account.stripeCustomerId) {
          return jsonError("no subscription — visit /pricing to upgrade", 400);
        }

        const stripe = new Stripe(env.STRIPE_SECRET_KEY);
        const portalSession = await stripe.billingPortal.sessions.create({
          customer: account.stripeCustomerId,
          return_url: `${env.BETTER_AUTH_URL}/app/settings`,
        });

        return new Response(JSON.stringify({ url: portalSession.url }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
