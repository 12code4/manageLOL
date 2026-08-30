# manageLOL — Ranked Ladder & Talent Discovery

*Systems deep-dive (`docs/05-systems/`). The solo-queue ladder is the primary way you find players. Implemented in `packages/core/src/ladder` (MMR model, tiers, entity generation, flag reveal) with the two worked examples below as golden tests.*

> Read alongside: [`players-and-attributes.md`](players-and-attributes.md) (the fog transform and attributes the ladder reads) and [`competition-pyramid.md`](competition-pyramid.md) (where signed players compete).

---

# manageLOL — The Ranked Solo-Queue Ladder & Talent Discovery

*Design spec. The ladder is a first-class world system and the **primary talent-discovery pipeline** — the "recruit off the ladder" fantasy from GDD §6. It is deterministic (new named RNG stream `ladder`), fog-driven (reuses the §11 scouting transform verbatim), and cheap enough to run for a fully-simulated region every week without slowing the day-tick (tech plan §7). It consumes only the canonical attribute keys; it invents no parallel stats.*

---

## 1. Design intent (pillar check)

- **Meaningful decisions, light micro (pillar 1):** the ladder is a *browsing + betting* surface, not a spreadsheet. You spend a scarce scouting resource to convert visible-but-noisy rank into narrowing truth, then bet a signature.
- **Readable (pillar 2):** rank is a *legible, wrong-in-known-ways* proxy for skill. Every mis-signal (smurf, boosted, one-trick, autofill victim, hidden gem) is a named mechanical archetype with a formula, so a scouting hit or miss is always explainable after the fact.
- **Earn your seat (pillar 3):** ladder *reach* is gated by org tier and the scouting-network facility (§6-GDD). An amateur org sees only its home region's ladder; foreign ladders unlock later. Cheap gems in your own backyard are the amateur org's lifeline.
- **IP-safe (pillar 4):** fictional tier names (below), fictional handles from region name pools, no Riot rank names.

---

## 2. Tier / division structure & the LP/MMR model

Ten tiers, mineral-to-apex theme (Iron→Challenger analogues), fully fictional:

| # | Tier (key) | Analogue | MMR band | Divisions | Region share | Count @ N=200k |
|---|------------|----------|----------|-----------|--------------|----------------|
| 0 | `slate` | Iron | < 900 | IV–I | 3% | 6,000 |
| 1 | `copper` | Bronze | 900–1200 | IV–I | 12% | 24,000 |
| 2 | `quartz` | Silver | 1200–1500 | IV–I | 20% | 40,000 |
| 3 | `amber` | Gold | 1500–1800 | IV–I | 22% | 44,000 |
| 4 | `jade` | Platinum | 1800–2050 | IV–I | 18% | 36,000 |
| 5 | `cobalt` | Emerald | 2050–2300 | IV–I | 16% | 32,000 |
| 6 | `onyx` | Diamond | 2300–2600 | IV–I | 8% | 16,000 |
| 7 | `ascendant` | Master | 2600–2850 | LP ladder | 0.8% | 1,600 |
| 8 | `paragon` | Grandmaster | 2850–3050 | top ~300 | 0.15% | 300 |
| 9 | `apex` | Challenger | > 3050 | top ~150 | 0.05% | 100 |

`N` is a per-region **nominal ranked population** used only to compute percentiles/tier cutoffs and the pyramid display — it is *not* a stored entity count (see §3). A fully-simulated region uses `N ≈ 150k–260k` (a region flavor knob; the "mechanical-prodigy" region has a fatter `onyx+` tail).

**MMR** is the hidden matchmaking number (`~500..3400`), the true axis. **LP** is pure display of MMR position within the current division:

```
divWidth        = tierWidth(tier) / 4                       // e.g. onyx: 300/4 = 75 MMR
lp(entity)      = clamp( round( (mmr - divFloor)/divWidth*100 + formLpNoise ), 0, 100 )
// crossing 100 → promote a division; dropping below 0 → demote. NO promo-series minigame in v1
// (deliberate: pillar 1 — a promo Bo5 on the ladder is homework, not a decision).
```

