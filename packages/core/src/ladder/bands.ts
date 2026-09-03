/**
 * The visible ladder — who is actually on it, and who is not.
 *
 * Real orgs do not scout Gold. They sign from the top of the ladder, and
 * mostly from the very top of it. So the ladder the manager *sees* starts at
 * Onyx I (our Diamond 1) and nothing below it is ever listed.
 *
 * That cutoff is not a display filter bolted on afterwards; it falls out of
 * the tier bands already in `ladder.ts`. Onyx spans 2300..2600 in four
 * divisions of 75, so division I begins at 2525. `SHOW_CUTOFF = 2525` is
 * literally "Diamond 1 and above".
 *
 * The cutoff is also where the game's most important promise lives. Making
 * the visible pool elite would kill the fantasy the manager was sold — that
 * a kid nobody rates becomes the best player in the world — so there is one
 * door beneath it: **deep scouting**. You spend real analyst weeks, you get
 * one account from the Cobalt/Onyx badlands, and sometimes it is a gem. The
 * lottery ticket is available to everyone; the repeatable edge is bought.
 *
 * The world is not stored at full fidelity. Three layers:
 *
 *   board — every Apex and Paragon account, ranked. Stored.
 *   pool  — a rotating sample of Ascendant and Onyx I "open files". Stored.
 *   deep  — sub-cutoff accounts, generated one at a time on demand.
 *
 * Everything under Cobalt is a number in a header, never an object.
 *
 * Design: docs/05-systems/ranked-ladder.md, orgs-and-season.md.
 */

import type { Rng } from '../rng/rng.js';
import { clamp, clamp100 } from '../util/math.js';
import { LADDER_TIERS, type LadderTier } from './ladder.js';

/** Onyx I — the floor of the visible ladder. Nothing below this is listed. */
export const SHOW_CUTOFF = 2525;
/** Cobalt floor — deep scouting draws from [DEEP_FLOOR, SHOW_CUTOFF). */
export const DEEP_FLOOR = 2050;

/** The bands the visible ladder is generated to. */
export type Band = 'onyxI' | 'ascendant' | 'paragon' | 'apex';
export const BANDS: readonly Band[] = ['onyxI', 'ascendant', 'paragon', 'apex'];

export interface BandDef {
  key: Band;
  /** Inclusive MMR floor. */
  floor: number;
  /** Exclusive MMR ceiling. */
  ceiling: number;
  /** Quality centre for players generated into this band. */
  qualityCenter: number;
  /** Extra potential these accounts carry — the top of the ladder is young talent. */
  potentialBonus: number;
  ageRange: [number, number];
  /** Roughly what share of a region's above-cutoff accounts sit here. */
  share: number;
  label: string;
}

export const BAND_DEFS: readonly BandDef[] = [
  { key: 'onyxI', floor: SHOW_CUTOFF, ceiling: 2600, qualityCenter: 66, potentialBonus: 0, ageRange: [16, 24], share: 0.62, label: 'Onyx I' },
  { key: 'ascendant', floor: 2600, ceiling: 2850, qualityCenter: 71, potentialBonus: 2, ageRange: [16, 24], share: 0.28, label: 'Ascendant' },
  { key: 'paragon', floor: 2850, ceiling: 3050, qualityCenter: 76, potentialBonus: 4, ageRange: [17, 25], share: 0.075, label: 'Paragon' },
  { key: 'apex', floor: 3050, ceiling: 3400, qualityCenter: 81, potentialBonus: 7, ageRange: [17, 26], share: 0.025, label: 'Apex' },
];

export const BAND_BY_KEY: Readonly<Record<Band, BandDef>> = Object.freeze(
  Object.fromEntries(BAND_DEFS.map((b) => [b.key, b])) as Record<Band, BandDef>,
);

/** Which band an MMR falls in, or null when it is below the visible cutoff. */
export function bandFromMmr(mmr: number): Band | null {
  if (mmr < SHOW_CUTOFF) return null;
  let out: Band = 'onyxI';
  for (const b of BAND_DEFS) if (mmr >= b.floor) out = b.key;
  return out;
}

/** Whether an account is elevated enough to appear on the public leaderboard. */
export function onBoard(mmr: number): boolean {
  return mmr >= BAND_BY_KEY.paragon.floor;
}

/** Whether an account appears anywhere the manager can see it. */
export function visible(mmr: number): boolean {
  return mmr >= SHOW_CUTOFF;
}

