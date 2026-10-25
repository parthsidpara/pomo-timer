import { createFirestoreStore } from "./firestore-store";
import {
  createSessionService,
  type SessionService,
} from "./session-service";

let service: SessionService | null = null;

/**
 * The single server-side service used by both the web API and the MCP tools.
 * Firestore is not touched until one of its methods is called.
 */
export function getSessionService(): SessionService {
  if (!service) {
    service = createSessionService(createFirestoreStore());
  }

  return service;
}
