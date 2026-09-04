import { describe, expect, it } from 'vitest';
import { Rng } from '../rng/rng.js';
import { buildBracket, playBracket, type BracketMatch } from './bracket.js';
import {
  CIRCUIT,
  EVENT_BY_RUNG,
  GATEWAY_PRIZE_TIER,
  GRASSROOTS_STIPEND,
  OPEN_WAGE_MULT,
  RUNGS,
  SEAT_BUY_IN_COST,
  canBuySeat,
  canEnter,
  eventsForMatchWeek,
  nextUnlock,
  placementOf,
  repGain,
  rewardFor,
  seatOfferFor,
  type Placement,
} from './circuit.js';
import { tierWageMult } from '../world/contracts.js';

const rng = (s: string): Rng => new Rng('circuit-test', s);

describe('the three rungs', () => {
  it('climb in every dimension — cost, field, prize, gate and ceiling', () => {
    expect(CIRCUIT).toHaveLength(3);
    for (let i = 1; i < CIRCUIT.length; i++) {
      const lo = CIRCUIT[i - 1]!;
      const hi = CIRCUIT[i]!;
      expect(hi.entryFee).toBeGreaterThan(lo.entryFee);
      expect(hi.repGate).toBeGreaterThan(lo.repGate);
      expect(hi.repCap).toBeGreaterThan(lo.repCap);
      expect(hi.purse.winner).toBeGreaterThan(lo.purse.winner);
      expect(hi.points.winner).toBeGreaterThan(lo.points.winner);
      expect(hi.repBase.winner).toBeGreaterThan(lo.repBase.winner);
      expect(hi.fieldSize).toBeGreaterThanOrEqual(lo.fieldSize);
    }
    expect(RUNGS).toEqual(CIRCUIT.map((e) => e.id));
    for (const e of CIRCUIT) expect(e.blurb.length).toBeGreaterThan(20);
  });

  it('never turns a title on a single game', () => {
    for (const e of CIRCUIT) expect(e.finalBestOf).toBeGreaterThan(1);
  });

  it('opens the bottom rung to everyone', () => {
    expect(EVENT_BY_RUNG.weekend.repGate).toBe(0);
    expect(canEnter(EVENT_BY_RUNG.weekend, { reputation: 0, cash: 100, rosterFilled: true }).allowed).toBe(true);
  });
});

describe('reputation is a ladder, not a treadmill', () => {
  it('shrinks toward each rung ceiling and stops dead at it', () => {
    const weekend = EVENT_BY_RUNG.weekend;
    expect(repGain(weekend, 'winner', 0)).toBeCloseTo(weekend.repBase.winner, 3);
    expect(repGain(weekend, 'winner', weekend.repCap / 2)).toBeCloseTo(weekend.repBase.winner / 2, 3);
    expect(repGain(weekend, 'winner', weekend.repCap)).toBe(0);
    expect(repGain(weekend, 'winner', weekend.repCap + 40)).toBe(0);
  });

  it('cannot be farmed from the bottom rung into a league seat', () => {
    // Win every weekend open for two full seasons and see where it leaves you.
    const weekend = EVENT_BY_RUNG.weekend;
    let rep = 3;
    for (let i = 0; i < 60; i++) rep += repGain(weekend, 'winner', rep);
    expect(rep).toBeLessThan(weekend.repCap);
    expect(rep).toBeLessThan(EVENT_BY_RUNG.gateway.repGate); // the Gateway stays shut
    expect(rep).toBeGreaterThan(EVENT_BY_RUNG.contenders.repGate); // but the Cup opens
  });

  it('unlocks the Contenders Cup inside a first season of decent results', () => {
    // A team that wins a quarter of its opens and reaches a semi in half.
    const weekend = EVENT_BY_RUNG.weekend;
    const run: Placement[] = ['winner', 'semi', 'semi', 'quarter'];
    let rep = 3;
    let entries = 0;
    while (rep < EVENT_BY_RUNG.contenders.repGate && entries < 200) {
      rep += repGain(weekend, run[entries % run.length]!, rep);
      entries++;
    }
    expect(entries).toBeLessThanOrEqual(18); // one season of match weeks
    expect(entries).toBeGreaterThan(4); // ...but never in a month
  });

  it('reaches the Gateway gate on the Cup, in a second season', () => {
    const cup = EVENT_BY_RUNG.contenders;
    const run: Placement[] = ['semi', 'winner', 'quarter', 'finalist'];
    let rep = 14;
    let entries = 0;
    while (rep < EVENT_BY_RUNG.gateway.repGate && entries < 100) {
      rep += repGain(cup, run[entries % run.length]!, rep);
      entries++;
    }
    // The Cup runs every fourth match week: about four or five a season, so
    // this has to land inside two seasons of Cups — and weekend opens are
    // topping the same number up in parallel, which makes it sooner still.
    expect(entries).toBeLessThanOrEqual(7);
    expect(entries).toBeGreaterThanOrEqual(2);
  });

  it('names the next locked rung and the distance to it', () => {
    expect(nextUnlock(0)!.event.id).toBe('contenders');
    expect(nextUnlock(0)!.short).toBe(12);
    expect(nextUnlock(20)!.event.id).toBe('gateway');
    expect(nextUnlock(20)!.short).toBe(10);
    expect(nextUnlock(40)).toBeNull();
  });
});

