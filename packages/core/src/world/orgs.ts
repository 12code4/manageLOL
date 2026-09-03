/**
 * Persistent organizations — the rivals that live across seasons.
 *
 * The design constraint that shapes this whole module: **legacy orgs are
 * genuinely stronger, but upsets always exist.** Those two pull in opposite
 * directions, and the resolution is that org stats never touch match
 * resolution directly. There is no "prestige buff" on team strength. A
 * hundred-year-old org beats a startup because it *has better players, a
 * better coach and a better prep room* — every one of which the startup can
 * buy, steal or develop. On any given Saturday the match is still decided by
 * the five players and the draft, so the logistic in `match/resolve.ts` gives
 * the underdog exactly the odds its roster earns.
 *
 * Prestige itself is two things added together:
 *
 *   standing — a fast EWMA of recent results. Win now, rise now.
 *   legacy   — slow accumulation from *time spent at a level*, plus title
 *              steps. This is the part that cannot be bought, only outlived.
 *
 * A twenty-season top-league dynasty lands around 80 prestige; a promoted
 * newcomer around 20. What that buys is off the pitch: cheaper contracts,
 * bigger sponsors, wider scouting. Design: docs/05-systems/orgs-and-season.md.
 */

import type { Rng } from '../rng/rng.js';
import { clamp, clamp100, round } from '../util/math.js';
import type { OrgIdentity, OrgPersonality } from '@managelol/data';
import { ORGS, ORG_NAME_PARTS } from '@managelol/data';

/** Pyramid level. 1 is the top league; 4 is the amateur floor. */
export type PyramidTier = 1 | 2 | 3 | 4;
export const TIERS: readonly PyramidTier[] = [1, 2, 3, 4];

/**
 * How much a season at each tier is worth to an org's legacy, and how much
 * standing a title there is worth. A dynasty is built in the top league; you
 * cannot farm the amateur circuit into prestige.
 */
export const TIER_WEIGHT: Readonly<Record<PyramidTier, number>> = { 1: 1, 2: 0.45, 3: 0.18, 4: 0.05 };

/** Legacy points a full season at tier 1 is worth before the soft cap bites. */
export const LEGACY_GAIN = 4.2;
/** Legacy bleeds this much a season, so a dormant giant fades over decades. */
export const LEGACY_DECAY = 0.35;
/** Standing moves this fraction of the way to its target each season. */
export const STANDING_RAMP = 0.34;

/** Infrastructure decays this much a season without reinvestment. */
export const FACILITY_DECAY = 1.1;

/**
 * Mutable org state. Identity fields are copied from the content pack (or
 * generated) at world creation so a save never depends on pack ordering.
 */
export interface Org {
  id: string;
  name: string;
  tag: string;
  region: string;
  personality: OrgPersonality;

  /** Season index the org entered the world. Seeded orgs start negative. */
  founded: number;
  /** Seasons completed as a competing org — the raw longevity counter. */
  seasons: number;

  /** 0..100. Slow, time-earned reputation. Cannot be bought. */
  legacy: number;
  /** 0..100. Fast, results-driven reputation. */
  standing: number;

  // Infrastructure — purchasable, decays without upkeep.
  /** 0..100. Training environment: development speed and chemistry ramp. */
  facilities: number;
  /** 0..100. Feeds `coachQuality` in the draft engine. */
  coaching: number;
  /** 0..100. Feeds `patchFamiliarity` — the prep room. */
  analytics: number;
  /** 0..100. How deep into the ladder their scouts can see. */
  scouting: number;

  /** 0..100. Drives sponsor income and merch. Compounds with prestige. */
  fanbase: number;
  /** Liquid funds, in credits. */
  cash: number;

  tier: PyramidTier;
  history: OrgHistory;
}

export interface OrgHistory {
  /** Titles won, by tier. */
  titles: Record<PyramidTier, number>;
  /** Best tier ever reached (lowest number). */
  bestTier: PyramidTier;
  /** Seasons spent at each tier. */
  seasonsAtTier: Record<PyramidTier, number>;
  /** Most recent finishes, newest first: { season, tier, place, of }. */
  finishes: SeasonFinish[];
}

