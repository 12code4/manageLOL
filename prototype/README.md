# manageLOL — playable prototype

A self-contained, single-file interactive prototype of the game. It runs the four core systems as a playable vertical slice:

- **Scout the Ladder** — browse a ranked ladder where rank is public but true skill is fogged; spend scouting to narrow attribute ranges and surface flags (`SMURF`, `HIDDEN GEM`, `BOOSTED`, `BUST`), then sign players.
- **Squad & Chemistry** — your five as player cards, and the **Chemistry Web**: a pairwise-meshing pentagon that gels over weeks and resets on the pairs a new signing touches.
- **Compete** — your team vs an AI opponent up the pyramid (Local → Regional → Second Division → The Prime League → Worlds), with a readable win-probability breakdown, box score, and match timeline.
- **Sponsors** — offers that scale with reputation and roster star power.

## This is the interim UI

The design (`docs/`) plans a React app in `apps/web`. Until that exists, this prototype is the playable face of the game — the same role a self-contained Artifact plays.

## The sim mirrors `packages/core`

`src/sim.js` is a dependency-free JavaScript port of the real, tested engine in `packages/core` — the **same** algorithms (seeded RNG, region-flavored generation, `soloAbility`/MMR ladder model, the pairwise chemistry matrix, the v1 match resolution model). The core's worked-example golden tests (the ladder gem/bust MMR figures, the meshing Anvil/Allstars numbers) reproduce identically here. The port exists so the prototype can ship as one static file with no build step for the player; `packages/core` remains the source of truth for the production app.

## Build

```bash
node prototype/build.mjs   # injects src/sim.js into src/template.html → index.html
```

Then open `prototype/index.html` in a browser (no server needed).