`ascendant/paragon/apex` skip divisions and rank purely by MMR (LP shown as raw `mmr - 2600`). Tier cutoffs for the top three are **dynamic** — re-derived each ladder tick from the live sorted MMR list so "Apex is the top ~150 accounts" stays true as the population drifts (deterministic: sort with `(mmr desc, entityId asc)` tiebreak).

---

## 3. Population model — two-layer, mostly derived

Storing 200k entities per region would bloat saves and violate the perf envelope. Instead:

**Layer A — the masses (`slate`..`amber`, ~78% of accounts): NOT stored.** They exist as a *statistical background* (the pyramid table above) plus **on-demand deterministic instantiation**. Any account below the prospect band is a pure function of its slot id:

```ts
// deterministic, zero-storage: derive a full-ish entity from region seed + slot index
function deriveMassEntity(regionId: RegionId, slotIndex: number): LadderEntity
  // rng = RngSource.stream(`ladder:mass:${regionId}:${slotIndex}`)
```

The browser only materializes mass entities that a filter/scroll actually requests (rare — nobody scouts Copper IV), so it costs nothing in the common case.

**Layer B — the prospect pool (~top few %): stored.** These are real `LadderEntity` records that drift, decay, get scouted, and can be promoted. Stored set per simulated region ≈ **~4,000**:

- all of `ascendant`+ (~2,000),
- a seeded sample of `onyx` (~1,500),
- a seeded **hidden-gem sprinkle** salted down into `cobalt`/`jade`/`amber` (~500) — this is what makes low-tier diamonds-in-the-rough mechanically real and findable.

This matches tech plan §7 ("a few thousand scoutable ladder prospects"). Real pros, academy players, and the manager's own roster **also carry a `LadderStanding`** and appear inline in the browser (they ladder too, §8).

### 3.1 Data shapes — ladder entity vs full player

```ts
type LadderTier =
  | 'slate'|'copper'|'quartz'|'amber'|'jade'|'cobalt'|'onyx'|'ascendant'|'paragon'|'apex';
type LadderFlag = 'smurf'|'boosted'|'oneTrick'|'hiddenGem'|'bust'|'autofillVictim'|'veteranReturnee';
type PotTier = 'unknown'|'fringe'|'starter'|'allpro'|'generational';
type AgeBand = '16-18'|'19-21'|'22-24'|'25-27'|'28+';

interface LadderEntity {
  id: LadderEntityId;                 // stable across the save
  regionId: RegionId;
  genSeed: number;                    // THE key: seeds full-fidelity materialization (§3.2)
  handle: string;                     // fictional summoner name (region name pool)
  primaryRoleGuess: Role;             // role they queue most — visible, noisy
  ageBand: AgeBand;                   // fogged to a band pre-scout; exact age on promotion

  // --- visible ladder state ---
  mmr: number; lp: number; tier: LadderTier; division: 1|2|3|4;   // 1 = "I"
  peakMmr: number; peakTier: LadderTier;
  gamesThisSeason: number; winRate: number;                       // winRate noisy ±
  lastActiveWeek: number;
  topArchetypesPlayed: Archetype[];   // "champ pool read" — visible, noisy, 1–3 entries

  // --- HIDDEN generation & sim params (never shown; drive climb + materialize) ---
  hidden: {
    soloAbility: number;              // 0..100, cached (§4)
    steadyMmr: number;                // where they settle with ∞ games
    biasMmr: number;                  // persistent distortion (the noise source, §4)
    boost: number;                    // current boost offset in MMR, decays weekly
    boostDecay: number;               // MMR/week the boost bleeds off
    archetypeLean: Archetype;         // soloq identity
    potentialTier: PotTier;
    flags: LadderFlag[];
  };

  scoutById: Map<OrgId, LadderScouting>;   // per-org fog (mirrors §11)
  materializedPlayerId?: PlayerId;         // set once promoted to a full Player
}

interface LadderScouting {
  status: 'spotted'|'shortlisted'|'scouting'|'contacted'|'trial'|'passed';
  confidence: number;                 // 0..1 overall, scales per-attr fog half-width
  weeksScouted: number;
  revealedFlags: LadderFlag[];        // subset of hidden.flags surfaced so far
  potentialRead: { tier: PotTier; confidenceLabel: string };  // e.g. {allpro,"low confidence"}
}

// Full players get a lightweight standing instead of an entity:
interface LadderStanding { mmr:number; lp:number; tier:LadderTier; division:1|2|3|4;
                           peakMmr:number; gamesThisSeason:number; lastActiveWeek:number; }
```

