import { describe, it, expect } from 'vitest';
import { RngSource } from '../rng/rng.js';
import { generatePlayer } from './generate.js';
import { currentAbility } from './ratings.js';
import type { PlayerId } from '../util/ids.js';

const src = () => new RngSource('gen-test');

describe('generatePlayer', () => {
  it('is deterministic for the same seed', () => {
    const a = generatePlayer(src().stream('p'), { id: 'plr_1' as PlayerId, region: 'kyo', qualityCenter: 70 });
    const b = generatePlayer(src().stream('p'), { id: 'plr_1' as PlayerId, region: 'kyo', qualityCenter: 70 });
    expect(a).toEqual(b);
  });

  it('enforces potential ≥ current ability', () => {
    const rng = src().stream('cohort');
    for (let i = 0; i < 200; i++) {
      const p = generatePlayer(rng, { id: `plr_${i}` as PlayerId, region: 'wilds', qualityCenter: 55, ageRange: [16, 20] });
      expect(p.attributes.growth.potential).toBeGreaterThanOrEqual(currentAbility(p.attributes));
    }
  });

  it('orders peakAge < declineStartAge', () => {
    const rng = src().stream('cohort2');
    for (let i = 0; i < 200; i++) {
      const p = generatePlayer(rng, { id: `plr_${i}` as PlayerId, region: 'mer', qualityCenter: 60 });
      expect(p.attributes.growth.peakAge).toBeLessThan(p.attributes.growth.declineStartAge);
    }
  });

  it('assigns the primary role the top role aptitude', () => {
    const rng = src().stream('roles');
    for (let i = 0; i < 100; i++) {
      const p = generatePlayer(rng, { id: `plr_${i}` as PlayerId, region: 'tia', qualityCenter: 68, primaryRole: 'jungle' });
      const ra = p.attributes.roleAptitude;
      expect(ra.primaryRole).toBe('jungle');
      // primary aptitude should be >= each off-role aptitude (generated that way)
      for (const r of ['top', 'mid', 'bot', 'support'] as const) {
        expect(ra.jungle).toBeGreaterThanOrEqual(ra[r] - 1e-9);
      }
    }
  });

  it('reflects region flavor on average (Kyorin mechanics > Vantia mechanics)', () => {
    const rng = src().stream('flavor');
    const mech = (region: 'kyo' | 'van'): number => {
      let sum = 0;
      const n = 300;
      for (let i = 0; i < n; i++) {
        sum += generatePlayer(rng, { id: `plr_${region}_${i}` as PlayerId, region, qualityCenter: 65, ageRange: [20, 24] })
          .attributes.mechanical.mechanics;
      }
      return sum / n;
    };
    // Kyorin gets +8 mechanics bias, Vantia −2 → clear separation over a large sample.
    expect(mech('kyo')).toBeGreaterThan(mech('van') + 4);
  });

  it('produces higher-rated players at a higher quality center', () => {
    const rng = src().stream('quality');
    const avgCA = (center: number): number => {
      let s = 0;
      const n = 200;
      for (let i = 0; i < n; i++) {
        s += currentAbility(
          generatePlayer(rng, { id: `plr_${center}_${i}` as PlayerId, region: 'mer', qualityCenter: center, ageRange: [20, 24] }).attributes,
        );
      }
      return s / n;
    };
    expect(avgCA(80)).toBeGreaterThan(avgCA(45) + 15);
  });

  it('generates non-empty handles within length bounds', () => {
    const rng = src().stream('handles');
    for (let i = 0; i < 50; i++) {
      const p = generatePlayer(rng, { id: `plr_${i}` as PlayerId, region: 'kyo', qualityCenter: 60 });
      expect(p.identity.name.length).toBeGreaterThan(1);
      expect(p.identity.name.length).toBeLessThanOrEqual(10);
    }
  });
});
