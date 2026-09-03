/**
 * The season calendar and the pyramid of leagues.
 *
 * The prototype's linear `STAGES` array — win three brackets, advance a rung —
 * is a placeholder for exactly this: a persistent pyramid whose membership is
 * a set of seats held by orgs across years, and a 52-week calendar every tier
 * shares. "Climbing" stops being a counter and becomes holding a seat,
 * finishing above the line, and winning a gauntlet in week 42.
 *
 * The year is the idealized 52-week one from `world/clock.ts`. Every week has
 * a *kind*, and the kind is what tells the UI what the manager is being asked
 * to do — play a match, run a training block, work the market, or watch an
 * event. That is what stops a season from being forty identical "next week"
 * clicks.
 *
 * Design: docs/05-systems/competition-pyramid.md, orgs-and-season.md.
 */

import type { PyramidTier } from '../world/orgs.js';

export type WeekKind = 'match' | 'training' | 'market' | 'event';

export interface WeekDef {
  week: number;
  kind: WeekKind;
  /** The window this week belongs to, for the calendar strip. */
  window: string;
  /** One line naming what is at stake, shown on the Season hub. */
  note: string;
  /** Split 1 or 2 during regular-season play; null outside them. */
  split: 1 | 2 | null;
  /** True when the transfer market is open for contracted players. */
  transferWindow: boolean;
}

/**
 * The 52-week year. Nine match weeks per split (two rounds a week for the
 * Bo3 tiers), playoffs, a mid-season international, a Worlds block, then the
 * promotion gauntlets and an off-season with one distinct job per week —
 * expiries, free agency, turnover, awards, the preseason patch.
 */
export const CALENDAR: readonly WeekDef[] = buildCalendar();

function buildCalendar(): WeekDef[] {
  const w: WeekDef[] = [];
  const add = (
    week: number,
    kind: WeekKind,
    window: string,
    note: string,
    split: 1 | 2 | null = null,
    transferWindow = false,
  ): void => {
    w.push({ week, kind, window, note, split, transferWindow });
  };

  add(1, 'market', 'Preseason', 'Rosters lock at the end of the week.', null, true);
  add(2, 'training', 'Preseason', 'Bootcamp. Set the training emphasis for the split.');
  for (let i = 3; i <= 11; i++) {
    add(i, 'match', 'Spring Split', `Split 1, round ${(i - 3) * 2 + 1}-${(i - 3) * 2 + 2}.`, 1);
  }
  add(12, 'training', 'Seeding', 'Tiebreakers, if you are in one. Otherwise, rest.', 1);
  add(13, 'match', 'Spring Playoffs', 'Playoffs. Win four series and the split is yours.', 1);
  add(14, 'match', 'Spring Playoffs', 'Playoff finals.', 1);
  add(15, 'market', 'Split break', 'The mid-season window opens.', null, true);
  add(16, 'event', 'Mid-season', 'The Crucible: the champions of every region.', null, true);
  add(17, 'event', 'Mid-season', 'The Crucible continues.', null, true);
  add(18, 'event', 'Mid-season', 'The Crucible final.', null, true);
  add(19, 'market', 'Split break', 'The mid-season window closes on Sunday.', null, true);
  for (let i = 20; i <= 28; i++) {
    add(i, 'match', 'Summer Split', `Split 2, round ${(i - 20) * 2 + 1}-${(i - 20) * 2 + 2}.`, 2);
  }
  add(29, 'training', 'Seeding', 'Tiebreakers and the last week of prep.', 2);
  add(30, 'match', 'Summer Playoffs', 'Playoffs. The Worlds seeds are decided here.', 2);
  add(31, 'match', 'Summer Playoffs', 'Playoff finals.', 2);
  add(32, 'event', 'Seeding', 'Championship points reconciled; Worlds seeds announced.');
  add(33, 'match', 'Regional Finals', 'The gauntlet for the last Worlds seat.');
  add(34, 'match', 'Regional Finals', 'Regional finals conclude.');
  add(35, 'training', 'Worlds bootcamp', 'Travel and bootcamp, or a double scouting week.');
  add(36, 'event', 'The Summit', 'Worlds: play-in.');
  add(37, 'event', 'The Summit', 'Worlds: the group stage.');
  add(38, 'event', 'The Summit', 'Worlds: the group stage concludes.');
  add(39, 'event', 'The Summit', 'Worlds: quarter-finals and semis.');
  add(40, 'event', 'The Summit', 'Worlds: the final.');
  add(41, 'event', 'Season review', 'Awards, and the legacy tick every org lives or dies by.');
  add(42, 'match', 'Promotion', 'The promotion gauntlets. Seats change hands.');
  add(43, 'match', 'Promotion', 'Gauntlets conclude; the pyramid is redrawn.');
  add(44, 'event', 'Structure', 'Expansion review and any franchise conversion.');
  add(45, 'market', 'Expiries', 'The contract expiry wave. Renew now or lose them.', null, true);
  add(46, 'market', 'Free agency', 'Free agency opens. Rivals are bidding.', null, true);
  add(47, 'market', 'Free agency', 'Free agency. The good ones go early.', null, true);
  add(48, 'market', 'Free agency', 'Free agency closes on the best of them.', null, true);
  add(49, 'event', 'Turnover', 'Retirements, new talent on the ladder, academy intake.', null, true);
  add(50, 'event', 'Board', 'The awards show, and next season’s mandate from the board.', null, true);
  add(51, 'event', 'Preseason patch', 'A big patch lands and the ladder season resets.', null, true);
  add(52, 'training', 'Preseason', 'Scrims on the new patch. Roster deadline approaches.', null, true);
  return w;
}