describe('entry', () => {
  it('refuses without five players, without reputation, or without the fee', () => {
    const cup = EVENT_BY_RUNG.contenders;
    expect(canEnter(cup, { reputation: 50, cash: 50, rosterFilled: false }).reason).toBe('roster');
    const short = canEnter(cup, { reputation: 5, cash: 50, rosterFilled: true });
    expect(short.allowed).toBe(false);
    expect(short.reason).toBe('reputation');
    expect(short.repShort).toBe(7);
    expect(canEnter(cup, { reputation: 50, cash: 1, rosterFilled: true }).reason).toBe('money');
    expect(canEnter(cup, { reputation: 50, cash: 50, rosterFilled: true }).allowed).toBe(true);
  });
});

describe('the calendar of the Open', () => {
  it('runs a weekend open every match week and a cup every fourth', () => {
    const weeks = Array.from({ length: 9 }, (_, i) => eventsForMatchWeek(i, 3 + i).map((e) => e.id));
    expect(weeks.every((w) => w.includes('weekend'))).toBe(true);
    expect(weeks.filter((w) => w.includes('contenders'))).toHaveLength(3); // indices 0, 4, 8
  });

  it('puts the Gateway on its fixed weeks only, and leads with it', () => {
    expect(eventsForMatchWeek(5, 12).map((e) => e.id)[0]).toBe('gateway');
    expect(eventsForMatchWeek(5, 41).map((e) => e.id)).toContain('gateway');
    expect(eventsForMatchWeek(5, 13).map((e) => e.id)).not.toContain('gateway');
  });
});

describe('placements and rewards', () => {
  it('reads a placement off a bracket exit', () => {
    // A 16-team bracket is 4 rounds deep.
    expect(placementOf(4, 4, true)).toBe('winner');
    expect(placementOf(4, 4, false)).toBe('finalist');
    expect(placementOf(4, 3, false)).toBe('semi');
    expect(placementOf(4, 2, false)).toBe('quarter');
    expect(placementOf(4, 1, false)).toBe('entered');
  });

  it('nets the entry fee off the purse, so a bad run costs real money', () => {
    const weekend = EVENT_BY_RUNG.weekend;
    expect(rewardFor(weekend, 'entered', 10).cash).toBe(-weekend.entryFee);
    expect(rewardFor(weekend, 'quarter', 10).cash).toBeLessThan(0);
    expect(rewardFor(weekend, 'winner', 10).cash).toBeGreaterThan(0);
  });

  it('pays a winning team enough to live on, and a losing one not nearly', () => {
    const weekend = EVENT_BY_RUNG.weekend;
    // A weekly wage bill of roughly 1.5 credits is the thing being covered.
    expect(rewardFor(weekend, 'winner', 0).cash).toBeGreaterThan(1.5 * 2);
    expect(rewardFor(weekend, 'semi', 0).cash).toBeLessThan(1.5);
  });

  it('an unaffiliated org cannot live on its stipend alone', () => {
    // The squeeze that makes tournaments matter: no league seat, no revenue.
    expect(GRASSROOTS_STIPEND).toBeLessThan(1);
    expect(OPEN_WAGE_MULT).toBeLessThan(tierWageMult(4));
  });
});

