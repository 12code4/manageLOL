/**
 * Fast match resolution — the engine that runs the rest of the world.
 *
 * Your matches get the full treatment: a real draft, a full `simulateGame`,
 * a 30-second tick log you watch. The other ~20 series in the league that
 * week get this instead, and it has to be roughly a thousand times cheaper
 * while still producing a table that reads as though those games were played.
 *
 * The economy comes from three places:
 *
 *  - **Nothing is recomputed per match.** A side's strength, drafting skill
 *    and meta fit are computed once a week per org and handed in.
 *  - **The draft is sampled, not played.** Only the *difference* in draft
 *    value matters to a result, so one Gaussian draw stands in for forty
 *    scored actions. Its mean favours the better-prepared side and its spread
 *    narrows as both sides get sharper — which is the only property of the
 *    draft engine a league table actually needs.
 *  - **Day form is drawn once per series, not per game.** That is also the
 *    correct model: a Bo5 is supposed to protect the better team, and rolling
 *    fresh variance every game would flatten it.
 *
 * It shares exactly two things with `resolve.ts` — `MATCH_SCALE` and
 * `winProbFromDiff` — so both engines put draft value on the same ±8 scale and
 * feed the same logistic. A league simulated this way and a league played out
 * in full converge on the same standings.
 */

import type { Rng } from '../rng/rng.js';
import { clamp, round, winProbFromDiff } from '../util/math.js';
import { MATCH_SCALE } from '../match/resolve.js';

/** Draft-value points a fully-prepared side gains over an unprepared one. */
export const DRAFT_GAIN = 4;
/** Spread of the sampled draft delta at the lowest skill level. */
export const DRAFT_SIGMA_MAX = 1.9;
/** Series-level day-form spread before the consistency damper. */
export const VAR_BASE = 3.2;

/** Everything the fast path needs about one side. Precomputed weekly. */
export interface FastSide {
  orgId: string;
  /** `teamBreakdown(team).strength` — recomputed once a week, not per match. */
  strength: number;
  /** `draftSkill(team)` 0..100 — recomputed weekly. */
  drafting: number;
  /** Roster-vs-patch fit, −2..+2 — recomputed on patch day only. */
  metaFit: number;
  /** Mean consistency 0..100 — the variance damper. */
  consistency: number;
}

export interface FastGame {
  winnerIdx: 0 | 1;
  lengthMin: number;
  killsA: number;
  killsB: number;
}

export interface FastResult {
  winner: 0 | 1;
  score: [number, number];
  games: FastGame[];
  winProbA: number;
  /** The favourite (|p−0.5| ≥ 0.15) lost. Drives the inbox and rivalry heat. */
  upset: boolean;
  /** The sampled draft edge, so a post-match line can name it. */
  draftDelta: number;
}

export interface FastOpts {
  /** Skip per-game colour when only the result matters. */
  games?: boolean;
}

/**
 * Resolve one series. Cost: 2 Gaussians plus 1 uniform and 2 Gaussians per
 * game — under a microsecond, and no object churn beyond the result.
 */
export function resolveFastSeries(
  a: FastSide,
  b: FastSide,
  bestOf: 1 | 3 | 5,
  rng: Rng,
  opts: FastOpts = {},
): FastResult {
  // The draft, sampled. A well-prepped team usually wins it; a bad one
  // occasionally does, and the spread is what makes that true.
  const draftMu = (DRAFT_GAIN * (a.drafting - b.drafting)) / 100 + (a.metaFit - b.metaFit);
  const draftSigma = DRAFT_SIGMA_MAX - 0.85 * ((a.drafting + b.drafting) / 200);
  const draftDelta = rng.gaussian(draftMu, draftSigma, -8, 8);

  // Day form, once for the whole series.
  const noiseSigma = VAR_BASE * (1 - 0.4 * ((a.consistency + b.consistency) / 200));
  const dayDelta = rng.gaussian(0, noiseSigma, -3 * noiseSigma, 3 * noiseSigma);

  const gap = a.strength - b.strength + draftDelta + dayDelta;
  const pA = winProbFromDiff(gap, MATCH_SCALE);
  const needed = Math.ceil((bestOf + 1) / 2);
  const dom = Math.abs(pA - 0.5) * 2;

  const games: FastGame[] = [];
  let winsA = 0;
  let winsB = 0;
  while (winsA < needed && winsB < needed) {
    const aWon = rng.chance(pA);
    if (aWon) winsA++;
    else winsB++;
    if (opts.games === false) continue;

    const lengthMin = clamp(Math.round(rng.gaussian(34 - 6 * dom, 5)), 22, 52);
    const totalKills = Math.max(6, Math.round((24 * lengthMin) / 32 + rng.gaussian(0, 5)));
    const winnerKills = Math.round(totalKills * (0.55 + 0.2 * dom));
    games.push({
      winnerIdx: aWon ? 0 : 1,
      lengthMin,
      killsA: aWon ? winnerKills : totalKills - winnerKills,
      killsB: aWon ? totalKills - winnerKills : winnerKills,
    });
  }

  const winner: 0 | 1 = winsA > winsB ? 0 : 1;
  const favouriteA = pA >= 0.5;
  const decisive = Math.abs(pA - 0.5) >= 0.15;

  return {
    winner,
    score: [winsA, winsB],
    games,
    winProbA: round(pA, 3),
    upset: decisive && ((favouriteA && winner === 1) || (!favouriteA && winner === 0)),
    draftDelta: round(draftDelta, 2),
  };
}

/**
 * A performance rating 0..10 for one player in a fast-resolved series, derived
 * rather than simulated — enough for a form guide and a season MVP race
 * without allocating a stat line per player per game.
 */
export function fastRating(roleStrength: number, teamStrength: number, won: boolean, rng: Rng): number {
  const relative = (roleStrength - teamStrength) / 8;
  const base = 5.6 + (won ? 1.1 : -1.1) + relative;
  return round(clamp(rng.gaussian(base, 0.85), 0, 10), 1);
}
