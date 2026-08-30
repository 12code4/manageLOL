/**
 * Test-only fixtures. Not exported from the package index; used by unit tests
 * and by callers that need a deterministic, fully-populated player without
 * running worldgen.
 */

import type { ChampionId, PlayerId } from '../util/ids.js';
import { ARCHETYPES, type Archetype, type Player, type PlayerAttributes, type Role, type RegionId, type LanguageId } from './types.js';

/** Build a complete PlayerAttributes with every numeric attribute at `fill`. */
export function flatAttributes(
  fill = 50,
  overrides: Partial<{
    primaryRole: Role;
    secondaryRole: Role;
    preferredArchetype: Archetype;
    peakAge: number;
    declineStartAge: number;
  }> = {},
): PlayerAttributes {
  const champ = Object.fromEntries(ARCHETYPES.map((x) => [x, fill])) as Record<Archetype, number>;
  return {
    mechanical: { mechanics: fill, laning: fill, teamfighting: fill, reflexes: fill, positioning: fill },
    gameKnowledge: {
      mapAwareness: fill, waveManagement: fill, objectiveControl: fill, visionControl: fill,
      rotations: fill, adaptability: fill, shotcalling: fill,
    },
    mental: { composure: fill, consistency: fill, focus: fill, clutch: fill, tiltResistance: fill },
    roleAptitude: {
      primaryRole: overrides.primaryRole ?? 'mid',
      secondaryRole: overrides.secondaryRole ?? 'top',
      top: fill, jungle: fill, mid: fill, bot: fill, support: fill, roleFlexibility: fill,
    },
    championAptitude: champ,
    growth: {
      potential: fill, growthRate: fill, peakAge: overrides.peakAge ?? 22,
      declineStartAge: overrides.declineStartAge ?? 26, declineRate: fill,
      mechanicalDeclineBias: 1, learningRate: fill, workEthic: fill, burnoutProneness: fill,
    },
    personality: { ambition: fill, loyalty: fill, professionalism: fill },
    chemistry: {
      communication: fill, leadership: fill, ego: fill, temperament: fill, coachability: fill,
      introversion: fill, mentorship: fill, teamplayOrientation: fill,
      playstyleAggression: fill, playstyleTempo: fill, playstyleRiskTaking: fill,
      preferredArchetype: overrides.preferredArchetype ?? 'scalingCarry',
    },
    brand: { starPower: fill, streamAppeal: fill, fanbase: fill, marketability: fill, mediaHandling: fill },
  };
}

export function makeTestPlayer(over: Partial<{
  id: string;
  name: string;
  age: number;
  fill: number;
  attributes: PlayerAttributes;
}> = {}): Player {
  return {
    id: (over.id ?? 'plr_test01') as PlayerId,
    identity: {
      name: over.name ?? 'Test Player',
      age: over.age ?? 20,
      nationality: 'meridia' as RegionId,
      residencyRegion: 'meridia' as RegionId,
      languageIds: ['common'] as LanguageId[],
    },
    attributes: over.attributes ?? flatAttributes(over.fill ?? 50),
    state: { form: 50, fatigue: 0, morale: 50, sharpness: 100 },
    championPool: {} as Record<ChampionId, number>,
  };
}
