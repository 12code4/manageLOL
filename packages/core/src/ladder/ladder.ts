/**
 * The ranked solo-queue ladder — the primary talent-discovery pipeline.
 *
 * Solo queue rewards different things than pro play (individual carry over
 * teamplay, snowball over utility, tilt-proofing over shotcalling), so the
 * ladder reads a distinct `soloAbility`, NOT pro Current Ability. Rank is a
 * legible-but-noisy proxy for true skill: the gap between `currentMmr` (shown)
 * and `soloAbility` (hidden) is where smurfs, boosted accounts, one-tricks and
 * hidden gems come from — each a named archetype with a formula.
 *
 * Design: docs/05-systems/ranked-ladder.md. Deterministic on the `ladder`
 * stream; reuses the taxonomy scouting fog. Worked examples in the design are
 * exact golden tests.
 */

import { RngSource, type Rng } from '../rng/rng.js';
import { clamp, clamp100 } from '../util/math.js';
import type { LadderEntryId, PlayerId } from '../util/ids.js';
import { generatePlayer } from '../players/generate.js';
import type { Archetype, Player, Role } from '../players/types.js';
import type { RegionId as DataRegionId } from '@managelol/data';

export const MMR_FLOOR = 500;
export const MMR_CAP = 3400;
const RANGE = MMR_CAP - MMR_FLOOR; // 2900
const GAMMA = 1.6;
const G_TAU = 120; // games to ~63% convergence

export type LadderTier =
  | 'slate' | 'copper' | 'quartz' | 'amber' | 'jade'
  | 'cobalt' | 'onyx' | 'ascendant' | 'paragon' | 'apex';

export interface TierDef {
  key: LadderTier;
  name: string;
  floor: number; // inclusive MMR floor
  analogue: string;
}

/** Ten fictional tiers, mineral→apex (IP-safe). Floors define static v1 bands. */
export const LADDER_TIERS: readonly TierDef[] = [
  { key: 'slate', name: 'Slate', floor: MMR_FLOOR, analogue: 'Iron' },
  { key: 'copper', name: 'Copper', floor: 900, analogue: 'Bronze' },
  { key: 'quartz', name: 'Quartz', floor: 1200, analogue: 'Silver' },
  { key: 'amber', name: 'Amber', floor: 1500, analogue: 'Gold' },
  { key: 'jade', name: 'Jade', floor: 1800, analogue: 'Platinum' },
  { key: 'cobalt', name: 'Cobalt', floor: 2050, analogue: 'Emerald' },
  { key: 'onyx', name: 'Onyx', floor: 2300, analogue: 'Diamond' },
  { key: 'ascendant', name: 'Ascendant', floor: 2600, analogue: 'Master' },
  { key: 'paragon', name: 'Paragon', floor: 2850, analogue: 'Grandmaster' },
  { key: 'apex', name: 'Apex', floor: 3050, analogue: 'Challenger' },
];

/** Map an MMR value to its tier (static bands; top-tier dynamic cutoffs are a refinement). */
export function tierFromMmr(mmr: number): TierDef {
  let out = LADDER_TIERS[0]!;
  for (const t of LADDER_TIERS) if (mmr >= t.floor) out = t;
  return out;
}

/** Division 1 (I, highest) .. 4 (IV) within a tier by MMR position. Apex tiers → 1. */
export function divisionFromMmr(mmr: number): 1 | 2 | 3 | 4 {
  const t = tierFromMmr(mmr);
  const idx = LADDER_TIERS.indexOf(t);
  const next = LADDER_TIERS[idx + 1];
  if (!next) return 1;
  const width = (next.floor - t.floor) / 4;
  const step = Math.floor((mmr - t.floor) / width); // 0..3 low→high
  return (4 - Math.min(3, step)) as 1 | 2 | 3 | 4;
}

/** Solo-queue ability — deliberately ignores macro/shotcalling/utility (design §4). */
export function soloAbility(a: Player['attributes']): number {
  const m = a.mechanical;
  const k = a.gameKnowledge;
  return clamp100(
    0.26 * m.mechanics + 0.16 * m.laning + 0.14 * m.teamfighting +
      0.12 * k.mapAwareness + 0.1 * m.reflexes + 0.08 * m.positioning +
      0.08 * k.waveManagement + 0.06 * a.mental.composure,
  );
}

