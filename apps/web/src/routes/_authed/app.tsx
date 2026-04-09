import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/app")({
  component: AppDashboard,
});

function AppDashboard() {
  const { user } = Route.useRouteContext();

  return (
    <main className="mx-auto max-w-2xl px-6 py-16 sm:py-24">
      <div className="space-y-2">
        <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          signed in
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Welcome back, {user.email}
        </h1>
      </div>

      <div className="mt-10 rounded-xl border border-dashed border-border/60 bg-muted/30 p-8">
        <p className="text-sm text-muted-foreground">
          Your block-rate dashboards will appear here. Phase 2 adds live
          per-provider stats, the API key management UI, and quota tracking.
        </p>
      </div>

      <div className="mt-8 flex gap-4">
        <Link
          to="/app/keys"
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-[background-color,transform] duration-150 ease-out active:scale-[0.96]"
        >
          Manage API keys
        </Link>
        <Link
          to="/"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          ← Back to landing
        </Link>
      </div>
    </main>
  );
}