export interface SeasonFinish {
  season: number;
  tier: PyramidTier;
  place: number;
  of: number;
}

/** The single 0..100 number the UI shows. Legacy is the durable third. */
export function prestige(org: Org): number {
  return clamp100(0.62 * org.standing + 0.38 * org.legacy);
}

/**
 * A one-line stature label for the org card. Deliberately coarse — the point
 * is to make "these people have been here forever" legible at a glance.
 */
export function statureLabel(org: Org): string {
  const p = prestige(org);
  if (p >= 82) return org.legacy >= 60 ? 'Dynasty' : 'Superpower';
  if (p >= 66) return org.legacy >= 45 ? 'Institution' : 'Contender';
  if (p >= 48) return 'Established';
  if (p >= 30) return org.seasons <= 3 ? 'Upstart' : 'Journeyman';
  return org.seasons <= 2 ? 'Newcomer' : 'Minnow';
}

/**
 * Org stats reach the simulation only through these four channels. Keeping
 * them in one function makes the "no hidden prestige buff" rule checkable:
 * nothing else in core may read an `Org` during match resolution.
 */
export interface OrgEffects {
  /** 0..100 into `draftSkill` / coach suggestions. */
  coachQuality: number;
  /** 0..100 into the draft's noise sigma. */
  patchFamiliarity: number;
  /** Multiplier on weekly chemistry ramp (0.85..1.25). */
  chemRampMult: number;
  /** Multiplier on weekly player development (0.55..1.45). */
  developmentMult: number;
}

export function orgEffects(org: Org): OrgEffects {
  const env = 0.55 * org.facilities + 0.45 * org.coaching;
  return {
    coachQuality: round(org.coaching, 1),
    patchFamiliarity: round(org.analytics, 1),
    chemRampMult: round(0.85 + 0.4 * (org.facilities / 100), 3),
    developmentMult: round(0.55 + 0.9 * (env / 100), 3),
  };
}

/**
 * The upset guarantee, made checkable. Even a maxed dynasty only reaches the
 * roster it can afford; the *direct* competitive edge its org stats confer,
 * holding players equal, is bounded by this many team-strength points.
 *
 * With MATCH_SCALE = 15 this caps the org-derived edge at roughly 57% odds —
 * a tilt, never a wall. Guarded by a test.
 */
export const MAX_ORG_EDGE_POINTS = 2.6;

/** The direct, players-held-equal edge one org's setup has over another's. */
export function orgEdgePoints(a: Org, b: Org): number {
  const ea = orgEffects(a);
  const eb = orgEffects(b);
  // Coaching and prep show up as a sharper draft; that is the whole of it.
  const draftEdge = (ea.coachQuality - eb.coachQuality) / 100 + (ea.patchFamiliarity - eb.patchFamiliarity) / 100;
  return clamp(draftEdge * (MAX_ORG_EDGE_POINTS / 2), -MAX_ORG_EDGE_POINTS, MAX_ORG_EDGE_POINTS);
}

// ────────────────────────────── creation ──────────────────────────────

export interface OrgSeedOpts {
  identity: OrgIdentity;
  tier: PyramidTier;
  /** Seasons of history to backfill. A pack org opens with a past. */
  seasonsOfHistory: number;
}

/**
 * Build an org that already has a past: a founding date in the negative
 * seasons, legacy accumulated at its historical tier, and a plausible title
 * count. This is what makes the world feel like it existed before you.
 */
