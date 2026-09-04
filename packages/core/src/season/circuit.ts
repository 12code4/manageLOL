/**
 * The Open — amateur competition, and the road into the pyramid.
 *
 * A career does not begin with a league seat. It begins with five players, a
 * hundred credits and nothing else: no fixtures, no table, no reputation, and
 * no revenue except what you can win. The Open is where that team proves
 * itself — a rolling circuit of entry-fee tournaments anyone can enter — and
 * it is the only way in for an org that has not bought its way there.
 *
 * Three rungs, each gated by reputation you can only earn on the rung below:
 *
 *   Weekend Open   — every match week. Cheap, small, relentless. The grind.
 *   Contenders Cup — monthly. Real money, real fields, a real name to make.
 *   The Gateway    — twice a year. The prize is a seat in the pyramid.
 *
 * The gate is reputation, and reputation is deliberately hard to farm. Every
 * rung has a ceiling and gains shrink as you approach it, and the ceilings are
 * set so each rung carries you to the *next* door and no further: win every
 * weekend open forever and you plateau at 18, which opens the Cup and will
 * never open the Gateway. You cannot grind the bottom of the circuit into a
 * league seat. You have to keep climbing, and each rung asks a better team.
 *
 * Everything here is pure. Brackets come from `bracket.ts`, results from
 * whatever resolver the caller supplies, so one implementation serves both
 * the tournament the manager plays and the twenty they do not.
 *
 * Design: docs/05-systems/competition-pyramid.md §0–3, orgs-and-season.md.
 */

import { clamp, round } from '../util/math.js';
import type { PyramidTier } from '../world/orgs.js';

export type Rung = 'weekend' | 'contenders' | 'gateway';
export const RUNGS: readonly Rung[] = ['weekend', 'contenders', 'gateway'];

/** Where a competitor finished, coarse enough to pay out and cheap to derive. */
export type Placement = 'winner' | 'finalist' | 'semi' | 'quarter' | 'entered';
export const PLACEMENTS: readonly Placement[] = ['winner', 'finalist', 'semi', 'quarter', 'entered'];

export interface CircuitEvent {
  id: Rung;
  name: string;
  /** Credits to enter. The cost that makes a bad run actually hurt. */
  entryFee: number;
  fieldSize: number;
  /** Series length for every round except the final. */
  bestOf: 1 | 3 | 5;
  /** The final is longer — a title should not turn on one game. */
  finalBestOf: 1 | 3 | 5;
  /** Reputation required to enter at all. */
  repGate: number;
  /** Reputation ceiling this rung can carry you to. */
  repCap: number;
  /** Credits by placement, in PLACEMENTS order. */
  purse: Readonly<Record<Placement, number>>;
  /** Circuit points by placement — the Open's season-long table. */
  points: Readonly<Record<Placement, number>>;
  /** Reputation before the diminishing-returns factor, by placement. */
  repBase: Readonly<Record<Placement, number>>;
  /**
   * The absolute weeks of the year this event runs.
   *
   * Explicit, never derived. A previous version ran the Cup "every fourth
   * match week", which meant deriving an index from the split's match weeks —
   * and every playoff and promotion week is a match week that is *not* in that
   * list, so the index came back −1, got clamped to 0, and 0 % 4 === 0 fired a
   * Cup on all eight of them. Fourteen Cups a season instead of six, and the
   * whole climb collapsed. A list cannot do that.
   */
  fixedWeeks: readonly number[];
  blurb: string;
}

/**
 * The three rungs.
 *
 * The purses look generous next to a 1.5-credit weekly wage bill, and they
 * have to be: an unaffiliated org draws no league revenue, so tournaments are
 * not pocket money, they are the whole income. A team that never wins should
 * bleed out inside a season and a half.
 *
 * Every rung pays out more than its entrants put in. An amateur circuit that
 * skimmed its own field would be a closed loop that can only shrink, and the
 * scene would quietly starve; somebody with a venue and a banner is covering
 * the difference, which is exactly how amateur scenes actually work.
 */
