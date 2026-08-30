/**
 * Match engine v1 — the resolution model (tech plan §4).
 *
 * Computes each team's effective strength from role-by-role player strength
 * (skill × role-fit × form/fatigue) and the meshing multiplier, converts the
 * gap to a win probability, samples the winner, then *generates* a plausible,
 * readable game consistent with that result: a length, a scoreline, per-player
 * stat lines, an MVP, and a short timeline. Every result is explainable from a
 * `MatchBreakdown` (pillar 2). Deterministic on a passed-in `Rng`.
 *
 * v2 (phase simulation) will replace `simulateGame` behind this same interface.
 */

import type { Rng } from '../rng/rng.js';
import { clamp, round, winProbFromDiff } from '../util/math.js';
import { effectiveRoleStrength } from '../players/ratings.js';
import { computeCohesion, type Lineup, type RosterChemistry } from '../players/meshing.js';
import { ROLES, type Player, type Role } from '../players/types.js';

/** Team-strength gap (in points) that yields ~76% odds — matches the meshing doc example. */
export const MATCH_SCALE = 15;

export interface Team {
  name: string;
  lineup: Lineup;
  chem: RosterChemistry;
  /** Optional draft-strength score (−?..+?), added to team base. Draft engine feeds this later. */
  draftScore?: number;
}

export interface TeamBreakdown {
  name: string;
  roleStrength: Record<Role, number>;
  base: number; // mean of role strengths (+ draft)
  meshMult: number;
  cohesion: number;
  strength: number; // base * meshMult
}

export function teamBreakdown(team: Team): TeamBreakdown {
  const roleStrength = {} as Record<Role, number>;
  let sum = 0;
  for (const role of ROLES) {
    const p = team.lineup[role];
    const s = effectiveRoleStrength(p.attributes, p.state, role);
    roleStrength[role] = round(s, 1);
    sum += s;
  }
  const base = sum / ROLES.length + (team.draftScore ?? 0);
  const cohesionBd = computeCohesion(team.chem, team.lineup);
  return {
    name: team.name,
    roleStrength,
    base: round(base, 1),
    meshMult: round(cohesionBd.meshMult, 3),
    cohesion: round(cohesionBd.cohesion, 1),
    strength: round(base * cohesionBd.meshMult, 1),
  };
}

export interface PlayerLine {
  playerId: string;
  name: string;
  role: Role;
  kills: number;
  deaths: number;
  assists: number;
  goldShare: number; // 0..1 of team gold
  dmgShare: number; // 0..1 of team damage
  rating: number; // 0..10 performance rating
}

export interface MatchBreakdown {
  a: TeamBreakdown;
  b: TeamBreakdown;
  winProbA: number;
}

export interface GameResult {
  winner: 'a' | 'b';
  lengthMin: number;
  killsA: number;
  killsB: number;
  linesA: PlayerLine[];
  linesB: PlayerLine[];
  mvp: { side: 'a' | 'b'; playerId: string; name: string };
  timeline: string[];
  breakdown: MatchBreakdown;
}

/** Damage/gold emphasis by role (carries get the resources). Sums ~1.0. */
const CARRY_WEIGHT: Record<Role, number> = { top: 0.2, jungle: 0.14, mid: 0.26, bot: 0.3, support: 0.1 };

function winProbability(a: Team, b: Team): { pA: number; bd: MatchBreakdown } {
  const ba = teamBreakdown(a);
  const bb = teamBreakdown(b);
  const pA = winProbFromDiff(ba.strength - bb.strength, MATCH_SCALE);
  return { pA, bd: { a: ba, b: bb, winProbA: round(pA, 3) } };
}

function genLines(
  team: Team,
  won: boolean,
  totalKills: number,
  rng: Rng,
  dominance: number, // 0..1, how one-sided
): PlayerLine[] {
  const lines: PlayerLine[] = [];
  // distribute team kills across roles by carry weight (+ noise)
  const weights = ROLES.map((r) => CARRY_WEIGHT[r] * rng.range(0.6, 1.4));
  const wsum = weights.reduce((s, w) => s + w, 0);
  ROLES.forEach((role, i) => {
    const p = team.lineup[role];
    const share = weights[i]! / wsum;
    const kills = Math.max(0, Math.round(totalKills * share * (won ? 1.0 : 0.85)));
    // deaths: losers die more; supports/tanks die a bit more, carries protected
    const deathBase = won ? 1.6 : 3.0;
    const deaths = Math.max(0, Math.round(rng.gaussian(deathBase, 1.1)));
    // assists: everyone shares in kills; supports/jungle higher
    const assistMult = role === 'support' ? 1.8 : role === 'jungle' ? 1.4 : 1.0;
    const assists = Math.max(0, Math.round(totalKills * 0.4 * assistMult * rng.range(0.5, 1.1)));
    const dmgShare = clamp(CARRY_WEIGHT[role] * rng.range(0.75, 1.25), 0.03, 0.45);
    const goldShare = clamp(CARRY_WEIGHT[role] * rng.range(0.8, 1.2) + 0.05, 0.05, 0.4);
    // rating: KDA-ish, lifted by winning and by the player's own strength/form
    const kda = (kills + assists) / Math.max(1, deaths);
    const indiv = effectiveRoleStrength(p.attributes, p.state, role) / 100;
    const rating = clamp(
      3.0 + kda * 0.7 + indiv * 3.0 + (won ? 0.8 : -0.4) + rng.range(-0.6, 0.6),
      0,
      10,
    );
    lines.push({
      playerId: p.id, name: p.identity.name, role,
      kills, deaths, assists,
      goldShare: round(goldShare, 3), dmgShare: round(dmgShare, 3),
      rating: round(rating, 1),
    });
  });
  // normalize shares to sum to 1
  for (const key of ['goldShare', 'dmgShare'] as const) {
    const s = lines.reduce((acc, l) => acc + l[key], 0);
    for (const l of lines) l[key] = round(l[key] / s, 3);
  }
  void dominance;
  return lines;
}

