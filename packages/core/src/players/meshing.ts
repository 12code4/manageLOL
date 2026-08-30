/**
 * Team meshing — the signature system.
 *
 * A roster's chemistry is a symmetric 5×5 matrix of pairwise relationships. Each
 * of the 10 pairs has a hidden *ceiling* (`target`, from the players' chemistry
 * drivers) and a *current* value that ramps toward the ceiling with shared
 * competitive exposure. Structurally important pairs (bot+support, the jungler's
 * edges) weigh more when the matrix collapses into one team-cohesion scalar; two
 * team gates (shotcaller balance, language coverage) modulate it; the result is a
 * ±12% team-strength multiplier fed to the match sim.
 *
 * Design: docs/05-systems/meshing.md. Consumes ONLY the chemistry drivers +
 * identity (age/languages) + the shotcalling/leadership skills — the taxonomy §8
 * interface guarantee. Fully deterministic; the ramp needs no RNG.
 */

import { clamp, clamp100 } from '../util/math.js';
import type { Player, Role } from './types.js';

export const CHEM_FLOOR = 0.35; // current starts at 35% of ceiling on a new pair
export const K_RAMP = 0.1; // exponential approach speed toward the ceiling

/** Structural weight per role-pair (bot+support highest; jungle most central). Σ = 11.2. */
const STRUCT_W: Record<string, number> = {
  'bot|support': 2.0,
  'jungle|mid': 1.6,
  'jungle|top': 1.3,
  'bot|jungle': 1.2,
  'jungle|support': 1.1,
  'mid|support': 1.0,
  'bot|mid': 0.9,
  'mid|top': 0.8,
  'support|top': 0.7,
  'bot|top': 0.6,
};
export const STRUCT_W_SUM = 11.2;

export function rolePairWeight(r1: Role, r2: Role): number {
  const key = [r1, r2].sort().join('|');
  return STRUCT_W[key] ?? 0;
}

/** The starting five, indexed by role. */
export type Lineup = Record<Role, Player>;

export interface PairChem {
  a: string; // player id, a < b lexicographically
  b: string;
  target: number; // 0..100 ceiling
  current: number; // 0..100, ramps toward target
  gelUnits: number; // cumulative shared exposure (diagnostics / "gelling")
}

export interface RosterChemistry {
  pairs: Record<string, PairChem>; // 10 entries, keyed by sorted pair id
}

export interface CohesionBreakdown {
  pairScore: number; // 0..100
  shotBalance: number; // 0.70..1.00
  langCoverage: number; // 0.90..1.00
  cohesion: number; // 0..100
  meshMult: number; // 0.88..1.12 → match sim
  voices: number; // effective shotcalling voices
  weakestPairs: string[]; // lowest-current pair keys (for UI + "why you lost")
  gelling: boolean; // any pair still < 0.8 * target
}

const n = (x: number): number => x / 100;
const mean2 = (x: number, y: number): number => (x + y) / 200; // mean of two 0..100 → 0..1

export function pairKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
}

function sharedLanguage(a: Player, b: Player): boolean {
  return a.identity.languageIds.some((l) => b.identity.languageIds.includes(l));
}

/** Hidden pair ceiling C*(a,b) from chemistry drivers only (design §2). */
export function computePairTarget(a: Player, b: Player): number {
  const ca = a.attributes.chemistry;
  const cb = b.attributes.chemistry;

  const egoClash = n(ca.ego) * n(cb.ego);
  const egoTerm = 1 - 0.5 * egoClash * (0.5 + 0.5 * mean2(ca.temperament, cb.temperament));
  const tempTerm = 1 - 0.3 * n(ca.temperament) * n(cb.temperament);
  const fitPersona = egoTerm * tempTerm;

  const fitTeamplay = 0.7 + 0.3 * mean2(ca.teamplayOrientation, cb.teamplayOrientation);

  const diffPlay =
    (Math.abs(ca.playstyleAggression - cb.playstyleAggression) +
      Math.abs(ca.playstyleTempo - cb.playstyleTempo) +
      Math.abs(ca.playstyleRiskTaking - cb.playstyleRiskTaking)) /
    300;
  const fitPlay = 0.6 + 0.4 * (1 - diffPlay);

  const commCeil = 0.85 + 0.15 * mean2(ca.communication, cb.communication);

  // mentorship bonus: an older, high-mentorship player lifting a young teammate
  const older = a.identity.age >= b.identity.age ? a : b;
  const younger = older === a ? b : a;
  const ageGap = Math.abs(a.identity.age - b.identity.age);
  const fitMentor =
    1 +
    0.15 * n(older.attributes.chemistry.mentorship) *
      clamp((25 - younger.identity.age) / 8, 0, 1) *
      (ageGap >= 3 ? 1 : 0);

  return clamp100(100 * fitPersona * fitTeamplay * fitPlay * commCeil * fitMentor);
}

