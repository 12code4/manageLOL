# manageLOL — repo guide for Claude

A single-player LoL-esports team-management game (Football Manager for League of Legends). See `docs/` for the design; this file is the working guide for the code.

## Layout

- `packages/core` — the simulation engine. **Pure TypeScript, no DOM, no I/O.** Everything the game *is* lives here. Roughly: `players/` (attributes, ratings, meshing, scouting, development), `ladder/` (solo-queue model and the Onyx I visibility cutoff), `draft/`, `match/` (full resolution and 30s ticks), `world/` (orgs, contracts, fixtures and standings, the clock), `season/` (the calendar, the pyramid, and the fast path that resolves everything the player is not watching).
- `packages/data` — content packs (fictional, moddable) + their schemas. Champions, archetypes, name pools, sponsor/event templates.
- `packages/devtools` — headless CLI: generate a world, simulate seasons, print balance reports.
- `apps/web` — React UI (later). For now the playable prototype is a self-contained Artifact built from `prototype/src/` (`sim.js` ports core, `world.js` runs the persistent world, `season.js` and `matchday.js` are the big screens, `template.html` is the shell); `pnpm proto:build` assembles them. `docs/` tracks the plan for the real app.

`core` and `data` must never import from `apps/`.

## The one rule that matters: determinism

Same `(state, seed)` ⇒ same outcome, always. Balance work, golden-seed tests, and bug repros all depend on it.

- **Never** call `Math.random()` or `Date.now()` / `new Date()` in `core` or `data`. Route all randomness through `Rng` (`packages/core/src/rng`).
- Randomness comes from **named streams** (`RngSource.stream('match:'+id)`) so one system consuming numbers never shifts another's sequence.
- No iteration over non-deterministic order (object key order from external sources, `Set`/`Map` insertion you didn't control). Sort with explicit tiebreakers.
- Sim functions are pure: `(state, inputs, rng) → (state', outputs)`.

## Conventions

- TS strict (see `tsconfig.base.json`): `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` are on — array access is `T | undefined`, handle it.
- Attributes are on a 0–100 scale; use `clamp100` / the helpers in `util/math.ts`.
- Every sim system ships with tests. Add a **golden-seed** snapshot when a system produces a season/market outcome, so balance drift is caught.
- Content is **data, not code** — new champions/events/sponsors go in `packages/data`, never hardcoded in `core`.

## Commands

```bash
pnpm install          # once
pnpm test             # vitest run (all packages)
pnpm test:watch
pnpm typecheck        # tsc -b across the workspace
pnpm sim              # headless season runner (devtools)
pnpm proto:build      # rebuild prototype/index.html from prototype/src/
```

## IP stance

Ship a fully fictional world — **no Riot names** (champions, leagues, players) in shipped data. Docs may reference LoL freely; `packages/data` may not. See `docs/01-game-design.md` §18.
