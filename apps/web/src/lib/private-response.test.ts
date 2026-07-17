import { describe, expect, test } from "vitest";
import { isPrivateResponseRequest, withPrivateResponseHeaders } from "./private-response";

describe("private response policy", () => {
  test.each([
    "/app",
    "/app/settings",
    "/api/auth/sign-in",
    "/api/internal/retention",
    "/_serverFn/abc123",
    "/login",
    "/signup",
  ])("classifies %s as private", (pathname) => {
    expect(
      isPrivateResponseRequest(new Request(`https://blockrate.app${pathname}`), pathname),
    ).toBe(true);
  });

  test.each(["/", "/pricing", "/docs", "/block-rate.json"])(
    "leaves anonymous %s public",
    (pathname) => {
      expect(
        isPrivateResponseRequest(new Request(`https://blockrate.app${pathname}`), pathname),
      ).toBe(false);
    },
  );

  test("treats identity-bearing requests to public pages as private", () => {
    const request = new Request("https://blockrate.app/pricing", {
      headers: { Cookie: "better-auth.session_token=test" },
    });

    expect(isPrivateResponseRequest(request, "/pricing")).toBe(true);
  });

  test("overrides weaker cache headers while preserving the response", async () => {
    const response = withPrivateResponseHeaders(
      new Response("streamed body", {
        status: 202,
        headers: {
          "Cache-Control": "public, max-age=300",
          "Content-Type": "text/plain",
        },
      }),
    );

    expect(response.status).toBe(202);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Robots-Tag")).toBe("noindex, nofollow, noarchive");
    expect(response.headers.get("Content-Type")).toContain("text/plain");
    expect(await response.text()).toBe("streamed body");
  });
});
