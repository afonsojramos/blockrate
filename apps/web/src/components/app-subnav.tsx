import { Link } from "@tanstack/react-router";

const TABS = [
  { to: "/app", label: "Overview" },
  { to: "/app/keys", label: "API keys" },
  { to: "/app/settings", label: "Settings" },
] as const;

export function AppSubnav() {
  return (
    <div className="border-b border-border bg-background">
      <nav
        className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-6"
        aria-label="Dashboard sections"
      >
        {TABS.map((tab) => (
          <Link
            key={tab.to}
            to={tab.to}
            className="relative inline-flex h-12 items-center px-3 text-sm font-medium text-muted-foreground transition-[color] duration-150 ease-out hover:text-foreground"
            activeProps={{
              className: "text-foreground",
            }}
            activeOptions={{ exact: tab.to === "/app" }}
          >
            {({ isActive }) => (
              <>
                {tab.label}
                {isActive && (
                  <span
                    aria-hidden
                    className="absolute inset-x-3 -bottom-px h-0.5 bg-primary"
                  />
                )}
              </>
            )}
          </Link>
        ))}
      </nav>
    </div>
  );
}
