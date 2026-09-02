import { describe, it, expect } from 'vitest';
import { CHAMPIONS } from '@managelol/data';
import { RngSource } from '../rng/rng.js';
import { generatePlayer } from '../players/generate.js';
import { seedChampionPool, proficiency } from '../players/pool.js';
import { initRosterChemistry, rampWeek, type Lineup } from '../players/meshing.js';
import { ROLES, type Role } from '../players/types.js';
import { generatePatch, championStrength, tierOf } from '../meta/patches.js';
import {
  DRAFT_SEQUENCE, newDraft, currentStep, isComplete, applyAction, legalActions, openRoles,
  aiChoose, coachSuggestions, evaluateSide, simulateDraft, makeContext, type DraftTeam,
} from './draft.js';
import type { PlayerId } from '../util/ids.js';

function team(name: string, center: number, seed: string, gelWeeks = 20): DraftTeam {
  const rng = new RngSource(seed).stream('r');
  const lineup = {} as Lineup;
  for (const role of ROLES as Role[]) {
    const p = generatePlayer(rng, { id: `${seed}_${role}` as PlayerId, region: 'mer', qualityCenter: center, primaryRole: role, ageRange: [20, 24] });
    p.identity.languageIds = ['common'] as never;
    seedChampionPool(p, CHAMPIONS, rng);
    lineup[role] = p;
  }
  const chem = initRosterChemistry(lineup);
  for (let w = 0; w < gelWeeks; w++) rampWeek(chem, lineup, 1.0);
  return { name, lineup, chem, coachQuality: 55, patchFamiliarity: 60 };
}
const patch0 = generatePatch(new RngSource('meta').stream('p'), 0, CHAMPIONS);
const ctx = makeContext(CHAMPIONS, patch0);

describe('meta: patches', () => {
  it('generates deterministic, bounded archetype deltas and outliers', () => {
    const a = generatePatch(new RngSource('m').stream('x'), 1, CHAMPIONS);
    const b = generatePatch(new RngSource('m').stream('x'), 1, CHAMPIONS);
    expect(a).toEqual(b);
    for (const d of Object.values(a.archDelta)) { expect(d).toBeGreaterThanOrEqual(-10); expect(d).toBeLessThanOrEqual(10); }
    expect(Object.keys(a.outliers).length).toBeGreaterThanOrEqual(1);
  });
  it('champion strength stays in 20..90 and tiers spread', () => {
    const tiers = new Set<string>();
    for (const c of CHAMPIONS) { const s = championStrength(c, patch0); expect(s).toBeGreaterThanOrEqual(20); expect(s).toBeLessThanOrEqual(90); tiers.add(tierOf(s)); }
    expect(tiers.size).toBeGreaterThanOrEqual(2);
  });
  it('mean reversion: a trough recovers within a few patches', () => {
    const rng = new RngSource('rev').stream('p');
    let p = generatePatch(rng, 0, CHAMPIONS);
    p.archDelta.assassin = -10; // force a trough
    let recovered = false;
    for (let i = 1; i <= 6 && !recovered; i++) { p = generatePatch(rng, i, CHAMPIONS, p); if (p.archDelta.assassin > -5) recovered = true; }
    expect(recovered).toBe(true);
  });
});

describe('champion pool seeding', () => {
  it('in-role champions are known far better than off-role ones', () => {
    const t = team('T', 70, 'pool');
    const mid = t.lineup.mid;
    const inRole = CHAMPIONS.filter((c) => c.roles[0] === 'mid').map((c) => proficiency(mid, c.id));
    const offRole = CHAMPIONS.filter((c) => !c.roles.includes('mid')).map((c) => proficiency(mid, c.id));
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(inRole)).toBeGreaterThan(avg(offRole) + 15);
  });
});

describe('draft sequence & legality', () => {
  it('has 20 actions: 10 bans / 10 picks, 5 picks per side, blue first pick, red last pick', () => {
    expect(DRAFT_SEQUENCE).toHaveLength(20);
    expect(DRAFT_SEQUENCE.filter((s) => s.type === 'ban')).toHaveLength(10);
    expect(DRAFT_SEQUENCE.filter((s) => s.type === 'pick' && s.side === 'blue')).toHaveLength(5);
    expect(DRAFT_SEQUENCE[6]).toEqual({ side: 'blue', type: 'pick' });
    expect(DRAFT_SEQUENCE[19]).toEqual({ side: 'red', type: 'pick' });
  });
  it('rejects taken champions and fills roles as picks land', () => {
    const t = team('A', 65, 'a');
    let s = newDraft();
    s = applyAction(s, 'grombak', ctx, t); // blue ban
    expect(() => applyAction(s, 'grombak', ctx, t)).toThrow();
    expect(legalActions(s, ctx)).not.toContain('grombak');
    // walk to blue's first pick
    s = applyAction(s, 'cindra', ctx, t); s = applyAction(s, 'vann', ctx, t); s = applyAction(s, 'ryx', ctx, t);
    s = applyAction(s, 'quill', ctx, t); s = applyAction(s, 'pip', ctx, t);
    expect(currentStep(s)).toEqual({ side: 'blue', type: 'pick' });
    s = applyAction(s, 'fenwick', ctx, t);
    expect(s.picks.blue[0]!.role).toBe('jungle');
    expect(openRoles(s, 'blue')).not.toContain('jungle');
  });
});

