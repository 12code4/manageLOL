# manageLOL — Competition Pyramid, Franchising & Progression

*Systems deep-dive (`docs/05-systems/`). The full "earn your seat" structure: local → regional → national → the top league (by promotion gauntlet OR franchise auction) → international events and Worlds, plus academy/minor leagues. Expands `01-game-design.md` §12.*

> Read alongside: [`sponsorships-and-economy.md`](sponsorships-and-economy.md) (the financial currency that gates franchising) and [`ranked-ladder.md`](ranked-ladder.md).

---

# Competitive Pyramid & Progression — Design Specification

*Slots into doc 01 as the full build-out of §12 ("Competitions & calendar"). Reconciles with the two-split calendar there and the `Competition`/qualification-edge sketch in doc 02 §5. Everything here is deterministic: competition draws resolve on the `competition` RNG stream, franchise auctions and AI bids on the `market` stream. All money values are base units in a single in-game currency, pre-region-multiplier, and tunable.*

---

## 0. Principles: two currencies gate the climb

Progression is governed by **two org-level resources that must both be earned**, which is what makes "earn your seat" multi-path rather than a single money grind:

- **`reputation` (0–100)** — sporting/competitive standing. Earned by *placing* in competitions; decays with inactivity/relegation. Gates *entry eligibility* to higher tiers and *scouting reach* (doc 01 §6). This is the "grind up" currency.
- **`cash` + `brand`** (existing, doc 01 §14/§9) — the financial + marketability axis. Gates *franchise buy-in* and *financial guarantees*. This is the "buy in" currency.

A tier can be reached by **maxing either axis**, or a blend:

```
Sporting path : local opens → regional circuit → national 2nd div → promotion gauntlet → TOP LEAGUE
Financial path: build cash + brand → win a franchise slot at auction → TOP LEAGUE
```

Reputation is stored on the org and mutated only through competition results:

```ts
interface OrgProgression {
  reputation: number;            // 0..100
  heldSlots: HeldSlot[];         // league memberships (promotion or franchise)
  qualifiedInto: CompetitionId[];// events seeded for the current cycle
  championshipPoints: number;    // Worlds-race points, reset each year
}
```

**Reputation gain** from any result is diminishing against a per-competition ceiling, so a top-league org gains nothing from farming amateur opens:

```
repGain = baseRep(placement, comp.repTier) * max(0, 1 - org.reputation / repCap(comp.scope))
```

| `comp.scope` | `repCap` |
|---|---|
| local | 25 |
| regional | 45 |
| national | 68 |
| topLeague | 90 |
| msi (mid-season intl) | 96 |
| worlds | 100 |

`baseRep(placement, repTier)` by placement band (winner / finalist / semi / other-advancing):

| repTier | winner | finalist | semi | advanced |
|---|---|---|---|---|
| `local` | 6 | 3 | 1.5 | 0.5 |
| `regional` | 12 | 7 | 4 | 1.5 |
| `national` | 20 | 13 | 8 | 3 |
| `topLeague` | 30 | 20 | 12 | 5 |
| `international` | 40 | 28 | 18 | 8 |

**Reputation decay** (weekly tick, `growth` stream, applied only in the off-season window): `reputation -= IDLE_DECAY` where `IDLE_DECAY = 0.15/week` if the org played no official match in the prior split, else `0`. **Relegation** applies a one-time `-8` step; **franchise-slot loss** applies `-5`.

---

## 1. The pyramid as a graph

The whole competitive structure is a **directed graph**: `Competition` nodes, `QualEdge` edges. Nothing about "who advances where" is hardcoded in `core`; it is content data validated by schema (doc 02 §6), so a modder can rewire the pyramid.

