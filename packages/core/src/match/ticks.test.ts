import { describe, it, expect } from 'vitest';
import { RngSource } from '../rng/rng.js';
import { generatePlayer } from '../players/generate.js';
import { initRosterChemistry, rampWeek, type Lineup } from '../players/meshing.js';
import { ROLES, type Role } from '../players/types.js';
import { simulateGame, type Team } from './resolve.js';
import { generateTicks, highlights, TICK_SECONDS } from './ticks.js';
import { draftSkill, draftNoiseSigma, type DraftTeam } from '../draft/draft.js';
import type { PlayerId } from '../util/ids.js';

function team(name: string, center: number, seed: string, gel = 20): Team & DraftTeam {
  const rng = new RngSource(seed).stream('r');
  const lineup = {} as Lineup;
  for (const role of ROLES as Role[]) {
    lineup[role] = generatePlayer(rng, { id: `${seed}_${role}` as PlayerId, region: 'mer', qualityCenter: center, primaryRole: role, ageRange: [20, 24] });
    lineup[role]!.identity.languageIds = ['common'] as never;
  }
  const chem = initRosterChemistry(lineup);
  for (let w = 0; w < gel; w++) rampWeek(chem, lineup, 1.0);
  return { name, lineup, chem, coachQuality: 50, patchFamiliarity: 60 };
}

describe('game ticks', () => {
  const a = team('A', 70, 'ta'), b = team('B', 62, 'tb');
  const g = simulateGame(a, b, new RngSource('g').stream('game'));
  const ticks = generateTicks(g, a.name, b.name, new RngSource('g').stream('ticks'));

  it('covers the game in 30-second steps', () => {
    expect(ticks.length).toBe(Math.max(20, Math.round(g.lengthMin * 2)));
    expect(ticks[0]!.t).toBe(TICK_SECONDS);
    for (let i = 1; i < ticks.length; i++) expect(ticks[i]!.t - ticks[i - 1]!.t).toBe(TICK_SECONDS);
  });
  it('kill totals match the resolved game and never decrease', () => {
    const last = ticks[ticks.length - 1]!;
    expect(last.killsA).toBe(g.killsA); expect(last.killsB).toBe(g.killsB);
    for (let i = 1; i < ticks.length; i++) { expect(ticks[i]!.killsA).toBeGreaterThanOrEqual(ticks[i - 1]!.killsA); expect(ticks[i]!.killsB).toBeGreaterThanOrEqual(ticks[i - 1]!.killsB); }
  });
  it('gold lead and win probability end on the winner', () => {
    const last = ticks[ticks.length - 1]!;
    if (g.winner === 'a') { expect(last.goldDiff).toBeGreaterThan(0); expect(last.winProbA).toBe(1); }
    else { expect(last.goldDiff).toBeLessThan(0); expect(last.winProbA).toBe(0); }
    expect(last.events.some((e) => e.type === 'end')).toBe(true);
  });
  it('no kills before 2:30 and exactly one first blood', () => {
    const fb = ticks.flatMap((tk) => tk.events.filter((e) => e.type === 'firstBlood'));
    expect(fb.length).toBe(g.killsA + g.killsB > 0 ? 1 : 0);
    for (const tk of ticks) if (tk.t < 150) expect(tk.killsA + tk.killsB).toBe(0);
  });
  it('is deterministic and yields highlights', () => {
    const again = generateTicks(g, a.name, b.name, new RngSource('g').stream('ticks'));
    expect(again).toEqual(ticks);
    expect(highlights(ticks).length).toBeGreaterThan(2);
  });
});

describe('auto-draft skill', () => {
  it('a cohesive, smart roster drafts with less noise than a fractured one', () => {
    const t = team('T', 70, 'skill');
    const sharp: DraftTeam = { ...t, cohesion: 85, coachQuality: 70 };
    const messy: DraftTeam = { ...t, cohesion: 25, coachQuality: 30 };
    expect(draftSkill(sharp)).toBeGreaterThan(draftSkill(messy) + 20);
    expect(draftNoiseSigma(sharp)).toBeLessThan(draftNoiseSigma(messy));
    expect(draftNoiseSigma(sharp)).toBeGreaterThan(0.2); // randomness never fully disappears
  });
});
