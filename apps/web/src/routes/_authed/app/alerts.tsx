import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Bell, Plus, Trash2 } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PROVIDER_META } from "@/lib/providers";

import { createAlertRule, deleteAlertRule, listAlertRules, toggleAlertRule } from "@/server/alerts";

type AlertsData = Awaited<ReturnType<typeof listAlertRules>>;
type AlertRow = AlertsData["rules"][number];

export const Route = createFileRoute("/_authed/app/alerts")({
  loader: () => listAlertRules(),
  component: AlertsPage,
});

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

function ruleScope(r: AlertRow): string {
  const provider = r.provider ?? "any provider";
  return r.service ? `${provider} · ${r.service}` : provider;
}

function AlertsPage() {
  const data = Route.useLoaderData() as AlertsData;
  const router = useRouter();

  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  const [mutateError, setMutateError] = useState("");

  // Form state
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("");
  const [service, setService] = useState("");
  const [comparator, setComparator] = useState<"gte" | "lte">("gte");
  const [threshold, setThreshold] = useState("30");
  const [windowHours, setWindowHours] = useState("24");
  const [minSample, setMinSample] = useState("100");
  const [cooldownHours, setCooldownHours] = useState("24");
  const [channel, setChannel] = useState<"email" | "webhook" | "slack">("email");
  const [webhookUrl, setWebhookUrl] = useState("");

  const ctrlRef = useRef<AbortController | null>(null);
  useEffect(() => () => ctrlRef.current?.abort(), []);

  const entitled = data.maxAlertRules > 0;
  const atLimit = data.rules.length >= data.maxAlertRules;

  // The loader is the source of truth — invalidating re-runs it (one round
  // trip) rather than mirroring rows into local state, which would drift.
  async function refresh() {
    await router.invalidate();
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (creating || !name.trim()) return;
    setCreating(true);
    setCreateError("");
    ctrlRef.current = new AbortController();
    try {
      await createAlertRule({
        data: {
          name: name.trim(),
          provider: provider || null,
          service: service.trim() || null,
          comparator,
          threshold: Number(threshold),
          windowHours: Number(windowHours),
          minSample: Number(minSample),
          cooldownHours: Number(cooldownHours),
          channel,
          webhookUrl: channel === "email" ? null : webhookUrl.trim() || null,
        },
      });
      if (ctrlRef.current.signal.aborted) return;
      setCreateOpen(false);
      setName("");
      setProvider("");
      setService("");
      setChannel("email");
      setWebhookUrl("");
      await refresh();
    } catch (err) {
      if (!ctrlRef.current.signal.aborted) {
        setCreateError(err instanceof Error ? err.message : "Failed to create rule");
      }
    } finally {
      setCreating(false);
    }
  }

  async function onToggle(id: number, enabled: boolean) {
    setMutateError("");
    try {
      await toggleAlertRule({ data: { id, enabled } });
      await refresh();
    } catch (err) {
      setMutateError(err instanceof Error ? err.message : "Failed to update rule");
    }
  }

  async function onDelete(id: number) {
    if (!confirm("Delete this alert rule?")) return;
    setMutateError("");
    try {
      await deleteAlertRule({ data: { id } });
      await refresh();
    } catch (err) {
      setMutateError(err instanceof Error ? err.message : "Failed to delete rule");
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Alerts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Get an email when a provider's block rate crosses a threshold.{" "}
            <Link to="/app" search={{ since: 7 }} className="underline-offset-4 hover:underline">
              Back to dashboard
            </Link>
          </p>
        </div>
        {entitled && (
          <Button onClick={() => setCreateOpen(true)} disabled={atLimit}>
            <Plus className="mr-2 size-4" />
            New rule
          </Button>
        )}
      </header>

      {!entitled ? (
        <Card className="mt-8">
          <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
            <Bell className="size-8 text-muted-foreground" />
            <h2 className="text-lg font-medium">Alerting is a Pro feature</h2>
            <p className="max-w-md text-sm text-muted-foreground">
              Turn one-time measurement into continuous monitoring. Upgrade to set rules that email
              you the moment a provider's block rate spikes, so you find out before your analytics
              quietly go dark.
            </p>
            <Link to="/pricing" className={buttonVariants({ className: "mt-2" })}>
              Upgrade to Pro
            </Link>
          </CardContent>
        </Card>
      ) : (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="text-base">
              {data.rules.length} of {data.maxAlertRules}{" "}
              {data.rules.length === 1 ? "rule" : "rules"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {mutateError && (
              <p className="mb-4 text-sm text-destructive" role="alert">
                {mutateError}
              </p>
            )}
            {data.rules.length === 0 ? (
              <div className="rounded-md border border-dashed border-border/60 bg-muted/30 p-10 text-center">
                <p className="text-sm text-muted-foreground">
                  No alert rules yet. Create one to start monitoring.
                </p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="px-2 py-3 font-medium">Name</th>
                    <th className="px-2 py-3 font-medium">Scope</th>
                    <th className="px-2 py-3 font-medium">Condition</th>
                    <th className="px-2 py-3 font-medium">Window</th>
                    <th className="px-2 py-3 font-medium">Notify</th>
                    <th className="px-2 py-3 font-medium">Last fired</th>
                    <th className="px-2 py-3 font-medium">Status</th>
                    <th className="px-2 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.rules.map((r) => (
                    <tr key={r.id} className="border-b border-border/60">
                      <td className="px-2 py-3 font-medium">{r.name}</td>
                      <td className="px-2 py-3 text-muted-foreground">{ruleScope(r)}</td>
                      <td className="px-2 py-3 text-muted-foreground">
                        {r.comparator === "gte" ? "≥" : "≤"} {r.threshold}% blocked
                      </td>
                      <td className="px-2 py-3 text-muted-foreground">{r.windowHours}h</td>
                      <td className="px-2 py-3 text-muted-foreground">{r.channel}</td>
                      <td className="px-2 py-3 text-muted-foreground">
                        {r.lastFiredAt ? new Date(r.lastFiredAt).toLocaleDateString() : "never"}
                      </td>
                      <td className="px-2 py-3">
                        <button
                          type="button"
                          onClick={() => onToggle(r.id, !r.enabled)}
                          className="rounded-full px-2 py-0.5 text-xs"
                          style={{
                            background: r.enabled
                              ? "color-mix(in oklch, var(--rate-low) 15%, transparent)"
                              : "var(--muted)",
                          }}
                        >
                          {r.enabled ? "enabled" : "paused"}
                        </button>
                      </td>
                      <td className="px-2 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDelete(r.id)}
                          title="Delete"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New alert rule</DialogTitle>
            <DialogDescription>
              We check your ingested events on a schedule and email you when the condition is met
              (at most once per cooldown).
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="GA4 blocked spike"
                autoFocus
                required
                disabled={creating}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="provider">Provider</Label>
                <select
                  id="provider"
                  className={SELECT_CLASS}
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  disabled={creating}
                >
                  <option value="">Any provider</option>
                  {PROVIDER_META.map((p) => (
                    <option key={p.slug} value={p.slug}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="service">Service (optional)</Label>
                <Input
                  id="service"
                  value={service}
                  onChange={(e) => setService(e.target.value)}
                  placeholder="Any service"
                  disabled={creating}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="comparator">When block rate is</Label>
                <select
                  id="comparator"
                  className={SELECT_CLASS}
                  value={comparator}
                  onChange={(e) => setComparator(e.target.value as "gte" | "lte")}
                  disabled={creating}
                >
                  <option value="gte">at or above</option>
                  <option value="lte">at or below</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="threshold">Threshold (%)</Label>
                <Input
                  id="threshold"
                  type="number"
                  min={0}
                  max={100}
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  required
                  disabled={creating}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="window">Window (h)</Label>
                <Input
                  id="window"
                  type="number"
                  min={1}
                  value={windowHours}
                  onChange={(e) => setWindowHours(e.target.value)}
                  required
                  disabled={creating}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="minSample">Min sample</Label>
                <Input
                  id="minSample"
                  type="number"
                  min={1}
                  value={minSample}
                  onChange={(e) => setMinSample(e.target.value)}
                  required
                  disabled={creating}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cooldown">Cooldown (h)</Label>
                <Input
                  id="cooldown"
                  type="number"
                  min={0}
                  value={cooldownHours}
                  onChange={(e) => setCooldownHours(e.target.value)}
                  required
                  disabled={creating}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="channel">Notify via</Label>
              <select
                id="channel"
                className={SELECT_CLASS}
                value={channel}
                onChange={(e) => setChannel(e.target.value as "email" | "webhook" | "slack")}
                disabled={creating}
              >
                <option value="email">Email (account owner)</option>
                <option value="slack">Slack</option>
                <option value="webhook">Webhook</option>
              </select>
            </div>
            {channel !== "email" && (
              <div className="space-y-2">
                <Label htmlFor="webhookUrl">
                  {channel === "slack" ? "Slack incoming-webhook URL" : "Webhook URL"}
                </Label>
                <Input
                  id="webhookUrl"
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://…"
                  required
                  disabled={creating}
                />
                <p className="text-xs text-muted-foreground">
                  {channel === "slack"
                    ? "We POST { text } to this URL — paste a Slack incoming-webhook URL."
                    : "We POST a JSON payload (provider, rate, threshold) to this URL."}
                </p>
              </div>
            )}
            <div className="min-h-5 text-sm text-destructive" role="alert">
              {createError}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" aria-disabled={creating}>
                {creating ? "Creating…" : "Create rule"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