A `LadderEntity` is ~2 dozen scalar fields; a full `Player` (§0 taxonomy) is an order of magnitude larger with the full attribute vector, championPool, careerHistory, scouting record.

### 3.2 Promotion to full fidelity (deterministic materialization)

The trick that makes this cheap **and** consistent: at generation we roll a *full* attribute vector, compute `soloAbility`/`steadyMmr` from it, then **discard the vector**, keeping only `genSeed` + the light fields. The truth is re-derivable at will:

```ts
function materializeAttributes(e: LadderEntity, world: World): PlayerAttributes {
  const rng = RngSource.stream(`worldgen:ladder:${e.id}`).reseed(e.genSeed);
  // same region distribution + archetypeLean bias used at gen → identical vector every call
  const attrs = rollAttributesForRegion(e.regionId, e.hidden.archetypeLean, e.hidden.potentialTier, rng);
  // invariant enforced at gen & re-checked here: soloAbility(attrs) === e.hidden.soloAbility
  return attrs;
}
```

- **Fogged reads pre-signing** call `materializeAttributes` on the fly (cheap — only for the handful being scouted) and pass truth through the §11 fog transform. Nothing is persisted; the manager's fogged view is *always* consistent with the eventual truth because both come from the same seed.
- **Promotion** (on `contacted` → `trial`, or at signing) persists the materialized attrs, mints a real `Player.id`, sets `materializedPlayerId`, copies `LadderScouting.confidence` into `Player.scouting.confidence`, and converts the entity's ladder state into a `LadderStanding`. Golden-seed test: materialize → snapshot vector, mutate unrelated systems, re-materialize → identical.

---

## 4. The attributes → rank model (correlated, noisy — where the archetypes live)

Solo queue rewards *different* things than pro play: individual carry over teamplay, snowball archetypes over utility, tilt-proofing over shotcalling. So the ladder does **not** read pro `CA` (§6 taxonomy). It reads a distinct `soloAbility`:

```
soloAbility(a) = clamp100(
    0.26*mechanics + 0.16*laning + 0.14*teamfighting
  + 0.12*mapAwareness + 0.10*reflexes + 0.08*positioning
  + 0.08*waveManagement + 0.06*composure )            // weights sum = 1.00
```

(No `shotcalling`, `leadership`, `visionControl`, `objectiveControl` — deliberately: the washed-veteran shotcaller who is a pro monster can be *hard-stuck* on ladder, and the ladder-god one-trick can be a pro liability. This gap is the whole design.)

**Base MMR** — a compressed map (the top is hard to reach):

```
MMR_FLOOR = 500 ; MMR_CAP = 3400 ; RANGE = 2900 ; GAMMA = 1.6
baseMmr(a) = MMR_FLOOR + RANGE * (soloAbility/100)^GAMMA
```

**Persistent bias** — `biasMmr` is the sum of named, truth-derived distortions. This is the *structured* noise that creates every misread archetype:

```
b_meta   = RANGE * 0.10 * ((maxSoloApt - 50)/50)         // one-trick soloq climbers over/under-perform pro value
                                                          //   maxSoloApt = max over soloq-favored aptitudes:
                                                          //   {aptAssassin, aptLaneBully, aptSkirmisher,
                                                          //    aptScalingCarry, aptEarlyJungle, aptCatcher}
b_mental = RANGE * 0.04 * ( ((composure-50)/50) + ((tiltResistance-50)/50) ) / 2   // ladder punishes tilt
b_role   = autofillVictim ? -RANGE*0.05 : 0              // forced off primaryRole aptitude on ladder
b_boost  = hidden.boost                                   // duo-carried / bought elo; decays (§5)
biasMmr  = b_meta + b_mental + b_role + b_boost
steadyMmr = clamp(baseMmr + biasMmr, MMR_FLOOR, 3400)
```

**Current MMR converges toward steady as games accumulate** — this single mechanic produces smurfs *and* the "rising talent surfaces mid-season" beat for free:

