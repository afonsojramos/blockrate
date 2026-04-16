import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { deleteAccount, exportEventsCsv, getUsageSnapshot } from "@/server/stats";

export const Route = createFileRoute("/_authed/app/settings")({
  loader: () => getUsageSnapshot(),
  component: Settings,
});

function Settings() {
  const data = Route.useLoaderData();
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const usagePct = Math.min(100, (data.usage.used / data.plan.eventsPerMonth) * 100);
  const [managingSubscription, setManagingSubscription] = useState(false);

  async function onManageSubscription() {
    if (managingSubscription) return;
    setManagingSubscription(true);
    try {
      const res = await fetch("/api/stripe/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        alert(data.error ?? "Failed to open billing portal");
      }
    } finally {
      setManagingSubscription(false);
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
            <span className="font-medium">{data.plan.label}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Subscription</CardTitle>
          <CardDescription>
            {data.plan.name === "free"
              ? "You're on the Free plan."
              : data.stripe.subscriptionStatus === "past_due"
                ? "There's an issue with your payment method."
                : data.stripe.currentPeriodEnd && data.stripe.subscriptionStatus === "active"
                  ? `Your ${data.plan.label} plan renews on ${new Date(data.stripe.currentPeriodEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.`
                  : `You're on the ${data.plan.label} plan.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.stripe.customerId ? (
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
            {exporting ? "Generating…" : "Export events as CSV"}
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
            {deleting ? "Deleting…" : "Delete account"}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
