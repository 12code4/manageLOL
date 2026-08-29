import { describe, it, expect } from 'vitest';
import {
  clamp,
  clamp100,
  lerp,
  invLerp,
  remap,
  logistic,
  winProbFromDiff,
  mean,
  stdev,
  weightedMean,
  round,
} from './math.js';

describe('math helpers', () => {
  it('clamp / clamp100', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
    expect(clamp100(150)).toBe(100);
    expect(clamp100(-4)).toBe(0);
  });

  it('lerp / invLerp / remap round-trip', () => {
    expect(lerp(0, 100, 0.5)).toBe(50);
    expect(invLerp(0, 100, 50)).toBe(0.5);
    expect(remap(5, 0, 10, 0, 100)).toBe(50);
    expect(invLerp(4, 4, 4)).toBe(0); // degenerate range → 0, no NaN
  });

  it('logistic is monotonic and centered', () => {
    expect(logistic(0)).toBeCloseTo(0.5, 6);
    expect(logistic(10)).toBeGreaterThan(logistic(0));
    expect(logistic(-10)).toBeLessThan(logistic(0));
  });

  it('winProbFromDiff is symmetric around 0.5', () => {
    expect(winProbFromDiff(0)).toBeCloseTo(0.5, 6);
    const up = winProbFromDiff(120);
    const down = winProbFromDiff(-120);
    expect(up + down).toBeCloseTo(1, 6);
    // A full-tier gap (== scale) sits at 10/11 odds; half a tier is ~76%.
    expect(up).toBeCloseTo(10 / 11, 6);
    expect(winProbFromDiff(60)).toBeCloseTo(0.7597, 3);
  });

  it('mean / stdev / weightedMean edge cases', () => {
    expect(mean([])).toBe(0);
    expect(mean([2, 4, 6])).toBe(4);
    expect(stdev([5])).toBe(0);
    expect(stdev([2, 4, 6])).toBeCloseTo(1.632993, 5);
    expect(weightedMean([10, 20], [0, 0])).toBe(0);
    expect(weightedMean([10, 20], [1, 3])).toBe(17.5);
  });

  it('round to decimal places', () => {
    expect(round(3.14159, 2)).toBe(3.14);
    expect(round(2.5)).toBe(3);
  });
});