```
G_TAU = 120                                   // games to ~63% convergence
convergence(g)  = 1 - exp(-g / G_TAU)         // 0 at placement → 1 asymptote
placementMmr(a) = 1200 + 0.15*steadyMmr + placementNoise   // new accounts start well below steady
currentMmr      = placementMmr + (steadyMmr - placementMmr) * convergence(gamesThisSeason)
```

**Volatile noise** (form on ladder): each ladder tick adds a small mean-reverting jitter to displayed LP only (`formLpNoise ~ N(0, 6)` on the `ladder` stream), so ranks flicker week-to-week without moving truth.

### 4.1 The misread archetypes, derived — not scripted

Every recruiting-fantasy archetype falls out of the two-axis model (`soloAbility` truth vs `currentMmr` display):

| Archetype | Mechanical signature | Manager experience |
|---|---|---|
| **Smurf** | high `steadyMmr`, low `gamesThisSeason` → `currentMmr ≪ steady` | rank *understates* skill; climbs fast if they keep playing |
| **Boosted** | positive `b_boost`, high games, mediocre `baseMmr` | rank *overstates* skill; **falls** as boost decays (§5) |
| **One-trick** | large `b_meta` from one `maxSoloApt`, weak elsewhere | ladder-inflated vs pro value; collapses off-meta / off-champ |
| **Autofill victim** | `b_role = -RANGE*0.05`, strong on true `primaryRole` | rank *understates*; buy them, play them in-role, they pop |
| **Hidden gem** | high `potentialTier`, moderate current tier, salted low (§3) | low current ability, huge ceiling — the develop-and-flip jackpot |
| **Bust** | fine `soloAbility`, low `potentialTier` | looks pro-ready, no growth left; the trap |
| **Veteran returnee** | high macro attrs, decayed `reflexes`/`mechanics` → mediocre `soloAbility` | hard-stuck on ladder, elite shotcaller — the ladder can't see it |

Note the two independent traps in opposite directions (boosted/bust flatter, smurf/autofill hide) — which is why a raw ladder read is a *bet*, and scouting (§7) is what converts the bet into a decision.

---

## 5. Climb & decay over time (the ladder stays alive)

Runs on a **weekly `ladder` tick** (`RngSource.stream('ladder:'+regionId+':'+week)`), folded into the existing weekly aggregation so it adds no new interrupt:

```
for each stored LadderEntity e (deterministic order: sort by e.id):
  weeklyGames   = poisson(activity(e)) on ladder stream        // activity from a per-entity grind trait
  e.gamesThisSeason += weeklyGames
  if weeklyGames == 0 and (week - e.lastActiveWeek) >= DECAY_GRACE(tier):
      e.mmr -= DECAY_STEP(tier)                                // ascendant+ decays; onyx- frozen
  else:
      e.lastActiveWeek = week
      // boost bleeds off — boosted accounts regress
      e.hidden.boost = max(0, e.hidden.boost - e.hidden.boostDecay)
      recompute steadyMmr (boost change + patch meta shift, below)
      step   = STEP_MAX * (weeklyGames / (weeklyGames + 8))     // more games → faster convergence
      e.mmr += (e.hidden.steadyMmr - e.mmr) * step
  e.mmr += formLpNoise
  e.peakMmr = max(e.peakMmr, e.mmr); recompute tier/division/lp; refresh winRate estimate
```

Constants: `DECAY_GRACE(ascendant+) = 2 weeks`, `DECAY_STEP = 40 MMR/idle-week`, `STEP_MAX = 0.5`.

- **Rising talents surface:** smurfs' `gamesThisSeason` climbs → `convergence` rises → `currentMmr` chases `steadyMmr` up. A smurf spotted in Amber in week 3 is Onyx by week 12 — the manager who scouted early got the bargain price. New smurf entities are **spawned each preseason and sprinkled weekly** (fresh `gamesThisSeason≈0`, high `steadyMmr`) from academy/region generation, so the ladder always has undiscovered talent.
- **Boosted fall:** `boost` decays `40–80 MMR/week`; the account slides back to its real `baseMmr`. Scout them late and you catch the collapse; scout them early and only the `BOOSTED` flag saves you.
- **Meta ties in (§10-GDD):** on a patch, the set of soloq-favored aptitudes shifts, so `b_meta` is recomputed → one-trick ranks **swing with the patch**. A one-trick assassin main craters when the assassin archetype is nerfed — visible on the ladder as a rank drop, and a legible reason for the manager.
- **Season reset:** at preseason `gamesThisSeason → 0` and `currentMmr → softReset(mmr)` (compress toward the mean by ~15%), re-opening the smurf gap for a fresh discovery cycle each year.

