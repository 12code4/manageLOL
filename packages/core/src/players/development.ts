/**
 * Player development — the wiggle room.
 *
 * The brief this module exists to satisfy: signing from below the elite tier
 * has to be a real path, not a consolation prize. A seventeen-year-old you
 * pull out of Onyx must be able to become the best player in the world — but
 * only if you put them somewhere that grows them, and only over years.
 *
 * Three things make that true and keep it honest:
 *
 *  1. **Headroom, not rank, sets the ceiling.** Growth is driven by the gap
 *     between current ability and hidden potential. A Challenger grinder at
 *     his ceiling improves at a crawl; a Diamond kid 30 points under his
 *     grows fast. Rank is what you can see; headroom is what you bought.
 *  2. **Environment is the multiplier you control.** A great org's facilities,
 *     coaching, a starting seat and veteran teammates roughly double the rate
 *     of a player left grinding solo queue. That gap is the whole reason to
 *     sign a prospect early rather than wait for them to prove it.
 *  3. **Time is the cost.** The rate is tuned so an elite prospect in an
 *     elite org gains ~11-13 ability a season. Going from a raw 55 to a
 *     world-beating 90 is four or five seasons of commitment — a storyline,
 *     not a purchase.
 *
 * What grows also shifts with age: mechanics come early and go first, game
 * knowledge keeps compounding into a player's late twenties, and the mental
 * attributes are the last to arrive. That is why a declining veteran can
 * still be the best shotcaller in the league.
 *
 * Design: docs/05-systems/players-and-attributes.md §7, orgs-and-season.md.
 */

import type { Rng } from '../rng/rng.js';
import { clamp, clamp100, round } from '../util/math.js';
import { currentAbility } from './ratings.js';
import type { Player, PlayerAttributes } from './types.js';

/** Ability points a week at the reference conditions, before every modifier. */
export const DEV_BASE = 0.085;

/** Headroom (potential − CA) at which growth runs at full speed. */
export const FULL_SPEED_HEADROOM = 22;

/** Where a player sits in the world, for development purposes. */
export interface DevContext {
  /**
   * 0..100 training environment. For a signed player this is the org's
   * facilities/coaching blend; an unsigned ladder grinder gets LADDER_ENV.
   */
  environment: number;
  /** 0..100 competitive playing time: 100 starter, ~45 substitute, ~25 solo only. */
  playingTime: number;
  /** 0..100 mentorship available from older teammates. 0 when unsigned. */
  mentorship: number;
  /** 0..1 how well the team is doing. Winning teaches faster than losing. */
  success: number;
  /** Playing outside the primary role slows everything down. */
  offRole: boolean;
}

/** The training environment of solo queue: nobody is coaching you. */
export const LADDER_ENV = 22;
/** Competitive minutes a pure ladder grinder gets. */
export const LADDER_PLAYTIME = 25;

/** The context for a player who belongs to no org. */
export function ladderContext(): DevContext {
  return { environment: LADDER_ENV, playingTime: LADDER_PLAYTIME, mentorship: 0, success: 0.5, offRole: false };
}

/** How hard the player pushes themselves: 0..100 from their own attributes. */
export function driveScore(a: PlayerAttributes): number {
  const g = a.growth;
  return clamp100(0.45 * g.growthRate + 0.3 * g.learningRate + 0.25 * g.workEthic);
}

/** How much the world around them helps: 0..100. */
export function supportScore(ctx: DevContext): number {
  return clamp100(0.5 * ctx.environment + 0.3 * ctx.playingTime + 0.2 * ctx.mentorship);
}

/**
 * Age curve for *growth*. Full speed in the mid-teens, falling away
 * quadratically to nothing at the player's personal peak age.
 */
export function ageGrowthMult(age: number, peakAge: number): number {
  const span = Math.max(1, peakAge - 16);
  const t = clamp((age - 16) / span, 0, 1);
  return clamp(1.32 * (1 - t * t), 0.04, 1.32);
}

/** How the week's gain is split across the three attribute families. */
export interface GrowthMix {
  mechanical: number;
  knowledge: number;
  mental: number;
}

export function growthMix(age: number): GrowthMix {
  if (age < 21) return { mechanical: 0.45, knowledge: 0.35, mental: 0.2 };
  if (age < 25) return { mechanical: 0.3, knowledge: 0.45, mental: 0.25 };
  return { mechanical: 0.1, knowledge: 0.55, mental: 0.35 };
}

/**
 * CA-weight of a uniform +1 across each family. Raising every mechanical
 * attribute by 1 moves CA by 0.44 (0.34 for the average plus the 0.10
 * teamfighting term); knowledge by 0.34; mental by 0.22. Used to convert a
 * desired ability delta into attribute increments.
 */
const FAMILY_CA_WEIGHT: GrowthMix = { mechanical: 0.44, knowledge: 0.34, mental: 0.22 };

export interface DevWeek {
  /** Signed ability points this week: positive is growth, negative decline. */
  delta: number;
  /** True when this week rolled a breakout leap. */
  leap: boolean;
  /** True when the player is past their decline age and losing ability. */
  declining: boolean;
}

/**
 * One week of development, as a number. Pure — apply it with `applyDevelopment`.
 */
