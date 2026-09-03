import { describe, expect, it } from 'vitest';
import { ORGS } from '@managelol/data';
import { Rng } from '../rng/rng.js';
import { winProbFromDiff } from '../util/math.js';
import { MATCH_SCALE } from '../match/resolve.js';
import {
  MAX_ORG_EDGE_POINTS,
  accrueLegacy,
  advanceOrgSeason,
  generateOrg,
  investmentBudget,
  orgEdgePoints,
  orgEffects,
  packNames,
  prestige,
  seedOrg,
  shouldFold,
  statureLabel,
  type Org,
  type PyramidTier,
  type SeasonOutcome,
} from './orgs.js';

const rng = (s: string): Rng => new Rng('orgs-test', s);
const identity = ORGS[0]!;

const seed = (tier: PyramidTier, history: number, s = 'a'): Org =>
  seedOrg(rng(s), { identity, tier, seasonsOfHistory: history });

const season = (o: Partial<SeasonOutcome> & { season: number }): SeasonOutcome => ({
  tier: 1,
  place: 5,
  of: 10,
  wonTitle: false,
  netCash: 0,
  investment: 0,
  ...o,
});

describe('org seeding', () => {
  it('gives pack orgs a past: history, legacy and a founding date before season 0', () => {
    const o = seed(1, 18);
    expect(o.seasons).toBe(18);
    expect(o.founded).toBe(-18);
    expect(o.legacy).toBeGreaterThan(30);
    expect(Object.values(o.history.seasonsAtTier).reduce((a, b) => a + b, 0)).toBe(18);
  });

  it('a brand-new org has no legacy and reads as a newcomer', () => {
    const o = seed(3, 0);
    expect(o.legacy).toBe(0);
    expect(o.history.finishes).toEqual([]);
    expect(statureLabel(o)).toBe('Newcomer');
  });

  it('is deterministic on the seed', () => {
    expect(JSON.stringify(seed(2, 9, 'x'))).toBe(JSON.stringify(seed(2, 9, 'x')));
    expect(JSON.stringify(seed(2, 9, 'x'))).not.toBe(JSON.stringify(seed(2, 9, 'y')));
  });

  it('higher tiers seed richer and better equipped', () => {
    const top = seed(1, 10, 'q');
    const bottom = seed(4, 10, 'q');
    expect(top.cash).toBeGreaterThan(bottom.cash * 4);
    expect(top.facilities).toBeGreaterThan(bottom.facilities);
  });
});

describe('longevity', () => {
  it('legacy accrues at the top and barely moves at the bottom', () => {
    let top = 0;
    let bottom = 0;
    for (let s = 0; s < 10; s++) {
      top = accrueLegacy(top, 1);
      bottom = accrueLegacy(bottom, 4);
    }
    expect(top).toBeGreaterThan(25);
    expect(bottom).toBeLessThan(2);
  });

  it('twenty seasons of top-league contention builds a dynasty, and it is bounded', () => {
    let o = seed(1, 0, 'dyn');
    o = { ...o, standing: 60, legacy: 0 };
    for (let s = 0; s < 20; s++) {
      o = advanceOrgSeason(o, season({ season: s, tier: 1, place: 2, of: 10, wonTitle: s % 3 === 0, netCash: 120, investment: 45 }));
    }
    expect(prestige(o)).toBeGreaterThan(74);
    expect(o.legacy).toBeLessThan(95);
    // Nothing may run away to a perfect score, even after two decades.
    for (const v of [o.facilities, o.coaching, o.analytics, o.scouting, o.fanbase]) {
      expect(v).toBeLessThanOrEqual(100);
      expect(v).toBeLessThan(97);
    }
    expect(statureLabel(o)).toBe('Dynasty');
  });

  it('a dormant giant fades but does not vanish', () => {
    let o = seed(1, 20, 'fade');
    const before = o.legacy;
    for (let s = 0; s < 12; s++) {
      o = advanceOrgSeason(o, season({ season: s, tier: 4, place: 9, of: 10, netCash: 0, investment: 0 }));
    }
    expect(o.legacy).toBeLessThan(before);
    expect(o.legacy).toBeGreaterThan(15);
    expect(o.standing).toBeLessThan(30);
  });

  it('infrastructure decays without reinvestment', () => {
    let o = seed(2, 5, 'dec');
    const before = o.facilities;
    for (let s = 0; s < 5; s++) o = advanceOrgSeason(o, season({ season: s, tier: 2, investment: 0 }));
    expect(o.facilities).toBeLessThan(before);
  });

  it('the same credits lift a weak academy more than a strong one', () => {
    const weak = { ...seed(3, 2, 'w'), facilities: 30 };
    const strong = { ...seed(3, 2, 'w'), facilities: 85 };
    const s = season({ season: 1, tier: 3, investment: 60 });
    const dWeak = advanceOrgSeason(weak, s).facilities - weak.facilities;
    const dStrong = advanceOrgSeason(strong, s).facilities - strong.facilities;
    expect(dWeak).toBeGreaterThan(dStrong);
  });
});

