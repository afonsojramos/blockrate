import { useState, useCallback } from "react";
import { highlight } from "sugar-high";
import { Clipboard, Check } from "lucide-react";

/**
 * Editor-style syntax-highlighted code block using sugar-high (~1KB, zero-config).
 * Renders at component render time — no WASM, no async, no layout shift.
 *
 * Token colors are set via CSS custom properties so they follow our
 * light/dark theme automatically.
 */
export function CodeBlock({
  children,
  filename = "app.tsx",
}: {
  children: string;
  filename?: string;
}) {
  const [copied, setCopied] = useState(false);
  const trimmed = children.trim();
  const lines = trimmed.split("\n");
  const html = highlight(trimmed);
  const highlightedLines = html.split("\n");

  const onCopy = useCallback(() => {
    navigator.clipboard.writeText(trimmed).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [trimmed]);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-border bg-muted px-4 py-2">
        <div className="flex items-center gap-3">
          {/* Traffic-light dots */}
          <div className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[#ef4444]" />
            <span className="size-2 rounded-full bg-[#eab308]" />
            <span className="size-2 rounded-full bg-[#22c55e]" />
          </div>
          {/* Filename tab */}
          <span className="text-xs font-medium text-muted-foreground">{filename}</span>
        </div>
        {/* Copy button */}
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition-[background-color,color] duration-150 ease-out hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.96]"
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <Check size={14} />
              Copied!
            </>
          ) : (
            <>
              <Clipboard size={14} />
              Copy
            </>
          )}
        </button>
      </div>

      {/* Code area with line numbers */}
      <pre className="overflow-x-auto p-4 text-sm leading-relaxed">
        <table className="border-collapse">
          <tbody>
            {lines.map((_, i) => (
              <tr key={i}>
                <td className="select-none pr-4 text-right align-top border-r border-border font-mono text-[13px] text-muted-foreground">
                  {i + 1}
                </td>
                <td className="pl-4">
                  <code
                    className="font-mono text-[13px]"
                    dangerouslySetInnerHTML={{
                      __html: highlightedLines[i] ?? "",
                    }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </pre>
    </div>
  );
}
