# manageLOL — Game Design Document

*Status: initial planning draft. Everything here is a starting position, not a contract. Numbers are placeholders marked as tunable.*

---

## 1. The fantasy

You are the general manager of a professional League of Legends team. Not the star player, not the coach on stage — the person who built the roster, signed the contracts, chose the coach, and bet the org's bank account on a 17-year-old jungler nobody else scouted.

The emotional arc the game must deliver:

1. **Nobody → somebody.** Start in the amateur scene with a garage roster. Earning a spot in the top league should feel like a career achievement in itself.
2. **The roster is the story.** Players are people with form, egos, growth arcs, and short careers. The game generates stories: the superteam that imploded, the washed veteran's last run, the rookie who carried Worlds.
3. **The meta punishes the complacent.** Patches shift what's strong. A roster built for one meta can be stranded by the next. Adaptation is a manager skill.
4. **Money is oxygen.** Salaries, buyouts, and sponsor deals are the survival layer. Great managers win on a budget; rich orgs can still lose everything.

## 2. Design pillars

Use these to settle scope arguments. If a feature doesn't serve a pillar, cut it.

1. **Meaningful decisions, light micromanagement.** The player makes strategic calls (who to sign, who to start, what to drill, what to ban) — never per-minute clicking. Every screen should present a decision, not homework.
2. **Readable simulation.** Every result must be explainable from things the player can see: draft outcome, form, matchups, fatigue, synergy. Losses should teach; a black-box RNG loss teaches nothing.
3. **Earn your seat.** Progression is structural, not just numeric: amateur circuit → second division → top league → international events. Each tier changes the rules around you (revenue, scouting reach, poaching pressure).
4. **LoL-authentic, IP-safe.** The systems mirror real LoL esports (roles, drafts, imports, patches, split calendar, Worlds) but ship with a fictional world. Authenticity comes from structure, not names.

## 3. The player-facing loop

### Daily / weekly loop (the "week" is the heartbeat)

Time advances day by day; most days auto-advance until something needs you. A typical week:

- **Inbox first.** News, staff reports, player requests, offers. The inbox is the narrative engine (Football Manager model): most systems talk to you through it.
- **Set the week's training plan** (see §8): scrims vs solo queue vs VOD review vs rest.
- **Prep for match day:** opponent report from your analyst, pick your starting five (+ subs), set draft priorities and a game plan.
- **Match day:** pick/ban draft (interactive), then the simulated game presented as a readable timeline. Post-match: performance ratings, form/morale movement, press moment.
- **React:** injuries are rare in esports, but burnout, tilt, visa issues, and drama are not.

### Season loop (one calendar year)

| Window | What happens |
| --- | --- |
| Preseason | Roster building, sponsor renewals, bootcamp, roster lock |
| Split 1 regular season | Weekly league matches (Bo1/Bo3) |
| Split 1 playoffs | Bracket, Bo5s; winner → mid-season international |
| Mid-season | International event for split winners; promotion/relegation series in lower tiers |
| Split 2 regular season + playoffs | Higher stakes: Worlds qualification points |
| Regional finals | Last-chance qualifier for Worlds |
| **Worlds** | Group/Swiss stage → Bo5 knockout. The mountaintop. |
| Off-season | Contracts expire, free agency frenzy, buyout wars, retirements |

### Career loop (multi-season)

Players age and decline fast (careers ~17–27). Rosters must be rebuilt continuously. Org-level progression persists: league status, facilities, brand value, trophy cabinet, hall-of-fame history of your ex-players. Career milestones (first promotion, first title, first Worlds) are the long-term reward structure.

### First hour of play

Onboarding matters; sketch of the intended first session:

1. Create your manager, pick a starting region and difficulty (difficulty = starting tier + budget).
2. Default start: you take over a broke amateur org with 3 mediocre contracted players and 2 empty seats.
3. Immediate goals, surfaced by the board/inbox: fill the roster within budget before the open qualifier in 3 weeks; place top 4 to enter the second division.
4. First scouting decisions, first cheap signings, first training week, first draft, first match — all inside the first hour.
5. Year-1 fantasy: promotion to the second division. Years 2–4: reach the top league. Then: survive there, then win, then Worlds.

## 4. Players (the core asset)

### Roles

Standard five: **Top, Jungle, Mid, Bot (ADC), Support**. Players have a main role and off-role competencies (role-swaps are a real, risky development lever).

### Attributes

Displayed 0–100 to the user (exact precision hidden behind scouting, see §6). Grouped:

