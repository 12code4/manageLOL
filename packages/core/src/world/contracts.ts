/**
 * Contracts, wages and the transfer market — the second currency.
 *
 * Sporting merit gets you into a league; money keeps you there. This module
 * is what turns a roster from a collection of numbers into a set of ongoing
 * commitments: every player costs credits every week, every contract runs
 * out, and the moment one gets short, rival orgs come asking.
 *
 * The wage curve is exponential in ability on purpose. Ability is roughly
 * normal, so a linear wage would make superteams trivially affordable; an
 * exponential one means the last five ability points cost as much as the
 * first thirty. That is the thing that stops you buying a title, and it is
 * what makes developing a prospect — cheap now, elite later — the smart play
 * rather than the sentimental one.
 *
 * Prestige is the discount. A player takes materially less to sign for an
 * institution than for a nobody, which is precisely how legacy orgs convert
 * history into strength without ever touching match resolution.
 *
 * Design: docs/05-systems/sponsorships-and-economy.md, orgs-and-season.md.
 */

import type { Rng } from '../rng/rng.js';
import { clamp, clamp100, round } from '../util/math.js';
import { currentAbility } from '../players/ratings.js';
import type { Player, Role } from '../players/types.js';
import { prestige, type Org, type PyramidTier } from './orgs.js';

/** Weekly wage, in credits, of a replacement-level (ability 50) player. */
export const WAGE_BASE = 0.22;
/** Each point of ability multiplies the wage by this. */
export const WAGE_CURVE = 1.068;
/** Weeks in a standard contract term. */
export const SEASON_WEEKS = 40;

export interface Contract {
  playerId: string;
  orgId: string;
  /** Credits per week. */
  wage: number;
  weeksRemaining: number;
  signedSeason: number;
  /** Credits another org must pay to break the deal early. 0 = no clause. */
  buyout: number;
  /** The seat the player was signed for. */
  role: Role;
}

/** Wage expectations scale with the level a player is being asked to play at. */
export function tierWageMult(tier: PyramidTier): number {
  return { 1: 1.25, 2: 1, 3: 0.8, 4: 0.65 }[tier];
}

/**
 * What a player expects to be paid, in credits per week.
 *
 * The potential premium is what makes a prospect cost more than their current
 * ability says — but because the curve is exponential in *ability*, a 55/92
 * teenager is still an order of magnitude cheaper than the 88 he might become.
 * That gap is the entire business case for developing your own.
 */
export function wageDemand(player: Player, tier: PyramidTier, orgPrestige: number): number {
  const ca = currentAbility(player.attributes);
  const g = player.attributes.growth;
  const age = player.identity.age;

  const potentialPremium = Math.min(1.4, 1 + 0.011 * Math.max(0, g.potential - ca));
  const ageFactor = age >= g.declineStartAge ? 0.85 : age <= 18 ? 0.92 : 1;
  // A big name is worth a real pay cut; a nobody has to overpay.
  const prestigeDiscount = clamp(1.12 - 0.0022 * clamp100(orgPrestige), 0.9, 1.15);
  const star = 1 + 0.0025 * player.attributes.brand.starPower;

  const raw =
    WAGE_BASE *
    Math.pow(WAGE_CURVE, ca - 50) *
    potentialPremium *
    ageFactor *
    tierWageMult(tier) *
    prestigeDiscount *
    star;
  return round(Math.max(0.05, raw), 3);
}

/** The standard release clause an org writes into a deal it is happy with. */
export function defaultBuyout(wage: number, weeks: number): number {
  return round(wage * weeks * 1.8 + wage * 12, 1);
}

// ─────────────────────────────── negotiation ───────────────────────────────

export interface Offer {
  wage: number;
  weeks: number;
  /** 0..1 — how certain the player is of starting. 1 = guaranteed seat. */
  starterChance: number;
  /** True when the player's current org is the one offering. */
  renewal: boolean;
}

