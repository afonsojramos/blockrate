"use client";

import { useEffect, useState } from "react";

const items = [
  { title: "First-party rule", url: "#first-party", depth: 2 },
  { title: "Quick start", url: "#install", depth: 2 },
  { title: "Hosted", url: "#hosted", depth: 3 },
  { title: "Self-hosted", url: "#self-hosted", depth: 3 },
  { title: "Custom pipeline", url: "#custom-pipeline", depth: 3 },
  { title: "Options", url: "#options", depth: 2 },
  { title: "Consent", url: "#opt-consent", depth: 3 },
  { title: "Sanitize URLs", url: "#opt-sanitize", depth: 3 },
  { title: "Providers", url: "#providers", depth: 2 },
  { title: "Framework guides", url: "#frameworks", depth: 2 },
  { title: "React", url: "#fw-react", depth: 3 },
  { title: "Next.js", url: "#fw-nextjs", depth: 3 },
  { title: "SvelteKit", url: "#fw-sveltekit", depth: 3 },
  { title: "TanStack Start", url: "#fw-tanstack", depth: 3 },
  { title: "Nuxt", url: "#fw-nuxt", depth: 3 },
  { title: "SolidStart", url: "#fw-solidstart", depth: 3 },
  { title: "Vanilla JS", url: "#fw-vanilla", depth: 3 },
];

export function DocsToc() {
  const [activeId, setActiveId] = useState("");

  useEffect(() => {
    const ids = items.map((i) => i.url.slice(1));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <nav
      className="sticky top-24 hidden max-h-[calc(100vh-8rem)] lg:block"
      aria-label="Table of contents"
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        On this page
      </p>
      <ul className="space-y-1.5 text-sm">
        {items.map((item) => (
          <li key={item.url}>
            <a
              href={item.url}
              className={`block transition-colors ${item.depth === 3 ? "pl-3" : ""} ${
                activeId === item.url.slice(1)
                  ? "font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
