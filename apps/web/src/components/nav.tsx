import { Link } from "@tanstack/react-router";
import { ThemeToggle } from "./theme-toggle";
import type { NavSession } from "@/server/session";

export function Nav({ session }: { session: NavSession }) {
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
            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
              <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.92.58.1.79-.25.79-.56v-2.06c-3.2.7-3.87-1.36-3.87-1.36-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.75 2.69 1.24 3.34.95.1-.74.4-1.24.72-1.53-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.62 1.59.23 2.76.11 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.39-5.25 5.68.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.012 8.012 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
            </svg>
          </a>
          <ThemeToggle />
          {session ? (
            <Link
              to="/app"
              search={{ since: 7 }}
              className="ml-1 inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-[background-color,transform] duration-150 ease-out active:scale-[0.96]"
            >
              <span
                className="flex size-6 items-center justify-center rounded-full bg-primary-foreground/20 text-xs font-semibold"
                aria-hidden
              >
                {(session.name?.[0] ?? session.email[0]).toUpperCase()}
              </span>
              Dashboard
            </Link>
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