export const CIRCUIT: readonly CircuitEvent[] = [
  {
    id: 'weekend',
    name: 'Weekend Open',
    entryFee: 1,
    fieldSize: 8,
    bestOf: 1,
    finalBestOf: 3,
    repGate: 0,
    repCap: 18,
    purse: { winner: 6, finalist: 2.5, semi: 1, quarter: 0.4, entered: 0 },
    points: { winner: 100, finalist: 60, semi: 35, quarter: 18, entered: 6 },
    repBase: { winner: 3, finalist: 1.6, semi: 0.8, quarter: 0.35, entered: 0.1 },
    fixedWeeks: [3, 4, 5, 6, 7, 8, 9, 10, 11, 20, 21, 22, 23, 24, 25, 26, 27, 28],
    blurb: 'Eight teams, one Saturday, one game a round. Everyone starts here.',
  },
  {
    id: 'contenders',
    name: 'Contenders Cup',
    entryFee: 3,
    fieldSize: 16,
    bestOf: 1,
    finalBestOf: 3,
    repGate: 12,
    repCap: 38,
    purse: { winner: 22, finalist: 10, semi: 4.5, quarter: 2, entered: 0 },
    points: { winner: 260, finalist: 150, semi: 85, quarter: 42, entered: 12 },
    repBase: { winner: 10, finalist: 5.5, semi: 2.6, quarter: 1.2, entered: 0.35 },
    fixedWeeks: [6, 11, 17, 23, 28, 34],
    blurb: 'Sixteen teams and a month of bragging rights. Where a name gets made.',
  },
  {
    id: 'gateway',
    name: 'The Gateway',
    entryFee: 5,
    fieldSize: 16,
    bestOf: 3,
    finalBestOf: 5,
    repGate: 36,
    repCap: 68,
    purse: { winner: 40, finalist: 18, semi: 8, quarter: 3, entered: 0 },
    points: { winner: 500, finalist: 300, semi: 170, quarter: 85, entered: 25 },
    repBase: { winner: 13, finalist: 7, semi: 3.5, quarter: 1.5, entered: 0.4 },
    fixedWeeks: [19, 42],
    blurb: 'Sixteen teams. The winner takes a seat in the Regional Circuit.',
  },
];

export const EVENT_BY_RUNG: Readonly<Record<Rung, CircuitEvent>> = Object.freeze(
  Object.fromEntries(CIRCUIT.map((e) => [e.id, e])) as Record<Rung, CircuitEvent>,
);

/** The tier a Gateway win buys into. */
export const GATEWAY_PRIZE_TIER: PyramidTier = 3;

/**
 * Reputation earned for a placement, with the diminishing factor that stops a
 * rung being farmed past its ceiling. At the cap the gain is zero; halfway
 * there it is halved. This is what forces the climb — twenty weekend opens
 * cannot substitute for one Cup run.
 */
export function repGain(event: CircuitEvent, place: Placement, currentRep: number): number {
  const headroom = clamp(1 - currentRep / event.repCap, 0, 1);
  return round(event.repBase[place] * headroom, 3);
}

/** Whether an org may enter, and if not, why. */
export interface EntryCheck {
  allowed: boolean;
  reason: 'ok' | 'reputation' | 'money' | 'roster';
  /** How much more reputation is needed. 0 when the gate is clear. */
  repShort: number;
}

export function canEnter(
  event: CircuitEvent,
  opts: { reputation: number; cash: number; rosterFilled: boolean },
): EntryCheck {
  if (!opts.rosterFilled) return { allowed: false, reason: 'roster', repShort: 0 };
  if (opts.reputation < event.repGate) {
    return { allowed: false, reason: 'reputation', repShort: round(event.repGate - opts.reputation, 1) };
  }
  if (opts.cash < event.entryFee) return { allowed: false, reason: 'money', repShort: 0 };
  return { allowed: true, reason: 'ok', repShort: 0 };
}

/**
 * The next rung a given reputation has yet to unlock, for the progress meter.
 * Null once everything is open — at which point the goal is the seat itself.
 */
export function nextUnlock(reputation: number): { event: CircuitEvent; short: number } | null {
  for (const e of CIRCUIT) {
    if (reputation < e.repGate) return { event: e, short: round(e.repGate - reputation, 1) };
  }
  return null;
}