export function developWeek(player: Player, ctx: DevContext, rng: Rng): DevWeek {
  const a = player.attributes;
  const g = a.growth;
  const age = player.identity.age;
  const ca = currentAbility(a);
  const declining = age >= g.declineStartAge;

  if (declining) {
    const yearsPast = age - g.declineStartAge;
    const rate = (0.0055 * (g.declineRate / 50)) * (1 + 0.45 * yearsPast);
    // Losing a game is not linear: a hard worker holds it together longer.
    const resist = 0.75 + 0.5 * (1 - g.workEthic / 100);
    return { delta: round(-rate * resist, 4), leap: false, declining: true };
  }

  const headroom = clamp((g.potential - ca) / FULL_SPEED_HEADROOM, 0, 1.15);
  if (headroom <= 0) return { delta: 0, leap: false, declining: false };

  const drive = 0.45 + 1.1 * (driveScore(a) / 100);
  const support = 0.45 + 1.1 * (supportScore(ctx) / 100);
  const successMult = 0.88 + 0.24 * clamp(ctx.success, 0, 1);
  const roleMult = ctx.offRole ? 0.85 : 1;

  let delta = DEV_BASE * headroom * ageGrowthMult(age, g.peakAge) * drive * support * successMult * roleMult;

  // A breakout week: rare, weighted to young players with real headroom, and
  // to those who are being pushed. This is what a "breakout split" is made of.
  const leapChance = age < 22 ? 0.018 * headroom * (supportScore(ctx) / 100) : 0;
  const leap = leapChance > 0 && rng.chance(leapChance);
  if (leap) delta *= 3.2;

  return { delta: round(delta, 4), leap, declining: false };
}

/** Every attribute path development may touch, grouped by family. */
const MECH_KEYS = ['mechanics', 'laning', 'teamfighting', 'reflexes', 'positioning'] as const;
const KNOW_KEYS = [
  'mapAwareness', 'waveManagement', 'objectiveControl',
  'visionControl', 'rotations', 'adaptability', 'shotcalling',
] as const;
const MENTAL_KEYS = ['composure', 'consistency', 'focus', 'clutch', 'tiltResistance'] as const;

/**
 * Apply a week's ability delta to the player's attributes, in place.
 *
 * Gains are spread across a family with a little per-attribute jitter, so two
 * players with the same numbers do not develop into the same player. Nothing
 * may exceed the player's own ceiling: an attribute stops at potential + 6,
 * which is what stops a 60-potential grinder from quietly becoming elite.
 * Decline eats mechanics first, weighted by `mechanicalDeclineBias`.
 */
export function applyDevelopment(player: Player, week: DevWeek, rng: Rng): void {
  if (week.delta === 0) return;
  const a = player.attributes;
  const age = player.identity.age;
  const ceiling = clamp100(a.growth.potential + 6);

  const mix = week.declining ? declineMix(a.growth.mechanicalDeclineBias) : growthMix(age);
  const bump = (obj: Record<string, number>, keys: readonly string[], familyDelta: number): void => {
    if (familyDelta === 0) return;
    for (const k of keys) {
      const cur = obj[k];
      if (cur === undefined) continue;
      const jitter = 0.7 + 0.6 * rng.float();
      const next = cur + familyDelta * jitter;
      obj[k] = week.delta > 0 ? Math.min(clamp100(next), ceiling) : clamp100(next);
    }
  };

  bump(a.mechanical as unknown as Record<string, number>, MECH_KEYS, (week.delta * mix.mechanical) / FAMILY_CA_WEIGHT.mechanical);
  bump(a.gameKnowledge as unknown as Record<string, number>, KNOW_KEYS, (week.delta * mix.knowledge) / FAMILY_CA_WEIGHT.knowledge);
  bump(a.mental as unknown as Record<string, number>, MENTAL_KEYS, (week.delta * mix.mental) / FAMILY_CA_WEIGHT.mental);
}

/**
 * Decline is not uniform. Reflexes and mechanics go first; game knowledge
 * often keeps *rising* well into a veteran's decline, which is why old
 * shotcallers stay valuable. `bias` 0..100 is how mechanically fragile the
 * player is.
 */
export function declineMix(bias: number): GrowthMix {
  const mech = 0.75 + 0.25 * (bias / 100);
  return { mechanical: mech, knowledge: -0.18, mental: -0.05 };
}

/**
 * The chance a player hangs it up at the end of a season.
 *
 * Without this the world never turns over: rosters age a year every season
 * and nothing replaces them, so a decade in you are watching forty-year-olds.
 * Careers here are short by design — a pro is old at 25 and rare past 30 —
 * and a player whose ability has already gone walks sooner than one still
 * holding a starting seat.
 */
export function retirementChance(player: Player): number {
  const age = player.identity.age;
  if (age < 24) return 0;
  const ca = currentAbility(player.attributes);
  // The slide starts gently and steepens; nobody plays past the late thirties.
  const base = clamp(0.06 + 0.14 * (age - 24), 0, 1);
  // Still good enough to start? You get another year. Washed? You do not.
  const quality = clamp((ca - 55) / 40, 0, 1);
  const professional = player.attributes.personality.professionalism / 100;
  return clamp(base * (1.35 - 0.55 * quality) * (1.1 - 0.2 * professional), 0, 1);
}

/** Whether this player retires now, drawn from the given stream. */
export function retiresNow(player: Player, rng: Rng): boolean {
  return rng.chance(retirementChance(player));
}

/**
 * Run a whole season of development in one call — used for background players
 * the UI never watches week by week. `weeks` defaults to a competitive season.
 */
export function developSeason(
  player: Player,
  ctx: DevContext,
  rng: Rng,
  weeks = 40,
): { gained: number; leaps: number } {
  const before = currentAbility(player.attributes);
  let leaps = 0;
  for (let w = 0; w < weeks; w++) {
    const week = developWeek(player, ctx, rng);
    if (week.leap) leaps++;
    applyDevelopment(player, week, rng);
  }
  player.identity.age = round(player.identity.age + weeks / 52, 2);
  return { gained: round(currentAbility(player.attributes) - before, 2), leaps };
}
