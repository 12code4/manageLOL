# manageLOL — playable prototype

A self-contained, single-file interactive prototype of the game. It runs the four core systems as a playable vertical slice:

- **Scout the Ladder** — browse a ranked ladder where rank is public but true skill is fogged; spend scouting to narrow attribute ranges and surface flags (`SMURF`, `HIDDEN GEM`, `BOOSTED`, `BUST`), then sign players.
- **Squad & Chemistry** — your five as player cards, and the **Chemistry Web**: a pairwise-meshing pentagon that gels over weeks and resets on the pairs a new signing touches.
- **Compete** — Bo3 series vs AI opponents up the pyramid (Local → Regional → Second Division → The Prime League → Worlds). Each game opens with the **Draft Board**: the full 20-action tournament pick/ban sequence against a coach-quality-noised AI, tier chips from the live patch, your pilots' proficiencies on every card, coach suggestions with reasons, and a post-draft verdict that attributes the score. Then **Match Day — Live**: win-probability graph, story timeline, and a post-game "why" panel (draft ± / chemistry ± / roster base).
- **The Crowd** — a scrolling, context-reactive chat rail on the draft board and live view (champion-specific lines, hype meter, fictional emotes). Pure flavor; never touches the sim.
- **Sponsors** — offers that scale with reputation and roster star power.

## This is the interim UI

The design (`docs/`) plans a React app in `apps/web`. Until that exists, this prototype is the playable face of the game — the same role a self-contained Artifact plays.

## The sim mirrors `packages/core`

`src/sim.js` is a dependency-free JavaScript port of the real, tested engine in `packages/core` — the **same** algorithms (seeded RNG, region-flavored generation, `soloAbility`/MMR ladder model, the pairwise chemistry matrix, the v1 match resolution model, the patch generator, champion-pool seeding, and the draft engine). The 48 champions are injected at build time from `packages/data` — one source of truth. `src/matchday.js` holds the draft-board / live-view / Crowd UI. The core's worked-example golden tests (the ladder gem/bust MMR figures, the meshing Anvil/Allstars numbers) reproduce identically here. The port exists so the prototype can ship as one static file with no build step for the player; `packages/core` remains the source of truth for the production app.

## Build

```bash
pnpm proto:build          # injects src/sim.js (+48 champions from packages/data) and src/matchday.js → index.html
```

Then open `prototype/index.html` in a browser (no server needed).
