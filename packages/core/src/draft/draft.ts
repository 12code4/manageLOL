/**
 * The pick/ban draft (docs/05-systems/draft-and-champions.md).
 *
 * Full tournament sequence (20 actions). The engine is a pure state machine:
 * `newDraft()` → `applyAction(state, champId, ...)` per step, with `aiChoose`
 * for the AI side and `coachSuggestions` for the human's advisor. When both
 * sides have five picks, `evaluateSide` produces the bounded draftScore that
 * feeds `teamBreakdown` plus a per-term breakdown for the post-draft verdict.
 * Deterministic: the AI's evaluation noise comes from a passed `Rng`.
 */

import type { Champion } from '@managelol/data';
import type { Rng } from '../rng/rng.js';
import { clamp, mean, round } from '../util/math.js';
import { championStrength, type Patch } from '../meta/patches.js';
import { proficiency } from '../players/pool.js';
import { pairKey, type Lineup, type RosterChemistry } from '../players/meshing.js';
import { ROLES, type Role } from '../players/types.js';

export type Side = 'blue' | 'red';
export type ActionType = 'ban' | 'pick';
export interface DraftStep { side: Side; type: ActionType; }

const B = 'blue', R = 'red';
/** Blue first pick; Red last pick + phase-2 counter window. */
export const DRAFT_SEQUENCE: readonly DraftStep[] = [
  { side: B, type: 'ban' }, { side: R, type: 'ban' }, { side: B, type: 'ban' },
  { side: R, type: 'ban' }, { side: B, type: 'ban' }, { side: R, type: 'ban' },
  { side: B, type: 'pick' }, { side: R, type: 'pick' }, { side: R, type: 'pick' },
  { side: B, type: 'pick' }, { side: B, type: 'pick' }, { side: R, type: 'pick' },
  { side: R, type: 'ban' }, { side: B, type: 'ban' }, { side: R, type: 'ban' }, { side: B, type: 'ban' },
  { side: R, type: 'pick' }, { side: B, type: 'pick' }, { side: B, type: 'pick' }, { side: R, type: 'pick' },
];

export interface Pick { champId: string; role: Role; playerId: string; offRole: boolean; }
export interface DraftState {
  step: number;
  bans: Record<Side, string[]>;
  picks: Record<Side, Pick[]>;
}
export interface DraftTeam {
  name: string;
  lineup: Lineup;
  chem: RosterChemistry;
  coachQuality: number; // 0..100
  patchFamiliarity: number; // 0..100
  /** Team cohesion 0..100 (from meshing); drives auto-draft quality. */
  cohesion?: number;
}
export interface DraftContext {
  champions: readonly Champion[];
  byId: Record<string, Champion>;
  patch: Patch;
}

export function makeContext(champions: readonly Champion[], patch: Patch): DraftContext {
  return { champions, byId: Object.fromEntries(champions.map((c) => [c.id, c])), patch };
}

export function newDraft(): DraftState {
  return { step: 0, bans: { blue: [], red: [] }, picks: { blue: [], red: [] } };
}
export function currentStep(s: DraftState): DraftStep | null {
  return DRAFT_SEQUENCE[s.step] ?? null;
}
export function isComplete(s: DraftState): boolean {
  return s.step >= DRAFT_SEQUENCE.length;
}
export function takenIds(s: DraftState): Set<string> {
  const t = new Set<string>();
  for (const side of [B, R] as Side[]) {
    s.bans[side].forEach((id) => t.add(id));
    s.picks[side].forEach((p) => t.add(p.champId));
  }
  return t;
}
export function openRoles(s: DraftState, side: Side): Role[] {
  const filled = new Set(s.picks[side].map((p) => p.role));
  return ROLES.filter((r) => !filled.has(r));
}

/**
 * Which role a champion would fill for `side`: its primary role if open, else a
 * flex role if open, else any open role (an off-role pilot — legal but taxed).
 */
export function assignRole(c: Champion, open: Role[]): { role: Role; offRole: boolean } | null {
  for (const r of c.roles) if (open.includes(r as Role)) return { role: r as Role, offRole: false };
  const first = open[0];
  return first ? { role: first, offRole: true } : null;
}

