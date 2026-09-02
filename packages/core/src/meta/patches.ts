/**
 * Meta & patches (docs/05-systems/meta-and-patches.md).
 *
 * Every four weeks a patch re-weights archetype strength (momentum + shock,
 * mean-reverting) and hands a few champions an outlier buff/nerf. Champion
 * strength on a patch is what the draft reads. Pure functions of the `meta`
 * RNG stream: the whole meta history of a save is reproducible.
 */

import type { Champion } from '@managelol/data';
import type { Rng } from '../rng/rng.js';
import { ARCHETYPES, type Archetype } from '../players/types.js';
import { clamp } from '../util/math.js';

export interface Patch {
  index: number;
  /** Per-archetype strength delta, −10..+10. */
  archDelta: Record<Archetype, number>;
  /** Champion-specific outliers ("they gutted my champ"), −10..+10. */
  outliers: Record<string, number>;
}

export const PATCH_INTERVAL_WEEKS = 4;

/** Generate patch `index` from the previous one (momentum 0.6, shock sd 4). */
export function generatePatch(
  rng: Rng,
  index: number,
  champions: readonly Champion[],
  prev?: Patch,
): Patch {
  const archDelta = {} as Record<Archetype, number>;
  for (const a of ARCHETYPES) {
    const prevD = prev?.archDelta[a] ?? 0;
    archDelta[a] = clamp(0.6 * prevD + rng.gaussian(0, 4), -10, 10);
  }
  const outliers: Record<string, number> = {};
  const ids = champions.map((c) => c.id).sort();
  const n = rng.int(3, 5);
  for (let i = 0; i < n; i++) {
    const id = rng.pick(ids);
    outliers[id] = clamp(Math.round(rng.gaussian(0, 7)), -10, 10);
  }
  return { index, archDelta, outliers };
}

/** Effective champion strength on a patch, 20..90 (design §2). */
export function championStrength(c: Champion, patch: Patch): number {
  let s = c.basePower;
  for (const [a, w] of Object.entries(c.styleTags)) {
    s += (patch.archDelta[a as Archetype] ?? 0) * (w ?? 0);
  }
  s += patch.outliers[c.id] ?? 0;
  return clamp(s, 20, 90);
}

export type Tier = 'S' | 'A' | 'B' | 'C';
export function tierOf(strength: number): Tier {
  if (strength >= 62) return 'S';
  if (strength >= 55) return 'A';
  if (strength >= 47) return 'B';
  return 'C';
}

/** Patch-familiarity gain for a week (design §3). */
export function familiarityGain(scrimShare: number, coachAdaptability: number): number {
  return 22 * scrimShare * (0.5 + 0.5 * (coachAdaptability / 100));
}
