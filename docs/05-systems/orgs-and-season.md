# Orgs & the Season

*The decision record for persistent rival organizations, the season structure, contracts, and the talent pipeline. Five independent specs were written against this brief; this is the one we build from. Where they disagreed, one answer is recorded here and the other is gone.*

Referenced by `world/orgs.ts`, `world/contracts.ts`, `season/calendar.ts`, `ladder/bands.ts`, `players/development.ts` — all of which already point at this file.

---

## 0. The brief, and what satisfies it

> "There must be persistent rival orgs per tier. New ones can appear but Orgs also have stats that grow with longevity and time, so legacy teams are stronger but upsets always exist. Orgs sign and drop players, those players populate the game ladder [don't show such low tier players — realistically we only sign from Diamond 1+... But in our game there's wiggle room, and we'll foster a philosophy that even signing lower tier players can lead to them becoming top tier players, or even the best.]"

Seven claims that must be true when we ship, each with the mechanism that makes it true:

| The brief says | The mechanism | §  |
|---|---|---|
| persistent orgs per tier | 48 orgs hold 48 conserved seats across 4 leagues, forever | 3, 4 |
| stats grow with longevity | `legacy` accrues per season at a tier-weighted rate with a soft cap; `standing` is a fast EWMA | 3.2 |
| legacy teams are stronger | legacy → prestige → cheaper wages, better staff, deeper scouting: it buys **roster**, up to ~28 points of team strength | 3.4 |
| upsets always exist | org stats reach the match through exactly one channel (draft), bounded at **2.6 points ⇒ 59.8% odds** | 3.3 |
| orgs sign and drop players | a weekly AI market pass in the four market windows; drops each off-season | 6.4 |
| dropped players populate the ladder | released players re-enter underranked via `reentryMmr`, tripping `smurf` honestly | 7.4 |
| Diamond 1+ only visible | `SHOW_CUTOFF = 2525` (Onyx I) — already shipped in `ladder/bands.ts` | 7.1 |
| low-tier signings can become the best | development is driven by **headroom × environment**, not by rank; a 17-y-o Onyx I at CA 58 reaches CA ~88 in a good org and ~74 left alone | 7.3 |

---

## 1. What already exists (read this before designing anything)

A large fraction of this update is **already in `packages/core` and tested.** The single most expensive mistake available here is redesigning shipped, working code. The reconciliation map:

| Module | Status | What it already gives us |
|---|---|---|
| `world/orgs.ts` | **shipped** | `Org` (legacy/standing/facilities/coaching/analytics/scouting/fanbase/cash/tier/history), `prestige()`, `statureLabel()`, `orgEffects()`, `orgEdgePoints()`, `MAX_ORG_EDGE_POINTS`, `seedOrg`, `advanceOrgSeason`, `investmentBudget`, `shouldFold`, `generateOrg` |
| `world/contracts.ts` | **shipped** | `Contract`, `wageDemand`, `defaultBuyout`, `evaluateOffer`/`ACCEPT_THRESHOLD`, `offerToAccept`, `wageBill`, `runwayWeeks`, `financialState`, `bidInterest`, `resolveBids`, `attractsApproach`, `tickContracts` |
| `world/fixtures.ts` | **shipped** | `roundRobin` (circle method + greedy blue balance), `TableRow`, `recordResult`, `standings()` |
| `season/calendar.ts` | **shipped** | the 52-week `CALENDAR` with week kinds, `weekDef`, `phaseOfWeek`, `matchWeeksOfSplit`, `LeagueConfig`, `PYRAMID`, `prizeFor`, `championshipPoints`, `resolveBoundary` |
| `season/fast.ts` | **shipped** | `resolveFastSeries`, `fastRating`, `FastSide`, `DRAFT_GAIN = 4`, `VAR_BASE = 3.2` |
| `ladder/bands.ts` | **shipped** | `SHOW_CUTOFF = 2525`, `DEEP_FLOOR`, band defs, `poolSlots`, deep-scout maths, `LadderStanding`, `soloGamesPerWeek`, `reentryMmr` |
| `players/development.ts` | **shipped** | `developWeek`, `applyDevelopment`, `developSeason`, `DevContext`, `ladderContext()` |
| `season/schedule.ts` | **missing** | dated fixtures: rounds → weeks → days |
| `season/playoffs.ts` | **missing** | brackets + the promotion gauntlet |
| `season/season.ts` | **missing** | the week loop that runs the world |
| `world/world.ts` | **missing** | the `World` aggregate; rosters; the AI market pass; off-season turnover |
| `prototype/` | **untouched** | still `STAGES`, a 46-entity flat ladder, `makeOpponent()` |

**One bug the season designer flagged is already fixed.** `standings()` does *not* use head-to-head inside a pairwise comparator; it already ranks each win-level block by a mini-table of scalars with an `orgId` last resort. No change needed. (Its docstring explains why at length — read it before touching it.)

---

## 2. Scope

### MUST — this build

| # | Feature | Where |
|---|---|---|
| M1 | `World` aggregate + `seedWorld()`: 48 orgs seeded with history across 4 tiers, rosters, contracts | `world/world.ts` |
| M2 | Fixture calendar: whole year scheduled at season roll, dated to week + day | `season/schedule.ts` |
| M3 | Standings for all four leagues, both splits, with cut lines | reuses `world/fixtures.ts` |
| M4 | Single-elimination playoffs, all four tiers | `season/playoffs.ts` |
| M5 | Promotion: 1 auto swap + 1 contested 3-step gauntlet, per boundary | `season/playoffs.ts` |
| M6 | Contracts with wages, expiries, weekly wage bill, insolvency states | reuses `world/contracts.ts` |
| M7 | AI market pass: orgs sign, renew and drop; rival bids on your players | `world/market.ts` |
| M8 | Talent pipeline: visible ladder gated at 2525, tiered signing floors, gem exception, deep scout | `world/market.ts`, `ladder/bands.ts` |
| M9 | Off-season turnover: season tick, boundary commit, expiry wave, retirements, debut cohort, ladder reset, preseason patch | `season/offseason.ts` |
| M10 | Season hub screen + standings table + contract lane + Recruit sources + negotiation sheet + bid modal | `prototype/src/template.html` |

### SHOULD — next build

Org profile sheet with the legacy Spine · double-elimination T1 playoffs · the Pyramid tab · foreign shadow leagues and international events · rivalry heat · board mandates and getting sacked · sponsor clauses firing on results · inbox drawer with digest folding.

### LATER

Franchise auctions · academy squads as a second team · staff as hireable entities · loans and administration · career events as a data-driven table · potential drift · role conversion · lazy foreign-roster materialization.

---

## 3. The organization

### 3.1 The model — shipped, and it stays

**Decision: keep `Org` exactly as it is in `world/orgs.ts`.** The orgs designer proposed a far larger record: five named facilities with individual levels and maintenance debt, a `brand` index separate from `fanbase`, seven philosophies, a `fin` sub-object, `ai` dials for ambition/thrift/patience/loyalty, staff entities, `prep`, `tierHistory`, `trophies`. Every one of those is cut for v1.

Why: the shipped four-scalar infrastructure model (`facilities`, `coaching`, `analytics`, `scouting`) already drives all four of the channels org stats are allowed to touch, and it is already tested. A five-key facility record with per-key maintenance debt is five times the state for the same four effects. `brand` is `fanbase` under another name. The five shipped `OrgPersonality` values (`superteam` / `academy` / `stable` / `chaotic` / `methodical`) already appear in `bidInterest`'s taste table and in `investmentBudget`'s rates — seven new philosophies would orphan both.

What we **add** to `Org`: nothing. What we add *around* it, in `World`: rosters, contracts, finances. `Org` stays a pure stat record so `advanceOrgSeason` stays a pure function.

```ts
// packages/core/src/world/orgs.ts — UNCHANGED, reproduced for reference
export interface Org {
  id: string; name: string; tag: string; region: string;
  personality: OrgPersonality;          // superteam|academy|stable|chaotic|methodical
  founded: number;                      // season index; seeded orgs are negative
  seasons: number;                      // the raw longevity counter
  legacy: number;                       // 0..100 slow, time-earned. Cannot be bought.
  standing: number;                     // 0..100 fast, results-driven
  facilities: number; coaching: number; analytics: number; scouting: number;
  fanbase: number; cash: number;
  tier: PyramidTier;
  history: OrgHistory;                  // titles, bestTier, seasonsAtTier, finishes[24]
}
export function prestige(org: Org): number { /* 0.62*standing + 0.38*legacy */ }
```

### 3.2 Longevity — the shipped constants, and what they actually produce

```
TIER_WEIGHT   = { 1: 1, 2: 0.45, 3: 0.18, 4: 0.05 }
LEGACY_GAIN   = 4.2      LEGACY_DECAY   = 0.35
STANDING_RAMP = 0.34     FACILITY_DECAY = 1.1

accrueLegacy(L, tier) = clamp100( L + 4.2 * TIER_WEIGHT[tier] * (1 - L/100) - 0.35 )
standing'             = standing + (standingTarget(tier, placeFraction) - standing) * 0.34
prestige              = 0.62 * standing + 0.38 * legacy
```

Legacy is a logistic with a per-tier fixed point — **it provably cannot run away**, which is the property a twenty-season sim needs:

| Tier held forever | legacy fixed point | legacy after 20 seasons from 0 |
|---|---|---|
| 1 | **91.7** | ~52 (+ title bumps) |
| 2 | **81.5** | ~26 |
| 3 | **53.7** | ~8 |
| 4 | — (decays to 0) | 0 |

