/**
 * Headless season runner + smoke report.
 *
 * Generates a world of orgs from the ladder/generation systems, plays a
 * round-robin split with the v1 match engine, prints the standings, and shows
 * one match's readable "why" breakdown. This is the balance-harness seed
 * (tech plan §8) and an end-to-end proof the engine composes.
 *
 *   pnpm sim            # default seed
 *   pnpm sim my-seed 12 # custom seed, 12 teams
 */

import {
  RngSource, generatePlayer, initRosterChemistry, rampWeek, simulateSeries, teamBreakdown,
  ROLES, type Lineup, type Role, type Team,
} from '@managelol/core';
import { REGIONS, type RegionId } from '@managelol/data';

const seed = process.argv[2] ?? 'demo-world';
const numTeams = Number(process.argv[3] ?? 8);

interface Org { name: string; team: Team; region: RegionId; }

function buildOrg(name: string, region: RegionId, center: number, seedKey: string): Org {
  const rng = new RngSource(seed).stream(`org:${seedKey}`);
  const lineup = {} as Lineup;
  for (const role of ROLES as Role[]) {
    lineup[role] = generatePlayer(rng, {
      id: `plr_${seedKey}_${role}` as never,
      region, qualityCenter: center + rng.range(-6, 6), primaryRole: role, ageRange: [17, 26],
    });
  }
  const chem = initRosterChemistry(lineup);
  // gel for a preseason (varying stability so cohesion differs across orgs)
  const weeks = Math.round(rng.range(2, 30));
  for (let w = 0; w < weeks; w++) rampWeek(chem, lineup, 1.0);
  return { name, team: { name, lineup, chem }, region };
}

// --- build a league of orgs with a spread of quality ---
const ORG_NAMES = [
  'Ironhold', 'Verdant', 'Nova Collective', 'Apex Ravens', 'Sunspire',
  'Deepwater', 'Gilded Lions', 'Stormbreak', 'Cinder', 'Meridian United',
  'Wraith', 'Aurora', 'Basilisk', 'Nimbus', 'Obsidian', 'Halcyon',
];
const rootRng = new RngSource(seed).stream('league');
const orgs: Org[] = [];
for (let i = 0; i < numTeams; i++) {
  const region = rootRng.pick(REGIONS).id;
  const center = 48 + (i / numTeams) * 34 + rootRng.range(-4, 4); // spread ~48..82
  orgs.push(buildOrg(ORG_NAMES[i % ORG_NAMES.length] ?? `Team ${i}`, region, center, `${i}`));
}

// --- round-robin split, Bo1 ---
const wins = new Map<string, number>();
const losses = new Map<string, number>();
orgs.forEach((o) => { wins.set(o.name, 0); losses.set(o.name, 0); });

let games = 0;
for (let i = 0; i < orgs.length; i++) {
  for (let j = i + 1; j < orgs.length; j++) {
    const a = orgs[i]!;
    const b = orgs[j]!;
    const s = simulateSeries(a.team, b.team, 1, new RngSource(seed).stream(`match:${i}:${j}`));
    games++;
    const aWon = s.winner === 'a';
    wins.set((aWon ? a : b).name, (wins.get((aWon ? a : b).name) ?? 0) + 1);
    losses.set((aWon ? b : a).name, (losses.get((aWon ? b : a).name) ?? 0) + 1);
  }
}

// --- standings ---
const table = orgs
  .map((o) => ({
    name: o.name,
    region: o.region,
    w: wins.get(o.name) ?? 0,
    l: losses.get(o.name) ?? 0,
    strength: teamBreakdown(o.team).strength,
    mesh: teamBreakdown(o.team).meshMult,
  }))
  .sort((x, y) => y.w - x.w || y.strength - x.strength);

console.log(`\n=== manageLOL — split standings (seed "${seed}", ${numTeams} teams, ${games} matches) ===\n`);
console.log('  #  Team               Reg    W-L    Str   Mesh');
console.log('  ─────────────────────────────────────────────');
table.forEach((r, i) => {
  console.log(
    `  ${String(i + 1).padStart(2)}  ${r.name.padEnd(18)} ${r.region.padEnd(5)}  ${`${r.w}-${r.l}`.padEnd(5)} ${r.strength.toFixed(1).padStart(5)}  ${r.mesh.toFixed(3)}`,
  );
});

// --- spotlight match: top seed vs bottom seed, with the readable breakdown ---
const top = orgs.find((o) => o.name === table[0]!.name)!;
const bottom = orgs.find((o) => o.name === table[table.length - 1]!.name)!;
const series = simulateSeries(top.team, bottom.team, 3, new RngSource(seed).stream('spotlight'));
const g0 = series.games[0]!;

console.log(`\n=== Spotlight Bo3: ${top.name} vs ${bottom.name} → ${series.scoreA}-${series.scoreB} ===`);
console.log(`Game 1 win probability for ${top.name}: ${(g0.breakdown.winProbA * 100).toFixed(1)}%`);
console.log(`  ${top.name}: strength ${g0.breakdown.a.strength} (base ${g0.breakdown.a.base} × mesh ${g0.breakdown.a.meshMult})`);
console.log(`  ${bottom.name}: strength ${g0.breakdown.b.strength} (base ${g0.breakdown.b.base} × mesh ${g0.breakdown.b.meshMult})`);
console.log(`\nGame 1 → ${g0.winner === 'a' ? top.name : bottom.name} in ${g0.lengthMin} min (${g0.killsA}-${g0.killsB}). MVP: ${g0.mvp.name}`);
console.log('Timeline:');
for (const e of g0.timeline) console.log(`  ${e}`);

console.log('\nDone.\n');
