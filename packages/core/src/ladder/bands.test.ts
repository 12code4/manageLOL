import { describe, expect, it } from 'vitest';
import { Rng } from '../rng/rng.js';
import type { LadderEntryId, PlayerId } from '../util/ids.js';
import type { RegionId } from '../players/types.js';
import { generateLadderEntity, tierFromMmr } from './ladder.js';
import {
  BANDS,
  BAND_BY_KEY,
  DEEP_FLOOR,
  DEEP_SCOUT_COST,
  POOL_BASE,
  SHOW_CUTOFF,
  SOLO_BASE,
  accountsAboveCutoff,
  bandAllocation,
  bandFromMmr,
  deepScoutGemChance,
  deepScoutTargetMmr,
  onBoard,
  poolSlots,
  reentryMmr,
  soloGamesPerWeek,
  tierOfBand,
  visible,
} from './bands.js';

const rng = (s: string): Rng => new Rng('bands-test', s);

describe('the cutoff', () => {
  it('is Onyx I — Diamond 1 — and falls out of the existing tier bands', () => {
    expect(SHOW_CUTOFF).toBe(2525);
    expect(tierFromMmr(SHOW_CUTOFF).key).toBe('onyx');
    expect(tierFromMmr(SHOW_CUTOFF).analogue).toBe('Diamond');
    expect(visible(SHOW_CUTOFF)).toBe(true);
    expect(visible(SHOW_CUTOFF - 1)).toBe(false);
    expect(bandFromMmr(SHOW_CUTOFF - 1)).toBeNull();
  });

  it('maps every visible MMR to exactly one band, in order', () => {
    expect(bandFromMmr(2525)).toBe('onyxI');
    expect(bandFromMmr(2599)).toBe('onyxI');
    expect(bandFromMmr(2600)).toBe('ascendant');
    expect(bandFromMmr(2849)).toBe('ascendant');
    expect(bandFromMmr(2850)).toBe('paragon');
    expect(bandFromMmr(3049)).toBe('paragon');
    expect(bandFromMmr(3400)).toBe('apex');
    let last = 0;
    for (const b of BANDS) {
      expect(BAND_BY_KEY[b].floor).toBeGreaterThan(last);
      last = BAND_BY_KEY[b].floor;
    }
  });

  it('only the top two bands make the public leaderboard', () => {
    expect(onBoard(3100)).toBe(true);
    expect(onBoard(2900)).toBe(true);
    expect(onBoard(2700)).toBe(false);
    expect(onBoard(2530)).toBe(false);
  });

  it('band quality and headroom rise toward the top', () => {
    const qcs = BANDS.map((b) => BAND_BY_KEY[b].qualityCenter);
    const pots = BANDS.map((b) => BAND_BY_KEY[b].potentialBonus);
    for (let i = 1; i < qcs.length; i++) {
      expect(qcs[i]!).toBeGreaterThan(qcs[i - 1]!);
      expect(pots[i]!).toBeGreaterThanOrEqual(pots[i - 1]!);
    }
    expect(tierOfBand('apex')).toBe('apex');
    expect(tierOfBand('onyxI')).toBe('onyx');
  });
});

