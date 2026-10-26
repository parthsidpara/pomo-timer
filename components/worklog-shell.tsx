"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";
import {
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { AppNav } from "./app-nav";
import { AppTopbar } from "./app-topbar";
import { DeniedPanel, LoadingPanel, SignInPanel, StatePanel } from "./gate";
import {
  WorklogContext,
  type PendingAction,
} from "./worklog-context";
import {
  firebaseIsConfigured,
  getFirebaseClient,
} from "@/lib/firebase-client";
import { mapSessionDocument } from "@/lib/session-document";
import type { SessionRecord } from "@/lib/session-types";

function errorCode(error: unknown): string | undefined {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    return (error as { code: string }).code;
  }

  return undefined;
}

function signInErrorMessage(error: unknown): string {
  switch (errorCode(error)) {
    case "auth/unauthorized-domain":
      return "This domain is not authorized in Firebase Authentication. Add it under Authentication → Settings → Authorized domains.";
    case "auth/operation-not-allowed":
      return "Google sign-in is not enabled in Firebase Authentication.";
    case "auth/invalid-api-key":
      return "The Firebase web API key is invalid. Check the NEXT_PUBLIC_FIREBASE_* environment variables.";
    case "auth/network-request-failed":
      return "Google could not be reached. Check your connection and try again.";
    case "auth/web-storage-unsupported":
      return "This browser has storage disabled. Allow site data and try again.";
    default:
      return "Sign-in did not complete. Try again.";
  }
}