A dynasty that stops winning loses `standing` fast (34%/season toward its new tier's target) and `legacy` slowly (0.35/season plus the shrinking gain). Prestige, being 62% standing, therefore falls hard and then plateaus at a floor its history bought it. That is the shape we want: *a fallen giant is still a giant, just not a favourite.*

**Seeded history at world creation** — this is what makes the world feel like it existed before you:

```
seasonsOfHistory by tier:  T1 → rng.int(12, 22)   T2 → rng.int(6, 13)
                           T3 → rng.int(2, 8)     T4 → rng.int(0, 3)
```
At season 1 the Prime League is full of orgs at legacy 38–58 and the Open Circuit is full of orgs at legacy 0–4. **You start at the bottom of a world with a past.**

### 3.3 Upsets: the bound, and why it is exactly 2.6

**Decision: org stats never touch match resolution directly.** No `orgEdge` term is added to `teamBreakdown`. The orgs designer proposed one (`ORG_EDGE_MAX = 2.0`, a blend of prep and "poise" scaled by stakes); it is cut. `orgEffects()` is the only door, and it has four channels:

```ts
export function orgEffects(org: Org): OrgEffects {
  const env = 0.55 * org.facilities + 0.45 * org.coaching;
  return {
    coachQuality:    org.coaching,                          // → draftSkill, coach suggestions
    patchFamiliarity: org.analytics,                        // → draftNoiseSigma
    chemRampMult:    0.85 + 0.40 * (org.facilities / 100),  // → rampWeek gel
    developmentMult: 0.55 + 0.90 * (env / 100),             // → DevContext.environment
  };
}
```

Only the first two are in-match, and both land in the draft. In the fast path that is one term:

```
drafting(org) = clamp100(0.65 * coaching + 0.35 * analytics)
draftMu       = DRAFT_GAIN * (a.drafting - b.drafting) / 100      // DRAFT_GAIN = 4
```

Realistic coaching/analytics spread across the pyramid is 25 (a garage T4 side) to 90 (a maxed dynasty), so:

> **MAX_ORG_EDGE_POINTS = DRAFT_GAIN × 0.65 = 2.6**

That is not a coincidence to be maintained by hand — it is an identity between `fast.ts` and `orgs.ts`, and §12 gives it a test. At `MATCH_SCALE = 15`:

```
winProbFromDiff(2.6, 15) = 1 / (1 + 10^(-2.6/15)) = 0.598
```

**The maximum direct advantage a twenty-season dynasty has over a promoted side, holding rosters equal, is 59.8% in a single game.** Ranked against the engine's other levers at a base of 62:

| Lever | max swing (team-strength points) | max Δ | P(favourite) |
|---|---|---|---|
| Roster quality (`effectiveRoleStrength`, star five vs promoted five) | ±14 each | ~28 | 98.7% |
| Fast state (`stateMultiplier` 0.54–1.20) | ±14 | 28 | 98.7% |
| Meshing (`meshMult` 0.88–1.12 × 62) | ±7.4 | 14.8 | 90.1% |
| Draft play itself (`evaluateSide` clamp ±8) | 8 | 16 | 91.6% |
| **Org** | **±1.3** | **2.6** | **59.8%** |

The one-line thesis, and it should appear in the UI: **org stats don't beat you in the match, they beat you in the market.** A legacy org's real edge is that prestige discounts wages (§6.2) and its `scouting` sees deeper — so it owns the CA-88 players, which *is* a 28-point roster gap. Its in-match aura is worth two and a half points.

Five mechanisms keep upsets frequent, and none of them are new code:

1. **Draft variance floors out.** `draftNoiseSigma = 1.6·(1 − 0.7·draftSkill/100)·(1 − 0.3·patchFamiliarity/100)`; at coach 95 / familiarity 95 it is still **σ ≈ 0.42** over ~48 argmax options — an elite team drafts meaningfully below its own best line roughly one draft in seven.
2. **Chemistry is unbuyable.** `computeCohesion` reads only the five players and their shared weeks. A settled young roster at cohesion 78 (`meshMult 1.067`) beats a dynasty mid-rebuild at 52 (`meshMult 1.005`) by **+3.8 points** — larger than the entire org edge. Facilities move `gel` by at most 1.20/0.85 = 1.41×; they cannot move `PairChem.current` past what time gives.
3. **Patch shock every 4 weeks.** `PATCH_INTERVAL_WEEKS = 4`; the week after a patch is systematically the highest-upset week of the split, and the Season hub says so.
4. **Fatigue.** A single starter at `fatigue 80` costs ~2.5 points of team base — again more than the whole org edge.
5. **Bo1 and Bo3 regular seasons.** At T3 the format is Bo1. Over a 15-round single round-robin the favourite's expected record is 10–5, not 15–0.

### 3.4 The channel that actually matters

Prestige is a wage discount, and that is the whole of "legacy teams are stronger":

```
prestigeDiscount = clamp(1.12 - 0.0022 * prestige, 0.90, 1.15)     // shipped
```
A dynasty at prestige 88 pays **0.926×**; a newcomer at prestige 8 pays **1.102×** — a 19% spread on every wage, every week, compounding into roughly one extra CA-80 starter per squad. Add `scouting` (deeper ladder reach, §7.2) and `developmentMult` (0.55..1.45, §7.3) and the dynasty's advantage is entirely a *roster* advantage, arrived at honestly.

---

## 4. The pyramid and its population

### 4.1 Four leagues, 48 conserved seats

**Decision: `PYRAMID` in `season/calendar.ts` stands as shipped — 10 / 10 / 16 / 12.** The season designer wanted T4 as ~48 floating orgs running open brackets; cut. A floating pool means a second scheduler, a second standings path, a second promotion rule and a placement-softmax nobody watches. Twelve seats and one code path.

| | T1 **Prime League** | T2 **Ascent Division** | T3 **Regional Circuit** | T4 **Open Circuit** |
|---|---|---|---|---|
| slots | 10 | 10 | 16 | 12 |
| format | double RR, Bo3 | double RR, Bo3 | single RR, Bo1 | single RR, Bo1 |
| rounds / split | 18 (2/week × 9) | 18 (2/week × 9) | 15 | 11 |
| series / team / year | 36 + 5 | 36 + 3 | 30 + 7 | 22 + 3 |
| playoff | SE6, Bo5 | SE4, Bo5 | SE8, Bo3 (final Bo5) | SE4, Bo3 |
| prize pool / split | 300 | 110 | 34 | 9 |
| league share | 6.5 ◈/wk | 2.4 | 0.7 | 0.15 |
| promotion line | — (Worlds via CP) | 3rd | 3rd | 2nd |
| relegation line | 10th | 9th | 13th | — |

T1 and T2 deliberately share a config shape: **relegation must change your money, your prestige and your opponents — not your weekly rhythm.** You still play two Bo3s a week. That is what makes the drop hurt in the right way.

`matchWeeksOfSplit()` returns 9 weeks; 18 rounds tile at 2/week exactly, 15 tile at 2/week with round 1 alone in week 3, 11 tile at 2/week with round 1 alone. One `roundsPerWeek = 2` rule with a leading singleton, computed as `offset = (roundsPerWeek*weeks - rounds) % roundsPerWeek`.

### 4.2 Population: 48 orgs, where they come from

`packages/data/src/orgs.ts` ships 14 identities for Meridia (the home region). We need 48.

```
seedWorld:
  1. take the 14 Meridia pack identities in declaration order
  2. mint 34 more with generateOrg() on stream `worldgen:orgs:mer`
  3. sort all 48 by a seeded key, assign seats top-down:
       T1 gets the 10 with the most seeded history, T2 the next 10, T3 16, T4 12
  4. seedOrg() each with seasonsOfHistory by tier (§3.2)
```

**Required change: `generateOrg` must accept `seasonsOfHistory`.** Today it hardcodes `seasonsOfHistory: 0`, which would give us a T1 league where 10 of 48 orgs have a past and the rest were founded yesterday. One added option field:

```ts
export function generateOrg(rng: Rng, opts: {
  id: string; region: string; tier: PyramidTier; season: number;
  taken: ReadonlySet<string>;
  seasonsOfHistory?: number;      // NEW — defaults to 0, which is the fold-replacement case
}): Org;
```

**SHOULD:** extend the Meridia pack to ~26 identities so more of the pyramid is handcrafted. Content work, no code.

### 4.3 Folding and appearance

`shouldFold` is shipped and correct: only tier ≥ 3, only with `cash <= 0`, and history protects you (`survival = 0.35 + 0.6 * legacy/100`). Evaluated once, at week 49.

```
on fold:  contracts void → players become free agents with reentryMmr (§7.4)
          the seat is refilled by generateOrg(..., seasonsOfHistory: 0) at the same tier
          an inbox item fires; you get first look at the corpse
```

**Decision: no rich-backer buy-ins, no rebrands, no franchise auctions in v1.** Every one of them is a lovely story beat and none of them is in the brief. LATER.

**Invariant, tested:** `sum(seats per tier) === 10 + 10 + 16 + 12` at every off-season boundary; no org holds two seats; no seat is unheld.

---

## 4b. Playoffs and the gauntlet (shipped)

Single elimination with byes at all four tiers, one generic builder
(`core/src/season/bracket.ts`). Seeding is the reflected order, so the top two
seeds meet only in the final and every first-round pairing sums to the field
size plus one. Byes are resolved at construction — a pairing against an absent
seed is never created as a match, and its team is seated directly in round
two — so the match list holds exactly `teams − 1` series: **5 at tier 1, 3 at
tier 2, 7 at tier 3, 3 at tier 4**.

`playBracket` takes a resolver, so the same bracket runs through the fast path
for leagues the manager is not in and the full match-day takeover for the one
they are; `skip` leaves their own series unplayed and the rest of the bracket
carries on around it.

The promotion gauntlet is **one Bo5 per boundary**: the club just above the
automatic relegation line defends against the best challenger that did not go
up automatically. A ladder was considered and rejected — the drama of
promotion is a night, not a tournament.

Titles are the playoff champion, not the top of the table. That gap is most of
what a season is about: the regular season you can grind, the bracket you have
to win.

## 5. The season

### 5.1 The calendar — shipped

`season/calendar.ts` CALENDAR stands as written. 52 weeks, each with a `kind` (`match` | `training` | `market` | `event`), a `window`, a `note`, a `split` and a `transferWindow` flag. Week kinds are what stop a season being forty identical "next" clicks, and they are what the Season hub's Run strip renders.

The four market windows: **week 1** (preseason lock), **weeks 15–19** (mid-season), **weeks 45–48** (expiry + free agency), **weeks 49–52** (turnover, still open). Contracted players move only in these; unsigned ladder players can be signed any week (§7.5).

### 5.2 Fixtures — the missing piece

```ts
// packages/core/src/season/schedule.ts
export interface ScheduledFixture {
  /** `${leagueId}:${year}:s${split}:r${round}:${a}:${b}` — the RNG stream key. */
  id: string;
  leagueId: string; year: number; split: 1 | 2;
  round: number; week: number; day: 4 | 5 | 6;
  a: string;            // drafts Blue
  b: string;
  bestOf: 1 | 3 | 5;
  stage: 'regular' | 'playoff' | 'gauntlet';
  result: FixtureResult | null;
}

export interface FixtureResult {
  winner: 0 | 1;
  score: [number, number];
  upset: boolean;
  draftDelta: number;
}

export function buildSplitSchedule(
  cfg: LeagueConfig,
  year: number,
  split: 1 | 2,
  orgIds: readonly string[],      // MUST already be sorted; asserted in dev
  rng: Rng,                       // stream: `season:${year}:sched:${cfg.id}:${split}`
): ScheduledFixture[];
```

Algorithm, five steps, only step 1 consumes randomness:

1. `const order = rng.shuffle([...orgIds])` — a seeded permutation, so the pairing calendar differs between years. The input array must already be sorted; assert it.
2. `roundRobin(order, cfg.legs)` — shipped, already balances Blue side greedily.
3. Round → week: `week = firstWeek + Math.floor((round - 1 + offset) / 2)`, with `offset = (2*9 - rounds) % 2` so an odd round count puts round 1 alone in the first week.
4. Day assignment, deterministic and rng-free: sort the week's fixtures by `(a, b)` lexicographically, walk assigning `[4,5,6][i % 3]`, rejecting any day that would give an org two series; on rejection advance to the next legal day. For 10 series in a week this yields 3/3/4.
5. **Player-org nudge:** if a fixture contains your org, swap it with the latest legal same-week fixture so you play on day 6. Deliberate — you walk into your match having already seen the round's other results, and the table is live.

**The schedule for the whole year is built once at season roll and serialized.** Never regenerated from the org list on load: a changed org set would silently produce a different calendar mid-season.

**Interleaving.** On each week advance, take `fixtures.filter(f => f.week === w)` sorted by `(day, id)`. Fixtures on days *before* yours resolve immediately; days *after* hold until your series concludes. Because every fixture's RNG stream is derived from `f.id` and never from a counter, resolution is **order-independent** — you may resolve week 8 before week 7, across a save/load, or in any order, and get byte-identical output. That is what makes "hold the AI matches scheduled after yours" free rather than a determinism hazard.

### 5.3 Standings

`standings()` from `world/fixtures.ts`, unchanged. Tiebreakers: series wins → head-to-head mini-table within the tied block → game differential → games won → `orgId`. Every level is a scalar, so it is a genuine total order; no seeded coin (a coin would make a finished table depend on how many draws happened earlier in the stream).

**Decision: no tiebreaker matches in v1.** The season designer specced real Bo1 tiebreakers in the seeding weeks for ties straddling a consequential line. Cut — the mini-table already resolves them deterministically, and the seeding weeks earn their keep as training weeks. SHOULD.

Cut lines drawn in the UI from `LeagueConfig.promotionLine` / `relegationLine` / `playoffTeams`.

### 5.4 Playoffs

**Decision: single elimination with byes at every tier. Double elimination is SHOULD, not MUST.** The season designer's `DE6` is nine series with an eight-node feed graph; `SE6` is five series and one generic builder that serves all four tiers. The brief says "playoffs", not "the double-elimination bracket". One function:

```ts
// packages/core/src/season/playoffs.ts
export interface BracketNode {
  key: string;                         // 'qf1' | 'sf2' | 'f'
  round: number;
  bestOf: 1 | 3 | 5;
  a: string | null;                    // null until fed
  b: string | null;
  feeds: { node: string; slot: 'a' | 'b' } | null;
  winner: string | null;
}
export interface Bracket {
  leagueId: string; year: number; split: 1 | 2;
  seeds: readonly string[];            // rankTable order, 1-indexed by position
  nodes: BracketNode[];                // topologically ordered
}

/** Standard seeding (1 v N, 2 v N-1, …) with the top seeds taking byes. */
export function buildBracket(
  leagueId: string, year: number, split: 1 | 2,
  seeds: readonly string[], bestOf: 1 | 3 | 5, finalBestOf?: 1 | 3 | 5,
): Bracket;
```

| Tier | Teams | Shape | Series |
|---|---|---|---|
| T1 | 6 | QF `3v6`, `4v5` (Bo5) → SF `1vW(4v5)`, `2vW(3v6)` (Bo5) → F (Bo5) | **5** |
| T2 | 4 | SF `1v4`, `2v3` → F, all Bo5 | **3** |
| T3 | 8 | QF ×4 (Bo3) → SF ×2 (Bo3) → F (Bo5) | **7** |
| T4 | 4 | SF ×2 → F, all Bo3 | **3** |

Bracket construction is a pure function of the seed array. Seeding consumes zero randomness: `seed = 1 + index in standings(regularSeasonRows)`.

### 5.5 Promotion — one auto swap, one contested gauntlet

Per boundary, computed from **pre-movement** standings for all three boundaries and committed simultaneously at the end of week 43, so the result cannot depend on which tier is processed first.

```
auto:       upper league's LAST place is relegated
            lower league's PLAYOFF CHAMPION is promoted
contested:  a 3-step defended ladder, all Bo5, for one further seat:

  step 1:  lower playoff 4th  v  lower playoff 3rd        (higher seed drafts Blue)
  step 2:  W(step 1)          v  lower playoff runner-up
  step 3:  W(step 2)          v  upper league's SECOND-LAST place   ← incumbent plays once

  the winner of step 3 holds the upper seat next year; the loser holds the lower seat.
  between steps the challenger takes `state.fatigue += 8`.
```

Three boundaries (T1/T2, T2/T3, T3/T4) × 3 steps = **9 gauntlet series a year**. Net movement is 2 seats per boundary per year: the pyramid always moves, but climbing is hard.

Odds check: a challenger at p ≈ 0.55 per step converts `0.55³ = 16.6%`, and fatigue drags the third step to roughly 14%. A genuinely better side at p ≈ 0.68 still only converts ~31%. **Promotion through the gauntlet is meant to mostly not happen** — the counterweight is that the auto-swap always fires, so a champion never has to gamble.

### 5.6 Championship points and Worlds

`championshipPoints(cfg, place)` is shipped and returns non-zero only at T1: `[90, 70, 55, 40, 25, 25, 12, 12, 4, 4]` summed across both splits' final placements.

**Decision: v1 has no international events.** Worlds weeks 36–40 exist in the calendar and are rendered on the Run strip as an event block; the CP table is computed and shown ("if the season ended today: Worlds seed 3"); no games are played. Foreign shadow leagues, the Crucible and the Summit are SHOULD. Cutting them removes ~600 series a year, four `RegionModel`s, cross-region calibration, and lazy roster materialization from the MUST set, and the brief does not ask for them.

---

## 6. Contracts and money

### 6.1 The one shipped constant that must change

```
- export const SEASON_WEEKS = 40;
+ export const SEASON_WEEKS = 52;
```

`world/contracts.ts` defines a season as 40 weeks; `world/clock.ts` and the CALENDAR define a year as 52. A "one-season deal" signed in week 1 therefore expires in week 41, mid-season-review, for no reason. At 52 a deal expires in the same week it was signed — and since the AI only signs in market windows, expiries land naturally in the expiry wave (weeks 45–48) or the preseason (week 1). No existing test pins the literal 40 (`contracts.test.ts` only uses it relationally), so this is a one-line change.

### 6.2 Wages — shipped, and they close

```
WAGE_BASE = 0.22        // ◈/week for an ability-50 player at T2
WAGE_CURVE = 1.068      // each ability point multiplies the wage

wageDemand = 0.22 * 1.068^(CA-50)
           * potentialPremium(1 .. 1.40)          // min(1.40, 1 + 0.011*max(0, pot - CA))
           * ageFactor(0.85 | 0.92 | 1)
           * tierWageMult { 1:1.25, 2:1, 3:0.8, 4:0.65 }
           * prestigeDiscount(0.90 .. 1.15)       // clamp(1.12 - 0.0022*prestige)
           * star(1 + 0.0025*starPower)
```

**Decision: keep `WAGE_BASE = 0.22` and `WAGE_CURVE = 1.068`.** The economy designer proposed `W0 = 0.55` with `e^0.062 = 1.064` per point — a near-identical curve at 2.5× the base, plus a nine-multiplier stack (scarcity, drop premium, persona, buyout adjustment). The shipped curve is already exponential in ability, which is the load-bearing property: *the last five ability points cost as much as the first thirty*, so you cannot buy a title and developing a prospect is the smart play rather than the sentimental one.

Anchor grid, ◈/week, at prestige 50 and starPower 50:

| CA | T4 ×0.65 | T3 ×0.8 | T2 ×1.0 | T1 ×1.25 |
|---|---|---|---|---|
| 50 | 0.16 | 0.20 | 0.25 | 0.31 |
| 60 | 0.31 | 0.39 | 0.48 | 0.60 |
| 70 | 0.61 | 0.75 | 0.93 | 1.16 |
| 80 | 1.17 | 1.44 | 1.80 | 2.25 |
| 88 | 1.98 | 2.44 | 3.05 | 3.81 |
| 92 | 2.58 | 3.17 | 3.96 | 4.95 |

### 6.3 Revenue, and why the superteam is impossible

```
weeklyRevenue(org) = LeagueConfig.weeklyRevenue          // 6.5 / 2.4 / 0.7 / 0.15
                   + sponsorIncome                        // existing prototype sponsors
                   + merch
                   + amortisedPrize                       // last split's prizeFor() / 26

merch     = 0.035 * fanbase * TIER_MERCH
TIER_MERCH = { 1: 2.4, 2: 1.0, 3: 0.4, 4: 0.15 }

SUSTAINABLE_WAGE_RATIO = 0.55    BOARD_FLAG_RATIO = 0.70    BOARD_PANIC_RATIO = 0.85
```

| | revenue ◈/wk | sustainable (55%) | a plausible five | ratio |
|---|---|---|---|---|
| T1 elite (fanbase 70, 3 sponsors, champion) | **25.28** | 13.90 | five CA-80 = 11.24 | 44% ✅ |
| T1 elite | 25.28 | 13.90 | two CA-88 + three CA-80 = 14.36 | 57% ⚠️ |
| T1 elite | 25.28 | 13.90 | **five CA-88 = 19.03** | **75%** ❌ |
| T1 mid-table (fanbase 45, 2 sponsors) | 15.98 | 8.79 | five CA-80 = 11.24 | **70%** ❌ |
| T2 survive (fanbase 32) | 7.32 | 4.03 | five CA-70 = 4.66 | 64% ⚠️ |
| T2 chasing promotion | 7.32 | 4.03 | five CA-78 = 7.89 | **108%** ❌ |
| T3 (fanbase 15) | 2.31 | 1.27 | five CA-60 = 1.93 | 84% ❌ |
| T4 (fanbase 6) | 0.86 | 0.47 | five CA-52 = 0.93 | **108%** ❌ |

Read the two shapes that matter. **Chasing promotion out of the Ascent Division costs you money every week you do it** — you must sell someone, or bank a season first. **The elite Prime roster is nearly break-even**: winning pays for itself and not much more; the surplus comes from developing prospects and selling them. That is the pyramid's economics made legible, and it is the mechanical reason the stable win-shape is *two bought stars and three grown in-house.*

`financialState()` (shipped) gives `healthy | tight | critical | insolvent` from `runwayWeeks`. On `insolvent`, one forced sale of the highest-`bidInterest` player at 0.75× fires with one week's inbox warning. **No loans, no administration in v1** — LATER.

### 6.4 The AI market pass

Runs on market weeks only, once per week, over `world.orgIds` (sorted).

```
for each org, in orgId order:
  1. needs  = ROLES.map(r => ({ role: r, incumbent: incumbentAbility(org, r) }))
  2. pool   = eligible free agents ∪ expiring rivals (§7.2 floors), sorted (interest desc, playerId asc)
  3. target = argmax bidInterest(org, p, { incumbentAbility, tier, budgetPerWeek })
              require interest >= 0.25 AND (an empty seat OR an upgrade of >= 6 CA)
  4. offer  = offerToAccept(player, org, tier, starterChance, renewal) * bidNoise
              bidNoise = 1 + rng(`market:bid:${orgId}:${playerId}:${absWeek}`).range(-0.06, 0.06)
  5. if evaluateOffer(...).accepted and wageBill + wage <= revenue * BOARD_PANIC_RATIO: sign
  6. renewals: any contract with weeksRemaining <= 26 → offerToAccept at renewal=true
  7. drops (off-season only): if roster > cap or wageRatio > 0.85,
              release argmin(CA - 0.4 * potential)
```

At most **one signing per org per week**. Over four market windows (roughly 12 open weeks) that bounds the market at 48 × 12 signings; in practice the interest and upgrade gates cut it to **40–70 moves a season**, which is the churn rate that makes the ladder feel alive without making rosters meaningless.

**The critical determinism rule:** bid noise is keyed by `(orgId, playerId, absWeek)`, *not* drawn from a shared per-window stream. If every org drew from one `market:${week}` stream, adding or removing one org would shift every subsequent org's rolls, and a save from before a fold would diverge. Per-bid keys make bids order-independent — they can be computed in any order, or in parallel, with identical results.

### 6.5 Rival bids on your players

`attractsApproach(contract, player, rng)` is shipped: `ca >= 55`, base 0.05/week on a short deal (≤ 26 weeks) and 0.012 otherwise, scaled by quality. Stream: `market:approach:${playerId}:${absWeek}`.

When it fires, an inbox item is raised **before** resolution with the fee, the wage offered, and the player's read on it. Your four affordances:

| | effect |
|---|---|
| **Reject** | legal unless the bid ≥ `contract.buyout`. `morale -= 9 * (1 - loyalty/140)` |
| **Accept** | you receive the fee, he leaves at week end, squad `morale -= 4` |
| **Renew now** | `offerToAccept(..., renewal: true)` at +8%; resets the buyout and the approach clock |
| **Buyout paid** | you cannot refuse, but you get the full clause — which is why the buyout slider at signing time matters |

**Advancing the week is blocked while an unanswered bid card is open**, with a countdown chip in the topbar. That is the anti-silent-theft rule and it is non-negotiable: a player leaving without you being asked is the single worst thing this system could do.

---

## 7. The talent pipeline

### 7.1 The visible ladder — 2525, and it is not a display filter

`SHOW_CUTOFF = 2525` is shipped in `ladder/bands.ts` and it *falls out of the tier bands*: Onyx spans 2300–2600 in four divisions of 75, so division I begins at 2525. That is literally "Diamond 1 and above". All three designers converged here independently; there is nothing to resolve.

Three fidelity layers, with hard entity budgets:

| Layer | Contents | Core (per region) | Prototype |
|---|---|---|---|
| **board** | all Apex + Paragon, ranked #1..N | 400 | **60** (apex 20, paragon 40) |
| **pool** | rotating sample of Ascendant + Onyx I | `poolSlots()`, 144–360 | **90** (asc 34, onyx-I 56) |
| **deep** | sub-cutoff, materialized one at a time by Deep Scout | 0 resident | 0 resident |
| **mass** | everything under Cobalt | never exists — `accountsAboveCutoff()` is a number in a header | same |

The header states the abstraction honestly rather than hiding it:

> `5,203 accounts above the Onyx I cutoff in Meridia · 150 files open · 4 of them yours to watch`

### 7.2 Signing floors and the one door beneath them

**Decision: per-tier floors, from the season designer.** The pipeline designer wanted a single floor of 2525 for everyone with a philosophy-gated exception; the economy designer wanted floors as low as 1500. Per-tier is better because it *is* the pyramid made visible in the recruit list: a T4 org and a T1 org shopping the same screen see different worlds.

```ts
export const SIGN_FLOOR_MMR: Record<PyramidTier, number> = {
  1: 2850,   // Paragon — the Prime League shops the top of the ladder
  2: 2600,   // Ascendant
  3: 2525,   // Onyx I — the realistic floor the brief names
  4: 2525,
};

/** The wiggle room: belief, bought with scouting, lets you break the rule everyone follows. */
export function eligibleToSign(
  entity: LadderEntity, tier: PyramidTier, scoutConf: number, potentialRead: PotentialTier,
): boolean {
  if (entity.mmr >= SIGN_FLOOR_MMR[tier]) return true;
  if (entity.mmr < SHOW_CUTOFF) return false;                 // below 2525: deep scout only
  return scoutConf >= 0.55 && (potentialRead === 'elite' || potentialRead === 'generational');
}
```

And beneath the cutoff, exactly one door — `deepScoutGemChance()` and `deepScoutTargetMmr()` are already shipped:

```
cost   = DEEP_SCOUT_COST = 4 analyst-weeks (vs 1 for a normal scouting tick)
pGem   = clamp(0.18 + 0.22*(networkTier/3) + 0.10*(analystScouting-50)/50, 0.10, 0.55)
surface at scout.conf = 0.30 — you already paid the weeks
```

An amateur hits ~18%; a well-networked org ~45%. And note the interlock: a deep-scout find surfaces at conf 0.30 but signing below the floor needs 0.55, so **you find him, then you must spend more to believe him.** The lottery ticket is available to everyone; the repeatable edge is bought.

### 7.3 Development — the promise, quantified

**Decision: `players/development.ts` is unchanged. `DEV_BASE` stays 0.085.** The pipeline designer proposed a full replacement (`K_GROWTH = 0.6`, `gap/50`, a seven-term `envMult`, a separate solo-queue channel touching only `{mechanics, laning, reflexes}`, a `PRO_BIAS` distribution table, potential drift). The shipped model already has the load-bearing property and `development.test.ts` already pins the arc:

```
gained per season, elite org:  9 < g < 16          // test line 82-83
five seasons from age 17:      total > 28, final CA > 84
elite org gain > 1.8 × solo-queue gain              // test line 81
```

The equation, as shipped:

```
headroom  = clamp((potential - CA) / 22, 0, 1.15)          // FULL_SPEED_HEADROOM = 22
drive     = 0.45 + 1.10 * driveScore/100                    // growthRate, learningRate, workEthic
support   = 0.45 + 1.10 * supportScore/100                  // 0.5*env + 0.3*playtime + 0.2*mentorship
ageMult   = clamp(1.32 * (1 - t²), 0.04, 1.32),  t = (age-16)/(peakAge-16)
delta     = 0.085 * headroom * ageMult * drive * support * successMult * roleMult
leap      = age < 22: p = 0.018 * headroom * supportScore/100  →  delta × 3.2
```

**Rank does not appear anywhere in it.** Headroom does. That is the whole philosophy in one line: *potential is a lottery you can win at any rank; converting potential into ability is a thing you buy.*

`DevContext.environment` comes from `orgEffects().developmentMult` mapped onto 0..100; `playingTime` is 100 for a starter, 45 for a sub, `LADDER_PLAYTIME = 25` unsigned; `mentorship` is the best rostered veteran's `mentorship` scaled by the age gap, reusing meshing's `fitMentor` term verbatim.

**The worked case that sells the brief.** Sable: age 17, Onyx I at MMR 2540, CA 58, potential 92, growthRate 75, workEthic 80, learningRate 68, peakAge 23.

| | signed to a good org | left on the ladder |
|---|---|---|
| environment / playtime / mentorship | 78 / 100 / 60 | 22 / 25 / 0 |
| supportScore | 78.0 | 18.5 |
| support multiplier | 1.308 | 0.654 |
| effective rate at full headroom | **0.286 CA/wk** | 0.129 CA/wk |
| CA at 18 | 70 | 63 |
| CA at 20 | 83 | 71 |
| CA at 22 | 88 | 75 |
| CA at peak (23) | **~90** | **~76, then plateau, then decline** |

> **Same player, same seed. Signed at 17: a world-class mid.** Left on the ladder: a Paragon leaderboard name and a career backup — who, because solo queue weights `{mechanics, laning, reflexes}` at 0.52 in `soloAbility` but only 0.204 in `currentAbility`, *looks* like a top-300 account at 22. Which is exactly when a rival overpays for him.

That last asymmetry is not authored. It is a linear-algebra consequence of two weight vectors that already exist in `ratings.ts` and `ladder.ts`. Nothing new is needed to produce the ladder god who is a pro liability.

**Target distribution the balance harness asserts** (20 worlds × 10 seasons, ±4pp):

| signed from, age ≤ 20 | P(CA ≥ 85 by 24) |
|---|---|
| Apex | 46% |
| Paragon | 31% |
| Ascendant | 20% |
| **Onyx I** | **12%** |
| deep-scout find (sub-cutoff), ≤ 19 | 9% |

Monotone decreasing, **never zero**. That table *is* the philosophy, and it is testable.

### 7.4 Signed players stay on the ladder

The single highest-leverage decision for making the world feel populated. Every player — yours, a rival's — carries a `LadderStanding` and appears on the leaderboard with a `PRO` chip carrying their org's tag. They are filtered out of the *pool* tab by default; they are always on the *board*.

A pro plays `soloGamesPerWeek(workEthic, phase, contracted: true)` — `SOLO_BASE = 6` against 20 for a ladder hopeful, with `SOLO_PHASE_MULT` of 1.0 in the regular season and **1.8 in the off-season**. Since `computeMmr`'s convergence is `1 - e^(-games/120)`, contracted players display far below their steady MMR all season and spike when they grind in the winter. **The mid-season leaderboard is full of teenagers; the off-season leaderboard is full of pros.** Both readings are true, and it costs nothing.

Released players re-enter via the shipped `reentryMmr(lastLadderMmr, steadyMmr) = 0.55*last + 0.45*steady` with `gamesThisSeason` reset low — which trips the existing `smurf` predicate (`current < steady - 250`) **honestly**, for once: he really is underranked, because he has been scrimming instead of laddering. Their scouting confidence floors at 0.45 for every org, because their pro tape is public. Free agents are information-rich and cheap to evaluate; ladder unknowns are bets. That asymmetry is what lets a poor manager function while still rewarding the one who scouts.

### 7.5 The asymmetry that makes the ladder matter

**Contracted players require an open transfer window. Unsigned ladder players do not.** They are not under contract, so signing one is legal in any week. This is deliberate: the ladder is the always-open door, it is the only way a poor org can improve mid-season, and it is the direct payoff for scouting spend.

### 7.6 Off-season turnover

Run in this fixed order, weeks 41–52:

| Week | Phase | What happens |
|---|---|---|
| 41 | season review | `advanceOrgSeason(org, outcome)` for all 48 in `orgId` order: standing, legacy, facilities from `investmentBudget`, fanbase, cash |
| 42–43 | gauntlets | 9 series; then **all three boundary movements committed simultaneously** from pre-movement tables |
| 45 | expiry wave | `tickContracts` — deals hitting 0 become free agents |
| 46–48 | free agency | three AI market passes |
| 49 | turnover | retirements → folds (`shouldFold`) → seat backfill → debut cohort |
| 51 | preseason patch | `generatePatch`; ladder season resets (`gamesThisSeason = 0`) |
| 52 | preseason | roster deadline warning |

**Retirement**, once per player at week 49, stream `career:retire:${playerId}:${year}`:

```
pRetire = clamp01( 0.06 * max(0, age - 25)^1.5
                 + 0.30 * unsigned * clamp01((age - 22) / 4) )
        * (1.25 - 0.50 * ambition/100)
```

Note the age gate on the unsigned term and the absence of a flat base. A naive `0.02` floor
retires 2% of twenty-two-year-olds a year, which quietly deletes prospects mid-development —
the exact thing this build exists to protect.

| case | p |
|---|---|
| 22, contracted or unsigned | **0%** — nobody retires young, ever |
| 24, unsigned, ambition 50 | 15% |
| 27, contracted, ambition 60 | 16% |
| 26, unsigned, ambition 50 | 36% |
| 29, contracted, ambition 60 | 46% |
| 31, contracted, ambition 60 | 84% — almost nobody plays past 31 |

**Debut cohort**, week 49, `DEBUT_COHORT = 24` per region, ages 16–17, band weighted `onyxI 0.72 / ascendant 0.28`, `plant: 'hiddenGem'` at p = 0.08 — about **1.9 genuine gems per region per season**, of which roughly 40% land sub-cutoff and are findable only by deep scouting. (The pipeline designer wanted 45; 24 is enough to refresh a 150-entity visible pool at ~16% turnover a year, and it halves the generation cost.)

**Ladder refresh**, week 51: drop unsigned pool entries older than 23 in the bottom 20% by MMR, add the cohort, reset `gamesThisSeason`.

---

## 8. Determinism

### 8.1 Every stream, named

Names derive from **identity**, never from a counter or an iteration index.

```
worldgen:orgs:{regionId}                      org census, personalities, seeded history
worldgen:ladder:{regionId}:{band}:{slot}      the initial visible ladder
org:{orgId}:season:{year}                     per-org season decisions (investment split)
season:{year}:sched:{leagueId}:{split}        the schedule permutation
match:{fixtureId}                             a fast-path series
match:{fixtureId}:g{i}                        a full-path game (draft + resolve + ticks share it)
draft:{fixtureId}:g{i}                        draft AI noise
playoff:{leagueId}:{year}:s{split}:{nodeKey}  a bracket series
gauntlet:{year}:{boundary}:s{step}            boundary ∈ { t1t2, t2t3, t3t4 }
market:bid:{orgId}:{playerId}:{absWeek}       ONE bid's valuation noise — order-independent
market:approach:{playerId}:{absWeek}          whether a rival comes knocking for your player
growth:dev:{playerId}:{absWeek}               the weekly development tick
growth:apply:{playerId}:{absWeek}             spreading the delta across attributes
career:retire:{playerId}:{year}               the off-season retirement check
career:debut:{regionId}:{year}:{n}            the fresh 16–17 cohort
ladder:tick:{regionId}:{absWeek}              weekly MMR climb / decay
ladder:deep:{orgId}:{year}:{n}                one deep-scout draw (n = org.deepDraws++)
offseason:{year}:folds                        shouldFold rolls + seat backfill
meta:{patchIndex}                             (existing)
chat:{fixtureId}:g{i} · comms:{fixtureId}:g{i}  (existing)
```

### 8.2 The seven hazards, and their fixes

1. **Org iteration order.** Never iterate a `Map`/`Set`/`Record` of orgs. `World.orgIds` and `World.playerIds` are maintained sorted and are *the only legal iteration order*. Same for `ROLES` instead of `Object.keys(lineup)`.
2. **Per-bid streams, not a shared loop stream.** §6.4. This is the one that will actually bite if got wrong.
3. **ID minting happens in exactly one place per phase, in a fixed order.** Worldgen iterates the pack array in declaration order then mints generated orgs by seat index. The off-season mints retirements-then-folds-then-debuts, each list sorted by id first. Never mint inside a `filter`/`find` callback.
4. **Never key a stream by a name.** `orgname:{orgId}`, never `orgname:{name}` — otherwise a rename would retroactively rewrite an org's entire RNG history.
5. **Absolute week, never week-of-year.** `market:bid:...:{clock.date.absWeek}`, so year 3 week 12 ≠ year 4 week 12.
6. **Round every stored EWMA scalar.** `legacy`, `standing`, `facilities`, `coaching`, `analytics`, `scouting`, `fanbase` are `round(x, 2)` on every write — `advanceOrgSeason` already does this. Without it a 20-season EWMA chain diverges between a live session and a save/reload at ~1e-13, which is enough to flip an `rng.chance(p)` at a boundary and desync a golden-seed test.
7. **Boundary movements are computed from pre-movement standings for all three boundaries and committed together.** Top-down and bottom-up resolution cannot then diverge.

A lint rule bans `for...in`, un-sorted `Object.keys()`, and `Map`/`Set` iteration anywhere in `packages/core/src`.

---

## 9. Performance budget

Target: **a whole season of background simulation well under one second.** Measured against the existing `season.test.ts` perf guard (20,000 fast series in under 2 s).

| Work | Count / season | Unit | Total |
|---|---|---|---|
| Fast series (T1 190 + T2 190 + T3 254 + T4 138 + gauntlet 9) | **781** | ~0.3 µs + 0.2 µs `Rng` init | **0.4 ms** |
| `FastSide` recompute (`teamBreakdown` + `draftSkill`), **weekly, cached per (orgId, week)** | 48 × 52 = 2,496 | ~2 µs | **5.0 ms** |
| Development tick (260 rostered + 150 ladder) | 21,320 | ~1.5 µs (17 attribute writes) | **32 ms** |
| Ladder MMR tick | 150 × 52 = 7,800 | ~0.15 µs | 1.2 ms |
| Leaderboard re-sort (150 rows, weekly) | 52 | ~1,100 cmp | 0.4 ms |
| AI market pass (12 open weeks × 48 orgs × ~30 candidates) | ~17,000 `bidInterest` | ~0.12 µs | 2.1 ms |
| Off-season (season tick, retirements, cohort, folds) | one-shot | — | ~3 ms |
| **Total** | | | **≈ 45 ms per region-season** |

**Twenty-two times the headroom.** Two guardrails:

- **The dominant cost is `applyDevelopment`, at 70% of the budget** — it writes 17 attributes with an `rng.float()` each. If it grows, run background players' development every 4th week with a ×4 delta on `growth:dev:{playerId}:{absWeek}` (identical expectation, deterministic, 4× cheaper). **Never coarsen the development of players the manager can see** — it is the thing they feel.
- **`teamBreakdown` must be cached per `(orgId, absWeek)`.** Lineups do not change mid-week. Uncached, a T1 week costs 20 breakdowns instead of 10 and the figure above doubles.

**Your own matches always use the full engine** — `simulateDraft` + `simulateGame` + `generateTicks`. The fast path never touches them.

**Calibration is the test that matters.** `resolveFastSeries` and the full `simulateSeries` + real draft must agree in expectation, or "sim" and "play" are different games and simming is an exploit. Golden test: 100 fixed team pairs × 200 paired sims; assert `|E[fast pA] - E[full pA]| <= 0.02`. `DRAFT_GAIN` and `VAR_BASE` are the only two constants tuned against it.

---

## 10. Data shapes

### 10.1 Core — the new modules

```ts
// packages/core/src/world/world.ts
export interface RosterSlot { playerId: string; role: Role; starter: boolean; }

export interface OrgFinance {
  weeklyRevenue: number; weeklyCosts: number; wageBill: number; wageRatio: number;
  /** last 12 weeks: { week, line, amount } — the Business screen's ledger. */
  ledger: LedgerLine[];
  state: FinancialState;                  // healthy | tight | critical | insolvent
  insolventWeeks: number;
}

export interface World {
  seed: string;
  clock: GameClock;
  mint: IdMint;
  playerOrgId: string;

  orgs: Record<string, Org>;
  /** SORTED. The ONLY legal iteration order over orgs. */
  orgIds: string[];
  rosters: Record<string, RosterSlot[]>;
  finances: Record<string, OrgFinance>;

  players: Record<string, Player>;
  /** SORTED. The ONLY legal iteration order over players. */
  playerIds: string[];
  /** One live deal per player; keyed by playerId. */
  contracts: Record<string, Contract>;
  chem: Record<string, RosterChemistry>;  // by orgId

  ladder: LadderPool;
  season: SeasonState;
  patch: Patch;
}

export interface LadderPool {
  /** Apex + Paragon, ranked. Sorted (mmr desc, id asc). */
  board: LadderEntity[];
  /** Ascendant + Onyx I open files. */
  pool: LadderEntity[];
  /** Deep-scout finds, promoted into `pool` on surface. */
  files: Record<string, ScoutFile>;
  deepDraws: number;
}
export interface ScoutFile { conf: number; revealed: LadderFlag[]; shortlisted: boolean; }

export function seedWorld(seed: string, opts: { regionId: string; playerOrgTier: PyramidTier }): World;
```

```ts
// packages/core/src/season/season.ts
export interface SeasonState {
  year: number;
  /** The whole year, all four leagues, built once at roll and serialized. */
  fixtures: ScheduledFixture[];
  /** leagueId → split → orgId → row */
  tables: Record<string, Record<1 | 2, Record<string, TableRow>>>;
  /** orgId → championship points, T1 only. */
  cp: Record<string, number>;
  /** leagueId → orgIds holding a seat. SORTED. */
  seats: Record<string, string[]>;
  brackets: Bracket[];
  gauntlets: GauntletLadder[];
}

export interface GauntletLadder {
  boundary: 't1t2' | 't2t3' | 't3t4';
  year: number;
  steps: [BracketNode, BracketNode, BracketNode];
  incumbent: string;      // the upper league's second-last
  autoUp: string;         // the lower league's champion
  autoDown: string;       // the upper league's last
}

/** Build a whole year: seats → schedules → empty tables. Consumes only sched streams. */
export function rollSeason(world: World, year: number): SeasonState;

/** Resolve everything scheduled for one week. Pure over (world, week) → outcomes. */
export function resolveWeek(world: World, week: number): WeekOutcome;
```

```ts
// packages/core/src/world/market.ts
export interface MarketMove {
  kind: 'sign' | 'renew' | 'release' | 'approach';
  orgId: string; playerId: string;
  wage: number; weeks: number; fee: number;
  fromOrgId: string | null;
}
export function runMarketWeek(world: World, absWeek: number, src: RngSource): MarketMove[];
export function eligibleToSign(e: LadderEntity, tier: PyramidTier, conf: number, read: PotentialTier): boolean;
export const SIGN_FLOOR_MMR: Record<PyramidTier, number>;
```

### 10.2 The prototype's `G`

Removed: `stageIndex`, `stageWins`, `makeOpponent()`, `stage()`, `STAGES`.

```js
G = {
  // ---- unchanged ----
  seed, cash, reputation, scoutPts, scoutBudget, sponsors, inbox, ui, patch, chem, roster,

  // ---- the clock ----
  year: 1,
  week: 1,
  absWeek: 1,                       // (year-1)*52 + week — the key for EVERY stream

  // ---- the world ----
  orgId: 'you',
  orgs: {},                         // orgId -> Org (the core shape, verbatim)
  orgIds: [],                       // SORTED — the only legal iteration order
  rosters: {},                      // orgId -> [{ playerId, role, starter }]
  players: {},                      // playerId -> Player
  playerIds: [],                    // SORTED
  contracts: {},                    // playerId -> Contract
  orgChem: {},                      // orgId -> RosterChemistry

  // ---- the ladder ----
  ladder: { board: [], pool: [], files: {}, deepDraws: 0 },

  // ---- the season ----
  season: {
    year: 1,
    fixtures: [],                   // whole year, all four leagues
    tables: {},                     // leagueId -> {1:{},2:{}} -> orgId -> TableRow
    cp: {},
    seats: {},                      // leagueId -> [orgId] SORTED
    brackets: [],
    gauntlets: [],
  },

  // ---- money ----
  finance: {
    weeklyRevenue: 0, weeklyCosts: 0, wageBill: 0, wageRatio: 0,
    ledger: [], state: 'healthy', insolventWeeks: 0,
  },

  // ---- the market ----
  market: {
    open: false,
    phase: 'closed',                // 'closed' | 'preseason' | 'midSeason' | 'offSeason'
    weeksLeft: 0,
    bids: [],                       // unanswered rival bids — BLOCKS advanceWeek
    negotiation: null,              // { playerId, orgId, terms, verdict } | null
    rumours: [],                    // AI-to-AI moves touching players you scouted
  },
};
```

**Two refactors the prototype needs first**, both in `template.html`:

1. `STAGES[].fee` is misnamed — at line 451 it is used as a *signing-price multiplier* (`base*mult*stage().fee`), not an entry fee. It dies with `STAGES`; its role is taken by `tierWageMult`.
2. `signingFee()` must become a **transfer fee, not the price of the player**: `0` for a free agent, the buyout or negotiated bid for a contracted one. The real cost is the recurring `wagePerWeek`. `advanceWeek()` gains, in this order: `financeTick → contractTick → marketTick (window weeks only) → resolveWeek → sponsorIncome → distressCheck`, and opens with `if (G.market.bids.some(b => !b.answered)) return blockWithToast()`.

---

## 11. The UI

Design language unchanged: ink + gold, `Barlow Condensed` heads, `IBM Plex Mono` numerals, hairline rules, fog bands. Two token additions and one bug fix:

```css
:root{ --meta:#a98bd6; --cell:34px; }
@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){ --meta:#6b4fa8; }}
:root[data-theme="dark"]{ --meta:#a98bd6; }

/* the existing reduced-motion rule kills animation but not transition */
@media (prefers-reduced-motion: reduce){*{animation-duration:.01ms!important;transition-duration:.01ms!important}}
```

### 11.1 Navigation — four rail entries, down from four, for triple the surface

```
◈ Season      [WK 12]     fixtures, table, calendar   ← HOME (was: nothing)
  Squad       [5/5 ·]     absorbs contracts + wage bill
  Recruit     [3]         was "Scout the Ladder" — now three populations
  Business    [2]         was "Sponsors" — now income AND outgo on one screen
── The Climb ──
  pyramid mini            T1..T4, your league lit, position 6/10
```

**Compete is deleted as a rail entry.** Match day becomes a takeover launched by the fixture card's CTA or the topbar Continue. A nav slot for "the thing the calendar already tells you to do" is bloat. While a series is live the rail dims (`opacity:.35; pointer-events:none`) so the takeover is total.

**Sponsors → Business** because splitting income and outgo across two screens means you can never answer *"can I afford him."*

The topbar carries the single primary action, and **its label names the week**:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ manage LOL     ◆ S3 · WK 12 · REGULAR   │128◈│−18.4/wk│PRES 41│SCOUT 4/6│  ⌂3   ☼      │
│ esports team manager                                    ┌────────────────────────────┐ │
│                                                         │ ▶ PLAY · vs HALLOWVANE     │ │
│                                                         │   Bo3 · away · R7          │ │
└─────────────────────────────────────────────────────────└────────────────────────────┘─┘
```

`▶ PLAY · vs HALLOWVANE` / `▶ ADVANCE · scrim week` / `▶ RESOLVE · 2 decisions` / `▶ OPEN · transfer window` / `▶ PATCH 4.3 drops`. Disabled with a reason when a decision blocks it (`⏸ 1 bid unanswered`). `Space` triggers it; `1–4` are the rail.

### 11.2 The Season hub

```
┌ rail ────┬──────────────────────────────────────────────────────────────────────────────────┐
│◈ SEASON  │ ASCENT DIVISION                                              ROUND 7 OF 18       │
│  SQUAD   │ Tier 2 · double round-robin · top 4 to playoffs · bottom 2 relegated             │
│  RECRUIT ├──────────────────────────────────────────────────────────────────────────────────┤
│  BUSINESS│ ┌ THE RUN ──────────────────────────────────────────────────────────────────┐   │
│          │ │ 08   09   10   11  ▸12◂  13   14   15   16   17   18   19                 │   │
│ THE CLIMB│ │ ⚔    ⚔    ⚔    ⚔    ⌂    ⚔    ⚔    ⇄    ✦    ✦    ✦    ⇄                 │   │
│  T1 ─    │ │ ▬▬   ▬▬   ▬▬   ▬▬  ▬▬▬  ▬▬   ▬▬   ▬▬   ▬▬   ▬▬   ▬▬   ▬▬                 │   │
│  T2 ●6/10│ │  W    L    ·    W    ·    ·    ·    ·    ·    ·    ·    ·                 │   │
│  T3 ─    │ │ ⚔ match  ⇄ window  ⌂ training  ✦ event  ▲ playoffs                        │   │
│  T4 ─    │ └──────────────────────────────────────────────────────────────────────────┘   │
│          │                                                                                  │
│ New      │ ┌ NEXT · ROUND 7 ─────────────────────────┐ ┌ FORM ──────────────────────────┐ │
│ career   │ │  ┌────┐                         ┌────┐  │ │ R6  ▲ IRP  W 2–0  ▮7.4  home   │ │
│          │ │  │YOU │ away          2nd ◈ 6th │ HVN│  │ │ R5  ▼ GRV  L 1–2  ▮5.9  away   │ │
│          │ │  └────┘                         └────┘  │ │ R4  ▲ SND  W 2–1  ▮6.8  home   │ │
│          │ │  Hallowvane · INSTITUTION · legacy 61 ⚜ │ │ R3  ▲ ZPH  W 2–0  ▮8.1  away   │ │
│          │ │  ████████████████████░░░░░░░░░░░░░░░░   │ │ ●●○●○   last 5 · 3W 2L         │ │
│          │ │  57% YOU                       43% HVN  │ └────────────────────────────────┘ │
│          │ │  h2h 1–1 · they beat Gravel 2–0 last    │ ┌ THE DESK ──────────── 3 new ──┐ │
│          │ │  ⚠ Yoito fatigue 71 · chem 68 (Solid)   │ │ ⚑ BID · Ironpine want Zeaysh ▸ │ │
│          │ │  ┌───────────────────────────────────┐  │ │ ↗ Kestrel sign a Paragon mid   │ │
│          │ │  │  ▶  PLAY THE SERIES               │  │ │ ✦ Patch 4.3 lands week 15      │ │
│          │ │  └───────────────────────────────────┘  │ │ all 12 items ▸                 │ │
│          │ │  scout report ▸   Hallowvane profile ▸  │ └────────────────────────────────┘ │
│          │ └─────────────────────────────────────────┘                                     │
│          │ ┌ TABLE ─────────────────────────────────────────────────────────────────────┐ │
│          │ │  (§11.3)                                                                   │ │
│          │ └────────────────────────────────────────────────────────────────────────────┘ │
└──────────┴──────────────────────────────────────────────────────────────────────────────────┘
```

`.hub{display:grid;grid-template-columns:1fr 340px;gap:18px;align-items:start}` — the same 1fr/right-rail rhythm as the existing `.scout-grid` and `.squad-grid`, so the app keeps one spatial signature. THE RUN and TABLE span both columns.

**The Run.** Twelve cells at `--cell:34px`, each carrying a week number (mono 9px `--faint`), a 16px type glyph, a 3px type bar and a result letter for weeks already played. The type bar colour is the entire legend — match `--gold`, window `--info`, training `--line`, event `--meta`, playoffs `--gold` solid and 2px taller. The current week is marked by **one absolutely-positioned `.wk-cursor`** moved with `transform:translateX(calc(var(--i) * var(--cell)))`. Advancing a week is one style write, not a re-render.

**Exactly one button on this screen.** The fixture card's CTA and the topbar Continue are the same action (`data-act="continue"`) at two weights. Org names, "scout report ▸", "all 12 items ▸" are links (`.lnk{color:var(--muted);border-bottom:1px dotted var(--line)}`), never `.btn`. That is what stops the hub going blocky: one gold rectangle, everything else is type and rules.

**The card body is the week's kind.** match → opponent + win-prob bar + h2h + warnings, `▶ PLAY THE SERIES`. training → "Scrim block — projected chemistry +2.1, fatigue +3", `▶ RUN THE WEEK`. market → "Transfer window open — 4 players expiring in your league" + 3 rows. event → patch card with the three biggest movers as tier chips. blocked → the blocking bid inlined, `▶ RESOLVE · 2`.

**The screen never changes on Continue.** Continue works from every screen and never navigates; only a match week takes over, and only after you press the CTA that says it will. At most one toast per advance — everything else goes to the Desk.

### 11.3 The standings table

Ten rows. The craft is entirely rhythm and restraint.

```
 ┌ ASCENT DIVISION ────────────────────────────────── R7/18 ─── sorted: table ─┐
 │ POS  Δ   ORG                             P    W    L    GD   FORM      WIN% │
 │ ──────────────────────────────────────────────────────────────────────────  │
 │   1  ▲1  HVN  Hallowvane            ⚜    7    6    1   +9   ●●●○●     85.7  │
 │   2  ▼1  IRP  Ironpine              ⚜    7    6    1   +7   ●●○●●     85.7  │
 │   3  ·   KST  Kestrel Valley             7    5    2   +5   ○●●●●     71.4  │
 │ ─ ─ ─ ─ ─ ─ ─ ─ ─ PROMOTION ▲ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
 │   4  ▲2  SND  Sunder Collective          7    4    3   +2   ●●○○●     57.1  │
 │ ─ ─ ─ ─ ─ ─ ─ ─ ─ PLAYOFFS ▲ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
 │▌  5  ▼1  ZPH  Zephyr Nine                7    4    3    0   ●○○●●     57.1  │
 │▌  6  ·   YOU  Ashgrove Collective        7    3    4   −1   ●●○●○     42.8  │ ← .you
 │   7  ▲1  GRV  Gravel                     7    3    4   −3   ○●○○●     42.8  │
 │   8  ▼1  NTF  Nightfall Society     ⚜    7    2    5   −6   ○○●○○     28.5  │
 │ ─ ─ ─ ─ ─ ─ ─ ─ ─ RELEGATION ▼ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
 │   9  ·   RPT  Riptide                    7    2    5   −7   ○○○●○     28.5  │
 │  10  ·   VNT  Vantablack                 7    1    6   −6   ○○○○●     14.2  │
 └─────────────────────────────────────────────────────────────────────────────┘
```

- **No zebra striping.** It is the single strongest "generated table" tell and it fights the hairline language already in `.ladder`. Rows are separated by `border-top:1px solid var(--line-soft)` and nothing else. Height 34px, `td{padding:7px 10px}`.
- **The rhythm comes from the cut lines**, which are the only heavy rules on the surface and which carry meaning. A real `<tr class="cutrow"><td colspan="9">` — not a `::after` on the row above — so it survives sticky headers and sorting and can carry an inline label:
  ```css
  .cutrow td{padding:0;height:19px;position:relative;border:0}
  .cutrow td::before{content:"";position:absolute;left:0;right:0;top:9px;height:1px;
    background:repeating-linear-gradient(90deg,var(--c) 0 5px,transparent 5px 10px)}
  .cutrow span{position:relative;display:inline-block;margin-left:34px;padding:0 7px;
    background:var(--surface);font-family:"IBM Plex Mono";font-size:8.5px;letter-spacing:.16em;color:var(--c)}
  .cutrow.up{--c:color-mix(in srgb,var(--gold) 60%,transparent)}
  .cutrow.down{--c:color-mix(in srgb,var(--toxic) 55%,transparent)}
  ```
- **Your row** reuses the established selection idiom verbatim: `background:var(--gold-ghost); box-shadow:inset 2px 0 0 var(--gold)`, name in `--gold`, `aria-current="true"`. **Never bold it** — bold in a tabular-nums table breaks the digit rhythm, which is the one thing this surface must not do.
- **`<colgroup>` + `table-layout:fixed` is non-negotiable.** Without it every re-render recomputes intrinsic widths and the numbers jitter horizontally by a pixel or two — the exact tell that a table is being rebuilt each week.
- **GD** colours only the sign (`+` gel, `−` toxic) and leaves the magnitude `--ink`, so the column reads as a spine of small green/red ticks rather than ten coloured numbers. **WIN%** is 12.5px `--ink` — the only number the eye should land on.
- **Δ arrows** are computed once when the round is recorded and cached as `row.lastPos`, never recomputed at render. Suppressed entirely in round 1.
- **Form dots**: wins **filled**, losses **hollow** — the difference between a scannable strip and a rash of red. `TableRow.form` is newest-first, so render `.slice(0,5).reverse()`. Each dot carries a native `title="R6 · W 2–0 vs Ironpine (H)"`: free tooltips, zero nodes.
  ```css
  .form i{width:7px;height:7px;border-radius:50%;flex:none}
  .form i.w{background:var(--gel)}
  .form i.l{background:transparent;box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--toxic) 65%,transparent)}
  ```
- **The laurel.** Orgs with `legacy >= 55` get one `⚜` in `--gold-deep` at 10px after the name, `title="Institution · 4 titles · 17 seasons in the top league"`. One glyph, no column — and legacy now leaks into every surface an org appears on. It is the cheapest possible way to make a table feel like it has a past.
- **One delegated click listener** on `<tbody>` (`e.target.closest('tr[data-org]')`), never per-row handlers. The whole row opens the org profile.
- **Never animate row reordering.** No FLIP. A data table whose rows slide past each other looks like a slot machine and destroys the one thing this surface sells: trustworthiness. Movement is communicated by the Δ column, which is more legible than motion and survives a screenshot.

### 11.4 The org profile (SHOULD, but the Spine is the payoff)

Opens as a sheet over `.main` only — rail, topbar and Continue stay live, so inspecting a rival never costs you your place in the week. A plain absolutely-positioned `.orgsheet`, **not** `<dialog>`, precisely because it must not trap focus.

```
 ┌───────────────────────────────────────────────────────────────────── ✕ close ─┐
 │  ┌─────┐  HALLOWVANE                                   ┌────────────────────┐ │
 │  │ HVN │  Kyorin · founded S-19 · methodical           │        73          │ │
 │  │  ◆  │  "Twelve-hour scrim blocks and a coach who    │   P R E S T I G E  │ │
 │  └─────┘   has never once raised his voice."           │   INSTITUTION      │ │
 │                                                        │  ▓▓▓▓▓▓▓▓░░░░░░░   │ │
 │                                                        │  legacy 61 · std 81│ │
 │                                                        └────────────────────┘ │
 ├───────────────────────────────────────────────────────────────────────────────┤
 │ THE SPINE · 21 seasons                                                        │
 │      S-20              S-15            S-10             S-5              now  │
 │ T1  ░░░░░░░░░░░░░░  ███░██░█▓█░░  ▓█░░██▓░  ██▓░█  ██     ← gold = title      │
 │ T2  ░░░░▓█▓░░░░ ░░░ ╱                                                         │
 │ T3  ░▓█╱                                                                      │
 │ T4  ╱                                                                         │
 │     └ founded in the amateur tier, promoted S-17, top league since S-13 ─┘    │
 │                                                                               │
 │ HONORS   T1 ◆◆◆   T2 ◆   T3 ◆      best finish 1st · S-9, S-4, S-2            │
 │          17 of 21 seasons in the top league · never relegated below T2        │
 ├──────────────────────────────────────┬────────────────────────────────────────┤
 │ ROSTER                               │ THE ORG · your scouts' read            │
 │ TOP  Ryyan     26  CA 81  ██████ 34w │ Facilities  ░░░▓▓▓▓▓▓░░░░  "elite"     │
 │ JGL  Zeaysh    22  CA 78  ██░░░░  8w⚠│ Coaching    ░░░░▓▓▓▓░░░░░  "very good" │
 │ MID  Yoito     24  CA 88★ ██████ 62w │ Analytics   ░░▓▓▓▓▓▓▓░░░░  "elite"     │
 │ BOT  Sereth    21  CA 79  ████░░ 28w │ Scouting    ░░░░░▓▓▓░░░░░  "good"      │
 │ SUP  Callowen  29  CA 74  ██░░░░  8w⚠│ Wage bill   ░░░░▓▓▓▓▓▓▓▓░  14–26 ◈/wk  │
 ├──────────────────────────────────────┴────────────────────────────────────────┤
 │ THIS SEASON  1st · 6–1 · ●●●○●  ·  next: vs YOU (R7, home)  ·  h2h 3–7        │
 └───────────────────────────────────────────────────────────────────────────────┘
