/** Small, dependency-free numeric helpers shared across the simulation. */

/** Clamp `x` into [lo, hi]. */
export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** Clamp into the game's canonical 0–100 attribute band. */
export function clamp100(x: number): number {
  return clamp(x, 0, 100);
}

/** Linear interpolate from a to b by t (t is not clamped). */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Inverse lerp: where does x sit between a and b, as a fraction? */
export function invLerp(a: number, b: number, x: number): number {
  return a === b ? 0 : (x - a) / (b - a);
}

/** Remap x from [inLo, inHi] onto [outLo, outHi]. */
export function remap(
  x: number,
  inLo: number,
  inHi: number,
  outLo: number,
  outHi: number,
): number {
  return lerp(outLo, outHi, invLerp(inLo, inHi, x));
}

/** Logistic function; `k` sets steepness, `x0` the midpoint. */
export function logistic(x: number, k = 1, x0 = 0): number {
  return 1 / (1 + Math.exp(-k * (x - x0)));
}

/**
 * Win probability for A over B from a rating difference, on the classic
 * Elo-style base-10 logistic curve. `scale` is the rating gap of one "10× odds"
 * step: a diff of `scale` yields 10/11 ≈ 91% odds, a diff of `scale/2` ≈ 76%.
 * The default (120) makes a full-tier skill gap a strong but beatable edge.
 */
export function winProbFromDiff(diff: number, scale = 120): number {
  return 1 / (1 + Math.pow(10, -diff / scale));
}

/** Arithmetic mean; empty → 0. */
export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Population standard deviation; length < 2 → 0. */
export function stdev(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return Math.sqrt(s / xs.length);
}

/** Weighted mean of values; parallel arrays. Zero total weight → 0. */
export function weightedMean(values: readonly number[], weights: readonly number[]): number {
  let num = 0;
  let den = 0;
  for (let i = 0; i < values.length; i++) {
    const w = weights[i] ?? 0;
    num += (values[i] ?? 0) * w;
    den += w;
  }
  return den === 0 ? 0 : num / den;
}

/** Round to `dp` decimal places (deterministic, avoids FP display noise). */
export function round(x: number, dp = 0): number {
  const f = 10 ** dp;
  return Math.round(x * f) / f;
}
