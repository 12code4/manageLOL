# manageLOL

A single-player management game about running a professional League of Legends team.

You start as the manager of a nobody org in the amateur scene. You scout and hire players, sign them to contracts, drill them in training, enter tournaments, fight your way into the big league, survive the economics of esports — and one day, walk your roster onto the Worlds stage.

Think *Football Manager*, but for LoL esports: short brutal careers, a meta that shifts under your feet every patch, superteams that implode on ego, and rookies from solo queue who become legends.

## Status

**Design locked on the core systems; the simulation engine is underway.** The design lives in `docs/`; a deterministic TypeScript sim core lives in `packages/`.

| Doc | Contents |
| --- | --- |
| [`docs/01-game-design.md`](docs/01-game-design.md) | Game design document: pillars, core loop, all gameplay systems |
| [`docs/02-technical-plan.md`](docs/02-technical-plan.md) | Stack, architecture, data model, simulation design |
| [`docs/03-roadmap.md`](docs/03-roadmap.md) | Phased build plan with exit criteria per phase |
| [`docs/04-open-questions.md`](docs/04-open-questions.md) | Decisions made + questions to settle |
| [`docs/05-systems/`](docs/05-systems/) | **Deep-dive specs** for players & attributes, team meshing, the ranked ladder, the competition pyramid & franchising, and sponsorships — each with formulas and worked examples |

### What's built (`packages/core`)

A pure, deterministic simulation engine (no DOM, no I/O), test-first:

- **Players** — a 72-attribute model (visible / fogged / hidden), current ability, off-role penalty, champion proficiency, region-flavored procedural generation, and the scouting fog transform.
- **Meshing** — the signature system: a pairwise chemistry matrix with lane-duo weighting that ramps over time and breaks on roster changes, collapsing to one team multiplier.
- **Ranked ladder** — `soloAbility` (distinct from pro ability) driving an MMR model where rank is a noisy proxy for truth: smurfs, boosted accounts, and hidden gems are all real, findable-through-scouting archetypes.
- **Foundation** — seeded named-stream RNG, a week-based calendar, deterministic IDs.

The worked examples in the design docs are reproduced exactly by unit tests. The playable prototype UI ships as a self-contained Artifact while the React app (`apps/web`) is built out.

## The pitch in one paragraph

Time flows in days across a real esports calendar: two splits, playoffs, an international mid-season event, Worlds, then a chaotic free-agency window. Each week you set the training plan, manage five egos (plus subs), and prepare for match day. Matches play out through a pick/ban draft and a simulated game you can read like a story. Between seasons you negotiate contracts, dodge poaching offers from richer orgs, and decide whether to win now with veterans or grow rookies who might be worth millions — or nothing. The league spot itself is a prize: you earn it through promotion, and you can lose everything trying to keep it.

## Non-goals (for now)

- No multiplayer / online leagues
- No real-time control of matches (you're the manager, not the midlaner)
- No real player/champion/league names shipped in the game — fictional world, moddable data (see IP notes in the design doc)
