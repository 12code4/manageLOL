/**
 * Rivalries — the faces on the road up.
 *
 * The pyramid is full of persistent, named clubs, but a table of strangers is
 * not a rivalry. A rivalry is *memory*: the club you keep drawing in the
 * quarter-finals, the one that knocked you out of your first Gateway, the peer
 * amateur grinding the same circuit a rung ahead of you. Without it The Open
 * is a treadmill of interchangeable opponents — you beat "someone" and move on
 * — which is exactly the part of the early game a design pass flagged as
 * flattest.
 *
 * This module is that memory, and nothing more. It records who a manager has
 * played and how it went, weighs a final heavier than a Tuesday, reads back
 * the club a career has come to be defined against, and — once, at the start —
 * picks the one peer rival the whole climb is measured against.
 *
 * Pure and deterministic, like everything in core. The only randomness is the
 * single seeded pick of a rival, and it draws from a named stream in a sorted
 * order so the same `(candidates, seed)` always names the same rival.
 *
 * Design: docs/05-systems/orgs-and-season.md (rivalry), competition-pyramid.md.
 */

import { round } from '../util/math.js';
import type { Rng } from '../rng/rng.js';
import type { OrgPersonality } from '@managelol/data';

/** One club's complete record against the manager, on the circuit and above. */
export interface HeadToHead {
  /** The opponent's org id. */
  opponent: string;
  /** Series played against them. */
  met: number;
  won: number;
  lost: number;
  lastSeason: number;
  lastWeek: number;
  /** Whether the most recent meeting was a win — for "avenged"/"again" lines. */
  lastWon: boolean;
  /**
   * Weighted meetings. A Gateway final adds far more than a weekend first
   * round, so the club you keep meeting *when it matters* rises to the top of
   * the ledger even if another club you farm on Saturdays has more games.
   */
  intensity: number;
}

/** Every head-to-head a manager holds, keyed by opponent id. */
export type Ledger = Record<string, HeadToHead>;

/** Enough about a meeting to weigh it and to write a line about it. */
export interface MeetingContext {
  season: number;
  week: number;
  /** Weight toward rivalry intensity — see {@link meetingWeight}. */
  weight: number;
}

/**
 * How much a single series weighs toward a rivalry. The more that was on the
 * line, the more the meeting sticks: a Gateway final — the seat itself — is the
 * heaviest thing on the circuit, a weekend opener the lightest.
 */
export function meetingWeight(opts: {
  rung?: 'weekend' | 'contenders' | 'gateway';
  /** The last series of its bracket. */
  isFinal?: boolean;
  /** A seat or a division place changed hands on this one. */
  seatOnLine?: boolean;
}): number {
  let w = opts.rung === 'gateway' ? 2.2 : opts.rung === 'contenders' ? 1.5 : 1;
  if (opts.isFinal) w *= 1.8;
  if (opts.seatOnLine) w *= 1.6;
  return round(w, 2);
}

const EMPTY = (opponent: string): HeadToHead => ({
  opponent,
  met: 0,
  won: 0,
  lost: 0,
  lastSeason: 0,
  lastWeek: 0,
  lastWon: false,
  intensity: 0,
});

/**
 * Fold one series result into a head-to-head. Pure: returns a new record and
 * leaves its input untouched, so a caller can keep the prior state for a
 * "you trailed them before this" line if it wants one.
 */
export function recordMeeting(
  prev: HeadToHead | undefined,
  opponent: string,
  won: boolean,
  ctx: MeetingContext,
): HeadToHead {
  const base = prev ?? EMPTY(opponent);
  return {
    opponent,
    met: base.met + 1,
    won: base.won + (won ? 1 : 0),
    lost: base.lost + (won ? 0 : 1),
    lastSeason: ctx.season,
    lastWeek: ctx.week,
    lastWon: won,
    intensity: round(base.intensity + ctx.weight, 2),
  };
}

/**
 * The club a career has come to be defined against: the heaviest history,
 * then — level on weight — the most games, then a stable id. Null before the
 * manager has played anyone.
 */
export function nemesisOf(ledger: Ledger): HeadToHead | null {
  const all = Object.keys(ledger)
    .sort()
    .map((k) => ledger[k])
    .filter((h): h is HeadToHead => !!h && h.met > 0);
  if (!all.length) return null;
  return all.reduce((best, h) => {
    if (h.intensity !== best.intensity) return h.intensity > best.intensity ? h : best;
    if (h.met !== best.met) return h.met > best.met ? h : best;
    return h.opponent < best.opponent ? h : best;
  });
}

/** "3–1 up", "2–2 level", "1–3 down", or "first meeting". */
export function recordLabel(h: HeadToHead | undefined): string {
  if (!h || h.met === 0) return 'first meeting';
  const score = h.won + '–' + h.lost;
  if (h.won > h.lost) return score + ' up';
  if (h.won < h.lost) return score + ' down';
  return score + ' level';
}

/**
 * A line for the results feed when a meeting has history behind it. Null on a
 * first meeting — a grudge needs a past — and null when there is nothing worth
 * saying. Presentation lives in the UI; this is only the *sentence*, because it
 * is derived purely from the ledger and is worth pinning in tests.
 */
export function grudgeLine(prev: HeadToHead | undefined, oppName: string, won: boolean): string | null {
  if (!prev || prev.met === 0) return null; // no history yet — not a grudge
  if (won) {
    if (prev.lost > prev.won) return 'Revenge on ' + oppName + ' — they had the better of you at ' + prev.won + '–' + prev.lost + '.';
    if (!prev.lastWon) return 'You bounce back against ' + oppName + '.';
    return 'You have ' + oppName + "'s number now — that is " + (prev.won + 1) + '.';
  }
  if (prev.won > prev.lost) return oppName + ' finally get one back on you.';
  if (prev.lastWon) return oppName + ' return the favour.';
  return oppName + ' knock you out again — ' + (prev.lost + 1) + ' times now.';
}

// ─────────────────────────── the one rival ───────────────────────────

/** What the picker needs to know about a possible rival. */
export interface RivalCandidate {
  id: string;
  /** Standing/prestige on the same scale the manager carries. */
  prestige: number;
  personality: OrgPersonality;
}

/** Personalities that grow talent the way a manager climbing from nothing must. */
const CLIMBERS: ReadonlySet<OrgPersonality> = new Set<OrgPersonality>(['academy', 'methodical']);

/**
 * The one club a career is set against from its first week — a peer, not a
 * powerhouse: close in standing so it is a fair fight, and tilted toward a
 * developer (an academy or methodical side) that climbs on grown talent the
 * way the manager has to, so the race up the circuit has a face and not just a
 * points column.
 *
 * Deterministic: candidates are ordered by id before a single seeded stream is
 * drawn, so the wobble that keeps the pick from always landing on the same
 * archetype is itself reproducible.
 */
export function pickRival(candidates: readonly RivalCandidate[], youPrestige: number, rng: Rng): string | null {
  const ordered = candidates.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (!ordered.length) return null;
  const scored = ordered.map((c) => {
    const closeness = 1 - Math.min(1, Math.abs(c.prestige - youPrestige) / 30);
    const climber = CLIMBERS.has(c.personality) ? 1 : 0;
    const jitter = rng.float() * 0.15; // seeded wobble, consumed in id order
    return { id: c.id, score: closeness * 0.7 + climber * 0.2 + jitter };
  });
  scored.sort((a, b) => (a.score !== b.score ? b.score - a.score : a.id < b.id ? -1 : 1));
  return scored[0]!.id;
}