export function seedOrg(rng: Rng, o: OrgSeedOpts): Org {
  const { identity, tier } = o;
  const seasons = Math.max(0, o.seasonsOfHistory);

  // Backfill legacy as though the org had spent those seasons around `tier`,
  // with a little drift so two same-tier orgs are not identical.
  let legacy = 0;
  const titles: Record<PyramidTier, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const seasonsAtTier: Record<PyramidTier, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let bestTier: PyramidTier = tier;
  for (let s = 0; s < seasons; s++) {
    // Historical tier wobbles by one around the current one.
    const drift = rng.chance(0.22) ? (rng.chance(0.5) ? -1 : 1) : 0;
    const t = clamp(tier + drift, 1, 4) as PyramidTier;
    seasonsAtTier[t]++;
    if (t < bestTier) bestTier = t;
    legacy = accrueLegacy(legacy, t);
    if (rng.chance(0.12 * TIER_WEIGHT[t] + 0.04)) titles[t]++;
  }

  const standing = clamp100(rng.gaussian(standingTarget(tier, 0.5), 7));
  const wealth = tierWealth(tier);
  const infra = (bias: number): number => clamp100(rng.gaussian(30 + 52 * (1 - (tier - 1) / 3) + bias, 9));
  const p = identity.personality;

  return {
    id: identity.id,
    name: identity.name,
    tag: identity.tag,
    region: identity.region as string,
    personality: p,
    founded: -seasons,
    seasons,
    legacy: round(legacy, 2),
    standing: round(standing, 2),
    facilities: infra(p === 'academy' ? 8 : 0),
    coaching: infra(p === 'methodical' ? 10 : p === 'chaotic' ? -8 : 0),
    analytics: infra(p === 'methodical' ? 12 : p === 'superteam' ? -4 : 0),
    scouting: infra(p === 'academy' ? 12 : p === 'superteam' ? -6 : 0),
    fanbase: clamp100(rng.gaussian(18 + 0.55 * legacy + 0.25 * standing, 8)),
    cash: round(wealth * rng.range(0.7, 1.4), 1),
    tier,
    history: { titles, bestTier, seasonsAtTier, finishes: [] },
  };
}

/** Typical liquid funds for an org at each tier, in credits. */
export function tierWealth(tier: PyramidTier): number {
  return { 1: 240, 2: 90, 3: 34, 4: 14 }[tier];
}

/** One season of legacy accrual at `tier`, with the soft cap folded in. */
export function accrueLegacy(legacy: number, tier: PyramidTier): number {
  const gain = LEGACY_GAIN * TIER_WEIGHT[tier];
  return clamp100(legacy + gain * (1 - legacy / 100) - LEGACY_DECAY);
}

/** Where standing wants to settle for a given tier and finishing position. */
export function standingTarget(tier: PyramidTier, placeFraction: number): number {
  // placeFraction: 0 = won it, 1 = finished last.
  const ceiling = { 1: 96, 2: 72, 3: 50, 4: 30 }[tier];
  const floor = { 1: 56, 2: 36, 3: 20, 4: 6 }[tier];
  return floor + (ceiling - floor) * (1 - clamp(placeFraction, 0, 1));
}

// ─────────────────────────── season transition ───────────────────────────

export interface SeasonOutcome {
  season: number;
  tier: PyramidTier;
  place: number;
  of: number;
  wonTitle: boolean;
  /** Prize money and revenue already netted of the wage bill. */
  netCash: number;
  /** Credits the org chose to sink into infrastructure this season. */
  investment: number;
}

/**
 * Advance one org by a season. Pure: returns a new org, mutates nothing.
 *
 * Growth is deliberately slow and bounded on every axis — a twenty-season
 * simulation must not produce a 100/100/100 monster, and a bad decade must
 * not delete an institution.
 */
