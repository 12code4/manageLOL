/**
 * Scouting fog (taxonomy §11).
 *
 * Fog is a pure presentation transform over true values — the sim always
 * computes on truth; the manager only ever sees a `ScoutedView`. Confidence per
 * attribute (0..1) narrows the shown range; scouting raises confidence.
 *
 *  - visible → shown exactly (own players, identity, brand, state).
 *  - fogged  → shown as a range that shrinks to a point as confidence → 1.
 *  - hidden  → never numeric. `potential` is special: a coarse tier + a
 *              confidence label, never a number.
 */

import { clamp100 } from '../util/math.js';
import { ATTR_BY_KEY, HIDDEN_KEYS, readAttr, type AttrKey } from './attributes.js';
import type { Player, ScoutingKnowledge } from './types.js';

/** Widest half-spread shown for a fogged attribute at zero confidence. */
export const MAX_FOG_SPREAD = 22;

export type PotentialTier = 'generational' | 'elite' | 'high' | 'solid' | 'limited';
export type ConfidenceLabel = 'a hunch' | 'a read' | 'confident' | 'certain';

export interface ScoutedNumber {
  key: AttrKey;
  low: number;
  high: number;
  /** Point estimate (range midpoint) for compact display / sorting. */
  estimate: number;
  exact: boolean;
}

export interface ScoutedPotential {
  tier: PotentialTier;
  confidence: ConfidenceLabel;
}

/** Range for a fogged numeric attribute given viewer confidence (taxonomy §11). */
export function scoutedRange(trueVal: number, confidence: number, key: AttrKey): ScoutedNumber {
  const conf = clamp100(confidence * 100) / 100;
  const half = HIDDEN_KEYS.has(key) ? MAX_FOG_SPREAD : MAX_FOG_SPREAD * (1 - conf);
  const low = clamp100(trueVal - half);
  const high = clamp100(trueVal + half);
  return { key, low, high, estimate: (low + high) / 2, exact: half < 0.5 };
}

function potentialTier(potential: number): PotentialTier {
  if (potential >= 90) return 'generational';
  if (potential >= 80) return 'elite';
  if (potential >= 68) return 'high';
  if (potential >= 55) return 'solid';
  return 'limited';
}

function confidenceLabel(confidence: number): ConfidenceLabel {
  if (confidence >= 0.85) return 'certain';
  if (confidence >= 0.6) return 'confident';
  if (confidence >= 0.3) return 'a read';
  return 'a hunch';
}

/**
 * The manager-facing potential estimate: a coarse tier plus a confidence label.
 * At low confidence the tier itself may be off by one — deliberately: potential
 * is the marquee gamble. `noise` in [-1,1] nudges the shown tier when unsure.
 */
export function scoutedPotential(
  truePotential: number,
  confidence: number,
  noise = 0,
): ScoutedPotential {
  const wobble = (1 - clamp100(confidence * 100) / 100) * noise * 12;
  return {
    tier: potentialTier(clamp100(truePotential + wobble)),
    confidence: confidenceLabel(confidence),
  };
}

/** A fully fogged view of a player for a given viewer's scouting knowledge. */
export interface ScoutedView {
  playerId: Player['id'];
  /** Numeric attributes the viewer can perceive (visible exact, or fogged range). */
  numbers: Partial<Record<AttrKey, ScoutedNumber>>;
  potential: ScoutedPotential;
}

/** Build the view the manager sees. `own` players are shown exactly (visible). */
export function scoutPlayer(
  player: Player,
  knowledge: ScoutingKnowledge,
  opts: { own?: boolean } = {},
): ScoutedView {
  const numbers: Partial<Record<AttrKey, ScoutedNumber>> = {};
  for (const meta of Object.values(ATTR_BY_KEY)) {
    const val = readAttr(player, meta.key);
    if (val === undefined) continue; // non-numeric handled elsewhere
    if (meta.visibility === 'hidden') continue; // never numeric (potential is separate)
    if (opts.own || meta.visibility === 'visible') {
      numbers[meta.key] = { key: meta.key, low: val, high: val, estimate: val, exact: true };
    } else {
      const conf = knowledge.confidence[meta.key] ?? 0;
      numbers[meta.key] = scoutedRange(val, conf, meta.key);
    }
  }
  const potConf = opts.own ? 0.75 : knowledge.confidence['potential'] ?? 0;
  return {
    playerId: player.id,
    numbers,
    potential: scoutedPotential(player.attributes.growth.potential, potConf),
  };
}
