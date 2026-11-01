import { activeSecondsAt, roundMinutes } from "./active-time";
import { formatIstIso, istDateKey } from "./ist-dates";
import {
  eachIstDayKey,
  endOfIstDay,
  istWeekEndKey,
  istWeekStartKey,
  startOfIstDay,
} from "./periods";
import type { GoalRecord } from "./session-store";
import type { SessionRecord } from "./session-types";

export type GoalProgressDay = {
  date: string;
  activeSeconds: number;
  activeMinutes: number;
  targetMinutes: number | null;
  met: boolean | null;
  progressRatio: number | null;
  sessionCount: number;
};

export type GoalProgressWeek = {
  weekStart: string;
  weekEnd: string;
  activeMinutes: number;
  targetMinutes: number | null;
  met: boolean | null;
  progressRatio: number | null;
  partial: boolean;
};

export type GoalProgress = {
  from: string;
  to: string;
  asOf: string;
  goal: {
    dailyMinutes: number;
    weeklyMinutes: number | null;
    updatedAt: string;
  } | null;
  days: GoalProgressDay[];
  daysHit: string[];
  currentStreak: number;
  longestStreak: number;
  todayMet: boolean | null;
  todayPending: boolean;
  weeks: GoalProgressWeek[];
  truncated: boolean;
};

function roundRatio(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function buildGoalProgress(
  sessions: SessionRecord[],
  goal: GoalRecord | null,
  fromKey: string,
  toKey: string,
  now: Date,
  truncated: boolean,
): GoalProgress {
  const todayKey = istDateKey(now);
  const lastKey = toKey < todayKey ? toKey : todayKey;
  const dayKeys = fromKey <= lastKey ? eachIstDayKey(fromKey, lastKey) : [];
  const byDay = new Map<string, SessionRecord[]>();

  for (const key of dayKeys) {
    byDay.set(key, []);
  }

  for (const session of sessions) {
    const key = istDateKey(session.start);
    byDay.get(key)?.push(session);
  }

  const exactByDay = new Map<string, number>();
  const days: GoalProgressDay[] = dayKeys.map((key) => {
    const dayStart = startOfIstDay(key);
    const dayEnd = endOfIstDay(key);
    const at = new Date(Math.min(dayEnd.getTime(), now.getTime()));
    let activeSeconds = 0;
    let sessionCount = 0;

    for (const session of byDay.get(key) ?? []) {
      if (session.start.getTime() > at.getTime()) {
        continue;
      }

      activeSeconds += activeSecondsAt(session, at);
      sessionCount += 1;
    }

    const targetMinutes = goal?.dailyMinutes ?? null;
    const met =
      targetMinutes === null
        ? null
        : activeSeconds >= targetMinutes * 60;

    exactByDay.set(key, activeSeconds);

    return {
      date: key,
      activeSeconds: Math.round(activeSeconds),
      activeMinutes: roundMinutes(activeSeconds),
      targetMinutes,
      met,
      progressRatio:
        targetMinutes === null
          ? null
          : roundRatio(activeSeconds / (targetMinutes * 60)),
      sessionCount,
    };
  });

  let longestStreak = 0;
  let run = 0;
  for (const day of days) {
    if (day.met === true) {
      run += 1;
      longestStreak = Math.max(longestStreak, run);
    } else {
      run = 0;
    }
  }

  const todayIndex = days.findIndex((day) => day.date === todayKey);
  const todayDay = todayIndex >= 0 ? days[todayIndex] : null;
  const todayMet = todayDay?.met ?? null;
  let currentStreak = 0;
  let startIndex = days.length - 1;

  if (
    goal &&
    todayDay &&
    todayMet === false &&
    todayIndex === days.length - 1
  ) {
    startIndex = todayIndex - 1;
  }

  for (let index = startIndex; index >= 0; index -= 1) {
    if (days[index].met === true) {
      currentStreak += 1;
    } else {
      break;
    }
  }

  const weekMap = new Map<
    string,
    {
      weekStart: string;
      activeSeconds: number;
      partial: boolean;
    }
  >();

  for (const day of days) {
    const key = istWeekStartKey(startOfIstDay(day.date));
    const weekEnd = endOfIstDay(istWeekEndKey(key));
    const current = weekMap.get(key) ?? {
      weekStart: key,
      activeSeconds: 0,
      partial: weekEnd.getTime() > now.getTime(),
    };
    current.activeSeconds += exactByDay.get(day.date) ?? 0;
    weekMap.set(key, current);
  }

  const weeks: GoalProgressWeek[] = [...weekMap.values()]
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .map((week) => {
      const targetMinutes = goal?.weeklyMinutes ?? null;
      const activeSeconds = week.activeSeconds;

      return {
        weekStart: week.weekStart,
        weekEnd: istWeekEndKey(week.weekStart),
        activeMinutes: roundMinutes(activeSeconds),
        targetMinutes,
        met:
          targetMinutes === null
            ? null
            : activeSeconds >= targetMinutes * 60,
        progressRatio:
          targetMinutes === null
            ? null
            : roundRatio(activeSeconds / (targetMinutes * 60)),
        partial: week.partial,
      };
    });

  return {
    from: fromKey,
    to: lastKey,
    asOf: formatIstIso(now),
    goal: goal
      ? {
          dailyMinutes: goal.dailyMinutes,
          weeklyMinutes: goal.weeklyMinutes,
          updatedAt: formatIstIso(goal.updatedAt),
        }
      : null,
    days,
    daysHit: days.filter((day) => day.met === true).map((day) => day.date),
    currentStreak: goal ? currentStreak : 0,
    longestStreak: goal ? longestStreak : 0,
    todayMet,
    todayPending:
      Boolean(goal) &&
      todayMet === false &&
      todayIndex === days.length - 1,
    weeks,
    truncated,
  };
}
