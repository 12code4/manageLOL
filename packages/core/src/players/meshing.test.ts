import { describe, it, expect } from 'vitest';
import {
  computePairTarget,
  computeCohesion,
  initRosterChemistry,
  onLineupChange,
  rampWeek,
  pairKey,
  type Lineup,
  type RosterChemistry,
} from './meshing.js';
import { makeTestPlayer, flatAttributes } from './testing.js';
import type { Player, Role } from './types.js';
import type { LanguageId } from './types.js';

/** Build a player with specific chemistry-driver values and identity. */
function chemPlayer(
  id: string,
  role: Role,
  chem: Partial<Player['attributes']['chemistry']>,
  opts: { age?: number; langs?: string[]; shotcalling?: number } = {},
): Player {
  const attrs = flatAttributes(50, { primaryRole: role });
  Object.assign(attrs.chemistry, chem);
  if (opts.shotcalling !== undefined) attrs.gameKnowledge.shotcalling = opts.shotcalling;
  const p = makeTestPlayer({ id, age: opts.age ?? 22, attributes: attrs });
  p.identity.languageIds = (opts.langs ?? ['common']) as LanguageId[];
  return p;
}

describe('computePairTarget anchor points (design §2)', () => {
  it('a great pair ceilings high (~90+)', () => {
    const a = chemPlayer('a', 'bot', {
      ego: 25, temperament: 25, teamplayOrientation: 90, communication: 85,
      playstyleAggression: 50, playstyleTempo: 50, playstyleRiskTaking: 50,
    });
    const b = chemPlayer('b', 'support', {
      ego: 25, temperament: 25, teamplayOrientation: 90, communication: 85,
      playstyleAggression: 52, playstyleTempo: 48, playstyleRiskTaking: 50,
    });
    expect(computePairTarget(a, b)).toBeGreaterThan(88);
  });

  it('two selfish, high-ego, volatile players ceiling low (~25-45) regardless of skill', () => {
    const a = chemPlayer('a', 'mid', {
      ego: 95, temperament: 90, teamplayOrientation: 15, communication: 40,
      playstyleAggression: 90, playstyleTempo: 80, playstyleRiskTaking: 85,
    });
    const b = chemPlayer('b', 'top', {
      ego: 92, temperament: 85, teamplayOrientation: 20, communication: 45,
      playstyleAggression: 20, playstyleTempo: 25, playstyleRiskTaking: 20,
    });
    const t = computePairTarget(a, b);
    expect(t).toBeGreaterThan(20);
    expect(t).toBeLessThan(45);
  });

  it('is symmetric', () => {
    const a = chemPlayer('a', 'mid', { ego: 60, communication: 70 });
    const b = chemPlayer('b', 'jungle', { ego: 40, communication: 55 });
    expect(computePairTarget(a, b)).toBeCloseTo(computePairTarget(b, a), 9);
  });
});

describe('cohesion collapse reproduces design worked Example A', () => {
  // Build a lineup and hand-set currents to the spec's numbers to validate the collapse math.
  const roles: Role[] = ['top', 'jungle', 'mid', 'bot', 'support'];
  function lineupWith(shotcalls: Record<Role, number>, langs: Record<Role, string[]>): Lineup {
    const l = {} as Lineup;
    for (const r of roles) {
      l[r] = chemPlayer(`p_${r}`, r, { leadership: 50 }, { shotcalling: shotcalls[r], langs: langs[r] });
    }
    return l;
  }

  function chemFromCurrents(lineup: Lineup, currents: Record<string, number>): RosterChemistry {
    // currents keyed by role-pair like 'bot|support'
    const chem: RosterChemistry = { pairs: {} };
    for (let i = 0; i < roles.length; i++) {
      for (let j = i + 1; j < roles.length; j++) {
        const ra = roles[i]!;
        const rb = roles[j]!;
        const pa = lineup[ra];
        const pb = lineup[rb];
        const roleKey = [ra, rb].sort().join('|');
        const cur = currents[roleKey]!;
        chem.pairs[pairKey(pa.id, pb.id)] = {
          a: pa.id < pb.id ? pa.id : pb.id,
          b: pa.id < pb.id ? pb.id : pa.id,
          target: 100,
          current: cur,
          gelUnits: 10,
        };
      }
    }
    return chem;
  }

  it('Anvil (gelled, shared language, clean voices) → meshMult ≈ 1.055', () => {
    const lineup = lineupWith(
      { top: 50, jungle: 50, mid: 75, bot: 62, support: 50 }, // one clear caller + a deputy
      { top: ['coran'], jungle: ['coran'], mid: ['coran'], bot: ['coran'], support: ['coran'] },
    );
    const chem = chemFromCurrents(lineup, {
      'bot|support': 79, 'jungle|mid': 76, 'jungle|top': 72, 'bot|jungle': 74, 'jungle|support': 73,
      'mid|support': 70, 'bot|mid': 71, 'mid|top': 68, 'support|top': 66, 'bot|top': 67,
    });
    const c = computeCohesion(chem, lineup);
    expect(c.pairScore).toBeCloseTo(73.0, 0);
    expect(c.langCoverage).toBeCloseTo(1.0, 6);
    expect(c.shotBalance).toBeCloseTo(1.0, 2);
    expect(c.meshMult).toBeGreaterThan(1.04);
    expect(c.meshMult).toBeLessThan(1.07);
  });

  it('Allstars (fresh, no shared language, too many voices) → meshMult < 0.97', () => {
    const lineup = lineupWith(
      { top: 88, jungle: 85, mid: 90, bot: 60, support: 82 }, // four alphas calling
      { top: ['xin'], jungle: ['coran'], mid: ['bram'], bot: ['coran'], support: ['duun'] },
    );
    const chem = chemFromCurrents(lineup, {
      'bot|support': 40, 'jungle|mid': 34, 'jungle|top': 32, 'bot|jungle': 33, 'jungle|support': 31,
      'mid|support': 30, 'bot|mid': 35, 'mid|top': 28, 'support|top': 27, 'bot|top': 29,
    });
    const c = computeCohesion(chem, lineup);
    expect(c.pairScore).toBeCloseTo(33.0, 0);
    expect(c.voices).toBeGreaterThan(2.0);
    expect(c.shotBalance).toBeLessThan(1.0);
    expect(c.meshMult).toBeLessThan(0.97);
    expect(c.meshMult).toBeGreaterThan(0.93);
  });
});

