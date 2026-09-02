# manageLOL — Draft & Champions

*Systems deep-dive (`docs/05-systems/`). The pick/ban draft is the game's signature interactive moment — the one place each match where the manager plays a minigame that can genuinely win or lose the series. Decisions taken: **full tournament ban/pick sequence** (no compressed variant), **48 champions at launch**. The champion roster is content: `packages/data/src/champions.ts`.*

> Reads from: [`players-and-attributes.md`](players-and-attributes.md) §5 (champion-archetype aptitude → proficiency ceilings), [`meshing.md`](meshing.md) §5 (combo payoffs gated by `aptGate × chemGate`), [`meta-and-patches.md`](meta-and-patches.md) (per-patch champion strength). Feeds: the match engine's `draftScore` hook (`core/src/match/resolve.ts`, already in place).

---

## 1. Design intent (pillar check)

- **Meaningful decisions (pillar 1):** every one of your 10 actions is a real choice — deny their comfort, protect your win condition, or grab power. Delegation (below) is the speed valve; the sequence itself is never shortened.
- **Readable (pillar 2):** the board shows *why* live — comp identity forming, pilot warnings, meta fit — and the post-draft summary attributes the score ("you won draft by +4.2, here's the three actions that did it").
- **Earn your seat (pillar 3):** draft edge is the classic way a weaker roster steals series — bounded, so it supports roster-building rather than replacing it.
- **IP-safe (pillar 4):** 48 fictional champions; the objective vocabulary is ours (see §8).

## 2. The sequence (full tournament draft — 20 actions)

Sides are **Blue** and **Red**; Red is the side with last pick / counter-pick priority, Blue has first pick. Timer per action: 30s (AI acts instantly; your timer expiring auto-picks the coach's suggestion — never a random champion).

| Phase | Order |
| --- | --- |
| **Ban phase 1** (6) | B1 → R1 → B2 → R2 → B3 → R3 |
| **Pick phase 1** (6) | B1 → R1, R2 → B2, B3 → R3 |
| **Ban phase 2** (4) | R4 → B4 → R5 → B5 |
| **Pick phase 2** (4) | R4 → B4, B5 → R5 |

Structural truths the AI and the tutorializing must respect: Blue buys the single strongest champion on the patch (first pick); Red buys matchup information (last pick + the phase-2 counter window); ban phase 2 is aimed at what the enemy has *revealed* they're building.

In a Bo3/Bo5, champions are not fearless (previous-game picks stay available), but the AI adapts: it re-weights bans against what beat it and expects the same of you — series drafting is where `adaptability` (coach + players) cashes in.

## 3. The champion model (content, not code)

```ts
interface Champion {
  id: ChampionId;             // slug, e.g. 'grombak'
  name: string;               // "Grombak"
  epithet: string;            // "the Landslide"
  roles: Role[];              // [primary, ...flex] — flex champs are draft gold
  styleTags: Partial<Record<Archetype, number>>;  // weights, sum ≈ 1 — feeds proficiency ceilings (taxonomy §5)
  curve: { early: number; mid: number; late: number }; // power curve, sum = 1
  comboTags: ComboTag[];      // dive | pick | protectTheCarry | split131 | pokeSiege | earlyInvade | frontToBack
  counters: ChampionId[];     // hard lane/comp counters (sparse — 1–3 each)
  basePower: number;          // ~50; the patch system moves effective strength (meta doc)
  flavor: string;             // one line of world flavor — a legit humor slot
  chatLines: string[];        // 1–3 crowd reactions when picked (The Crowd system pulls these)
}
```

Launch distribution (48): **Top 10 · Jungle 9 · Mid 10 · Bot 9 · Support 10**, with ~8 flex champions whose `roles` span two positions. Every archetype has ≥3 viable pilots per patch so no meta ever deletes an archetype entirely; every role has at least one champion per major curve shape (early bully, mid-game spike, late scaler).

## 4. Draft evaluation — the score that feeds the match

Each completed draft produces a **draftScore differential** (bounded ±8 team-strength points) added to each side's `base` in `teamBreakdown` — the hook already exists. On the match scale (Δ/15 logistic), a decisively won draft (+8 vs 0) ≈ **71%** vs an otherwise equal team: the biggest single-match lever after roster quality, by design.

Per-side score = Σ over the five locked picks + comp terms:

```
// per pick (champ c, player p, role r, patch t):
comfort  = 2.0 * (prof(p,c) - 50)/50              // proficiency from taxonomy §5; the biggest per-pick term
meta     = 1.5 * (strength(c,t) - 50)/50          // patch strength (meta doc §2)
counter  = ±1.2 per resolved counter edge          // c.counters vs the opposing laner's lock
offRole  = picks resolve through effectiveRoleMult // an off-role pilot pays the taxonomy §4 tax

// comp terms (whole team):
combos   = Σ basePayoff(tag) * aptGate * chemGate  // meshing §5 — dive needs jungle–mid gelled, etc. basePayoff 2–3
curveFit = +2.0 * coherence − 2.0 * contradiction  // do the five curves agree on a win condition?
identity = 0.9..1.1 multiplier                     // roster playstyle centroid vs comp identity (meshing graft from B)
```

**Curve coherence:** the comp's weighted curve (Σ picks' curves) is scored for *commitment* — an early-game comp (early ≥ .45) or a scaling comp (late ≥ .45) earns the bonus; a mushy middle earns nothing; hard contradiction (a hyperscaling carry inside an all-in dive comp with no frontToBack tag) is penalized. This is what makes "draft a plan, not five strong champions" true.

