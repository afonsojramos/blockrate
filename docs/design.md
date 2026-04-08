# blockrate.app — Design Charter (v0)

> v0 charter. Establishes principles, tokens, and the few rules that constrain the rest. Per-component rules grow with real screens, not in advance. Source of truth for every visual, motion, and copy decision in `apps/web` and any future surface.
>
> **Every PR that touches UI must answer to this file.** Reviewers cite section names. Charter changes get their own commits.

## Brand & voice

**blockrate.app exists because your analytics are lying to you, and we want to tell you exactly by how much.**

- **Calm over urgent.** No exclamation marks. No "amazing." No countdown timers.
- **Concrete over abstract.** "20% of your Optimizely calls never reached the server" beats "optimize your data quality."
- **Honest about limits.** If Phase 1 only ships magic link, the page says so.
- **Numbers are the hero.** Tabular numerals everywhere stats appear.
- **Lowercase product name** in body copy: `blockrate.app` / `blockrate`. Capitalised only at sentence start.

**Forbidden:** stock photos of people, mascots, "trusted by" walls without permission, parallax, scroll-jacking, modal newsletter prompts, spinners (use skeletons).

## Color (oklch, dark-first)

**Dark is the default surface.** Theme toggle defaults to System; if no preference, fall through to dark.

### Tokens — light

```css
:root {
  --background:        oklch(1.000 0.000 0);
  --foreground:        oklch(0.150 0.020 240);
  --card:              var(--background);
  --card-foreground:   var(--foreground);
  --popover:           oklch(0.990 0.005 240);
  --popover-foreground:var(--foreground);
  --primary:           oklch(0.450 0.180 250);
  --primary-foreground:oklch(0.985 0.005 240);
  --secondary:         oklch(0.960 0.010 240);
  --secondary-foreground:oklch(0.250 0.020 240);
  --muted:             oklch(0.965 0.010 240);
  --muted-foreground:  oklch(0.500 0.020 240);
  --accent:            var(--secondary);   /* shadcn components hard-reference --accent */
  --accent-foreground: var(--secondary-foreground);
  --border:            oklch(0.920 0.010 240);
  --input:             var(--border);
  --ring:              var(--primary);
  --destructive:       oklch(0.580 0.220 25);
  --destructive-foreground: oklch(0.985 0.005 240);

  /* The block-rate gradient — the only place colour is loud */
  --rate-low:  oklch(0.700 0.150 145);  /* < 5% */
  --rate-mid:  oklch(0.720 0.180 75);   /* 5–15% */
  --rate-high: oklch(0.620 0.220 25);   /* > 15% */

  --radius: 0.5rem;
}
```

### Tokens — dark (the default)

```css
.dark {
  --background:        oklch(0.100 0.010 240);
  --foreground:        oklch(0.970 0.005 240);
  --card:              oklch(0.130 0.010 240);
  --card-foreground:   var(--foreground);
  --popover:           oklch(0.150 0.012 240);
  --popover-foreground:var(--foreground);
  --primary:           oklch(0.700 0.200 250);
  --primary-foreground:oklch(0.100 0.010 240);
  --secondary:         oklch(0.180 0.010 240);
  --secondary-foreground:oklch(0.970 0.005 240);
  --muted:             oklch(0.180 0.010 240);
  --muted-foreground:  oklch(0.620 0.015 240);
  --accent:            var(--secondary);
  --accent-foreground: var(--secondary-foreground);
  --border:            oklch(0.220 0.010 240);
  --input:             var(--border);
  --ring:               var(--primary);
  --destructive:       oklch(0.660 0.230 25);
  --destructive-foreground: oklch(0.970 0.005 240);

  --rate-low:  oklch(0.700 0.180 145);
  --rate-mid:  oklch(0.770 0.200 75);
  --rate-high: oklch(0.700 0.240 25);
}
```

### Color rules

- `--primary` only on primary actions, links, active nav. **No decorative use.**
- `--destructive` only on literal destruction + the high end of the block-rate gradient.
- The block-rate gradient is the brand. It appears nowhere else.
- Greys are cool-tinted (`oklch(L 0.005-0.020 240)`). No pure neutral.
- WCAG AA minimum (4.5:1 body, 3:1 large text). AAA where it doesn't cost design quality.

## Typography