**In-game skill**
- *Mechanics* — raw outplay ceiling
- *Laning* — 1v1/2v2 phase strength
- *Teamfighting* — 5v5 execution
- *Macro* — map play, wave/objective decisions
- *Champion pool* — breadth; interacts with the meta system (§10)

**Mental**
- *Shotcalling* — in-game leadership (a team needs at least one strong voice)
- *Composure* — resistance to tilt, clutch factor in Bo5s
- *Consistency* — variance dial: streaky carry vs stable rock
- *Work ethic* — training gain multiplier
- *Ego* — drama generator; interacts with morale, role/champ requests, bench tolerance

**Hidden / slow-reveal**
- *Potential* — growth ceiling (scouting estimates it, never precisely)
- *Growth rate & decline age* — every career has a shape
- *Brand* — streaming/fan appeal; drives sponsor & merch income (a mediocre player with huge Brand can be worth signing — a very LoL-authentic tension)

**State (fast-moving)**
- *Form* — hot/cold streaks layered on top of skill
- *Fatigue* — accumulates from scrims/solo-queue grind; recovers with rest
- *Morale* — from results, role, salary fairness, drama events
- *Synergy* — pairwise chemistry with specific teammates (see §9)

### Identity

Name, age, nationality, region of residency, languages. **Nationality feeds import rules** (§7); **languages feed synergy ramp-up** (a roster without a shared language grows synergy slower — authentic and mechanically interesting).

### Growth & aging

- Growth from: official matches played (minutes matter → real tension between winning now and developing rookies), training focus, work ethic, coach quality.
- Peak roughly 20–24 (tunable per-player), then decline — first Mechanics, later game knowledge. Veterans can remain valuable as shotcallers/mentors even declining.
- Retirement: age + morale + brand → some retire into streaming; later phases can add ex-players returning as coaches.

## 5. Roster rules

- Starting five + up to N substitutes (start: 2). Subs matter: role-specific counters, meta pockets, tilt insurance, rookie incubation.
- **Import rule:** max 2 non-region players in a starting lineup (tunable per league; mirrors real esports and is a great roster-building constraint).
- Roster locks before playoffs and around mid-split (transfer windows).
- One head coach + optional staff (see §11); the coach affects drafting and prep quality.

## 6. Scouting

- Attributes of unknown players appear as **ranges** ("Mechanics 62–81"); scouting narrows ranges. Potential is always an estimate with a confidence level.
- Scouting sources: your region's solo-queue ladder (cheap, noisy — where gems hide), lower-tier teams (visible match history, clearer data), other pro leagues (expensive, gated by scouting network level), and your analyst's shortlists.
- Scouting reach grows with org tier and staff (§11): an amateur org sees its own ladder; a top-league org can scout foreign leagues for imports.
- Deliberate design: **the scouting fog is where the fun lives.** Bargains and busts both need to be possible; a fully-informed market kills the fantasy.

## 7. Contracts, transfers, free agency

- Contract terms: salary, length (0.5–3 years), **buyout clause**, and simple promises (starter role guarantee, planned role) that generate morale consequences if broken.
- Signing paths: free agents (negotiate directly), contracted players (negotiate a buyout with their org first, then terms with the player), rookies from your scouting (cheap, unproven).
- Negotiation is an offer/counter-offer loop vs an agent; player personality (Ego, ambition, loyalty) shapes demands. Rival offers can appear mid-negotiation for hot targets.
- **Poaching pressure:** when your players outperform their contracts, richer orgs come knocking. Refusing big buyouts tanks nothing; the *player's* morale may dip if they wanted the move. Selling well is a legitimate strategy (develop-and-flip org archetype).
- Off-season free agency is the drama peak of the year and should feel like it: expiring contracts across the whole world, news cycle, bidding wars.
- AI teams use the same market with the same rules (see technical plan §AI).

## 8. Training & development

Weekly allocation across (sums to a fixed budget of hours; diminishing returns on everything):

- **Scrims** — team synergy, tactics familiarity, draft prep. The default staple.
- **Solo queue** — individual Mechanics/Laning + form maintenance; raises fatigue.
- **VOD review** — Macro, opponent prep (boosted by analyst).
- **Targeted drills** — pick one player + one attribute for focused growth (coach-gated).
- **Rest / media day** — fatigue recovery, Brand growth, morale.

Overtraining → burnout events (form crash, forced rest). Fatigue carries across weeks; the calendar (§12) creates natural crunch points (playoffs after a long split) that reward managers who planned rest earlier. Bootcamps (travel to a stronger region preseason) are a money-for-growth trade.

## 9. Synergy, morale & the drama engine

