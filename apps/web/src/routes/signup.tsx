import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OAuthButtons } from "@/components/oauth-buttons";
import { getAuthProviders } from "@/server/auth-providers";

export const Route = createFileRoute("/signup")({
  loader: () => getAuthProviders(),
  component: Signup,
});

type FormState = "idle" | "submitting" | "sent" | "error";

function Signup() {
  const providers = Route.useLoaderData();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<FormState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const ctrlRef = useRef<AbortController | null>(null);

  useEffect(() => () => ctrlRef.current?.abort(), []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (state !== "idle" && state !== "error") return;
    setState("submitting");
    setErrorMsg("");
    ctrlRef.current = new AbortController();
    try {
      const { error } = await authClient.signIn.magicLink({
        email,
        callbackURL: "/app",
      });
      if (ctrlRef.current.signal.aborted) return;
      if (error) {
        setState("error");
        setErrorMsg(error.message ?? "Something went wrong. Try again.");
      } else {
        setState("sent");
      }
    } catch {
      if (!ctrlRef.current.signal.aborted) {
        setState("error");
        setErrorMsg("Network error. Check your connection and try again.");
      }
    }
  }

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-md items-center px-6 py-16">
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <p className="text-sm text-muted-foreground">
            Free, no credit card. Magic link sign-in — no password to forget.
          </p>
        </CardHeader>
        <CardContent>
          {state === "sent" ? (
            <div className="animate-in fade-in slide-in-from-bottom-1 duration-300">
              <h2 className="text-lg font-semibold">Almost there</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                We sent a sign-in link to{" "}
                <span className="font-medium text-foreground">{email}</span>.
                Click it to finish creating your account.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={state === "submitting"}
                  placeholder="you@company.com"
                />
              </div>
              <div className="min-h-5 text-sm text-destructive" role="alert">
                {state === "error" ? errorMsg : ""}
              </div>
              <Button
                type="submit"
                aria-disabled={state === "submitting"}
                className="w-full"
              >
                {state === "submitting" ? "Sending…" : "Create account"}
              </Button>
              <OAuthButtons providers={providers} />
              <p className="text-center text-sm text-muted-foreground">
                Already have an account?{" "}
                <Link to="/login" className="underline-offset-4 hover:underline">
                  Sign in
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
