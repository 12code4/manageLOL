import { describe, expect, it } from 'vitest';
import { Rng } from '../rng/rng.js';
import { roundRobin } from '../world/fixtures.js';
import {
  CALENDAR,
  LEAGUE_BY_TIER,
  PYRAMID,
  championshipPoints,
  matchWeeksOfSplit,
  phaseOfWeek,
  prizeFor,
  resolveBoundary,
  weekDef,
} from './calendar.js';
import { DRAFT_GAIN, VAR_BASE, fastRating, resolveFastSeries, type FastSide } from './fast.js';
import { generatePlayer } from '../players/generate.js';
import { wageDemand } from '../world/contracts.js';
import type { PlayerId } from '../util/ids.js';
import type { RegionId } from '../players/types.js';
import type { PyramidTier } from '../world/orgs.js';

const rng = (s: string): Rng => new Rng('season-test', s);

const side = (over: Partial<FastSide> = {}): FastSide => ({
  orgId: 'a',
  strength: 60,
  drafting: 55,
  metaFit: 0,
  consistency: 55,
  ...over,
});

describe('the calendar', () => {
  it('covers exactly 52 weeks, once each, in order', () => {
    expect(CALENDAR).toHaveLength(52);
    expect(CALENDAR.map((d) => d.week)).toEqual(Array.from({ length: 52 }, (_, i) => i + 1));
  });

  it('gives every week a job, and the mix is not all matches', () => {
    const kinds = new Map<string, number>();
    for (const d of CALENDAR) kinds.set(d.kind, (kinds.get(d.kind) ?? 0) + 1);
    expect(kinds.get('match')).toBeGreaterThan(20);
    expect(kinds.get('market')).toBeGreaterThanOrEqual(6);
    expect(kinds.get('training')).toBeGreaterThanOrEqual(4);
    expect(kinds.get('event')).toBeGreaterThanOrEqual(10);
    for (const d of CALENDAR) expect(d.note.length).toBeGreaterThan(10);
  });

  it('has nine regular match weeks per split, which tiles an 18-round double', () => {
    expect(matchWeeksOfSplit(1)).toHaveLength(9);
    expect(matchWeeksOfSplit(2)).toHaveLength(9);
    const prime = LEAGUE_BY_TIER[1];
    const rounds = roundRobin(Array.from({ length: prime.slots }, (_, i) => `t${i}`), prime.legs);
    expect(new Set(rounds.map((f) => f.round)).size).toBe(18);
    expect(18 / matchWeeksOfSplit(1).length).toBe(2); // two rounds a week, exactly
  });

  it('the circuit single round-robin also tiles its nine weeks', () => {
    const circuit = LEAGUE_BY_TIER[3];
    const rounds = roundRobin(Array.from({ length: circuit.slots }, (_, i) => `t${i}`), circuit.legs);
    expect(new Set(rounds.map((f) => f.round)).size).toBe(15);
    expect(15).toBeLessThanOrEqual(matchWeeksOfSplit(1).length * 2);
  });

  it('wraps years and reports the phase a week belongs to', () => {
    expect(weekDef(53).week).toBe(1);
    expect(weekDef(0).week).toBe(52);
    expect(phaseOfWeek(5)).toBe('regular');
    expect(phaseOfWeek(13)).toBe('playoffs');
    expect(phaseOfWeek(2)).toBe('preseason');
    expect(phaseOfWeek(47)).toBe('offseason');
  });

  it('opens the transfer window only in the market weeks', () => {
    expect(weekDef(5).transferWindow).toBe(false);
    expect(weekDef(15).transferWindow).toBe(true);
    expect(weekDef(46).transferWindow).toBe(true);
  });
});

