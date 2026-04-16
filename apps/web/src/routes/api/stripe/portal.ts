import { createFileRoute } from "@tanstack/react-router";

/**
 * POST /api/stripe/portal — Creates a Stripe Customer Portal session
 * and returns the URL for redirect. Auth-gated.
 */

export const Route = createFileRoute("/api/stripe/portal")({
  server: {
    handlers: {
      POST: async () => {
        const [{ env }, { default: Stripe }] = await Promise.all([
          import("@/lib/env.server"),
          import("stripe"),
        ]);
        const { jsonError, requireAccountForApi } = await import("@/lib/api-utils.server");

        if (!env.STRIPE_SECRET_KEY) return jsonError("billing not configured", 503);

        const authResult = await requireAccountForApi();
        if (authResult instanceof Response) return authResult;
        const { account } = authResult;

        if (!account.stripeCustomerId) {
          return jsonError("no subscription — visit /pricing to upgrade", 400);
        }

        try {
          const stripe = new Stripe(env.STRIPE_SECRET_KEY);
          const portalSession = await stripe.billingPortal.sessions.create({
            customer: account.stripeCustomerId,
            return_url: `${env.BETTER_AUTH_URL}/app/settings`,
          });

          return new Response(JSON.stringify({ url: portalSession.url }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          console.error("[stripe portal] error:", err);
          const message =
            err instanceof Stripe.errors.StripeError
              ? err.message
              : "unable to open billing portal — please try again";
          return jsonError(message, 502);
        }
      },
    },
  },
});