- **Synergy** is pairwise (bot-lane duo, jungle-mid) plus a team-wide cohesion score. It builds with weeks of scrims and official matches together, and drops when the lineup changes. This makes the classic "superteam of stars that can't play together" emerge naturally, and makes stable rosters a real alternative to buying talent.
- **Morale** per player, moved by: results, playtime, salary fairness vs teammates (they talk), broken promises, drama events.
- **Event system (the inbox's content):** data-driven narrative events with choices — a player wants to stream more (Brand vs fatigue), a role-swap request, two players feuding after a loss, a fan campaign to bench someone, a visa delay for an import, a poaching approach leaked to media. Events are the flavor layer that turns systems into stories; they should be cheap to author (template + conditions + effects) so content can grow every phase.

## 10. The meta & patches

The signature LoL-manager mechanic — the thing football management games don't have:

- The game world has **patches** every few weeks. Each patch shifts the strength of champion *archetypes* (see §13): e.g., "scaling hypercarries nerfed, dive junglers buffed."
- Team fit vs meta becomes a visible dashboard: your players' champion pools vs what's currently strong.
- Deep-pool players adapt; one-tricks swing wildly in value with the meta — both must be viable signings at the right price.
- Your coach's *Adaptability* stat determines how fast the team retools drafts after a patch; scrim time spent on "new patch prep" accelerates it.
- Patches are seeded/generated per-save so every career's meta history differs.

## 11. Staff & facilities

**Staff** (each with a small attribute set + salary):
- *Head coach* — draft quality, tactics, training efficiency. The single biggest non-player hire.
- *Analyst* — scouting accuracy, opponent reports, draft suggestions.
- *Sports psychologist* — morale recovery, tilt resistance, burnout prevention.
- *Positional coach(es)* — growth boost for one role. (Later phase.)

**Facilities** (org-level money sinks with permanent effects): gaming house → training facility tiers (training efficiency, fatigue recovery), content studio (Brand income), scouting network tiers (§6 reach).

## 12. Competitions & calendar

### The world

Fictional circuit mirroring real LoL esports structure. Launch scope: **4 major regions** (analogues of Korea / China / Europe / North America — fictional names, distinct styles and wealth levels) + a "rest of world" abstraction. The player starts in a region of choice; only that region is simulated at full depth in early phases (see roadmap).

### Regional pyramid (the "try to join the league" arc)

1. **Open circuit** — amateur weekend tournaments, open sign-ups, small prizes. Anyone can enter. Starting tier.
2. **Second division** — entered via open qualifier results. League format, modest prize pool, semi-pro salaries.
3. **Top league** — 10 franchised-style teams, real revenue share. Entry via the **Promotion Gauntlet**: top second-division teams vs the league's bottom teams at mid-season and year-end. *(Later-phase storyline: the league converts to closed franchising during your career and you must qualify financially as well as sportingly — mirrors 2018 real history and raises the stakes of the money game.)*

### Season structure (top league; lower tiers are simplified versions)

- Two splits (Jan–Apr, Jun–Aug), round-robin Bo1/Bo3 regular season → Bo5 playoff bracket each.
- **Mid-season international** for split-1 champions of each region.
- **Worlds qualification** by championship points across both splits + regional finals gauntlet.
- **Worlds** (Oct): Swiss/group stage → Bo5 knockout, cross-region.
- Off-season (Nov–Dec): contract expiry wave, free agency, awards show (MVP, All-Pro teams, Rookie of the Split — awards feed player Brand and Ego).

### Match formats

Bo1 (regular season), Bo3/Bo5 (playoffs/qualifiers). Multi-game series are where drafting depth pays off: side selection, adapting picks/bans between games, reading opponent patterns — the coach and analyst matter most here.

## 13. Match simulation & the draft

Two-layer design; see technical plan for internals.

### Layer 1 — Pick/ban draft (interactive)

- Standard tournament draft: 3 bans / 3 picks / 2 bans / 2 picks per side, alternating.
- Roster of **~48 fictional champions at launch**, each defined by: role(s), power curve (early/mid/late spike), playstyle tags (engage, poke, split-push, scaling carry, enchanter, assassin, dive, control…), synergy tags, counter tags, and current patch strength.
- Inputs to draft strength: champion patch strength, the *player's* proficiency on that champion (from their pool), team composition synergy (win conditions must cohere), counter relationships vs enemy picks.
- The player can draft manually every match, set priorities and let the coach draft, or fully delegate. Coach quality = quality of AI suggestions and of delegated drafting.
- The draft must be a genuinely winnable minigame: out-drafting a stronger roster should be a real (bounded) edge.

### Layer 2 — Game simulation (presented, not played)

- Simulated as a timeline of phases: laning (lane matchups → gold/XP leads), skirmish/objective windows (dragon-like and baron-like neutral objectives under fictional names), mid-game map play (macro-driven), teamfights (teamfight/composure/comp-synergy driven), close-out (comp scaling + shotcalling).
- Gold lead and comp power curves shift per-fight win probabilities; comebacks are possible but must be *explainable* (scaling comp survived to late game; a clutch Baron-analogue fight).
- Output: winner, game length, per-player stat lines (K/D/A, gold share, damage share), a human-readable event timeline ("Minute 14: [Jungler] ganks mid, first blood…"), and per-player **performance ratings** that feed form, growth, morale, awards, and scouting data.
- Presentation MVP: readable text timeline + live win-probability graph. A 2D map visualization is a later-phase polish item, explicitly not required for the game to be fun.
- Determinism: every match is reproducible from (state, seed) — required for testing and balance work.

## 14. Economy

**Income:** prize money, league revenue share (top league only — a *huge* step up that makes promotion transformative), sponsor deals (tiered, with performance clauses and renewal negotiations), merch/fans (driven by results + roster Brand), player sales (buyouts received), content income (facility-gated).

**Costs:** player salaries (dominant cost), buyouts paid, staff salaries, facilities, travel/bootcamps, league entry/franchise fees.

**Pressure mechanics:** monthly cash flow with projection UI; the board (or your own solvency, if you own the org) sets seasonal expectations; sustained deficit → forced player sales → death spiral risk. Bankruptcy = game over (career can continue via job offers from other orgs — later phase).

Tuning goal: an average top-league org roughly breaks even; trophies and stars are funded by either results, rich sponsors, or smart player trading.

## 15. Difficulty & failure

- Difficulty presets change: starting tier, starting budget, board patience, market aggressiveness of AI orgs.
- Failure states: bankruptcy, board dismissal (if employed), relegation spiral. Failure should be survivable-but-scarring at normal difficulty; the game is a career, not a roguelike.
- No injuries-as-in-football, but: burnout, tilt spirals, visa issues, retirement threats, and poaching are the adversity generators.

## 16. UI surfaces (screen list)

Desktop-first, information-dense but decision-oriented. Initial screen inventory:

1. **Inbox / dashboard** — home base; news, events, decisions
2. **Squad** — roster overview: form, morale, fatigue, contracts at a glance
3. **Player profile** — attributes, pool, history, personality, contract, growth chart
4. **Scouting** — shortlist, filters, reports, fog-of-war ranges
5. **Negotiation** — contract/buyout offer loop
6. **Training planner** — weekly allocation + burnout/fatigue readout
7. **Meta report** — current patch, archetype tiers, team fit vs meta
8. **Match day** — draft board → live timeline → post-match ratings
9. **Competition** — tables, brackets, schedule, championship points
10. **Finances** — cash flow, projections, sponsors, salary book
11. **Staff & facilities**
12. **World** — other leagues' tables/results (depth grows by phase)
13. **History** — trophy cabinet, awards, hall of fame, season archives

## 17. Content & data plan

- **Everything is data:** champions, archetypes, patches, leagues, teams, sponsor templates, event templates, name pools live in versioned JSON content packs validated by schema — not in code.
- **Generated world:** AI players are procedurally generated per-save from per-region name pools and attribute distributions (regions have flavor: one region skews mechanical prodigies, another macro discipline, etc.). A small set of hand-authored "legend" archetypes can seed each world for flavor.
- **Moddability as strategy:** because packs are plain JSON, the community can build their own datasets. We ship fictional data only; we never ship or endorse Riot-owned names.

## 18. IP & legal stance

To take seriously before any public release:

- *League of Legends*, champion names, league names (LCS/LEC/LCK/LPL, Worlds), and Riot branding are Riot Games' IP. Real pro players' names/likenesses raise personality-rights issues.
- **Stance:** the shipped game uses a fully fictional world — game title to be revisited too ("manageLOL" is a fine working title for a private repo; a public release likely needs a neutral name, e.g. something in the "esports manager" space, with LoL structure but no Riot marks). Docs can reference LoL freely; shipped assets cannot.
- Riot's fan-project policy ("Legal Jibber Jabber") does not cover commercial releases; if this ever goes commercial, fictional-world-with-mod-support is the standard safe pattern (cf. how football games without FIFA licenses operate).

## 19. Out of scope (v1)

Explicitly cut to protect the core: multiplayer/online leagues; real-time or per-play match control; managing multiple titles/games under one org; live-service ties to real esports data; mobile UI. Each can be revisited post-v1.
