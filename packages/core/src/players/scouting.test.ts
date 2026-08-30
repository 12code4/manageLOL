import { describe, it, expect } from 'vitest';
import { readAttr } from './attributes.js';
import { scoutedRange, scoutedPotential, scoutPlayer, MAX_FOG_SPREAD } from './scouting.js';
import { makeTestPlayer, flatAttributes } from './testing.js';
import type { ScoutingKnowledge } from './types.js';

describe('readAttr flat→nested accessor', () => {
  const p = makeTestPlayer({
    attributes: flatAttributes(50, { primaryRole: 'mid', preferredArchetype: 'assassin' }),
  });
  it('reads mechanical / knowledge / mental', () => {
    expect(readAttr(p, 'mechanics')).toBe(50);
    expect(readAttr(p, 'objectiveControl')).toBe(50);
    expect(readAttr(p, 'composure')).toBe(50);
  });
  it('reads role aptitude with prefix mapping', () => {
    expect(readAttr(p, 'roleAptitudeMid')).toBe(50);
    expect(readAttr(p, 'roleFlexibility')).toBe(50);
  });
  it('reads champion aptitude with apt→arch mapping', () => {
    expect(readAttr(p, 'aptTankEngage')).toBe(50);
    expect(readAttr(p, 'aptAssassin')).toBe(50);
  });
  it('returns undefined for non-numeric attributes', () => {
    expect(readAttr(p, 'primaryRole')).toBeUndefined();
    expect(readAttr(p, 'nationality')).toBeUndefined();
    expect(readAttr(p, 'preferredArchetype')).toBeUndefined();
    expect(readAttr(p, 'languageIds')).toBeUndefined();
  });
});

describe('scoutedRange fog', () => {
  it('zero confidence → ±22 spread', () => {
    const r = scoutedRange(60, 0, 'mechanics');
    expect(r.low).toBe(38);
    expect(r.high).toBe(82);
    expect(r.exact).toBe(false);
  });
  it('full confidence → exact', () => {
    const r = scoutedRange(60, 1, 'mechanics');
    expect(r.low).toBe(60);
    expect(r.high).toBe(60);
    expect(r.exact).toBe(true);
  });
  it('half confidence → half spread', () => {
    const r = scoutedRange(60, 0.5, 'mechanics');
    expect(r.high - r.low).toBeCloseTo(MAX_FOG_SPREAD, 6); // ±11 → width 22
  });
  it('clamps to 0..100', () => {
    const r = scoutedRange(95, 0, 'mechanics');
    expect(r.high).toBe(100);
  });
});

describe('scoutedPotential', () => {
  it('maps potential to a tier and confidence label', () => {
    expect(scoutedPotential(92, 0.9).tier).toBe('generational');
    expect(scoutedPotential(70, 0.9).tier).toBe('high');
    expect(scoutedPotential(40, 0.9).tier).toBe('limited');
    expect(scoutedPotential(70, 0.9).confidence).toBe('certain');
    expect(scoutedPotential(70, 0.1).confidence).toBe('a hunch');
  });
});

describe('scoutPlayer view', () => {
  const p = makeTestPlayer({ attributes: flatAttributes(70) });

  it('own players are shown exactly', () => {
    const view = scoutPlayer(p, { confidence: {} }, { own: true });
    expect(view.numbers.mechanics?.exact).toBe(true);
    expect(view.numbers.mechanics?.estimate).toBe(70);
  });

  it('unscouted fogged attributes show wide ranges; visible ones stay exact', () => {
    const knowledge: ScoutingKnowledge = { confidence: {} };
    const view = scoutPlayer(p, knowledge);
    // mechanics is fogged → ranged
    expect(view.numbers.mechanics?.exact).toBe(false);
    // starPower is visible → exact even when unscouted
    expect(view.numbers.starPower?.exact).toBe(true);
  });

  it('hidden attributes never appear as numbers', () => {
    const view = scoutPlayer(p, { confidence: {} });
    expect(view.numbers.roleFlexibility).toBeUndefined();
    expect(view.numbers.ego).toBeUndefined();
    expect(view.numbers.clutch).toBeUndefined();
  });
});
