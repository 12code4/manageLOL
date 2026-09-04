import { winProbFromDiff, MATCH_SCALE } from '@managelol/core';

const wp = (d: number) => winProbFromDiff(d, MATCH_SCALE);
const bo3 = (p: number) => p * p * (3 - 2 * p);
const bo = (p: number, n: 1 | 3 | 5) => (n === 1 ? p : n === 3 ? bo3(p) : p ** 3 * (1 + 3 * (1 - p) + 6 * (1 - p) ** 2));

// --- deterministic single-elim placement probabilities via dynamic programming
// over a randomly-drawn field. Monte-Carlo the field draw, exact on the bracket.
function mulberry(seed: number) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** P(you reach round r) for a field of `size` (you + size-1 opponents), random seeding. */
function elimProbs(you: number, pool: number[], size: number, bestOf: 1 | 3 | 5, trials: number, rnd: () => number) {
  const rounds = Math.log2(size);
  const reach = new Array(rounds + 1).fill(0); // reach[k] = P(win k rounds)
  for (let t = 0; t < trials; t++) {
    const field: number[] = [];
    const used = new Set<number>();
    while (field.length < size - 1) { const i = Math.floor(rnd() * pool.length); if (used.has(i)) continue; used.add(i); field.push(pool[i]!); }
    // random bracket: shuffle opponents, you meet 1 in R1, 2 in R2 (either of them), etc.
    for (let i = field.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [field[i], field[j]] = [field[j]!, field[i]!]; }
    // your side of the bracket: opponents grouped 1,2,4,8...
    // P(survive round k) approximated exactly by averaging over which opponent emerges,
    // weighting each candidate by its own probability of reaching that round.
    let alive = 1;
    reach[0]! ;
    let idx = 0;
    let surviveCum = 1;
    let groupProbs: { s: number; p: number }[] = [];
    for (let k = 0; k < rounds; k++) {
      const cnt = 1 << k;
      const group = field.slice(idx, idx + cnt); idx += cnt;
      // probability each member of this group emerges from its own sub-bracket
      let cands: { s: number; p: number }[] = group.map((s) => ({ s, p: 1 }));
      while (cands.length > 1) {
        const nxt: { s: number; p: number }[] = [];
        for (let i = 0; i < cands.length; i += 2) {
          const a = cands[i]!, b = cands[i + 1]!;
          const pa = bo(wp(a.s - b.s), bestOf);
          nxt.push({ s: a.s, p: a.p * b.p * pa }, { s: b.s, p: a.p * b.p * (1 - pa) });
        }
        // collapse: keep all as separate candidates
        cands = nxt;
      }
      const pWin = cands.reduce((acc, c) => acc + c.p * bo(wp(you - c.s), bestOf), 0) / cands.reduce((a, c) => a + c.p, 0);
      surviveCum *= pWin;
      reach[k + 1] += surviveCum;
    }
    alive; groupProbs;
  }
  return reach.map((x) => x / trials); // reach[1]=won R1 ... reach[rounds]=champion
}

const rnd = mulberry(12345);

// strengths from calc.ts: settled roster (20 gel weeks)
// centre 58 -> 45.0 ; 62 -> 49.5 ; 66 -> 54.1 ; 70 -> 58.5 ; 76 -> 65.7
// fresh (0 weeks): 58 -> 41.6 ; 62 -> 45.6 ; 66 -> 49.8 ; 70 -> 54.4
const SD = 2.8;
function pool(mu: number, n = 21) { const out: number[] = []; for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < 6; k++) s += rnd(); out.push(mu + (s - 3) * SD * 0.72); } return out; }

console.log('=== 8-team Bo1 local open: P(reach) for a player at various gaps to the floating-pool mean ===');
for (const gap of [-4, -2, 0, 2, 4, 6, 8, 10]) {
  const p = pool(50);
  const r = elimProbs(50 + gap, p, 8, 1, 3000, rnd);
  console.log(`gap ${gap >= 0 ? '+' : ''}${gap}  semi ${(r[1]! * 100).toFixed(1)}%  final ${(r[2]! * 100).toFixed(1)}%  WIN ${(r[3]! * 100).toFixed(1)}%`);
}
console.log('\n=== 16-team Bo1 (Bo3 final) regional cup ===');
for (const gap of [-2, 0, 2, 4, 6, 8, 10]) {
  const p = pool(50, 30);
  const r = elimProbs(50 + gap, p, 16, 1, 3000, rnd);
  console.log(`gap ${gap >= 0 ? '+' : ''}${gap}  quarter ${(r[2]! * 100).toFixed(1)}%  semi ${(r[3]! * 100).toFixed(1)}%  final(r3 won=>final) WIN ${(r[4]! * 100).toFixed(1)}%`);
}
console.log('\n=== 16-team Bo3 gateway ===');
for (const gap of [-2, 0, 2, 4, 6, 8, 10]) {
  const p = pool(50, 30);
  const r = elimProbs(50 + gap, p, 16, 3, 3000, rnd);
  console.log(`gap ${gap >= 0 ? '+' : ''}${gap}  quarter ${(r[2]! * 100).toFixed(1)}%  semi ${(r[3]! * 100).toFixed(1)}%  WIN ${(r[4]! * 100).toFixed(1)}%`);
}