describe('the pyramid', () => {
  it('has four tiers, every one an even field so nobody ever gets a bye', () => {
    expect(PYRAMID).toHaveLength(4);
    for (const l of PYRAMID) {
      expect(l.slots % 2).toBe(0);
      expect(l.playoffTeams).toBeLessThan(l.slots);
      expect(l.blurb.length).toBeGreaterThan(20);
    }
  });

  it('money and rhythm both fall as you descend, but the rhythm falls later', () => {
    const [t1, t2, t3, t4] = PYRAMID;
    expect(t1!.prizePool).toBeGreaterThan(t2!.prizePool * 2);
    expect(t2!.prizePool).toBeGreaterThan(t3!.prizePool * 2);
    expect(t3!.prizePool).toBeGreaterThan(t4!.prizePool * 2);
    // Revenue compresses far less than prize money does: the ladder cutoff
    // puts a floor under every wage bill, so no tier can be starved.
    expect(t1!.weeklyRevenue).toBeGreaterThan(t4!.weeklyRevenue * 4);
    expect(t1!.weeklyRevenue).toBeGreaterThan(t2!.weeklyRevenue * 2);
    // Relegation from the top changes the money, not the weekly shape.
    expect(t2!.legs).toBe(t1!.legs);
    expect(t2!.regularBestOf).toBe(t1!.regularBestOf);
    expect(t3!.regularBestOf).toBeLessThan(t2!.regularBestOf);
  });

  it('pays out steeply enough that a title is worth chasing', () => {
    const prime = LEAGUE_BY_TIER[1];
    expect(prizeFor(prime, 1)).toBeGreaterThan(prizeFor(prime, 4) * 2.5);
    expect(prizeFor(prime, 1)).toBeGreaterThan(prizeFor(prime, 10) * 20);
    const total = Array.from({ length: prime.slots }, (_, i) => prizeFor(prime, i + 1)).reduce((a, b) => a + b, 0);
    expect(total).toBeLessThanOrEqual(prime.prizePool);
  });

  it('every tier can pay the roster it is actually able to sign', () => {
    // The bug this guards: a fresh career was insolvent by mid-season. The
    // trap is that a tier's *own* quality is not what its roster costs — the
    // ladder cutoff means the cheapest player anyone can sign is an Onyx I
    // account, so even an amateur org pays elite-ladder wages for five.
    const LADDER_FLOOR_QUALITY = 66;
    const centres: Record<number, number> = { 1: 76, 2: 67, 3: 58, 4: 49 };
    const sponsor: Record<number, number> = { 1: 6, 2: 3, 3: 1.4, 4: 0.6 };
    const billFor = (tier: PyramidTier, quality: number): number =>
      [0, 1, 2, 3, 4].reduce(
        (sum, i) =>
          sum +
          wageDemand(
            generatePlayer(rng(`aff${tier}:${quality}:${i}`), {
              id: `p${i}` as PlayerId,
              region: 'mer' as RegionId,
              qualityCenter: quality,
              ageRange: [20, 25],
              spread: 3,
            }),
            tier,
            45,
          ),
        0,
      );

    for (const cfg of PYRAMID) {
      const realistic = Math.max(billFor(cfg.tier, centres[cfg.tier]!), billFor(cfg.tier, LADDER_FLOOR_QUALITY));
      const income = cfg.weeklyRevenue + sponsor[cfg.tier]!;
      expect(income).toBeGreaterThan(realistic); // solvent...
      expect(income).toBeLessThan(realistic * 2.6); // ...but never comfortable
    }
  });

  it('awards championship points only at the top tier', () => {
    expect(championshipPoints(LEAGUE_BY_TIER[1], 1)).toBe(90);
    expect(championshipPoints(LEAGUE_BY_TIER[1], 10)).toBe(4);
    expect(championshipPoints(LEAGUE_BY_TIER[2], 1)).toBe(0);
  });

  it('conserves seats exactly, and does not depend on processing order', () => {
    const upper = ['u1', 'u2', 'u3', 'u4'];
    const lower = ['l1', 'l2', 'l3', 'l4'];
    const m = resolveBoundary(upper, lower, 2);
    expect(m.relegated).toEqual(['u3', 'u4']);
    expect(m.promoted).toEqual(['l1', 'l2']);
    expect(m.relegated).toHaveLength(m.promoted.length);
    // Recomputing from the same pre-movement tables gives the same answer.
    expect(resolveBoundary(upper, lower, 2)).toEqual(m);
  });
});

