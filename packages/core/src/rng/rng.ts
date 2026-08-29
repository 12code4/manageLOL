/**
 * Deterministic pseudo-random number generation for manageLOL.
 *
 * The entire simulation must be reproducible from (state, seed): balance work,
 * golden-seed tests, and bug reports all depend on it. To keep that property
 * stable as systems are added, randomness is drawn from NAMED STREAMS — the
 * `match` stream consuming numbers never shifts the `market` stream's sequence.
 *
 * A stream is created by hashing (rootSeed + streamName) into a 32-bit state,
 * then advancing it with mulberry32. Both the string hash (xmur3) and the
 * generator (mulberry32) are small, fast, well-distributed, and — critically —
 * fully specified here so results never depend on a platform PRNG.
 *
 * Never call `Math.random()` or `Date.now()` anywhere in the sim; those break
 * determinism. Route every random decision through an {@link Rng}.
 */

/** xmur3 string hash → a seeded 32-bit state generator. */
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/** mulberry32: a compact, high-quality 32-bit generator. */
function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A single named random stream. All draws return deterministic values from the
 * stream's own sequence; consuming one stream never perturbs another.
 */
export class Rng {
  private next01: () => number;
  /** Cached second normal from Box–Muller, spent before generating a new pair. */
  private spareNormal: number | null = null;

  constructor(rootSeed: string, streamName: string) {
    const seedFn = xmur3(`${rootSeed}::${streamName}`);
    this.next01 = mulberry32(seedFn());
  }

  /** Uniform float in [0, 1). */
  float(): number {
    return this.next01();
  }

  /** Uniform float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next01();
  }

  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  /** True with probability p (clamped to [0, 1]). */
  chance(p: number): boolean {
    return this.next01() < Math.max(0, Math.min(1, p));
  }

  /** Uniformly pick one element. Throws on an empty array. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: empty array');
    return items[Math.floor(this.next01() * items.length)]!;
  }

  /**
   * Weighted pick. `weights[i]` is the relative weight of `items[i]`.
   * Non-positive total throws (caller bug). Negative weights are treated as 0.
   */
  weighted<T>(items: readonly T[], weights: readonly number[]): T {
    if (items.length === 0) throw new Error('Rng.weighted: empty array');
    if (items.length !== weights.length) {
      throw new Error('Rng.weighted: items/weights length mismatch');
    }
    let total = 0;
    for (const w of weights) total += Math.max(0, w);
    if (total <= 0) throw new Error('Rng.weighted: non-positive total weight');
    let roll = this.next01() * total;
    for (let i = 0; i < items.length; i++) {
      roll -= Math.max(0, weights[i]!);
      if (roll < 0) return items[i]!;
    }
    return items[items.length - 1]!;
  }

  /**
   * Standard normal (mean 0, sd 1) via Box–Muller, generating pairs and caching
   * the spare so the stream sequence stays tight and reproducible.
   */
  normal(): number {
    if (this.spareNormal !== null) {
      const s = this.spareNormal;
      this.spareNormal = null;
      return s;
    }
    // Avoid log(0) by pulling u1 from (0, 1].
    const u1 = 1 - this.next01();
    const u2 = this.next01();
    const mag = Math.sqrt(-2 * Math.log(u1));
    this.spareNormal = mag * Math.sin(2 * Math.PI * u2);
    return mag * Math.cos(2 * Math.PI * u2);
  }

  /** Gaussian with given mean/sd, optionally clamped to [lo, hi]. */
  gaussian(mean: number, sd: number, lo = -Infinity, hi = Infinity): number {
    return Math.max(lo, Math.min(hi, mean + sd * this.normal()));
  }

  /** In-place Fisher–Yates shuffle (deterministic). Returns the same array. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.next01() * (i + 1));
      const tmp = items[i]!;
      items[i] = items[j]!;
      items[j] = tmp;
    }
    return items;
  }
}

/**
 * A factory bound to one root seed. Call {@link RngSource.stream} to get an
 * independent named stream. Passing the same (rootSeed, name) twice yields the
 * same sequence — intended: derive a per-entity stream like
 * `source.stream('match:' + matchId)` for reproducible, isolated draws.
 */
export class RngSource {
  constructor(readonly rootSeed: string) {}

  stream(name: string): Rng {
    return new Rng(this.rootSeed, name);
  }
}
