import { describe, expect, it } from 'vitest';
import { Rng } from '../rng/rng.js';
import { REGION_BY_ID } from '@managelol/data';
import {
  FOREIGN_REGIONS,
  HOME_REGION,
  INTL_BY_ID,
  INTL_EVENTS,
  foreignAllocation,
  foreignChampionSide,
  intlReward,
  regionChampionCentre,
  regionChampionStrength,
  regionPower,
  seedInternational,
  type IntlEntrant,
} from './international.js';

describe('region power', () => {
  it('ranks the regions the way their cultures say they should', () => {
    // Kyorin (the proving ground) on top, then Tianxu's superteams, the home
    // tacticians in the middle, Vantia's chokers, the Wilds last.
    const order = [...FOREIGN_REGIONS, HOME_REGION].sort((a, b) => regionPower(b) - regionPower(a));
    expect(order).toEqual(['kyo', 'tia', 'mer', 'van', 'wilds']);
  });

  it('makes Vantia underperform its wealth — the perennial international choke', () => {
    // Vantia is richer than home, yet weaker internationally.
    expect(REGION_BY_ID.van.wealth).toBeGreaterThan(REGION_BY_ID.mer.wealth);
    expect(regionPower('van')).toBeLessThan(regionPower('mer'));
  });

  it('puts every champion centre in the tier-1 band, strong regions near the top', () => {
    for (const r of [...FOREIGN_REGIONS, HOME_REGION]) {
      const c = regionChampionCentre(r);
      expect(c).toBeGreaterThan(72);
      expect(c).toBeLessThan(90);
    }
    expect(regionChampionCentre('kyo')).toBeGreaterThan(regionChampionCentre('wilds'));
  });
});

describe('champion strength', () => {
  it('swings widest in the Wilds — where a prodigy upsets the giants', () => {
    const spread = (region: 'kyo' | 'wilds'): number => {
      const xs = Array.from({ length: 400 }, (_, i) => regionChampionStrength(region, new Rng('intl', region + ':' + i)));
      const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
      return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
    };
    expect(spread('wilds')).toBeGreaterThan(spread('kyo'));
  });

  it('is deterministic for a given region and seed', () => {
    expect(regionChampionStrength('tia', new Rng('s', 'x'))).toBe(regionChampionStrength('tia', new Rng('s', 'x')));
  });
});

describe('a foreign champion as a FastSide', () => {
  it('carries its region in how it wins, not only how much', () => {
    const mer = foreignChampionSide('m', 'mer', 82);
    const wilds = foreignChampionSide('w', 'wilds', 82);
    const kyo = foreignChampionSide('k', 'kyo', 82);
    // Meridian tacticians out-draft everyone.
    expect(mer.drafting).toBeGreaterThan(kyo.drafting);
    expect(mer.drafting).toBeGreaterThan(wilds.drafting);
    // The Wilds are the coin-flip: least consistent, so the widest game variance.
    expect(wilds.consistency).toBeLessThan(kyo.consistency);
    expect(wilds.consistency).toBeLessThan(mer.consistency);
    // Strength is whatever it is told to be.
    expect(mer.strength).toBe(82);
  });
});

describe('the field', () => {
  it('fills every non-home seat, floors each region at one, and favours the strong', () => {
    for (const e of INTL_EVENTS) {
      const alloc = foreignAllocation(e);
      const total = FOREIGN_REGIONS.reduce((n, r) => n + alloc[r], 0);
      expect(total).toBe(e.fieldSize - e.homeSlots);
      for (const r of FOREIGN_REGIONS) expect(alloc[r]).toBeGreaterThanOrEqual(1);
      // A stronger region never gets fewer seats than a weaker one.
      expect(alloc.kyo).toBeGreaterThanOrEqual(alloc.wilds);
    }
  });

  it('seeds strongest-first and is independent of input order', () => {
    const mk = (id: string, s: number): IntlEntrant => ({
      id, region: 'kyo', home: false, seedStrength: s,
      side: { orgId: id, strength: s, drafting: 70, metaFit: 0, consistency: 70 },
    });
    const field = [mk('a', 78), mk('b', 88), mk('c', 72)];
    expect(seedInternational(field).map((e) => e.id)).toEqual(['b', 'a', 'c']);
    expect(seedInternational(field.slice().reverse()).map((e) => e.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('the stakes', () => {
  it('pays more the further you go, and Worlds dwarfs the Crucible', () => {
    const worlds = INTL_BY_ID.worlds;
    const crucible = INTL_BY_ID.crucible;
    const ladder = ['entered', 'quarter', 'semi', 'finalist', 'winner'] as const;
    for (let i = 1; i < ladder.length; i++) {
      expect(intlReward(worlds, ladder[i]!).legacy).toBeGreaterThan(intlReward(worlds, ladder[i - 1]!).legacy);
    }
    // Winning Worlds is the biggest legacy event in the game.
    expect(intlReward(worlds, 'winner').legacy).toBeGreaterThan(intlReward(crucible, 'winner').legacy);
    expect(intlReward(worlds, 'winner').cash).toBeGreaterThan(intlReward(crucible, 'winner').cash);
  });

  it('runs on the exact weeks the calendar reserves for it', () => {
    expect(INTL_BY_ID.crucible.fixedWeeks).toEqual([16, 17, 18]);
    expect(INTL_BY_ID.worlds.fixedWeeks).toEqual([36, 37, 38, 39, 40]);
  });
});