/**
 * Which rungs run in a given week of the year. Best rung first: when two land
 * on the same week the bigger one is the story, and the choice between a safe
 * Weekend Open and a costly Cup is a real one.
 */
export function eventsInWeek(week: number): CircuitEvent[] {
  return CIRCUIT.filter((e) => e.fixedWeeks.includes(week))
    .sort((a, b) => CIRCUIT.indexOf(b) - CIRCUIT.indexOf(a));
}

/**
 * Placement from a bracket finish. `rounds` is the bracket depth, `exitRound`
 * the round the org lost in (or `rounds` + 1 if they won it).
 */
export function placementOf(rounds: number, exitRound: number, won: boolean): Placement {
  if (won) return 'winner';
  const fromEnd = rounds - exitRound;
  if (fromEnd === 0) return 'finalist';
  if (fromEnd === 1) return 'semi';
  if (fromEnd === 2) return 'quarter';
  return 'entered';
}

/** What one org walks away with. */
export interface CircuitReward {
  cash: number;
  points: number;
  reputation: number;
}

export function rewardFor(event: CircuitEvent, place: Placement, currentRep: number): CircuitReward {
  return {
    cash: round(event.purse[place] - event.entryFee, 2),
    points: event.points[place],
    reputation: repGain(event, place, currentRep),
  };
}

// ───────────────────────────── buying a seat ─────────────────────────────

/**
 * The other door. When a club folds its seat has to go somewhere, and an
 * ambitious amateur org with money is exactly who wants it. Reputation still
 * gates it — the league will not sell to a complete unknown — but this is the
 * path for a manager who built a bank instead of a trophy cabinet.
 */
export const SEAT_BUY_IN_COST = 140;
export const SEAT_BUY_IN_REP = 20;

export interface SeatOffer {
  /** The tier of the vacated seat. */
  tier: PyramidTier;
  /** The club whose collapse created the vacancy, for the inbox line. */
  vacatedBy: string;
  cost: number;
  repRequired: number;
  /** The week the offer expires. */
  expiresWeek: number;
}

export function seatOfferFor(tier: PyramidTier, vacatedBy: string, week: number): SeatOffer {
  // A seat higher up the pyramid is worth more, and is a bigger reach.
  const mult = { 1: 4, 2: 2.2, 3: 1, 4: 1 }[tier];
  return {
    tier,
    vacatedBy,
    cost: round(SEAT_BUY_IN_COST * mult, 0),
    repRequired: round(SEAT_BUY_IN_REP * mult, 0),
    expiresWeek: week + 3,
  };
}

export function canBuySeat(offer: SeatOffer, opts: { reputation: number; cash: number }): EntryCheck {
  if (opts.reputation < offer.repRequired) {
    return { allowed: false, reason: 'reputation', repShort: round(offer.repRequired - opts.reputation, 1) };
  }
  if (opts.cash < offer.cost) return { allowed: false, reason: 'money', repShort: 0 };
  return { allowed: true, reason: 'ok', repShort: 0 };
}

// ─────────────────────────── the unaffiliated band ───────────────────────────

/**
 * Weekly credits an org with no league seat brings in on its own: streams, a
 * local sponsor, a bit of merch. Deliberately not enough to live on — an
 * unaffiliated org that never wins is dying, slowly, and can see it happening.
 */
export const GRASSROOTS_STIPEND = 0.5;

/** Amateur players cost amateur money. Below tier 4's 0.5. */
export const OPEN_WAGE_MULT = 0.4;

/**
 * Quality centre for the floating pool's rosters.
 *
 * High, because The Open's clubs sign off exactly the same Onyx-I-and-above
 * ladder the manager does — an amateur scene full of 50-rated players would be
 * a fiction, and a pushover besides. But below every league tier, because what
 * an amateur club cannot do is *pay*: on a grassroots stipend it fields the
 * cheap end of that ladder and keeps nobody who develops.
 *
 * It had been set above tier 3, which made winning the Gateway a promotion
 * into weaker competition — the prize of the entire climb was a walkover.
 */
export const OPEN_QUALITY_CENTRE = 60;
