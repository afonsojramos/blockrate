export const PRIVATE_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
} as const;

const PRIVATE_PATHS = ["/login", "/signup"] as const;
const PRIVATE_PATH_PREFIXES = ["/app", "/api", "/_serverFn"] as const;

function matchesPath(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function isPrivateResponseRequest(request: Request, pathname: string): boolean {
  if (request.headers.has("cookie") || request.headers.has("authorization")) {
    return true;
  }

  return (
    PRIVATE_PATHS.some((path) => pathname === path) ||
    PRIVATE_PATH_PREFIXES.some((path) => matchesPath(pathname, path))
  );
}

export function withPrivateResponseHeaders(response: Response): Response {
  const headers = new Headers(response.headers);

  for (const [name, value] of Object.entries(PRIVATE_RESPONSE_HEADERS)) {
    headers.set(name, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