export function legalActions(s: DraftState, ctx: DraftContext): string[] {
  const taken = takenIds(s);
  return ctx.champions.map((c) => c.id).filter((id) => !taken.has(id)).sort();
}

/** Apply the current step's action for its side. Returns a new state. */
export function applyAction(s: DraftState, champId: string, ctx: DraftContext, team: DraftTeam): DraftState {
  const step = currentStep(s);
  if (!step) throw new Error('draft complete');
  if (takenIds(s).has(champId)) throw new Error('champion already taken: ' + champId);
  const c = ctx.byId[champId];
  if (!c) throw new Error('unknown champion: ' + champId);
  const next: DraftState = {
    step: s.step + 1,
    bans: { blue: [...s.bans.blue], red: [...s.bans.red] },
    picks: { blue: [...s.picks.blue], red: [...s.picks.red] },
  };
  if (step.type === 'ban') {
    next.bans[step.side].push(champId);
  } else {
    const a = assignRole(c, openRoles(s, step.side));
    if (!a) throw new Error('no open role');
    next.picks[step.side].push({
      champId, role: a.role, playerId: team.lineup[a.role].id, offRole: a.offRole,
    });
  }
  return next;
}

// ---------------------------------------------------------------- evaluation

const COMBO_ANCHORS: Record<string, { pair: [Role, Role] }> = {
  dive: { pair: ['jungle', 'mid'] },
  pick: { pair: ['bot', 'support'] },
  protectTheCarry: { pair: ['bot', 'support'] },
  split131: { pair: ['jungle', 'top'] },
  pokeSiege: { pair: ['mid', 'support'] },
  earlyInvade: { pair: ['jungle', 'top'] },
  frontToBack: { pair: ['top', 'support'] },
};
const COMBO_BASE_PAYOFF = 2.5;

export interface PickEval {
  champId: string; role: Role; playerId: string;
  comfort: number; meta: number; counter: number; offRole: number; total: number;
}
export interface ComboEval { tag: string; aptGate: number; chemGate: number; payoff: number; }
export interface SideEvaluation {
  side: Side;
  score: number; // bounded −8..+8 → team.draftScore
  picks: PickEval[];
  combos: ComboEval[];
  curveFit: number;
  identity: number;
  label: string; // win-condition label
  curve: { early: number; mid: number; late: number };
}

function comfortTerm(prof: number): number { return 2.0 * ((prof - 50) / 50); }
function metaTerm(strength: number): number { return 1.5 * ((strength - 50) / 50); }

/** Value of one pick, given the opponent's current picks (for counters). */
export function pickValue(
  c: Champion, role: Role, offRole: boolean, team: DraftTeam, oppPicks: Pick[], ctx: DraftContext,
): Omit<PickEval, 'playerId'> {
  const player = team.lineup[role];
  const comfort = comfortTerm(proficiency(player, c.id));
  const meta = metaTerm(championStrength(c, ctx.patch));
  let counter = 0;
  for (const op of oppPicks) {
    if (c.counters.includes(op.champId)) counter += 1.2;
    const oc = ctx.byId[op.champId];
    if (oc && oc.counters.includes(c.id)) counter -= 1.2;
  }
  const off = offRole ? -1.5 : 0;
  return { champId: c.id, role, comfort, meta, counter, offRole: off, total: comfort + meta + counter + off };
}

export function winCondition(picks: Pick[], ctx: DraftContext): { label: string; curve: SideEvaluation['curve'] } {
  const champs = picks.map((p) => ctx.byId[p.champId]!).filter(Boolean);
  if (!champs.length) return { label: '—', curve: { early: 0.33, mid: 0.34, late: 0.33 } };
  const curve = {
    early: mean(champs.map((c) => c.curve.early)),
    mid: mean(champs.map((c) => c.curve.mid)),
    late: mean(champs.map((c) => c.curve.late)),
  };
  const tagCount = (t: string): number => champs.filter((c) => (c.comboTags as string[]).includes(t)).length;
  let label = 'Teamfight';
  if (curve.early >= 0.42) label = 'Early Snowball';
  else if (tagCount('protectTheCarry') >= 2 && curve.late >= 0.38) label = 'Protect the Star';
  else if (tagCount('pick') >= 2) label = 'Pick & Punish';
  else if (tagCount('pokeSiege') >= 2) label = 'Siege';
  else if (tagCount('split131') >= 2) label = '1-3-1';
  else if (curve.late >= 0.42) label = 'Scaling';
  return { label, curve };
}