```ts
type Tier = 1 | 2 | 3 | 4;                       // 1 = top league … 4 = local opens
type Scope = 'local' | 'regional' | 'national' | 'topLeague' | 'international';
type Format = 'singleElim' | 'doubleElim' | 'roundRobin' | 'swiss' | 'groups' | 'gauntlet';
type SeriesLen = 1 | 3 | 5;

interface Competition {
  id: CompetitionId;
  name: string;
  tier: Tier;
  scope: Scope;
  regionId: RegionId | null;                     // null only for international
  format: Format;
  series: SeriesLen | { regular: SeriesLen; playoff: SeriesLen };
  slots: number;                                  // participant count
  entry: EntryRule;
  cadence: CadenceRule;                           // §10 calendar anchors
  prize: PrizeTable;                              // placement → base money
  repTier: 'local'|'regional'|'national'|'topLeague'|'international';
  championshipPoints?: PointsTable;               // placement → Worlds points (T1 only)
  isFranchised: boolean;                          // top-league entry model; flips via §7 event
  tiebreak: TiebreakRule[];                       // explicit, deterministic ordering
}

type EntryRule =
  | { kind: 'open'; feeCash: number; minReputation?: number }   // pay & sign up
  | { kind: 'qualifiedFrom'; edges: QualEdgeId[] }              // arrive via edges only
  | { kind: 'membership'; slotType: 'promotion' | 'franchise' };// hold a league seat

interface CadenceRule {
  window: CalendarWindow;                         // e.g. 'split1Regular'
  weeks: [number, number] | 'recurringWeekends'; // absolute season weeks
  everyNWeeks?: number;                           // for recurring local/regional cups
}

interface QualEdge {
  id: QualEdgeId;
  from: CompetitionId;
  to: CompetitionId;
  trigger:
    | { kind: 'placement'; topN: number }
    | { kind: 'points'; topN: number }                     // championship-point standing
    | { kind: 'gauntletWinner' }
    | { kind: 'promRel'; challengerSlots: number; incumbentSlots: number };
  grants:
    | { kind: 'seedInto'; band: 'top' | 'mid' | 'playIn' }  // seed into `to`
    | { kind: 'membershipSlot'; slotType: 'promotion' };    // WIN a persistent league seat
  minReputation?: number;                                    // rep gate on the edge
}
```

Resolving the graph each cycle is a pure function: `resolveQualification(world, comp, standings, rng) → { seeds: OrgId[]; grantedSlots: HeldSlot[]; inbox: InboxItem[] }`. Edge order is sorted by `edge.id` for determinism; ties inside a competition break via `comp.tiebreak` (head-to-head → game-differential → seed → `rng.competition` coin as last resort).

---

## 2. Tier 4 — Local Opens (the starting point)

Amateur weekend brackets. Always available so the player *always* has something to enter and a rep drip from turn one.

- **Entry:** `{ kind: 'open', feeCash: 250 }`. No reputation minimum — this is the floor of the pyramid.
- **Format:** `singleElim`, Bo1 until the final (Bo3 final), 16 slots. Fast: resolves in one weekend tick.
- **Cadence:** `recurringWeekends`, `everyNWeeks: 1`. Runs every week the org has no higher official obligation; several parallel opens exist so entry is never blocked.
- **Prize (base):** winner 2,000 / finalist 800 / semis 300. Roughly covers a couple of entry fees plus a thin margin — you cannot get rich here, only *known*.
- **Reputation:** `repTier: 'local'`, capped at 25. Farming opens plateaus you fast — a deliberate push upward.
- **Qualifies upward:** edge `placement topN:1 → grants seedInto:{band:'playIn'}` of the **Regional Qualifier**. Winning locals is how a nobody buys a ticket to the regional stage.

## 3. Tier 3 — Regional Circuit & Regional Qualifiers

The proving ground between amateur and semi-pro. Two sub-structures:

**(a) Regional Cups** — monthly `doubleElim` Bo3, 24 slots.
- **Entry:** `{ kind: 'open', feeCash: 1000, minReputation: 8 }` — the first rep gate; you must have made noise in locals first.
- **Cadence:** `everyNWeeks: 4` across both splits.
- **Prize (base):** winner 20,000 / finalist 9,000 / semis 4,000.
- **Rep:** `repTier: 'regional'`, cap 45.

**(b) Regional Qualifier** — the funnel into the national second division. Two per year, anchored just before each split so promotion timing lines up with the league calendar.
- **Entry:** `{ kind: 'qualifiedFrom' }` fed by two edges: local-open winners (`playIn` band) and regional-cup top-4 (`mid`/`top` band). Higher-rep arrivals get better seeds — the grind compounds.
- **Format:** `swiss` (5 rounds Bo3) → top 4 to a `singleElim` Bo5.
- **Cadence:** weeks **1–2** (pre-Split-1) and weeks **20–21** (pre-Split-2, inside the mid-season window).
- **Qualifies upward:** edge `placement topN:2 → grants seedInto:{band:'promRel'}` — the top two earn a shot at the **National Championship's** promotion/relegation series (not automatic entry; you still must beat a T2 incumbent — §4).