```

**The prestige block renders its own formula.** `prestige = 0.62*standing + 0.38*legacy`, so the bar is literally two segments sized `0.38*legacy` (in `--gold-deep`, the earned-over-decades half) and `0.62*standing` (in `--gold`, the hot-right-now half). One glance tells you whether you are looking at a dynasty coasting or an upstart spiking. `statureLabel(org)` sits under the number.

**The Spine is `history.seasonsAtTier` and `history.finishes` made visible.** A season-by-season ribbon where the vertical lane is the tier and the fill is the finish, so rise and fall become a staircase you read in half a second:

```
viewBox "0 0 W 64",  W = seasons * 11
lane y:   T1→6  T2→20  T3→34  T4→48        cell 9×10, rx 2, pitch 11
fill:     title      → var(--gold)
          top 3      → var(--gold-ghost) + stroke color-mix(gold 45%)
          mid table  → var(--surface-3)
          bottom 20% → fill none, stroke var(--toxic) 1px
          relegated  → same + a 1px toxic descender into the next lane
connector: one <polyline> through the cell centres, stroke var(--line)
```

Built as **one `innerHTML` string of `<rect>`s plus one `<polyline>`** — never 24 `createElementNS` calls. Each rect carries a native `<title>S-9 · Tier 1 · 1st of 10 · CHAMPIONS</title>`. At 21 seasons the whole graphic is 231×64px and costs one paint. Under it, one prose line generated from `history`: *"founded in the amateur tier, promoted S-17, top league since S-13."* **The sentence is what makes it legendary; the graphic is what makes it credible.**

**Finances are fogged, and that is the point.** Reuse `.fog-row` / `.track` / `.band` verbatim from the scouting screen — the same visual thesis applied to a new object is how a design language earns its keep. `conf = clamp((yourOrg.scouting - 25) / 60, 0, 1)`; below 0.35 the numbers vanish and only the word survives (`"deep"`, `"elite"`), exactly as `potentialRead()` already behaves. Your own org shows the same page at `conf = 1`.

### 11.5 Recruit

Same two-column shape as today (`1fr / 372px`); the detail panel is good and does not change. What changes is a segmented **source** switcher and a **STATUS** column.

```
 ┌ RECRUIT ────────────────────────────────────────────────────────────────────────────┐
 │ ┌ BOARD ┬ THE POOL ┬ FREE AGENTS 6 ┬ EXPIRING 14 ┬ ★ SHORTLIST 3 ┐  [role ▾] [age ▾]│
 │ └───────┴──────────┴───────────────┴─────────────┴───────────────┘                  │
 │ 5,203 accounts above the Onyx I cutoff in Meridia · 150 files open · Scouting 38 ▸   │
 ├─────────────────────────────────────────────────────────────────────────────────────┤
 │ #  PROSPECT            RANK          ROLE AGE  WR    STATUS         READ            │
 │ ──────────────────────────────────────────────────────────────────────────────────  │
 │  1 dawnrunner_         ◆ Apex 2841   MID  19   61%   free agent     elite · certain  │
 │      [HIDDEN GEM]                                                                    │
 │  2 Verrik              ◆ Apex 2790   JGL  23   58%   HVN · 8w ⚠     elite            │
 │  7 o_o_o_o             ◆ Paragon     BOT  20   57%   — unsigned     high · a read    │
 │ 24 tenderloin          ◆ Ascendant   SUP  22   55%   IRP · 34w      solid            │
 │ ─ ─ ─ ─ ─ ─ ─ ─ ─  BEYOND YOUR NETWORK  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
 │    ████████            ◆ Cobalt      TOP  17   64%   —              ?                │
 │      [DEEP CUT · a Meridian scout filed a report — 4 scouting to open]               │
 └─────────────────────────────────────────────────────────────────────────────────────┘
