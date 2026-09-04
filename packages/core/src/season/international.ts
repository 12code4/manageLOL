/**
 * The international stage — the roof of the world.
 *
 * The whole game is named for a climb "from nothing to the world
 * championships", but the pyramid stopped at the top of a single region: win
 * your league and the season simply ended. This is the summit that was
 * missing. Twice a year the regions send their best to meet:
 *
 *   The Crucible — mid-season. Champions only, a short sharp tournament.
 *   Worlds       — the end of the year. The one that writes legacies.
 *
 * A career reaches it the honest way — by climbing to tier 1 and finishing
 * high enough to be one of the home region's seeds. Until then it is a
 * spectator event, and not a throwaway one: your region is represented by its
 * *real* champion (the club that won your league — perhaps a rival you watched
 * climb), and how they fare against the world is the measure of how far you
 * still have to go.
 *
 * The rest of the world is not simulated club-by-club — that would be a second
 * pyramid per region. Instead each foreign region fields champions drawn from
 * its own character: Kyorin's proving ground forges the most complete teams,
 * Meridia's tacticians out-draft everyone, Vantia is all brand and folds on the
 * international stage, the Wilds swing wildest and occasionally burn a giant
 * down. Region identity is not a strength number — it is *how* a team wins.
 *
 * Pure and deterministic. Brackets come from `bracket.ts`, series from
 * `fast.ts`; this module supplies the field, the seeding, and the stakes.
 *
 * Design: docs/05-systems/orgs-and-season.md §15, calendar.ts (weeks 16–18, 36–40).
 */

import { clamp, round } from '../util/math.js';
import type { Rng } from '../rng/rng.js';
import { REGION_BY_ID, type RegionId } from '@managelol/data';
import type { FastSide } from './fast.js';
import type { Placement } from './circuit.js';

export type IntlEventId = 'crucible' | 'worlds';

/** What one placing is worth to the org that earned it. */
export interface IntlReward {
  /** Prize money, in credits. */
  cash: number;
  /** Legacy — the slow, sticky number that builds dynasties. Worlds is where it moves. */
  legacy: number;
  /** Standing (drives prestige immediately). */
  standing: number;
  /** Championship points, for the season-long international table. */
  points: number;
}

export interface IntlEvent {
  id: IntlEventId;
  name: string;
  short: string;
  fieldSize: number;
  /** Series length for every round except the final. */
  bestOf: 1 | 3 | 5;
  finalBestOf: 1 | 3 | 5;
  /** How many *real* teams the home region sends — the manager's way in. */
  homeSlots: number;
  /** The absolute weeks of the year the event occupies. Explicit, never derived. */
  fixedWeeks: readonly number[];
  reward: Readonly<Record<Placement, IntlReward>>;
  blurb: string;
}

export const INTL_EVENTS: readonly IntlEvent[] = [
  {
    id: 'crucible',
    name: 'The Crucible',
    short: 'Crucible',
    fieldSize: 6,
    bestOf: 3,
    finalBestOf: 5,
    homeSlots: 2,
    fixedWeeks: [16, 17, 18],
    reward: {
      winner: { cash: 45, legacy: 8, standing: 14, points: 200 },
      finalist: { cash: 20, legacy: 4, standing: 7, points: 110 },
      semi: { cash: 9, legacy: 2, standing: 3, points: 60 },
      quarter: { cash: 4, legacy: 1, standing: 1.5, points: 30 },
      entered: { cash: 2, legacy: 0.5, standing: 0.7, points: 12 },
    },
    blurb: 'Mid-season. Every region sends its champion. A trophy, and a read on the field before Worlds.',
  },
  {
    id: 'worlds',
    name: 'Worlds',
    short: 'Worlds',
    fieldSize: 16,
    bestOf: 3,
    finalBestOf: 5,
    homeSlots: 3,
    fixedWeeks: [36, 37, 38, 39, 40],
    reward: {
      winner: { cash: 120, legacy: 22, standing: 30, points: 500 },
      finalist: { cash: 60, legacy: 12, standing: 16, points: 300 },
      semi: { cash: 30, legacy: 7, standing: 9, points: 170 },
      quarter: { cash: 14, legacy: 3, standing: 4, points: 85 },
      entered: { cash: 6, legacy: 1, standing: 1.5, points: 25 },
    },
    blurb: 'The mountaintop. Sixteen teams, five regions, one trophy. This is the one they remember you for.',
  },
];

export const INTL_BY_ID: Readonly<Record<IntlEventId, IntlEvent>> = Object.freeze(
  Object.fromEntries(INTL_EVENTS.map((e) => [e.id, e])) as Record<IntlEventId, IntlEvent>,
);

