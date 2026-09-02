/**
 * Game ticks — the watchable version of a resolved game.
 *
 * `simulateGame` decides the outcome (winner, length, kills, lines). This module
 * expands that result into a 30-second-step log consistent with it: a gold
 * trajectory, kills distributed across plausible windows, neutral objectives
 * (Wardens, the Battering Shade, the Colossus), falling bastions, and a
 * win-probability curve that converges on the result. The live view plays these
 * back at a chosen pace. Deterministic on a passed `Rng`.
 */

import type { Rng } from '../rng/rng.js';
import { clamp, round } from '../util/math.js';
import type { GameResult, PlayerLine } from './resolve.js';

export const TICK_SECONDS = 30;

export type TickEventType = 'firstBlood' | 'kill' | 'fight' | 'warden' | 'shade' | 'colossus' | 'bastion' | 'end';
export interface TickEvent {
  type: TickEventType;
  side: 'a' | 'b';
  text: string;
  player?: string;
  victim?: string;
}
export interface GameTick {
  i: number; // 1-based tick index
  t: number; // seconds elapsed
  goldDiff: number; // thousands, A − B
  killsA: number;
  killsB: number;
  wardens: [number, number];
  colossus: [number, number];
  bastions: [number, number];
  winProbA: number;
  events: TickEvent[];
}

const clock = (t: number): string => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;

function smoothstep(x: number): number {
  const c = clamp(x, 0, 1);
  return c * c * (3 - 2 * c);
}

function pickWeighted<T>(rng: Rng, items: readonly T[], weight: (x: T) => number): T {
  return rng.weighted(items, items.map((x) => weight(x) + 0.5));
}

const KILL_VERBS = ['takes down', 'picks off', 'finds', 'punishes', 'deletes', 'catches out'];

