import { winProbFromDiff, MATCH_SCALE } from '@managelol/core';
const wp = (d: number) => winProbFromDiff(d, MATCH_SCALE);
const bo3 = (p: number) => p * p * (3 - 2 * p);
const bo = (p: number, n: number) => (n === 1 ? p : bo3(p));
function mk(seed: number) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
interface Comp { size: number; bestOf: number; finalBestOf: number; entry: number; purse: number[]; gate: number; cap: number; base: number[]; points: number[]; }
function play(you: number, mu: number, sd: number, size: number, bof: number, fbof: number, rnd: () => number): number {
  const field = [you];
  for (let i = 1; i < size; i++) { let s = 0; for (let k = 0; k < 6; k++) s += rnd(); field.push(mu + (s - 3) * sd * 0.7071); }
  for (let i = field.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = field[i]!; field[i] = field[j]!; field[j] = t; }
  let cur = field; const rounds = Math.log2(size); let won = 0;
  for (let r = 1; r <= rounds; r++) { const nxt: number[] = []; const b = r === rounds ? fbof : bof;
    for (let i = 0; i < cur.length; i += 2) { const a = cur[i]!, c = cur[i + 1]!; nxt.push(rnd() < bo(wp(a - c), b) ? a : c); }
    cur = nxt; if (cur.indexOf(you) < 0) break; won = r; }
  return won;
}
const bandOf = (won: number, rounds: number) => Math.min(4, Math.max(0, rounds - won));
interface Cfg { stipend: number; hardship: number; opex: number; wage: number; sponsorBase: number; sponsorPerRep: number; startCash: number; signingCost: number; openWeeks: number[]; regionalWeeks: number[]; gatewayWeeks: number[]; local: Comp; regional: Comp; gateway: Comp; buyPrice: number; buyRep: number; }
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

function career(cfg: Cfg, str: (s: number, w: number) => number, mu: number, seasons: number, seed: number) {
  const rnd = mk(seed);
  let rep = 3, cash = cfg.startCash - cfg.signingCost, minCash = cash;
  let seatSeason = 0, how = '', firstGateEligible = 0, gatewayTries = 0;
  const perSeason: { rep: number; cash: number; pts: number }[] = [];
  for (let s = 1; s <= seasons && !seatSeason; s++) {
    let pts = 0;
    for (let w = 1; w <= 52; w++) {
      const you = str(s, w);
      const hardship = cash < 8 ? cfg.hardship : 0;
      cash += cfg.stipend + hardship - cfg.opex - cfg.wage + cfg.sponsorBase + cfg.sponsorPerRep * rep;
      const enter = (c: Comp, isGate: boolean): void => {
        if (rep < c.gate || cash < c.entry) return;
        if (isGate) gatewayTries++;
        cash -= c.entry;
        const rounds = Math.log2(c.size);
        const b = bandOf(play(you, mu, 2.8, c.size, c.bestOf, c.finalBestOf, rnd), rounds);
        rep += c.base[b]! * Math.max(0, 1 - rep / c.cap);
        cash += c.purse[b] ?? 0; pts += c.points[b] ?? 0;
        if (isGate && b === 0) { seatSeason = s; how = 'gateway'; }
      };
      if (cfg.gatewayWeeks.includes(w)) enter(cfg.gateway, true);
      else if (cfg.regionalWeeks.includes(w)) enter(cfg.regional, false);
      else if (cfg.openWeeks.includes(w)) enter(cfg.local, false);
      if (!firstGateEligible && rep >= cfg.gateway.gate) firstGateEligible = (s - 1) * 52 + w;
      if (cash < minCash) minCash = cash;
      if (!seatSeason && w === 44 && rep >= cfg.buyRep && cash >= cfg.buyPrice) { seatSeason = s; how = 'bought'; cash -= cfg.buyPrice; }
      if (seatSeason) break;
    }
    perSeason.push({ rep: +rep.toFixed(1), cash: +cash.toFixed(1), pts });
  }
  return { rep, cash, minCash, seatSeason, how, firstGateEligible, gatewayTries, perSeason };
}

const weak = (s: number, w: number) => 50.0 + Math.min(4.1, w * 0.28) + (s - 1) * 0.8;
const median = (s: number, w: number) => 50.0 + Math.min(4.1, w * 0.28) + (s - 1) * 1.6;
const good = (s: number, w: number) => 51.2 + Math.min(4.2, w * 0.28) + (s - 1) * 2.2;
const great = (s: number, w: number) => 52.1 + Math.min(4.3, w * 0.28) + (s - 1) * 3.0;
const profiles: Array<[string, (s: number, w: number) => number]> = [['careless', weak], ['average ', median], ['good    ', good], ['strong  ', great]];

