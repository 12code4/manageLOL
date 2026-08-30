# manageLOL — Sponsorships & Economy

*Systems deep-dive (`docs/05-systems/`). Sponsor tiers, deal structure (base + performance clauses + obligations), the offer pipeline driven by reputation/brand/results, and how sponsor income sits in the cash-flow model. Expands `01-game-design.md` §14.*

> Read alongside: [`competition-pyramid.md`](competition-pyramid.md) (bigger stage → bigger sponsors) and [`players-and-attributes.md`](players-and-attributes.md) (`starPower`/`streamAppeal`/`marketability`).

---

# Sponsorships & Sponsor Economy (Design Spec)

*Systems deep-dive, part of `docs/05-systems/`, expanding `01-game-design.md` §14 (Economy). Implemented in `packages/core/src/economy` (sponsor templates, offer generation, deal state, clause evaluation) and consumed by the monthly cash-flow model. Reads player brand attributes verbatim from the taxonomy (`starPower`, `streamAppeal`, `fanbase`, `marketability`, `mediaHandling`) and `Org.reputation` / `Org.brand`. All randomness on a new named stream `sponsors`; clause/pull-out narrative on `events`. Fully fictional sponsor content lives in `packages/data` (`sponsor-templates.json`), never hardcoded in `core`.*

> Read alongside: `players-and-attributes.md` (brand attrs, `state.fatigue/morale`), `competition-and-economy.md` (cash flow, league revenue share, prize money), and the event system (`§9 drama engine`). Currency is the abstract in-game unit `$` (credits); all figures are tunable constants named in §0.

---

## 0. Constants & scales

| Constant | Value | Meaning |
| --- | --- | --- |
| `CLAUSE_LEVERAGE` | `2.5` | Annual performance-bonus pool = foregone guaranteed money × 12 × this. The core negotiation gamble. |
| `BASE_FRACTION_FLOOR` | `0.40` | Minimum guaranteed fraction a manager may push a deal to. |
| `QSCALE_A`, `QSCALE_B` | `0.60`, `0.008` | `qualityScaler(OSS) = QSCALE_A + QSCALE_B*OSS` → OSS 0→0.60, 50→1.00, 100→1.40. |
| `STAGE_INTL` | `1.15` | Payout boost if org attended a mid-season international / Worlds within the last year. |
| `STAGE_CHAMP` | `1.30` | Payout boost if org is the reigning regional champion (supersedes `STAGE_INTL`). |
| `BASE_PULLOUT` | `0.002` | Monthly baseline sponsor pull-out probability. |
| `K_FANFIT_SIGN` | `0.5` | Org-fanbase points gained/lost on signing = `brandFit * this`. |
| `K_FANFIT_DRIFT` | `0.03` | Monthly org-fanbase drift = `brandFit * this`. |
| `TARGET_OBLIG_HOURS` | `40` | Weekly team training-hour budget obligations draw from (matches GDD §8). |

**Slot prestige** (payout multiplier by physical jersey/content location):

| Slot | `chestMain` | `chestSecondary` | `sleeveLeft`/`sleeveRight` | `backJersey` | `shorts` | `contentStudioA` | `contentStudioB` | `namingRights` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| prestige | 1.00 | 0.55 | 0.35 | 0.28 | 0.22 | 0.60 | 0.40 | 0.80 |

Content-studio slots additionally scale by roster `streamAppeal` (see §4); they are **gated by the content-studio facility** (GDD §11). `namingRights` is gated by org-owned arena (later phase).

**Slot inventory by tier** (which slots exist to sell):
- **Amateur / open circuit:** `chestMain` only (1 slot).
- **Second division:** `chestMain`, `chestSecondary`, `sleeveLeft` (3).
- **Top league:** all six jersey slots + `contentStudioA/B` (facility-gated) + `namingRights` (arena-gated).

**Region profiles** (fictional, IP-safe — 4 majors + rest-of-world per GDD §12):

| RegionId | Flavor | `marketSize` (payout ×) | `prestige` (0–100, feeds OSS) |
| --- | --- | --- | --- |
| `TX` (Tianxia) | CN-analogue, richest | 1.50 | 90 |
| `BK` (Baekje) | KR-analogue, most prestigious | 1.25 | 95 |
| `FR` (Frontier) | NA-analogue, rich, lower prestige | 1.30 | 72 |
| `CO` (Concordia) | EU-analogue, balanced | 1.15 | 80 |
| `OL` (Outlands) | rest-of-world | 0.65 | 45 |

