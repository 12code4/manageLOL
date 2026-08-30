# manageLOL — Team Meshing

*Systems deep-dive (`docs/05-systems/`). **The signature system**: how five players' hidden attributes combine into team performance, how rosters gel and break over time, and how the manager reads chemistry they can never see the numbers of. Implemented in `packages/core/src/players/meshing.ts`; the worked examples below (Anvil vs Allstars) are golden tests.*

> Read alongside: [`players-and-attributes.md`](players-and-attributes.md) §8 (the chemistry-driver "meshing contract" — the only attributes this system may read).

---

## How this spec was chosen (judged design panel)

Three independent approaches to meshing were designed and scored by a design director on authenticity, readability, depth, implementability, and storytelling:

| Approach | Idea | Score |
| --- | --- | --- |
| **A — Pairwise Chemistry Matrix** | a 5×5 matrix of pairwise chemistry with lane-duo weighting, collapsing to one team multiplier | **42.5** |
| **C — Wavelength** | latent hidden ceilings discovered over time, with breakthroughs and implosions | 42.5 |
| **B — Playstyle Identity** | five playstyle vectors resolving (or not) into one coherent, meta-matched identity | 40.5 |

**Decision: Approach A is the spine** — it matches the prior design decision (`01-game-design.md` §9: pairwise + team cohesion), has the strongest readability surface (the *Chemistry Web*, whose edges teach which pairs matter), and is the cheapest and most deterministic to ship (its ramp needs no RNG). **v1 implements the A spine below and is fully tested.**

**Grafts onto the spine (target refinements, roadmapped):**
- **From C:** reformulate each pair's ceiling as a *signed* value so two clashing high-ego stars contribute **negatively** (the true imploding superteam A can't express); split `current` into an *attunement fraction × ceiling* with an independent hidden ramp-rate; layer a discovery-fog "ceiling read" (phrased like potential) over the Web; add **breakthrough / breakdown** inbox events and a per-match variance sample.
- **From B:** add the **draft ↔ meta ↔ identity** coupling as a team-level layer above the matrix (roster playstyle centroid vs drafted-comp vector vs patch-favored vector), and the alignment-vs-complement axis split (agree on tempo/aggression/risk; spread map-side/roam/grouping).

The rest of this document is the **A spine as implemented** (the source designs for C and B are archived in the design workflow output).

---

## The pairwise chemistry model

## 0. Thesis in one line

Meshing is a **symmetric 5×5 chemistry matrix**. Each of the 10 pairs has a *ceiling* (`target`, from hidden compatibility) and a *current* value that **ramps toward the ceiling with shared competitive exposure**. Structurally important pairs (bot+support, jungle+everyone) are weighted higher when the matrix is collapsed into one team cohesion scalar. Two team-level gates — **shotcaller balance** and **language coverage** — modulate that scalar. Cohesion becomes a ±12% team-strength multiplier, and specific drafted comp payoffs are additionally gated behind the relevant *lane-duo* chemistry. Every input is hidden; the *matrix itself* is the legible surface.

This makes the two mandated outcomes fall out mechanically:
- **Superteam that can't play together:** high individual skill, but ego/temperament/language cap the pair ceilings low *and* slow the ramp, so cohesion sits low for a long time (Example A).
- **Stable roster overperforms:** every pair has been ramping for seasons and sits near its ceiling; a great outside signing *resets the four pairs it touches to a floor* and often ceilings them lower, so it can reduce team strength on arrival (Example B).

---

## 1. Data shapes

