import { winProbFromDiff, MATCH_SCALE } from '@managelol/core';
const wp = (d: number) => winProbFromDiff(d, MATCH_SCALE);
const bo3 = (p: number) => p * p * (3 - 2 * p);
const bo = (p: number, n: number) => (n === 1 ? p : n === 3 ? bo3(p) : p ** 3 * (1 + 3 * (1 - p) + 6 * (1 - p) ** 2));
function mulberry(seed: number) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = mulberry(987654);
const SD = 2.8;
function gauss(mu: number, sd: number): number { let s = 0; for (let k = 0; k < 6; k++) s += rnd(); return mu + (s - 3) * sd * 0.7071; }

/** Monte-Carlo single elim; last round may use a different bestOf. */
function run(you: number, poolMu: number, poolN: number, size: number, bestOf: number, finalBestOf: number, trials: number): number[] {
  const rounds = Math.log2(size);
  const reach = new Array<number>(rounds + 1).fill(0);
  for (let t = 0; t < trials; t++) {
    const p: number[] = [];
    for (let i = 0; i < poolN; i++) p.push(gauss(poolMu, SD));
    const field: number[] = [you];
    const used = new Set<number>();
    while (field.length < size) { const i = Math.floor(rnd() * p.length); if (used.has(i)) continue; used.add(i); field.push(p[i]!); }
    for (let i = field.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const tmp = field[i]!; field[i] = field[j]!; field[j] = tmp; }
    let cur = field;
    for (let r = 1; r <= rounds; r++) {
      const nxt: number[] = [];
      const bof = r === rounds ? finalBestOf : bestOf;
      for (let i = 0; i < cur.length; i += 2) {
        const a = cur[i]!, b = cur[i + 1]!;
        nxt.push(rnd() < bo(wp(a - b), bof) ? a : b);
      }
      cur = nxt;
      if (cur.indexOf(you) < 0) break;
      reach[r]!;
      reach[r] = reach[r]! + 1;
    }
  }
  return reach.map((x) => x / trials);
}

const cases: Array<[string, number, number, number, number]> = [
  ['Local Open   8 teams Bo1', 8, 1, 1, 21],
  ['Regional    16 teams Bo1, Bo3 final', 16, 1, 3, 30],
  ['Gateway     16 teams Bo3', 16, 3, 3, 30],
];
for (const [label, size, bof, fbof, pn] of cases) {
  console.log('\n=== ' + label + ' ===   (gap = your strength minus floating-pool mean)');
  const L = Math.log2(size);
  for (const gap of [-4, -2, 0, 2, 4, 6, 8, 10, 12]) {
    const r = run(50 + gap, 50, pn, size, bof, fbof, 20000);
    const parts = [];
    for (let k = 1; k <= L; k++) parts.push(`R${k} ${(r[k]! * 100).toFixed(1)}%`);
    console.log(`gap ${gap >= 0 ? '+' : ''}${gap}\t` + parts.join('  ') + `   [last = champion]`);
  }
}
