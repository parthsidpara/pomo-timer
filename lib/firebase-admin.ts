import {
  cert,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let adminApp: App | null = null;
let adminDb: Firestore | null = null;
let adminAuth: Auth | null = null;

function readServiceAccount(): ServiceAccount {
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64?.trim();

  if (!encoded) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_BASE64 is not set. Add the base64-encoded Firebase service account JSON to the server environment.",
    );
  }

  let json: string;
  try {
    json = encoded.startsWith("{")
      ? encoded
      : Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_BASE64 is not valid base64. Re-encode the service account JSON.",
    );
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(json) as Record<string, unknown>;
  } catch {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_BASE64 did not decode to valid JSON.",
    );
  }

  if (
    typeof parsed.project_id !== "string" ||
    typeof parsed.client_email !== "string" ||
    typeof parsed.private_key !== "string"
  ) {
    throw new Error(
      "The Firebase service account JSON must include project_id, client_email, and private_key.",
    );
  }

  return parsed as unknown as ServiceAccount;
}

export function getFirebaseAdminApp(): App {
  if (adminApp) {
    return adminApp;
  }

  const existing = getApps();
  if (existing.length > 0) {
    adminApp = existing[0];
    return adminApp;
  }

  adminApp = initializeApp({
    credential: cert(readServiceAccount()),
  });

  return adminApp;
}

export function getDb(): Firestore {
  if (!adminDb) {
    adminDb = getFirestore(getFirebaseAdminApp());
  }

  return adminDb;
}

export function getAdminAuth(): Auth {
  if (!adminAuth) {
    adminAuth = getAuth(getFirebaseAdminApp());
  }

  return adminAuth;
}