```ts
type PlayerId = string;
type PairKey  = string;                    // `${min(idA,idB)}|${max(idA,idB)}` — sorted, deterministic

interface PairChem {
  a: PlayerId; b: PlayerId;                // a < b lexicographically (explicit tiebreaker)
  target: number;                          // C*  0..100, recomputed only when a driver attr changes
  current: number;                         // C   0..100, ramps weekly toward target
  gelUnitsTogether: number;                // cumulative shared exposure (diagnostics + UI "gelling")
}

interface RosterChemistry {               // lives on the roster/relationship layer, NOT on Player
  orgId: string;
  pairs: Record<PairKey, PairChem>;        // exactly C(5,2)=10 entries for a set five
  lastRecomputedTick: number;
}

// Derived, never stored — recomputed on demand for the match sim and the UI:
interface CohesionBreakdown {
  pairScore: number;      // 0..100 weighted mean of currents
  shotBalance: number;    // 0.70..1.00
  langCoverage: number;   // 0.90..1.00
  cohesion: number;       // 0..100  = pairScore * shotBalance * langCoverage
  meshMult: number;       // 0.88..1.12  -> feeds match sim
  voices: number;         // effective shotcalling voices (for the analyst read)
  weakestPairs: PairKey[];// lowest-band pairs, for UI + "why you lost"
  gelling: boolean;       // any structural pair still < 0.8*target
}
```

Determinism: `PairKey` is always the two ids sorted; all matrix iteration is over `Object.keys(pairs).sort()`; the collapse iterates pairs in a fixed structural-weight table order. Ramp is a pure function of `(target, current, gelUnits)` — **no RNG required**. (Optional flavor jitter in §3 is drawn from the `growth` stream keyed by `pairKey+week`, off by default so golden-seed tests stay clean; drama events are the intended surprise source, not silent noise.)

---

## 2. Pair ceiling `target` = C*(a, b)

The ceiling is the product of four compatibility sub-factors and a small communication term, with a mentorship *bonus* multiplier. All sub-factors are built from **hidden chemistry drivers only**.

```
// helpers on 0..100 attrs:  n(x) = x/100 ;  mean(x,y) = (x+y)/200

// (i) personality fit — ego clash amplified by temperament volatility
egoClash    = n(a.ego) * n(b.ego)
egoTerm     = 1 - 0.5 * egoClash * (0.5 + 0.5*mean(a.temperament,b.temperament))
tempTerm    = 1 - 0.3 * n(a.temperament) * n(b.temperament)
fitPersona  = egoTerm * tempTerm                                   // ~0.45 (two toxic) .. 1.00

// (ii) teamplay axis — selfish carries mesh worse regardless of skill
fitTeamplay = 0.70 + 0.30 * mean(a.teamplayOrientation,b.teamplayOrientation)   // 0.70..1.00

// (iii) playstyle alignment across the 3 tempo axes (same game plan = good)
diffPlay    = ( |a.playstyleAggression-b.playstyleAggression|
              + |a.playstyleTempo     -b.playstyleTempo|
              + |a.playstyleRiskTaking-b.playstyleRiskTaking| ) / 300      // 0..1
fitPlay     = 0.60 + 0.40 * (1 - diffPlay)                         // 0.60..1.00

// (iv) communication ceiling term (language handled in the RAMP, §3)
commCeil    = 0.85 + 0.15 * mean(a.communication,b.communication)  // 0.85..1.00

// (v) mentorship BONUS — veteran develops a young teammate (also feeds growth tick, taxonomy §6)
vet=older, yng=younger ; ageGap=|a.age-b.age|
fitMentor   = 1 + 0.15 * n(vet.mentorship) * clamp((25-yng.age)/8,0,1) * (ageGap>=3?1:0)  // 1.00..1.15

C*(a,b) = clamp( 100 * fitPersona * fitTeamplay * fitPlay * commCeil * fitMentor , 0, 100 )
```

Anchor points: a near-perfect pair (low egos, selfless, aligned, great comms) lands **~90–100**; a healthy ordinary pair **~70–82**; two selfish high-ego volatile players ceiling around **~25–35** *no matter how mechanically skilled they are*. This is the whole point — skill lives in the match sim's individual role terms; the matrix only ever multiplies.

