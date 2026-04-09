import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Copy, Plus, RotateCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
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

import { createKey, deleteKey, listKeys, revokeKey } from "@/server/keys";

type KeyRow = Awaited<ReturnType<typeof listKeys>>[number];

export const Route = createFileRoute("/_authed/keys")({
  loader: () => listKeys(),
  component: KeysPage,
});

function KeysPage() {
  const initial = Route.useLoaderData() as KeyRow[];
  const [keys, setKeys] = useState<KeyRow[]>(initial);
  const router = Route.useRouter();

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newService, setNewService] = useState("default");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  // Plaintext reveal dialog (shown ONCE after creation)
  const [revealed, setRevealed] = useState<{
    name: string;
    plaintext: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  // AbortController for in-flight ops
  const ctrlRef = useRef<AbortController | null>(null);
  useEffect(() => () => ctrlRef.current?.abort(), []);

  async function refresh() {
    const next = await listKeys();
    setKeys(next);
    router.invalidate();
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (creating || !newName.trim()) return;
    setCreating(true);
    setCreateError("");
    ctrlRef.current = new AbortController();
    try {
      const created = await createKey({
        data: { name: newName.trim(), service: newService.trim() || "default" },
      });
      if (ctrlRef.current.signal.aborted) return;
      setRevealed({ name: created.name, plaintext: created.plaintext });
      setCreateOpen(false);
      setNewName("");
      setNewService("default");
      await refresh();
    } catch (err) {
      if (!ctrlRef.current.signal.aborted) {
        setCreateError(
          err instanceof Error ? err.message : "Failed to create key"
        );
      }
    } finally {
      setCreating(false);
    }
  }

  async function onRevoke(id: number) {
    if (!confirm("Revoke this key? Apps using it will start getting 401s."))
      return;
    await revokeKey({ data: { id } });
    await refresh();
  }

  async function onDelete(id: number) {
    if (
      !confirm(
        "Permanently delete this key and ALL its events? This cannot be undone."
      )
    )
      return;
    await deleteKey({ data: { id } });
    await refresh();
  }

  function copyPlaintext() {
    if (!revealed) return;
    navigator.clipboard.writeText(revealed.plaintext).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">API keys</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Each key represents a service. Keys are shown once on creation and
            stored hashed.{" "}
            <Link
              to="/app"
              className="underline-offset-4 hover:underline"
            >
              Back to dashboard
            </Link>
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 size-4" />
          New key
        </Button>
      </header>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle className="text-base">
            {keys.length} {keys.length === 1 ? "key" : "keys"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {keys.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/60 bg-muted/30 p-10 text-center">
              <p className="text-sm text-muted-foreground">
                No keys yet. Create one to start ingesting block-rate data.
              </p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-2 py-3 font-medium">Name</th>
                  <th className="px-2 py-3 font-medium">Service</th>
                  <th className="px-2 py-3 font-medium">Prefix</th>
                  <th className="px-2 py-3 font-medium">Last used</th>
                  <th className="px-2 py-3 font-medium">Status</th>
                  <th className="px-2 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className="border-b border-border/60">
                    <td className="px-2 py-3 font-medium">{k.name}</td>
                    <td className="px-2 py-3 text-muted-foreground">
                      {k.service}
                    </td>
                    <td className="px-2 py-3 font-mono text-xs text-muted-foreground">
                      {k.keyPrefix}…
                    </td>
                    <td className="px-2 py-3 text-muted-foreground">
                      {k.lastUsedAt
                        ? new Date(k.lastUsedAt).toLocaleDateString()
                        : "never"}
                    </td>
                    <td className="px-2 py-3">
                      {k.revokedAt ? (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          revoked
                        </span>
                      ) : (
                        <span className="rounded-full bg-rate-low/15 px-2 py-0.5 text-xs">
                          active
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        {!k.revokedAt && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onRevoke(k.id)}
                            title="Revoke"
                          >
                            <RotateCw className="size-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onDelete(k.id)}
                          title="Delete"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create an API key</DialogTitle>
            <DialogDescription>
              Choose a memorable name and a service label. The plaintext key is
              shown once — store it somewhere safe immediately.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={onCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Production web app"
                autoFocus
                required
                disabled={creating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="service">Service</Label>
              <Input
                id="service"
                value={newService}
                onChange={(e) => setNewService(e.target.value)}
                placeholder="default"
                disabled={creating}
              />
              <p className="text-xs text-muted-foreground">
                Used to filter the dashboard later. Can be anything.
              </p>
            </div>
            <div className="min-h-5 text-sm text-destructive" role="alert">
              {createError}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" aria-disabled={creating}>
                {creating ? "Creating…" : "Create key"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Plaintext reveal dialog */}
      <Dialog
        open={revealed !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRevealed(null);
            setCopied(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save your API key</DialogTitle>
            <DialogDescription>
              This is the only time we'll show this key. After you close this
              dialog it's gone forever — only the hash stays in our database.
            </DialogDescription>
          </DialogHeader>
          {revealed && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Name</Label>
                <p className="text-sm font-medium">{revealed.name}</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  API key
                </Label>
                <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
                  <code className="flex-1 break-all font-mono text-xs">
                    {revealed.plaintext}
                  </code>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={copyPlaintext}
                  >
                    <Copy className="size-4" />
                  </Button>
                </div>
                {copied && (
                  <p className="text-xs text-rate-low">Copied to clipboard</p>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              onClick={() => {
                setRevealed(null);
                setCopied(false);
              }}
            >
              I've saved it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