/**
 * Nominal accounts above the cutoff in a region. A percentile device for the
 * table header — never a storage figure. Deeper-talent regions have more.
 */
export function accountsAboveCutoff(talentDepth: number): number {
  return Math.round(5200 * clamp(talentDepth, 0.5, 2));
}

/** How many stored files a region gets, given the org's scouting reach. */
export const POOL_BASE = 240;
export function poolSlots(reach: 'home' | 'allied' | 'foreign', networkTier: 0 | 1 | 2 | 3): number {
  const reachMult = { home: 1, allied: 0.5, foreign: 0 }[reach];
  return Math.round(POOL_BASE * reachMult * (0.6 + 0.4 * (networkTier / 3)));
}

/** Analyst weeks a deep scout costs, against 1 for a normal scouting tick. */
export const DEEP_SCOUT_COST = 4;

/**
 * The chance a deep scout turns up a genuine prospect rather than a Cobalt
 * player who is simply a Cobalt player. An amateur hits about 18% of the
 * time; a well-networked org with a good analyst about 45%.
 */
export function deepScoutGemChance(networkTier: 0 | 1 | 2 | 3, analystScouting: number): number {
  return clamp(0.18 + 0.22 * (networkTier / 3) + 0.1 * ((clamp100(analystScouting) - 50) / 50), 0.1, 0.55);
}

/** A target MMR for one deep-scout draw: somewhere in the badlands. */
export function deepScoutTargetMmr(rng: Rng): number {
  return Math.round(rng.range(DEEP_FLOOR, SHOW_CUTOFF));
}

/**
 * How a region's stored ladder is apportioned across the bands. `board` holds
 * every Apex and Paragon account; `pool` is a sample of the two below.
 */
export function bandAllocation(boardSize: number, poolSize: number): Record<Band, number> {
  const apex = Math.max(1, Math.round(boardSize * 0.32));
  const paragon = Math.max(1, boardSize - apex);
  const ascendant = Math.max(1, Math.round(poolSize * 0.38));
  const onyxI = Math.max(1, poolSize - ascendant);
  return { apex, paragon, ascendant, onyxI };
}

/**
 * A contracted player's public ladder standing. Pros stay on the ladder — a
 * rival's star sliding down the board is the most interesting row on the
 * screen — and because a pro grinds far fewer solo games than a ladder
 * hopeful, they display well below their true steady MMR in season and spike
 * in the off-season. The mid-season leaderboard is full of teenagers and the
 * off-season one is full of pros, and both readings are true.
 */
export interface LadderStanding {
  mmr: number;
  tier: LadderTier;
  division: 1 | 2 | 3 | 4;
  peakMmr: number;
  gamesThisSeason: number;
  lastActiveWeek: number;
  /** Set only for accounts on the public board. */
  boardRank?: number;
}

/** Solo games a week, before the phase multiplier. */
export const SOLO_BASE = 6;

export type SeasonPhase = 'preseason' | 'regular' | 'playoffs' | 'offseason';

export const SOLO_PHASE_MULT: Readonly<Record<SeasonPhase, number>> = {
  preseason: 1.2,
  regular: 1,
  playoffs: 0.5,
  offseason: 1.8,
};

/** Weekly solo-queue volume for a contracted player. */
export function soloGamesPerWeek(workEthic: number, phase: SeasonPhase, contracted: boolean): number {
  const base = contracted ? SOLO_BASE : SOLO_BASE * 3.4;
  return Math.round(base * (0.7 + 0.6 * (clamp100(workEthic) / 100)) * SOLO_PHASE_MULT[phase]);
}

/**
 * Where a released player re-enters the ladder. Deliberately underranked: he
 * has been scrimming, not laddering, so his displayed MMR lags his real one
 * and the existing `smurf` predicate fires — honestly, for once.
 */
export function reentryMmr(lastLadderMmr: number, steadyMmr: number): number {
  return Math.round(0.55 * lastLadderMmr + 0.45 * steadyMmr);
}

/** The tier a band's floor sits in — used to colour band chips in the UI. */
export function tierOfBand(band: Band): LadderTier {
  const floor = BAND_BY_KEY[band].floor;
  let out = LADDER_TIERS[0]!.key;
  for (const t of LADDER_TIERS) if (floor >= t.floor) out = t.key;
  return out;
}