**Redundancy note (variance, not mean):** identical `playstyleRiskTaking` on a pair does *not* lower `target`, but two high-risk players on a structural pair widen that pair's contribution to per-game variance (they feed the match sim's `consistency`/throw spread, taxonomy §3/§10). Recorded here as an interface hook; the variance spec consumes `weakestPairs`+risk overlap.

---

## 3. `current` ramp — the rebuild dynamics

`current` starts at a floor when a pair is first formed and approaches `target` with exposure. This is where roster stability pays off and where "no shared language" bites.

```
// on pair creation (new signing / role swap partner):
current₀ = CHEM_FLOOR * target          // CHEM_FLOOR = 0.35  (pros can play day one, just not gelled)

// exposure earned per week (gelUnits):
//   full scrim-focused week = 1.0 ; official Bo1 = +0.5 ; each Bo3/Bo5 game = +0.4
gel = scrimShare*1.0 + officialGamesThisWeek_weighted

// ramp speed factors (this is the "language/communication ramp", GDD §9):
langRamp  = sharedLanguage(a,b) ? 1.0 : 0.55
introFac  = 1 - 0.40 * mean(a.introversion,b.introversion)     // 0.60..1.00
commRamp  = 0.70 + 0.30 * mean(a.communication,b.communication)// 0.70..1.00
speed     = langRamp * introFac * commRamp

// weekly update (growth stream tick; deterministic):
gap       = target - current
current  += K_RAMP * speed * gel * gap        // K_RAMP = 0.10 ; exponential approach to ceiling
gelUnitsTogether += gel
```

Behavior (favorable pair, `target=90`, `current₀=31.5`, full scrim weeks):
- **Shared language** (`speed≈1.0`): gap decays ×0.90/week → after a 16-week split `current≈79` (≈88% of ceiling). "Gelled by playoffs."
- **No shared language** (`langRamp .55`, intro .8, comm .85 → `speed≈0.37`): gap decays ×0.963/week → after 16 weeks `current≈58`. **Still visibly gelling at playoffs** — the authentic import-roster ramp.

