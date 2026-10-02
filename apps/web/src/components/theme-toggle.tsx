import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";

type Theme = "light" | "dark" | "system";
const ORDER: Theme[] = ["system", "light", "dark"];

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getTheme(): Theme {
  const stored = localStorage.getItem("theme");
  return ORDER.find((t) => t === stored) ?? "system";
}

function getServerTheme(): Theme | null {
  return null;
}

function setTheme(theme: Theme) {
  localStorage.setItem("theme", theme);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = theme === "dark" || (theme === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  for (const listener of listeners) listener();
}

/**
 * Single button that cycles System → Light → Dark. The inline `<head>` script
 * in __root.tsx sets the initial `.dark` class before paint, so this component
 * only reads localStorage and writes the class when the user clicks.
 *
 * The server snapshot is `null`, so SSR and hydration both render the
 * placeholder; React then re-renders with the stored theme.
 */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getTheme, getServerTheme);

  function cycle() {
    if (!theme) return;
    setTheme(ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length]);
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