---

## 1. Sponsor tiers & archetypes

Sponsors are **data**: each is a `SponsorTemplate` in `packages/data`. A template belongs to a tier (payout band + eligibility gate) and an archetype (flavor, brand-fit, risk, obligation shape, exclusivity). Fictional brand names are drawn from a name pool at worldgen; the ones below are illustrative seeds.

| Tier | `payoutBand` ($/mo, base) | `minOSS` | `minOrgTier` | Who appears |
| --- | --- | --- | --- | --- |
| 1 Hyperlocal | 1,200 | 8 | amateur | garage/amateur orgs |
| 2 Product/regional-small | 12,000 | 30 | amateur→2nd div | rising amateurs, 2nd div |
| 3 Major regional | 55,000 | 50 | 2nd div→top | established 2nd div, top league |
| 4 National/volatile-rich | 160,000 | 65 | top league | top league |
| 5 International giant | 380,000 | 78 | top league + intl | Worlds-caliber orgs |

`payoutBand` is the monthly guaranteed spend at `chestMain`, `marketSize 1.0`, `OSS 50`, base fraction 1.0. Eligibility gates (`minOSS`, `minOrgTier`) are why an amateur org **only ever sees the café** — the offer pipeline (§3) filters before generating.

### Archetypes (flavor · brand-fit · risk)

- **`localBusiness`** ("Beans & Bytes Café") — *Tier 1.* Wholesome, tiny, sticky. `brandFit +8`, `volatility 3`, `retentionBias 0.9` (loyal to their local team). One light media obligation. The lights-on money of the amateur scene.
- **`peripheral`** ("Vantage Peripherals") — *Tier 2–3.* Product-fit hardware brand; pays part cash, part **in-kind gear** (`inKindMonthly`, a facilities/fatigue-recovery micro-boost). `brandFit +4`, `volatility 10`. Prefers `sleeve`. Values competitive results over fame.
- **`apparel`** ("Apex Athletic") — *Tier 2–3.* Jersey manufacturer; wants `Org.brand` + fanbase. `brandFit +6`, `volatility 8`. Often takes `chestSecondary`.
- **`telecom`** ("Meridian Mobile") — *Tier 3.* Stable national utility; low drama, wants *consistency* (win-rate clauses over trophies). `brandFit +6`, `volatility 12`, `retentionBias 0.8`.
- **`energyDrink`** ("Voltaic SURGE") — *Tier 2–4.* Flashy, youth-brand, chases `streamAppeal`. Big payout **but heavy content obligations** that cost player hours/fatigue. `brandFit −6`, `volatility 55`, `exclusivityGroup 'energyDrink'`, `retentionBias 0.5` (fickle). `requiresStar` on content.
- **`cryptoBetting`** ("AcePlay Books" / "LedgerX") — *Tier 4–5.* Rich, huge signing bonuses, base-heavy. **Volatile and reputationally toxic:** `brandFit −22`, `volatility 80`, `exclusivityGroup 'betting'`, `conflictsWith ['familyGiant']`, morality clause (a player scandal can trigger their pull-out). The "easy money, real risk" play.
- **`techGiant`** ("Nimbus Cloud") — *Tier 5.* Prestige international sponsor; largest, safest, image-lifting, sticky. `brandFit +15`, `volatility 8`, `retentionBias 0.85`, `conflictsWith ['betting']`. **Conservative negotiator** — prefers clause-heavy deals to protect its brand spend, and demands top-league + international presence.

