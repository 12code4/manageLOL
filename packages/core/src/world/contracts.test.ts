import { describe, expect, it } from 'vitest';
import { ORGS } from '@managelol/data';
import { Rng } from '../rng/rng.js';
import { generatePlayer } from '../players/generate.js';
import { currentAbility } from '../players/ratings.js';
import type { PlayerId } from '../util/ids.js';
import type { Player, RegionId } from '../players/types.js';
import { prestige, seedOrg, type Org, type PyramidTier } from './orgs.js';
import {
  ACCEPT_THRESHOLD,
  SEASON_WEEKS,
  WAGE_BASE,
  attractsApproach,
  bidInterest,
  defaultBuyout,
  evaluateOffer,
  financialState,
  offerToAccept,
  resolveBids,
  runwayWeeks,
  tickContracts,
  tierWageMult,
  wageBill,
  wageDemand,
  type Bid,
  type Contract,
} from './contracts.js';

const rng = (s: string): Rng => new Rng('contracts-test', s);

function player(opts: { ca: number; age?: number; potential?: number; ambition?: number; loyalty?: number; seed?: string }): Player {
  const age = opts.age ?? 22;
  const p = generatePlayer(rng(opts.seed ?? 'c'), {
    id: 'p1' as PlayerId,
    region: 'mer' as RegionId,
    qualityCenter: opts.ca,
    ageRange: [age, age],
    spread: 1.5,
  });
  p.identity.age = age;
  if (opts.potential !== undefined) p.attributes.growth.potential = opts.potential;
  if (opts.ambition !== undefined) p.attributes.personality.ambition = opts.ambition;
  if (opts.loyalty !== undefined) p.attributes.personality.loyalty = opts.loyalty;
  p.attributes.brand.starPower = 40;
  return p;
}

const org = (tier: PyramidTier, history: number, seed = 'o'): Org =>
  seedOrg(rng(seed), { identity: ORGS[0]!, tier, seasonsOfHistory: history });

const contract = (over: Partial<Contract> = {}): Contract => ({
  playerId: 'p1',
  orgId: 'o1',
  wage: 1,
  weeksRemaining: SEASON_WEEKS,
  signedSeason: 0,
  buyout: 90,
  role: 'mid',
  ...over,
});

describe('the wage curve', () => {
  it('is exponential in ability, so the last points cost the most', () => {
    const w = (ca: number): number => wageDemand(player({ ca, seed: `w${ca}` }), 2, 40);
    const steps = [50, 60, 70, 80, 90].map(w);
    for (let i = 1; i < steps.length; i++) expect(steps[i]!).toBeGreaterThan(steps[i - 1]!);
    // The 80 → 90 jump must dwarf the 50 → 60 one.
    expect(steps[4]! - steps[3]!).toBeGreaterThan((steps[1]! - steps[0]!) * 5);
    expect(w(50)).toBeCloseTo(WAGE_BASE * tierWageMult(2) * 1.1, 0);
  });

  it('a prospect is cheap relative to what they will become', () => {
    const kid = player({ ca: 55, age: 17, potential: 92, seed: 'kid' });
    const star = player({ ca: 88, age: 24, potential: 90, seed: 'star' });
    const kidWage = wageDemand(kid, 2, 40);
    const starWage = wageDemand(star, 2, 40);
    expect(kidWage).toBeLessThan(starWage / 4);
  });

  it('potential still carries a premium over an identical player with none', () => {
    const withCeiling = player({ ca: 60, age: 18, potential: 90, seed: 'pp' });
    const without = player({ ca: 60, age: 18, potential: 61, seed: 'pp' });
    expect(wageDemand(withCeiling, 2, 40)).toBeGreaterThan(wageDemand(without, 2, 40));
  });

  it('prestige is a real discount and higher tiers cost more', () => {
    const p = player({ ca: 78, seed: 'pd' });
    const dynasty = wageDemand(p, 1, 92);
    const nobody = wageDemand(p, 1, 5);
    expect(dynasty).toBeLessThan(nobody);
    expect(dynasty / nobody).toBeGreaterThan(0.78);
    expect(wageDemand(p, 1, 40)).toBeGreaterThan(wageDemand(p, 4, 40));
  });

  it('veterans past the cliff take a discount', () => {
    const vet = player({ ca: 78, age: 30, seed: 'v' });
    vet.attributes.growth.declineStartAge = 27;
    const peak = player({ ca: 78, age: 30, seed: 'v' });
    peak.attributes.growth.declineStartAge = 40;
    expect(wageDemand(vet, 2, 40)).toBeLessThan(wageDemand(peak, 2, 40));
  });

  it('a superteam is genuinely unaffordable below the top tier', () => {
    const five = [0, 1, 2, 3, 4].map((i) => player({ ca: 88, seed: `s${i}` }));
    const bill = five.reduce((s, p) => s + wageDemand(p, 2, 45), 0);
    expect(bill).toBeGreaterThan(10); // second-division revenue cannot carry this
  });
});

