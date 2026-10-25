"use client";

type Theme = "light" | "dark";

function effectiveTheme(): Theme {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === "light" || explicit === "dark") {
    return explicit;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function toggleTheme(): void {
  const next: Theme = effectiveTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;

  try {
    window.localStorage.setItem("worklog-theme", next);
  } catch {
    // The visual change still works if storage is unavailable.
  }
}

export function ThemeToggle() {
  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label="Switch color theme"
      title="Switch color theme"
    >
      <svg
        className="theme-icon theme-icon-moon"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M20.2 15.4A8.6 8.6 0 0 1 8.6 3.8 8.6 8.6 0 1 0 20.2 15.4Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>

      <svg
        className="theme-icon theme-icon-sun"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M12 2v2.2M12 19.8V22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2 12h2.2M19.8 12H22M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
