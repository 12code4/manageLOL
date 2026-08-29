# manageLOL — Technical Plan

*Status: initial planning draft. Stack is a recommendation with rationale; see `04-open-questions.md` before treating it as final.*

---

## 1. Technical goals & constraints

Derived from the design doc:

1. **Simulation-heavy, graphics-light.** The game is tables, dashboards, timelines, and one draft board — not a rendering problem. The hard part is a world simulation (hundreds of players, multiple leagues, market AI) that stays fast and debuggable.
2. **Deterministic & testable.** Same state + same seed ⇒ same outcome, always. Balance work and bug reports depend on reproducibility.
3. **Data-driven content.** Champions, patches, leagues, events are JSON packs, schema-validated, hot-swappable, moddable.
4. **Local-first single-player.** No accounts, no server. Saves are files the player owns.
5. **Long-save durability.** A career save must survive game updates → versioned state with migrations from day one.

## 2. Recommended stack

**TypeScript end-to-end. Simulation core as a pure library; React web UI on top; desktop packaging later.**

| Layer | Choice | Notes |
| --- | --- | --- |
| Language | TypeScript (strict) | One language across sim, UI, tooling; great refactoring safety for a data-model-heavy game |
| Sim core | Pure TS package, zero UI/DOM deps | Runs in browser, Node, or a worker thread; headless for tests/balance |
| UI | React + Vite | Best-in-class ecosystem for dense data UI (tables, forms, charts) |
| UI state | Zustand (UI-only state); sim state lives in the core, UI subscribes to snapshots | Keep one source of truth: the sim |
| Styling | Tailwind CSS (or CSS modules — team taste) | Speed for dashboard-style UI |
| Schema/validation | Zod (shared between content packs and save files) | One schema → runtime validation + TS types |
| Persistence | IndexedDB autosaves + JSON export/import files | Local-first; files enable sharing/bug repro |
| Testing | Vitest + golden-seed simulation tests | See §8 |
| Packaging (later) | Tauri | Web app first; wrap for desktop/Steam when warranted |

### Why not a game engine (Godot/Unity)?

Considered and rejected for v1: engines pay off for scenes, physics, and real-time rendering — none of which this game needs. They actively hurt for data-dense UI (UI toolkits inside engines are far weaker than the web stack) and for headless simulation testing. If a fancy 2D match visualization ever becomes a priority, it can live in a canvas/WebGL component inside the same app.

### Why no backend?