**Win-condition label** (readability + the match sim): the dominant term names the comp — `Early Snowball`, `Protect the Star`, `Pick & Punish`, `Siege`, `1-3-1`, `Teamfight` — shown live on the board, echoed by the caster line and the crowd, and passed to the match engine so the generated timeline *tells that story* (an Early Snowball comp that goes even at 15 is described as already losing).

## 5. Ban logic & the draft AI

The AI (and your coach's suggestions — same engine, quality-gated) scores every legal action:

```
banValue(c)  = maxOverEnemyPlayers( comfort_enemy(c) + meta(c) )   // deny their best plan
             + flexTax(c)                                          // multi-role champs are worth extra denial
             + protectValue(c)                                     // ban the counter to YOUR intended comp
pickValue(c) = the §4 per-pick terms + option value (flex picks reveal less)
action       = argmax over candidates, evaluated with noise σ
σ            = f(coachQuality, patchFamiliarity)                   // good coach + good prep = sharper draft
```

A weak coach doesn't make *random* moves — it makes plausible-but-stale ones (over-values last patch's tier list, under-values your chemistry gates). That's legible in the post-draft review, which is how the player learns to out-draft.

**Auto-draft (default ON):** the team drafts for itself, in real time (3–6s per action) with Team Comms deliberating. Its quality is the roster's, not the manager's:

```
draftSkill = 0.35*coachQuality + 0.30*teamCohesion + 0.35*mean(shotcalling, adaptability, mapAwareness)
σ_noise    = 1.6 * (1 − 0.7*draftSkill/100) * (1 − 0.3*patchFamiliarity/100)
```

A cohesive, smart roster drafts with little noise even under a weak coach; a fractured one drafts erratically — the "inbuilt randomness that skilled teammates mitigate." The same engine and the same σ serve the AI opponents. Manual drafting stays available behind the toggle (`core/src/draft/draft.ts`: `draftSkill`, `draftNoiseSigma`).

**Delegation levels** (pillar 1's speed valve):
1. **Manual** — you take all 10 actions; coach suggestions shown ranked with reasons.
2. **Priorities** — you pre-set a target comp, protected picks, and priority bans; the coach executes and only interrupts on a broken plan ("They banned both your engage supports — pivot to Pick or force it?").
3. **Full delegation** — coach drafts; you watch with the crowd.

## 6. Readability surfaces (live, on the board)

- **Comp identity meter** — the win-condition label materializing as picks lock, with a clarity bar. (Design: the wireframes in `docs/06-ui-architecture.md`.)
- **Pilot warnings** — "Duskrow → Maaz: 34 proficiency, ceiling 58. He has never played carrion princes." Blocking nothing, warning loudly.
- **Chemistry gates** — a combo pick shows its anchor pair's gel state inline ("Dive payoff at 61% — jungle–mid still gelling").
- **Meta chips** — each champion card wears its patch tier (S/A/B/C) and movement arrow.
- **Post-draft verdict** — signed score with the top three contributing actions per side; feeds the same "why you won/lost" panel as meshing and form.

## 7. Worked example (abridged; the full 20-action table ships with the balance tests)

Patch 7.2: dive junglers buffed (+6 archetype), enchanters nerfed (−5). You are Red vs a scaling-comfort Blue team.

- **B1 Blue bans Grapnel** (your catcher comfort, prof 82) — correct deny, −2.0 to your best Pick plan.
- **R1 you ban Bellwether** (their mid's 88-prof scaling comfort, meta A) — banValue 2.9, their best plan gone.
- **Picks 1–6:** Blue first-picks Cindra (S-tier). You take Fenwick + Ryx double jungle/top tempo — committing to `Early Snowball` (curve early .52). Blue continues scaling.
- **Ban phase 2:** Blue, reading your tempo comp, bans Brindle (your early bot). You ban Basalt to strip their front-to-back.
- **Pick phase 2 (your counter window):** last pick Marrow into their locked mid — counter edge +1.2, comfort +1.4.
- **Verdict: Red +4.6.** Top contributors: the Bellwether ban, curve coherence +2.0 (clean early comp), the Marrow counter. Your win probability vs an equal roster: 61% — and the match timeline will now narrate a race against their scaling.

## 8. IP-safe vocabulary

Neutral objectives get fictional names used everywhere (sim, UI, crowd): the elemental drakes analogue is **the Warden** (stacking buffs), Baron analogue is **the Colossus**, Herald analogue is **the Battering Shade**, turrets are **bastions**. No Riot champion, item, or objective names anywhere in `packages/data`.

## 9. Determinism & tests

- Draft AI is pure: `(draftState, teamContext, patch, rngStream('draft:'+matchId)) → action`; noise σ drawn from the stream, so a replayed draft is identical.
- Golden tests: (1) snapshot a full 20-action AI-vs-AI draft on a fixed seed; (2) the §7 worked example's score reproduces; (3) property: draftScore ∈ [−8, +8]; ban of a 90-prof comfort always outranks a 55-prof one at equal meta.
- Balance harness report: draft-win vs match-win correlation (target: winning draft ≈ +8–12 percentage points of match win rate at equal rosters), and per-champion pick/ban rates per patch (no champion >60% presence for 3 consecutive patches).