```

- The default cut is Onyx I. Rows below it are simply not rendered — which is the brief. Two things keep "anyone can become the best" alive without a wall of nobodies: the **reach line** states the rule as a sentence with your `scouting` stat as a link (a visible upgrade path, not a hidden gate), and **DEEP CUT teasers** — a hard cap of **4** redacted rows below a dashed separator. The handle renders as literal `████████` block characters, never `filter:blur` (which forces a layer and repaints on scroll). A 17-year-old Cobalt top laner under a redaction bar is a far stronger hook than 300 unfiltered rows, and it costs four DOM nodes.
- **STATUS** is the new load-bearing cell and it is what makes the world feel populated: `free agent` (gel) · `— unsigned` (muted) · `HVN · 34w` (tag chip + weeks) · `HVN · 8w ⚠` (warn). The tag chip is clickable into the org profile. **Contracted rivals render at `opacity:.72` with a `PRO` chip, not the current `.signed{opacity:.42}` grey-out** — a rival's star sliding down the board is the most interesting row on the screen.
- **EXPIRING** is the same table with a different query — every contracted player in your region at `weeksRemaining <= 12`, columns swapped to `WAGE | WEEKS LEFT | BUYOUT | RIVAL INTEREST` (a 3-pip meter from `bidInterest` across AI orgs, fogged by your scouting). This is where the persistent-org update actually becomes a game to play.
- **FREE AGENTS** shows `CA` exactly — a free agent has been on the market and everyone has seen him — but keeps potential fogged. That asymmetry is a real signal, not a UI accident.
- When an AI signing touches a player you scouted, one inbox line: *"Kestrel Vanguard signed Ryusei (Apex, elite potential). You had him at 0.6 confidence."* That is the loss beat that teaches urgency.

### 11.6 Contracts

**Wage strip**, one row above the five `.pcard`s on Squad:

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ WAGE BILL 18.4◈/wk ████████████████░░░░░░░░ INCOME 22.1  NET +3.7  RUNWAY ∞ HEALTHY│
└────────────────────────────────────────────────────────────────────────────────────┘
```
Fed by `wageBill()`, `runwayWeeks()`, `financialState()`. `.tight` at ratio 0.70 shifts the border to `--warn`, `.critical` at 0.85 to `--toxic` and turns the bar fill toxic, plus a second line: *"The board expects the wage bill under 20◈. You are 3 weeks from having to sell."*