## 4. Tier 2 — National Championship (the Second Division)

A real league: round-robin regular season, semi-pro salaries, modest but meaningful prize money, and the last tier reachable purely by open grinding.

```ts
// national championship, example values
{ tier: 2, scope: 'national', format: 'roundRobin',
  series: { regular: 3, playoff: 5 }, slots: 8,
  entry: { kind: 'membership', slotType: 'promotion' },
  repTier: 'national', isFranchised: false }
```

- **Entry:** hold a T2 **promotion slot** — won via the promotion/relegation series (below), lost by finishing bottom.
- **Format:** double round-robin Bo3 regular season (14 matches/team) → top-4 `doubleElim` Bo5 playoff, each split.
- **Cadence:** mirrors the top league one notch down — Split 1 (weeks 3–15), Split 2 (weeks 22–34), playoffs in the following two weeks.
- **Prize (base, per split pool):** 150,000 distributed 40/24/15/9/… by placement.
- **Rep:** cap 68 — winning the national title makes you a genuine promotion candidate but never a top-league org on rep alone.

**Promotion/Relegation series (T2 ↔ T3, and T1 ↔ T2 when the top league is *open*):**
Run at **mid-season (weeks 18–19)** and **year-end (weeks 44–45)** per doc 01 §12.
- The bottom `incumbentSlots` of the higher tier face the top `challengerSlots` of the qualifier below in a `gauntlet` (Bo5).
- Edge `promRel challengerSlots:2 incumbentSlots:2`: two national-championship slots are contestable each window. Winning grants `membershipSlot: 'promotion'`; the loser drops.

## 5. Tier 1 — Top League, Entry Model A: the Promotion Gauntlet

The top league is 10 teams, real revenue share (doc 01 §14). While it is **open** (`isFranchised:false`), the sporting path is the **Promotion Gauntlet**:

- **Format:** `gauntlet`, Bo5 ladder. The T1 relegation-zone teams (bottom 2 by combined championship points across both splits) defend against the **national championship's** top 2. Lowest-seeded challenger starts; winners climb the ladder; the two survivors hold T1 seats next year.
- **Cadence:** year-end, weeks **44–45** (immediately after Worlds slots are settled, so a Worlds run and a relegation fight never collide).
- **Entry gate:** the edge carries `minReputation: 40` — you cannot promote into the top league without a nationally-proven org, even if you win the bracket. This is the reputation floor that separates "good second-division team" from "top-league viable."
- **Grants:** `membershipSlot: 'promotion'` (a **sporting** seat — non-transferable, can be relegated).

Model A is the default early-career path and matches doc 01 §12 / doc 04's "promotion is sporting at first."

## 6. Tier 1 — Entry Model B: Franchising (the auction/application mechanic)

When the top league is **franchised** (`isFranchised:true`, from worldgen or via the §7 conversion event), promotion/relegation is gone. Seats are **permanent memberships bought at auction**, judged on money *and* sporting/brand merit.

```ts
interface FranchiseSlot {
  competitionId: CompetitionId;
  holderOrgId: OrgId | null;
  buyInTotal: number;                 // winning bid
  buyInRemaining: number;             // amortized debt still owed
  amortYears: number;                 // default 10
  revenueShareUnits: number;          // share of league central pool
  guaranteeBond: number;              // proof-of-funds held in escrow
}

interface FranchiseAuction {
  competitionId: CompetitionId;
  openSlots: number;
  reservePrice: number;               // floor buy-in
  requiredBond: number;               // minimum financial guarantee to bid
  weights: { financial: number; brand: number; sporting: number };  // sums to 1
  applicants: FranchiseBid[];
}

interface FranchiseBid {
  orgId: OrgId;
  cashOffer: number;                  // the buy-in bid
  guaranteeBond: number;              // >= requiredBond to be valid
  paymentPlan: 'lump' | 'amortized';  // amortized spreads cost but accrues interest
}
```

