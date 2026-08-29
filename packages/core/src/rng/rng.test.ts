import { describe, it, expect } from 'vitest';
import { Rng, RngSource } from './rng.js';

describe('Rng determinism', () => {
  it('produces identical sequences for the same seed + stream', () => {
    const a = new Rng('seed-1', 'match');
    const b = new Rng('seed-1', 'match');
    const seqA = Array.from({ length: 20 }, () => a.float());
    const seqB = Array.from({ length: 20 }, () => b.float());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different streams', () => {
    const match = new Rng('seed-1', 'match');
    const market = new Rng('seed-1', 'market');
    expect(match.float()).not.toEqual(market.float());
  });

  it('produces different sequences for different root seeds', () => {
    const a = new Rng('seed-1', 'match');
    const b = new Rng('seed-2', 'match');
    expect(a.float()).not.toEqual(b.float());
  });

  it('stream independence: draining one stream does not shift another', () => {
    // Reference draw from `market` with no prior `match` activity.
    const refMarket = new Rng('root', 'market').float();

    // Now drain `match` heavily, then draw `market` fresh — must match.
    const match = new Rng('root', 'match');
    for (let i = 0; i < 1000; i++) match.float();
    const market = new Rng('root', 'market').float();

    expect(market).toEqual(refMarket);
  });
});

describe('Rng distributions', () => {
  it('float() stays within [0, 1)', () => {
    const r = new Rng('d', 's');
    for (let i = 0; i < 10000; i++) {
      const x = r.float();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('int() is inclusive on both ends and covers the range', () => {
    const r = new Rng('d', 's');
    const seen = new Set<number>();
    for (let i = 0; i < 5000; i++) seen.add(r.int(1, 6));
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('chance() approximates its probability', () => {
    const r = new Rng('d', 's');
    let hits = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) if (r.chance(0.3)) hits++;
    expect(hits / n).toBeGreaterThan(0.28);
    expect(hits / n).toBeLessThan(0.32);
  });

  it('weighted() honors weights approximately', () => {
    const r = new Rng('d', 's');
    const counts = { a: 0, b: 0, c: 0 };
    const n = 30000;
    for (let i = 0; i < n; i++) {
      counts[r.weighted(['a', 'b', 'c'] as const, [1, 3, 6])]++;
    }
    // Expected ~10% / 30% / 60%.
    expect(counts.a / n).toBeCloseTo(0.1, 1);
    expect(counts.b / n).toBeCloseTo(0.3, 1);
    expect(counts.c / n).toBeCloseTo(0.6, 1);
  });

  it('normal() has ~0 mean and ~1 sd', () => {
    const r = new Rng('d', 's');
    const xs = Array.from({ length: 50000 }, () => r.normal());
    const m = xs.reduce((s, x) => s + x, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
    expect(Math.abs(m)).toBeLessThan(0.03);
    expect(Math.abs(sd - 1)).toBeLessThan(0.03);
  });

  it('gaussian() respects clamping bounds', () => {
    const r = new Rng('d', 's');
    for (let i = 0; i < 10000; i++) {
      const x = r.gaussian(50, 30, 0, 100);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(100);
    }
  });

  it('shuffle() is a permutation and is deterministic', () => {
    const base = Array.from({ length: 50 }, (_, i) => i);
    const s1 = new Rng('d', 's').shuffle([...base]);
    const s2 = new Rng('d', 's').shuffle([...base]);
    expect(s1).toEqual(s2);
    expect([...s1].sort((a, b) => a - b)).toEqual(base);
  });
});

describe('RngSource', () => {
  it('gives independent, reproducible per-name streams', () => {
    const src = new RngSource('world-42');
    const m1 = src.stream('match:0001').float();
    const m1b = new RngSource('world-42').stream('match:0001').float();
    expect(m1).toEqual(m1b);
  });
});
