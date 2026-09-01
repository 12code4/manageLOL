import { describe, it, expect } from 'vitest';
import { CHAMPIONS, CHAMPION_BY_ID, type ChampArchetype, type ChampRole } from './champions.js';

const ARCHETYPES: ChampArchetype[] = [
  'tankEngage', 'skirmisher', 'assassin', 'scalingCarry', 'laneBully',
  'controlMage', 'poke', 'enchanter', 'catcher', 'splitPush', 'earlyJungle',
];

describe('champion pack integrity (spec: draft-and-champions.md §3)', () => {
  it('ships exactly 48 champions with unique ids', () => {
    expect(CHAMPIONS).toHaveLength(48);
    expect(new Set(CHAMPIONS.map((c) => c.id)).size).toBe(48);
  });

  it('meets the launch role distribution (10/9/10/9/10 by primary role)', () => {
    const counts: Record<ChampRole, number> = { top: 0, jungle: 0, mid: 0, bot: 0, support: 0 };
    for (const c of CHAMPIONS) counts[c.roles[0]!]++;
    expect(counts).toEqual({ top: 10, jungle: 9, mid: 10, bot: 9, support: 10 });
  });

  it('has ~8 flex champions spanning two roles', () => {
    const flex = CHAMPIONS.filter((c) => c.roles.length >= 2);
    expect(flex.length).toBeGreaterThanOrEqual(7);
    expect(flex.length).toBeLessThanOrEqual(9);
  });

  it('styleTags and curve each sum to ~1', () => {
    for (const c of CHAMPIONS) {
      const tagSum = Object.values(c.styleTags).reduce((s, w) => s + (w ?? 0), 0);
      expect(tagSum, c.id + ' styleTags').toBeCloseTo(1, 5);
      const curveSum = c.curve.early + c.curve.mid + c.curve.late;
      expect(curveSum, c.id + ' curve').toBeCloseTo(1, 5);
    }
  });

  it('every counter references a real champion, never itself', () => {
    for (const c of CHAMPIONS) {
      for (const id of c.counters) {
        expect(CHAMPION_BY_ID[id], c.id + ' counters ' + id).toBeDefined();
        expect(id).not.toBe(c.id);
      }
    }
  });

  it('every archetype has at least 3 real pilots (styleTag weight ≥ 0.3)', () => {
    for (const a of ARCHETYPES) {
      const pilots = CHAMPIONS.filter((c) => (c.styleTags[a] ?? 0) >= 0.3);
      expect(pilots.length, a).toBeGreaterThanOrEqual(3);
    }
  });

  it('every role has an early bully and a late scaler among its primaries', () => {
    for (const role of ['top', 'jungle', 'mid', 'bot', 'support'] as ChampRole[]) {
      const pool = CHAMPIONS.filter((c) => c.roles[0] === role);
      expect(pool.some((c) => c.curve.early >= 0.4), role + ' early').toBe(true);
      expect(pool.some((c) => c.curve.late >= 0.4), role + ' late').toBe(true);
    }
  });

  it('carries flavor and crowd lines everywhere (the humor payload is content)', () => {
    for (const c of CHAMPIONS) {
      expect(c.flavor.length, c.id).toBeGreaterThan(10);
      expect(c.chatLines.length, c.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('basePower sits in the pre-patch band (46..56)', () => {
    for (const c of CHAMPIONS) {
      expect(c.basePower).toBeGreaterThanOrEqual(46);
      expect(c.basePower).toBeLessThanOrEqual(56);
    }
  });
});