function report(label: string, cfg: Cfg, mu: number) {
  console.log('\n──── ' + label + '  mu=' + mu + ' ────');
  for (const [nm, fn] of profiles) {
    const N = 500; const seat: number[] = []; let cashEnd = 0, minC = 0, broke = 0, bought = 0, gateW = 0, repEnd = 0, elig = 0, eligN = 0;
    for (let i = 0; i < N; i++) {
      const r = career(cfg, fn, mu, 6, 2000 + i * 11);
      if (r.seatSeason) { seat.push(r.seatSeason); if (r.how === 'bought') bought++; else gateW++; }
      cashEnd += r.cash; minC += r.minCash; repEnd += r.rep; if (r.minCash < 0) broke++;
      if (r.firstGateEligible) { elig += r.firstGateEligible; eligN++; }
    }
    seat.sort((a, b) => a - b);
    const pct = (k: number) => (seat.filter((x) => x <= k).length / N * 100).toFixed(0) + '%';
    console.log(`${nm}  rep30 at wk ${eligN ? (elig / eligN).toFixed(0) : '-'}  |  seat S1 ${pct(1)} S2 ${pct(2)} S3 ${pct(3)} S4 ${pct(4)} S6 ${pct(6)}  | via gateway ${gateW} bought ${bought}  | endCash ${(cashEnd / N).toFixed(0)} minCash ${(minC / N).toFixed(0)} insolvent ${(broke / N * 100).toFixed(0)}%  endRep ${(repEnd / N).toFixed(0)}`);
  }
}


const BASE: Cfg = {
  stipend: 0.5, hardship: 0, opex: 0.25, wage: 1.54, sponsorBase: 0.6, sponsorPerRep: 0,
  startCash: 100, signingCost: 13,
  openWeeks: [...range(3, 11), ...range(20, 28)], regionalWeeks: [4, 8, 21, 25], gatewayWeeks: [12, 41],
  local: { size: 8, bestOf: 1, finalBestOf: 1, entry: 1, purse: [6, 2.5, 1], gate: 0, cap: 25, base: [6, 3, 1.5, 0.5, 0.5], points: [10, 6, 3, 1, 0] },
  regional: { size: 16, bestOf: 1, finalBestOf: 3, entry: 3, purse: [16, 7, 3], gate: 12, cap: 45, base: [12, 7, 4, 1.5, 0.5], points: [25, 15, 9, 4, 1] },
  gateway: { size: 16, bestOf: 3, finalBestOf: 3, entry: 8, purse: [0, 0, 0], gate: 30, cap: 68, base: [20, 13, 8, 3, 1], points: [40, 25, 15, 6, 2] },
  buyPrice: 140, buyRep: 20,
};

const S: Cfg = JSON.parse(JSON.stringify(BASE));
S.stipend = 0.6; S.opex = 0.45; S.hardship = 0.9; S.wage = 1.54;
S.sponsorBase = 0.45; S.sponsorPerRep = 0.035;
S.startCash = 100; S.signingCost = 14;
S.openWeeks = [...range(3, 11), ...range(13, 14), ...range(20, 28), 30, 31];
S.regionalWeeks = [12, 29, 32, 34];
S.gatewayWeeks = [19, 43];
S.local = { size: 8, bestOf: 1, finalBestOf: 1, entry: 1.5, purse: [8, 3.5, 1.5], gate: 0, cap: 26, base: [6, 3, 1.5, 0.6, 0.6], points: [10, 6, 3, 1, 0] };
S.regional = { size: 16, bestOf: 1, finalBestOf: 3, entry: 4, purse: [26, 11, 4.5], gate: 12, cap: 46, base: [12, 7, 4, 1.5, 0.5], points: [25, 15, 9, 4, 1] };
S.gateway = { size: 16, bestOf: 3, finalBestOf: 3, entry: 6, purse: [0, 14, 6], gate: 30, cap: 68, base: [20, 13, 8, 3, 1], points: [40, 25, 15, 6, 2] };
S.buyPrice = 140; S.buyRep = 22;

report('AS WRITTEN', BASE, 52);
for (const mu of [53, 52, 51]) report('SHIPPING CANDIDATE', S, mu);
console.log('\n-- per-season traces, SHIPPING CANDIDATE, mu 52 (3 seeds each) --');
for (const [nm, fn] of profiles) {
  for (const sd of [4242, 777, 90210]) {
    const r = career(S, fn, 52, 6, sd);
    console.log(nm, 'seat S' + (r.seatSeason || '-'), (r.how||'').padEnd(8), JSON.stringify(r.perSeason));
  }
}
console.log('\n-- no-tournament runway (never enters anything) --');
const NOENTRY: Cfg = JSON.parse(JSON.stringify(S)); NOENTRY.openWeeks=[]; NOENTRY.regionalWeeks=[]; NOENTRY.gatewayWeeks=[];
const r0 = career(NOENTRY, weak, 52, 6, 1); console.log('cash by season:', JSON.stringify(r0.perSeason));