export function evaluateSide(s: DraftState, side: Side, team: DraftTeam, ctx: DraftContext): SideEvaluation {
  const opp: Side = side === B ? R : B;
  const picks = s.picks[side];
  const pickEvals: PickEval[] = picks.map((p) => {
    const c = ctx.byId[p.champId]!;
    const v = pickValue(c, p.role, p.offRole, team, s.picks[opp], ctx);
    return { ...v, playerId: p.playerId, total: round(v.total, 2) };
  });

  // combos: a tag carried by ≥2 picks fires, gated by the anchor pair's pilots + chemistry
  const combos: ComboEval[] = [];
  const byRole = Object.fromEntries(picks.map((p) => [p.role, p])) as Partial<Record<Role, Pick>>;
  for (const [tag, anchor] of Object.entries(COMBO_ANCHORS)) {
    const carriers = picks.filter((p) => (ctx.byId[p.champId]!.comboTags as string[]).includes(tag));
    if (carriers.length < 2) continue;
    const [ra, rb] = anchor.pair;
    const pa = byRole[ra], pb = byRole[rb];
    if (!pa || !pb) continue;
    const plA = team.lineup[ra], plB = team.lineup[rb];
    const aptGate = mean([proficiency(plA, pa.champId), proficiency(plB, pb.champId)]) / 100;
    const pc = team.chem.pairs[pairKey(plA.id, plB.id)];
    const chemGate = 0.5 + 0.5 * ((pc?.current ?? 30) / 100);
    combos.push({ tag, aptGate: round(aptGate, 3), chemGate: round(chemGate, 3), payoff: round(COMBO_BASE_PAYOFF * aptGate * chemGate, 2) });
  }

  // curve coherence: commit to a plan; punish an internal contradiction
  const { label, curve } = winCondition(picks, ctx);
  let curveFit = 0;
  if (picks.length === 5) {
    const commit = Math.max(curve.early, curve.late);
    curveFit = commit >= 0.45 ? 2.0 : commit >= 0.4 ? 1.0 : 0;
    const champs = picks.map((p) => ctx.byId[p.champId]!);
    const hasFTB = champs.some((c) => (c.comboTags as string[]).includes('frontToBack'));
    if (curve.early >= 0.42 && champs.some((c) => c.curve.late >= 0.5) && !hasFTB) curveFit -= 2.0;
  }

  // identity: the roster's tempo preference vs the comp's tempo
  const teamTempo = mean(ROLES.map((r) => team.lineup[r].attributes.chemistry.playstyleTempo));
  const compTempo = 50 + 50 * (curve.early - curve.late);
  const identity = round(1.05 - 0.1 * (Math.abs(teamTempo - compTempo) / 100), 3);

  const raw = (pickEvals.reduce((a, p) => a + p.total, 0) + combos.reduce((a, c) => a + c.payoff, 0) + curveFit) * identity;
  return { side, score: round(clamp(raw, -8, 8), 2), picks: pickEvals, combos, curveFit, identity, label, curve };
}

// ---------------------------------------------------------------- the AI

/**
 * How well a team drafts for itself, 0..100 (design: auto-draft quality).
 * Coach quality, team cohesion, and the players' own game sense (shotcalling,
 * adaptability, map awareness). A cohesive, smart roster drafts with little
 * noise even with a weak coach; a fractured one drafts erratically.
 */
export function draftSkill(team: DraftTeam): number {
  const sense = mean(ROLES.map((r) => {
    const k = team.lineup[r].attributes.gameKnowledge;
    return (k.shotcalling + k.adaptability + k.mapAwareness) / 3;
  }));
  const cohesion = team.cohesion ?? 50;
  return clamp(0.35 * team.coachQuality + 0.3 * cohesion + 0.35 * sense, 0, 100);
}

