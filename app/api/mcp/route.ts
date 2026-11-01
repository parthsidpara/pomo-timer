import { createMcpHandler } from "mcp-handler";
import {
  allowedCorsOrigin,
  authorizeMcpRequest,
} from "@/lib/mcp-auth";
import { registerTools } from "@/lib/mcp-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const mcpHandler = createMcpHandler(registerTools, {
  serverInfo: {
    name: "worklog",
    version: "1.2.0",
  },
  instructions:
    "Single-user work-session ledger. Use current_session before pausing, resuming, or stopping. Active time excludes pauses. Display timestamps in Asia/Kolkata (IST). Tags are case-insensitive; use list_tags before assigning one. Use update_session, delete_session, and retag_sessions only for corrections. Use summary_by_hour, list_gaps, compare_periods, weekly_trend, and goal_progress for analysis. MCP Apps views are available for summary, current_session, summary_by_hour, list_gaps, and compare_periods; text fallbacks remain complete. Stop sessions when the work is done; early stops and long sessions are both normal.",
  maxSubscriptions: 0,
});

async function handleMcpRequest(request: Request): Promise<Response> {
  const corsOrigin = allowedCorsOrigin(request);

  if (request.method === "OPTIONS") {
    if (!corsOrigin) {
      return new Response(null, { status: 403 });
    }

    return new Response(null, {
      status: 204,
      headers: corsHeaders(corsOrigin),
    });
  }

  const authorization = authorizeMcpRequest(request);

  if (!authorization.ok) {
    return Response.json(
      { error: authorization.message },
      {
        status: authorization.status,
        headers: {
          "Cache-Control": "no-store",
          ...(corsOrigin ? corsHeaders(corsOrigin) : {}),
        },
      },
    );
  }

  const response = await mcpHandler(request);
  if (!corsOrigin) {
    return response;
  }

  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(corsOrigin))) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
    "Access-Control-Allow-Headers":
      "Authorization, Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function GET(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}

export async function OPTIONS(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}
