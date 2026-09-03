import { describe, expect, it } from 'vitest';
import { Rng } from '../rng/rng.js';
import { generatePlayer } from './generate.js';
import { currentAbility } from './ratings.js';
import type { Player, RegionId } from './types.js';
import type { PlayerId } from '../util/ids.js';
import {
  DEV_BASE,
  ageGrowthMult,
  applyDevelopment,
  developSeason,
  developWeek,
  driveScore,
  growthMix,
  ladderContext,
  supportScore,
  type DevContext,
} from './development.js';

const rng = (s: string): Rng => new Rng('dev-test', s);

/** A prospect: young, well under his ceiling, wired to improve. */
function prospect(opts: { age: number; ca: number; potential: number; seed?: string }): Player {
  const p = generatePlayer(rng(opts.seed ?? 'p'), {
    id: 'p1' as PlayerId,
    region: 'mer' as RegionId,
    qualityCenter: opts.ca,
    ageRange: [opts.age, opts.age],
    spread: 2,
  });
  p.identity.age = opts.age;
  p.attributes.growth.potential = opts.potential;
  p.attributes.growth.growthRate = 78;
  p.attributes.growth.learningRate = 76;
  p.attributes.growth.workEthic = 80;
  p.attributes.growth.peakAge = 25;
  p.attributes.growth.declineStartAge = 27;
  return p;
}

const eliteOrg: DevContext = { environment: 92, playingTime: 100, mentorship: 78, success: 0.72, offRole: false };
const poorOrg: DevContext = { environment: 34, playingTime: 100, mentorship: 12, success: 0.4, offRole: false };

describe('the growth curve', () => {
  it('runs full speed in the mid-teens and stops at the peak age', () => {
    expect(ageGrowthMult(16, 25)).toBeCloseTo(1.32, 2);
    expect(ageGrowthMult(20, 25)).toBeLessThan(ageGrowthMult(17, 25));
    expect(ageGrowthMult(25, 25)).toBeLessThan(0.1);
    expect(ageGrowthMult(30, 25)).toBeLessThan(0.1);
  });

  it('shifts what grows as a player ages', () => {
    expect(growthMix(18).mechanical).toBeGreaterThan(growthMix(26).mechanical);
    expect(growthMix(26).knowledge).toBeGreaterThan(growthMix(18).knowledge);
    for (const age of [18, 23, 28]) {
      const m = growthMix(age);
      expect(m.mechanical + m.knowledge + m.mental).toBeCloseTo(1, 6);
    }
  });

  it('headroom, not rank, sets the rate', () => {
    const roomy = prospect({ age: 18, ca: 55, potential: 90 });
    const capped = prospect({ age: 18, ca: 55, potential: 56 });
    const a = developWeek(roomy, eliteOrg, rng('a')).delta;
    const b = developWeek(capped, eliteOrg, rng('a')).delta;
    expect(a).toBeGreaterThan(b * 3);
  });

  it('a player at their ceiling does not grow', () => {
    const done = prospect({ age: 20, ca: 80, potential: 60 });
    expect(developWeek(done, eliteOrg, rng('z')).delta).toBe(0);
  });
});

