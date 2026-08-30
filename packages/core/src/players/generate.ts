/**
 * Procedural player generation.
 *
 * Rolls a full, correlated attribute vector for one player from a region's flavor
 * biases and a target quality center. Correlations the taxonomy requires (§12)
 * are enforced here: `potential ≥ CA`, `peakAge < declineStartAge`, reflexes
 * skewed toward youth. Everything is drawn from a passed-in seeded `Rng`, so a
 * world's population is fully reproducible.
 */

import { REGION_BY_ID, type RegionDef, type RegionId as DataRegionId } from '@managelol/data';
import type { Rng } from '../rng/rng.js';
import { clamp100 } from '../util/math.js';
import type { PlayerId } from '../util/ids.js';
import { currentAbility } from './ratings.js';
import { ARCHETYPES, ROLES, type Archetype, type LanguageId, type Player, type PlayerAttributes, type RegionId, type Role } from './types.js';

/** Plausible champion archetypes each role drafts, for shaping aptitudes/pool. */
const ROLE_ARCHETYPES: Record<Role, Archetype[]> = {
  top: ['tankEngage', 'skirmisher', 'splitPush', 'controlMage'],
  jungle: ['earlyJungle', 'skirmisher', 'assassin', 'tankEngage', 'catcher'],
  mid: ['assassin', 'controlMage', 'scalingCarry', 'poke', 'laneBully'],
  bot: ['scalingCarry', 'laneBully', 'poke'],
  support: ['enchanter', 'catcher', 'tankEngage'],
};

export interface GenerateOpts {
  id: PlayerId;
  region: DataRegionId;
  /** Target current-ability center (~42 amateur, ~70 league starter, ~85 star). */
  qualityCenter: number;
  /** Inclusive age range to draw from. Default 16–27. */
  ageRange?: [number, number];
  primaryRole?: Role;
  /** Attribute spread (sd). Default 8. */
  spread?: number;
}

function biased(rng: Rng, center: number, bias: number, spread: number): number {
  return clamp100(rng.gaussian(center + bias, spread));
}

/** Generate a fictional handle from a region's syllable pools. */
export function generateHandle(rng: Rng, region: RegionDef): string {
  const { onsets, nuclei, codas } = region.handle;
  const syl = (): string => rng.pick(onsets) + rng.pick(nuclei) + rng.pick(codas);
  let h = syl();
  if (rng.chance(0.35)) h += rng.pick(nuclei) + rng.pick(codas);
  // Normalize: capitalize first letter, cap length.
  h = h.charAt(0).toUpperCase() + h.slice(1).toLowerCase();
  return h.slice(0, 10);
}