export function advanceOrgSeason(org: Org, out: SeasonOutcome): Org {
  const placeFraction = out.of <= 1 ? 0 : (out.place - 1) / (out.of - 1);
  const target = standingTarget(out.tier, placeFraction);
  const standing = clamp100(org.standing + (target - org.standing) * STANDING_RAMP);

  let legacy = accrueLegacy(org.legacy, out.tier);
  if (out.wonTitle) legacy = clamp100(legacy + 3.4 * TIER_WEIGHT[out.tier] + 0.6);

  // Investment buys infrastructure with diminishing returns: the same credits
  // move a 30 much further than an 85.
  const spend = Math.max(0, out.investment);
  const lift = (v: number, share: number): number => {
    const room = 1 - v / 100;
    return clamp100(v + 9 * room * Math.sqrt(Math.max(0, (spend * share) / 40)) - FACILITY_DECAY);
  };

  const titles = { ...org.history.titles };
  if (out.wonTitle) titles[out.tier]++;
  const seasonsAtTier = { ...org.history.seasonsAtTier };
  seasonsAtTier[out.tier]++;

  const finish: SeasonFinish = { season: out.season, tier: out.tier, place: out.place, of: out.of };
  const finishes = [finish, ...org.history.finishes].slice(0, 24);

  const nextPrestige = 0.62 * standing + 0.38 * legacy;
  const fanbase = clamp100(
    org.fanbase + (nextPrestige - org.fanbase) * 0.22 + (out.wonTitle ? 4 : 0) - 0.6,
  );

  return {
    ...org,
    seasons: org.seasons + 1,
    standing: round(standing, 2),
    legacy: round(legacy, 2),
    facilities: round(lift(org.facilities, 0.34), 2),
    coaching: round(lift(org.coaching, 0.26), 2),
    analytics: round(lift(org.analytics, 0.22), 2),
    scouting: round(lift(org.scouting, 0.18), 2),
    fanbase: round(fanbase, 2),
    cash: round(org.cash + out.netCash - spend, 1),
    tier: out.tier,
    history: {
      titles,
      bestTier: Math.min(org.history.bestTier, out.tier) as PyramidTier,
      seasonsAtTier,
      finishes,
    },
  };
}

/**
 * How much an org chooses to reinvest, from its cash and personality. Ambitious
 * orgs overspend; stable ones bank a cushion. Bounded so nobody bankrupts
 * themselves on a training room.
 */
export function investmentBudget(org: Org): number {
  const rate: Record<OrgPersonality, number> = {
    superteam: 0.1,
    academy: 0.26,
    stable: 0.16,
    chaotic: 0.08,
    methodical: 0.24,
  };
  const reserve = tierWealth(org.tier) * 0.35;
  return round(Math.max(0, (org.cash - reserve) * rate[org.personality]), 1);
}

// ───────────────────────────── world population ─────────────────────────────

/**
 * An org that folded or was newly founded. Folding is rare and only ever
 * happens at the bottom of the pyramid, so the leagues stay populated.
 */
export function shouldFold(org: Org, rng: Rng): boolean {
  if (org.tier < 3) return false;
  if (org.cash > 0) return false;
  // Even broke, an org with history hangs on: someone always bails out a name.
  const survival = 0.35 + 0.6 * (org.legacy / 100);
  return !rng.chance(survival);
}

/**
 * Mint a brand-new org to replace a folded one or fill an expansion slot.
 * Names are drawn from the generated space, which provably cannot collide
 * with the handcrafted pack; `taken` guards against collisions with orgs
 * already generated this run.
 */
export function generateOrg(
  rng: Rng,
  opts: { id: string; region: string; tier: PyramidTier; season: number; taken: ReadonlySet<string> },
): Org {
  const { prefixes, suffixes, standalone, qualifiers } = ORG_NAME_PARTS;
  let name = '';
  for (let attempt = 0; attempt < 40; attempt++) {
    const stem = rng.chance(0.55) ? rng.pick(prefixes) + rng.pick(suffixes) : rng.pick(standalone);
    const q = rng.pick(qualifiers);
    const candidate = q === '' ? stem : `${stem} ${q}`;
    if (!opts.taken.has(candidate)) {
      name = candidate;
      break;
    }
  }
  if (name === '') name = `${rng.pick(standalone)} ${opts.id.toUpperCase()}`;

  const letters = name.replace(/[^A-Za-z]/g, '').toUpperCase();
  const tag = letters.slice(0, 3) || 'NEW';
  const personalities: OrgPersonality[] = ['superteam', 'academy', 'stable', 'chaotic', 'methodical'];

  return seedOrg(rng, {
    identity: {
      id: opts.id,
      name,
      tag,
      region: opts.region as OrgIdentity['region'],
      personality: rng.pick(personalities),
      blurb: 'A new name in the scene. No history, no habits, nothing to lose.',
    },
    tier: opts.tier,
    seasonsOfHistory: 0,
  });
}

/** Names already in use by the content pack — generated orgs must avoid these. */
export function packNames(): Set<string> {
  return new Set(ORGS.map((o) => o.name));
}