describe('the wiggle room: a low-tier signing can become the best', () => {
  it('an elite org roughly doubles the rate of solo queue', () => {
    const inOrg = prospect({ age: 17, ca: 55, potential: 92, seed: 'gem' });
    const onLadder = prospect({ age: 17, ca: 55, potential: 92, seed: 'gem' });
    const org = developSeason(inOrg, eliteOrg, rng('s1'));
    const solo = developSeason(onLadder, ladderContext(), rng('s1'));
    expect(org.gained).toBeGreaterThan(solo.gained * 1.8);
    expect(org.gained).toBeGreaterThan(9);
    expect(org.gained).toBeLessThan(16); // a season is a step, never a transformation
  });

  it('four seasons in a good org turn a Diamond kid into a world-beater', () => {
    const p = prospect({ age: 17, ca: 56, potential: 93, seed: 'star' });
    let total = 0;
    for (let s = 0; s < 5; s++) total += developSeason(p, eliteOrg, rng(`yr${s}`)).gained;
    const finalCa = currentAbility(p.attributes);
    expect(p.identity.age).toBeCloseTo(17 + (5 * 40) / 52, 1);
    expect(finalCa).toBeGreaterThan(84);
    expect(total).toBeGreaterThan(28);
  });

  it('the same kid left on the ladder never gets there', () => {
    const p = prospect({ age: 17, ca: 56, potential: 93, seed: 'star' });
    for (let s = 0; s < 5; s++) developSeason(p, ladderContext(), rng(`yr${s}`));
    expect(currentAbility(p.attributes)).toBeLessThan(78);
  });

  it('potential is a hard wall — a 62-ceiling grinder never becomes elite', () => {
    const p = prospect({ age: 17, ca: 50, potential: 62, seed: 'cap' });
    for (let s = 0; s < 8; s++) developSeason(p, eliteOrg, rng(`c${s}`));
    expect(currentAbility(p.attributes)).toBeLessThan(70);
    for (const v of Object.values(p.attributes.mechanical)) expect(v).toBeLessThanOrEqual(68);
  });

  it('a poor environment and a bench seat both cost real growth', () => {
    const good = prospect({ age: 18, ca: 60, potential: 88, seed: 'env' });
    const bad = prospect({ age: 18, ca: 60, potential: 88, seed: 'env' });
    const benched = prospect({ age: 18, ca: 60, potential: 88, seed: 'env' });
    const g = developSeason(good, eliteOrg, rng('e')).gained;
    const b = developSeason(bad, poorOrg, rng('e')).gained;
    const s = developSeason(benched, { ...eliteOrg, playingTime: 40 }, rng('e')).gained;
    expect(g).toBeGreaterThan(b);
    expect(g).toBeGreaterThan(s);
  });
});

describe('decline', () => {
  it('a veteran past their decline age loses ability', () => {
    const vet = prospect({ age: 29, ca: 80, potential: 90, seed: 'vet' });
    const week = developWeek(vet, eliteOrg, rng('v'));
    expect(week.declining).toBe(true);
    expect(week.delta).toBeLessThan(0);
  });

  it('mechanics go first and game knowledge keeps rising', () => {
    const vet = prospect({ age: 30, ca: 82, potential: 92, seed: 'vet2' });
    const mechBefore = vet.attributes.mechanical.mechanics;
    const knowBefore = vet.attributes.gameKnowledge.shotcalling;
    for (let w = 0; w < 80; w++) applyDevelopment(vet, developWeek(vet, eliteOrg, rng(`w${w}`)), rng(`j${w}`));
    expect(vet.attributes.mechanical.mechanics).toBeLessThan(mechBefore);
    expect(vet.attributes.gameKnowledge.shotcalling).toBeGreaterThan(knowBefore);
  });

  it('decline accelerates the further past the cliff a player is', () => {
    const early = prospect({ age: 28, ca: 80, potential: 90, seed: 'd' });
    const late = prospect({ age: 33, ca: 80, potential: 90, seed: 'd' });
    expect(developWeek(late, eliteOrg, rng('d')).delta).toBeLessThan(developWeek(early, eliteOrg, rng('d')).delta);
  });
});

describe('determinism and shape', () => {
  it('the same seed produces the same career', () => {
    const a = prospect({ age: 18, ca: 62, potential: 85, seed: 'det' });
    const b = prospect({ age: 18, ca: 62, potential: 85, seed: 'det' });
    developSeason(a, eliteOrg, rng('same'));
    developSeason(b, eliteOrg, rng('same'));
    expect(JSON.stringify(a.attributes)).toBe(JSON.stringify(b.attributes));
  });

  it('drive and support are bounded 0..100 and move the rate the right way', () => {
    const p = prospect({ age: 18, ca: 60, potential: 90 });
    expect(driveScore(p.attributes)).toBeGreaterThan(0);
    expect(driveScore(p.attributes)).toBeLessThanOrEqual(100);
    expect(supportScore(eliteOrg)).toBeGreaterThan(supportScore(ladderContext()));
    expect(supportScore(ladderContext())).toBeGreaterThan(0);
    expect(DEV_BASE).toBeGreaterThan(0);
  });

  it('breakout weeks happen to young players and never to old ones', () => {
    const young = prospect({ age: 18, ca: 55, potential: 92, seed: 'leap' });
    const old = prospect({ age: 24, ca: 55, potential: 92, seed: 'leap' });
    let youngLeaps = 0;
    let oldLeaps = 0;
    for (let w = 0; w < 600; w++) {
      if (developWeek(young, eliteOrg, rng(`l${w}`)).leap) youngLeaps++;
      if (developWeek(old, eliteOrg, rng(`l${w}`)).leap) oldLeaps++;
    }
    expect(youngLeaps).toBeGreaterThan(0);
    expect(oldLeaps).toBe(0);
  });
});
