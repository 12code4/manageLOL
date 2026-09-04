import { winProbFromDiff, MATCH_SCALE } from '@managelol/core';
const wp = (d: number) => winProbFromDiff(d, MATCH_SCALE);
const bo3 = (p: number) => p * p * (3 - 2 * p);
const bo = (p: number, n: number) => (n === 1 ? p : bo3(p));
function mk(seed: number) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

interface Comp {
  name: string; size: number; bestOf: number; finalBestOf: number;
  entry: number; purse: number[]; // [win, final, semi] (semi paid to both semifinalists)
  gate: number; cap: number; base: number[]; // [win, final, semi, quarter, entered]
  points: number[];
}

/** returns rounds-won (0..log2(size)) for the player */
function play(you: number, mu: number, sd: number, size: number, bof: number, fbof: number, rnd: () => number): number {
  const field = [you];
  for (let i = 1; i < size; i++) { let s = 0; for (let k = 0; k < 6; k++) s += rnd(); field.push(mu + (s - 3) * sd * 0.7071); }
  for (let i = field.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = field[i]!; field[i] = field[j]!; field[j] = t; }
  let cur = field; const rounds = Math.log2(size); let won = 0;
  for (let r = 1; r <= rounds; r++) {
    const nxt: number[] = []; const b = r === rounds ? fbof : bof;
    for (let i = 0; i < cur.length; i += 2) { const a = cur[i]!, c = cur[i + 1]!; nxt.push(rnd() < bo(wp(a - c), b) ? a : c); }
    cur = nxt; if (cur.indexOf(you) < 0) break; won = r;
  }
  return won;
}

function band(won: number, rounds: number): number { // 0 win,1 final,2 semi,3 quarter,4 entered
  if (won === rounds) return 0;
  if (won === rounds - 1) return 1;
  if (won === rounds - 2) return 2;
  if (won === rounds - 3) return 3;
  return 4;
}

interface Cfg {
  stipend: number; opex: number; wage: number; sponsorBase: number; sponsorPerRep: number;
  startCash: number; signingCost: number;
  openWeeks: number[]; regionalWeeks: number[]; gatewayWeeks: number[];
  local: Comp; regional: Comp; gateway: Comp;
  buyPrice: number; buyRep: number;
}