/** The player's home region — the one the pyramid is actually simulated in. */
export const HOME_REGION: RegionId = 'mer';
/** The foreign regions, strongest-narrative first, in a fixed order. */
export const FOREIGN_REGIONS: readonly RegionId[] = ['kyo', 'tia', 'van', 'wilds'];

/**
 * International over/under-performance — the story on top of raw talent and
 * money. Kyorin's proving ground overperforms; Vantia, forever importing stars
 * and forever falling short abroad, underperforms; the Wilds punch below their
 * paper weight but (see the swing below) swing the widest.
 */
const INTL_EDGE: Readonly<Record<RegionId, number>> = { kyo: 0.12, tia: 0.0, mer: 0.0, van: -0.1, wilds: -0.05 };
/** How much a region's champion strength varies year to year. The Wilds most. */
const SWING_SIGMA: Readonly<Record<RegionId, number>> = { kyo: 3, tia: 3.5, mer: 3, van: 3.5, wilds: 6 };

/** A region's international power, from its talent depth, its wealth, and its record. */
export function regionPower(region: RegionId): number {
  const r = REGION_BY_ID[region];
  return round(0.72 * r.talentDepth + 0.28 * r.wealth + INTL_EDGE[region], 3);
}

/**
 * The strength centre of a region's champion: the top of the tier-1 range for
 * the strong regions (~85), the middle of it for the weak (~74). A home-region
 * team good enough to win its league sits at 76–84, so Worlds is a real
 * mountain — you need the top of tier 1 *and* a bit of variance to take it.
 */
export function regionChampionCentre(region: RegionId): number {
  return round(62 + 15 * regionPower(region), 1);
}

/**
 * This year's champion strength for a region: the centre plus a seeded swing.
 * Widest in the Wilds, where a single prodigy can drag a no-name roster into
 * the giants — and, some years, get bought the week after.
 */
export function regionChampionStrength(region: RegionId, rng: Rng): number {
  return clamp(round(regionChampionCentre(region) + rng.gaussian(0, SWING_SIGMA[region]), 1), 66, 93);
}

/**
 * A foreign champion as a `FastSide` the shared resolver understands. The
 * region shows through in *how* it wins, not just how strong it is: Meridian
 * tacticians out-draft the field, Kyorin is relentless and never beats itself,
 * Vantia is streaky, and the Wilds are a coin-flip that can catch anyone.
 */
export function foreignChampionSide(id: string, region: RegionId, strength: number): FastSide {
  const bias = REGION_BY_ID[region].attrBias;
  const b = (k: string): number => bias[k] ?? 0;
  return {
    orgId: id,
    strength,
    drafting: clamp(76 + b('shotcalling') + b('rotations') / 2 + b('adaptability') / 2, 40, 95),
    metaFit: clamp((b('adaptability') - 2) / 6, -2, 2),
    consistency: clamp(78 + b('consistency'), 45, 92),
  };
}

/** How many of an event's non-home seats each foreign region fills, best regions more. */
export function foreignAllocation(event: IntlEvent): Record<RegionId, number> {
  const seats = event.fieldSize - event.homeSlots;
  // Rank foreign regions by power, hand out one seat at a time to the strongest
  // remaining — a deterministic largest-remainder split, floored at one each so
  // no region is shut out of Worlds entirely.
  const alloc: Record<string, number> = {};
  FOREIGN_REGIONS.forEach((r) => (alloc[r] = 0));
  const order = FOREIGN_REGIONS.slice().sort((a, b) => {
    const d = regionPower(b) - regionPower(a);
    return Math.abs(d) > 1e-9 ? d : a < b ? -1 : 1;
  });
  for (let i = 0; i < seats; i++) alloc[order[i % order.length]!]! += 1;
  return alloc as Record<RegionId, number>;
}

/** One competitor in an international field, before the bracket is drawn. */
export interface IntlEntrant {
  id: string;
  region: RegionId;
  /** True for a real club from the home pyramid (possibly the manager). */
  home: boolean;
  side: FastSide;
  seedStrength: number;
}

/**
 * Seed a field: strongest first, so the bracket protects the best teams and a
 * weak qualifier draws a giant early — exactly as it should be. Stable: ties
 * break on id, never on array order.
 */
export function seedInternational(entrants: readonly IntlEntrant[]): IntlEntrant[] {
  return entrants.slice().sort((a, b) => {
    if (Math.abs(b.seedStrength - a.seedStrength) > 1e-9) return b.seedStrength - a.seedStrength;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** What a placing pays. Mirrors the circuit's shape; the numbers are far bigger. */
export function intlReward(event: IntlEvent, place: Placement): IntlReward {
  return event.reward[place];
}
