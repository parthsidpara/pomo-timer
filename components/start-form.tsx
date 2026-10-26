"use client";

import { useState, type FormEvent } from "react";

type StartInput = {
  label: string;
  tag: string;
};

type StartFormProps = {
  onStart: (input: StartInput) => Promise<boolean>;
  pending: boolean;
};

function PlayIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M7.25 5.35a.7.7 0 0 1 1.07-.6l5.3 3.4a.7.7 0 0 1 0 1.18l-5.3 3.4a.7.7 0 0 1-1.07-.6V5.35Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function StartForm({ onStart, pending }: StartFormProps) {
  const [label, setLabel] = useState("");
  const [tag, setTag] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (pending) {
      return;
    }

    const started = await onStart({ label, tag });
    if (started) {
      setLabel("");
      setTag("");
    }
  }

  return (
    <section className="card start-card" aria-labelledby="start-title">
      <div className="card-kicker-row">
        <span>New session</span>
        <span className="card-kicker-quiet">IST</span>
      </div>

      <h1 id="start-title" className="start-title">
        Start a session.
      </h1>

      <p className="start-copy">
        Name the work if you like. Both fields are optional.
      </p>

      <form className="start-form" onSubmit={handleSubmit}>
        <div className="field">
          <label className="field-label" htmlFor="session-label">
            What are you working on?
          </label>
          <input
            id="session-label"
            className="input"
            name="label"
            type="text"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={200}
            placeholder="e.g. Finalize the settings screen"
            autoComplete="off"
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="session-tag">
            Tag
          </label>
          <input
            id="session-tag"
            className="input"
            name="tag"
            type="text"
            value={tag}
            onChange={(event) => setTag(event.target.value)}
            maxLength={64}
            placeholder="e.g. Design"
            autoComplete="off"
          />
        </div>

        <button
          className="btn btn-primary btn-block"
          type="submit"
          disabled={pending}
          aria-busy={pending}
        >
          {pending ? (
            <span className="spinner" aria-hidden="true" />
          ) : (
            <PlayIcon />
          )}
          {pending ? "Starting…" : "Start session"}
        </button>
      </form>
    </section>
  );
}