/** Solo-queue-favored archetypes; the best of these inflates ladder rank (b_meta). */
const SOLO_APTS: Archetype[] = ['assassin', 'laneBully', 'skirmisher', 'scalingCarry', 'earlyJungle', 'catcher'];

export function maxSoloApt(a: Player['attributes']): number {
  return Math.max(...SOLO_APTS.map((x) => a.championAptitude[x]));
}

export interface MmrInputs {
  soloAbility: number;
  maxSoloApt: number;
  composure: number;
  tiltResistance: number;
  autofillVictim: boolean;
  boost: number; // current boost offset (decays over time)
  gamesThisSeason: number;
}

export interface MmrResult {
  baseMmr: number;
  steadyMmr: number;
  currentMmr: number;
  tier: LadderTier;
}

/** The attributes→rank model (design §4). Pure; exact to the worked examples. */
export function computeMmr(i: MmrInputs): MmrResult {
  const baseMmr = MMR_FLOOR + RANGE * Math.pow(i.soloAbility / 100, GAMMA);
  const bMeta = RANGE * 0.1 * ((i.maxSoloApt - 50) / 50);
  const bMental = RANGE * 0.04 * (((i.composure - 50) / 50) + ((i.tiltResistance - 50) / 50)) / 2;
  const bRole = i.autofillVictim ? -RANGE * 0.05 : 0;
  const biasMmr = bMeta + bMental + bRole + i.boost;
  const steadyMmr = clamp(baseMmr + biasMmr, MMR_FLOOR, MMR_CAP);
  const placementMmr = 1200 + 0.15 * steadyMmr;
  const convergence = 1 - Math.exp(-i.gamesThisSeason / G_TAU);
  const currentMmr = clamp(placementMmr + (steadyMmr - placementMmr) * convergence, MMR_FLOOR, MMR_CAP);
  return { baseMmr, steadyMmr, currentMmr, tier: tierFromMmr(currentMmr).key };
}

export type LadderFlag =
  | 'smurf' | 'boosted' | 'oneTrick' | 'hiddenGem' | 'bust' | 'autofillVictim';

export type AgeBand = '16-18' | '19-21' | '22-24' | '25-27' | '28+';

export function ageBand(age: number): AgeBand {
  if (age <= 18) return '16-18';
  if (age <= 21) return '19-21';
  if (age <= 24) return '22-24';
  if (age <= 27) return '25-27';
  return '28+';
}

/**
 * A ladder prospect. Carries the hidden true `player` (in v1 we keep it inline;
 * the design's discard-and-reseed-from-genSeed optimization matters only at
 * 100k-entity scale). Visible fields are what the browser shows unscouted.
 */
export interface LadderEntity {
  id: LadderEntryId;
  handle: string;
  region: DataRegionId;
  roleGuess: Role;
  ageBand: AgeBand;
  // visible ladder state
  mmr: number;
  tier: LadderTier;
  division: 1 | 2 | 3 | 4;
  peakTier: LadderTier;
  gamesThisSeason: number;
  winRate: number;
  topArchetypes: Archetype[];
  // hidden truth
  hidden: {
    player: Player;
    soloAbility: number;
    steadyMmr: number;
    flags: LadderFlag[];
    potential: number;
  };
}

export interface LadderGenOpts {
  id: LadderEntryId;
  playerId: PlayerId;
  region: DataRegionId;
  /** Roughly the tier the account displays at (drives quality + games). */
  targetTier?: LadderTier;
  /** Force an archetype for planted prospects (e.g. a guaranteed gem). */
  plant?: 'hiddenGem' | 'smurf' | 'boosted' | 'bust' | null;
}

/**
 * Generate one ladder prospect with hidden truth and derived flags. The visible
 * rank can badly mis-state the truth — that's the design.
 */
