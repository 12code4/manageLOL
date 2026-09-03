/**
 * League scheduling and standings — the deterministic spine of a season.
 *
 * Two pure pieces, both free of game-specific state so they can serve every
 * tier of the pyramid:
 *
 *  - `roundRobin` builds a fixture list with the circle method. For an even
 *    field of n teams it produces n-1 rounds of n/2 pairings in which every
 *    team meets every other exactly once; an odd field gets a bye. Which side
 *    drafts Blue alternates so nobody is stuck on one side of the map.
 *  - `standings` ranks a table with an explicit, fully ordered tiebreaker
 *    chain. Nothing here may depend on insertion or object-key order — two
 *    teams level on every criterion fall back to their id, which is stable.
 *
 * Design: docs/05-systems/competition-pyramid.md.
 */

/** One scheduled match: `a` drafts Blue, `b` drafts Red. */
export interface Fixture {
  round: number;
  a: string;
  b: string;
}

/** The bye marker inserted for an odd field; never appears in the output. */
const BYE = ' bye';

/**
 * Single round-robin by the circle method. Every team plays every other once.
 *
 * `legs` repeats the whole cycle with the sides swapped on odd legs, so a
 * double round-robin gives each pair one match on each side. Teams are used in
 * the order given — callers must pass a deterministically sorted array.
 */
export function roundRobin(teams: readonly string[], legs = 1): Fixture[] {
  if (teams.length < 2 || legs < 1) return [];
  const field = teams.length % 2 === 0 ? [...teams] : [...teams, BYE];
  const n = field.length;
  const roundsPerLeg = n - 1;
  const half = n / 2;
  const out: Fixture[] = [];

  // Leg 1: circle-method pairings, with sides assigned by a greedy balance —
  // whoever has drafted Blue less often so far takes it, ties by id. Simple
  // parity schemes leave some team on one side all season; this cannot.
  const blueCount = new Map<string, number>(teams.map((t) => [t, 0]));
  const rot = [...field];
  const leg1: Fixture[] = [];
  for (let r = 0; r < roundsPerLeg; r++) {
    for (let i = 0; i < half; i++) {
      const x = rot[i]!;
      const y = rot[n - 1 - i]!;
      if (x === BYE || y === BYE) continue;
      const bx = blueCount.get(x)!;
      const by = blueCount.get(y)!;
      // Fewer Blues so far takes Blue. On a dead tie, alternate which id wins
      // by round parity — always favouring the lower id lets one team hoard.
      const xFirst = bx !== by ? bx < by : r % 2 === 0 ? x < y : x > y;
      const a = xFirst ? x : y;
      const b = xFirst ? y : x;
      blueCount.set(a, blueCount.get(a)! + 1);
      leg1.push({ round: r + 1, a, b });
    }
    // circle method: hold rot[0], rotate the remainder one step
    const last = rot[n - 1]!;
    for (let i = n - 1; i > 1; i--) rot[i] = rot[i - 1]!;
    rot[1] = last;
  }

  // Later legs replay the same pairings; odd legs flip sides so a double
  // round-robin gives every pair one match on each side of the map.
  for (let leg = 0; leg < legs; leg++) {
    const offset = leg * roundsPerLeg;
    const flip = leg % 2 === 1;
    for (const m of leg1) {
      out.push(
        flip
          ? { round: m.round + offset, a: m.b, b: m.a }
          : { round: m.round + offset, a: m.a, b: m.b },
      );
    }
  }
  return out;
}

/** A team's accumulated league record. */
export interface TableRow {
  orgId: string;
  wins: number;
  losses: number;
  /** Games won/lost inside series (equal to wins/losses in a Bo1 league). */
  gameWins: number;
  gameLosses: number;
  /** Most recent results first: true = win. Bounded by the form window. */
  form: boolean[];
  /** Series wins against each opponent, keyed by their org id. */
  h2h: Record<string, number>;
}

export function emptyRow(orgId: string): TableRow {
  return { orgId, wins: 0, losses: 0, gameWins: 0, gameLosses: 0, form: [], h2h: {} };
}

/** Record one completed series into both teams' rows. */
export function recordResult(
  table: Record<string, TableRow>,
  winnerId: string,
  loserId: string,
  winnerGames: number,
  loserGames: number,
  formWindow = 5,
): void {
  const w = table[winnerId];
  const l = table[loserId];
  if (!w || !l) return;
  w.wins++;
  l.losses++;
  w.gameWins += winnerGames;
  w.gameLosses += loserGames;
  l.gameWins += loserGames;
  l.gameLosses += winnerGames;
  w.h2h[loserId] = (w.h2h[loserId] ?? 0) + 1;
  l.h2h[winnerId] = l.h2h[winnerId] ?? 0;
  w.form.unshift(true);
  l.form.unshift(false);
  if (w.form.length > formWindow) w.form.length = formWindow;
  if (l.form.length > formWindow) l.form.length = formWindow;
}

/**
 * Rank the table. Tiebreakers, in order:
 *   1. series wins (desc)
 *   2. head-to-head series wins against the tied team (desc)
 *   3. game differential (desc)
 *   4. games won (desc)
 *   5. org id (asc) — the stable last resort, never insertion order
 */
export function standings(rows: readonly TableRow[]): TableRow[] {
  return [...rows].sort((x, y) => {
    if (y.wins !== x.wins) return y.wins - x.wins;
    const h2hX = x.h2h[y.orgId] ?? 0;
    const h2hY = y.h2h[x.orgId] ?? 0;
    if (h2hX !== h2hY) return h2hY - h2hX;
    const dx = x.gameWins - x.gameLosses;
    const dy = y.gameWins - y.gameLosses;
    if (dy !== dx) return dy - dx;
    if (y.gameWins !== x.gameWins) return y.gameWins - x.gameWins;
    return x.orgId < y.orgId ? -1 : x.orgId > y.orgId ? 1 : 0;
  });
}

/** Win rate as a 0..1 fraction; no games played reads as 0. */
export function winRate(row: TableRow): number {
  const played = row.wins + row.losses;
  return played === 0 ? 0 : row.wins / played;
}