```ts
interface SponsorTemplate {
  id: string;
  archetype: 'localBusiness'|'peripheral'|'apparel'|'telecom'|'energyDrink'|'cryptoBetting'|'techGiant';
  tier: 1|2|3|4|5;
  namePoolId: string;                 // fictional brand names, worldgen-drawn
  payoutBand: number;                 // $/mo baseline (see table)
  minOSS: number; minOrgTier: OrgTier; minBrand?: number;
  brandFit: number;                   // -30..+30  (morality/image fit → fanbase)
  volatility: number;                 // 0..100    (pull-out / market-shock proneness)
  retentionBias: number;              // 0..1      (renewal stickiness)
  preferredSlots: SlotType[];
  exclusivityGroup?: string;          // one active deal per group per org
  conflictsWith?: string[];           // groups this sponsor refuses to co-sponsor with
  obligationProfile: ObligationSpec[];// scaled into concrete Obligations at offer time
  negotiationStance: 'flexible'|'firm'|'stubborn';
  preferredBaseFraction: number;      // sponsor's ideal base/clause split
  clauseMenu: ClauseSpec[];           // which triggers it offers
}
```

---

## 2. Deal structure

```ts
type SlotType =
  | 'chestMain'|'chestSecondary'|'sleeveLeft'|'sleeveRight'|'backJersey'|'shorts'
  | 'contentStudioA'|'contentStudioB'|'namingRights';

interface SponsorDeal {
  id: string; templateId: string; orgId: string;
  brandName: string;                  // resolved fictional name
  tier: 1|2|3|4|5; slot: SlotType;
  exclusivityGroup?: string; conflictsWith?: string[];
  baseMonthly: number;                // guaranteed $/mo
  inKindMonthly?: number;             // e.g. peripheral gear (non-cash value)
  signingBonus: number;               // one-time on signWeek
  term: { startWeek: number; lengthWeeks: number };   // duration: 26 / 52 / 104 / 156
  clauses: PerformanceClause[];
  obligations: Obligation[];
  brandFit: number; volatility: number;
  renewalState: { evaluated: boolean; willRenew: boolean; clauseHits: number; clauseTotal: number };
}

interface PerformanceClause {
  trigger:
    | { kind:'placement'; scope:'league'|'international'|'worlds';
        result:'attend'|'qualify'|'top4'|'reachFinal'|'winSplit'|'reachSemi'|'winWorlds' }
    | { kind:'winRate'; scope:'split'; threshold:number }        // e.g. 0.60
    | { kind:'promotion' }
    | { kind:'brandKPI'; metric:'avgViewers'|'fanbaseGrowth'; threshold:number };
  bonus: number;                      // one-time $ paid when hit
  isPenaltyOnMiss?: boolean;          // clawback = bonus*0.5 if unmet
  nonRenewalOnMiss?: boolean;         // sponsor walks at term end if unmet
  evaluated?: boolean; hit?: boolean;
}

interface Obligation {
  kind:'mediaDay'|'contentPiece'|'appearance'|'jerseyReveal';
  perMonth: number;
  playerHours: number;                // drawn from TARGET_OBLIG_HOURS before training allocation
  fatiguePerEvent: number;            // added to featured players' state.fatigue
  moraleDelta: number;                // per event, per featured player
  requiresStar?: boolean;             // must feature highest-starPower starter
}
```

**Base + clauses (the negotiation gamble).** A sponsor commits a `dealBudget` (§3). The manager slides `baseFraction ∈ [0.40, 1.0]`:

```
baseMonthly            = dealBudget * baseFraction
foregoneMonthly        = dealBudget * (1 - baseFraction)
clauseBonusPool_annual = foregoneMonthly * 12 * CLAUSE_LEVERAGE      // distributed across selected clauses by weight
```
Because `CLAUSE_LEVERAGE = 2.5`, forgoing guaranteed money is **+EV only if you hit >40% of the clause pool** — a legible gamble that rewards confident, well-scouted managers and punishes overreach. Base-heavy is the safe amateur choice; clause-heavy is the ambitious top-org play.

**Obligations = a real time tradeoff.** Obligation `playerHours` are subtracted from the weekly `TARGET_OBLIG_HOURS` budget **before** the manager allocates scrims/soloq/VOD (GDD §8) — a content-heavy energy-drink deal literally eats scrim time. `fatiguePerEvent` stacks onto `state.fatigue` (scaled by `burnoutProneness`); `moraleDelta` is usually mildly negative, **modulated by the featured player's attributes**:

