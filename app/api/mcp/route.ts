import { createMcpHandler } from "mcp-handler";
import { authorizeMcpRequest } from "@/lib/mcp-auth";
import { registerTools } from "@/lib/mcp-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const mcpHandler = createMcpHandler(registerTools, {
  serverInfo: {
    name: "worklog",
    version: "1.1.0",
  },
  instructions:
    "Single-user work-session ledger. Use current_session before pausing, resuming, or stopping. Active time excludes pauses. Display timestamps in Asia/Kolkata (IST). Tags are case-insensitive; use list_tags before assigning one. Use update_session, delete_session, and retag_sessions only for corrections. Use summary_by_hour, list_gaps, compare_periods, weekly_trend, and goal_progress for analysis. Stop sessions when the work is done; early stops and long sessions are both normal.",
  maxSubscriptions: 0,
});

async function handleMcpRequest(request: Request): Promise<Response> {
  const authorization = authorizeMcpRequest(request);

  if (!authorization.ok) {
    return Response.json(
      { error: authorization.message },
      {
        status: authorization.status,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }

  return mcpHandler(request);
}

export async function GET(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}

export async function POST(request: Request): Promise<Response> {
  return handleMcpRequest(request);
}