export function generateTicks(g: GameResult, aName: string, bName: string, rng: Rng): GameTick[] {
  const N = Math.max(20, Math.round(g.lengthMin * 2));
  const T = N * TICK_SECONDS;
  const aWins = g.winner === 'a';
  const name = (s: 'a' | 'b'): string => (s === 'a' ? aName : bName);
  const lines = (s: 'a' | 'b'): PlayerLine[] => (s === 'a' ? g.linesA : g.linesB);

  // final gold lead for the winner (k): bigger with a bigger kill gap
  const killGap = Math.abs(g.killsA - g.killsB);
  const finalGold = clamp(6 + 0.45 * killGap + rng.range(0, 3), 5, 18) * (aWins ? 1 : -1);

  // schedule kills into ticks (nothing before 2:30; laning-phase kills rarer than mid-game)
  const killWeight = (t: number): number => (t < 150 ? 0 : t < 600 ? 0.6 : t < 1500 ? 1.0 : 0.8);
  const tickIdx = Array.from({ length: N }, (_, i) => i + 1);
  const schedule = (count: number): number[] =>
    Array.from({ length: count }, () => pickWeighted(rng, tickIdx, (i) => killWeight(i * TICK_SECONDS)));
  const killsAt = { a: schedule(g.killsA), b: schedule(g.killsB) };

  // objective timings
  const wardenTimes: number[] = [];
  for (let t = 300; t < T - 90; t += 300 + rng.int(-30, 60)) wardenTimes.push(Math.round(t / 30) * 30);
  const shadeTime = T > 600 ? rng.int(16, Math.min(28, N - 2)) * 30 : -1;
  const colossusTimes: number[] = [];
  if (T > 1260) colossusTimes.push(rng.int(40, Math.min(48, N - 2)) * 30);
  if (T > 1900 && colossusTimes[0] !== undefined) colossusTimes.push(colossusTimes[0] + rng.int(10, 13) * 30);

  const ticks: GameTick[] = [];
  let killsA = 0, killsB = 0, noise = 0, firstBlood = false;
  const wardens: [number, number] = [0, 0], colossus: [number, number] = [0, 0], bastions: [number, number] = [0, 0];
  let nextBastionAt = 600 + rng.int(0, 4) * 30;

  for (let i = 1; i <= N; i++) {
    const t = i * TICK_SECONDS;
    const progress = i / N;
    const events: TickEvent[] = [];

    // gold: drift toward the final lead after laning, with autoregressive noise that fades late
    noise = noise * 0.85 + rng.gaussian(0, 0.35);
    const base = finalGold * smoothstep((t - 180) / Math.max(1, T - 180));
    let goldDiff = i === N ? finalGold : base + noise * (1 - progress * 0.6);
    const leader: 'a' | 'b' = goldDiff >= 0 ? 'a' : 'b';

    // kills this tick
    const ka = killsAt.a.filter((x) => x === i).length;
    const kb = killsAt.b.filter((x) => x === i).length;
    const addKill = (side: 'a' | 'b'): void => {
      const killer = pickWeighted(rng, lines(side), (l) => l.kills);
      const victim = pickWeighted(rng, lines(side === 'a' ? 'b' : 'a'), (l) => l.deaths);
      if (side === 'a') killsA++; else killsB++;
      if (!firstBlood) {
        firstBlood = true;
        events.push({ type: 'firstBlood', side, text: `${killer.name} ${rng.pick(KILL_VERBS)} ${victim.name} — first blood to ${name(side)}.`, player: killer.name, victim: victim.name });
      } else {
        events.push({ type: 'kill', side, text: `${killer.name} ${rng.pick(KILL_VERBS)} ${victim.name}.`, player: killer.name, victim: victim.name });
      }
      goldDiff += side === 'a' ? 0.3 : -0.3;
    };
    for (let k = 0; k < ka; k++) addKill('a');
    for (let k = 0; k < kb; k++) addKill('b');
    if (ka + kb >= 3) {
      const fightWinner: 'a' | 'b' = ka > kb ? 'a' : kb > ka ? 'b' : leader;
      events.push({ type: 'fight', side: fightWinner, text: `A teamfight breaks out — ${name(fightWinner)} come out ahead ${Math.max(ka, kb)}-for-${Math.min(ka, kb)}.` });
    }

    // objectives
    if (wardenTimes.includes(t)) {
      const owner: 'a' | 'b' = rng.chance(0.7) ? leader : (leader === 'a' ? 'b' : 'a');
      wardens[owner === 'a' ? 0 : 1]++;
      const n = wardens[owner === 'a' ? 0 : 1];
      events.push({ type: 'warden', side: owner, text: n >= 2 ? `${name(owner)} secure their ${n === 2 ? 'second' : n === 3 ? 'third' : 'fourth'} Warden — the scaling is online.` : `${name(owner)} take the first Warden.` });
      goldDiff += owner === 'a' ? 0.2 : -0.2;
    }
    if (t === shadeTime) {
      const owner: 'a' | 'b' = rng.chance(0.75) ? leader : (leader === 'a' ? 'b' : 'a');
      events.push({ type: 'shade', side: owner, text: `The Battering Shade slams a bastion for ${name(owner)}.` });
      bastions[owner === 'a' ? 0 : 1]++;
      goldDiff += owner === 'a' ? 0.4 : -0.4;
    }
    if (colossusTimes.includes(t)) {
      const stolen = !rng.chance(0.8);
      const owner: 'a' | 'b' = stolen ? (leader === 'a' ? 'b' : 'a') : leader;
      colossus[owner === 'a' ? 0 : 1]++;
      events.push({ type: 'colossus', side: owner, text: stolen ? `COLOSSUS STOLEN — ${name(owner)} snatch it from under ${name(leader)}!` : `${name(owner)} slay the Colossus.` });
      goldDiff += owner === 'a' ? 1.2 : -1.2;
    }
    if (t >= nextBastionAt && i < N) {
      const owner: 'a' | 'b' = rng.chance(0.8) ? leader : (leader === 'a' ? 'b' : 'a');
      bastions[owner === 'a' ? 0 : 1]++;
      events.push({ type: 'bastion', side: owner, text: `${name(owner)} knock down a bastion.` });
      nextBastionAt = t + (180 + rng.int(0, 6) * 30);
    }
    if (i === N) {
      const w: 'a' | 'b' = aWins ? 'a' : 'b';
      bastions[aWins ? 0 : 1] += 2;
      events.push({ type: 'end', side: w, text: `${name(w)} break the Keep — victory at ${clock(t)}.` });
    }

    // win probability: gold-driven, converging on the result over the last 15%
    const pGold = 1 / (1 + Math.pow(10, -goldDiff / 6));
    const w = clamp((progress - 0.85) / 0.15, 0, 1);
    const winProbA = i === N ? (aWins ? 1 : 0) : pGold * (1 - w) + (aWins ? 1 : 0) * w;

    ticks.push({
      i, t, goldDiff: round(goldDiff, 2), killsA, killsB,
      wardens: [wardens[0], wardens[1]], colossus: [colossus[0], colossus[1]], bastions: [bastions[0], bastions[1]],
      winProbA: round(winProbA, 3), events,
    });
  }
  return ticks;
}

/** The handful of moments worth a post-game summary. */
export function highlights(ticks: GameTick[]): { t: number; text: string }[] {
  const out: { t: number; text: string }[] = [];
  for (const tk of ticks) for (const e of tk.events) {
    if (e.type !== 'kill' && e.type !== 'bastion') out.push({ t: tk.t, text: e.text });
  }
  return out;
}
