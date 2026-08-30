/**
 * Derived player ratings — the spec-stable formulas from the attribute
 * taxonomy (docs/05-systems/players-and-attributes.md §6, §4, §5, §10).
 *
 * These are pure functions of a player's true attributes/state; the match sim
 * and UI both read them. Role *phase* weights used deep inside the match engine
 * live with that engine; here we expose the general role-strength and ability
 * aggregates the rest of the sim needs.
 */

import { clamp100, mean } from '../util/math.js';
import type {
  Archetype,
  MechanicalAttrs,
  GameKnowledgeAttrs,
  MentalAttrs,
  PlayerAttributes,
  PlayerState,
  Role,
} from './types.js';

/** Current Ability: a single 0–100 aggregate of raw quality (taxonomy §6). */
export function currentAbility(a: PlayerAttributes): number {
  const m = a.mechanical;
  const mechAvg = mean([m.mechanics, m.laning, m.teamfighting, m.reflexes, m.positioning]);
  const k = a.gameKnowledge;
  const knowledgeAvg = mean([
    k.mapAwareness, k.waveManagement, k.objectiveControl,
    k.visionControl, k.rotations, k.adaptability, k.shotcalling,
  ]);
  const mn = a.mental;
  const mentalAvg = mean([mn.composure, mn.consistency, mn.focus, mn.clutch, mn.tiltResistance]);
  return 0.34 * mechAvg + 0.34 * knowledgeAvg + 0.22 * mentalAvg + 0.1 * m.teamfighting;
}

/** form multiplier: 0.80 .. 1.20 (taxonomy §10). */
export function formMult(state: PlayerState): number {
  return 1 + (state.form - 50) / 250;
}
/** fatigue multiplier: 1.00 .. 0.75. */
export function fatigueMult(state: PlayerState): number {
  return 1 - (state.fatigue / 100) * 0.25;
}
/** sharpness multiplier: 0.90 .. 1.00. */
export function sharpnessMult(state: PlayerState): number {
  return 0.9 + 0.1 * (state.sharpness / 100);
}
/** Combined fast-state multiplier applied to any performance rating. */
export function stateMultiplier(state: PlayerState): number {
  return formMult(state) * fatigueMult(state) * sharpnessMult(state);
}

/** Aptitude gate for a role: 0.40 .. 1.00 (taxonomy §4). */
export function roleMult(a: PlayerAttributes, role: Role): number {
  const apt = a.roleAptitude[role];
  return 0.4 + 0.6 * (apt / 100);
}

/** Off-role discomfort: 1.0 in primary, else 0.85 .. 1.00 by roleFlexibility (§4). */
export function discomfortMult(a: PlayerAttributes, role: Role): number {
  if (role === a.roleAptitude.primaryRole) return 1.0;
  return 0.85 + 0.15 * (a.roleAptitude.roleFlexibility / 100);
}

/** effectiveRoleMult = roleMult * discomfort — how much of core skill is realized in `role`. */
export function effectiveRoleMult(a: PlayerAttributes, role: Role): number {
  return roleMult(a, role) * discomfortMult(a, role);
}

/**
 * v1 role core-skill weightings (tunable; the match engine may refine per-phase).
 * Each map sums to 1.0 and reads only mechanical + game-knowledge attributes.
 */
const ROLE_WEIGHTS: Record<Role, Partial<Record<keyof MechanicalAttrs | keyof GameKnowledgeAttrs, number>>> = {
  top: { laning: 0.35, mechanics: 0.2, waveManagement: 0.15, teamfighting: 0.15, mapAwareness: 0.15 },
  jungle: { mapAwareness: 0.3, objectiveControl: 0.25, mechanics: 0.2, teamfighting: 0.15, waveManagement: 0.1 },
  mid: { laning: 0.35, mechanics: 0.25, waveManagement: 0.15, mapAwareness: 0.15, teamfighting: 0.1 },
  bot: { laning: 0.3, mechanics: 0.25, teamfighting: 0.25, positioning: 0.15, waveManagement: 0.05 },
  support: { visionControl: 0.25, mapAwareness: 0.2, teamfighting: 0.2, objectiveControl: 0.15, positioning: 0.1, mechanics: 0.1 },
};

/** Role-weighted core skill (0–100), before role fit and state are applied. */
export function roleCoreRating(a: PlayerAttributes, role: Role): number {
  const weights = ROLE_WEIGHTS[role];
  let sum = 0;
  for (const [key, w] of Object.entries(weights)) {
    const k = key as keyof MechanicalAttrs | keyof GameKnowledgeAttrs;
    const v = (a.mechanical as Record<string, number>)[k] ?? (a.gameKnowledge as Record<string, number>)[k] ?? 0;
    sum += v * (w as number);
  }
  return sum;
}

/**
 * Effective strength of a player asked to play `role`, folding in role fit and
 * fast state. This is the per-player number the match engine aggregates.
 */
export function effectiveRoleStrength(
  a: PlayerAttributes,
  state: PlayerState,
  role: Role,
): number {
  return roleCoreRating(a, role) * effectiveRoleMult(a, role) * stateMultiplier(state);
}

/**
 * Champion proficiency ceiling from archetype aptitudes (taxonomy §5).
 * `styleTags` are archetype weights summing to ~1; ceiling is 40..100.
 */
export function proficiencyCeiling(
  championAptitude: Record<Archetype, number>,
  styleTags: Partial<Record<Archetype, number>>,
): number {
  let match = 0;
  for (const [arch, w] of Object.entries(styleTags)) {
    match += (championAptitude[arch as Archetype] ?? 0) * (w as number);
  }
  match /= 100; // → 0..1
  return clamp100(100 * (0.4 + 0.6 * match));
}

/** Per-focused-game proficiency gain toward the ceiling (taxonomy §5). K≈3.0. */
export function proficiencyGain(
  currentProf: number,
  ceiling: number,
  learningRate: number,
  k = 3.0,
): number {
  if (ceiling <= currentProf) return 0;
  return k * (learningRate / 100) * ((ceiling - currentProf) / 40);
}