export interface OfferVerdict {
  accepted: boolean;
  /** 0..1 how appealing the package is; 0.72 is the acceptance line. */
  utility: number;
  /** The single biggest reason, for the UI to show. */
  reason: string;
}

/** The line an offer must clear. */
export const ACCEPT_THRESHOLD = 0.72;

/**
 * Whether a player takes a deal. Money dominates but never decides alone: an
 * ambitious player will take less to join a contender, a loyal one re-signs
 * below market, and nobody signs to sit on a bench for a bad team.
 */
export function evaluateOffer(player: Player, org: Org, offer: Offer, tier: PyramidTier): OfferVerdict {
  const p = player.attributes.personality;
  const pres = prestige(org);
  const demand = wageDemand(player, tier, pres);
  const wageRatio = clamp(offer.wage / Math.max(0.01, demand), 0, 1.6);

  const ambitionWeight = 0.4 + 0.6 * (p.ambition / 100);
  const prestigePull = ambitionWeight * (pres / 100);
  const seat = clamp(offer.starterChance, 0, 1);
  const loyalty = offer.renewal ? p.loyalty / 100 : 0;
  // A long deal is security to a journeyman and a cage to a rising star.
  const lengthFit = offer.weeks >= SEASON_WEEKS * 2 ? (p.ambition > 70 ? -0.03 : 0.04) : 0;

  const utility = clamp(
    0.48 * wageRatio + 0.22 * prestigePull + 0.2 * seat + 0.1 * loyalty + lengthFit,
    0,
    1.6,
  );

  let reason: string;
  if (wageRatio < 0.8) reason = 'the money is short';
  else if (seat < 0.5) reason = 'no guarantee of a starting seat';
  else if (prestigePull < 0.2 && p.ambition > 65) reason = 'the project is not ambitious enough';
  else if (utility >= ACCEPT_THRESHOLD) reason = offer.renewal ? 'happy to stay' : 'a step up';
  else reason = 'not convinced';

  return { accepted: utility >= ACCEPT_THRESHOLD, utility: round(utility, 3), reason };
}

/**
 * The wage an org should offer to have a good chance of being accepted —
 * the inverse of `evaluateOffer` in the money term, solved directly so the AI
 * never has to search.
 */
export function offerToAccept(player: Player, org: Org, tier: PyramidTier, starterChance: number, renewal: boolean): number {
  const p = player.attributes.personality;
  const pres = prestige(org);
  const demand = wageDemand(player, tier, pres);
  const nonWage =
    0.22 * (0.4 + 0.6 * (p.ambition / 100)) * (pres / 100) +
    0.2 * clamp(starterChance, 0, 1) +
    0.1 * (renewal ? p.loyalty / 100 : 0);
  const neededRatio = clamp((ACCEPT_THRESHOLD - nonWage) / 0.48, 0, 1.6);
  return round(demand * neededRatio * 1.02, 3);
}

// ─────────────────────────────── the wage bill ───────────────────────────────

/** Credits an org pays its squad every week. */
export function wageBill(contracts: readonly Contract[]): number {
  return round(contracts.reduce((s, c) => s + c.wage, 0), 3);
}

/**
 * How many weeks of wages the org can still cover. Negative cash is already
 * insolvency; this is the runway warning the inbox uses before that.
 */
export function runwayWeeks(org: Org, contracts: readonly Contract[], weeklyIncome: number): number {
  const net = weeklyIncome - wageBill(contracts);
  if (net >= 0) return Infinity;
  return Math.max(0, Math.floor(org.cash / -net));
}

export type FinancialState = 'healthy' | 'tight' | 'critical' | 'insolvent';

export function financialState(org: Org, contracts: readonly Contract[], weeklyIncome: number): FinancialState {
  if (org.cash < 0) return 'insolvent';
  const runway = runwayWeeks(org, contracts, weeklyIncome);
  if (runway === Infinity) return 'healthy';
  if (runway > SEASON_WEEKS / 2) return 'tight';
  return 'critical';
}