---

## 6. The fog (rank visible, truth hidden)

The ladder reuses the §11 scouting transform unchanged; it only defines *what starts visible*:

- **Always visible (no scouting needed):** tier / division / LP, `peakMmr`/`peakTier`, `regionId`, `primaryRoleGuess`, `gamesThisSeason`, a noisy `winRate`, `ageBand`, `topArchetypesPlayed` (noisy 1–3 read).
- **Hidden until scouted (fogged per §11):** every attribute in the taxonomy. Half-width starts at the max spread (±22 for fogged keys; hidden keys never numeric) and shrinks with `LadderScouting.confidence`.
- **Diagnostic flags** (`smurf`/`boosted`/`oneTrick`/`hiddenGem`/`bust`/`autofillVictim`) are **derived from truth** and revealed at confidence thresholds — the payoff of spending scouting resource.

The correlation is intentional and imperfect: `corr(currentMmr, soloAbility) ≈ 0.75` across the pool (loosened by `biasMmr` + convergence), and `corr(currentMmr, proCA) ≈ 0.55` (loosened further because ladder ignores macro/shotcalling/utility). A balance-harness report (tech plan §8) tracks both correlations so we can tune `GAMMA`, `b_meta` weight, and `G_TAU` to keep gems rare-but-real (target: ~1 signable hidden gem per region per season for a mid-tier scouting network).

### 6.1 Scouting resource & fog narrowing

Scouting is metered by **analyst-weeks** (a weekly budget = base + analyst `mapAwareness`/scouting-quality + scouting-network facility tier). Assigning an analyst to an entity for a week:

```
Δconfidence = SCOUT_BASE * (analystScouting/100) * regionReachMult    // SCOUT_BASE ≈ 0.18/week
confidence  = min(1, confidence + Δconfidence)
```

Flag/potential reveal thresholds (deterministic, from truth):

- `conf ≥ 0.35`: `potentialRead.tier` sharpens one step; `topArchetypesPlayed` noise removed.
- `conf ≥ 0.50`: reveal `oneTrick` / `autofillVictim` if present; role aptitude ranges tighten.
- `conf ≥ 0.65`: reveal `smurf` / `boosted` verdict (the make-or-break read) and a `hiddenGem` / `bust` potential-confidence upgrade.
- **A trial (§7) is worth a large discrete jump** (`+0.30 conf`) because it generates *real* performance data, not scouting inference.

`regionReachMult`: `1.0` home region, `0.5` allied region (needs scouting-network tier ≥ 2), `0` foreign (locked until top-league + tier-3 network) — pillar 3 gating.

---

## 7. Manager interaction — the ladder browser & the pipeline

**Screen: Scouting → Ladder tab** (extends GDD §16 screen 4). A dense, filterable list of entities the org can currently reach.

**Filters:** `role`, `region` (reach-gated), `tier` range, `ageBand`, `peakTier`, and **playstyle read** (filter by visible `topArchetypesPlayed`, e.g. "show me aggressive early-jungle reads"). Plus derived filters unlocked by scouting: `onlyShortlisted`, `hasRevealedFlag`, `potentialRead ≥ starter`.

**A row (unscouted) shows:** handle, tier badge + LP, peak, role, ageBand, games/winrate, archetype read, and a **greyed potential guess** ("Potential: ? — unscouted"). No attribute numbers.

**A row (scouted) shows:** everything above plus narrowing fogged attribute ranges on hover, `potentialRead` with a confidence label ("All-Pro ceiling — medium confidence"), and any revealed flag badges (a green `SMURF`, a red `BOOSTED`).

**The pipeline (status machine on `LadderScouting.status`):**

```
spotted → shortlisted → scouting → contacted → trial → signed(academy|main)
                                       └────────────→ passed
```