**Buy-in cost curve.** The reserve scales with what a seat is *worth* — the league's central revenue, region wealth, and how contested the auction is:

```
reservePrice   = K_FRAN * leagueAnnualRevenue * W_region
requiredBond   = 0.5 * reservePrice
K_FRAN = 1.5     // a seat floors at ~1.5x a year of league revenue
W_region ∈ [0.7, 1.5]   // region wealth multiplier, from content pack
```

**Auction scoring (deterministic).** Each valid bid is scored 0–1 on three normalized axes; the league seats the top `openSlots` by total score. Ties break by `cashOffer` desc, then `orgId`.

```
financialScore = 0.6 * normField(cashOffer) + 0.4 * min(1, guaranteeBond / requiredBond)
brandScore     = 0.5*(org.brand/100) + 0.5*(org.fanbaseIndex/100)
sportingScore  = 0.6*(org.reputation/100) + 0.4*(rosterCA_avg/100)
score          = wF*financialScore + wB*brandScore + wS*sportingScore
// normField(x) = (x - min) / (max - min) across the valid applicant field
```

Default `weights = { financial: 0.45, brand: 0.30, sporting: 0.25 }`. A rich unknown can buy in on `financial` alone; a beloved, competitively-proven org can win a seat with a **below-average bid** because `brand`+`sporting` carry it. Both are viable — the multi-criteria design the pillar demands.

**The overpay/debt risk.** `amortized` bids spread `buyInTotal` over `amortYears` at interest `r = 0.06`, deducted every year regardless of results:

```
annualDebtService = buyInTotal * r / (1 - (1+r)^(-amortYears))
```

If `annualDebtService + rosterCost > leagueRevenueShare + otherIncome`, the org runs a structural deficit → forced player sales → death-spiral (doc 01 §14). **AI orgs bid through the same scoring and the same solvency check** (doc 02 §4), so the auction field is emergent, not scripted.

*Worked example — 3 applicants, 1 open slot.* `reservePrice = 6.0M`, `requiredBond = 3.0M`, weights `{0.45,0.30,0.25}`.

| Org | cashOffer | bond | brand | fanbase | rep | rosterCA |
|---|---|---|---|---|---|---|
| RichCo | 11.0M | 4.0M | 30 | 25 | 22 | 55 |
| Fanbrand | 7.0M | 3.5M | 88 | 82 | 48 | 62 |
| YourOrg | 6.5M | 3.2M | 60 | 55 | 66 | 71 |

`normField(cash)`: RichCo 1.0, YourOrg 0.111, Fanbrand 0.222.
- RichCo: fin `0.6*1.0 + 0.4*min(1,4/3)=0.6+0.4=1.0`; brand `0.5*.30+0.5*.25=0.275`; sport `0.6*.22+0.4*.55=0.352` → **0.45*1.0 + 0.30*0.275 + 0.25*0.352 = 0.620**
- Fanbrand: fin `0.6*0.222+0.4*1.0=0.533`; brand `0.5*.88+0.5*.82=0.85`; sport `0.6*.48+0.4*.62=0.536` → `0.45*0.533+0.30*0.85+0.25*0.536 = 0.629`
- YourOrg: fin `0.6*0.111+0.4*min(1,3.2/3)=0.067+0.4=0.467`; brand `0.5*.60+0.5*.55=0.575`; sport `0.6*.66+0.4*.71=0.68` → `0.45*0.467+0.30*0.575+0.25*0.68=0.552`

**Fanbrand wins (0.629)** despite bidding 4M less than RichCo — brand + sport out-scored raw cash. RichCo, had it won, would carry `annualDebtService = 11M*0.06/(1-1.06^-10) ≈ 1.49M/yr`; if its revenue share is only ~2.5M and roster costs 2.0M, it is instantly ~1M/yr underwater — the "overpay and drown" trap made concrete.

## 7. The Franchise Conversion Event (the mid-career storyline)

A scheduled, seeded **world event** flipping a top league from open to franchised — mirroring the 2018-style real transition and turning the money game into a survival crisis (doc 01 §12, doc 04 parking).

