import { useEffect, useState } from "react";

interface TocItem {
  id: string;
  label: string;
  depth: number; // 0 = section, 1 = subsection
}

const TOC: TocItem[] = [
  { id: "install", label: "Quick start", depth: 0 },
  { id: "hosted", label: "Hosted", depth: 1 },
  { id: "self-hosted", label: "Self-hosted", depth: 1 },
  { id: "custom-pipeline", label: "Custom pipeline", depth: 1 },
  { id: "providers", label: "Providers", depth: 0 },
  { id: "frameworks", label: "Framework guides", depth: 0 },
  { id: "fw-react", label: "React", depth: 1 },
  { id: "fw-nextjs", label: "Next.js", depth: 1 },
  { id: "fw-sveltekit", label: "SvelteKit", depth: 1 },
  { id: "fw-tanstack", label: "TanStack Start", depth: 1 },
  { id: "fw-vanilla", label: "Vanilla JS", depth: 1 },
];

export function DocsToc() {
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const ids = TOC.map((t) => t.id);
    const elements = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the topmost visible section
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      {
        rootMargin: "-80px 0px -60% 0px",
        threshold: 0,
      },
    );

    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <nav
      className="sticky top-24 hidden max-h-[calc(100vh-8rem)] overflow-y-auto lg:block"
      aria-label="Table of contents"
    >
      <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        On this page
      </p>
      <ul className="space-y-0.5">
        {TOC.map((item) => {
          const isActive = activeId === item.id;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className={`block border-l-2 py-1 text-sm transition-[color,border-color] duration-150 ease-out ${
                  item.depth === 1 ? "pl-5" : "pl-3"
                } ${
                  isActive
                    ? "border-primary font-medium text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
