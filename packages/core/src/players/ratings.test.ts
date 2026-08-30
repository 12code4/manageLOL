import { describe, it, expect } from 'vitest';
import {
  formMult,
  fatigueMult,
  sharpnessMult,
  roleMult,
  discomfortMult,
  effectiveRoleMult,
  proficiencyCeiling,
  proficiencyGain,
  currentAbility,
} from './ratings.js';
import type { PlayerAttributes, PlayerState, Archetype } from './types.js';

// The taxonomy's worked examples, used as exact golden checks.

describe('state multipliers (taxonomy §10 worked example)', () => {
  const state: PlayerState = { form: 68, fatigue: 40, morale: 50, sharpness: 75 };
  it('form 68 → 1.072', () => expect(formMult(state)).toBeCloseTo(1.072, 6));
  it('fatigue 40 → 0.90', () => expect(fatigueMult(state)).toBeCloseTo(0.9, 6));
  it('sharpness 75 → 0.975', () => expect(sharpnessMult(state)).toBeCloseTo(0.975, 6));
  it('bounds hold at extremes', () => {
    expect(formMult({ form: 0, fatigue: 0, morale: 0, sharpness: 0 })).toBeCloseTo(0.8, 6);
    expect(formMult({ form: 100, fatigue: 0, morale: 0, sharpness: 0 })).toBeCloseTo(1.2, 6);
    expect(fatigueMult({ form: 0, fatigue: 100, morale: 0, sharpness: 0 })).toBeCloseTo(0.75, 6);
  });
});

describe('off-role penalty (taxonomy §4 worked example: "Kestrel")', () => {
  const a = {
    roleAptitude: { primaryRole: 'mid', secondaryRole: 'top', mid: 88, jungle: 55, roleFlexibility: 60 },
  } as unknown as PlayerAttributes;

  it('roleMult mid (apt 88) → 0.928', () => expect(roleMult(a, 'mid')).toBeCloseTo(0.928, 6));
  it('roleMult jungle (apt 55) → 0.73', () => expect(roleMult(a, 'jungle')).toBeCloseTo(0.73, 6));
  it('primary role has no discomfort', () => expect(discomfortMult(a, 'mid')).toBe(1.0));
  it('off-role discomfort (flex 60) → 0.94', () =>
    expect(discomfortMult(a, 'jungle')).toBeCloseTo(0.94, 6));
  it('effective mult mid 0.928, jungle 0.6862', () => {
    expect(effectiveRoleMult(a, 'mid')).toBeCloseTo(0.928, 6);
    expect(effectiveRoleMult(a, 'jungle')).toBeCloseTo(0.6862, 6);
  });
});

describe('champion proficiency (taxonomy §5 worked example: "Vesper")', () => {
  const apt = { assassin: 82, laneBully: 60 } as unknown as Record<Archetype, number>;
  const tags: Partial<Record<Archetype, number>> = { assassin: 0.7, laneBully: 0.3 };

  it('ceiling → 85.24', () => expect(proficiencyCeiling(apt, tags)).toBeCloseTo(85.24, 2));
  it('gain from 40 → ~2.375/game', () =>
    expect(proficiencyGain(40, 85.24, 70)).toBeCloseTo(2.375, 2));
  it('no gain once at/above ceiling', () =>
    expect(proficiencyGain(90, 85.24, 70)).toBe(0));
});

describe('currentAbility', () => {
  it('all-50 attributes → 50', () => {
    const flat = (): Record<string, number> =>
      Object.fromEntries(
        [
          'mechanics', 'laning', 'teamfighting', 'reflexes', 'positioning',
          'mapAwareness', 'waveManagement', 'objectiveControl', 'visionControl',
          'rotations', 'adaptability', 'shotcalling',
          'composure', 'consistency', 'focus', 'clutch', 'tiltResistance',
        ].map((k) => [k, 50]),
      );
    const a = {
      mechanical: flat(),
      gameKnowledge: flat(),
      mental: flat(),
    } as unknown as PlayerAttributes;
    expect(currentAbility(a)).toBeCloseTo(50, 6);
  });
});
