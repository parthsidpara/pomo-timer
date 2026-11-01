export type PauseInterval = {
  start: Date;
  end: Date;
};

export type SessionRecord = {
  id: string;
  start: Date;
  end: Date | null;
  pausedSeconds: number;
  pausedAt: Date | null;
  label: string;
  tag: string | null;
  /**
   * Completed pause spans. New sessions record these so hourly analysis can
   * attribute active time precisely. Older documents may omit them.
   */
  pauseIntervals?: PauseInterval[];
};

export type StartSessionInput = {
  label?: string | null;
  tag?: string | null;
};