export function generatePlayer(rng: Rng, opts: GenerateOpts): Player {
  const region = REGION_BY_ID[opts.region];
  const bias = region.attrBias;
  const c = opts.qualityCenter;
  const sd = opts.spread ?? 8;
  const b = (key: string): number => biased(rng, c, bias[key] ?? 0, sd);

  const [ageLo, ageHi] = opts.ageRange ?? [16, 27];
  const age = rng.int(ageLo, ageHi);

  const primaryRole = opts.primaryRole ?? rng.pick(ROLES);

  // --- role aptitudes: off-roles clustered lower, primary guaranteed the best ---
  const roleApt: Record<Role, number> = { top: 0, jungle: 0, mid: 0, bot: 0, support: 0 };
  for (const r of ROLES) {
    if (r !== primaryRole) roleApt[r] = clamp100(rng.gaussian(c - 18, 12));
  }
  const bestOffRole = Math.max(...ROLES.filter((r) => r !== primaryRole).map((r) => roleApt[r]));
  // Primary sits clearly above the best off-role (their defining strength).
  roleApt[primaryRole] = clamp100(Math.max(biased(rng, c + 12, 0, 6), bestOffRole + rng.range(2, 8)));
  // secondary = best non-primary aptitude
  const secondaryRole = ROLES
    .filter((r) => r !== primaryRole)
    .sort((x, y) => roleApt[y] - roleApt[x])[0]!;

  // --- champion aptitudes: role-appropriate archetypes lifted, one preferred spike ---
  const preferredArchetype = rng.pick(ROLE_ARCHETYPES[primaryRole]);
  const championAptitude = Object.fromEntries(
    ARCHETYPES.map((arch) => {
      let v = rng.gaussian(c - 8, 10);
      if (ROLE_ARCHETYPES[primaryRole].includes(arch)) v += 12;
      if (arch === preferredArchetype) v += 10;
      return [arch, clamp100(v)];
    }),
  ) as Record<Archetype, number>;

  // --- growth / aging (correlated) ---
  const peakAge = rng.int(20, 24);
  const declineStartAge = peakAge + rng.int(1, 4);
  const growthRate = clamp100(rng.gaussian(60, 15));
  // Ceiling gap: younger players carry more upside; veterans sit near their CA.
  const yearsToPeak = Math.max(0, peakAge - age);
  const gapMean = yearsToPeak * 2.2 + (bias['potential'] ?? 0);
  const growth = {
    potential: 0, // set after CA is known
    growthRate,
    peakAge,
    declineStartAge,
    declineRate: clamp100(rng.gaussian(50, 15)),
    mechanicalDeclineBias: Math.max(0.3, rng.gaussian(1.1, 0.35)),
    learningRate: clamp100(rng.gaussian(58, 15)),
    workEthic: b('workEthic'),
    burnoutProneness: clamp100(rng.gaussian(45, 18)),
  };

  // reflexes skew with youth (decline first): +/- around the base by distance from peak
  const reflexYouth = clamp100((peakAge - age) * 1.3);
  const attributes: PlayerAttributes = {
    mechanical: {
      mechanics: b('mechanics'),
      laning: b('laning'),
      teamfighting: b('teamfighting'),
      reflexes: clamp100(biased(rng, c, bias['reflexes'] ?? 0, sd) + reflexYouth - 4),
      positioning: b('positioning'),
    },
    gameKnowledge: {
      mapAwareness: b('mapAwareness'),
      waveManagement: b('waveManagement'),
      objectiveControl: b('objectiveControl'),
      visionControl: b('visionControl'),
      rotations: b('rotations'),
      adaptability: b('adaptability'),
      shotcalling: b('shotcalling'),
    },
    mental: {
      composure: b('composure'),
      consistency: b('consistency'),
      focus: b('focus'),
      clutch: clamp100(rng.gaussian(50, 18)),
      tiltResistance: clamp100(rng.gaussian(52, 16)),
    },
    roleAptitude: {
      primaryRole,
      secondaryRole,
      top: roleApt.top, jungle: roleApt.jungle, mid: roleApt.mid, bot: roleApt.bot, support: roleApt.support,
      roleFlexibility: clamp100(rng.gaussian(45, 18)),
    },
    championAptitude,
    growth,
    personality: {
      ambition: b('ambition'),
      loyalty: clamp100(rng.gaussian(50, 20)),
      professionalism: b('professionalism'),
    },
    chemistry: {
      communication: b('communication'),
      leadership: clamp100(rng.gaussian(45, 18)),
      ego: clamp100(rng.gaussian(45, 18) + (bias['ego'] ?? 0)),
      temperament: clamp100(rng.gaussian(50, 20)),
      coachability: clamp100(rng.gaussian(55, 18)),
      introversion: clamp100(rng.gaussian(52, 20)),
      mentorship: clamp100(rng.gaussian(40, 18) + Math.max(0, age - 22) * 2),
      teamplayOrientation: clamp100(rng.gaussian(52, 18)),
      playstyleAggression: b('playstyleAggression'),
      playstyleTempo: clamp100(rng.gaussian(50, 20)),
      playstyleRiskTaking: b('playstyleRiskTaking'),
      preferredArchetype,
    },
    brand: {
      starPower: clamp100(rng.gaussian(30, 15) + (bias['starPower'] ?? 0)),
      streamAppeal: b('streamAppeal'),
      fanbase: clamp100(rng.gaussian(25, 15) + (bias['fanbase'] ?? 0)),
      marketability: b('marketability'),
      mediaHandling: b('mediaHandling'),
    },
  };

  // potential = ceiling ≥ current ability
  const ca = currentAbility(attributes);
  attributes.growth.potential = clamp100(Math.max(ca + 1, ca + rng.gaussian(gapMean, 6)));

  // languages: native primary; likely 'common' as lingua franca for playing abroad
  const languageIds: LanguageId[] = [region.languages[0]!] as LanguageId[];
  if (region.languages[0] !== 'common' && rng.chance(0.7)) languageIds.push('common' as LanguageId);
  if (region.languages.length > 2 && rng.chance(0.3)) {
    languageIds.push(region.languages[1]! as LanguageId);
  }

  return {
    id: opts.id,
    identity: {
      name: generateHandle(rng, region),
      age,
      nationality: region.id as unknown as RegionId,
      residencyRegion: region.id as unknown as RegionId,
      languageIds,
    },
    attributes,
    state: {
      form: Math.round(rng.gaussian(50, 8)),
      fatigue: Math.round(clamp100(rng.gaussian(15, 10))),
      morale: Math.round(clamp100(rng.gaussian(58, 12))),
      sharpness: Math.round(clamp100(rng.gaussian(70, 15))),
    },
    championPool: {},
  };
}