describe('ramp + roster change dynamics', () => {
  const roles: Role[] = ['top', 'jungle', 'mid', 'bot', 'support'];
  function goodLineup(langsShared: boolean): Lineup {
    const l = {} as Lineup;
    roles.forEach((r, i) => {
      l[r] = chemPlayer(`p_${r}`, r,
        { ego: 30, temperament: 30, teamplayOrientation: 80, communication: 80, introversion: 30,
          playstyleAggression: 50, playstyleTempo: 50, playstyleRiskTaking: 50 },
        { langs: langsShared ? ['coran'] : [`lang_${i}`], shotcalling: r === 'mid' ? 75 : 50 });
    });
    return l;
  }

  it('shared-language rosters gel faster than split-language rosters', () => {
    const shared = goodLineup(true);
    const split = goodLineup(false);
    const cs = initRosterChemistry(shared);
    const cp = initRosterChemistry(split);
    for (let w = 0; w < 16; w++) {
      rampWeek(cs, shared, 1.0);
      rampWeek(cp, split, 1.0);
    }
    const sharedCohesion = computeCohesion(cs, shared).pairScore;
    const splitCohesion = computeCohesion(cp, split).pairScore;
    expect(sharedCohesion).toBeGreaterThan(splitCohesion + 8);
  });

  it('meshMult stays within [0.88, 1.12] and cohesion is monotonic under stable exposure', () => {
    const l = goodLineup(true);
    const chem = initRosterChemistry(l);
    let prev = -1;
    for (let w = 0; w < 30; w++) {
      rampWeek(chem, l, 1.0);
      const c = computeCohesion(chem, l);
      expect(c.meshMult).toBeGreaterThanOrEqual(0.88);
      expect(c.meshMult).toBeLessThanOrEqual(1.12);
      expect(c.cohesion).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = c.cohesion;
    }
  });

  it('a roster change preserves untouched pairs and resets the four touched pairs', () => {
    const l = goodLineup(true);
    let chem = initRosterChemistry(l);
    for (let w = 0; w < 16; w++) rampWeek(chem, l, 1.0);

    // record a pair NOT involving top (bot|support) and one involving top
    const botSupKey = pairKey(l.bot.id, l.support.id);
    const settledBotSup = chem.pairs[botSupKey]!.current;

    // swap the top laner for a fresh player
    const newTop = chemPlayer('p_newtop', 'top',
      { ego: 30, temperament: 30, teamplayOrientation: 80, communication: 80, introversion: 30 },
      { langs: ['coran'], shotcalling: 50 });
    const l2: Lineup = { ...l, top: newTop };
    chem = onLineupChange(chem, l2);

    // bot|support persists unchanged
    expect(chem.pairs[pairKey(l2.bot.id, l2.support.id)]!.current).toBeCloseTo(settledBotSup, 9);
    // the new top's pairs are reset near the floor (0.35*target)
    const newPair = chem.pairs[pairKey(newTop.id, l2.mid.id)]!;
    expect(newPair.current).toBeCloseTo(0.35 * newPair.target, 6);
  });
});