/** Ramp speed for a pair (design §3): language, introversion, communication. */
export function pairRampSpeed(a: Player, b: Player): number {
  const langRamp = sharedLanguage(a, b) ? 1.0 : 0.55;
  const introFac = 1 - 0.4 * mean2(a.attributes.chemistry.introversion, b.attributes.chemistry.introversion);
  const commRamp = 0.7 + 0.3 * mean2(a.attributes.chemistry.communication, b.attributes.chemistry.communication);
  return langRamp * introFac * commRamp;
}

/** Build a fresh chemistry matrix for a lineup (all pairs at the floor). */
export function initRosterChemistry(lineup: Lineup): RosterChemistry {
  const players = Object.values(lineup);
  const pairs: Record<string, PairChem> = {};
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i]!;
      const b = players[j]!;
      const [lo, hi] = a.id < b.id ? [a, b] : [b, a];
      const target = computePairTarget(a, b);
      pairs[pairKey(a.id, b.id)] = {
        a: lo.id, b: hi.id, target, current: CHEM_FLOOR * target, gelUnits: 0,
      };
    }
  }
  return { pairs };
}

/**
 * Advance chemistry by one week. `gel` is shared exposure earned this week
 * (full scrim week ≈ 1.0, plus official games). Pure; no RNG.
 */
export function rampWeek(chem: RosterChemistry, lineup: Lineup, gel: number): void {
  const byId = new Map(Object.values(lineup).map((p) => [p.id, p]));
  for (const key of Object.keys(chem.pairs).sort()) {
    const pc = chem.pairs[key]!;
    const a = byId.get(pc.a);
    const b = byId.get(pc.b);
    if (!a || !b) continue;
    const speed = pairRampSpeed(a, b);
    pc.current = clamp100(pc.current + K_RAMP * speed * gel * (pc.target - pc.current));
    pc.gelUnits += gel;
  }
}

/**
 * Reconcile the matrix after a lineup change: keep pairs whose both players
 * stayed, drop pairs that lost a player, create new pairs at the floor.
 */
export function onLineupChange(prev: RosterChemistry, newLineup: Lineup): RosterChemistry {
  const players = Object.values(newLineup);
  const ids = new Set(players.map((p) => p.id));
  const pairs: Record<string, PairChem> = {};
  for (let i = 0; i < players.length; i++) {
    for (let j = i + 1; j < players.length; j++) {
      const a = players[i]!;
      const b = players[j]!;
      const key = pairKey(a.id, b.id);
      const existing = prev.pairs[key];
      if (existing && ids.has(existing.a) && ids.has(existing.b)) {
        pairs[key] = existing; // settled pair persists
      } else {
        const [lo, hi] = a.id < b.id ? [a, b] : [b, a];
        const target = computePairTarget(a, b);
        pairs[key] = { a: lo.id, b: hi.id, target, current: CHEM_FLOOR * target, gelUnits: 0 };
      }
    }
  }
  return { pairs };
}

/** Largest number of players sharing any single language (design §4c). */
function maxSharedLangCount(lineup: Lineup): number {
  const counts = new Map<string, number>();
  for (const p of Object.values(lineup)) {
    for (const l of p.identity.languageIds) counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  let max = 1;
  for (const c of counts.values()) max = Math.max(max, c);
  return max;
}

/** Collapse the matrix + team gates into the match-sim multiplier (design §4). */
export function computeCohesion(chem: RosterChemistry, lineup: Lineup): CohesionBreakdown {
  const roleById = new Map(
    (Object.entries(lineup) as [Role, Player][]).map(([role, p]) => [p.id, role]),
  );

  let weighted = 0;
  const pairList: { key: string; current: number }[] = [];
  for (const key of Object.keys(chem.pairs).sort()) {
    const pc = chem.pairs[key]!;
    const ra = roleById.get(pc.a);
    const rb = roleById.get(pc.b);
    if (!ra || !rb) continue;
    weighted += rolePairWeight(ra, rb) * pc.current;
    pairList.push({ key, current: pc.current });
  }
  const pairScore = weighted / STRUCT_W_SUM;

  let voices = 0;
  for (const p of Object.values(lineup)) {
    const call = clamp((p.attributes.gameKnowledge.shotcalling - 50) / 30, 0, 1);
    voices += call * (0.5 + 0.5 * n(p.attributes.chemistry.leadership));
  }
  const shotBalance = clamp(
    1 - 0.3 * Math.max(0, 0.8 - voices) - 0.1 * Math.max(0, voices - 2.0),
    0.7,
    1.0,
  );

  const langCoverage = 0.9 + 0.1 * (maxSharedLangCount(lineup) / 5);

  const cohesion = pairScore * shotBalance * langCoverage;
  const meshMult = 0.88 + 0.24 * (cohesion / 100);

  const weakestPairs = pairList
    .sort((x, y) => x.current - y.current)
    .slice(0, 3)
    .map((p) => p.key);
  const gelling = Object.values(chem.pairs).some((p) => p.current < 0.8 * p.target);

  return { pairScore, shotBalance, langCoverage, cohesion, meshMult, voices, weakestPairs, gelling };
}