```
effFatigue = fatiguePerEvent * (1 - 0.4*mediaHandling/100)
effMorale  = moraleDelta
             + 0.03*(marketability - 50)          // marketable players enjoy the spotlight
             - 0.02*(introversion - 50)            // introverts hate content days
             + 0.02*(mediaHandling - 50)
contentBrandGain = base * (0.5 + 0.5*streamAppeal/100)   // content pays off more with appealing rosters
```
So a marketable, media-savvy star turns obligations into fanbase/brand upside; forcing a high-`introversion` prodigy into a content quota bleeds morale and can trigger a drama event.

**Brand-fit / morality → fanbase.** On signing: `Org.fanbase += brandFit * K_FANFIT_SIGN`; ongoing monthly `Org.fanbase += brandFit * K_FANFIT_DRIFT`. A café (`+8`) nudges fanbase up; a betting chest (`−22`) is an immediate `−11` fanbase hit plus a monthly drag and a raised chance of a fan-backlash event.

---

## 3. Attraction & the offer pipeline

Offers are generated on scheduled ticks: **preseason**, each **transfer window**, and on **major result milestones** (promotion, first Worlds attendance). The generator is a pure function of org state on the `sponsors` stream.

**Org Sponsor Score (OSS, 0–100)** — how attractive the org is to sponsors:

```
sTop2plusRest: for each starter compute  s_i = 0.7*starPower_i + 0.3*streamAppeal_i,  sort desc
rosterStarIndex = 0.5*s[0] + 0.3*s[1] + 0.2*mean(s[2..])        // marquee-weighted, 0..100
resultsScore    = normalized recent placement/points, 0..100

OSS = clamp100( 0.30*Org.reputation + 0.25*Org.brand
              + 0.20*rosterStarIndex + 0.15*resultsScore
              + 0.10*region.prestige )
```

**Deal budget for a candidate** (template × org × slot):

```
qualityScaler = 0.60 + 0.008*OSS                                 // 0.60..1.40
stageBoost    = reigningRegionChamp ? 1.30 : attendedIntlLastYr ? 1.15 : 1.00
dealBudget(template, slot) =
    template.payoutBand
  * region.marketSize
  * qualityScaler
  * stageBoost
  * slotPrestige(slot)
  * (slot ∈ contentStudio ? (0.5 + 0.5*rosterStreamAppeal/100) : 1)
```
`stageBoost` is the explicit **"bigger stage → bigger offers"** beat: reaching the international stage measurably raises every offer.

**Generating the offer set:**

```ts
function generateSponsorOffers(org, world, windowId): SponsorOffer[] {
  const rng = world.rng.stream(`sponsors:${org.id}:${windowId}`);
  const OSS = computeOSS(org, world);
  const openSlots = slotInventory(org).filter(s => !org.activeDeals.some(d => d.slot === s));
  const eligible = world.data.sponsorTemplates.filter(t =>
       OSS >= t.minOSS && orgTierRank(org) >= tierRank(t.minOrgTier)
    && (t.minBrand == null || org.brand >= t.minBrand)
    && !violatesExclusivityOrConflict(t, org.activeDeals));           // exclusivity + morality conflicts
  // deterministic count: attractiveness + open inventory
  const expected = 0.5 + OSS/22 + openSlots.length*0.25 + (org.attendedIntlLastYr ? 0.5 : 0);
  const n = clamp(Math.round(expected + rng.jitter(-0.5, 0.5)), 0, openSlots.length*2);
  // draw templates weighted by fit = payoutBand-rank × archetypeAffinity(org.brandProfile),
  // assign each its best available preferredSlot; emit a SponsorOffer with a starting negotiation stance
  return drawWeighted(eligible, n, rng).map(t => buildOffer(t, org, pickSlot(t, openSlots), OSS, rng));
}
```
Sort every draw and iteration with explicit tiebreakers (template id) — no reliance on Map/Set order (determinism rule).

---

## 4. Negotiation, slots, exclusivity

**Negotiation loop** (mirrors contract negotiation, GDD §7). The manager submits `{ baseFraction, termLengthWeeks, clauseSelection, slot }`; the sponsor's agent evaluates against `template.negotiationStance` and `preferredBaseFraction`, with a patience of 2–4 rounds:

