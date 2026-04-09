import { highlight } from "sugar-high";

/**
 * Syntax-highlighted code block using sugar-high (~1KB, zero-config).
 * Renders at component render time — no WASM, no async, no layout shift.
 *
 * Token colors are set via CSS custom properties so they follow our
 * light/dark theme automatically.
 */
export function CodeBlock({ children }: { children: string }) {
  const html = highlight(children.trim());

  return (
    <pre className="overflow-x-auto rounded-lg border border-border bg-card p-4 text-sm leading-relaxed">
      <code
        className="font-mono text-[13px]"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </pre>
  );
}
