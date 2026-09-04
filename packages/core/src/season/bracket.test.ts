import { describe, expect, it } from 'vitest';
import { Rng } from '../rng/rng.js';
import { LEAGUE_BY_TIER, PYRAMID } from './calendar.js';
import {
  bracketPlacings,
  bracketSize,
  buildBracket,
  buildGauntlet,
  gauntletPromoted,
  nextMatchFor,
  pendingMatches,
  playBracket,
  recordBracketResult,
  seedOrder,
  type Bracket,
  type BracketMatch,
} from './bracket.js';

const rng = (s: string): Rng => new Rng('bracket-test', s);
const seeds = (n: number): string[] => Array.from({ length: n }, (_, i) => `s${i + 1}`);

/** The higher seed always wins — makes structural assertions exact. */
const chalk = (m: BracketMatch): { winner: string; score: [number, number] } => ({
  winner: m.seedA < m.seedB ? m.a! : m.b!,
  score: [3, 1],
});

/** The lower seed always wins — the maximal upset run. */
const upsets = (m: BracketMatch): { winner: string; score: [number, number] } => ({
  winner: m.seedA < m.seedB ? m.b! : m.a!,
  score: [3, 2],
});

describe('seeding', () => {
  it('pairs every seed with its mirror, which is what makes a bracket balanced', () => {
    expect(seedOrder(2)).toEqual([1, 2]);
    for (const size of [2, 4, 8, 16]) {
      const order = seedOrder(size);
      // Every seed appears exactly once.
      expect([...order].sort((a, b) => a - b)).toEqual(Array.from({ length: size }, (_, i) => i + 1));
      // Every first-round pairing sums to size + 1: 1 plays the worst seed,
      // 2 plays the second worst, and so on.
      for (let i = 0; i < size; i += 2) expect(order[i]! + order[i + 1]!).toBe(size + 1);
    }
  });

  it('keeps the top two seeds apart until the final', () => {
    for (const size of [4, 8, 16]) {
      const order = seedOrder(size);
      expect(order.indexOf(1)).toBeLessThan(size / 2);
      expect(order.indexOf(2)).toBeGreaterThanOrEqual(size / 2);
      // ...and the same holds recursively, so 1 and 3 cannot meet before the
      // semi-final either.
      const topHalf = order.slice(0, size / 2);
      const quarter = topHalf.slice(0, size / 4);
      if (size >= 8) expect(quarter).toContain(1);
      if (size >= 8) expect(topHalf.slice(size / 4)).not.toContain(2);
    }
  });

  it('rounds a field up to the next power of two', () => {
    expect(bracketSize(2)).toBe(2);
    expect(bracketSize(4)).toBe(4);
    expect(bracketSize(6)).toBe(8);
    expect(bracketSize(8)).toBe(8);
  });
});

describe('building a bracket', () => {
  it('creates exactly one series fewer than there are teams', () => {
    for (const n of [2, 3, 4, 5, 6, 7, 8]) {
      const b = buildBracket(seeds(n), 5);
      expect(b.matches).toHaveLength(n - 1);
    }
  });

  it('gives byes to the top seeds and never invents a phantom match', () => {
    const b = buildBracket(seeds(6), 5);
    const r1 = b.matches.filter((m) => m.round === 1);
    expect(r1).toHaveLength(2); // 6 teams in an 8-bracket: two first-round series
    for (const m of b.matches) {
      expect(m.a === null || b.teams.includes(m.a)).toBe(true);
      expect(m.b === null || b.teams.includes(m.b)).toBe(true);
    }
    // The two byes are already seated in round two.
    const seated = b.matches.filter((m) => m.round === 2).flatMap((m) => [m.a, m.b]).filter(Boolean);
    expect(seated).toContain('s1');
    expect(seated).toContain('s2');
    // ...and neither plays in round one.
    expect(r1.flatMap((m) => [m.a, m.b])).not.toContain('s1');
  });

  it('only offers matches whose both sides are known', () => {
    const b = buildBracket(seeds(8), 5);
    expect(pendingMatches(b)).toHaveLength(4); // just the quarter-finals
    expect(b.matches.filter((m) => m.round === 3)).toHaveLength(1);
  });
});