- `flexible` (café, apparel): accepts a wide band; concedes toward the manager.
- `firm` (telecom, peripheral): counters `baseFraction` halfway toward its preferred; may drop a clause.
- `stubborn` (techGiant): holds near `preferredBaseFraction` (clause-heavy) and near-fixed obligations; walks if pushed past tolerance.

Acceptance when the offer is within the agent's tolerance of its target utility; walk-away after patience is spent (offer expires from the inbox).

**Concurrent slots.** An org sells one deal **per slot**; inventory grows with tier and facilities (§0). A top-league org can run all six jersey slots plus two content-studio deals — but obligation hours across all deals are summed against the single weekly budget, so stacking content-heavy deals is self-limiting (fatigue + lost scrim time).

**Exclusivity & conflicts.** `exclusivityGroup` blocks a second deal in the same category (no two energy drinks, no two betting books). `conflictsWith` blocks cross-category pairings (a `techGiant` refuses to co-sponsor a team carrying a `betting` deal, and vice-versa) — signing one **withdraws** eligible offers from the conflicting group for the life of the deal.

---

## 5. Risk & events

All on the `events`/`sponsors` streams; each surfaces as an inbox item with choices (GDD §9).

**Missing a performance clause.** At each competition milestone, clauses are evaluated deterministically. Unmet → no bonus; `isPenaltyOnMiss` → `clawback = bonus*0.5` deducted; `nonRenewalOnMiss` → `renewalState.willRenew = false`. `clauseHits/clauseTotal` accumulate and feed renewal (§below).

**Scandal / market-shock pull-out.** Monthly, per active deal:
```
P_pullout = BASE_PULLOUT + (volatility/100)*0.02 + marketShock(month) + scandalTrigger
```
`marketShock` is a world-level roll (a crypto crash, betting-regulation wave) that spikes an entire category that month. `scandalTrigger = +0.5` if a rostered player fired a drama/scandal event this month and the deal has a morality clause. On pull-out: deal terminates, forfeit remaining base and unpaid clauses; `Org.fanbase += -brandFit*0.3` (dropping a toxic sponsor *recovers* some fanbase; losing a beloved one hurts). The inbox event offers *fight it / PR-spin (uses best `mediaHandling`) / accept* — a successful spin can salvage part of the remaining term. A `cryptoBetting` deal (`volatility 80`) carries ≈1.8%/mo ≈ ~20%/yr pull-out risk; a `techGiant` (`volatility 8`) ≈0.4%/yr.

**Bidding war.** When >1 eligible offer targets the same slot in a window, emit a `sponsorAuction` event. The manager picks one; a rejected `firm`/`stubborn` premium suitor may issue **one** counter (`baseMonthly ×1.10–1.20`) via a `sponsors` roll. This is where the rich-but-volatile betting book out-guarantees the safe giant for `chestMain` — the signature economy tension.

**Renewal.** At `term end − 8 weeks`:
```
brandGrowth  = clamp01((Org.brand_now - Org.brand_atSign)/40)
clauseHitRate = clauseHits / max(1, clauseTotal)
perfMult     = 0.70 + 0.6*clauseHitRate + 0.3*brandGrowth        // ~0.70..1.60
renewalBudget = dealBudget_current * perfMult * (0.9 + 0.2*retentionBias)
```
Over-performers get richer renewals from sticky sponsors; a `nonRenewalOnMiss` flag or a fickle `energyDrink` (`retentionBias 0.5`) lets the deal lapse, freeing the slot back into the pipeline.

---

## 6. Cash-flow integration & income share

Sponsor income lands in the monthly cash-flow model (`competition-and-economy.md`):

```
income = leagueRevShare + Σ deal.baseMonthly + clauseBonusesTriggeredThisMonth
       + merch(fanbase,results) + contentIncome + prizeMoney(amortized) + playerSales
costs  = salaries + staff + facilities + travel/bootcamp + fees + buyouts
```
`baseMonthly` is smooth; `signingBonus` is lumpy on `signWeek`; clause bonuses are lumpy at split/international milestones (a good Worlds run delivers a cash spike). `inKindMonthly` (gear) does **not** hit cash — it offsets facility/fatigue cost lines instead.

**Target sponsor share of income by tier** (tuning goal for the balance harness):

