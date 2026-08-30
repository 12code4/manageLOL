import { describe, it, expect } from 'vitest';
import { RngSource } from '../rng/rng.js';
import { generatePlayer } from '../players/generate.js';
import { initRosterChemistry, rampWeek, type Lineup } from '../players/meshing.js';
import { ROLES, type Role } from '../players/types.js';
import type { PlayerId } from '../util/ids.js';
import type { RegionId } from '@managelol/data';
import { simulateGame, simulateSeries, teamBreakdown, type Team } from './resolve.js';

function makeTeam(name: string, center: number, seed: string, region: RegionId = 'mer', gelWeeks = 20): Team {
  const rng = new RngSource(seed).stream('roster');
  const lineup = {} as Lineup;
  ROLES.forEach((role: Role, i) => {
    lineup[role] = generatePlayer(rng, {
      id: `${seed}_${role}` as PlayerId, region, qualityCenter: center, primaryRole: role, ageRange: [20, 24],
    });
    // ensure everyone shares a language so gelling isn't the variable under test
    lineup[role]!.identity.languageIds = ['common'] as never;
  });
  const chem = initRosterChemistry(lineup);
  for (let w = 0; w < gelWeeks; w++) rampWeek(chem, lineup, 1.0);
  return { name, lineup, chem };
}

describe('teamBreakdown', () => {
  it('a higher-quality roster has higher effective strength', () => {
    const strong = teamBreakdown(makeTeam('Strong', 82, 's1'));
    const weak = teamBreakdown(makeTeam('Weak', 50, 'w1'));
    expect(strong.strength).toBeGreaterThan(weak.strength);
    expect(strong.meshMult).toBeGreaterThan(1.0); // gelled
  });
});

describe('simulateGame', () => {
  it('is deterministic for the same seed', () => {
    const a = makeTeam('A', 70, 'a');
    const b = makeTeam('B', 65, 'b');
    const g1 = simulateGame(a, b, new RngSource('m').stream('game'));
    const g2 = simulateGame(a, b, new RngSource('m').stream('game'));
    expect(g1).toEqual(g2);
  });

  it('MVP is on the winning side and has 5 lines per team', () => {
    const a = makeTeam('A', 72, 'a');
    const b = makeTeam('B', 60, 'b');
    const g = simulateGame(a, b, new RngSource('m2').stream('game'));
    expect(g.mvp.side).toBe(g.winner);
    expect(g.linesA).toHaveLength(5);
    expect(g.linesB).toHaveLength(5);
    // damage shares sum to ~1
    const dsum = g.linesA.reduce((s, l) => s + l.dmgShare, 0);
    expect(dsum).toBeCloseTo(1, 1);
    expect(g.timeline.length).toBeGreaterThan(3);
  });

  const winRate = (a: Team, b: Team, n = 400): number => {
    let aWins = 0;
    for (let i = 0; i < n; i++) {
      if (simulateGame(a, b, new RngSource('series').stream(`g${i}`)).winner === 'a') aWins++;
    }
    return aWins / n;
  };

  it('a big skill gap is near-certain (elite crushes amateurs)', () => {
    const rate = winRate(makeTeam('Elite', 82, 'elite'), makeTeam('Amateur', 52, 'amateur'));
    expect(rate).toBeGreaterThan(0.9);
  });

  it('a competitive gap is favored but upsettable', () => {
    const rate = winRate(makeTeam('Top', 70, 'top'), makeTeam('Contender', 61, 'cont'));
    expect(rate).toBeGreaterThan(0.6); // favored
    expect(rate).toBeLessThan(0.95); // but upsets happen
  });
});

describe('simulateSeries', () => {
  it('a Bo5 ends when someone reaches 3, in 3–5 games', () => {
    const a = makeTeam('A', 70, 'a');
    const b = makeTeam('B', 68, 'b');
    const s = simulateSeries(a, b, 5, new RngSource('bo5').stream('s'));
    expect(Math.max(s.scoreA, s.scoreB)).toBe(3);
    expect(s.games.length).toBeGreaterThanOrEqual(3);
    expect(s.games.length).toBeLessThanOrEqual(5);
    expect(s.winner === 'a' ? s.scoreA : s.scoreB).toBe(3);
  });
});
