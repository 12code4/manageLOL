// Build the self-contained prototype.
// Injects: src/sim.js (+ the 48 champions from packages/data, single source of truth)
// and src/matchday.js (draft board, live view, The Crowd) into src/template.html.
// Run with tsx so the TypeScript data package can be imported: pnpm proto:build
import { readFileSync, writeFileSync } from 'node:fs';
import { CHAMPIONS } from '../packages/data/src/champions.ts';

const here = (p) => new URL(p, import.meta.url);
const tpl = readFileSync(here('./src/template.html'), 'utf8');
const matchday = readFileSync(here('./src/matchday.js'), 'utf8');
let sim = readFileSync(here('./src/sim.js'), 'utf8');

const champJson = JSON.stringify(CHAMPIONS);
if (!sim.includes('/*__CHAMPIONS__*/[]')) throw new Error('champion marker missing in sim.js');
sim = sim.split('/*__CHAMPIONS__*/[]').join(champJson);

for (const [marker, name] of [['/*__SIM__*/', 'sim'], ['/*__MATCHDAY__*/', 'matchday']]) {
  if (!tpl.includes(marker)) throw new Error(`${name} marker missing in template.html`);
}
const out = tpl.split('/*__SIM__*/').join('\n' + sim + '\n').split('/*__MATCHDAY__*/').join('\n' + matchday + '\n');
writeFileSync(here('./index.html'), out);
console.log(`Built prototype/index.html (${(out.length / 1024).toFixed(0)} KB, ${CHAMPIONS.length} champions)`);