function career(cfg: Cfg, playerStrength: (season: number, week: number) => number, mu: number, seasons: number, seed: number, verbose = false) {
  const rnd = mk(seed);
  let rep = 3, cash = cfg.startCash - cfg.signingCost;
  let seatSeason = 0, seatHow = '';
  let minCash = cash;
  const log: string[] = [];
  for (let s = 1; s <= seasons && !seatSeason; s++) {
    let pts = 0;
    for (let w = 1; w <= 52; w++) {
      const you = playerStrength(s, w);
      cash += cfg.stipend - cfg.opex - cfg.wage + cfg.sponsorBase + cfg.sponsorPerRep * rep;
      const enter = (c: Comp): void => {
        if (rep < c.gate || cash < c.entry) return;
        cash -= c.entry;
        const rounds = Math.log2(c.size);
        const won = play(you, mu, 2.8, c.size, c.bestOf, c.finalBestOf, rnd);
        const b = band(won, rounds);
        rep += c.base[b]! * Math.max(0, 1 - rep / c.cap);
        cash += c.purse[b] ?? 0;
        pts += c.points[b] ?? 0;
        if (c === cfg.gateway && b === 0) { seatSeason = s; seatHow = 'Gateway w' + w; }
      };
      if (cfg.gatewayWeeks.includes(w)) enter(cfg.gateway);
      else if (cfg.regionalWeeks.includes(w)) enter(cfg.regional);
      else if (cfg.openWeeks.includes(w)) enter(cfg.local);
      if (cash < minCash) minCash = cash;
      if (!seatSeason && rep >= cfg.buyRep && cash >= cfg.buyPrice && w === 44) { seatSeason = s; seatHow = 'bought a folded seat'; cash -= cfg.buyPrice; }
      if (seatSeason) break;
    }
    if (verbose) log.push(`  S${s}: rep ${rep.toFixed(1)}  cash ${cash.toFixed(1)}  circuitPts ${pts}`);
  }
  return { rep, cash, minCash, seatSeason, seatHow, log };
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// ─── the design as written ───
const AS_WRITTEN: Cfg = {
  stipend: 0.5, opex: 0.25, wage: 1.54, sponsorBase: 0.6, sponsorPerRep: 0,
  startCash: 100, signingCost: 13,
  openWeeks: [...range(3, 11), ...range(20, 28)],
  regionalWeeks: [4, 8, 24, 28].filter(() => true),
  gatewayWeeks: [12, 41],
  local: { name: 'open', size: 8, bestOf: 1, finalBestOf: 1, entry: 1, purse: [6, 2.5, 1], gate: 0, cap: 25, base: [6, 3, 1.5, 0.5, 0.5], points: [10, 6, 3, 1, 0] },
  regional: { name: 'cup', size: 16, bestOf: 1, finalBestOf: 3, entry: 3, purse: [16, 7, 3], gate: 12, cap: 45, base: [12, 7, 4, 1.5, 0.5], points: [25, 15, 9, 4, 1] },
  gateway: { name: 'gateway', size: 16, bestOf: 3, finalBestOf: 3, entry: 8, purse: [0, 0, 0], gate: 30, cap: 68, base: [20, 13, 8, 3, 1], points: [40, 25, 15, 6, 2] },
  buyPrice: 140, buyRep: 20,
};
// regionalWeeks every 4 weeks across both splits
AS_WRITTEN.regionalWeeks = [4, 8, 21, 25].concat([]);

function report(label: string, cfg: Cfg, mu: number, strengths: Array<[string, (s: number, w: number) => number]>) {
  console.log('\n──── ' + label + '  (floating pool mean strength ' + mu + ') ────');
  for (const [nm, fn] of strengths) {
    let seat: number[] = []; let never = 0; let cashEnd = 0; let repEnd = 0; let minC = 0; let broke = 0;
    const N = 400;
    for (let i = 0; i < N; i++) {
      const r = career(cfg, fn, mu, 6, 1000 + i * 7);
      if (r.seatSeason) seat.push(r.seatSeason); else never++;
      cashEnd += r.cash; repEnd += r.rep; minC += r.minCash;
      if (r.minCash < 0) broke++;
    }
    seat.sort((a, b) => a - b);
    const med = seat.length ? seat[Math.floor(seat.length / 2)] : null;
    console.log(`${nm}  seat by S${med ?? '-'} (median of ${seat.length}/${N} seated in 6 seasons)  P(seat by S2)=${(seat.filter(x=>x<=2).length/N*100).toFixed(0)}%  P(by S3)=${(seat.filter(x=>x<=3).length/N*100).toFixed(0)}%  P(by S4)=${(seat.filter(x=>x<=4).length/N*100).toFixed(0)}%  endCash ${(cashEnd/N).toFixed(0)}  minCash ${(minC/N).toFixed(0)}  wentNegative ${(broke/N*100).toFixed(0)}%  endRep ${(repEnd/N).toFixed(0)}`);
  }
}

// player strength profiles. Season 1: signs 5x Onyx I, chem ramps over the season.
// Season 2+: upgrades one or two seats.
const weak = (s: number, w: number) => 50.0 + Math.min(4.1, w * 0.28) + (s - 1) * 0.8;
const median = (s: number, w: number) => 50.0 + Math.min(4.1, w * 0.28) + (s - 1) * 1.6;
const good = (s: number, w: number) => 51.2 + Math.min(4.2, w * 0.28) + (s - 1) * 2.2;
const great = (s: number, w: number) => 52.1 + Math.min(4.3, w * 0.28) + (s - 1) * 3.0;
const profiles: Array<[string, (s: number, w: number) => number]> = [
  ['careless (5x Onyx, no upgrades)  ', weak],
  ['average  (5x Onyx, slow upgrades)', median],
  ['good     (1 Ascendant + upgrades)', good],
  ['strong   (2 Ascendant + upgrades)', great],
];

for (const mu of [54, 52, 50.6, 48]) report('DESIGN AS WRITTEN', AS_WRITTEN, mu, profiles);

// ─── tuned ───
const TUNED: Cfg = JSON.parse(JSON.stringify(AS_WRITTEN));
TUNED.stipend = 0.9; TUNED.opex = 0.55; TUNED.wage = 1.54; TUNED.sponsorBase = 0.55; TUNED.sponsorPerRep = 0.022;
TUNED.startCash = 100; TUNED.signingCost = 14;
TUNED.openWeeks = [...range(3, 11), ...range(20, 31)];
TUNED.regionalWeeks = [12, 13, 14, 32, 33, 34];
TUNED.gatewayWeeks = [19, 43];
TUNED.local = { name: 'open', size: 8, bestOf: 1, finalBestOf: 1, entry: 1, purse: [7, 3, 1.2], gate: 0, cap: 26, base: [7, 3.4, 1.7, 0.6, 0.6], points: [10, 6, 3, 1, 0] };
TUNED.regional = { name: 'cup', size: 16, bestOf: 1, finalBestOf: 3, entry: 3, purse: [24, 11, 5], gate: 12, cap: 46, base: [14, 8, 4.5, 1.8, 0.6], points: [25, 15, 9, 4, 1] };
TUNED.gateway = { name: 'gateway', size: 16, bestOf: 3, finalBestOf: 3, entry: 6, purse: [0, 12, 5], gate: 28, cap: 68, base: [20, 13, 8, 3, 1], points: [40, 25, 15, 6, 2] };
TUNED.buyPrice = 90; TUNED.buyRep = 22;
for (const mu of [50.6]) report('TUNED', TUNED, mu, profiles);

// verbose single careers
console.log('\n── sample tuned careers (good profile, mu 50.6) ──');
for (let i = 0; i < 4; i++) {
  const r = career(TUNED, good, 50.6, 6, 500 + i * 13, true);
  console.log(`seed ${i}: seat in S${r.seatSeason || '-'} (${r.seatHow})`);
  r.log.forEach((l) => console.log(l));
}