/** Evaluation noise for a team's draft decisions — the "inbuilt randomness" skilled rosters shrink. */
export function draftNoiseSigma(team: DraftTeam): number {
  return 1.6 * (1 - 0.7 * (draftSkill(team) / 100)) * (1 - 0.3 * (team.patchFamiliarity / 100));
}
const noiseSigma = draftNoiseSigma;

/** Score every legal action for `side`; the AI and the coach share this. */
export function scoreActions(
  s: DraftState, side: Side, team: DraftTeam, opp: DraftTeam, ctx: DraftContext,
): { champId: string; value: number; reason: string }[] {
  const step = currentStep(s);
  if (!step) return [];
  const oppSide: Side = side === B ? R : B;
  const legal = legalActions(s, ctx);
  const out: { champId: string; value: number; reason: string }[] = [];

  if (step.type === 'ban') {
    const oppOpen = openRoles(s, oppSide);
    for (const id of legal) {
      const c = ctx.byId[id]!;
      // deny the opponent's best plan among the players who could still pilot it
      let best = -Infinity; let bestWho = '';
      for (const r of oppOpen) {
        const p = opp.lineup[r];
        const inRole = c.roles.includes(r) ? 1 : 0.4;
        const v = (comfortTerm(proficiency(p, id)) + metaTerm(championStrength(c, ctx.patch))) * inRole;
        if (v > best) { best = v; bestWho = p.identity.name; }
      }
      if (best === -Infinity) best = metaTerm(championStrength(c, ctx.patch));
      const flexTax = c.roles.length > 1 ? 0.5 : 0;
      const protect = s.picks[side].some((p) => c.counters.includes(p.champId)) ? 1.0 : 0;
      out.push({ champId: id, value: best + flexTax + protect, reason: protect ? `protects your ${ctx.byId[s.picks[side][0]!.champId]!.name} plan` : `denies ${bestWho}'s comfort` });
    }
  } else {
    const open = openRoles(s, side);
    for (const id of legal) {
      const c = ctx.byId[id]!;
      const a = assignRole(c, open);
      if (!a) continue;
      const v = pickValue(c, a.role, a.offRole, team, s.picks[oppSide], ctx);
      const option = c.roles.length > 1 ? 0.3 : 0;
      const reason = v.counter > 0 ? 'counters their lock' : v.comfort > 1 ? 'comfort pick' : v.meta > 0.6 ? 'meta power' : a.offRole ? 'off-role gamble' : 'fills the plan';
      out.push({ champId: id, value: v.total + option, reason });
    }
  }
  return out.sort((x, y) => y.value - x.value || (x.champId < y.champId ? -1 : 1));
}

/** The AI's action: argmax of scored actions plus coach-quality noise. */
export function aiChoose(s: DraftState, side: Side, team: DraftTeam, opp: DraftTeam, ctx: DraftContext, rng: Rng): string {
  const scored = scoreActions(s, side, team, opp, ctx);
  const sigma = noiseSigma(team);
  let best = scored[0]!;
  let bestV = -Infinity;
  for (const a of scored) {
    const v = a.value + rng.normal() * sigma;
    if (v > bestV) { bestV = v; best = a; }
  }
  return best.champId;
}

/** Top-N advisor suggestions for the human side (no noise; quality gates depth later). */
export function coachSuggestions(
  s: DraftState, side: Side, team: DraftTeam, opp: DraftTeam, ctx: DraftContext, n = 3,
): { champId: string; value: number; reason: string }[] {
  return scoreActions(s, side, team, opp, ctx).slice(0, n).map((a) => ({ ...a, value: round(a.value, 1) }));
}

/** Run a full AI-vs-AI draft. */
export function simulateDraft(blue: DraftTeam, red: DraftTeam, ctx: DraftContext, rng: Rng): DraftState {
  let s = newDraft();
  while (!isComplete(s)) {
    const step = currentStep(s)!;
    const team = step.side === B ? blue : red;
    const opp = step.side === B ? red : blue;
    s = applyAction(s, aiChoose(s, step.side, team, opp, ctx, rng), ctx, team);
  }
  return s;
}