describe('negotiation', () => {
  it('a fair offer from a big name is accepted; a lowball is not', () => {
    const p = player({ ca: 76, ambition: 70, seed: 'n' });
    const big = { ...org(1, 18, 'big'), standing: 90, legacy: 70 };
    const fair = offerToAccept(p, big, 1, 0.9, false);
    expect(evaluateOffer(p, big, { wage: fair, weeks: SEASON_WEEKS, starterChance: 0.9, renewal: false }, 1).accepted).toBe(true);
    const low = evaluateOffer(p, big, { wage: fair * 0.4, weeks: SEASON_WEEKS, starterChance: 0.9, renewal: false }, 1);
    expect(low.accepted).toBe(false);
    expect(low.reason).toBe('the money is short');
  });

  it('an institution can sign the same player for less than a nobody can', () => {
    const p = player({ ca: 80, ambition: 85, seed: 'pull' });
    const dynasty = { ...org(1, 20, 'd'), standing: 92, legacy: 78 };
    const minnow = { ...org(1, 0, 'm'), standing: 20, legacy: 0 };
    expect(prestige(dynasty)).toBeGreaterThan(prestige(minnow));
    expect(offerToAccept(p, dynasty, 1, 0.9, false)).toBeLessThan(offerToAccept(p, minnow, 1, 0.9, false));
  });

  it('nobody signs to sit on a bench', () => {
    const p = player({ ca: 74, ambition: 80, seed: 'b' });
    const o = org(1, 10, 'b');
    const wage = offerToAccept(p, o, 1, 0.9, false);
    const benched = evaluateOffer(p, o, { wage, weeks: SEASON_WEEKS, starterChance: 0.1, renewal: false }, 1);
    expect(benched.accepted).toBe(false);
    expect(benched.reason).toBe('no guarantee of a starting seat');
  });

  it('loyalty makes a renewal cheaper than an outside offer', () => {
    const loyal = player({ ca: 75, loyalty: 90, ambition: 40, seed: 'l' });
    const o = org(2, 8, 'l');
    expect(offerToAccept(loyal, o, 2, 0.9, true)).toBeLessThan(offerToAccept(loyal, o, 2, 0.9, false));
  });

  it('utility is bounded and the threshold is the documented one', () => {
    const p = player({ ca: 70, seed: 'u' });
    const o = org(2, 5, 'u');
    const huge = evaluateOffer(p, o, { wage: 999, weeks: SEASON_WEEKS, starterChance: 1, renewal: true }, 2);
    expect(huge.utility).toBeLessThanOrEqual(1.6);
    expect(huge.accepted).toBe(true);
    expect(ACCEPT_THRESHOLD).toBeGreaterThan(0);
  });
});

