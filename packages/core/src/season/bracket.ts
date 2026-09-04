/**
 * Playoff brackets and the promotion gauntlet.
 *
 * A league table decides who is good. A bracket decides who gets the trophy,
 * and the gap between those two is most of what a season is about — the
 * regular season you can grind, the bracket you have to win.
 *
 * Single elimination with byes at every tier. It is the format that makes a
 * top seed's reward legible (you skip a round), keeps the series count small
 * enough that a manager plays all of them (5 at tier 1, 3 at tier 2, 7 at
 * tier 3), and needs one builder rather than a feed graph per format. Double
 * elimination is the better *sport* and is the obvious later upgrade; it is
 * nine series and eight feed edges, and it can wait.
 *
 * Seeding is the standard recursive bracket order, so the top two seeds can
 * only meet in the final and the bracket is balanced at every round. Byes go
 * to the highest seeds, which is the whole point of finishing first.
 *
 * Nothing here resolves a match. `playBracket` takes a resolver, so the same
 * bracket serves the fast path for leagues the player is not in and the full
 * match-day takeover for the one they are.
 */

import type { Rng } from '../rng/rng.js';

export interface BracketMatch {
  id: string;
  round: number;
  /** Filled once both feeders resolve. Null means "waiting". */
  a: string | null;
  b: string | null;
  /** Seeds, for display and for the tiebreak on an equal bracket. */
  seedA: number;
  seedB: number;
  winner: string | null;
  score: [number, number] | null;
  /** The match this one's winner flows into, and which slot it lands in. */
  feedsInto: string | null;
  feedsSlot: 'a' | 'b';
}

export interface Bracket {
  /** Teams in seed order, best first. */
  teams: string[];
  bestOf: 1 | 3 | 5;
  matches: BracketMatch[];
  champion: string | null;
  rounds: number;
}

/**
 * Standard bracket seeding for a field of `size` (a power of two): the
 * positions, in order, that seeds occupy so 1 and 2 meet only in the final.
 * Built by reflection — [1,2] → [1,4,3,2] → [1,8,5,4,3,6,7,2] — which is the
 * property that keeps every round balanced.
 */
export function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    const next: number[] = [];
    for (const s of order) {
      next.push(s);
      next.push(n + 1 - s);
    }
    order = next;
  }
  return order;
}

