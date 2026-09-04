import { Rng } from '@managelol/core';
import {
  generatePlayer, initRosterChemistry, rampWeek, teamBreakdown, wageDemand,
  currentAbility, winProbFromDiff, MATCH_SCALE, ROLES,
} from '@managelol/core';
import type { Player, Role, Lineup } from '@managelol/core';

function makeTeam(seed: string, centre: number, spread = 4.5, gelWeeks = 0, ageRange: [number, number] = [18, 24]) {
  const lineup = {} as any;
  ROLES.forEach((r, i) => {
    const rng = new Rng(seed, `p:${r}`);
    lineup[r] = generatePlayer(rng, {
      id: `${seed}:${r}` as any, region: 'mer' as any,
      qualityCenter: new Rng(seed, `q:${r}`).gaussian(centre, spread),
      ageRange, spread: 4.5, primaryRole: r,
    });
  });
  const chem = initRosterChemistry(lineup);
  for (let w = 0; w < gelWeeks; w++) rampWeek(chem, lineup, 1);
  const bd = teamBreakdown({ name: seed, lineup, chem });
  return { lineup, chem, bd };
}

function sample(centre: number, gelWeeks: number, n = 400) {
  const strengths: number[] = [];
  const cas: number[] = [];
  const mesh: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = makeTeam(`s${centre}:${gelWeeks}:${i}`, centre, 4.5, gelWeeks);
    strengths.push(t.bd.strength);
    mesh.push(t.bd.meshMult);
    ROLES.forEach((r) => cas.push(currentAbility(t.lineup[r].attributes)));
  }
  strengths.sort((a, b) => a - b);
  const mean = strengths.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(strengths.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  return {
    centre, gelWeeks,
    meanStrength: +mean.toFixed(2), sdStrength: +sd.toFixed(2),
    p10: +strengths[Math.floor(n * 0.1)]!.toFixed(1), p90: +strengths[Math.floor(n * 0.9)]!.toFixed(1),
    meanCA: +(cas.reduce((a, b) => a + b, 0) / cas.length).toFixed(1),
    meanMesh: +(mesh.reduce((a, b) => a + b, 0) / n).toFixed(3),
  };
}

console.log('=== team strength by quality centre (fresh chem = 0 gel weeks; 20 = a settled roster) ===');
for (const c of [49, 55, 58, 62, 66, 67, 70, 76]) {
  for (const g of [0, 8, 20, 40]) console.log(JSON.stringify(sample(c, g, 250)));
}

console.log('\n=== wage bill for five, by quality centre and tier mult ===');
const tierMults: Record<string, number> = { 't1(1.25)': 1.25, 't2(1.0)': 1, 't3(0.75)': 0.75, 't4(0.5)': 0.5, 'open(0.4)': 0.4, 'open(0.35)': 0.35, 'open(0.3)': 0.3 };
function bill(centre: number, mult: number, pres: number, n = 200): number {
  let tot = 0;
  for (let i = 0; i < n; i++) {
    const rng = new Rng(`w${centre}:${i}`, 'g');
    const p = generatePlayer(rng, { id: `x${i}` as any, region: 'mer' as any, qualityCenter: centre, ageRange: [18, 24], spread: 4.5 });
    // wageDemand with tier mult applied manually: call with tier 2 (mult 1) then scale
    tot += wageDemand(p, 2, pres) * mult;
  }
  return (tot / n) * 5;
}
for (const c of [58, 62, 66, 70, 76]) {
  const row: any = { centre: c };
  for (const [k, m] of Object.entries(tierMults)) row[k] = +bill(c, m, 12).toFixed(2);
  console.log(JSON.stringify(row));
}
console.log('(prestige 12 = a nobody; prestige 45 for comparison)');
for (const c of [66]) {
  const row: any = { centre: c, note: 'pres45' };
  for (const [k, m] of Object.entries(tierMults)) row[k] = +bill(c, m, 45).toFixed(2);
  console.log(JSON.stringify(row));
}

console.log('\n=== win prob vs strength gap (MATCH_SCALE=' + MATCH_SCALE + ') ===');
for (const d of [0, 1, 2, 3, 4, 5, 7, 10, 15, 20]) console.log(d, +winProbFromDiff(d, MATCH_SCALE).toFixed(3));