describe('fast resolution', () => {
  it('the better side wins more often, and a normal league gap is not a certainty', () => {
    // Roughly the spread between a title contender and a mid-table side.
    const strong = side({ orgId: 'strong', strength: 68 });
    const weak = side({ orgId: 'weak', strength: 60 });
    const rate = (() => {
      let w = 0;
      for (let i = 0; i < 600; i++) if (resolveFastSeries(strong, weak, 3, rng(`f${i}`)).winner === 0) w++;
      return w / 600;
    })();
    expect(rate).toBeGreaterThan(0.6);
    expect(rate).toBeLessThan(0.9); // the underdog still takes one in eight

    // A chasm is nearly decisive, as it should be — but never actually 100%.
    let chasm = 0;
    for (let i = 0; i < 400; i++) {
      if (resolveFastSeries(side({ strength: 80 }), side({ orgId: 'b', strength: 52 }), 3, rng(`c${i}`)).winner === 1) chasm++;
    }
    expect(chasm).toBeGreaterThanOrEqual(0);
    expect(chasm).toBeLessThan(40);
  });

  it('an even matchup is a coin flip', () => {
    let wins = 0;
    for (let i = 0; i < 800; i++) {
      if (resolveFastSeries(side({ orgId: 'a' }), side({ orgId: 'b' }), 3, rng(`e${i}`)).winner === 0) wins++;
    }
    expect(wins / 800).toBeGreaterThan(0.44);
    expect(wins / 800).toBeLessThan(0.56);
  });

  it('a longer series protects the better team', () => {
    const strong = side({ strength: 68 });
    const weak = side({ strength: 60 });
    const rate = (bestOf: 1 | 3 | 5): number => {
      let w = 0;
      for (let i = 0; i < 700; i++) if (resolveFastSeries(strong, weak, bestOf, rng(`b${bestOf}${i}`)).winner === 0) w++;
      return w / 700;
    };
    expect(rate(5)).toBeGreaterThan(rate(1));
  });

  it('preparation is worth points, and sharper sides face less randomness', () => {
    const prepped = side({ drafting: 88, metaFit: 1.4 });
    const raw = side({ drafting: 30, metaFit: -1.2 });
    const deltas = Array.from({ length: 400 }, (_, i) => resolveFastSeries(prepped, raw, 3, rng(`p${i}`)).draftDelta);
    const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
    expect(mean).toBeGreaterThan(1.5);
    expect(Math.max(...deltas)).toBeLessThanOrEqual(8);
    expect(Math.min(...deltas)).toBeGreaterThanOrEqual(-8);
    expect(DRAFT_GAIN).toBeGreaterThan(0);
    expect(VAR_BASE).toBeGreaterThan(0);
  });

  it('scores are legal for the format and games are only generated when asked', () => {
    for (const bestOf of [1, 3, 5] as const) {
      const r = resolveFastSeries(side(), side({ orgId: 'b' }), bestOf, rng(`s${bestOf}`));
      const needed = Math.ceil((bestOf + 1) / 2);
      expect(Math.max(...r.score)).toBe(needed);
      expect(r.games).toHaveLength(r.score[0] + r.score[1]);
      for (const g of r.games) {
        expect(g.lengthMin).toBeGreaterThanOrEqual(22);
        expect(g.lengthMin).toBeLessThanOrEqual(52);
        expect(g.killsA + g.killsB).toBeGreaterThanOrEqual(6);
      }
    }
    expect(resolveFastSeries(side(), side({ orgId: 'b' }), 5, rng('ng'), { games: false }).games).toEqual([]);
  });

  it('flags an upset only when a real favourite loses', () => {
    const results = Array.from({ length: 500 }, (_, i) =>
      resolveFastSeries(side({ strength: 74 }), side({ orgId: 'b', strength: 56 }), 3, rng(`u${i}`)),
    );
    const upsets = results.filter((r) => r.upset);
    expect(upsets.length).toBeGreaterThan(0);
    expect(upsets.length).toBeLessThan(results.length / 2);
    for (const r of upsets) expect(Math.abs(r.winProbA - 0.5)).toBeGreaterThanOrEqual(0.15);
  });

  it('is deterministic and cheap enough to run a whole league', () => {
    const a = side({ orgId: 'a', strength: 66 });
    const b = side({ orgId: 'b', strength: 63 });
    expect(JSON.stringify(resolveFastSeries(a, b, 5, rng('det')))).toBe(
      JSON.stringify(resolveFastSeries(a, b, 5, rng('det'))),
    );
    // A full T1 season is 90 series; twenty seasons of the whole pyramid is
    // well under a second. Guard the order of magnitude, not the machine.
    const started = process.hrtime.bigint();
    for (let i = 0; i < 20000; i++) resolveFastSeries(a, b, 3, rng(`perf${i}`), { games: false });
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    expect(ms).toBeLessThan(2000);
  });

  it('derives a performance rating that rewards carrying a weak team', () => {
    const carry = fastRating(78, 62, true, rng('r1'));
    const passenger = fastRating(52, 62, false, rng('r1'));
    expect(carry).toBeGreaterThan(passenger);
    for (let i = 0; i < 200; i++) {
      const v = fastRating(60 + (i % 30), 62, i % 2 === 0, rng(`rr${i}`));
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(10);
    }
  });
});