describe('draft AI', () => {
  it('completes a full draft deterministically with 5 legal picks per side', () => {
    const blue = team('Blue', 68, 'b'), red = team('Red', 66, 'r');
    const s1 = simulateDraft(blue, red, ctx, new RngSource('d').stream('draft'));
    const s2 = simulateDraft(blue, red, ctx, new RngSource('d').stream('draft'));
    expect(s1).toEqual(s2);
    expect(isComplete(s1)).toBe(true);
    expect(s1.picks.blue).toHaveLength(5); expect(s1.picks.red).toHaveLength(5);
    expect(new Set(s1.picks.blue.map((p) => p.role)).size).toBe(5);
    expect(new Set([...s1.bans.blue, ...s1.bans.red, ...s1.picks.blue.map((p) => p.champId), ...s1.picks.red.map((p) => p.champId)]).size).toBe(20);
  });
  it('draftScore is bounded ±8 and the verdict names a win condition', () => {
    const blue = team('Blue', 68, 'b'), red = team('Red', 66, 'r');
    const s = simulateDraft(blue, red, ctx, new RngSource('d2').stream('draft'));
    for (const side of ['blue', 'red'] as const) {
      const ev = evaluateSide(s, side, side === 'blue' ? blue : red, ctx);
      expect(ev.score).toBeGreaterThanOrEqual(-8); expect(ev.score).toBeLessThanOrEqual(8);
      expect(ev.picks).toHaveLength(5); expect(ev.label.length).toBeGreaterThan(0);
    }
  });
  it('a first ban prefers denying a high-comfort meta pick over a low-comfort one', () => {
    const blue = team('Blue', 68, 'b'), red = team('Red', 66, 'r');
    // make red's mid a 95-proficiency one-trick on cindra and terrible on quill
    red.lineup.mid.championPool['cindra' as never] = 95;
    red.lineup.mid.championPool['quill' as never] = 20;
    const sugg = coachSuggestions(newDraft(), 'blue', blue, red, ctx, 48);
    const idx = (id: string) => sugg.findIndex((a) => a.champId === id);
    expect(idx('cindra')).toBeLessThan(idx('quill'));
  });
  it('gelled chemistry pays more for combos than a fresh roster with the same picks', () => {
    const gelled = team('G', 68, 'g', 30);
    const fresh = team('G', 68, 'g', 0); // same players, no gel
    // force a dive comp for both: jungle assassin + mid assassin, then fill
    const forceComp = (t: DraftTeam) => {
      let s = newDraft();
      for (const id of ['grombak', 'vann', 'bruna', 'basalt', 'ogden', 'mossback']) s = applyAction(s, id, ctx, t); // 6 bans
      // blue pick, red pick, red pick, blue pick, blue pick, red pick
      s = applyAction(s, 'cindra', ctx, t);         // blue
      s = applyAction(s, 'korrigan', ctx, t);       // red jungle (dive)
      s = applyAction(s, 'vexalia', ctx, t);        // red mid (dive)
      s = applyAction(s, 'seraphel', ctx, t);       // blue
      s = applyAction(s, 'lumen', ctx, t);          // blue
      s = applyAction(s, 'pyrelle', ctx, t);        // red top (dive)
      for (const id of ['quill', 'pip', 'rooke', 'whistler']) s = applyAction(s, id, ctx, t); // phase-2 bans
      s = applyAction(s, 'brindle', ctx, t);        // red bot
      s = applyAction(s, 'fenwick', ctx, t);        // blue
      s = applyAction(s, 'thackery', ctx, t);       // blue
      s = applyAction(s, 'kraywn', ctx, t);         // red support (dive)
      return evaluateSide(s, 'red', t, ctx);
    };
    const evG = forceComp(gelled), evF = forceComp(fresh);
    const dive = (ev: ReturnType<typeof evaluateSide>) => ev.combos.find((c) => c.tag === 'dive');
    expect(dive(evG)).toBeDefined();
    expect(dive(evG)!.payoff).toBeGreaterThan(dive(evF)!.payoff);
  });
  it('AI picks are legal at every step (never a taken champion)', () => {
    const blue = team('Blue', 60, 'x'), red = team('Red', 60, 'y');
    const rng = new RngSource('legal').stream('d');
    let s = newDraft();
    while (!isComplete(s)) {
      const step = currentStep(s)!;
      const t = step.side === 'blue' ? blue : red, o = step.side === 'blue' ? red : blue;
      const id = aiChoose(s, step.side, t, o, ctx, rng);
      expect(legalActions(s, ctx)).toContain(id);
      s = applyAction(s, id, ctx, t);
    }
  });
});
