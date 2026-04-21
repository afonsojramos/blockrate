import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { deleteAccount, exportEventsCsv, getUsageSnapshot } from "@/server/stats";

const settingsSearch = z.object({
  session_id: z.string().optional(),
});

export const Route = createFileRoute("/_authed/app/settings")({
  validateSearch: (input) => settingsSearch.parse(input),
  loader: () => getUsageSnapshot(),
  component: Settings,
});

function Settings() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [managingSubscription, setManagingSubscription] = useState(false);
  const [upgrading, setUpgrading] = useState(false);

  // After Stripe Checkout redirect or inline upgrade, poll until the
  // webhook updates the plan, then clear the session_id from the URL.
  useEffect(() => {
    if (!search.session_id) return;
    if (data.plan.name !== "free") {
      navigate({ to: "/app/settings", search: {}, replace: true });
      return;
    }

    let attempts = 0;
    const poll = setInterval(async () => {
      attempts++;
      try {
        await router.invalidate();
      } catch {
        // Network error during poll — keep trying
      }
      if (attempts >= 10) {
        clearInterval(poll);
        navigate({ to: "/app/settings", search: {}, replace: true });
      }
    }, 1500);

    return () => clearInterval(poll);
  }, [search.session_id, data.plan.name, router, navigate]);

  const usagePct = Math.min(100, (data.usage.used / data.plan.eventsPerMonth) * 100);

  async function onManageSubscription() {
    if (managingSubscription) return;
    setManagingSubscription(true);
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const result = await res.json();
      if (result.url) {
        window.location.href = result.url;
      } else {
        alert(result.error ?? "Failed to open billing portal");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setManagingSubscription(false);
    }
  }

  async function onUpgrade() {
    if (upgrading) return;
    setUpgrading(true);
    try {
      const targetPlan = data.plan.name === "free" ? "pro" : "team";
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: targetPlan, annual: false }),
      });
      const result = await res.json();
      if (result.url) {
        window.location.href = result.url;
      } else {
        alert(result.error ?? "Failed to start upgrade");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setUpgrading(false);
    }
  }

  async function onExport() {
    if (exporting) return;
    setExporting(true);
    try {
      const result = await exportEventsCsv();
      const blob = new Blob([result.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `blockrate-events-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  async function onDelete() {
    if (deleting) return;
    const confirmed = confirm(
      "PERMANENTLY delete your account, all API keys, and all event history?\n\nThis cannot be undone.",
    );
    if (!confirmed) return;
    setDeleting(true);
    try {
      await deleteAccount();
      const { authClient } = await import("@/lib/auth-client");
      await authClient.signOut().catch(() => {});
      await router.invalidate();
      navigate({ to: "/" });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <header>
        <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          settings
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Account</h1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-muted-foreground">Email</span>
            <span className="font-medium">{data.email}</span>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-muted-foreground">Plan</span>
            {search.session_id && data.plan.name === "free" ? (
              <span className="text-sm text-muted-foreground animate-pulse">
                Updating your plan...
              </span>
            ) : (
              <span className="font-medium">{data.plan.label}</span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subscription</CardTitle>
          <CardDescription>
            {search.session_id && data.plan.name === "free"
              ? "Processing your upgrade..."
              : data.plan.name === "free"
                ? "You're on the Free plan."
                : data.stripe.subscriptionStatus === "past_due"
                  ? "There's an issue with your payment method."
                  : data.stripe.currentPeriodEnd && data.stripe.subscriptionStatus === "active"
                    ? `Your ${data.plan.label} plan renews on ${new Date(data.stripe.currentPeriodEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`
                    : `You're on the ${data.plan.label} plan.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {data.stripe.hasSubscription ? (
            <Button
              variant="outline"
              onClick={onManageSubscription}
              aria-disabled={managingSubscription}
            >
              {managingSubscription ? "Opening..." : "Manage subscription"}
            </Button>
          ) : (
            <Link
              to="/pricing"
              className="inline-flex h-9 items-center justify-center rounded-md border border-border bg-transparent px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              View plans
            </Link>
          )}
          {data.plan.name !== "team" && (
            <button
              type="button"
              onClick={onUpgrade}
              disabled={upgrading}
              className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-[background-color,transform] duration-150 ease-out active:scale-[0.96] disabled:opacity-50"
            >
              {upgrading
                ? "Upgrading..."
                : data.plan.name === "free"
                  ? "Upgrade"
                  : "Upgrade to Team"}
            </button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usage this month</CardTitle>
          <CardDescription>
            Counter resets at the start of each calendar month (UTC).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={usagePct} />
          <div className="flex items-baseline justify-between text-sm">
            <span className="tabular-nums text-muted-foreground">
              {data.usage.used.toLocaleString()} / {data.plan.eventsPerMonth.toLocaleString()}{" "}
              events
            </span>
            <span className="tabular-nums">
              {usagePct.toFixed(1)}% of {data.plan.label}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Data</CardTitle>
          <CardDescription>
            Download a CSV of every event we've stored for your account. We never store raw user
            agents — only browser family + major version.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={onExport} aria-disabled={exporting}>
            {exporting ? "Generating..." : "Export events as CSV"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base text-destructive">Danger zone</CardTitle>
          <CardDescription>
            Permanently delete your account, API keys, and all event history. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={onDelete} aria-disabled={deleting}>
            {deleting ? "Deleting..." : "Delete account"}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
