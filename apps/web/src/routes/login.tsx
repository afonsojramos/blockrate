import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OAuthButtons } from "@/components/oauth-buttons";
import { getAuthProviders } from "@/server/auth-providers";

export const Route = createFileRoute("/login")({
  loader: () => getAuthProviders(),
  component: Login,
});

type FormState = "idle" | "submitting" | "sent" | "error";

function Login() {
  const providers = Route.useLoaderData();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<FormState>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const ctrlRef = useRef<AbortController | null>(null);

  // Cleanup any in-flight request on unmount (julik-races)
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
          <CardTitle className="text-2xl">Sign in to blockrate</CardTitle>
          <p className="text-sm text-muted-foreground">
            We'll email you a magic link. No password needed.
          </p>
        </CardHeader>
        <CardContent>
          {state === "sent" ? (
            <div className="animate-in fade-in slide-in-from-bottom-1 duration-300">
              <h2 className="text-lg font-semibold">Check your email</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                We sent a sign-in link to{" "}
                <span className="font-medium text-foreground">{email}</span>. It expires in 10
                minutes. (In dev, check the terminal for the URL.)
              </p>
              <button
                type="button"
                onClick={() => {
                  setState("idle");
                  setEmail("");
                }}
                className="mt-4 text-sm underline-offset-4 hover:underline"
              >
                Use a different email
              </button>
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
              <Button type="submit" aria-disabled={state === "submitting"} className="w-full">
                {state === "submitting" ? "Sending…" : "Send magic link"}
              </Button>
              <OAuthButtons providers={providers} />
              <p className="text-center text-sm text-muted-foreground">
                Don't have an account?{" "}
                <Link to="/signup" className="underline-offset-4 hover:underline">
                  Sign up
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
