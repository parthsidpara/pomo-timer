/** Comparison key for a tag. Tags are case-insensitive everywhere. */
export function tagKey(tag: string | null | undefined): string | null {
  const trimmed = tag?.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

/** Trimmed display value, or null when the tag is empty. */
export function cleanTag(tag: string | null | undefined): string | null {
  const trimmed = tag?.trim() ?? "";
  return trimmed ? trimmed : null;
}

type TaggedSession = {
  tag: string | null;
  start: Date;
};

/**
 * Pick one display spelling per case-insensitive tag key. The most recent
 * session wins, so a cleaned-up spelling becomes the canonical one.
 */
export function canonicalTagDisplays(
  sessions: Iterable<TaggedSession>,
): Map<string, string> {
  const latest = new Map<string, { tag: string; start: number }>();

  for (const session of sessions) {
    const key = tagKey(session.tag);
    if (!key || !session.tag) {
      continue;
    }

    const start = session.start.getTime();
    const current = latest.get(key);

    if (
      !current ||
      start > current.start ||
      (start === current.start && session.tag > current.tag)
    ) {
      latest.set(key, { tag: session.tag, start });
    }
  }

  return new Map(
    [...latest.entries()].map(([key, value]) => [key, value.tag]),
  );
}
