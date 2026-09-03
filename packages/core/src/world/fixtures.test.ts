import { describe, expect, it } from 'vitest';
import { emptyRow, recordResult, roundRobin, standings, winRate, type TableRow } from './fixtures.js';

const teams = (n: number): string[] => Array.from({ length: n }, (_, i) => `t${String(i).padStart(2, '0')}`);

describe('roundRobin', () => {
  it('pairs every team with every other exactly once (even field)', () => {
    const f = roundRobin(teams(10));
    expect(f).toHaveLength(45);
    expect(new Set(f.map((m) => [m.a, m.b].sort().join('|'))).size).toBe(45);
    expect(new Set(f.map((m) => m.round)).size).toBe(9);
  });

  it('gives each team exactly one match per round', () => {
    const f = roundRobin(teams(8));
    for (let r = 1; r <= 7; r++) {
      const inRound = f.filter((m) => m.round === r);
      expect(inRound).toHaveLength(4);
      expect(new Set(inRound.flatMap((m) => [m.a, m.b])).size).toBe(8);
    }
  });

  it('handles an odd field with a bye and never emits the bye', () => {
    const t = teams(7);
    const f = roundRobin(t);
    expect(f).toHaveLength(21);
    expect(f.every((m) => t.includes(m.a) && t.includes(m.b))).toBe(true);
    for (let r = 1; r <= 7; r++) expect(f.filter((m) => m.round === r)).toHaveLength(3);
  });

  it('a double round-robin plays each pair twice, once on each side', () => {
    const f = roundRobin(teams(6), 2);
    expect(f).toHaveLength(30);
    const pairs = new Map<string, string[]>();
    for (const m of f) {
      const k = [m.a, m.b].sort().join('|');
      pairs.set(k, [...(pairs.get(k) ?? []), m.a]);
    }
    expect(pairs.size).toBe(15);
    for (const blueSides of pairs.values()) {
      expect(blueSides).toHaveLength(2);
      expect(new Set(blueSides).size).toBe(2);
    }
  });

  it('spreads the blue side roughly evenly within a leg', () => {
    const f = roundRobin(teams(10));
    for (const t of teams(10)) {
      const blue = f.filter((m) => m.a === t).length;
      expect(blue).toBeGreaterThanOrEqual(4);
      expect(blue).toBeLessThanOrEqual(5);
    }
  });

  it('is deterministic and degenerate-safe', () => {
    expect(JSON.stringify(roundRobin(teams(12)))).toBe(JSON.stringify(roundRobin(teams(12))));
    expect(roundRobin([])).toEqual([]);
    expect(roundRobin(['solo'])).toEqual([]);
  });
});

describe('standings', () => {
  const table = (ids: string[]): Record<string, TableRow> =>
    Object.fromEntries(ids.map((i) => [i, emptyRow(i)]));

  it('orders by series wins first', () => {
    const t = table(['a', 'b', 'c']);
    recordResult(t, 'b', 'a', 2, 0);
    recordResult(t, 'b', 'c', 2, 1);
    recordResult(t, 'c', 'a', 2, 0);
    expect(standings(Object.values(t)).map((r) => r.orgId)).toEqual(['b', 'c', 'a']);
  });

  it('breaks a two-way tie on head-to-head before game differential', () => {
    const t = table(['a', 'b', 'c', 'd']);
    recordResult(t, 'a', 'b', 2, 1); // a beat b...
    recordResult(t, 'c', 'a', 2, 0); // ...but a lost badly elsewhere
    recordResult(t, 'b', 'd', 2, 0); // ...and b won convincingly
    expect(t['a']!.gameWins - t['a']!.gameLosses).toBeLessThan(t['b']!.gameWins - t['b']!.gameLosses);
    expect(standings([t['a']!, t['b']!]).map((r) => r.orgId)).toEqual(['a', 'b']);
  });

  it('falls back to differential, then games won, then id — never insertion order', () => {
    const zeta = emptyRow('zeta');
    const alpha = emptyRow('alpha');
    for (const r of [zeta, alpha]) {
      r.wins = 3;
      r.losses = 1;
      r.gameWins = 7;
      r.gameLosses = 4;
    }
    expect(standings([zeta, alpha]).map((r) => r.orgId)).toEqual(['alpha', 'zeta']);
    expect(standings([alpha, zeta]).map((r) => r.orgId)).toEqual(['alpha', 'zeta']);

    alpha.gameLosses = 6; // worse differential now loses despite the id order
    expect(standings([alpha, zeta]).map((r) => r.orgId)).toEqual(['zeta', 'alpha']);
  });

  it('tracks form newest-first inside a bounded window', () => {
    const t = table(['a', 'b']);
    for (let i = 0; i < 8; i++) {
      const aWins = i % 3 === 0;
      recordResult(t, aWins ? 'a' : 'b', aWins ? 'b' : 'a', 2, 1);
    }
    expect(t['a']!.form).toHaveLength(5);
    expect(t['a']!.form[0]).toBe(false); // the 8th match (i=7) was a loss for a
    expect(t['a']!.wins + t['a']!.losses).toBe(8);
    expect(winRate(t['a']!) + winRate(t['b']!)).toBeCloseTo(1, 6);
    expect(winRate(emptyRow('x'))).toBe(0);
  });
});