// ──────────────────────────────── the market ────────────────────────────────

/** How much an org wants a given player, 0..1. Zero means no interest at all. */
export function bidInterest(
  org: Org,
  player: Player,
  opts: { incumbentAbility: number; tier: PyramidTier; budgetPerWeek: number },
): number {
  const ca = currentAbility(player.attributes);
  const upgrade = (ca - opts.incumbentAbility) / 20; // +1.0 for a 20-point upgrade
  if (upgrade <= 0 && org.personality !== 'academy') return 0;

  const wage = wageDemand(player, opts.tier, prestige(org));
  if (wage > opts.budgetPerWeek) return 0;

  const youth = Math.max(0, player.attributes.growth.potential - ca) / 40;
  const taste: Record<Org['personality'], { now: number; later: number }> = {
    superteam: { now: 1.15, later: 0.35 },
    academy: { now: 0.5, later: 1.3 },
    stable: { now: 0.9, later: 0.8 },
    chaotic: { now: 1, later: 0.9 },
    methodical: { now: 0.85, later: 1 },
  };
  const t = taste[org.personality];
  const affordability = clamp(1 - wage / Math.max(0.01, opts.budgetPerWeek), 0, 1);

  return round(clamp(t.now * clamp(upgrade, 0, 1.4) * 0.6 + t.later * clamp(youth, 0, 1) * 0.4 + 0.15 * affordability, 0, 1), 3);
}

export interface Bid {
  orgId: string;
  playerId: string;
  /** Weekly wage offered. */
  wage: number;
  weeks: number;
  /** Credits offered to the selling org, if the player is under contract. */
  fee: number;
  interest: number;
}

/**
 * Resolve a set of competing bids for one player. Deterministic: bids are
 * sorted by what the player actually values, then by org id — never by the
 * order the bids happen to arrive in.
 */
export function resolveBids(
  player: Player,
  bids: readonly Bid[],
  orgs: Readonly<Record<string, Org>>,
  tier: PyramidTier,
): Bid | null {
  const scored = bids
    .map((b) => {
      const org = orgs[b.orgId];
      if (!org) return null;
      const verdict = evaluateOffer(player, org, {
        wage: b.wage,
        weeks: b.weeks,
        starterChance: 0.85,
        renewal: false,
      }, tier);
      return verdict.accepted ? { bid: b, utility: verdict.utility } : null;
    })
    .filter((x): x is { bid: Bid; utility: number } => x !== null);

  if (scored.length === 0) return null;
  scored.sort((a, b) => {
    if (b.utility !== a.utility) return b.utility - a.utility;
    return a.bid.orgId < b.bid.orgId ? -1 : a.bid.orgId > b.bid.orgId ? 1 : 0;
  });
  return scored[0]!.bid;
}

/**
 * Whether a rival comes knocking this week. Short contracts and star quality
 * attract attention; a long deal is protection. Never silent — the caller
 * turns a true here into an inbox item the manager can answer.
 */
export function attractsApproach(contract: Contract, player: Player, rng: Rng): boolean {
  const ca = currentAbility(player.attributes);
  if (ca < 55) return false;
  const shortDeal = contract.weeksRemaining <= SEASON_WEEKS / 2;
  const quality = clamp((ca - 55) / 40, 0, 1);
  const base = shortDeal ? 0.05 : 0.012;
  return rng.chance(base * (0.4 + quality));
}

/**
 * Tick every contract down a week and return the ones that expired *this*
 * week. An already-expired deal is left alone, so a caller that has not yet
 * dealt with a free agent never sees the same expiry twice.
 */
export function tickContracts(contracts: Contract[]): Contract[] {
  const expired: Contract[] = [];
  for (const c of contracts) {
    if (c.weeksRemaining <= 0) continue;
    c.weeksRemaining--;
    if (c.weeksRemaining <= 0) expired.push(c);
  }
  return expired;
}