**Roster change recompute (the disruption model):** replacing player X in the set five:
1. Delete the 4 pairs containing X. 2. Create 4 new pairs (X's replacement with the 4 stayers), each `target` from §2 and `current = 0.35*target`. 3. **The other 6 pairs are untouched** — their `current` persists. A one-in/one-out swap therefore damages 40% of the matrix but preserves the settled core; wholesale rebuilds (superteam) reset all 10. A **mid-season role swap** (taxonomy §4) is double-taxed: the swapped player pays the individual off-role `discomfort` penalty *and* resets every pair they touch — legibly the most expensive lever in the game.

Chemistry also **slowly bleeds** while a pair is split up (benched player, injury sub): `current -= 0.5/week` toward a floor of `0.5*current_at_split`, so re-inserting a benched starter isn't a full reset but isn't free either.

---

## 4. Collapse to team cohesion & the two team-level gates

### 4a. Structural pair weights (lane-duo emphasis)

```
W = { bot–support:2.0, jungle–mid:1.6, jungle–top:1.3, jungle–bot:1.2, jungle–support:1.1,
      mid–support:1.0,  mid–bot:0.9,   top–mid:0.8,     top–support:0.7, top–bot:0.6 }   // Σ = 11.2

pairScore = Σ_pairs W[pair] * current[pair]  /  11.2          // 0..100
```

Bot+support is the duo lane (highest); jungle sits central (its four edges sum to 5.2 — the most of any player), matching real LoL where the jungler must sync with all lanes. Top–bot cross-map coordination barely matters.

### 4b. Shotcaller balance (need *enough* voices, not too many)

```
callWeight_i = clamp01((shotcalling_i - 50)/30) * (0.5 + 0.5*n(leadership_i))   // 0..~1 per player
voices       = Σ_i callWeight_i
shotBalance  = clamp( 1 - 0.30*max(0, 0.8 - voices)      // silence penalty (GDD §4 close-out)
                        - 0.10*max(0, voices - 2.0),     // too-many-cooks penalty
                      0.70, 1.00 )
```
Zero callers → `~0.76` (−24%); one clear caller + a deputy (`voices≈1.1–1.8`) → `1.00`; four alphas all calling (`voices>2.5`) → `~0.85–0.95`. A star's *leadership* helps the ceiling but hurts here if the room is already full — captured directly.

### 4c. Language coverage (coordination-under-pressure floor)

```
maxSharedLangCount = size of the largest set of players sharing one common language
langCoverage       = 0.90 + 0.10 * (maxSharedLangCount / 5)   // 0.92 (all different) .. 1.00 (all share)
```
Light on purpose — language's *big* effect is the ramp (§3); this is the residual "still can't all shotcall in one language in a chaotic fight" tax.

### 4d. Cohesion → the match-sim multiplier

```
cohesion = pairScore * shotBalance * langCoverage           // 0..100
meshMult = 0.88 + 0.24 * (cohesion/100)                     // 0.88 .. 1.12
```

`meshMult` multiplies **team effective strength** in the v1 resolution model (tech plan §4: "…synergy…"), i.e. `teamStrength' = teamStrength_fromRolesFormFatigueDraft * meshMult`. A perfectly gelled roster and a dysfunctional one of *identical individual skill* differ by up to **24%** of team strength — the single largest non-draft, non-skill swing, which is what makes this the signature system, while still bounded below draft+skill so meshing supports rather than replaces roster quality.

---

## 5. Coupling to champion & role proficiency (comp only works if they can pilot it)

Meshing never edits individual role strength (that stays taxonomy §4 `effectiveRoleMult`) or champion proficiency ceilings (taxonomy §5). Instead it **gates comp payoffs at draft resolution**, so a comp needs three things: the right *aptitude*, the right *player playstyle identity*, and — for coordinated combos — the right *lane-duo chemistry*.

Each drafted comp carries `comboTags` (e.g. `dive`, `pick`, `protectTheCarry`, `split131`, `pokeSiege`). Each tag maps to an **anchor pair** and a **required archetype** (data, in `packages/data`):

```
COMBO_ANCHORS = {
  dive:           { pair:'jungle–mid',  archetype:'aptAssassin'   },
  pick:           { pair:'bot–support', archetype:'aptCatcher'    },
  protectTheCarry:{ pair:'bot–support', archetype:'aptEnchanter'  },
  split131:       { pair:'jungle–top',  archetype:'aptSplitPush'  },
  pokeSiege:      { pair:'mid–support', archetype:'aptPoke'       },
  earlyInvade:    { pair:'jungle–top',  archetype:'aptEarlyJungle'},
}

// per drafted comboTag:
aptGate  = mean( proficiency(playerX, pickedChamp) for the two anchor players ) / 100   // taxonomy §5
chemGate = 0.5 + 0.5 * current[anchorPair]/100                                          // 0.5..1.0
comboPayoff = basePayoff(tag, patch) * aptGate * chemGate         // added to draft-strength score
```

So a "protect-the-carry" comp with a world-class enchanter + hypercarry ADC still delivers only **half its payoff** if the bot duo hasn't gelled (`chemGate→0.5`) — the "great individuals, no duo synergy" fantasy made mechanical *inside the draft screen*. And a comp whose required archetype the roster can't pilot (`aptGate` low) simply isn't theirs to draft — which is the meta/adaptability tension.

There's also a soft **comp-identity alignment** term tying `preferredArchetype`/playstyle axes to the drafted comp (a scaling, passive roster forced into a hyper-dive comp): `identityFit = 0.9 + 0.1*(1 - meanAbsDiff(roster playstyle centroid, comp identity vector))`, multiplied into total draft strength. Small, but it rewards drafting *to your roster's soul*, not just the patch.

---

## 6. Readability (pillar 2) — hidden inputs, legible signals

Nothing above is shown as a number. The manager reads meshing through four surfaces, all derived from the matrix:

1. **The Chemistry Web** (headline UI, Squad screen). A pentagon of the five players; each of the 10 edges colored by a **band** of `current` and thickened by structural weight `W`:
   `<30 Toxic (red) · 30–50 Cold · 50–70 Warming · 70–85 Solid · 85+ Locked-in`. The bot–support and jungle edges are visibly thickest, teaching the player *which* pairs matter. A dashed edge with an ↑ arrow = **still gelling** (`current < 0.8*target`) — momentum, not value.
2. **Team cohesion rating.** `cohesion` → a five-step label `Fractured / Loose / Functional / Cohesive / Unbreakable` (never the scalar). The `gelling` flag adds "trending up."
3. **Analyst read** (natural language, generated from `CohesionBreakdown`, accuracy gated by the analyst's attribute + your scouting confidence — a weak analyst gives vaguer or occasionally wrong reads, so *reading your own chemistry is itself earned*). It names the largest-magnitude contributors **qualitatively**: a low `fitPlay` pair → "your jungler and mid want to play different tempos"; `voices>2.0` → "too many shotcallers — comms are crowded"; no shared language → "the roster has no common language; they'll take longer to sync." It surfaces the *shape* of the problem, never the driver value.
4. **Post-match "why you won/lost."** `meshMult` appears as a bar in the existing breakdown ("Team synergy +6%" / "−4%"), and any under-delivered duo combo is called out from `weakestPairs`: "Your dive never came together — jungle/mid still gelling (combo delivered 4.3 of a possible 6.1)." Losses teach; the black-box is banned (risk table, tech plan §9).

Hidden drivers stay hidden — the manager infers `ego`/`temperament`/`introversion` by watching a pair *refuse to gel* over weeks (a low, flat edge) and through drama events, exactly the intended slow-reveal.

---

## 7. Worked examples

### Example A — identical visible skill, opposite meshing

Both rosters are tuned to the **same team base strength 72** (same role effective-strengths, form, fatigue, draft). Only the hidden matrix differs.

**"Anvil"** — together two seasons, all share language *Coran*, low egos, one clear caller + a deputy. Sample pair from §2 (bot–support, egos 40/35, temp 30/40, comm 75/80, teamplay 70/85, aligned play): `target ≈ 81`, gelled `current ≈ 79`. Full matrix currents `{bs79, jm76, jt72, jb74, js73, ms70, mb71, tm68, ts66, tb67}`.
```
pairScore   = Σ W·current / 11.2 = 817.0/11.2 = 73.0
voices      = 0.82(caller) + 0.31(deputy) = 1.13  -> shotBalance = 1.00
langCoverage= all 5 share Coran -> 1.00
cohesion    = 73.0 ;  meshMult = 0.88 + 0.24*0.730 = 1.055   (+5.5%)
teamStrength' = 72 * 1.055 = 75.97
```

**"Allstars"** — five bought stars, 3 weeks together, no common language, three ex-captains. Ego/temperament cap targets ~55–65; slow ramp leaves currents near the floor: `{bs40, jm34, jt32, jb33, js31, ms30, mb35, tm28, ts27, tb29}`.
```
pairScore   = 369.9/11.2 = 33.0
voices      = 0.91+0.77+0.62+0.21 = 2.51  -> shotBalance = 1 - 0.10*(0.51) = 0.948
langCoverage= best shared by 2 -> 0.94
cohesion    = 33.0*0.948*0.94 = 29.4 ;  meshMult = 0.88 + 0.24*0.294 = 0.951  (-4.9%)
teamStrength' = 72 * 0.951 = 68.44
```

**Head to head** (logistic `P = 1/(1+10^(-Δ/15))`): Δ = 75.97 − 68.44 = 7.53 → **P(Anvil) ≈ 0.76**. The gelled roster beats the equal-on-paper superteam **~76%** of the time, purely on meshing. And it's a *story arc*: Allstars' currents keep ramping (slowly, no shared language), so by split playoffs their `meshMult` climbs toward parity — "the superteam finally clicked" emerges without scripting.

### Example B — a great individual *lowers* team strength

Take Anvil and replace the solid top laner (role strength 70) with a **superstar top (role strength 82, +17%)** who has ego 90, temperament 80, introversion 75, and speaks only *Xin* (no overlap).

- Individual: top role 70 → 82. Team base strength ≈ (72·5 − 70 + 82)/5 = **74.4** (up).
- Matrix: the 4 top pairs are deleted and recreated at `0.35·target`; the star's high ego/temp/intro give low targets, so currents reset to ~12–14. The other 6 pairs persist.
  New currents `{bs79, jm76, jt14, jb74, js73, ms70, mb71, tm13, ts12, tb12}` → weighted sum 626.8 → `pairScore = 56.0` (down from 73.0).
- `voices` nudges over 2.0 (star is also loud) → `shotBalance ≈ 0.996`; `langCoverage` = best-shared 4/5 = 0.98.
```
cohesion = 56.0*0.996*0.98 = 54.7 ;  meshMult = 0.88 + 0.24*0.547 = 1.011  (+1.1%, down from +5.5%)
teamStrength' = 74.4 * 1.011 = 75.23   <   75.97 (the old lineup)
```

**The team is weaker the day the star arrives** (75.23 < 75.97), despite +17% individual skill on a role — the four reset pairs and the crashed cohesion outweigh it. With no shared language it rebuilds *slowly* (Example A's ramp math) and, because ego/temperament cap those targets low, it **never returns to the old +5.5%**. This is the "why did signing a superstar make us worse" moment, fully explainable from the Chemistry Web (three edges dropped to Cold) and the analyst read ("no common language; crowded comms").

### Example C — the same duo, gated by lane chemistry

Anvil's bot lane drafts a `pick` comp (anchor bot–support, required `aptCatcher`), both players proficient 85 on the picks, `basePayoff = 8` draft points.
```
aptGate  = 85/100 = 0.85
gelled duo:  chemGate = 0.5 + 0.5*79/100 = 0.895 -> payoff = 8*0.85*0.895 = 6.09
fresh sub:   chemGate = 0.5 + 0.5*25/100 = 0.625 -> payoff = 8*0.85*0.625 = 4.25   (-30%)
wrong tools: aptGate 0.45 (prof 45)             -> payoff = 8*0.45*0.895 = 3.22
```
Same individual skill, ~30% less payoff when the duo isn't synced (chem gate) — and a different, legibly-separate failure when they simply can't pilot the archetype (apt gate). Both show up in the post-match "why."

---

## 8. Determinism & test hooks

- Pure functions: `computePairTarget(a,b)`, `rampChemistry(pair, gel)`, `onRosterChange(chem, oldFive, newFive)`, `computeCohesion(roster, chem) → CohesionBreakdown`, `meshMult(cohesion)`. No wall-clock, no `Math.random`; ramp needs no RNG at all.
- All iteration over sorted `PairKey`s / the fixed `W` table order — no reliance on `Map`/object insertion order (CLAUDE.md determinism rule).
- **Golden-seed tests:** (1) snapshot a generated roster's full 10-pair `target` matrix; (2) snapshot cohesion after a fixed 16-week ramp schedule; (3) the Example-B swap must reproduce `meshMult 1.055 → 1.011` exactly; (4) property test: `meshMult ∈ [0.88, 1.12]` and cohesion is monotonic non-decreasing under continued shared exposure with no roster change. These feed the balance harness's "stable-vs-bought roster win-rate" report (tech plan §8).

---

Relevant existing files this section binds to: `/home/user/manageLOL/docs/01-game-design.md` (§9 synergy, §13 match/draft), `/home/user/manageLOL/docs/02-technical-plan.md` (§4 resolution model, §5 data model `RosterChemistry`). Target modules: `packages/core/src/players/meshing` (new) and the combo-anchor table in `packages/data`.