/** The smallest power of two that holds `n`. */
export function bracketSize(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Build a single-elimination bracket. `teams` must already be in seed order,
 * best first — pass the standings.
 *
 * Byes are resolved at construction: a first-round pairing against an absent
 * seed is not created as a match at all, and its team is placed directly into
 * the round-two slot it would have reached. So the match list contains only
 * series that will actually be played — exactly `teams.length - 1` of them.
 */
export function buildBracket(teams: readonly string[], bestOf: 1 | 3 | 5): Bracket {
  const n = teams.length;
  if (n < 2) {
    return { teams: [...teams], bestOf, matches: [], champion: teams[0] ?? null, rounds: 0 };
  }
  const size = bracketSize(n);
  const rounds = Math.log2(size);
  const order = seedOrder(size);
  /** Seed (1-based) → org id, or null when that seed is a bye. */
  const teamOfSeed = (seed: number): string | null => teams[seed - 1] ?? null;

  const matches: BracketMatch[] = [];
  const byId = new Map<string, BracketMatch>();
  // Build every round's empty shells first so feeds can be wired by id.
  for (let r = 1; r <= rounds; r++) {
    const count = size / Math.pow(2, r);
    for (let m = 0; m < count; m++) {
      const match: BracketMatch = {
        id: `r${r}m${m}`,
        round: r,
        a: null,
        b: null,
        seedA: 0,
        seedB: 0,
        winner: null,
        score: null,
        feedsInto: r === rounds ? null : `r${r + 1}m${Math.floor(m / 2)}`,
        feedsSlot: m % 2 === 0 ? 'a' : 'b',
      };
      matches.push(match);
      byId.set(match.id, match);
    }
  }

  // Seat round one from the seed order, then collapse byes forward.
  const firstRound = matches.filter((m) => m.round === 1);
  firstRound.forEach((m, i) => {
    m.seedA = order[i * 2]!;
    m.seedB = order[i * 2 + 1]!;
    m.a = teamOfSeed(m.seedA);
    m.b = teamOfSeed(m.seedB);
  });

  const drop = new Set<string>();
  for (const m of firstRound) {
    if (m.a !== null && m.b !== null) continue;
    const through = m.a ?? m.b;
    const seed = m.a !== null ? m.seedA : m.seedB;
    drop.add(m.id);
    if (through === null || m.feedsInto === null) continue;
    const next = byId.get(m.feedsInto)!;
    if (m.feedsSlot === 'a') {
      next.a = through;
      next.seedA = seed;
    } else {
      next.b = through;
      next.seedB = seed;
    }
  }

  const kept = matches.filter((m) => !drop.has(m.id));
  // A round that lost every match to a bye should not linger.
  const live = kept.filter((m) => m.round > 1 || (m.a !== null && m.b !== null));
  return { teams: [...teams], bestOf, matches: live, champion: null, rounds };
}

/** Matches ready to play now: both slots filled, no winner yet. */
export function pendingMatches(b: Bracket): BracketMatch[] {
  return b.matches.filter((m) => m.winner === null && m.a !== null && m.b !== null);
}

/** The next match `orgId` is due to play, if it is ready. */
export function nextMatchFor(b: Bracket, orgId: string): BracketMatch | null {
  return pendingMatches(b).find((m) => m.a === orgId || m.b === orgId) ?? null;
}

/** Record a result and push the winner into the next round. */
export function recordBracketResult(
  b: Bracket,
  matchId: string,
  winner: string,
  score: [number, number],
): void {
  const m = b.matches.find((x) => x.id === matchId);
  if (!m || m.winner !== null) return;
  m.winner = winner;
  m.score = score;
  const winnerSeed = winner === m.a ? m.seedA : m.seedB;
  if (m.feedsInto === null) {
    b.champion = winner;
    return;
  }
  const next = b.matches.find((x) => x.id === m.feedsInto);
  if (!next) {
    b.champion = winner;
    return;
  }
  if (m.feedsSlot === 'a') {
    next.a = winner;
    next.seedA = winnerSeed;
  } else {
    next.b = winner;
    next.seedB = winnerSeed;
  }
}

/**
 * Resolve every match that is ready, repeatedly, until the bracket is done or
 * only `skip` is left to play. Returns the matches decided by this call.
 *
 * `resolve` is supplied by the caller so the same bracket runs through the
 * fast path or the full match engine.
 */
export function playBracket(
  b: Bracket,
  resolve: (m: BracketMatch, rng: Rng) => { winner: string; score: [number, number] },
  rng: Rng,
  skip?: string,
): BracketMatch[] {
  const played: BracketMatch[] = [];
  for (let guard = 0; guard < b.matches.length + 2; guard++) {
    const ready = pendingMatches(b).filter((m) => skip === undefined || (m.a !== skip && m.b !== skip));
    if (ready.length === 0) break;
    // Sorted by id so the order a bracket resolves in never depends on
    // whatever order the matches happen to sit in the array.
    ready.sort((x, y) => (x.id < y.id ? -1 : 1));
    for (const m of ready) {
      const out = resolve(m, rng);
      recordBracketResult(b, m.id, out.winner, out.score);
      played.push(m);
    }
  }
  return played;
}

/** Final placement, best first. Losers rank by the round they went out in. */
export function bracketPlacings(b: Bracket): string[] {
  const out: string[] = [];
  if (b.champion) out.push(b.champion);
  const decided = b.matches.filter((m) => m.winner !== null);
  const byRound = [...decided].sort((x, y) => (y.round !== x.round ? y.round - x.round : x.seedA - y.seedA));
  for (const m of byRound) {
    const loser = m.winner === m.a ? m.b : m.a;
    if (loser !== null && !out.includes(loser)) out.push(loser);
  }
  for (const t of b.teams) if (!out.includes(t)) out.push(t);
  return out;
}

// ─────────────────────────── the promotion gauntlet ───────────────────────────

/**
 * The contested seat between two tiers: the team just above the automatic
 * relegation line defends against the best challenger that did not go up
 * automatically. One Bo5, everything on it.
 *
 * This is deliberately a single series rather than a ladder. The drama of
 * promotion is a night, not a tournament, and a manager who has just played a
 * playoff run should not face three more series to keep their seat.
 */
export interface Gauntlet {
  defender: string;
  challenger: string;
  bestOf: 5;
  winner: string | null;
  score: [number, number] | null;
}

export function buildGauntlet(defender: string, challenger: string): Gauntlet {
  return { defender, challenger, bestOf: 5, winner: null, score: null };
}

/** True when the challenger took the seat. */
export function gauntletPromoted(g: Gauntlet): boolean {
  return g.winner !== null && g.winner === g.challenger;
}