- **Trigger:** worldgen rolls a conversion year on the `worldgen` stream per league, `convertYear ∈ [3, 6]` of the career (or never, per region flavor). Announced **two seasons ahead** via the inbox so the player can prepare a war chest.
- **Mechanic on conversion:**
  1. `competition.isFranchised → true`; all promotion slots dissolve; the promotion gauntlet edge is deleted.
  2. A `FranchiseAuction` opens for **all 10 seats**. Every current T1 org *and* qualified outside bidders (national champions with `reputation ≥ 55`, or any org with `cash ≥ reservePrice`) may apply.
  3. **Incumbency bonus:** current T1 orgs get `+0.10` to `sportingScore` (a "legacy" credit) — you are favored but not safe.
  4. Orgs that fail to win a seat are **relegated to T2** with a partial buy-in refund of the *reserve* if they bid but lost (`0.3 * reservePrice`), softening but not erasing the blow.
- **The storyline stakes:** a player who climbed via the sporting path can be **priced out of the league they earned into** unless they built cash/brand alongside wins — which retroactively justifies every sponsor deal and brand investment. This is the single biggest career inflection point and is designed as such.

## 8. International: Mid-Season & Worlds

Two cross-region events sit atop the graph (`regionId: null`).

**Mid-Season International (MSI-analogue).**
- **Entry:** `{ kind: 'qualifiedFrom' }`, edge from each region's **Split-1 playoff winner** (`placement topN:1`).
- **Format:** `groups` (two round-robin Bo1 groups) → `singleElim` Bo5 knockout.
- **Cadence:** weeks **18–21** (May), the mid-season window.
- **Prize (base):** 1,000,000 pool; **Rep:** `international`, cap 96.
- **Unlocks:** MSI title grants the org's region **+1 Worlds seat** for the year (the "your region earned an extra slot" beat) and the winning org itself `+2` championship points.

**Worlds.**
- **Entry:** by **championship points** accumulated across both splits, plus the **Regional Finals gauntlet** last-chance path.
  - `PointsTable`: T1 placements award points each split (champion 90 / finalist 60 / 3rd 45 / …). Points reset yearly.
  - Direct edges: `points topN:2 → seedInto:{band:'top'}` (group stage) and `topN:3 → seedInto:{band:'playIn'}`.
  - **Regional Finals** (weeks 37–38): a `gauntlet` Bo5 among the next-highest point-earners who missed direct qualification; winner takes the region's final seat (`gauntletWinner → seedInto:{band:'playIn'}`).
- **Format:** `swiss` (play-in + main Swiss stage, Bo1 rising to Bo3) → **`singleElim` Bo5 knockout** — the mountaintop (doc 01 §1).
- **Cadence:** weeks **39–43** (October).
- **Prize (base):** 2,000,000 pool; **Rep:** `international`, cap 100 — only a deep Worlds run pushes an org toward reputation 100.

*Worked example — Worlds points.* An org finishes Split-1 3rd (45 pts) and Split-2 finalist (60 pts) → 105 pts. If that is top-2 in region, direct `seedInto:'top'`; if 3rd, direct play-in; if 4th, it drops to the Regional Finals gauntlet — one bad best-of-five from missing Worlds. Legible and tense.

## 9. Minor / Academy Leagues

A parallel structure hanging off T1, feeding the ranked-ladder scouting pipeline (doc 01 §6, doc 04 parking → promoted to in-scope here).

```ts
interface AcademyLink { mainOrgId: OrgId; academyRosterId: RosterId; leagueId: CompetitionId; }
```