**Contract lane** on each player card, between `.meta` and `.mini-bars`:

```
│ MID │ Yoito                                    6.2◈/wk        88      │
│     │ 24 · Meridia · scaling carry             buyout 41◈   OVERALL   │
│     │ ███████████████████████░░░░░░░░│░░░░░░░  62w  ·  to S-5         │
```
`weeksRemaining/termWeeks` fills it, with a 1px tick every 52 weeks. `≤12w` → `.warn` and an `EXPIRES 8w` pill; `≤6w` → `.crit`, the card border shifts toward `--toxic`, and a `RE-SIGN ▸` ghost button appears **in the card**. Never a modal, never a nag — the card just gets visibly hot.

**Negotiation sheet** — right slide-over, 420px, over the current screen. Three sliders, one live verdict:

```
┌ RE-SIGN · YOITO ──────────────────────────────────────────── ✕ ┐
│ MID · 24 · CA 88 / potential 91 (confident) · loyalty 62        │
│ Currently 6.2◈/wk, 62 weeks. Market says he is worth more.      │
│                                                                 │
│ WAGE      ├─────────────●──────────┤   8.4 ◈/wk                 │
│           ░░░░░░░░▓▓▓▓▓▓▓▓▓░░░░░░  his ask: 7.6 – 9.1           │
│ LENGTH    ├─────●──────────────────┤   104 weeks (2 seasons)    │
│ STARTER   ├────────────────────●───┤   guaranteed seat          │
│                                                                 │
│ HE IS  ████████████████████▏│░░░░░  warm                        │
│                      accept line ┘                              │
│ "The money is right. He wants to know this team is going up."   │
│                                                                 │
│ FEE TO YOU 0 · WAGE BILL → 20.6◈/wk (tight)                     │
│ ┌──────────────────┐  ┌───────────┐                             │
│ │  MAKE THE OFFER  │  │   WALK    │                             │
│ └──────────────────┘  └───────────┘                             │
└─────────────────────────────────────────────────────────────────┘
```