1. **Spotted** — appears in the browser (reach-gated). Free.
2. **Shortlisted** — pinned to the shortlist; the analyst passively drips `+0.03 conf/week` even without a dedicated assignment.
3. **Scouting** — dedicated analyst-weeks assigned; confidence climbs per §6.1; flags reveal.
4. **Contacted** — reach out to the (unrepresented, amateur) player. Interest = f(your org reputation, their `ambition`, offered path). Low-rep amateur orgs *can* still land unscouted gems precisely because nobody else contacted them — the amateur org's edge.
5. **Trial** — invite to an academy tryout: simulate a handful of scrim + solo-queue games producing **real performance samples** (`+0.30 conf`, can flip a `smurf`/`bust` verdict to certainty). This is the promotion point (§3.2): the entity materializes into a full `Player`.
6. **Signed** — to the **academy roster** (cheap dev contract, grows via §8 solo queue + drills) or straight to the **main roster** (rare for a raw ladder find). Academy → main promotion is the develop-and-flip payoff loop (GDD §7).

Everything is inbox-surfaced (GDD §9): "Your analyst flagged a possible smurf in Amber," "Contacted prospect wants a starter promise" — decisions, not homework.

---

## 8. Own players & solo queue (training tie-in, GDD §8)

When the weekly training plan allocates **solo-queue hours** (GDD §8), the manager's own players ladder for real. `soloGames = round(soloHours * GAMES_PER_HOUR)`, `GAMES_PER_HOUR ≈ 0.6`. Effects, all onto existing state/attr keys — no new ones:

```
// FATIGUE — the cost (scaled by burnoutProneness, taxonomy §10):
burnoutFactor  = 0.7 + 0.6*(burnoutProneness/100)
fatigue += soloGames * F_SOLO * burnoutFactor            // F_SOLO ≈ 0.8

// SHARPNESS — the main benefit (match-readiness, taxonomy §10):
sharpness += (100 - sharpness) * min(1, soloGames/12) * 0.4

// FORM — maintenance nudge from ladder results (mean-reverting toward 50, small):
form += clamp( (ladderWinRateThisWeek - 0.5) * 8, -3, +3 )

// GROWTH — feeds ONLY the mechanical channel of the §6 dev tick (macro/teamfighting need scrims):
soloDevBonus = K_SOLO * (soloGames/12) * (gap_mech/50) * (learningRate/100)   // K_SOLO ≈ 0.15 CA/wk
   ; applied to {mechanics, laning, reflexes} only
```

Their own `LadderStanding` climbs via the §4 model on their *true* `soloAbility`, so a star player sitting in Apex is a readable brand/form signal, and a slumping starter visibly dropping divisions is a legible early warning the manager can act on. Over-allocating solo queue → fatigue spike → burnout event risk (GDD §8), the intended tension.

*Worked (own player):* starter with `soloAbility 74`, `learningRate 60`, `gap_mech 12`, `burnoutProneness 55`, plays `soloHours 20 → soloGames 12`.
`fatigue += 12*0.8*(0.7+0.6*0.55)=12*0.8*1.03=+9.9`; `sharpness += (100−80)*1*0.4=+8`; `soloDevBonus = 0.15*1*(12/50)*0.60 = 0.15*0.24*0.6 = +0.022 CA/wk` onto mechanics/laning/reflexes — small but real, and it keeps a benched player from going stale (sharpness) at a fatigue cost.

---

## 9. Two worked ladder entries

### Example A — Hidden gem (smurf + autofill victim)

Handle `wraithcoil` · region Meridia · displayed **Jade IV** · peak Jade IV · role read Mid · age band 16–18 · 44 games · 71% WR · archetype read `[assassin]`.

Truth (materialized): `soloAbility = 82`; strong `aptAssassin 88`; `composure 70`, `tiltResistance 65`; forced off-role on ladder (`autofillVictim`); `potentialTier = allpro`.

```
baseMmr   = 500 + 2900*(0.82)^1.6 = 500 + 2900*0.728 = 2612          // ~onyx
b_meta    = 2900*0.10*((88-50)/50) = 290*0.76 = +220
b_mental  = 2900*0.04*(((70-50)/50)+((65-50)/50))/2 = 116*0.35 = +41
b_role    = -2900*0.05 = -145                                        // autofill tax
steadyMmr = 2612 + 220 + 41 - 145 = 2728                             // onyx I / ascendant
placement = 1200 + 0.15*2728 = 1609
conv(44)  = 1 - exp(-44/120) = 0.307
currentMmr= 1609 + (2728-1609)*0.307 = 1609 + 344 = 1953             // → displayed Jade IV
```