export function WorklogShell({ children }: { children: ReactNode }) {
  const configured = firebaseIsConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [authResolved, setAuthResolved] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [sessions, setSessions] = useState<SessionRecord[] | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      return;
    }

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Install support is a progressive enhancement; the app works without it.
      });
    }
  }, []);

  useEffect(() => {
    if (!configured) {
      setAuthResolved(true);
      return;
    }

    let active = true;
    let unsubscribe: (() => void) | undefined;
    let authTimeout: number | undefined;

    try {
      const { auth } = getFirebaseClient();

      getRedirectResult(auth).catch((error: unknown) => {
        if (active) {
          setAuthError(signInErrorMessage(error));
        }
      });

      authTimeout = window.setTimeout(() => {
        if (!active) {
          return;
        }

        setAuthResolved(true);
        setAuthError(
          (current) =>
            current ??
            "Firebase Authentication did not respond. Check the web app configuration and authorized domains.",
        );
      }, 8000);

      unsubscribe = onAuthStateChanged(
        auth,
        (nextUser) => {
          if (!active) {
            return;
          }

          if (authTimeout !== undefined) {
            window.clearTimeout(authTimeout);
            authTimeout = undefined;
          }

          setUser(nextUser);
          setAuthResolved(true);
          if (nextUser) {
            setAuthError(null);
          }
          setDenied(false);
          setSessions(null);
          setSyncError(null);
          setActionError(null);
          setPending(null);
        },
        (error) => {
          if (active) {
            setAuthResolved(true);
            setAuthError(signInErrorMessage(error));
          }
        },
      );
    } catch {
      if (active) {
        setAuthResolved(true);
        setAuthError(
          "Firebase could not start. Check the web app configuration and authorized domains.",
        );
      }
    }

    return () => {
      active = false;
      if (authTimeout !== undefined) {
        window.clearTimeout(authTimeout);
      }
      unsubscribe?.();
    };
  }, [configured]);

  const userUid = user?.uid ?? null;

  useEffect(() => {
    if (!userUid) {
      setSessions(null);
      return;
    }

    let active = true;
    setSessions(null);
    setDenied(false);
    setSyncError(null);

    let unsubscribe: (() => void) | undefined;

    try {
      const { db } = getFirebaseClient();
      const sessionsQuery = query(
        collection(db, "sessions"),
        orderBy("start", "desc"),
        limit(50),
      );

      unsubscribe = onSnapshot(
        sessionsQuery,
        (snapshot) => {
          if (!active) {
            return;
          }

          const next = snapshot.docs
            .map((document) =>
              mapSessionDocument(
                document.id,
                document.data() as Record<string, unknown>,
              ),
            )
            .filter((session): session is SessionRecord => session !== null);

          setSessions(next);
          setDenied(false);
          setSyncError(null);
        },
        (error) => {
          if (!active) {
            return;
          }

          console.error("Session listener failed", error);

          if (errorCode(error) === "permission-denied") {
            setDenied(true);
            setSessions([]);
            return;
          }

          setSyncError(
            "Live updates are reconnecting. The timer data stays stored in Firestore.",
          );
        },
      );
    } catch {
      if (active) {
        setSyncError(
          "Firestore could not start. Check the web app configuration.",
        );
      }
    }

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [userUid]);

  const mutate = useCallback(
    async (action: Exclude<PendingAction, null>, body?: object) => {
      if (!user) {
        return false;
      }

      setPending(action);
      setActionError(null);

      try {
        const token = await user.getIdToken();
        const response = await fetch(`/api/sessions/${action}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body ?? {}),
          cache: "no-store",
        });

        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;

        if (!response.ok) {
          throw new Error(
            payload?.error ??
              `The session could not be updated (${response.status}).`,
          );
        }

        return true;
      } catch (error) {
        setActionError(
          error instanceof Error
            ? error.message
            : "The session could not be updated.",
        );
        return false;
      } finally {
        setPending(null);
      }
    },
    [user],
  );

  async function handleSignIn() {
    if (signingIn) {
      return;
    }

    setSigningIn(true);
    setAuthError(null);

    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });

    try {
      const { auth } = getFirebaseClient();
      await signInWithPopup(auth, provider);
    } catch (error) {
      const code = errorCode(error);

      if (
        code === "auth/popup-blocked" ||
        code === "auth/operation-not-supported-in-this-environment"
      ) {
        try {
          const { auth } = getFirebaseClient();
          await signInWithRedirect(auth, provider);
        } catch (redirectError) {
          setAuthError(signInErrorMessage(redirectError));
        }
      } else if (
        code !== "auth/popup-closed-by-user" &&
        code !== "auth/cancelled-popup-request"
      ) {
        setAuthError(signInErrorMessage(error));
      }
    } finally {
      setSigningIn(false);
    }
  }

  async function handleSignOut() {
    setAuthError(null);

    try {
      const { auth } = getFirebaseClient();
      await signOut(auth);
    } catch {
      setAuthError("Sign out failed. Reload the page and try again.");
    }
  }

  const startSession = useCallback(
    (input: { label: string; tag: string }) =>
      mutate("start", { label: input.label, tag: input.tag }),
    [mutate],
  );

  const showNav = Boolean(user) && !denied && sessions !== null;
  let content: ReactNode;

  if (!configured) {
    content = (
      <StatePanel
        title="Firebase is not configured."
        message="Add the Firebase web app settings to the environment, then restart or redeploy."
        detail="NEXT_PUBLIC_FIREBASE_API_KEY · NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN · NEXT_PUBLIC_FIREBASE_PROJECT_ID · NEXT_PUBLIC_FIREBASE_APP_ID"
      />
    );
  } else if (!authResolved) {
    content = <LoadingPanel />;
  } else if (!user) {
    content = (
      <SignInPanel
        signingIn={signingIn}
        error={authError}
        onSignIn={() => void handleSignIn()}
      />
    );
  } else if (denied) {
    content = (
      <DeniedPanel
        email={user.email}
        uid={user.uid}
        onSwitchAccount={() => void handleSignOut()}
      />
    );
  } else if (sessions === null) {
    content = <LoadingPanel message={syncError ?? "Opening your ledger…"} />;
  } else {
    content = (
      <WorklogContext.Provider
        value={{
          user,
          sessions,
          syncError,
          actionError,
          pending,
          mutate,
          startSession,
          signOut: () => void handleSignOut(),
        }}
      >
        {children}
      </WorklogContext.Provider>
    );
  }

  return (
    <>
      <div className={`shell${showNav ? " has-bottom-nav" : ""}`}>
        <AppTopbar showNav={showNav} />
        {content}
      </div>
      {showNav ? <AppNav variant="bottom" /> : null}
    </>
  );
}
