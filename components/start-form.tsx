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
    <section className="ticket start-ticket" aria-labelledby="start-title">
      <div className="ticket-top">
        <span>New session</span>
        <span>IST</span>
      </div>

      <h1 id="start-title" className="start-title">
        Start a session<span className="title-mark">.</span>
      </h1>

      <form className="start-form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="session-label">
            What are you working on?{" "}
            <span className="label-note">optional</span>
          </label>
          <input
            id="session-label"
            className="input input-label"
            name="label"
            type="text"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={200}
            placeholder="Leave blank if you like"
            autoComplete="off"
          />
        </div>

        <div className="start-row">
          <div className="field">
            <label htmlFor="session-tag">
              Tag <span className="label-note">optional</span>
            </label>
            <input
              id="session-tag"
              className="input input-tag"
              name="tag"
              type="text"
              value={tag}
              onChange={(event) => setTag(event.target.value)}
              maxLength={64}
              placeholder="Project or area"
              autoComplete="off"
            />
          </div>

          <button
            className="btn btn-primary"
            type="submit"
            disabled={pending}
            aria-busy={pending}
          >
            {pending ? "Starting…" : "Start session"}
          </button>
        </div>
      </form>
    </section>
  );
}
