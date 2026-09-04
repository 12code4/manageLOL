import { Rng, generatePlayer, initRosterChemistry, rampWeek, teamBreakdown, wageDemand, ROLES, winProbFromDiff, MATCH_SCALE } from '@managelol/core';

function team(seed: string, centre: number, gel: number) {
  const lineup = {} as any;
  ROLES.forEach((r) => {
    lineup[r] = generatePlayer(new Rng(seed, `p:${r}`), {
      id: `${seed}:${r}` as any, region: 'mer' as any,
      qualityCenter: new Rng(seed, `q:${r}`).gaussian(centre, 4.5),
      ageRange: [18, 24], spread: 4.5, primaryRole: r,
    });
  });
  const chem = initRosterChemistry(lineup);
  for (let w = 0; w < gel; w++) rampWeek(chem, lineup, 1);
  return teamBreakdown({ name: seed, lineup, chem }).strength;
}
function mean(c: number, gel: number, n = 300) {
  let s = 0; for (let i = 0; i < n; i++) s += team(`t${c}:${gel}:${i}`, c, gel);
  return +(s / n).toFixed(2);
}
console.log('centre\tfresh\tgel8\tgel20\tgel40');
for (const c of [58, 60, 62, 63, 64, 66, 67, 68, 70, 74, 76, 82]) {
  console.log([c, mean(c, 0), mean(c, 8), mean(c, 20), mean(c, 40)].join('\t'));
}

// mixed roster: 2 ascendant (71) + 3 onyx I (66)
function mixed(seed: string, centres: number[], gel: number) {
  const lineup = {} as any;
  ROLES.forEach((r, i) => {
    lineup[r] = generatePlayer(new Rng(seed, `p:${r}`), {
      id: `${seed}:${r}` as any, region: 'mer' as any,
      qualityCenter: new Rng(seed, `q:${r}`).gaussian(centres[i]!, 4.0),
      ageRange: [17, 23], spread: 4.5, primaryRole: r,
    });
  });
  const chem = initRosterChemistry(lineup);
  for (let w = 0; w < gel; w++) rampWeek(chem, lineup, 1);
  const bd = teamBreakdown({ name: seed, lineup, chem });
  let wage = 0; ROLES.forEach((r) => { wage += wageDemand(lineup[r], 2, 12); });
  return { s: bd.strength, wage };
}
const setups: Array<[string, number[]]> = [
  ['5x Onyx I (66)          ', [66, 66, 66, 66, 66]],
  ['4x Onyx + 1 Ascendant   ', [66, 66, 66, 66, 71]],
  ['3x Onyx + 2 Ascendant   ', [66, 66, 66, 71, 71]],
  ['3 Onyx + 1 Asc + 1 Parag', [66, 66, 66, 71, 76]],
  ['5x Ascendant (71)       ', [71, 71, 71, 71, 71]],
];
console.log('\nroster                     gel0   gel8   gel20   wagebill@mult1  @0.4  @0.5');
for (const [label, cs] of setups) {
  let s0 = 0, s8 = 0, s20 = 0, w = 0;
  for (let i = 0; i < 300; i++) { s0 += mixed(`m${label}${i}`, cs, 0).s; }
  for (let i = 0; i < 300; i++) { const r = mixed(`m${label}${i}`, cs, 8); s8 += r.s; w += r.wage; }
  for (let i = 0; i < 300; i++) { s20 += mixed(`m${label}${i}`, cs, 20).s; }
  const wb = w / 300;
  console.log(`${label} ${(s0/300).toFixed(1)}   ${(s8/300).toFixed(1)}   ${(s20/300).toFixed(1)}    ${wb.toFixed(2)}          ${(wb*0.4).toFixed(2)}  ${(wb*0.5).toFixed(2)}`);
}
console.log('\nwin prob per game at gaps:', [2,4,6,8,10].map(d=>d+':'+winProbFromDiff(d,MATCH_SCALE).toFixed(3)).join('  '));