**The utility number is never shown.** `evaluateOffer().utility` renders as a temperature bar with a 1px `--ink` mark at `ACCEPT_THRESHOLD = 0.72`, labelled `cold / cool / warm / sold`. `verdict.reason` — already returned by the shipped function — is the sentence underneath. `wageDemand()` renders on the wage slider as a **band** at low scouting confidence and a **hairline mark** at high confidence: the fog thesis applied to money. The wage-bill projection updates live, so you can see a signing break your finances *before* you make it.

**Rival bid — a modal**, because it is the drama. `<dialog>` + `showModal()` for the free focus trap and Esc. Buttons: `REJECT` · `ACCEPT 34◈` · `OFFER NEW TERMS ▸` (which closes into the negotiation sheet pre-filled to beat the bid). Dismissing does **not** discard: it drops into the Desk with a deadline pill, and Continue blocks at the deadline week.

### 11.7 Motion, and the beat of a week

| Animates | How | ms |
|---|---|---|
| week cursor advancing | `translateX` on one element | 140 |
| standings rows that moved | gold left-edge wipe, staggered 24ms, max 10 rows | 500 |
| a new form dot | `scale(.5)→1` | 160 |
| drawer / sheet / modal | `translateX` or `translateY(8px)` + opacity | 180 |
| credits in the topbar | one rAF loop, integer steps | 240 |

