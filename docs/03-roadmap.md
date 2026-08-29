# manageLOL — Roadmap

*Phases are ordered by dependency and de-risking, not calendar dates (team size unknown — see open questions). Each phase has exit criteria; don't start the next phase's features until they're met. The guiding rule: get a full, ugly season loop fun as early as possible, then deepen.*

---

## Phase 0 — Skeleton & simulation spike

**Goal: prove the architecture with a season that simulates headlessly.**

- Monorepo scaffold (`core` / `data` / `devtools` / `web` placeholder), CI with lint + tests + content validation.
- World state, day-tick clock, seeded RNG streams, save/load round-trip with `saveVersion`.
- Content schemas + first content pack: 1 region, 2 tiers, ~20 generated teams, generated players, ~24 champions.
- Match engine v1 (resolution model, auto-draft), standings, round-robin scheduler, one promotion link between tiers.
- Devtools CLI: generate world → simulate N seasons → print tables + basic balance report.

**Exit criteria:** `simulate 10 seasons` runs deterministically in seconds; better-rated teams win more but upsets happen; golden-seed test locks it in. *No UI yet, and that's fine.*

## Phase 1 — Vertical slice: one playable season (MVP)

**Goal: a human can play a full season in the browser and want a second one.**

- Web app shell + the load-bearing screens (ugly but clear): Inbox/dashboard, Squad, Player profile, basic Scouting list, Training planner, Match day (auto-draft summary + text timeline + "why you won/lost" breakdown), Competition tables, Finances v1.
- Playable career start: amateur org, fill roster from free agents, qualify for second division (the §3-GDD first hour).
- Training v1 (allocation → growth/fatigue), form & morale v1, finances v1 (salaries, prizes, one sponsor), contract signing v1 (free agents only, simple negotiation).
- Autosave + manual save/export.

**Exit criteria:** a full season start-to-finish with no dead ends; playtesters can articulate *why* they won or lost matches; at least one tester voluntarily starts season 2. This is the fun gate — iterate here until passed.

## Phase 2 — The manager fantasy

**Goal: the systems that make it *this* game, not a generic sports manager.**

- **Interactive pick/ban draft** with champion proficiencies, comp synergy, counters; delegate option; full ~48-champion pack.
- **Patches & meta system** + meta report screen + prep mechanics.
- Scouting fog-of-war (ranges, reports, shortlists), buyout negotiations for contracted players, richer contract terms (promises).
- Synergy system (pairs + cohesion), narrative event system + first ~30 event templates, staff v1 (coach + analyst).
- Bo3/Bo5 series with between-game adaptation; playoffs feel distinct.

**Exit criteria:** drafting well measurably wins games a weaker roster "shouldn't" win (and the post-match screen shows it); a roster change visibly disrupts synergy; two playtesters independently retell an emergent story (drama event, bargain scout hit, meta crisis).

## Phase 3 — The world

**Goal: the career becomes a life: rivals, seasons, the international stage.**

- All 4 regions simulated (market + results; full match sim only where the player is), imports & residency rules, cross-region scouting tiers.
- Mid-season international + **Worlds** (points, gauntlet, Swiss → knockout), award season.
- Full AI org behavior: free agency frenzy, poaching, org personalities; player sales as a strategy.
- Multi-season depth: aging/decline, retirements, rookie generation, history log + History screen, board expectations/dismissal, facilities.
- Match engine v2 (phase simulation) behind the same interface, when v1's readability ceiling is actually hit.
- The franchising storyline (league converts; financial + sporting entry) if validated in phase-2 playtests.

**Exit criteria:** a 5-season career holds attention; Worlds feels like a destination (playtest feedback); balance harness shows sane 10-season economy and player-quality distributions.

## Phase 4 — Polish & release readiness

**Goal: ship-shaped.**

- Onboarding/tutorialization pass, UI/UX polish pass over every screen (pillar #1 audit), match presentation upgrade (win-prob graph, optional 2D map viz if it earns its cost).
- Content expansion: events to ~100+, sponsor variety, world flavor, legend seeds.
- Difficulty presets, accessibility pass, performance pass, save-migration hardening.
- **IP scrub + rename**, modding documentation, packaging (Tauri desktop build; Steam if pursued).

**Exit criteria:** a stranger can start, learn, and finish season 1 without help; no shipped Riot IP; store-ready builds.

---

## Standing tracks (every phase)

- Balance harness reports reviewed at each phase end.
- Golden-seed + migration tests stay green; save compatibility maintained from Phase 1 onward.
- Content authored as data, never hardcoded (reviewed in PRs).

## Sequencing rationale

- Headless-first (Phase 0) because the sim is the highest-risk asset and the cheapest thing to iterate without UI.
- Draft & meta (Phase 2) before world breadth (Phase 3) because they're the identity of the game — if they don't sing, breadth is wasted.
- Match engine v2 is deliberately *late*: v1 + great post-match explanation may carry the MVP; don't pay for depth the presentation can't show yet.