describe('the wage bill', () => {
  it('sums, computes runway and names the financial state', () => {
    const roster = [contract({ wage: 1.2 }), contract({ wage: 0.8 }), contract({ wage: 2 })];
    expect(wageBill(roster)).toBeCloseTo(4, 6);

    const rich = { ...org(1, 10, 'f'), cash: 400 };
    expect(runwayWeeks(rich, roster, 10)).toBe(Infinity);
    expect(financialState(rich, roster, 10)).toBe('healthy');

    const squeezed = { ...org(2, 4, 'f'), cash: 60 };
    expect(runwayWeeks(squeezed, roster, 2)).toBe(30);
    expect(financialState(squeezed, roster, 2)).toBe('tight');
    expect(financialState({ ...squeezed, cash: 12 }, roster, 2)).toBe('critical');
    expect(financialState({ ...squeezed, cash: -1 }, roster, 2)).toBe('insolvent');
  });

  it('buyouts scale with what is left on the deal', () => {
    expect(defaultBuyout(2, SEASON_WEEKS)).toBeGreaterThan(defaultBuyout(2, 10));
  });

  it('ticking expires contracts exactly once', () => {
    const roster = [contract({ playerId: 'a', weeksRemaining: 1 }), contract({ playerId: 'b', weeksRemaining: 5 })];
    expect(tickContracts(roster).map((c) => c.playerId)).toEqual(['a']);
    expect(tickContracts(roster)).toEqual([]); // an expiry is reported exactly once
    expect(roster[0]!.weeksRemaining).toBe(0);
    expect(roster[1]!.weeksRemaining).toBe(3);
  });
});

describe('the market', () => {
  it('an org only bids on an upgrade it can afford', () => {
    const target = player({ ca: 84, seed: 'm' });
    const o = { ...org(1, 12, 'm'), personality: 'superteam' as const };
    expect(bidInterest(o, target, { incumbentAbility: 88, tier: 1, budgetPerWeek: 20 })).toBe(0);
    expect(bidInterest(o, target, { incumbentAbility: 68, tier: 1, budgetPerWeek: 0.2 })).toBe(0);
    expect(bidInterest(o, target, { incumbentAbility: 68, tier: 1, budgetPerWeek: 20 })).toBeGreaterThan(0);
  });

  it('an academy org values potential where a superteam values ability', () => {
    const kid = player({ ca: 62, age: 17, potential: 93, seed: 'k' });
    const base = { incumbentAbility: 60, tier: 2 as PyramidTier, budgetPerWeek: 12 };
    const academy = { ...org(2, 6, 'a'), personality: 'academy' as const };
    const superteam = { ...org(2, 6, 'a'), personality: 'superteam' as const };
    expect(bidInterest(academy, kid, base)).toBeGreaterThan(bidInterest(superteam, kid, base));
  });

  it('competing bids resolve by what the player values, then by id — never by arrival order', () => {
    const p = player({ ca: 80, ambition: 88, seed: 'r' });
    const dynasty = { ...org(1, 20, 'r1'), id: 'dynasty', standing: 94, legacy: 80 };
    const rich = { ...org(1, 1, 'r2'), id: 'arich', standing: 30, legacy: 2 };
    const orgs = { dynasty, arich: rich };
    const wage = Math.max(offerToAccept(p, dynasty, 1, 0.85, false), offerToAccept(p, rich, 1, 0.85, false)) * 1.2;
    const bids: Bid[] = [
      { orgId: 'arich', playerId: 'p1', wage, weeks: SEASON_WEEKS, fee: 0, interest: 0.9 },
      { orgId: 'dynasty', playerId: 'p1', wage, weeks: SEASON_WEEKS, fee: 0, interest: 0.9 },
    ];
    expect(resolveBids(p, bids, orgs, 1)?.orgId).toBe('dynasty');
    expect(resolveBids(p, [...bids].reverse(), orgs, 1)?.orgId).toBe('dynasty');
    // Nobody wins when nobody clears the bar.
    const stingy = bids.map((b) => ({ ...b, wage: 0.01 }));
    expect(resolveBids(p, stingy, orgs, 1)).toBeNull();
  });

  it('short contracts attract approaches and long ones protect', () => {
    const star = player({ ca: 86, seed: 'ap' });
    const count = (weeks: number): number =>
      Array.from({ length: 500 }, (_, i) => attractsApproach(contract({ weeksRemaining: weeks }), star, rng(`ap${i}`))).filter(Boolean).length;
    expect(count(8)).toBeGreaterThan(count(SEASON_WEEKS * 2) * 2);
    // A squad player is left alone entirely.
    const filler = player({ ca: 48, seed: 'fil' });
    expect(attractsApproach(contract({ weeksRemaining: 4 }), filler, rng('x'))).toBe(false);
    expect(currentAbility(filler.attributes)).toBeLessThan(55);
  });
});
