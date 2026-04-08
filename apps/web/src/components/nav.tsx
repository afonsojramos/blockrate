import { Link } from "@tanstack/react-router";
import { ThemeToggle } from "./theme-toggle";

export function Nav() {
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
            className="hidden rounded-md px-3 py-2 text-sm text-muted-foreground transition-[background-color,color] duration-150 ease-out hover:bg-accent hover:text-foreground sm:inline-block"
          >
            GitHub
          </a>
          <ThemeToggle />
          <Link
            to="/login"
            className="ml-1 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-[background-color,transform] duration-150 ease-out active:scale-[0.96]"
          >
            Sign in
          </Link>
        </div>
      </nav>
    </header>
  );
}