function genTimeline(
  a: Team, b: Team, winnerLines: PlayerLine[], winnerName: string, lengthMin: number, rng: Rng,
): string[] {
  const events: string[] = [];
  const wl = [...winnerLines].sort((x, y) => y.rating - x.rating);
  const star = wl[0]!;
  const jungler = winnerLines.find((l) => l.role === 'jungle')!;
  events.push(`Min 3: Both teams path safely — an even start.`);
  events.push(`Min ${rng.int(6, 10)}: ${jungler.name} finds a gank ${rng.pick(['bot', 'top', 'mid'])} — first blood to ${winnerName}.`);
  events.push(`Min ${rng.int(14, 20)}: A neutral-objective fight breaks — ${winnerName} comes out ahead.`);
  if (lengthMin > 30) events.push(`Min ${rng.int(24, 30)}: The losing side stabilizes and stalls for scaling.`);
  events.push(`Min ${rng.int(28, Math.max(30, Math.floor(lengthMin) - 2))}: ${star.name} pops off (${star.kills}/${star.deaths}/${star.assists}) — ${winnerName} takes the deciding fight.`);
  events.push(`Min ${Math.round(lengthMin)}: ${winnerName} closes it out.`);
  return events;
}

/** Simulate a single game between two teams. */
export function simulateGame(a: Team, b: Team, rng: Rng): GameResult {
  const { pA, bd } = winProbability(a, b);
  const aWins = rng.chance(pA);
  const winner: 'a' | 'b' = aWins ? 'a' : 'b';
  const dominance = Math.abs(pA - 0.5) * 2;

  // closer games run longer on average; blowouts end fast
  const lengthMin = round(clamp(rng.gaussian(34 - dominance * 6, 5), 22, 52), 0);
  const totalKills = Math.max(6, Math.round(rng.gaussian(24, 6) * (lengthMin / 32)));
  // winner gets ~60-75% of kills depending on dominance
  const winnerShare = 0.55 + dominance * 0.2 + rng.range(-0.05, 0.05);
  const winnerKills = Math.round(totalKills * winnerShare);
  const loserKills = Math.max(0, totalKills - winnerKills);

  const linesWinner = genLines(aWins ? a : b, true, winnerKills, rng, dominance);
  const linesLoser = genLines(aWins ? b : a, false, loserKills, rng, dominance);
  const linesA = aWins ? linesWinner : linesLoser;
  const linesB = aWins ? linesLoser : linesWinner;

  const mvpLine = [...linesWinner].sort((x, y) => y.rating - x.rating)[0]!;
  const timeline = genTimeline(a, b, linesWinner, aWins ? a.name : b.name, lengthMin, rng);

  return {
    winner,
    lengthMin,
    killsA: aWins ? winnerKills : loserKills,
    killsB: aWins ? loserKills : winnerKills,
    linesA, linesB,
    mvp: { side: winner, playerId: mvpLine.playerId, name: mvpLine.name },
    timeline,
    breakdown: bd,
  };
}

export interface SeriesResult {
  bestOf: number;
  winner: 'a' | 'b';
  scoreA: number;
  scoreB: number;
  games: GameResult[];
}

/** Simulate a best-of-N series (N odd). */
export function simulateSeries(a: Team, b: Team, bestOf: number, rng: Rng): SeriesResult {
  const need = Math.ceil(bestOf / 2);
  let scoreA = 0;
  let scoreB = 0;
  const games: GameResult[] = [];
  while (scoreA < need && scoreB < need) {
    const g = simulateGame(a, b, rng);
    games.push(g);
    if (g.winner === 'a') scoreA++;
    else scoreB++;
  }
  return { bestOf, winner: scoreA > scoreB ? 'a' : 'b', scoreA, scoreB, games };
}
