import type { TOCItemType } from "fumadocs-core/toc";
import { TOCProvider } from "fumadocs-ui/components/toc";
import { TOCItems, TOCItem } from "fumadocs-ui/components/toc/clerk";

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
  return (
    <TOCProvider toc={items} single>
      <nav
        className="sticky top-24 hidden max-h-[calc(100vh-8rem)] lg:block"
        aria-label="Table of contents"
      >
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          On this page
        </p>
        <TOCItems className="relative">
          {items.map((item) => (
            <TOCItem key={item.url} item={item}>
              {item.title}
            </TOCItem>
          ))}
        </TOCItems>
      </nav>
    </TOCProvider>
  );
}
