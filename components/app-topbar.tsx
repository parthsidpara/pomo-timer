"use client";

import { useEffect, useState } from "react";
import { AppNav } from "./app-nav";
import { ThemeToggle } from "./theme-toggle";
import { formatIstHeaderDate } from "@/lib/ist-dates";

export function AppTopbar({ showNav }: { showNav: boolean }) {
  const [dateLabel, setDateLabel] = useState<string | null>(null);

  useEffect(() => {
    const updateDate = () => setDateLabel(formatIstHeaderDate(new Date()));
    updateDate();
    const interval = window.setInterval(updateDate, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <span className="wordmark">Worklog</span>
      </div>

      {showNav ? <AppNav variant="desktop" /> : null}

      <div className="topbar-actions">
        <div className="topbar-meta">
          {dateLabel ? (
            <span className="topbar-date">{dateLabel}</span>
          ) : null}
          <span className="timezone">IST</span>
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}
