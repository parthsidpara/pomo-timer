import { createMcpHandler } from "mcp-handler";
import { authorizeMcpRequest } from "@/lib/mcp-auth";
import { registerTools } from "@/lib/mcp-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

const mcpHandler = createMcpHandler(registerTools, {
  serverInfo: {
    name: "worklog",
    version: "1.0.0",
  },
  instructions:
    "Single-user work-session ledger. Use current_session before pausing, resuming, or stopping. Active time excludes pauses. Display timestamps in Asia/Kolkata (IST). Stop sessions when the work is done; early stops and long sessions are both normal.",
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