- **Sans:** Inter (variable, self-hosted), fallback `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- **Mono:** JetBrains Mono, fallback `ui-monospace, SFMono-Regular, monospace`. Used for code AND all numerals in tables.
- **`font-variant-numeric: tabular-nums slashed-zero`** wherever stats appear. Non-negotiable.

### Scale

| Token | Size | Use |
| --- | --- | --- |
| `text-xs`   | 12px | metadata, captions |
| `text-sm`   | 14px | dense UI (forms, sidebars, table cells) |
| `text-base` | 16px | body copy, default paragraph |
| `text-lg`   | 18px | section intros |
| `text-xl`   | 20px | card titles |
| `text-2xl`  | 24px | page subheadings |
| `text-3xl`  | 30px | section headings |
| `text-4xl`  | 36px | page titles |
| `text-5xl`  | 48px | hero h1 (landing only) |

`text-6xl` and above are reserved — don't use without a reason.

**Weights:** 400 (body), 500 (UI labels, table headers), 600 (subheadings), 700 (h1/h2 only). **Never bold inside body sentences** — restructure.

## Spacing & layout

- 4px base, 8px rhythm (Tailwind defaults). **Never odd values** (`5`, `7`, `9`).
- Container max-widths: marketing `max-w-6xl`, dashboard `max-w-5xl`, auth `max-w-md`.

## Motion

- **150ms default**, `cubic-bezier(0.16, 1, 0.3, 1)` ease-out
- **200ms `cubic-bezier(0.2, 0, 0, 1)`** for icon cross-fades
- **250ms** for dialog/drawer slide
- **300ms** for form→success swaps
- **Never spring physics.** Use eases.
- **Translate / opacity / scale only** — never `width`, `height`, `top`, `left`, `padding`, `margin`.
- **Skeletons not spinners.** Spinners reserved for indeterminate full-page transitions.
- **Respect `prefers-reduced-motion: reduce` always** — drop all transitions to 0.01ms via the media query in `app.css`.

## Iconography

- **`lucide-react` only.** No mixing libraries.
- **20px default**, 16px in dense UI, 24px in marketing hero.
- **Stroke width 1.5** (Lucide default is 2 — override globally).
- Same color as adjacent text unless communicating state.
- **Always use the per-icon subpath** to avoid the barrel-import bundle bloat: `import { Sun } from "lucide-react/icons/sun"`. Never `import { Sun } from "lucide-react"`.

## Fonts

- **Sans**: Inter, self-hosted woff2, **400 + 600 only** for Phase 1 (preload both). Other weights load on-demand.
- **Mono**: JetBrains Mono, self-hosted woff2, 400 + 500. **Do not preload** — below the fold.
- `font-display: swap` on every `@font-face`. Never `block`.
- Subset to Latin range for Phase 1; ext-Latin/Cyrillic when content demands.
- Preload pattern (in `__root.tsx` `<head>`):

```html
<link rel="preload" as="font" type="font/woff2" crossorigin
      href="/fonts/inter-400.woff2">
<link rel="preload" as="font" type="font/woff2" crossorigin
      href="/fonts/inter-600.woff2">
```

## Theme flash mitigation (non-negotiable)

The inline `<head>` script is **mandatory**. It runs synchronously, before any CSS, before React, before paint:

```html
<script>
  (function () {
    try {
      var s = localStorage.getItem("theme");
      var m = window.matchMedia("(prefers-color-scheme: dark)").matches;
      var d = s === "dark" || (s !== "light" && m);
      document.documentElement.classList.toggle("dark", d);
      document.documentElement.style.colorScheme = d ? "dark" : "light";
    } catch (e) {}
  })();
</script>
```

The default fallback is **dark** when no preference is set.

The React side **must NOT** own the initial theme value (julik-frontend-races: triple source of truth → guaranteed hydration mismatch). Use `useLayoutEffect` to read from the DOM (which the inline script set), `useLayoutEffect` to apply changes synchronously, `useEffect` to persist to localStorage. Render any theme-dependent text/icon/aria-label inside a placeholder slot until `theme !== null` (after mount), and tag the wrapping element `suppressHydrationWarning`.

## Polish principles (12)

These are the operational rules every interactive component answers to. **Cite by number in PR reviews.**

1. **Transitions are explicit.** Never `transition: all`. Always name properties: `transition-[background-color,transform,box-shadow]`.
2. **150ms default ease-out** for hover/focus; **200ms `cubic-bezier(0.2, 0, 0, 1)`** for icon cross-fades; **300ms** for form→success swaps.
3. **Scale-on-press 0.96** on every primary button. Never on ghost nav links.
4. **Focus-visible ring, not hover ring.** Keyboard gets a 2px offset ring (`focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`); mouse gets background/shadow only.
5. **Icons cross-fade, never toggle.** Both states in DOM, opacity 0→1, scale 0.25→1, blur 4px→0.
6. **Reserve space for dynamic content.** Error slots use `min-h-5`, numbers use `tabular-nums` — state changes must never shift layout.
7. **`text-balance` on headings, `text-pretty` on body.** Set once on `html` in `app.css`, never repeat.
8. **Font smoothing on root.** `antialiased` already in body.
9. **Minimum 40×40 hit area** on every interactive element, including the theme toggle.
10. **Placeholders are intentional surfaces.** Dashed border + generous padding + Phase-N copy treatment, never a blank `<div>`.
11. **Focus moves with state.** After submit success → heading. After submit error → input (with selection). After theme toggle → announce via `aria-live`.
12. **Disabled buttons stay focusable.** Use `aria-disabled`, not `disabled`, so screen readers still announce them and focus doesn't jump to `<body>`.

## Accessibility

- **WCAG 2.2 AA target.** AAA where it doesn't cost design quality.
- **Keyboard reachability:** every interactive element must be tab-reachable, with a visible focus ring (`--ring`, 2px outline, 2px offset).
- **`aria-*` attributes** wherever Base UI doesn't supply them automatically.
- **No keyboard traps.** Dialogs close on Esc, drawers close on click-outside, dropdowns close on Esc.
- **Color is never the only signal.** Status text always accompanies color (e.g. "Blocked" next to the red bar).

## Copywriting

- **Sentence case, not Title Case.** "Create an api key", not "Create An API Key".
- **No exclamation marks.** Anywhere.
- **API key, not API Key. URL, not Url. PostgreSQL, not Postgres** in formal copy; "Postgres" is fine in body.
- **Active voice.** "We dropped the user agent" beats "the user agent was dropped".
- **Don't say "simply." Or "easily." Or "just."**
- **Quantify when possible.** "Under 2 KB gzipped" beats "tiny."
- **Errors:** what failed, why, what to do. Three lines max. No stack traces in user-facing copy.

## Charter discipline

- **This is v0.** Per-component rules, copywriting catalogue, accessibility runbook all grow when real screens demand them. Don't add sections speculatively — add them when a PR review surfaces a question this charter doesn't answer.
- **Every PR that touches UI must answer to this file.** Reviewers cite section names.
- **Revise via PR**, not in passing. Charter changes get their own commits.