describe('band generation', () => {
  const gen = (band: 'onyxI' | 'apex', i: number, forceMmr?: number) =>
    generateLadderEntity(rng(`g${band}${i}`), {
      id: `l${i}` as LadderEntryId,
      playerId: `p${i}` as PlayerId,
      region: 'mer' as RegionId,
      band,
      ...(forceMmr === undefined ? {} : { forceMmr }),
    });

  it('generates stronger players to the top band', () => {
    const onyx = Array.from({ length: 40 }, (_, i) => gen('onyxI', i).hidden.soloAbility);
    const apex = Array.from({ length: 40 }, (_, i) => gen('apex', i).hidden.soloAbility);
    const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(apex)).toBeGreaterThan(mean(onyx) + 6);
  });

  it('a forced MMR moves only the display, so a real prospect reads as a smurf', () => {
    // Generate an apex-quality player but pin them at the bottom of the ladder.
    const forced = gen('apex', 1, SHOW_CUTOFF + 10);
    expect(forced.mmr).toBe(SHOW_CUTOFF + 10);
    expect(forced.hidden.steadyMmr).toBeGreaterThan(forced.mmr);
    expect(forced.tier).toBe('onyx');
  });

  it('the Diamond-1 kid who becomes the best is a countable draw, not a scripted one', () => {
    // Requirement (b): a young Onyx I account must have a real chance of a
    // world-class ceiling, or the wiggle room is a lie.
    let highCeiling = 0;
    let young = 0;
    for (let i = 0; i < 400; i++) {
      const e = gen('onyxI', i);
      if (e.hidden.player.identity.age <= 18) {
        young++;
        if (e.hidden.potential >= 85) highCeiling++;
      }
    }
    expect(young).toBeGreaterThan(40);
    const rate = highCeiling / young;
    expect(rate).toBeGreaterThan(0.03);
    expect(rate).toBeLessThan(0.35); // rare enough to be worth hunting
  });

  it('is deterministic', () => {
    expect(JSON.stringify(gen('paragon' as 'apex', 7))).toBe(JSON.stringify(gen('paragon' as 'apex', 7)));
  });
});

describe('deep scouting — the door beneath the cutoff', () => {
  it('draws from the badlands between Cobalt and the cutoff', () => {
    for (let i = 0; i < 200; i++) {
      const m = deepScoutTargetMmr(rng(`d${i}`));
      expect(m).toBeGreaterThanOrEqual(DEEP_FLOOR);
      expect(m).toBeLessThan(SHOW_CUTOFF);
      expect(visible(m)).toBe(false);
    }
  });

  it('everyone can buy a ticket; only a good org buys a repeatable edge', () => {
    const amateur = deepScoutGemChance(0, 45);
    const elite = deepScoutGemChance(3, 85);
    expect(amateur).toBeGreaterThan(0.1);
    expect(amateur).toBeLessThan(0.25);
    expect(elite).toBeGreaterThan(0.4);
    expect(elite).toBeLessThanOrEqual(0.55);
    expect(DEEP_SCOUT_COST).toBeGreaterThan(1);
  });
});

describe('storage and rhythm', () => {
  it('apportions stored files across the bands without losing any', () => {
    const alloc = bandAllocation(120, 96);
    expect(alloc.apex + alloc.paragon).toBe(120);
    expect(alloc.ascendant + alloc.onyxI).toBe(96);
    expect(alloc.paragon).toBeGreaterThan(alloc.apex);
    expect(alloc.onyxI).toBeGreaterThan(alloc.ascendant);
  });

  it('scouting reach gates how much of the world you can even see', () => {
    expect(poolSlots('foreign', 3)).toBe(0);
    expect(poolSlots('home', 0)).toBeLessThan(poolSlots('home', 3));
    expect(poolSlots('allied', 3)).toBeLessThan(poolSlots('home', 3));
    expect(poolSlots('home', 3)).toBe(POOL_BASE);
  });

  it('the header count scales with a region talent depth and is never stored', () => {
    expect(accountsAboveCutoff(1.6)).toBeGreaterThan(accountsAboveCutoff(0.9));
    expect(accountsAboveCutoff(1)).toBe(5200);
  });

  it('pros grind far less in season than hopefuls, and spike in the off-season', () => {
    const proRegular = soloGamesPerWeek(70, 'regular', true);
    const proOff = soloGamesPerWeek(70, 'offseason', true);
    const hopeful = soloGamesPerWeek(70, 'regular', false);
    expect(proOff).toBeGreaterThan(proRegular);
    expect(hopeful).toBeGreaterThan(proRegular * 3);
    expect(soloGamesPerWeek(70, 'playoffs', true)).toBeLessThan(proRegular);
    expect(SOLO_BASE).toBeGreaterThan(0);
  });

  it('a released player comes back underranked, which is honest', () => {
    const back = reentryMmr(2400, 2900);
    expect(back).toBeGreaterThan(2400);
    expect(back).toBeLessThan(2900);
    expect(2900 - back).toBeGreaterThan(250); // trips the smurf predicate, correctly
  });
});