The ladder shows a Jade one-trick teenager; the **truth is an Ascendant-ceiling in-role All-Pro prospect**, hidden by low games (smurf) and autofill (role tax). Scout past `conf 0.65` and both `SMURF` and `AUTOFILL_VICTIM` flags reveal, `potentialRead` upgrades to All-Pro. Sign to academy at a Jade price; by week 12 `conv(≈150)=0.71 → currentMmr ≈ 2400` (Onyx) — the bargain of the season. Wait too long and a rival scout catches the climb and the price triples.

### Example B — Overrated (boosted + bust)

Handle `kingslayerx` · region Auros · displayed **Ascendant** · peak Ascendant · role Bot · age band 22–24 · 261 games · 58% WR · archetype read `[controlMage, scalingCarry]`.

Truth: `soloAbility = 61` (pro-marginal); generic aptitudes (`maxSoloApt 58`); `composure 40`, `tiltResistance 38`; duo-boosted (`boost +520`, `boostDecay 65/wk`); `potentialTier = fringe`.

```
baseMmr   = 500 + 2900*(0.61)^1.6 = 500 + 2900*0.454 = 1817          // ~jade
b_meta    = 2900*0.10*((58-50)/50) = 290*0.16 = +46
b_mental  = 2900*0.04*(((40-50)/50)+((38-50)/50))/2 = 116*(-0.22) = -26
b_boost   = +520
steadyMmr = 1817 + 46 - 26 + 520 = 2357                             // onyx I, propped up
placement = 1200 + 0.15*2357 = 1554
conv(261) = 1 - exp(-261/120) = 0.886
currentMmr= 1554 + (2357-1554)*0.886 = 1554 + 711 = 2265            // → displayed Ascendant (dynamic cutoff)
```

Looks elite. Scout past `conf 0.65` and the `BOOSTED` + `BUST` flags fire, `potentialRead` reads fringe. Ignore the flags and sign, and the §5 tick punishes you: over 8 weeks `boost 520 → 0`, `steadyMmr → 1837`, `currentMmr` chases it down to **Jade** — you paid Ascendant money for a Jade bust with no growth. The two examples are mirror images: A hides its value below the rank, B fakes value above it, and the *only* thing separating them for the manager is scouting spend.

---

## 10. Determinism & testing notes

- New named RNG stream **`ladder`**, sub-keyed per region/week (`ladder:${regionId}:${week}`) and per mass slot (`ladder:mass:${regionId}:${slotIndex}`), so ladder churn never shifts `match`/`market`/`worldgen`/`growth` sequences.
- **No stored truth for entities** — `soloAbility`/attribute vectors are pure functions of `genSeed` (§3.2). This is the load-bearing determinism guarantee: fogged pre-sign reads and post-sign truth provably agree.
- Sort everything with explicit tiebreakers (`mmr desc, id asc`) — the dynamic `apex`/`paragon` cutoffs and the browser list must be order-stable.
- **Golden-seed tests:** (1) snapshot a generated region's tier histogram vs the §2 pyramid; (2) materialize→snapshot→re-materialize a fixed entity for vector equality; (3) run 1 season of ladder ticks and snapshot the smurf-surfacing curve for a fixed gem; (4) `corr(currentMmr, soloAbility)` and `corr(currentMmr, proCA)` land in target bands (`0.75±0.05`, `0.55±0.05`).
- **Perf:** the weekly tick touches only the ~4,000 stored prospect entities per simulated region (O(n log n) for the top-tier re-sort); mass entities are never iterated. Well inside the day-tick budget (tech plan §7).

---

*Downstream contracts this section relies on:* the §11 fog transform (unchanged), the §6 weekly dev tick (`soloDevBonus` plugs into its mechanical channel), the §10-GDD patch/meta system (`b_meta` recompute), and the scouting-network facility (§11-GDD, `regionReachMult`). It introduces no attribute keys outside the canonical taxonomy.