describe('running a real tournament', () => {
  it('produces one winner and a coherent set of placements', () => {
    const cup = EVENT_BY_RUNG.contenders;
    const field = Array.from({ length: cup.fieldSize }, (_, i) => `org${i}`);
    const b = buildBracket(field, cup.bestOf);
    const r = rng('cup');
    const exits = new Map<string, number>();
    playBracket(b, (m: BracketMatch) => {
      const aWins = r.chance(0.5);
      const winner = aWins ? m.a! : m.b!;
      const loser = aWins ? m.b! : m.a!;
      exits.set(loser, m.round);
      return { winner, score: [2, 1] as [number, number] };
    }, r);

    expect(b.champion).not.toBeNull();
    expect(b.matches).toHaveLength(cup.fieldSize - 1);

    const places = field.map((o) =>
      o === b.champion ? 'winner' : placementOf(b.rounds, exits.get(o) ?? 1, false),
    );
    expect(places.filter((p) => p === 'winner')).toHaveLength(1);
    expect(places.filter((p) => p === 'finalist')).toHaveLength(1);
    expect(places.filter((p) => p === 'semi')).toHaveLength(2);
    expect(places.filter((p) => p === 'quarter')).toHaveLength(4);
    expect(places.filter((p) => p === 'entered')).toHaveLength(8);
  });

  it('a full field never pays out more than the purse can bear', () => {
    for (const e of CIRCUIT) {
      const counts: Record<Placement, number> = { winner: 1, finalist: 1, semi: 2, quarter: 4, entered: e.fieldSize - 8 };
      let paid = 0;
      let taken = 0;
      for (const p of Object.keys(counts) as Placement[]) {
        const n = Math.max(0, counts[p]);
        paid += e.purse[p] * n;
        taken += e.entryFee * n;
      }
      // The organiser tops the pot up — an amateur circuit is subsidised, and
      // it has to be, or the scene is a closed loop that can only shrink.
      expect(paid).toBeGreaterThan(taken);
      expect(paid).toBeLessThan(taken * 12);
    }
  });
});

describe('buying a seat', () => {
  it('costs more and asks more the higher the vacancy', () => {
    const t3 = seatOfferFor(3, 'Saltflats', 44);
    const t1 = seatOfferFor(1, 'Hallowvane', 44);
    expect(t3.cost).toBe(SEAT_BUY_IN_COST);
    expect(t1.cost).toBeGreaterThan(t3.cost * 3);
    expect(t1.repRequired).toBeGreaterThan(t3.repRequired);
    expect(t3.expiresWeek).toBe(47);
    expect(t3.vacatedBy).toBe('Saltflats');
  });

  it('will not sell to a nobody, however rich', () => {
    const offer = seatOfferFor(3, 'Tin House', 44);
    expect(canBuySeat(offer, { reputation: 4, cash: 9999 }).reason).toBe('reputation');
    expect(canBuySeat(offer, { reputation: 40, cash: 10 }).reason).toBe('money');
    expect(canBuySeat(offer, { reputation: 40, cash: 200 }).allowed).toBe(true);
  });

  it('is a genuine alternative to winning, not a shortcut past the climb', () => {
    // Buying in still asks more reputation than the Contenders Cup gate, so a
    // manager has to have actually competed before anyone sells them a seat.
    expect(seatOfferFor(3, 'x', 1).repRequired).toBeGreaterThan(EVENT_BY_RUNG.contenders.repGate);
    // ...but less than winning the Gateway would have required.
    expect(seatOfferFor(3, 'x', 1).repRequired).toBeLessThan(EVENT_BY_RUNG.gateway.repGate);
  });

  it('sends the winner of the Gateway into the widest band of the pyramid', () => {
    expect(GATEWAY_PRIZE_TIER).toBe(3);
  });
});
