"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type AppNavProps = {
  variant: "desktop" | "bottom";
};

const items = [
  { href: "/", label: "Timer", icon: "timer" as const },
  { href: "/analysis", label: "Analysis", icon: "analysis" as const },
];

function TimerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 7.5V12l3 2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 2.75h6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function AnalysisIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 20V11M12 20V4M19 20v-6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function NavIcon({ icon }: { icon: "timer" | "analysis" }) {
  return icon === "timer" ? <TimerIcon /> : <AnalysisIcon />;
}

export function AppNav({ variant }: AppNavProps) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  if (variant === "desktop") {
    return (
      <nav className="topbar-nav" aria-label="Main">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`topbar-nav-link${active ? " is-active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="bottom-nav" aria-label="Main">
      <div className="bottom-nav-inner">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`bottom-nav-link${active ? " is-active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <NavIcon icon={item.icon} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
