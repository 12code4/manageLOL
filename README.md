# manageLOL

A single-player management game about running a professional League of Legends team.

You start as the manager of a nobody org in the amateur scene. You scout and hire players, sign them to contracts, drill them in training, enter tournaments, fight your way into the big league, survive the economics of esports — and one day, walk your roster onto the Worlds stage.

Think *Football Manager*, but for LoL esports: short brutal careers, a meta that shifts under your feet every patch, superteams that implode on ego, and rookies from solo queue who become legends.

## Status

**Planning phase.** No code yet. The design and technical direction live in `docs/`:

| Doc | Contents |
| --- | --- |
| [`docs/01-game-design.md`](docs/01-game-design.md) | Game design document: pillars, core loop, all gameplay systems |
| [`docs/02-technical-plan.md`](docs/02-technical-plan.md) | Proposed stack, architecture, data model, simulation design |
| [`docs/03-roadmap.md`](docs/03-roadmap.md) | Phased build plan with exit criteria per phase |
| [`docs/04-open-questions.md`](docs/04-open-questions.md) | Decisions made provisionally + questions to settle before building |

## The pitch in one paragraph

Time flows in days across a real esports calendar: two splits, playoffs, an international mid-season event, Worlds, then a chaotic free-agency window. Each week you set the training plan, manage five egos (plus subs), and prepare for match day. Matches play out through a pick/ban draft and a simulated game you can read like a story. Between seasons you negotiate contracts, dodge poaching offers from richer orgs, and decide whether to win now with veterans or grow rookies who might be worth millions — or nothing. The league spot itself is a prize: you earn it through promotion, and you can lose everything trying to keep it.

## Non-goals (for now)

- No multiplayer / online leagues
- No real-time control of matches (you're the manager, not the midlaner)
- No real player/champion/league names shipped in the game — fictional world, moddable data (see IP notes in the design doc)