describe('playing a bracket', () => {
  it('the top seed wins when nothing goes wrong, and placings are ordered', () => {
    const b = buildBracket(seeds(6), 5);
    playBracket(b, chalk, rng('chalk'));
    expect(b.champion).toBe('s1');
    const places = bracketPlacings(b);
    expect(places[0]).toBe('s1');
    expect(places[1]).toBe('s2');
    expect(places).toHaveLength(6);
    expect(new Set(places).size).toBe(6);
  });

  it('a bottom seed can win it outright — that is the point of a bracket', () => {
    const b = buildBracket(seeds(8), 5);
    playBracket(b, upsets, rng('upset'));
    expect(b.champion).toBe('s8');
    expect(bracketPlacings(b)[0]).toBe('s8');
  });

  it('leaves your own series unplayed when asked, then resumes', () => {
    const b = buildBracket(seeds(8), 5);
    playBracket(b, chalk, rng('skip'), 's5');
    const mine = nextMatchFor(b, 's5');
    expect(mine).not.toBeNull();
    expect(b.champion).toBeNull();

    // The manager plays it, and the rest of the bracket carries on.
    recordBracketResult(b, mine!.id, 's5', [3, 2]);
    playBracket(b, chalk, rng('skip2'), 's5');
    const next = nextMatchFor(b, 's5');
    expect(next).not.toBeNull();
    expect([next!.a, next!.b]).toContain('s5');
  });

  it('runs to a champion and never double-records a result', () => {
    const b = buildBracket(seeds(4), 3);
    playBracket(b, chalk, rng('done'));
    expect(b.champion).toBe('s1');
    expect(pendingMatches(b)).toHaveLength(0);
    const final = b.matches.find((m) => m.feedsInto === null)!;
    recordBracketResult(b, final.id, 's4', [3, 0]); // ignored: already decided
    expect(b.champion).toBe('s1');
  });

  it('is deterministic and independent of match array order', () => {
    const a = buildBracket(seeds(7), 5);
    const c = buildBracket(seeds(7), 5);
    c.matches.reverse();
    playBracket(a, chalk, rng('d'));
    playBracket(c, chalk, rng('d'));
    expect(a.champion).toBe(c.champion);
    expect(bracketPlacings(a)).toEqual(bracketPlacings(c));
  });

  it('degenerates safely on a field too small to bracket', () => {
    const solo = buildBracket(['only'], 5);
    expect(solo.matches).toEqual([]);
    expect(solo.champion).toBe('only');
    expect(buildBracket([], 5).champion).toBeNull();
  });
});

describe('the pyramid uses formats a manager will actually play', () => {
  it('every tier resolves in a handful of series', () => {
    const expected: Record<number, number> = { 1: 5, 2: 3, 3: 7, 4: 3 };
    for (const cfg of PYRAMID) {
      const b = buildBracket(seeds(cfg.playoffTeams), cfg.playoffBestOf);
      expect(b.matches).toHaveLength(expected[cfg.tier]!);
    }
    expect(LEAGUE_BY_TIER[1].playoffBestOf).toBe(5);
  });
});

describe('the promotion gauntlet', () => {
  it('is one series, and only a challenger win moves a seat', () => {
    const g = buildGauntlet('incumbent', 'challenger');
    expect(g.bestOf).toBe(5);
    expect(gauntletPromoted(g)).toBe(false); // unplayed decides nothing

    const held: typeof g = { ...g, winner: 'incumbent', score: [3, 1] };
    expect(gauntletPromoted(held)).toBe(false);

    const taken: typeof g = { ...g, winner: 'challenger', score: [3, 2] };
    expect(gauntletPromoted(taken)).toBe(true);
  });
});

describe('bracket shape holds under a real resolver', () => {
  it('produces a full ordering for every tier from a seeded run', () => {
    for (const cfg of PYRAMID) {
      const b: Bracket = buildBracket(seeds(cfg.playoffTeams), cfg.playoffBestOf);
      const r = rng(`real${cfg.tier}`);
      playBracket(b, (m) => {
        const aWins = r.chance(0.5 + (m.seedB - m.seedA) * 0.04);
        return { winner: aWins ? m.a! : m.b!, score: aWins ? [3, 1] : [1, 3] };
      }, r);
      expect(b.champion).not.toBeNull();
      expect(bracketPlacings(b)).toHaveLength(cfg.playoffTeams);
      expect(new Set(bracketPlacings(b)).size).toBe(cfg.playoffTeams);
    }
  });
});