**Never animates:** standings reordering (§11.3); anything on a loop — no pulsing badges, no shimmer skeletons; `height`/`top`/`left`/`width` during a week advance; the nav rail, which is the fixed point of the whole app.

```
t=0     Continue's label swaps to the resolving verb, disabled, no spinner
t=0     the week cursor translates one cell                       (140ms)
t≈150   affected surfaces re-render in place; moved rows get the wipe
t≈200   at most ONE toast — the headline fact of the week
t≈220   rail badges tick; the fixture card flips to its next state
t<400   Continue re-enables with its NEW label, naming the next week
```

### 11.8 The techniques that keep it fast

The `main.innerHTML=''`-then-rebuild model stays; it is correct and simple at ≤60 rows. Scope it: `render()` rebuilds only the active screen, with `renderRun()`, `renderRail()`, `renderDesk()` as independent partials, so a week advance touches four small regions.

- **Delegate every list listener.** The current `tr.onclick=()=>{}` inside the ladder loop creates one closure per row per render; at 150 rows re-rendered on each filter keystroke that is the real cost, not the DOM.
- **Build hot lists as one HTML string.** The Recruit table's `<tbody>` assigned once is ~4× faster than `createElement` per cell and drops every per-row closure. Escape with the existing `esc()`. Keep `createElement` for the ≤10-row standings and ≤6 player cards, where readability wins.
- **Cap before you virtualize.** The Onyx-I filter takes the ladder to ~150 rows and the tab switcher to ~60 visible. That is the whole fix. Only above ~150 visible rows is windowing worth writing.
- **`content-visibility:auto; contain-intrinsic-size:0 40px`** on inbox items and org-history rows — near-free windowing with no JS.
- **Sticky-header gotcha:** `overflow:hidden` on an ancestor kills `position:sticky`, and the standings table lives inside a `.card`. Use `overflow:clip` on the x-axis only, and set the sticky header's `background` to `var(--surface)` (not `var(--bg)`) inside a card or it renders as a gap.
- **Don't call `toLocaleString()` in table loops** (~1 µs each; 150 rows × 6 numbers is a measurable frame). Keep `fmt()` for the topbar; use a plain fixed-decimal formatter inside tables.
- **`will-change` only on `.drawer` and `.wk-cursor`,** removed on `transitionend` — a persistent `will-change` on a full-height panel holds a compositor layer for the session.
- **Accessibility, cheaply.** Standings is a real `<table>` with `<th scope="col">` and `aria-sort` when transiently sorted; your row is `aria-current="true"`; the Run is `role="list"` with each cell `role="listitem"` and an `aria-label` naming the week type; Continue carries `aria-keyshortcuts="Space"`; `aria-live="polite"` goes on the unread count only, never on the list.

