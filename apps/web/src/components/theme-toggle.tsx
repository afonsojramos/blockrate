import { useEffect, useLayoutEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Theme = "light" | "dark" | "system";
const ORDER: Theme[] = ["system", "light", "dark"];

/**
 * Single button that cycles Light → Dark → System. The inline `<head>` script
 * in __root.tsx sets the initial `.dark` class before paint, so this hook
 * just READS from the DOM on mount and writes when the user clicks.
 *
 * julik-races: do NOT let React own the initial value — three sources of
 * truth (SSR / inline script / React state) = guaranteed hydration mismatch.
 * Render a placeholder until `theme !== null` (after mount).
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  // Mount: read whatever the inline head script + localStorage settled on
  useLayoutEffect(() => {
    const stored = localStorage.getItem("theme") as Theme | null;
    setTheme(stored ?? "system");
  }, []);

  // Apply theme changes synchronously (before paint) when user clicks
  useLayoutEffect(() => {
    if (!theme) return;
    const m = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const dark = theme === "dark" || (theme === "system" && m);
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  }, [theme]);

  // Persist asynchronously (non-critical)
  useEffect(() => {
    if (theme) localStorage.setItem("theme", theme);
  }, [theme]);

  function cycle() {
    if (!theme) return;
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    setTheme(next);
  }

  // Placeholder during SSR + first frame to avoid hydration mismatch
  if (!theme) {
    return (
      <button
        type="button"
        aria-label="Theme toggle (loading)"
        className="relative inline-flex size-10 items-center justify-center rounded-md"
        suppressHydrationWarning
      />
    );
  }

  const nextTheme = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Theme: ${theme}. Click to switch to ${nextTheme}.`}
      title={`Theme: ${theme}`}
      suppressHydrationWarning
      className="relative inline-flex size-10 items-center justify-center rounded-md transition-[background-color,transform] duration-150 ease-out hover:bg-accent active:scale-[0.96] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Sun
        aria-hidden
        className="absolute size-4 transition-[opacity,transform] duration-200 ease-out data-[active=false]:scale-50 data-[active=false]:opacity-0"
        data-active={theme === "light"}
      />
      <Moon
        aria-hidden
        className="absolute size-4 transition-[opacity,transform] duration-200 ease-out data-[active=false]:scale-50 data-[active=false]:opacity-0"
        data-active={theme === "dark"}
      />
      <Monitor
        aria-hidden
        className="absolute size-4 transition-[opacity,transform] duration-200 ease-out data-[active=false]:scale-50 data-[active=false]:opacity-0"
        data-active={theme === "system"}
      />
    </button>
  );
}
