import { Link, useNavigate } from "@tanstack/react-router";
import { SiGithub } from "@icons-pack/react-simple-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "./theme-toggle";
import { authClient } from "@/lib/auth-client";
import type { NavSession } from "@/server/session";

export function Nav({ session }: { session: NavSession }) {
  const navigate = useNavigate();

  async function onSignOut() {
    await authClient.signOut();
    navigate({ to: "/" });
  }

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur">
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link
          to="/"
          className="flex items-center gap-2 text-lg font-semibold tracking-tight"
        >
          <span
            className="size-2.5 rounded-full"
            style={{
              background:
                "linear-gradient(90deg, var(--rate-low), var(--rate-mid), var(--rate-high))",
            }}
          />
          blockrate
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          <Link
            to="/demo"
            className="hidden rounded-md px-3 py-2 text-sm text-muted-foreground transition-[background-color,color] duration-150 ease-out hover:bg-accent hover:text-foreground sm:inline-block"
            activeProps={{ className: "text-foreground" }}
          >
            Demo
          </Link>
          <Link
            to="/pricing"
            className="hidden rounded-md px-3 py-2 text-sm text-muted-foreground transition-[background-color,color] duration-150 ease-out hover:bg-accent hover:text-foreground sm:inline-block"
            activeProps={{ className: "text-foreground" }}
          >
            Pricing
          </Link>
          <Link
            to="/docs"
            className="hidden rounded-md px-3 py-2 text-sm text-muted-foreground transition-[background-color,color] duration-150 ease-out hover:bg-accent hover:text-foreground sm:inline-block"
            activeProps={{ className: "text-foreground" }}
          >
            Docs
          </Link>
          <a
            href="https://github.com/afonsojramos/block-rate"
            className="hidden rounded-md p-2 text-muted-foreground transition-[background-color,color] duration-150 ease-out hover:bg-accent hover:text-foreground sm:inline-block"
            aria-label="GitHub"
          >
            <SiGithub size={20} />
          </a>
          <ThemeToggle />
          {session ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="ml-1 flex size-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-[background-color,transform] duration-150 hover:bg-primary/80 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  aria-label="Account menu"
                >
                  {(session.name?.[0] ?? session.email[0]).toUpperCase()}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium">{session.name ?? "Account"}</p>
                  <p className="text-xs text-muted-foreground">{session.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => navigate({ to: "/app", search: { since: 7 } })}
                >
                  Dashboard
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => navigate({ to: "/app/keys" })}
                >
                  API keys
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => navigate({ to: "/app/settings" })}
                >
                  Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onSignOut}>
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link
              to="/login"
              className="ml-1 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-[background-color,transform] duration-150 ease-out active:scale-[0.96]"
            >
              Sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