---

## 12. Build order

Each step is shippable and testable on its own. Golden-seed snapshots are marked ★ — CLAUDE.md requires one wherever a system produces a season or market outcome.

**1 — `SEASON_WEEKS` 40 → 52.** One line in `world/contracts.ts`.
*Tests:* `contracts.test.ts` still green; add `expect(SEASON_WEEKS).toBe(WEEKS_PER_YEAR)` importing from `world/clock.ts`, so the two definitions can never drift apart again.

**2 — `generateOrg` takes `seasonsOfHistory`.** One optional field, defaulting to 0.
*Tests:* a generated org with `seasonsOfHistory: 15` at T1 lands in legacy 35–55 and reads as `Institution`; with 0 it still reads as `Newcomer` (the shipped assertion).

**3 — `world/world.ts`: `seedWorld()`.** 48 orgs seeded across 10/10/16/12, rosters filled from generated players at `qualityCenter` by tier, contracts written at `wageDemand`, chemistry initialised, the ladder board+pool generated to bands.
*Tests:* seat counts exact per tier; no org holds two seats; every roster has five starters; ★ `world.seed` — a full `seedWorld('s1')` snapshot of org ids, tiers, legacies and roster CAs.

**4 — `season/schedule.ts`: `buildSplitSchedule`.** Rounds → weeks → days, the player nudge, `ScheduledFixture.id` as the stream key.
*Tests:* every org plays every other exactly `legs` times; no org appears twice on one day; rounds tile the split's match weeks exactly for all four configs; the player's fixtures land on day 6; sortedness of the input array is asserted in dev.

**5 — `season/season.ts`: `rollSeason` + `resolveWeek`.** Fast-resolve a week's fixtures, record into tables via `recordResult`, cache `FastSide` per `(orgId, week)`.
*Tests:* ★ `season.golden` — one full regular season on seed `s1`, snapshotting all four final tables. ★ `season.replay` — resolve the same year's weeks in a **shuffled order** and get an identical snapshot (this is the order-independence proof, and it is the most valuable test in the suite). ★ `season.resume` — serialize at week 17, reload, finish, identical to an uninterrupted run.

**6 — `season/playoffs.ts`: `buildBracket` + the gauntlet.** SE with byes at four tiers; the 3-step defended ladder; simultaneous boundary commit.
*Tests:* bracket node counts 5/3/7/3; seeding consumes zero rng; ★ `pyramid.conservation` — a 20-season run keeps 10/10/16/12 exactly with no seat unheld and no org double-seated; `promotion.difficulty` — a challenger at comparable strength converts the gauntlet in 0.10–0.25 of runs.

**7 — `world/market.ts`: the AI market pass.** Signing floors, the gem exception, one signing per org per week, per-bid streams.
*Tests:* no org signs below `SIGN_FLOOR_MMR[tier]` without the gem conditions; ★ `market.golden` — one season of moves on seed `s1`; **`market.orderIndependence`** — remove one org from the world, re-run, and assert every *other* org's signings are byte-identical (this is what proves the per-bid stream keying is right); 40–70 moves per season.

**8 — `season/offseason.ts`.** Season tick, expiry wave, retirements, folds and backfill, debut cohort, ladder reset, patch.
*Tests:* nobody under 25 and contracted retires; population invariants hold across 20 seasons; ★ `offseason.golden`; **`world.twentySeasons`** — 20 seasons on 3 seeds asserting: legacy stays ≤ 92, at least 3 orgs alive from year 1 survive to year 20 (a dynasty *can* exist), at least 12 distinct orgs have held a T1 seat (the league is not static), and median org lifespan is 9–16 seasons.

**9 — the two calibration tests.** `fast.calibration` (§9): `|E[fast pA] − E[full pA]| ≤ 0.02` over 100 pairs × 200 sims. `orgEdge.identity`: assert `MAX_ORG_EDGE_POINTS === DRAFT_GAIN * 0.65` and that a maxed dynasty beats a fresh promotee **with an identical cloned roster** in 57–62% of 10,000 seeded Bo1s — and that with the newcomer's roster gelled 20 weeks and the dynasty's reset, the newcomer is the favourite.

**10 — `pipeline.development`.** ★ The §7.3 table: signed-at-17 reaches CA 86–92 by peak; the same seed left on the ladder reaches 72–79 and plateaus; the P(CA ≥ 85 by 24) distribution by signing band is monotone decreasing and never zero.

**11 — the prototype port.** `sim.js` gains `schedule`, `playoffs`, `season`, `market`, `offseason`. `template.html` deletes `STAGES`/`stage()`/`stageIndex`/`stageWins`/`makeOpponent()` and gains `G.season`/`G.orgs`/`G.market`, `renderSeason`, the standings table, the contract lane, the Recruit source switcher, the negotiation sheet and the bid modal. `matchday.js` changes in exactly one place: `oppTeam()` reads a persistent org's roster instead of a generated one.

**12 — the Season hub polish.** The Run strip, the wage strip, the laurel, the Desk column, the org sheet with the Spine.

---

## 13. Where the design fights the code

Six places, and what to do about each.

1. **`SEASON_WEEKS = 40` vs a 52-week year.** A genuine contradiction between two shipped modules. Fixed in build step 1, with a test that binds them together permanently.

2. **`Org` has no roster, and it must not gain one.** `advanceOrgSeason` is pure and returns a new `Org`; adding a mutable roster would either break that purity or force a deep clone every season. Rosters live in `World.rosters` keyed by `orgId`. Note that `prototype/src/sim.js`'s `seedOrg` port *already* bolts `roster` and `contracts` onto the org object — **that divergence must be undone during the port** or core and prototype will drift.

3. **`generateLadderEntity` keeps the whole `Player` inline** (`hidden.player`). At 150 prototype entities that is fine and the module says so. At the core's 640-per-region it is ~1.5 MB. Do not optimize it in this build; the discard-and-reseed-from-`genSeed` path is LATER, and it needs a test asserting `soloAbility(materialize(e)) === e.hidden.soloAbility` exactly before it can be trusted.

4. **`orgEffects().patchFamiliarity` returns raw `analytics`, but the fast path wants a blended `drafting`.** If both `coaching` and `analytics` were fed as independent additive terms the org edge would reach 5.0 and break `MAX_ORG_EDGE_POINTS`. The fix is one adapter, and it must be the *only* place a `FastSide` is built from an `Org`:
   ```ts
   export function fastSideFromOrg(org: Org, bd: TeamBreakdown, metaFit: number): FastSide {
     return {
       orgId: org.id,
       strength: bd.strength,
       drafting: clamp100(0.65 * org.coaching + 0.35 * org.analytics),
       metaFit,                                  // a ROSTER property (pool vs patch), not an org one
       consistency: meanConsistency(bd),
     };
   }
   ```
   `metaFit` must stay a roster property. The moment analytics is allowed to add to it, the bound is gone.

5. **`resolveBids` assumes one shared `tier`** for all bidders, but a bidding war spans tiers (a T1 org poaching from T2). Call it once per bidder's own tier and take the argmax utility across the results, or widen the signature to `Record<orgId, PyramidTier>`. Prefer widening — it keeps the determinism (sorted by utility then `orgId`) in one place.

6. **The prototype's `advanceWeek` has no notion of a blocking decision.** Today it always advances. It must open with the unanswered-bid guard (§10.2) — otherwise the anti-silent-theft rule in §6.5 is unenforceable, and a player can leave without the manager ever being asked. That is the one failure mode this whole update must not have.
