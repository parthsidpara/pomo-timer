"use client";

import { createContext, useContext } from "react";
import type { User } from "firebase/auth";
import type { SessionRecord } from "@/lib/session-types";

export type PendingAction = "start" | "pause" | "resume" | "stop" | null;

export type WorklogContextValue = {
  user: User;
  sessions: SessionRecord[];
  syncError: string | null;
  actionError: string | null;
  pending: PendingAction;
  mutate: (
    action: Exclude<PendingAction, null>,
    body?: object,
  ) => Promise<boolean>;
  startSession: (input: { label: string; tag: string }) => Promise<boolean>;
  signOut: () => void;
};

export const WorklogContext = createContext<WorklogContextValue | null>(null);

export function useWorklog(): WorklogContextValue {
  const value = useContext(WorklogContext);

  if (!value) {
    throw new Error("useWorklog must be used inside WorklogShell");
  }

  return value;
}