describe('upsets survive', () => {
  it('org stats never confer more than a small direct edge', () => {
    const max: Org = { ...seed(1, 20, 'max'), coaching: 100, analytics: 100, facilities: 100 };
    const min: Org = { ...seed(4, 0, 'min'), coaching: 0, analytics: 0, facilities: 0 };
    const edge = orgEdgePoints(max, min);
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThanOrEqual(MAX_ORG_EDGE_POINTS);
    // Holding the five players equal, the dynasty is a coin flip plus a nudge.
    const p = winProbFromDiff(edge, MATCH_SCALE);
    expect(p).toBeLessThan(0.6);
    expect(orgEdgePoints(min, max)).toBeCloseTo(-edge, 6);
    expect(orgEdgePoints(max, max)).toBe(0);
  });

  it('org effects stay inside their documented bands', () => {
    const max = { ...seed(1, 20, 'e'), facilities: 100, coaching: 100, analytics: 100 };
    const min = { ...seed(4, 0, 'e'), facilities: 0, coaching: 0, analytics: 0 };
    expect(orgEffects(max).chemRampMult).toBeCloseTo(1.25, 3);
    expect(orgEffects(min).chemRampMult).toBeCloseTo(0.85, 3);
    expect(orgEffects(max).developmentMult).toBeCloseTo(1.45, 3);
    expect(orgEffects(min).developmentMult).toBeCloseTo(0.55, 3);
  });
});

describe('population', () => {
  it('generated orgs never collide with the handcrafted pack', () => {
    const taken = packNames();
    for (let i = 0; i < 200; i++) {
      const o = generateOrg(rng(`gen${i}`), { id: `gen-${i}`, region: 'mer', tier: 3, season: 4, taken });
      expect(taken.has(o.name)).toBe(false);
      expect(o.tag).toMatch(/^[A-Z]{2,4}$/);
      expect(o.legacy).toBe(0);
      taken.add(o.name);
    }
  });

  it('only broke lower-tier orgs can fold, and history protects them', () => {
    const folds = (o: Org): number =>
      Array.from({ length: 400 }, (_, i) => shouldFold(o, new Rng('fold', `t${i}`))).filter(Boolean).length;

    // A top-league org is never allowed to evaporate mid-pyramid, broke or not.
    expect(folds({ ...seed(1, 12, 'f'), cash: -50 })).toBe(0);
    expect(folds({ ...seed(2, 4, 'f'), cash: -50 })).toBe(0);
    // Neither is a solvent one at the bottom.
    expect(folds({ ...seed(4, 0, 'f'), cash: 12 })).toBe(0);

    const rookie = { ...seed(4, 0, 'f'), cash: -10, legacy: 0 };
    const veteran = { ...seed(4, 0, 'f'), cash: -10, legacy: 90 };
    expect(folds(rookie)).toBeGreaterThan(0);
    expect(folds(rookie)).toBeGreaterThan(folds(veteran) * 2);
  });

  it('investment budgets respect a reserve and reflect personality', () => {
    const academy = { ...seed(2, 5, 'i'), cash: 200, personality: 'academy' as const };
    const chaotic = { ...seed(2, 5, 'i'), cash: 200, personality: 'chaotic' as const };
    const broke = { ...seed(2, 5, 'i'), cash: 5 };
    expect(investmentBudget(academy)).toBeGreaterThan(investmentBudget(chaotic));
    expect(investmentBudget(broke)).toBe(0);
  });
});
