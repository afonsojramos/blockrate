import { describe, it, expect } from "vitest";
import { seo } from "@/lib/seo";

function findMeta(head: ReturnType<typeof seo>, key: "name" | "property", value: string) {
  return head.meta.find((m) => key in m && (m as Record<string, string>)[key] === value) as
    | { content: string }
    | undefined;
}

function findTitle(head: ReturnType<typeof seo>) {
  return head.meta.find((m) => "title" in m) as { title: string } | undefined;
}

function findLink(head: ReturnType<typeof seo>, rel: string) {
  return head.links.find((l) => l.rel === rel);
}

describe("seo()", () => {
  it("emits a distinct title, description, and og+twitter tags", () => {
    const head = seo({
      title: "pricing · blockrate",
      description: "honest pricing — free forever tier, paid when you need more.",
      path: "/pricing",
    });

    expect(findTitle(head)?.title).toBe("pricing · blockrate");
    expect(findMeta(head, "name", "description")?.content).toContain("honest pricing");
    expect(findMeta(head, "property", "og:title")?.content).toBe("pricing · blockrate");
    expect(findMeta(head, "property", "og:description")?.content).toContain("honest pricing");
    expect(findMeta(head, "property", "og:type")?.content).toBe("website");
    expect(findMeta(head, "property", "og:site_name")?.content).toBe("blockrate");
    expect(findMeta(head, "name", "twitter:card")?.content).toBe("summary");
    expect(findMeta(head, "name", "twitter:title")?.content).toBe("pricing · blockrate");
  });

  it("adds noindex meta when noindex is true", () => {
    const head = seo({
      title: "sign in",
      description: "sign in to blockrate.",
      path: "/login",
      noindex: true,
    });

    expect(findMeta(head, "name", "robots")?.content).toBe("noindex,nofollow");
  });

  it("does not add noindex meta by default", () => {
    const head = seo({
      title: "docs",
      description: "blockrate library documentation.",
      path: "/docs",
    });

    expect(findMeta(head, "name", "robots")).toBeUndefined();
  });

  it("omits canonical and og:url when VITE_SITE_URL is unset", () => {
    const head = seo({
      title: "t",
      description: "d",
      path: "/some",
    });

    // Test env has no VITE_SITE_URL; canonical must not be emitted as
    // localhost or a broken absolute.
    expect(findLink(head, "canonical")).toBeUndefined();
    expect(findMeta(head, "property", "og:url")).toBeUndefined();
  });

  it("stringifies JSON-LD deterministically (stable key order)", () => {
    const a = seo({
      title: "t",
      description: "d",
      path: "/",
      jsonLd: { "@context": "https://schema.org", "@type": "Organization", name: "blockrate" },
    });
    const b = seo({
      title: "t",
      description: "d",
      path: "/",
      jsonLd: { name: "blockrate", "@type": "Organization", "@context": "https://schema.org" },
    });

    expect(a.scripts[0]?.type).toBe("application/ld+json");
    expect(a.scripts[0]?.children).toBe(b.scripts[0]?.children);
  });

  it("emits one script per jsonLd when given an array", () => {
    const head = seo({
      title: "t",
      description: "d",
      path: "/",
      jsonLd: [
        { "@type": "Organization", name: "blockrate" },
        { "@type": "WebSite", name: "blockrate" },
      ],
    });

    expect(head.scripts).toHaveLength(2);
    expect(head.scripts[0]?.children).toContain("Organization");
    expect(head.scripts[1]?.children).toContain("WebSite");
  });
});
