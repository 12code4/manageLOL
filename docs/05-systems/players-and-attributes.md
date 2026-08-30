# manageLOL — Players & Attributes

*Systems deep-dive. Part of the `docs/05-systems/` set that expands `01-game-design.md` into implementable specs. This is the **foundation layer**: the attribute taxonomy every other system reads from. Implemented in `packages/core/src/players` (types, ratings, scouting, generation) with the worked examples below as golden tests.*

> Read alongside: [`meshing.md`](meshing.md) (how these attributes combine into team performance), [`ranked-ladder.md`](ranked-ladder.md) (where fogged players are discovered), and [`competition-and-economy.md`](competition-and-economy.md).

---

# Player Attribute Taxonomy (Design Spec — foundation layer)

*This section defines every player attribute the simulation reads. It is the single source of truth for downstream specs (match sim, growth/aging, scouting, meshing, drama, market, brand). Every attribute has a precise `camelCase` key; downstream specs cite these keys verbatim. All numeric attributes are stored at full precision; the fog layer (§ Scouting fog) governs what the manager perceives. Everything is generated and mutated through named seeded RNG streams (`worldgen`, `growth`, `match`, `events`) — no hidden global state, fully reproducible.*

## 0. Scale conventions & storage

- **Skill/trait scale:** integers `0..100` unless noted. `50` is "median pro"; `70+` is league-starter tier; `85+` is All-Pro; `95+` is generational. Amateur-tier players cluster `35..60`.
- **Age-shaped params:** `peakAge`, `declineStartAge` are years (float, e.g. `22.5`). `age` itself lives on identity, not in this table.
- **Enums:** `primaryRole`/`secondaryRole` ∈ `Role`; `preferredArchetype` ∈ `Archetype`; `nationality`/`residencyRegion` ∈ `RegionId`; `languageIds` is `LanguageId[]`.
- **Everything is stored true.** The manager never reads raw storage; they read a `ScoutedView` (below). This keeps sim math clean and the fog a pure presentation transform.

```ts
type Role = 'top' | 'jungle' | 'mid' | 'bot' | 'support';
type Archetype =
  | 'tankEngage' | 'skirmisher' | 'assassin' | 'scalingCarry' | 'laneBully'
  | 'controlMage' | 'poke' | 'enchanter' | 'catcher' | 'splitPush' | 'earlyJungle';

interface PlayerAttributes {
  mechanical:      MechanicalAttrs;
  gameKnowledge:   GameKnowledgeAttrs;
  mental:          MentalAttrs;
  roleAptitude:    RoleAptitudeAttrs;
  championAptitude: Record<Archetype, number>; // 0..100 each, HIDDEN
  growth:          GrowthAttrs;        // HIDDEN
  personality:     PersonalityAttrs;
  chemistry:       ChemistryDrivers;   // HIDDEN — consumed by meshing spec
  brand:           BrandAttrs;
}
interface Player {
  id: string;
  identity: { name: string; age: number; nationality: RegionId; residencyRegion: RegionId; languageIds: LanguageId[] };
  attributes: PlayerAttributes;
  state: PlayerState;                  // fast-moving, mostly VISIBLE
  championPool: Map<ChampionId, number>; // proficiency 0..100
  scouting: ScoutingKnowledge;         // per-viewer fog, see below
}
```

## 1. Mechanical skill (VISIBLE via fog / slow-moving)

Raw execution ceiling. These grow toward `potential` in youth and are the **first to decline** (weighted by `mechanicalDeclineBias`).

- `mechanics` — raw outplay/combo ceiling; the top end of what a player can pull off in a duel or skirmish. Drives outplay events and per-fight upset chance.
- `laning` — 1v1/2v2 lane-phase strength: trading, all-in judgement, freeze/tempo execution. Dominant input to the laning phase of the match sim.
- `teamfighting` — 5v5 execution: target selection, ability sequencing under chaos. Dominant input to the teamfight phase.
- `reflexes` — reaction speed / mechanical latency. Modifies `mechanics` and `teamfighting` under pressure; **declines earliest and steepest with age** (the "reflexes go first" authenticity beat).
- `positioning` — spacing discipline in fights and skirmishes; survivability. Reduces death probability in teamfights, especially for carries.

