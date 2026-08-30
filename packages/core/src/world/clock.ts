/**
 * The game calendar.
 *
 * Esports runs on a weekly rhythm (match weeks, scrim blocks, transfer windows),
 * so manageLOL uses a clean idealized calendar rather than the Gregorian one:
 * 52 weeks == 364 days per year, weeks that never straddle a year boundary, and
 * a deterministic weekday from the day index. This keeps scheduling exact and
 * reproducible; "months" are a 13-per-year display convenience (4 weeks each).
 *
 * The clock stores a single integer `day` counted from the world epoch (day 0 =
 * the first day of season 1). Everything else is derived.
 */

export const DAYS_PER_WEEK = 7;
export const WEEKS_PER_YEAR = 52;
export const DAYS_PER_YEAR = DAYS_PER_WEEK * WEEKS_PER_YEAR; // 364

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface CalendarDate {
  /** Absolute day index from the world epoch. */
  day: number;
  /** 1-based season/year number (season 1 is the first). */
  year: number;
  /** 1-based week within the year (1..52). */
  weekOfYear: number;
  /** Absolute week index from epoch (0-based) — handy for scheduling. */
  absWeek: number;
  /** 0 = first weekday of the week .. 6. */
  weekday: Weekday;
}

/** Decompose an absolute day index into calendar fields. */
export function decompose(day: number): CalendarDate {
  const year = Math.floor(day / DAYS_PER_YEAR) + 1;
  const dayOfYear = day % DAYS_PER_YEAR;
  const weekOfYear = Math.floor(dayOfYear / DAYS_PER_WEEK) + 1;
  return {
    day,
    year,
    weekOfYear,
    absWeek: Math.floor(day / DAYS_PER_WEEK),
    weekday: (day % DAYS_PER_WEEK) as Weekday,
  };
}

/** The absolute day index for the start of a given (year, week). */
export function dayOf(year: number, weekOfYear: number, weekday: Weekday = 0): number {
  return (year - 1) * DAYS_PER_YEAR + (weekOfYear - 1) * DAYS_PER_WEEK + weekday;
}

/** A mutable clock wrapper; the canonical `day` is what gets serialized. */
export class GameClock {
  constructor(public day = 0) {}

  get date(): CalendarDate {
    return decompose(this.day);
  }

  advanceDays(n = 1): void {
    this.day += n;
  }

  /** True on the first day of a new week — the weekly aggregation tick. */
  get isWeekStart(): boolean {
    return this.day % DAYS_PER_WEEK === 0;
  }

  toJSON(): number {
    return this.day;
  }

  static fromJSON(day: number): GameClock {
    return new GameClock(day);
  }
}