export function weekDef(week: number): WeekDef {
  const idx = ((week - 1) % 52 + 52) % 52;
  return CALENDAR[idx]!;
}

/** Which of the four season phases a week belongs to, for solo-queue volume. */
export function phaseOfWeek(week: number): 'preseason' | 'regular' | 'playoffs' | 'offseason' {
  const d = weekDef(week);
  if (d.window.includes('Playoffs') || d.window === 'Promotion') return 'playoffs';
  if (d.split !== null) return 'regular';
  if (d.window === 'Preseason') return 'preseason';
  return 'offseason';
}

/** Match weeks in a split, in order — what the fixture generator tiles onto. */
export function matchWeeksOfSplit(split: 1 | 2): number[] {
  return CALENDAR.filter((d) => d.split === split && d.kind === 'match' && !d.window.includes('Playoffs')).map((d) => d.week);
}

// ────────────────────────────── the pyramid ──────────────────────────────

export interface LeagueConfig {
  id: string;
  name: string;
  tier: PyramidTier;
  /** Seats. Always even, so a round-robin never needs a bye. */
  slots: number;
  /** 1 = single round-robin, 2 = double. */
  legs: 1 | 2;
  regularBestOf: 1 | 3 | 5;
  playoffBestOf: 1 | 3 | 5;
  playoffTeams: number;
  /** Prize pool for one split, in credits, before the placement split. */
  prizePool: number;
  /** Credits a seat pays every week just for being in the league. */
  weeklyRevenue: number;
  /** Finishing at or above this place is promotion contention. */
  promotionLine: number;
  /** Finishing at or below this place is the relegation zone. */
  relegationLine: number;
  blurb: string;
}

/**
 * The home region's pyramid. T1 and T2 share a config shape deliberately:
 * being relegated must change your money, your prestige and the quality of
 * your opponents — not your weekly rhythm. You still play two Bo3s a week,
 * and that is what makes the drop hurt in the right way.
 */
export const PYRAMID: readonly LeagueConfig[] = [
  {
    id: 'prime',
    name: 'The Prime League',
    tier: 1,
    slots: 10,
    legs: 2,
    regularBestOf: 3,
    playoffBestOf: 5,
    playoffTeams: 6,
    prizePool: 300,
    weeklyRevenue: 6.5,
    promotionLine: 0,
    relegationLine: 10,
    blurb: 'The top of the sport. Revenue share, real money, and a seat at the Summit.',
  },
  {
    id: 'ascent',
    name: 'Ascent Division',
    tier: 2,
    slots: 10,
    legs: 2,
    regularBestOf: 3,
    playoffBestOf: 5,
    playoffTeams: 4,
    prizePool: 110,
    weeklyRevenue: 2.4,
    promotionLine: 3,
    relegationLine: 9,
    blurb: 'Semi-pro, and one gauntlet away from everything. Also one bad split from nothing.',
  },
  {
    id: 'circuit',
    name: 'Regional Circuit',
    tier: 3,
    slots: 16,
    legs: 1,
    regularBestOf: 1,
    playoffBestOf: 3,
    playoffTeams: 8,
    prizePool: 34,
    weeklyRevenue: 0.7,
    promotionLine: 3,
    relegationLine: 13,
    blurb: 'The widest band in the pyramid, and where most careers actually happen.',
  },
  {
    id: 'open',
    name: 'Open Circuit',
    tier: 4,
    slots: 12,
    legs: 1,
    regularBestOf: 1,
    playoffBestOf: 3,
    playoffTeams: 4,
    prizePool: 9,
    weeklyRevenue: 0.15,
    promotionLine: 2,
    relegationLine: 99,
    blurb: 'Amateur weekend brackets. Everyone starts here; almost everyone stays.',
  },
];

export const LEAGUE_BY_TIER: Readonly<Record<PyramidTier, LeagueConfig>> = Object.freeze(
  Object.fromEntries(PYRAMID.map((l) => [l.tier, l])) as Record<PyramidTier, LeagueConfig>,
);

/**
 * Prize money for one placement, in credits. Steep at the top so a title is
 * worth chasing and mid-table is worth escaping.
 */
export function prizeFor(cfg: LeagueConfig, place: number): number {
  const shares = [0.34, 0.21, 0.14, 0.1, 0.07, 0.05, 0.035, 0.025, 0.015, 0.01];
  const share = shares[place - 1] ?? 0.005;
  return Math.round(cfg.prizePool * share * 10) / 10;
}

/** Championship points, which decide the Worlds seeds at tier 1. */
export function championshipPoints(cfg: LeagueConfig, place: number): number {
  if (cfg.tier !== 1) return 0;
  const table = [90, 70, 55, 40, 25, 25, 12, 12, 4, 4];
  return table[place - 1] ?? 0;
}

/** How seats move at the end of a year, computed before anything is applied. */
export interface SeatMovement {
  /** Orgs dropping out of this tier, worst-first. */
  relegated: string[];
  /** Orgs arriving from the tier below, best-first. */
  promoted: string[];
}

/**
 * Resolve promotion and relegation between two adjacent tiers from final
 * standings. Both sides are computed from the *pre-movement* tables and
 * committed together, so the result cannot depend on which tier is processed
 * first.
 */
export function resolveBoundary(
  upper: readonly string[],
  lower: readonly string[],
  autoSeats: number,
): SeatMovement {
  const drop = upper.slice(Math.max(0, upper.length - autoSeats));
  const rise = lower.slice(0, autoSeats);
  return { relegated: drop, promoted: rise };
}
