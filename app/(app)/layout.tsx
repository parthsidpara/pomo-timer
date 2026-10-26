import type { ReactNode } from "react";
import { WorklogShell } from "@/components/worklog-shell";

export default function AppLayout({ children }: { children: ReactNode }) {
  return <WorklogShell>{children}</WorklogShell>;
}