Single-player with local saves needs none. A backend adds accounts, hosting, and sync complexity with zero v1 gameplay value. Nothing in this architecture blocks adding online features later (the sim core being pure/serializable is exactly what you'd want anyway).

## 3. Repository layout (monorepo)

```
manageLOL/
├── docs/                  # these documents
├── packages/
│   ├── core/              # the simulation engine (pure TS, no DOM)
│   │   └── src/
│   │       ├── world/     # world state, clock, calendar, event scheduling
│   │       ├── players/   # attributes, growth, aging, form, morale, synergy
│   │       ├── market/    # contracts, negotiation, free agency, AI roster moves
│   │       ├── competition/ # leagues, brackets, standings, qualification
│   │       ├── match/     # draft engine + game simulation
│   │       ├── meta/      # champions, archetypes, patch generation
│   │       ├── economy/   # finances, sponsors, board expectations
│   │       ├── events/    # narrative event templates & triggering
│   │       ├── save/      # serialization, versioning, migrations
│   │       └── rng/       # seeded RNG streams
│   ├── data/              # content packs (JSON) + zod schemas + validators
│   └── devtools/          # CLI: headless season runner, balance reports, save inspector
├── apps/
│   └── web/               # React UI
└── package.json           # pnpm workspaces
```

pnpm workspaces; `core` and `data` must never import from `apps/`.

## 4. Simulation architecture

### World state & time

- One serializable `World` aggregate: all orgs, players, staff, competitions, market state, meta state, finances, inbox, history. No hidden state outside it.
- **Day-tick clock.** `advanceDay(world)` processes due scheduled events (matches, deadlines, patch releases, contract expiries, event triggers) and returns the new state + a list of `InboxItem`s / interrupts. The UI loop is: advance until an interrupt requires player input.
- Weekly aggregation (training application, fatigue/morale drift) runs on a fixed weekday tick.

### Determinism rules

- Single seeded RNG, split into **named streams** (`match`, `market`, `events`, `worldgen`, …) so consuming randomness in one system doesn't shift another system's sequence — this keeps golden tests stable as features are added.
- No `Date.now()`, no `Math.random()`, no iteration over non-deterministic orderings (sort with explicit tiebreakers everywhere).
- Sim functions are pure: `(state, inputs, rngStream) → (state', outputs)`.

### Match engine (two versions, deliberate evolution)

**v1 — resolution model (MVP):** compute both teams' effective strength from role-by-role matchups (skill × form × fatigue), synergy, draft outcome score, and prep; a logistic function gives win probability; sample the result, then *generate* a plausible scoreline, duration, stat lines, and text timeline consistent with that result. Cheap, tunable, good enough to make a season loop fun.

**v2 — phase simulation (the real one):** simulate the game as a state machine over phases (laning → objectives/skirmishes → mid-game → teamfights → close-out) with a running gold/objective ledger. Draft feeds power curves (early/late spikes) so comp identity matters *inside* the game, not just at the strength summary. Per-fight probabilities driven by current gold state + relevant attributes. The timeline is then a record of what actually happened rather than post-hoc flavor.

The engine sits behind one interface (`simulateGame(matchContext, seed) → GameResult`) so v2 swaps in without touching callers. Same for the draft AI (`draftPick(draftState, teamContext) → action`).

### AI orgs

AI teams operate through **the same rule surface as the player** (no cheating by construction): they scout (with their own scouting quality), bid in free agency, offer buyouts, set training, and draft. Utility-based AI with per-org personalities (rich impatient buyer, develop-and-flip academy org, stable dynasty) — personalities are content data, not code. Market AI runs during off-season/window ticks and must be budgeted to keep day-advance fast (see §7).

## 5. Data model sketch

Key entities (fields illustrative, not exhaustive):

- **Player** — id, identity (name, age, nationality, languages), role(s), attributes {…§4 GDD}, hidden {potential, growthCurve, declineAge}, state {form, fatigue, morale}, championPool: Map<championId, proficiency>, contractId?, careerHistory[]
- **Org** — id, name, region, reputation, brand, finances {cash, weeklyIn/Out}, facilities, boardExpectations, aiPersonality?, playerIds[], staffIds[]
- **Contract** — playerId, orgId, salary, start/end, buyoutClause, promises[]
- **StaffMember** — role (coach/analyst/psych/positional), attributes, contract
- **Champion** — id, name, roles[], powerCurve, styleTags[], synergyTags[], counterTags[]
- **PatchState** — patch number, per-archetype/champion strength modifiers, generatedAt
- **Competition** — id, tier, region?, format (roundRobin | bracket | swiss | gauntlet), participants, schedule, standings, qualificationRules (what feeds where — the pyramid and Worlds points are just edges between competitions)
- **Match / GameResult** — competitionId, teams, format (BoN), per-game {draft, timelineEvents[], statLines[], winner, seed}
- **Negotiation** — parties, subject (contract | buyout | sponsor), offer history, agent state
- **Sponsor deal** — template ref, tier, base + performance clauses, term
- **InboxItem / NarrativeEvent** — template ref, conditions snapshot, choices[], effects
- **World** — clock, all of the above, rng streams' states, historyLog, saveVersion

**History as event log:** append world-level history entries (transfers, titles, awards, retirements) into a compact log — this powers the History/hall-of-fame screens and post-hoc storytelling ("your ex-rookie just won Worlds with a rival") almost for free.

## 6. Content pack format

- JSON files per domain (champions, archetype definitions, leagues/pyramid, sponsor templates, event templates, name pools per region, initial world flavor).
- Zod schemas in `packages/data` are the single source of truth; a `validate` CLI gate runs in CI. Packs declare a `formatVersion`.
- The game loads a pack at new-game time and **freezes a copy into the save** (a save must not break when the base game's data changes).

## 7. Performance envelope

Back-of-envelope for full world scope (phase 3): ~4 regions × ~2 tiers × ~10 teams × ~8 players ≈ **<1,000 pro players** plus a few thousand scoutable ladder prospects. Trivial for modern hardware *if* we avoid O(n²)-per-day patterns. Rules of thumb:

- Day ticks that do nothing must be near-free (event-scheduled work only, no daily full-world scans).
- Simulating a full season of all leagues (many matches via v1 resolution model) should stay under ~1s so "advance to next match" never feels sticky; run the sim in a worker thread from day one to keep the UI thread clean.
- Devtools target: headless-simulate 10 full seasons in under a minute for balance batches.

## 8. Testing & balance strategy

- **Unit tests** on every sim system (growth curves, negotiation math, standings/tiebreakers, qualification edges).
- **Golden-seed tests:** fixed seed + fixed content pack ⇒ snapshot key outcomes (season table, market moves). Catches accidental determinism breaks and unintended balance drift; regenerate snapshots only in deliberate balance commits.
- **Balance harness** (`packages/devtools`): headless-run N seasons, emit reports — rating vs win-rate correlation, gold-vs-win curves, upset frequency, market inflation over 10 seasons, growth curve outcomes ("how good does a 65-potential rookie end up?"), promotion difficulty. These reports are how tuning decisions get made; build the harness *early* (phase 0–1), not as an afterthought.
- **Save migration tests:** every saveVersion bump ships a migration + a fixture save from the previous version.
- **Property tests** where cheap (e.g., standings always consistent with results; money conservation across transfers).

## 9. Risks

| Risk | Mitigation |
| --- | --- |
| Match sim feels random / unreadable (kills pillar #2) | v1 resolution model exposes its inputs in post-match UI ("why you lost" breakdown) from the start; balance harness watches predictability vs upset rate |
| Simulation scope creep (world too deep too early) | Phased world depth (roadmap): 1 region deep, others as results-only tables until phase 3 |
| Save-breaking refactors | saveVersion + migrations + fixture tests from the first save format |
| Economy math spirals over long careers (inflation) | 10-season balance harness runs as a standing CI report |
| UI drowns the player in data (FM's classic failure mode) | Every screen designed around a decision; screen inventory reviewed against pillar #1 each phase |
| IP exposure if project goes public | Fictional-only shipped content enforced by content-pack review; rename before any public release (GDD §18) |