- **Who may field one:** any T1 org, and T2 orgs with `facilities.gamingHouse ≥ 2`. Requires a second roster (doc 01 §5's sub layer extended).
- **Academy League:** `roundRobin` Bo1, 10 slots (one per T1 org), cadence tracking the main-league splits one day offset so scouting reports arrive before main match day.
- **Ladder → Academy pipeline:** the region's solo-queue ladder (cheap/noisy scouting) surfaces prospects; signing them onto the **academy roster** is the low-cost incubation path. Academy minutes feed the growth tick's `minutesFactor` (taxonomy §6) at `0.7×` main-league weight — real development, but slower than a starting T1 seat.
- **Academy → Main promotion:** at any transfer window, an academy player may be **called up** to the main roster (free, no buyout). This is the develop-from-within alternative to buying talent, and interacts with import rules (an academy import counts against the main cap only when called up).
- **Prize/Rep:** token prize (base 40,000 pool); **no org reputation** (it accrues to the main org's brand at `0.1×`). Academy exists to *grow players and pipeline value*, not to climb the pyramid.

## 10. Calendar reconciliation (52-week season)

| Weeks | Window | T1 Top League | T2 National | T3 Regional | T4 Local | International |
|---|---|---|---|---|---|---|
| 1–2 | Preseason | roster lock | roster lock | Regional Qualifier (S1) | opens | — |
| 3–14 | Split 1 regular | RR Bo1/Bo3 | RR Bo3 | monthly cups | opens | — |
| 15–17 | Split 1 playoffs | Bo5 bracket | Bo5 bracket | — | opens | — |
| 18–21 | Mid-season | — | promo/rel series | Regional Qualifier (S2) | opens | **MSI** |
| 22–33 | Split 2 regular | RR Bo1/Bo3 | RR Bo3 | monthly cups | opens | — |
| 34–36 | Split 2 playoffs | Bo5 bracket | Bo5 bracket | — | opens | — |
| 37–38 | Regional finals | Worlds gauntlet | — | — | opens | qualifier |
| 39–43 | **Worlds** | (qualified orgs) | — | — | opens | **Worlds** |
| 44–45 | Year-end | **Promotion Gauntlet** (or Franchise Auction) | promo/rel series | — | opens | — |
| 46–52 | Off-season | free agency / awards | free agency | — | opens (weekly) | — |

Local opens run every week; a given org auto-skips any week it has a higher official obligation (resolved by `cadence` priority = lowest `tier` number wins the calendar slot).

## 11. Worked progression path — new org to a franchise seat

- **Year 1.** Amateur garage org (`reputation 4`, `cash 50k`). Enters **local opens** weekly; wins one in week 9 → `repGain = 6*(1−4/25)=5.04` → rep ~9. Rep ≥ 8 unlocks **regional cups**; a cup semifinal (week 12) → rep ~13. Enters the **Split-2 Regional Qualifier** (week 20), finishes top-2 → seeded into the **T2 promo/rel gauntlet**, wins a **national championship promotion slot**. End Year 1: rep ~24, T2 org — the doc 01 §3 "year-1 fantasy" delivered.
- **Years 2–3.** Competes in the **National Championship**; a split title pushes rep to ~50 (national cap 68). Year 3 the org finishes the national regular season 1st, enters the year-end **Promotion Gauntlet** (rep ≥ 40 gate cleared), and wins two Bo5s → **top-league promotion slot**. Now T1, drawing revenue share; rep climbs into the 60s across a top-league split.
- **Year 4 — the conversion crisis.** The inbox announced two seasons ago that the top league franchises this year. Promotion/relegation is abolished; a **10-seat auction** opens. The org — rep ~66, moderate cash, strong regional brand from its underdog run — applies with a `6.5M` bid + `3.2M` bond. Against a richer outside bidder, its `sportingScore 0.68` + incumbency `+0.10` + solid `brandScore` win a seat at a survivable buy-in (as in §6's example, brand+sport beat raw cash). The org that grinded up *and* banked brand keeps its seat; a pure-grind org with no war chest would be relegated here — exactly the tension the storyline is built to create.
- **Year 5+.** Secure in the franchised league, the org now races **championship points** toward **MSI** and **Worlds** — the endgame loop.

## 12. Determinism & testing notes

- Bracket seeding, group draws, and Swiss pairings resolve on `rng.competition`; franchise auctions and all AI bids on `rng.market`. No wall-clock, no `Math.random` (repo rule).
- Every `Competition.tiebreak` is an explicit ordered list; the final fallback is a seeded coin, never insertion order.
- The pyramid graph is content data (`packages/data`): a `validatePyramid` CLI gate asserts the graph is a DAG upward, every `qualifiedFrom` edge has a live source, `slots` conservation across promotion/relegation edges holds, and `minReputation` gates are monotonic by tier.
- **Golden-seed tests:** snapshot (a) a 10-season promotion-difficulty report — how many seasons a median 60-potential-roster org needs to reach T1 via each path; (b) a franchise-auction outcome for a fixed applicant field; (c) championship-point standings → Worlds qualification for a fixed season. These lock both determinism and progression *balance* (doc 02 §8).