/**
 * Champion pool seeding — how much of each champion a player can already pilot.
 *
 * Proficiency is bounded above by the archetype-aptitude ceiling (taxonomy §5).
 * At worldgen a player knows their in-role champions best, their secondary
 * role's somewhat, and everything else barely; a spike lands on champions of
 * their preferred archetype. Growth toward the ceiling happens in play.
 */

import type { Champion } from '@managelol/data';
import type { Rng } from '../rng/rng.js';
import type { ChampionId } from '../util/ids.js';
import { clamp100, round } from '../util/math.js';
import { proficiencyCeiling } from './ratings.js';
import type { Archetype, Player } from './types.js';

export function seedChampionPool(player: Player, champions: readonly Champion[], rng: Rng): void {
  const ra = player.attributes.roleAptitude;
  const learning = player.attributes.growth.learningRate / 100;
  const preferred = player.attributes.chemistry.preferredArchetype;
  for (const c of champions) {
    const ceiling = proficiencyCeiling(
      player.attributes.championAptitude,
      c.styleTags as Partial<Record<Archetype, number>>,
    );
    let frac: number;
    if (c.roles.includes(ra.primaryRole)) frac = 0.45 + 0.5 * rng.float() * (0.6 + 0.4 * learning);
    else if (c.roles.includes(ra.secondaryRole)) frac = 0.3 + 0.3 * rng.float();
    else frac = 0.15 + 0.2 * rng.float();
    if ((c.styleTags[preferred] ?? 0) >= 0.5) frac = Math.min(1, frac + 0.15);
    player.championPool[c.id as ChampionId] = round(clamp100(ceiling * frac), 0);
  }
}

/** Proficiency on a champion; unknown champions read as 20 (can be forced, badly). */
export function proficiency(player: Player, champId: string): number {
  return player.championPool[champId as ChampionId] ?? 20;
}
