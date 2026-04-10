import { useRef } from "react";
import { AnchorProvider, ScrollProvider, TOCItem, type TOCItemType } from "fumadocs-core/toc";

const items: TOCItemType[] = [
  { title: "Quick start", url: "#install", depth: 2 },
  { title: "Hosted", url: "#hosted", depth: 3 },
  { title: "Self-hosted", url: "#self-hosted", depth: 3 },
  { title: "Custom pipeline", url: "#custom-pipeline", depth: 3 },
  { title: "Providers", url: "#providers", depth: 2 },
  { title: "Framework guides", url: "#frameworks", depth: 2 },
  { title: "React", url: "#fw-react", depth: 3 },
  { title: "Next.js", url: "#fw-nextjs", depth: 3 },
  { title: "SvelteKit", url: "#fw-sveltekit", depth: 3 },
  { title: "TanStack Start", url: "#fw-tanstack", depth: 3 },
  { title: "Vanilla JS", url: "#fw-vanilla", depth: 3 },
];

export function DocsToc() {
  const containerRef = useRef<HTMLElement>(null);

  return (
    <AnchorProvider toc={items} single>
      <nav
        ref={containerRef}
        className="sticky top-24 hidden max-h-[calc(100vh-8rem)] overflow-y-auto lg:block"
        aria-label="Table of contents"
      >
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          On this page
        </p>
        <ScrollProvider containerRef={containerRef}>
          <ul className="space-y-0.5">
            {items.map((item) => (
              <li key={item.url}>
                <TOCItem
                  href={item.url}
                  className="block border-l-2 border-transparent py-1 text-sm text-muted-foreground transition-[color,border-color] duration-150 ease-out hover:text-foreground data-[active=true]:border-primary data-[active=true]:font-medium data-[active=true]:text-foreground"
                  style={{
                    paddingLeft: item.depth === 3 ? "1.25rem" : "0.75rem",
                  }}
                >
                  {item.title}
                </TOCItem>
              </li>
            ))}
          </ul>
        </ScrollProvider>
      </nav>
    </AnchorProvider>
  );
}
