import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import type { AuthProviders } from "@/server/auth-providers";

interface OAuthButtonsProps {
  providers: AuthProviders;
  callbackURL?: string;
}

/**
 * Renders Sign in with Google / Sign in with GitHub buttons, but only for
 * providers that are actually configured server-side. When neither is
 * configured (dev mode), the entire component renders nothing — including
 * the "or continue with" divider.
 */
export function OAuthButtons({
  providers,
  callbackURL = "/app",
}: OAuthButtonsProps) {
  const [pending, setPending] = useState<"google" | "github" | null>(null);
  const anyEnabled = providers.google || providers.github;

  if (!anyEnabled) return null;

  async function signIn(provider: "google" | "github") {
    if (pending) return;
    setPending(provider);
    try {
      await authClient.signIn.social({ provider, callbackURL });
    } finally {
      // Better Auth issues a redirect on success so this rarely runs
      setPending(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or continue with
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="space-y-2">
        {providers.google && (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => signIn("google")}
            aria-disabled={pending !== null}
          >
            <GoogleGlyph />
            {pending === "google" ? "Redirecting…" : "Continue with Google"}
          </Button>
        )}
        {providers.github && (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => signIn("github")}
            aria-disabled={pending !== null}
          >
            <GithubGlyph />
            {pending === "github" ? "Redirecting…" : "Continue with GitHub"}
          </Button>
        )}
      </div>
    </div>
  );
}

// Inline brand glyphs — avoid pulling lucide-react icons that don't match
// the brand colors. These are the official simple-icons paths.
function GoogleGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}

function GithubGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden fill="currentColor">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.92.58.1.79-.25.79-.56v-2.06c-3.2.7-3.87-1.36-3.87-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.69 1.24 3.34.95.1-.74.4-1.24.72-1.53-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.96 10.96 0 0 1 5.74 0c2.19-1.49 3.15-1.18 3.15-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.25 5.68.41.36.78 1.06.78 2.13v3.16c0 .31.21.67.8.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}