## 2. Game knowledge / macro (VISIBLE via fog / slow-moving)

Decision quality on the map. Grows later than mechanics and **declines last** — the substrate of the "washed veteran shotcaller who still wins" fantasy.

- `mapAwareness` — reading enemy positions, danger sense, gank avoidance. Reduces getting-caught events; jungle-heavy weight.
- `waveManagement` — wave states, freezes, crashes, tempo generation. Feeds lane gold/XP leads.
- `objectiveControl` — neutral-objective setup/contest quality (fictional dragon/baron analogues). Feeds the objective/skirmish windows.
- `visionControl` — ward economy and map denial. Multiplier on `mapAwareness` and `objectiveControl` at the team level.
- `rotations` — mid-game map movement, tempo, and lane assignments. Feeds the mid-game macro phase.
- `adaptability` — in-game adjustment and **meta re-learning speed at the player level** (distinct from the coach's team-wide `adaptability`). Buffers value loss across patches and mid-series adjustments.
- `shotcalling` — quality of in-game calls (objective timing, engage/disengage). This is a **skill** (how good the calls are); see `leadership` in §8 for the personality/authority side. A team needs at least one high-`shotcalling` starter or suffers a close-out penalty (GDD §4).

## 3. Mental (mixed visibility / slow-moving)

Stability and clutch. `composure`, `consistency`, `focus` are scoutable (fogged). `clutch` and `tiltResistance` are **hidden** — discovered only through big games, which is a deliberate drama generator ("we didn't know he was a choker until the Bo5").

- `composure` — moment-to-moment tilt resistance during a game; resists throwing after a bad play. (fogged)
- `consistency` — variance dial. **Low `consistency` = wider outcome spread** (streaky carry); high = stable rock. Directly sets the per-game performance sample's standard deviation. (fogged)
- `focus` — sustained attention across a long day / long series; guards against late-series slippage. (fogged)
- `clutch` — performance delta in high-stakes contexts (elimination games, Bo5 game 5, Worlds). Applied as a conditional modifier only in flagged match contexts. (**hidden**)
- `tiltResistance` — recovery speed after a loss or a drama event; how fast `morale`/`form` rebound and how much a bad game bleeds into the next. (**hidden**)

## 4. Role aptitude (fogged / stable) — including off-role penalty

Per-role innate fit. `primaryRole` is shown; the rest is fog. This is where the **role-swap gamble** (GDD §4) lives.

- `primaryRole` — main role (enum). (visible)
- `secondaryRole` — best off-role (enum); can develop over seasons. (fogged)
- `roleAptitudeTop` / `roleAptitudeJungle` / `roleAptitudeMid` / `roleAptitudeBot` / `roleAptitudeSupport` — `0..100` fit per role. The primary role's value tends high; off-roles vary widely. (fogged)
- `roleFlexibility` — **the off-role penalty dial**: how gracefully a player performs outside their primary. High `roleFlexibility` shrinks the discomfort multiplier when played off-role. (**hidden**)

**Off-role penalty formula** (consumed by match sim to build effective role strength):
```
roleMult(p, r)     = 0.40 + 0.60 * (roleAptitude[r] / 100)          // aptitude gate
discomfort(p, r)   = (r === p.primaryRole) ? 1.0
                     : 0.85 + 0.15 * (p.roleFlexibility / 100)       // 0.85..1.00
effectiveRoleMult  = roleMult(p, r) * discomfort(p, r)
```
Lane roles and jungle read different core-skill weights (see §11 worked example).

## 5. Champion-archetype aptitude (HIDDEN / stable)

`championAptitude: Record<Archetype, number>` — how well a player pilots each **playstyle family**, independent of specific champion. These are the hooks the **proficiency** and **meshing** systems consume: a champion's `styleTags` map onto these aptitudes to set a proficiency ceiling, and a roster's aggregate archetype leanings feed comp identity. All hidden — revealed indirectly through the champion pool the manager observes.

- `aptTankEngage` — frontline initiators; tanky engage.
- `aptSkirmisher` — bruisers/duelists; extended-trade fighters.
- `aptAssassin` — burst divers; snowball threats.
- `aptScalingCarry` — hyperscaling hypercarries; late-game insurance.
- `aptLaneBully` — early lane-dominant tempo abusers.
- `aptControlMage` — zone/waveclear casters.
- `aptPoke` — long-range poke/siege.
- `aptEnchanter` — buff/heal/shield utility supports.
- `aptCatcher` — hook/pick playmakers.
- `aptSplitPush` — 1-3-1 sidelane threats.
- `aptEarlyJungle` — early ganking/invade tempo (jungle-flavored aggression).

**Proficiency ceiling** (links aptitude → champion pool):
```
// champion.styleTags: Partial<Record<Archetype, number>> summing to 1.0
match(p, champ)      = Σ_over_tags( weight * p.championAptitude[archetype] ) / 100   // 0..1
profCeiling(p,champ) = 100 * (0.40 + 0.60 * match(p, champ))                          // 40..100
```
Proficiency grows toward its ceiling at `learningRate` (§6) with focused games/drills:
```
profDelta = K_PROF * (learningRate/100) * ((profCeiling - prof) / 40)   // per focused game; K_PROF ≈ 3.0
```
Unplayed champions decay slowly (meta drift): `prof -= 0.15/week` while unpicked, floored at `0.5*profCeiling`.

## 6. Growth & aging (HIDDEN / stable)

The hidden shape of a career (GDD §4). All hidden; `potential` is the marquee scouting estimate (shown as a ranged, confidence-tagged guess, never a number). `workEthic` is the one fogged member (partly inferable from reputation).

- `potential` — current-ability ceiling (FM "PA" analogue), `0..100`.
- `growthRate` — speed of approach to `potential`.
- `peakAge` — age at which growth stops and plateau begins (typ. `20..24`).
- `declineStartAge` — age decline begins (plateau length = `declineStartAge − peakAge`).
- `declineRate` — steepness of post-peak decline.
- `mechanicalDeclineBias` — how much decline is loaded onto mechanical vs knowledge attributes (`1.0` = even; `>1` = reflexes/mechanics crater while macro holds — the classic aging pro).
- `learningRate` — champion-pool acquisition speed (feeds §5 proficiency growth) and adaptation to new champions after patches.
- `workEthic` — training-gain multiplier (fogged). (fogged)
- `burnoutProneness` — fatigue-accumulation multiplier; how fast solo-queue/scrim grind pushes toward a burnout event.

**Current ability (CA)** is a derived weighted aggregate (not stored; recomputed):
```
CA(p) = 0.34*mechAvg + 0.34*knowledgeAvg + 0.22*mentalAvg + 0.10*teamfighting
        // mechAvg = mean(mechanics,laning,teamfighting,reflexes,positioning), etc.
```
**Weekly development tick** (`growth` RNG stream; applied on the weekly tick):
```
gap        = max(0, potential - CA)
ageDevMult = age <= peakAge-2 ? 1.0
           : age <  peakAge   ? lerp(1.0, 0.30, (age-(peakAge-2))/2)   // taper into peak
           : age <  declineStartAge ? 0.0                              // plateau
           : -1.0                                                       // decline
minutesFactor = clamp(0.5 + 0.5*(officialMinutesThisWeek/TARGET_MIN), 0.5, 1.5)  // matches matter
coachFactor   = 1 + 0.5*(coachQuality/100)

// growth phase (ageDevMult > 0):
dCA = K_GROWTH * (growthRate/100) * sqrt(workEthic/100) * coachFactor
      * (gap/50) * ageDevMult * minutesFactor           // K_GROWTH ≈ 0.6 CA/week

// decline phase (ageDevMult < 0):
dCA = -K_DECLINE * (declineRate/100) * (age - declineStartAge)   // K_DECLINE ≈ 0.25
      ; distribute dCA across attrs: mechanical share ∝ mechanicalDeclineBias
```
`dCA` is distributed onto individual attributes (growth favors the lowest-relative attrs; decline favors mechanical per `mechanicalDeclineBias`). `coachability` (§8) further multiplies gains from **targeted drills** specifically.

## 7. Personality — non-chemistry (mixed / stable-ish)

Traits that drive the market and career arc but are *not* consumed by the meshing math (those live in §8). Identity fields for import rules live here too.

- `ambition` — desire for titles/bigger stage; raises transfer demands and unhappiness at a stagnating org (feeds market + drama). (**hidden**)
- `loyalty` — resistance to poaching; discount on renewals with a club they like (GDD §7). (**hidden**)
- `professionalism` — off-stage discipline; dampens drama-event probability and stabilises `fatigue`/`form`. (fogged)
- `nationality` — region of origin (enum); **feeds import/residency rules** (GDD §7). (visible)
- `residencyRegion` — current residency (enum); can convert after years in-region, relaxing the import cap. Slow-moving. (visible)

## 8. Chemistry drivers (HIDDEN — the meshing contract)

**These are the exact keys the team-meshing spec consumes.** Meshing reads `player.attributes.chemistry.*` plus `identity.languageIds` and `identity.nationality`. All hidden except `languageIds` (the manager can see which languages a player speaks). Meshing must depend on **no other keys** than those listed here — this is the interface guarantee.

- `communication` — voice-comms clarity/frequency; the backbone of pairwise synergy ramp and teamfight coordination.
- `leadership` — locker-room authority and shotcalling *credibility* (distinct from the `shotcalling` skill in §2): how much the roster rallies around them; propagates morale and accelerates cohesion when high.
- `ego` — self-importance; raises drama probability, bench intolerance, and clashes with other high-`ego` teammates. Rises slowly with fame/awards.
- `temperament` — volatility (`0` calm … `100` volatile); amplitude of mood swings and feud escalation. Innate.
- `coachability` — responsiveness to coaching; boosts targeted-drill growth AND reduces friction with staff/shotcaller.
- `introversion` — social integration axis (`0` extrovert … `100` introvert); high values slow synergy ramp with new teammates and dampen `streamAppeal`, but can raise `focus` stability.
- `mentorship` — tendency/ability to develop teammates; a high-`mentorship` veteran boosts young teammates' `growth` tick and morale (the veteran-mentor value in GDD §4).
- `teamplayOrientation` — selfish-carry (`0`) … selfless-team (`100`); central meshing axis (a roster of five selfish carries meshes poorly regardless of skill).
- `playstyleAggression` — passive (`0`) … aggressive (`100`) tempo preference; playstyle-alignment input.
- `playstyleTempo` — scaling/slow (`0`) … fast/early (`100`) game-plan preference; playstyle-alignment input.
- `playstyleRiskTaking` — safe (`0`) … high-risk flashy (`100`); playstyle-alignment and outplay/throw variance input.
- `preferredArchetype` — the archetype identity the player *wants* to play (enum); comp-identity input to meshing (distinct from `championAptitude`, which is *ability*).
- `languageIds` — spoken languages (array). **Shared-language overlap drives synergy ramp speed** (GDD §9): a roster with no common language builds cohesion slower. (visible)

**Illustrative meshing consumption** (full formula belongs to the meshing spec; shown so key usage is unambiguous):
```
pairSynergyGain(a,b) = BASE
  * langFactor(a,b)                                   // 1.0 if shared language, 0.6 if none
  * (1 - 0.4*egoClash(a,b))                           // egoClash = (min(a.ego,b.ego)/100)*(|a.ego-b.ego|<20?1:0.5)
  * commFactor(a,b)                                   // 0.7 + 0.3*mean(a.communication,b.communication)/100
  * playstyleAlign(a,b)                               // 1 - meanAbsDiff(aggression,tempo,riskTaking)/100
  * teamplayFactor(a,b)                               // 0.8 + 0.2*mean(teamplayOrientation)/100
teamCohesionCap += leadershipCoverage(roster)          // needs ≥1 high leadership+shotcalling anchor
youngPlayerGrowthBonus(rookie) += 0.15 * (veteran.mentorship/100)
```

## 9. Brand / marketability (visible & fogged / slow-moving)

Revenue and drama surface (GDD §14). A mediocre player with huge brand can be worth signing — an authentic tension we make first-class.

- `starPower` — overall fame; drives merch and sponsor tiering. (visible)
- `streamAppeal` — content/streaming draw; feeds content-studio income; dampened by high `introversion`. (visible)
- `fanbase` — current following size; slow to build, drops with inactivity/bench; multiplies merch. (visible)
- `marketability` — brand *ceiling* / how marketable if pushed (the "brand potential"); sponsors and the media team read it. (fogged)
- `mediaHandling` — interview/press competence; modifies outcome of media drama events and PR-clause sponsor bonuses. (fogged)

## 10. Fast state (VISIBLE / fast-moving)

Per-player, recomputed weekly/after matches (GDD §4). These sit on `Player.state`, not `attributes`, but are part of the taxonomy. **Synergy is deliberately NOT here** — it is pairwise + team-level, stored on the roster/relationship layer, not per player.

- `form` — hot/cold streak layered on skill. Maps to a multiplier `formMult = 1 + (form-50)/250` → range `0.80..1.20`.
- `fatigue` — accumulated grind; `fatigueMult = 1 - (fatigue/100)*0.25` → up to −25%. Accumulation scaled by `burnoutProneness`.
- `morale` — from results, playtime, salary fairness, promises, drama. Gates drama-event triggers and small performance swings.
- `sharpness` — match-readiness from recent competitive play; low if benched. `sharpMult = 0.90 + 0.10*(sharpness/100)`.

## 11. Scouting fog (how visibility works)

Fog is a pure presentation transform over true values; the sim always computes on truth.
```ts
interface ScoutingKnowledge { confidence: Record<AttrKey, number>; } // 0..1 per attr, per viewing org
// range half-width shrinks with confidence:
function scoutedRange(trueVal: number, confidence: number, key: AttrKey): [number,number] {
  const maxSpread = HIDDEN_KEYS.has(key) ? Infinity : 22;          // fully-hidden never shown numerically
  const half = maxSpread * (1 - confidence);                       // conf 0 → ±22, conf 1 → exact
  return [clamp(trueVal-half,0,100), clamp(trueVal+half,0,100)];
}
```
- **visible** keys: shown exactly, confidence irrelevant (own players; identity; brand; state).
- **fogged** keys: shown as a narrowing range; scouting raises `confidence`.
- **hidden** keys: never shown numerically. `potential` is the special case — shown as a **coarse tier estimate + confidence label** (e.g. "High potential — low confidence"), never a number or tight range. Other hidden keys leak only through *behavior* and *events* (a coachability problem surfaces as a drama event, not a stat).

## 12. Determinism & generation notes

- All attributes are rolled at worldgen from per-region distributions on the `worldgen` stream (regions have flavor: one skews high `mechanics`/`reflexes` prodigies, another high `rotations`/`objectiveControl` discipline — GDD §17). Correlated draws (e.g. `potential ≥ CA`, `peakAge`↔`declineStartAge` ordering, `reflexes`↔age) are enforced at generation.
- Mutation happens only on named streams: growth/decline on `growth`, state on `match`/weekly ticks, `ego`/`fanbase`/`starPower` drift on results and awards. No attribute reads wall-clock time or `Math.random`.
- Golden-seed tests snapshot a generated cohort's full attribute vectors so accidental determinism breaks are caught (tech plan §8).

---

## Worked examples

**Example A — off-role penalty + state (match-sim effective strength).**
Mid main "Kestrel": `laning 78, mechanics 84, waveManagement 72, mapAwareness 70, objectiveControl 66, teamfighting 74`; `roleAptitudeMid 88, roleAptitudeJungle 55, roleFlexibility 60`; state `form 68, fatigue 40, sharpness 75`.

*As Mid (primary), lane phase:*
```
laneBase = 0.5*78 + 0.2*84 + 0.15*72 + 0.15*70 = 39 + 16.8 + 10.8 + 10.5 = 77.1
roleMult = 0.40 + 0.60*(88/100) = 0.928 ; discomfort = 1.0 → effMult = 0.928
raw      = 77.1 * 0.928 = 71.5
formMult = 1+(68-50)/250 = 1.072 ; fatigueMult = 1-0.40*0.25 = 0.90 ; sharpMult = 0.90+0.10*0.75 = 0.975
effLaneMid = 71.5 * 1.072 * 0.90 * 0.975 ≈ 67.3
```
*Forced to Jungle (off-role), jungle uses macro-weighted core:*
```
jgBase   = 0.30*70 + 0.25*66 + 0.20*84 + 0.15*74 + 0.10*72 = 21 + 16.5 + 16.8 + 11.1 + 7.2 = 72.6
roleMult = 0.40 + 0.60*(55/100) = 0.73 ; discomfort = 0.85+0.15*0.60 = 0.94 → effMult = 0.686
raw      = 72.6 * 0.686 = 49.8  (vs 71.5 in role → the off-role tax is legible and large)
effJungle = 49.8 * 1.072 * 0.90 * 0.975 ≈ 46.9
```
The 71.5 → 49.8 drop is the readable, explainable cost of the role swap; a higher `roleFlexibility` would soften the discomfort term.

**Example B — rookie growth + a champion proficiency gain.**
Rookie, `age 17`, `CA 58`, `potential 86`, `growthRate 75`, `workEthic 80`, `peakAge 23`, plays full minutes, coach quality `60`.
```
gap = 86-58 = 28 ; ageDevMult = 1.0 (17 ≤ 21) ; minutesFactor = 1.0 ; coachFactor = 1+0.5*0.60 = 1.30
dCA = 0.6 * 0.75 * sqrt(0.80) * 1.30 * (28/50) * 1.0 * 1.0
    = 0.6*0.75=0.45 ; *0.894=0.402 ; *1.30=0.523 ; *0.56=0.293  → ≈ +0.29 CA/week
```
Over a 16-week split ≈ **+4.7 CA**, plus off-season/bootcamp — reaching potential over ~4–5 seasons, matching the short-career arc (GDD §4). A benched rookie (`minutesFactor 0.5`) gains ~half as much — the "minutes matter" tension made real.

*Champion proficiency:* champ "Vesper" tagged `{assassin: 0.7, laneBully: 0.3}`; rookie `aptAssassin 82, aptLaneBully 60`, `learningRate 70`, current `prof 40`.
```
match       = (0.7*82 + 0.3*60)/100 = (57.4+18)/100 = 0.754
profCeiling = 100*(0.40 + 0.60*0.754) = 85.2
profDelta   = 3.0 * (70/100) * ((85.2-40)/40) = 2.1 * 1.13 ≈ +2.37 per focused game
```
Five focused scrim games → `prof` ≈ 40 → ~52, still far from the 85 ceiling — a deep pool is earned over a season, and a low-aptitude champ (low ceiling) plateaus fast, which is exactly what the meta/one-trick tension needs.
