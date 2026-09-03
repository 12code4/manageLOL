// Build the self-contained prototype.
// Injects: src/sim.js (+ the 48 champions from packages/data, single source of truth)
// and src/matchday.js (draft board, live view, The Crowd) into src/template.html.
// Run with tsx so the TypeScript data package can be imported: pnpm proto:build
import { readFileSync, writeFileSync } from 'node:fs';
import { CHAMPIONS } from '../packages/data/src/champions.ts';
import { ORGS, ORG_NAME_PARTS } from '../packages/data/src/orgs.ts';

const here = (p) => new URL(p, import.meta.url);
const tpl = readFileSync(here('./src/template.html'), 'utf8');
const matchday = readFileSync(here('./src/matchday.js'), 'utf8');
const world = readFileSync(here('./src/world.js'), 'utf8');
const season = readFileSync(here('./src/season.js'), 'utf8');
let sim = readFileSync(here('./src/sim.js'), 'utf8');

for (const [marker, value, label] of [
  ['/*__CHAMPIONS__*/[]', CHAMPIONS, 'champion'],
  ['/*__ORGS__*/[]', ORGS, 'org'],
  ['/*__ORGPARTS__*/{ prefixes: [], suffixes: [], standalone: [], qualifiers: [] }', ORG_NAME_PARTS, 'org-name-parts'],
]) {
  if (!sim.includes(marker)) throw new Error(`${label} marker missing in sim.js`);
  sim = sim.split(marker).join(JSON.stringify(value));
}

for (const [marker, name] of [['/*__SIM__*/', 'sim'], ['/*__MATCHDAY__*/', 'matchday'], ['/*__WORLD__*/', 'world'], ['/*__SEASON__*/', 'season']]) {
  if (!tpl.includes(marker)) throw new Error(`${name} marker missing in template.html`);
}
const out = tpl
  .split('/*__SIM__*/').join('\n' + sim + '\n')
  .split('/*__WORLD__*/').join('\n' + world + '\n')
  .split('/*__MATCHDAY__*/').join('\n' + matchday + '\n')
  .split('/*__SEASON__*/').join('\n' + season + '\n');
writeFileSync(here('./index.html'), out);
console.log(`Built prototype/index.html (${(out.length / 1024).toFixed(0)} KB, ${CHAMPIONS.length} champions, ${ORGS.length} orgs)`);
