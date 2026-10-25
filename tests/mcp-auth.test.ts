import { afterEach, describe, expect, it, vi } from "vitest";
import { authorizeMcpRequest } from "@/lib/mcp-auth";

const TOKEN = "test-token-that-is-long-enough";
const MCP_URL = "https://worklog.example/api/mcp";

function makeRequest(init?: {
  key?: string;
  authorization?: string;
  origin?: string;
}): Request {
  const url = new URL(MCP_URL);
  if (init?.key) {
    url.searchParams.set("key", init.key);
  }

  const headers = new Headers();
  if (init?.authorization) {
    headers.set("Authorization", init.authorization);
  }
  if (init?.origin) {
    headers.set("Origin", init.origin);
  }

  return new Request(url, {
    method: "POST",
    headers,
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("MCP auth", () => {
  it("accepts the bearer header", () => {
    vi.stubEnv("MCP_BEARER_TOKEN", TOKEN);

    expect(
      authorizeMcpRequest(makeRequest({ authorization: `Bearer ${TOKEN}` })),
    ).toEqual({ ok: true });
  });

  it("accepts the key query parameter", () => {
    vi.stubEnv("MCP_BEARER_TOKEN", TOKEN);

    expect(authorizeMcpRequest(makeRequest({ key: TOKEN }))).toEqual({
      ok: true,
    });
  });

  it("rejects missing or incorrect credentials", () => {
    vi.stubEnv("MCP_BEARER_TOKEN", TOKEN);

    expect(authorizeMcpRequest(makeRequest())).toMatchObject({
      ok: false,
      status: 401,
    });
    expect(
      authorizeMcpRequest(makeRequest({ key: "wrong" })),
    ).toMatchObject({ ok: false, status: 401 });
    expect(
      authorizeMcpRequest(makeRequest({ authorization: "Bearer wrong" })),
    ).toMatchObject({ ok: false, status: 401 });
  });

  it("fails closed when the server token is not configured", () => {
    vi.stubEnv("MCP_BEARER_TOKEN", "");

    expect(authorizeMcpRequest(makeRequest({ key: TOKEN }))).toMatchObject({
      ok: false,
      status: 500,
    });
  });

  it("continues to reject disallowed browser origins", () => {
    vi.stubEnv("MCP_BEARER_TOKEN", TOKEN);

    expect(
      authorizeMcpRequest(
        makeRequest({
          key: TOKEN,
          origin: "https://malicious.example",
        }),
      ),
    ).toMatchObject({ ok: false, status: 403 });
  });
});
