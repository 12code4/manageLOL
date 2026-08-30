# manageLOL — Systems Deep-Dives

These docs expand the high-level `docs/01-game-design.md` into implementable specifications: exact attributes, formulas, data shapes, and worked numeric examples that double as golden tests. They are the contract between design and `packages/core`.

| Doc | System | Core module | Status |
| --- | --- | --- | --- |
| [`players-and-attributes.md`](players-and-attributes.md) | The 72-attribute taxonomy (visible / fogged / hidden), current ability, growth & aging, off-role penalty, champion proficiency, the scouting fog | `core/src/players` (`types`, `attributes`, `ratings`, `scouting`, `generate`) | **Implemented + tested** |
| [`meshing.md`](meshing.md) | Team meshing — the signature system: pairwise chemistry matrix, lane-duo weighting, ramp/disruption over time, readability surfaces | `core/src/players/meshing.ts` | **v1 (A spine) implemented + tested**; C/B grafts roadmapped |
| [`ranked-ladder.md`](ranked-ladder.md) | The solo-queue ladder & talent discovery: `soloAbility` vs pro CA, MMR model, smurf/boosted/hidden-gem archetypes, scouting pipeline | `core/src/ladder/ladder.ts` | **Implemented + tested** |
| [`competition-pyramid.md`](competition-pyramid.md) | Local → regional → national → top league (promotion gauntlet OR franchise auction) → Worlds; academy leagues; the two-currency climb | `core/src/competition` | Spec complete; core in progress |
| [`sponsorships-and-economy.md`](sponsorships-and-economy.md) | Sponsor tiers & archetypes, deal structure with clauses & obligations, the offer pipeline, cash-flow integration | `core/src/economy` | Spec complete; core in progress |

## How these were produced

The four new systems (ladder, meshing, pyramid, sponsorships) plus the attribute taxonomy were designed via a multi-agent design panel: independent deep-dives per system, and for meshing — the hardest, most novel mechanic — **three rival approaches scored by a design director** (see the top of `meshing.md`). The winning approach is implemented; the runners-up's best ideas are grafted in the roadmap.

## The determinism contract

Every formula here is a pure function of stored state + a seeded RNG stream. No system reads `Math.random()` or wall-clock time. The worked examples are reproduced exactly by unit tests, so balance drift and accidental determinism breaks are caught (see `CLAUDE.md`).
