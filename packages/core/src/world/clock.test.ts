import { describe, it, expect } from 'vitest';
import { GameClock, decompose, dayOf, DAYS_PER_YEAR } from './clock.js';

describe('calendar', () => {
  it('epoch is season 1, week 1, weekday 0', () => {
    const d = decompose(0);
    expect(d).toMatchObject({ year: 1, weekOfYear: 1, weekday: 0, absWeek: 0 });
  });

  it('rolls into year 2 after exactly one year of days', () => {
    expect(decompose(DAYS_PER_YEAR).year).toBe(2);
    expect(decompose(DAYS_PER_YEAR - 1).year).toBe(1);
    expect(decompose(DAYS_PER_YEAR).weekOfYear).toBe(1);
  });

  it('dayOf and decompose are inverses', () => {
    for (const [y, w, wd] of [
      [1, 1, 0],
      [2, 26, 3],
      [5, 52, 6],
    ] as const) {
      const day = dayOf(y, w, wd);
      const back = decompose(day);
      expect([back.year, back.weekOfYear, back.weekday]).toEqual([y, w, wd]);
    }
  });

  it('week starts land on weekday 0', () => {
    const c = new GameClock(0);
    expect(c.isWeekStart).toBe(true);
    c.advanceDays(1);
    expect(c.isWeekStart).toBe(false);
    c.advanceDays(6);
    expect(c.isWeekStart).toBe(true);
    expect(c.date.weekOfYear).toBe(2);
  });

  it('serializes to a bare day index', () => {
    const c = new GameClock(123);
    expect(c.toJSON()).toBe(123);
    expect(GameClock.fromJSON(123).day).toBe(123);
  });
});