export function generateLadderEntity(rng: Rng, opts: LadderGenOpts): LadderEntity {
  const plant = opts.plant ?? null;

  // Quality center for the underlying player. Gems are young & high-ceiling.
  let qualityCenter = 55;
  let ageRange: [number, number] = [16, 24];
  if (plant === 'hiddenGem' || plant === 'smurf') { qualityCenter = 72; ageRange = [16, 19]; }
  if (plant === 'boosted' || plant === 'bust') { qualityCenter = 58; ageRange = [20, 25]; }

  const player = generatePlayer(rng, { id: opts.playerId, region: opts.region, qualityCenter, ageRange });

  // Planted archetypes push potential/soloAbility to make the trap/jackpot real.
  if (plant === 'hiddenGem') player.attributes.growth.potential = clamp100(Math.max(player.attributes.growth.potential, 82 + rng.range(0, 10)));
  if (plant === 'bust') player.attributes.growth.potential = clamp100(Math.min(player.attributes.growth.potential, 55));

  const solo = soloAbility(player.attributes);
  const potential = player.attributes.growth.potential;
  const autofillVictim = plant === 'hiddenGem' || rng.chance(0.12);
  const boost = plant === 'boosted' ? rng.range(350, 600) : rng.chance(0.08) ? rng.range(150, 400) : 0;
  // smurfs / gems have few games (rank lags truth); others have many.
  const gamesThisSeason =
    plant === 'smurf' || plant === 'hiddenGem'
      ? Math.round(rng.range(30, 70))
      : Math.round(rng.range(140, 320));

  const mmr = computeMmr({
    soloAbility: solo,
    maxSoloApt: maxSoloApt(player.attributes),
    composure: player.attributes.mental.composure,
    tiltResistance: player.attributes.mental.tiltResistance,
    autofillVictim,
    boost,
    gamesThisSeason,
  });

  // Derive flags from truth (design §4.1).
  const flags: LadderFlag[] = [];
  if (autofillVictim) flags.push('autofillVictim');
  if (boost > 300) flags.push('boosted');
  if (mmr.currentMmr < mmr.steadyMmr - 250) flags.push('smurf');
  if (maxSoloApt(player.attributes) > 82 && solo < 70) flags.push('oneTrick');
  if (potential >= 80 && tierFromMmr(mmr.currentMmr).floor < LADDER_TIERS[6]!.floor) flags.push('hiddenGem');
  if (potential < 56 && mmr.currentMmr > 2050) flags.push('bust');

  const lean = player.attributes.chemistry.preferredArchetype;
  return {
    id: opts.id,
    handle: player.identity.name,
    region: opts.region,
    roleGuess: player.attributes.roleAptitude.primaryRole,
    ageBand: ageBand(player.identity.age),
    mmr: Math.round(mmr.currentMmr),
    tier: mmr.tier,
    division: divisionFromMmr(mmr.currentMmr),
    peakTier: mmr.tier,
    gamesThisSeason,
    winRate: clamp(0.5 + (mmr.currentMmr - mmr.steadyMmr) / 4000 + rng.range(-0.03, 0.03), 0.4, 0.72),
    topArchetypes: [lean],
    hidden: { player, soloAbility: solo, steadyMmr: Math.round(mmr.steadyMmr), flags, potential },
  };
}

/** Flags revealed at a given scouting confidence (design §6.1 thresholds). */
export function revealedFlags(entity: LadderEntity, confidence: number): LadderFlag[] {
  const out: LadderFlag[] = [];
  const has = (f: LadderFlag): boolean => entity.hidden.flags.includes(f);
  if (confidence >= 0.5) {
    if (has('oneTrick')) out.push('oneTrick');
    if (has('autofillVictim')) out.push('autofillVictim');
  }
  if (confidence >= 0.65) {
    for (const f of ['smurf', 'boosted', 'hiddenGem', 'bust'] as const) if (has(f)) out.push(f);
  }
  return out;
}

/** Convenience: a seeded ladder source for a region/week. */
export function ladderStream(rootSeed: string, region: string, week: number): Rng {
  return new RngSource(rootSeed).stream(`ladder:${region}:${week}`);
}