| Stage | Sponsor share of income | Absolute sponsor base | Note |
| --- | --- | --- | --- |
| Amateur | ~40–60% (of a tiny total) | $1–3K/mo | Café keeps the lights on; org still bleeds owner capital until it places. |
| Second division | ~35–45% | $15–60K/mo | League stipend + prizes share the rest. |
| Top league (mid-table) | ~30% | $150–350K/mo | **League revenue share** dominates — the transformative step of promotion. |
| Top league (star-driven) | ~45–55% | $600K–1.2M/mo base (more in bonus years) | Star brand pays the bills — the aspirational fantasy. |

This encodes the design tension: promotion's revenue share makes sponsors *relatively* smaller, but a manager who builds brand and stars can push sponsors back to majority income — funding trophies on marketing money rather than results alone.

---

## 7. Worked examples

### Example A — an amateur org's first deal

Org **"Garage Collective"**, region `FR` (`marketSize 1.30`, `prestige 72`), open circuit. `reputation 22`, `brand 15`. Starters' brand is low: best `s0 = 0.7*30 + 0.3*25 = 28.5`, `s1 = 20`, rest mean `15`. Won a couple of weekend tournaments → `resultsScore 30`.

```
rosterStarIndex = 0.5*28.5 + 0.3*20 + 0.2*15 = 14.25 + 6 + 3 = 23.25
OSS = 0.30*22 + 0.25*15 + 0.20*23.25 + 0.15*30 + 0.10*72
    = 6.6 + 3.75 + 4.65 + 4.5 + 7.2 = 26.7
```
Eligibility: only **Tier 1** passes (`minOSS 8`); the peripheral (`minOSS 30`) does **not**. One offer: the local café, `chestMain` (the org's only slot).

```
qualityScaler = 0.60 + 0.008*26.7 = 0.814
dealBudget = 1,200 * 1.30 * 0.814 * 1.00(stage) * 1.00(chestMain) ≈ $1,270/mo
```
The manager nudges `baseFraction 0.85` to grab one clause:
```
baseMonthly = 1,270 * 0.85 ≈ $1,080/mo
foregone    = 1,270 * 0.15 = 190.5 ;  clausePool_annual = 190.5*12*2.5 ≈ $5,715
→ one clause: {promotion → reach second division}, bonus ≈ $5,715 (one-time)
signingBonus = 1 month ≈ $1,080
```
Obligations: `mediaDay ×1/mo` (photos at the café), `playerHours 4`, negligible fatigue, `moraleDelta +1` (local-hero fun). `brandFit +8` → on sign `Org.fanbase += 4`, `+0.24/mo` after.

*Cash flow:* costs ≈ $6,000/mo (five semi-pro stipends ~$900 + $1,500 misc). Income ≈ café base $1,080 + amortized open-circuit prizes ~$800 = **$1,880/mo → net −$4,120/mo**, covered by owner seed capital. Sponsor is **~57% of income** but tiny in absolute — it covers ~18% of costs. The fantasy is exact: the café keeps the lights on, but you must *place* to survive, and the promotion clause dangles a $5.7K lifeline.

### Example B — a top-league, star-driven deal with a bidding war

Org **"Meridian Vanguard"**, region `TX` (`marketSize 1.50`, `prestige 90`), top league, Worlds semifinalist last year → `stageBoost 1.15`. `reputation 78`, `brand 72`. Stars: `s0 = 0.7*88 + 0.3*80 = 85.6`, `s1 = 0.7*70 + 0.3*62 = 67.6`, rest mean `43.5`. `resultsScore 82`.

```
rosterStarIndex = 0.5*85.6 + 0.3*67.6 + 0.2*43.5 = 42.8 + 20.28 + 8.7 = 71.78
OSS = 0.30*78 + 0.25*72 + 0.20*71.78 + 0.15*82 + 0.10*90
    = 23.4 + 18 + 14.36 + 12.3 + 9 = 77.06
qualityScaler = 0.60 + 0.008*77.06 = 1.2165
commonMult = marketSize 1.50 * qualityScaler 1.2165 * stageBoost 1.15 = 2.0985
```

**`chestMain` bidding war — betting book vs tech giant** (`sponsorAuction` event):

- **AcePlay Books** (`cryptoBetting`, band 300K): `dealBudget = 300,000 * 2.0985 * 1.00 = $629,550/mo`. Offers `baseFraction 1.0` (base-heavy) → **$629,550/mo guaranteed + $1.26M signing bonus**, `brandFit −22`, `volatility 80`, `conflictsWith techGiant`.
- **Nimbus Cloud** (`techGiant`, band 380K): `dealBudget = 380,000 * 2.0985 = $797,430/mo`. Stubborn → `baseFraction 0.75`: base **$598,073/mo**, `foregone 199,358/mo`, `clausePool_annual = 199,358*12*2.5 = $5,980,740`. `brandFit +15`, `volatility 8`, `conflictsWith betting`.

The decision is legible: AcePlay out-*guarantees* Nimbus ($629.5K vs $598.1K) with a massive signing bonus — but at `−22` fanbase, ~20%/yr pull-out risk, and it **blocks the giant entirely**. The manager, confident in the roster, takes **Nimbus** for the brand lift and the clause upside. Clause pool distributes:

| Clause | weight | bonus |
| --- | --- | --- |
| Win regional split | 0.35 | $2,093,259 |
| Qualify Worlds | 0.30 | $1,794,222 |
| Reach Worlds semifinal | 0.20 | $1,196,148 |
| Win Worlds | 0.15 | $897,111 |

If they win the split + qualify + reach semis (not win): bonuses = **$5,083,629** that year. Nimbus annual = base $7.18M + $5.08M = **$12.26M**. Had they taken `baseFraction 1.0`, it'd be a flat $9.57M with no upside; had they flopped, only $7.18M — worse than safe. The gamble paid, and the post-season screen shows exactly why. Obligations: `mediaDay ×2/mo` + `contentPiece ×1/mo`, `requiresStar` — but the star's `mediaHandling` and `marketability` turn those into fanbase gains.

**The rest of the jersey stack** (each `dealBudget = band × 2.0985 × slotPrestige`):

| Slot | Sponsor | dealBudget/mo | baseFraction | base/mo | Notes |
| --- | --- | --- | --- | --- | --- |
| chestMain | Nimbus (giant) | 797,430 | 0.75 | 598,073 | +$5.98M/yr clause pool; brandFit +15 |
| chestSecondary | Meridian Mobile (telecom) | 55,000×2.0985×0.55 = 63,480 | 0.90 | 57,132 | win-rate clause; brandFit +6 |
| sleeveLeft | Voltaic SURGE (energy) | 160,000×2.0985×0.35 = 117,516 | 0.60 | 70,510 | $1.41M/yr clauses; brandFit −6; **heavy content obligations**; excl. energyDrink |
| sleeveRight | Vantage (peripheral) | 45,000×2.0985×0.35 = 33,051 | — | 33,051 | +~$8K/mo in-kind gear; brandFit +4 |
| back+shorts | minor sponsors | — | — | ~20,000 | filler |
| contentStudioA | streaming platform | scaled by streamAppeal | — | ~60,000 | fanbase growth; adds to obligation load |

Sponsor **base total ≈ $838,750/mo** (plus lumpy clause bonuses).

*Monthly cash flow (good year):* income ≈ league revshare $520K + sponsor base $839K + merch $180K + content $90K + amortized prizes $110K = **$1.739M/mo**; costs ≈ salaries $1.05M + staff $120K + facilities $70K + travel $60K + fees $40K = **$1.34M/mo → net +$399K/mo** before lumpy clause bonuses. Sponsor base is **48% of income**; folding in the ~$542K/mo amortized clause bonuses of a semifinal year pushes the sponsor line to **~60%**. This is the star-brand-pays-the-bills ceiling — and note the danger baked in: the sleeve energy deal and content-studio deal together consume a large chunk of the weekly `TARGET_OBLIG_HOURS`, so a manager who over-sells slots trades away scrim time and pushes stars toward burnout — a self-correcting economic pressure, not a free lunch.

---

*Determinism note:* every figure above is reproducible from `(orgState, seed)` via the `sponsors` stream; offer sets, auction counters, and pull-out rolls take explicit tiebreakers (template id, then slot prestige). Golden-seed tests should snapshot a generated org's full offer set at three stages (amateur / mid-table top / star org) so sponsor-income drift is caught by the 10-season balance harness alongside salary inflation.