import { describe, it, expect } from 'vitest';
import {
  computeMmr,
  tierFromMmr,
  soloAbility,
  generateLadderEntity,
  revealedFlags,
  LADDER_TIERS,
} from './ladder.js';
import { RngSource } from '../rng/rng.js';
import { flatAttributes } from '../players/testing.js';
import type { LadderEntryId, PlayerId } from '../util/ids.js';

describe('tier mapping', () => {
  it('maps MMR to the right fictional tier', () => {
    expect(tierFromMmr(600).key).toBe('slate');
    expect(tierFromMmr(1950).key).toBe('jade');
    expect(tierFromMmr(2450).key).toBe('onyx');
    expect(tierFromMmr(3200).key).toBe('apex');
  });
  it('tiers are ordered by floor', () => {
    for (let i = 1; i < LADDER_TIERS.length; i++) {
      expect(LADDER_TIERS[i]!.floor).toBeGreaterThan(LADDER_TIERS[i - 1]!.floor);
    }
  });
});

describe('computeMmr reproduces the design worked examples', () => {
  it('Example A — hidden gem (smurf + autofill) shows Jade despite Ascendant ceiling', () => {
    const r = computeMmr({
      soloAbility: 82, maxSoloApt: 88, composure: 70, tiltResistance: 65,
      autofillVictim: true, boost: 0, gamesThisSeason: 44,
    });
    expect(r.baseMmr).toBeCloseTo(2611, -1); // ~2611
    expect(r.steadyMmr).toBeCloseTo(2727, -1); // onyx I / ascendant
    expect(r.currentMmr).toBeCloseTo(1952, -1); // displayed ~Jade
    expect(tierFromMmr(r.currentMmr).key).toBe('jade');
    // truth is far higher than the shown rank — the smurf gap
    expect(r.steadyMmr - r.currentMmr).toBeGreaterThan(600);
  });

  it('Example B — boosted bust shows Ascendant but true steady is far lower', () => {
    const r = computeMmr({
      soloAbility: 61, maxSoloApt: 58, composure: 40, tiltResistance: 38,
      autofillVictim: false, boost: 520, gamesThisSeason: 261,
    });
    expect(r.baseMmr).toBeCloseTo(1817, -1);
    expect(r.steadyMmr).toBeCloseTo(2357, -1);
    expect(r.currentMmr).toBeCloseTo(2265, -1); // displayed Ascendant-ish
    // without the boost, steady would collapse toward Jade
    const decayed = computeMmr({
      soloAbility: 61, maxSoloApt: 58, composure: 40, tiltResistance: 38,
      autofillVictim: false, boost: 0, gamesThisSeason: 261,
    });
    expect(decayed.currentMmr).toBeLessThan(r.currentMmr - 300);
  });
});

describe('soloAbility differs from pro ability by design', () => {
  it('rewards mechanics-heavy profiles over macro-heavy ones', () => {
    const mechs = flatAttributes(50);
    mechs.mechanical.mechanics = 90;
    mechs.mechanical.laning = 85;
    mechs.mechanical.reflexes = 88;
    const macro = flatAttributes(50);
    macro.gameKnowledge.shotcalling = 95; // ignored by soloAbility
    macro.gameKnowledge.visionControl = 90; // ignored
    macro.gameKnowledge.objectiveControl = 90; // ignored
    expect(soloAbility(mechs)).toBeGreaterThan(soloAbility(macro) + 10);
  });
});

describe('generateLadderEntity produces the recruiting archetypes', () => {
  const src = () => new RngSource('ladder-test');

  it('a planted hidden gem carries the flag and hides truth below its rank', () => {
    // try a few seeds; planting guarantees high potential, gem flag should appear
    let found = false;
    const rng = src().stream('gems');
    for (let i = 0; i < 30 && !found; i++) {
      const e = generateLadderEntity(rng, {
        id: `lad_${i}` as LadderEntryId, playerId: `plr_${i}` as PlayerId,
        region: 'mer', plant: 'hiddenGem',
      });
      if (e.hidden.flags.includes('hiddenGem')) {
        found = true;
        expect(e.hidden.potential).toBeGreaterThanOrEqual(80);
      }
    }
    expect(found).toBe(true);
  });

  it('is deterministic for the same seed', () => {
    const a = generateLadderEntity(src().stream('x'), { id: 'lad_1' as LadderEntryId, playerId: 'plr_1' as PlayerId, region: 'kyo' });
    const b = generateLadderEntity(src().stream('x'), { id: 'lad_1' as LadderEntryId, playerId: 'plr_1' as PlayerId, region: 'kyo' });
    expect(a).toEqual(b);
  });

  it('reveals flags only at scouting-confidence thresholds', () => {
    const rng = src().stream('reveal');
    let ent = generateLadderEntity(rng, { id: 'lad_b' as LadderEntryId, playerId: 'plr_b' as PlayerId, region: 'van', plant: 'boosted' });
    // ensure it has the boosted flag; regenerate until it does (planting sets high boost)
    for (let i = 0; i < 20 && !ent.hidden.flags.includes('boosted'); i++) {
      ent = generateLadderEntity(rng, { id: `lad_b${i}` as LadderEntryId, playerId: `plr_b${i}` as PlayerId, region: 'van', plant: 'boosted' });
    }
    expect(ent.hidden.flags).toContain('boosted');
    expect(revealedFlags(ent, 0.2)).not.toContain('boosted'); // hunch: hidden
    expect(revealedFlags(ent, 0.7)).toContain('boosted'); // confident: revealed
  });
});
