"use client";

import { BrandMark } from "./brand-mark";

type SignInPanelProps = {
  signingIn: boolean;
  error: string | null;
  onSignIn: () => void;
};

export function SignInPanel({
  signingIn,
  error,
  onSignIn,
}: SignInPanelProps) {
  return (
    <main className="gate">
      <section className="gate-panel" aria-labelledby="gate-title">
        <BrandMark className="gate-mark" />

        <p className="gate-eyebrow">Private work ledger</p>

        <h1 id="gate-title" className="gate-title">
          A private ledger of your working hours.
        </h1>

        <p className="gate-copy">
          Sign in with the Google account that owns this log. There is one
          owner, one running session, and no one else.
        </p>

        <button
          type="button"
          className="btn btn-primary btn-block"
          onClick={onSignIn}
          disabled={signingIn}
          aria-busy={signingIn}
        >
          {signingIn ? (
            <span className="spinner" aria-hidden="true" />
          ) : null}
          {signingIn ? "Opening Google…" : "Continue with Google"}
        </button>

        {error ? (
          <p className="banner banner-error" role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  );
}

type StatePanelProps = {
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  busy?: boolean;
  detail?: string | null;
};

export function StatePanel({
  title,
  message,
  actionLabel,
  onAction,
  busy = false,
  detail,
}: StatePanelProps) {
  return (
    <main className="state-page">
      <p className="state-kicker">Worklog</p>
      <h1 className="state-title">{title}</h1>
      <p className="state-copy">{message}</p>

      {detail ? (
        <p className="state-detail">
          <code>{detail}</code>
        </p>
      ) : null}

      {actionLabel && onAction ? (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onAction}
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? <span className="spinner" aria-hidden="true" /> : null}
          {busy ? "Working…" : actionLabel}
        </button>
      ) : null}
    </main>
  );
}

type DeniedPanelProps = {
  email: string | null;
  uid: string;
  onSwitchAccount: () => void;
};

export function DeniedPanel({
  email,
  uid,
  onSwitchAccount,
}: DeniedPanelProps) {
  return (
    <StatePanel
      title="This ledger is private."
      message={`${email ?? "This Google account"} is not the owner of this worklog. Sign in with the owner account to continue.`}
      detail={`Signed-in UID: ${uid}`}
      actionLabel="Use another account"
      onAction={onSwitchAccount}
    />
  );
}

type LoadingPanelProps = {
  message?: string;
};

export function LoadingPanel({
  message = "Opening your ledger…",
}: LoadingPanelProps) {
  return (
    <main className="state-page" role="status">
      <p className="state-kicker">Worklog</p>
      <h1 className="state-title">{message}</h1>
      <span className="spinner spinner-accent" aria-hidden="true" />
    </main>
  );
}
