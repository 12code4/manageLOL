// Build the self-contained prototype: inject src/sim.js into src/template.html.
import { readFileSync, writeFileSync } from 'node:fs';
const tpl = readFileSync(new URL('./src/template.html', import.meta.url), 'utf8');
const sim = readFileSync(new URL('./src/sim.js', import.meta.url), 'utf8');
writeFileSync(new URL('./index.html', import.meta.url), tpl.split('/*__SIM__*/').join('\n' + sim + '\n'));
console.log('Built prototype/index.html');
