import { z } from "zod";
import { activeSeconds } from "@/lib/active-time";
import {
  ApiAuthError,
  authenticateOwner,
} from "@/lib/api-auth";
import { serializeSession } from "@/lib/serialization";
import {
  SessionError,
  type SessionErrorCode,
} from "@/lib/session-service";
import { getSessionService } from "@/lib/session-service-server";
import type { SessionRecord } from "@/lib/session-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

const ACTIONS = new Set(["start", "pause", "resume", "stop"]);

const startSchema = z.object({
  label: z
    .string()
    .trim()
    .max(200, "Label must be 200 characters or fewer.")
    .optional()
    .nullable(),
  tag: z
    .string()
    .trim()
    .max(64, "Tag must be 64 characters or fewer.")
    .optional()
    .nullable(),
});

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function sessionErrorStatus(code: SessionErrorCode): number {
  switch (code) {
    case "invalid_input":
      return 400;
    case "already_running":
    case "already_paused":
    case "not_paused":
      return 409;
    case "no_active":
      return 404;
  }
}

async function readStartBody(
  request: Request,
): Promise<z.infer<typeof startSchema>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new SessionError("invalid_input", "Request body must be valid JSON.");
  }

  const parsed = startSchema.safeParse(body);
  if (!parsed.success) {
    throw new SessionError(
      "invalid_input",
      parsed.error.issues[0]?.message ?? "Invalid session input.",
    );
  }

  return parsed.data;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> },
): Promise<Response> {
  const { action } = await context.params;

  if (!ACTIONS.has(action)) {
    return json({ error: "Unknown session action." }, 404);
  }

  try {
    await authenticateOwner(request);
    const service = getSessionService();
    let session: SessionRecord;

    switch (action) {
      case "start": {
        const input = await readStartBody(request);
        session = await service.startSession(input);
        break;
      }
      case "pause":
        session = await service.pauseSession();
        break;
      case "resume":
        session = await service.resumeSession();
        break;
      case "stop":
        session = await service.stopSession();
        break;
      default:
        return json({ error: "Unknown session action." }, 404);
    }

    const asOf = session.end ?? new Date();
    return json(
      {
        session: serializeSession(session, asOf),
        active_seconds: Math.floor(activeSeconds(session, asOf)),
      },
      action === "start" ? 201 : 200,
    );
  } catch (error) {
    if (error instanceof ApiAuthError) {
      return json({ error: error.message }, error.status);
    }

    if (error instanceof SessionError) {
      return json({ error: error.message }, sessionErrorStatus(error.code));
    }

    console.error("Session API request failed", error);
    return json({ error: "The session could not be updated." }, 500);
  }
}
