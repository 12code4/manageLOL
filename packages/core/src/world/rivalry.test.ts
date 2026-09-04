import { describe, expect, it } from 'vitest';
import { Rng } from '../rng/rng.js';
import {
  grudgeLine,
  meetingWeight,
  nemesisOf,
  pickRival,
  recordLabel,
  recordMeeting,
  type Ledger,
  type RivalCandidate,
} from './rivalry.js';

const ctx = (weight: number, season = 1, week = 1) => ({ season, week, weight });

describe('meeting weight', () => {
  it('rises with the stakes: a weekend opener is the floor, a Gateway seat the ceiling', () => {
    const weekendR1 = meetingWeight({ rung: 'weekend' });
    const cupR1 = meetingWeight({ rung: 'contenders' });
    const gatewayFinal = meetingWeight({ rung: 'gateway', isFinal: true, seatOnLine: true });
    expect(weekendR1).toBeLessThan(cupR1);
    expect(cupR1).toBeLessThan(gatewayFinal);
    // A final of a rung weighs more than a first round of the same rung.
    expect(meetingWeight({ rung: 'contenders', isFinal: true })).toBeGreaterThan(cupR1);
  });
});

describe('the ledger', () => {
  it('accumulates games, a running score, and the last outcome without mutating its input', () => {
    const first = recordMeeting(undefined, 'rift', true, ctx(1));
    expect(first).toMatchObject({ opponent: 'rift', met: 1, won: 1, lost: 0, lastWon: true });

    const second = recordMeeting(first, 'rift', false, ctx(2, 1, 5));
    expect(second).toMatchObject({ met: 2, won: 1, lost: 1, lastWon: false, lastWeek: 5 });
    // The prior record is untouched — callers rely on it for "before this" lines.
    expect(first.met).toBe(1);
    // Intensity is the sum of the weights, not the count of meetings.
    expect(second.intensity).toBe(3);
  });
});

describe('the nemesis', () => {
  it('is the heaviest history, and null before anyone has been played', () => {
    expect(nemesisOf({})).toBeNull();

    const ledger: Ledger = {
      // Farmed on Saturdays: many games, light stakes.
      farmed: recordMeeting(recordMeeting(recordMeeting(undefined, 'farmed', true, ctx(1)), 'farmed', true, ctx(1)), 'farmed', true, ctx(1)),
      // Met once, but in a Gateway final — the meeting that mattered.
      real: recordMeeting(undefined, 'real', false, ctx(meetingWeight({ rung: 'gateway', isFinal: true, seatOnLine: true }))),
    };
    expect(nemesisOf(ledger)!.opponent).toBe('real');
  });

  it('breaks a tie on intensity by games played, then by a stable id', () => {
    const a = recordMeeting(undefined, 'aaa', true, ctx(2));
    const b2 = recordMeeting(recordMeeting(undefined, 'bbb', true, ctx(1)), 'bbb', true, ctx(1));
    // Equal intensity (2 vs 1+1); bbb has more meetings, so bbb wins.
    expect(nemesisOf({ aaa: a, bbb: b2 })!.opponent).toBe('bbb');
    // Fully equal: lowest id wins, deterministically.
    const c = recordMeeting(undefined, 'ccc', true, ctx(2));
    const d = recordMeeting(undefined, 'ddd', true, ctx(2));
    expect(nemesisOf({ ddd: d, ccc: c })!.opponent).toBe('ccc');
  });
});

describe('reading it back', () => {
  it('labels the record from the manager\'s side', () => {
    expect(recordLabel(undefined)).toBe('first meeting');
    expect(recordLabel(recordMeeting(undefined, 'x', true, ctx(1)))).toBe('1–0 up');
    const level = recordMeeting(recordMeeting(undefined, 'x', true, ctx(1)), 'x', false, ctx(1));
    expect(recordLabel(level)).toBe('1–1 level');
    expect(recordLabel(recordMeeting(level, 'x', false, ctx(1)))).toBe('1–2 down');
  });

  it('writes a grudge line only when there is a past, and reads revenge correctly', () => {
    // First meeting: no grudge.
    expect(grudgeLine(undefined, 'Rift', true)).toBeNull();
    // You were 0–2 down and just won: revenge.
    const down = recordMeeting(recordMeeting(undefined, 'r', false, ctx(1)), 'r', false, ctx(1));
    expect(grudgeLine(down, 'Rift', true)).toContain('Revenge');
    // They were behind and just beat you: they got one back.
    const up = recordMeeting(recordMeeting(undefined, 'r', true, ctx(1)), 'r', true, ctx(1));
    expect(grudgeLine(up, 'Rift', false)).toContain('back');
  });
});

describe('picking the one rival', () => {
  const rng = () => new Rng('rivalry-test', 'pick');

  it('is deterministic for the same candidates and seed', () => {
    const cands: RivalCandidate[] = [
      { id: 'a', prestige: 40, personality: 'academy' },
      { id: 'b', prestige: 55, personality: 'chaotic' },
      { id: 'c', prestige: 42, personality: 'methodical' },
    ];
    expect(pickRival(cands, 41, rng())).toBe(pickRival(cands, 41, rng()));
    // Insensitive to input order: the same club is picked whatever order the pool arrives in.
    expect(pickRival(cands.slice().reverse(), 41, rng())).toBe(pickRival(cands, 41, rng()));
  });

  it('favours a close-standing developer over a distant star', () => {
    const cands: RivalCandidate[] = [
      { id: 'peer', prestige: 41, personality: 'academy' }, // close + climber
      { id: 'star', prestige: 90, personality: 'superteam' }, // miles ahead
    ];
    expect(pickRival(cands, 40, rng())).toBe('peer');
  });

  it('degenerates to null on an empty pool', () => {
    expect(pickRival([], 40, rng())).toBeNull();
  });
});
