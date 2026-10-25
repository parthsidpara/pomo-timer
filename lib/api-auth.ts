import { getAdminAuth } from "./firebase-admin";

export class ApiAuthError extends Error {
  readonly status: 401 | 403 | 500;

  constructor(status: 401 | 403 | 500, message: string) {
    super(message);
    this.name = "ApiAuthError";
    this.status = status;
  }
}

export function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) {
    return null;
  }

  const match = /^Bearer[ \t]+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

export async function authenticateOwner(request: Request): Promise<{
  uid: string;
}> {
  const token = readBearerToken(request);
  if (!token) {
    throw new ApiAuthError(401, "Sign in is required.");
  }

  const ownerUid = process.env.OWNER_UID?.trim();
  if (!ownerUid) {
    throw new ApiAuthError(500, "Server authentication is not configured.");
  }

  let decoded: Awaited<ReturnType<ReturnType<typeof getAdminAuth>["verifyIdToken"]>>;
  try {
    decoded = await getAdminAuth().verifyIdToken(token);
  } catch {
    throw new ApiAuthError(401, "The sign-in token is invalid or expired.");
  }

  if (decoded.uid !== ownerUid) {
    throw new ApiAuthError(403, "This account does not own this worklog.");
  }

  return { uid: decoded.uid };
}
