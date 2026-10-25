export type SessionRecord = {
  id: string;
  start: Date;
  end: Date | null;
  pausedSeconds: number;
  pausedAt: Date | null;
  label: string;
  tag: string | null;
};

export type StartSessionInput = {
  label?: string | null;
  tag?: string | null;
};
