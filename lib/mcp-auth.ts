import { timingSafeEqual } from "node:crypto";

export type McpAuthorization =
  | { ok: true }
  | { ok: false; status: 401 | 403 | 500; message: string };

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) {
    return null;
  }

  const match = /^Bearer[ \t]+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

function queryToken(request: Request): string | null {
  try {
    return new URL(request.url).searchParams.get("key")?.trim() || null;
  } catch {
    return null;
  }
}

function tokenMatches(provided: string, expected: string): boolean {
  const providedBytes = Buffer.from(provided, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");

  if (providedBytes.length !== expectedBytes.length) {
    return false;
  }

  return timingSafeEqual(providedBytes, expectedBytes);
}

function originIsAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) {
    return true;
  }

  let normalized: string;
  try {
    normalized = new URL(origin).origin;
  } catch {
    return false;
  }

  const configured = (process.env.MCP_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const allowed = new Set([
    new URL(request.url).origin,
    "https://claude.ai",
    "https://www.claude.ai",
    "https://claude.com",
    "https://www.claude.com",
    ...configured,
  ]);

  return allowed.has(normalized);
}

/**
 * The normalized origin to echo for CORS, or null when there is no Origin or
 * the origin is not allowlisted. CORS is only for browser-based hosts; the
 * MCP token is still required for actual requests.
 */
export function allowedCorsOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (!origin || !originIsAllowed(request)) {
    return null;
  }

  try {
    return new URL(origin).origin;
  } catch {
    return null;
  }
}

/**
 * Static token auth for the remote MCP connector. Accepts either the preferred
 * Authorization: Bearer header, or a `key` query parameter for clients whose
 * connector UI cannot set custom headers. No OAuth, no session state.
 *
 * The 401 intentionally omits WWW-Authenticate so clients do not try OAuth
 * discovery.
 */
export function authorizeMcpRequest(request: Request): McpAuthorization {
  const expected = process.env.MCP_BEARER_TOKEN?.trim();
  if (!expected) {
    return {
      ok: false,
      status: 500,
      message: "MCP_BEARER_TOKEN is not configured.",
    };
  }

  if (!originIsAllowed(request)) {
    return { ok: false, status: 403, message: "Origin not allowed." };
  }

  const candidates = [bearerToken(request), queryToken(request)].filter(
    (token): token is string => token !== null,
  );

  if (!candidates.some((token) => tokenMatches(token, expected))) {
    return { ok: false, status: 401, message: "Unauthorized." };
  }

  return { ok: true };
}
