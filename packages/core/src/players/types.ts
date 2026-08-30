/**
 * Player data model.
 *
 * Derived directly from the attribute taxonomy in
 * `docs/05-systems/players-and-attributes.md`. Every attribute is stored at
 * full precision (0–100 unless noted); what the manager actually *perceives* is
 * a fog transform (see `scouting.ts`). The sim always computes on truth.
 *
 * Roles and the champion archetype vocabulary are core mechanical enums (fixed
 * by the game's rules). Regions and languages are CONTENT — branded string ids
 * that live in data packs — so the world is moddable (see CLAUDE.md).
 */

import type { PlayerId, ChampionId } from '../util/ids.js';

export type Role = 'top' | 'jungle' | 'mid' | 'bot' | 'support';
export const ROLES: readonly Role[] = ['top', 'jungle', 'mid', 'bot', 'support'];

/** Champion playstyle families. A player's aptitude on each sets a proficiency ceiling. */
export type Archetype =
  | 'tankEngage'
  | 'skirmisher'
  | 'assassin'
  | 'scalingCarry'
  | 'laneBully'
  | 'controlMage'
  | 'poke'
  | 'enchanter'
  | 'catcher'
  | 'splitPush'
  | 'earlyJungle';
export const ARCHETYPES: readonly Archetype[] = [
  'tankEngage', 'skirmisher', 'assassin', 'scalingCarry', 'laneBully',
  'controlMage', 'poke', 'enchanter', 'catcher', 'splitPush', 'earlyJungle',
];

/** Branded content ids (defined in data packs, not hardcoded in core). */
export type RegionId = string & { readonly __brand: 'RegionId' };
export type LanguageId = string & { readonly __brand: 'LanguageId' };

export interface MechanicalAttrs {
  mechanics: number;
  laning: number;
  teamfighting: number;
  reflexes: number;
  positioning: number;
}

export interface GameKnowledgeAttrs {
  mapAwareness: number;
  waveManagement: number;
  objectiveControl: number;
  visionControl: number;
  rotations: number;
  adaptability: number;
  shotcalling: number;
}

export interface MentalAttrs {
  composure: number;
  consistency: number;
  focus: number;
  clutch: number; // hidden
  tiltResistance: number; // hidden
}

export interface RoleAptitudeAttrs {
  primaryRole: Role;
  secondaryRole: Role;
  top: number;
  jungle: number;
  mid: number;
  bot: number;
  support: number;
  roleFlexibility: number; // hidden: off-role penalty dial
}

/** Hidden aptitude per archetype → the ceiling on champion proficiency for that family. */
export type ChampionAptitudeAttrs = Record<Archetype, number>;

export interface GrowthAttrs {
  potential: number;
  growthRate: number;
  peakAge: number;
  declineStartAge: number;
  declineRate: number;
  mechanicalDeclineBias: number;
  learningRate: number;
  workEthic: number; // fogged
  burnoutProneness: number;
}

export interface PersonalityAttrs {
  ambition: number;
  loyalty: number;
  professionalism: number; // fogged
}

/**
 * The meshing contract: the ONLY attributes the team-meshing spec may consume,
 * plus `identity.languageIds` / `identity.nationality`. Keep it stable.
 */
export interface ChemistryDrivers {
  communication: number;
  leadership: number;
  ego: number;
  temperament: number;
  coachability: number;
  introversion: number;
  mentorship: number;
  teamplayOrientation: number;
  playstyleAggression: number;
  playstyleTempo: number;
  playstyleRiskTaking: number;
  preferredArchetype: Archetype;
}

export interface BrandAttrs {
  starPower: number;
  streamAppeal: number;
  fanbase: number;
  marketability: number; // fogged
  mediaHandling: number; // fogged
}

export interface PlayerAttributes {
  mechanical: MechanicalAttrs;
  gameKnowledge: GameKnowledgeAttrs;
  mental: MentalAttrs;
  roleAptitude: RoleAptitudeAttrs;
  championAptitude: ChampionAptitudeAttrs;
  growth: GrowthAttrs;
  personality: PersonalityAttrs;
  chemistry: ChemistryDrivers;
  brand: BrandAttrs;
}

/** Fast-moving, mostly visible. Lives apart from stable `attributes`. */
export interface PlayerState {
  form: number; // 0..100 → mult 0.80..1.20
  fatigue: number; // 0..100 → up to −25%
  morale: number; // 0..100
  sharpness: number; // 0..100 → mult 0.90..1.00
}

export interface PlayerIdentity {
  name: string;
  age: number; // years, may be fractional across a career
  nationality: RegionId;
  residencyRegion: RegionId;
  languageIds: LanguageId[];
}

export interface Player {
  id: PlayerId;
  identity: PlayerIdentity;
  attributes: PlayerAttributes;
  state: PlayerState;
  /** Proficiency 0..100 per champion the player has learned. */
  championPool: Record<ChampionId, number>;
}

/**
 * Per-viewer scouting knowledge: confidence 0..1 for each fogged attribute path.
 * Confidence 0 → widest range; 1 → exact. Hidden attributes are never numeric.
 */
export interface ScoutingKnowledge {
  confidence: Record<string, number>;
}
