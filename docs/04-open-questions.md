# manageLOL — Open Questions & Provisional Decisions

*The planning docs take positions so work can start; this file separates what's genuinely settled-enough from what needs your call. Answer these before (or during) Phase 0 — none block writing the first line of scaffold code except Q1.*

---

## Questions that shape the build

**Q1 — Platform ambition: web app first, or desktop/Steam as a goal?**
Provisional: browser-first (fastest iteration), Tauri desktop wrap in Phase 4. If Steam is a *goal* rather than a maybe, we should validate the Tauri packaging pipeline in Phase 1 instead of Phase 4. If mobile ever matters, say so now — it changes UI architecture fundamentally.

**Q2 — Interactive draft with fictional champions: confirmed?**
Provisional: yes — a ~48-champion fictional roster with pick/ban as a core minigame (GDD §13). The alternative (abstract "strategy cards" instead of champions) is cheaper but sacrifices the most LoL-authentic system. This is the biggest single content + balance investment; worth explicit sign-off.

**Q3 — Team size & cadence?**
The roadmap is dependency-ordered, not dated. Solo hobby project vs 2–3 people vs more changes how much of Phase 2/3 to promise. What's the reality?

**Q4 — Art direction & budget?**
Provisional: clean text/data UI (FM-style) with light illustration; no player portraits at launch (procedural avatars or initials). Portraits/champion art are a real cost and an IP-safety surface. What's the appetite?

**Q5 — Tone of the fictional world?**
Options: (a) played straight — plausible fake esports world (provisional pick); (b) parody/satire of esports culture; (c) thin-veil references to real orgs/players (legally riskiest — recommend against shipping it, even if tempting).

**Q6 — Manager identity: owner or employee?**
Provisional: v1 you own the org (one failure state: bankruptcy; board = investors with soft expectations). Employee-mode (get hired/fired across orgs, FM-style career) is a Phase 3+ addition. OK?

## Decisions already taken (flag now if you disagree)

- **Fictional world, no Riot IP shipped; moddable JSON data packs; rename before public release.** (GDD §17–18)
- **TypeScript monorepo: pure sim core + React web UI, local saves, no backend.** (Tech plan §2)
- **Single-player only; no real-time match control; one region simulated deeply until Phase 3.** (GDD §19, roadmap)
- **Match engine v1 is a resolution model with strong explanation UI; phase-simulation engine comes later behind the same interface.** (Tech plan §4)
- **Promotion is sporting (gauntlet) at first; franchising arrives later as a career storyline.** (GDD §12)
- **Determinism everywhere + balance harness built early.** (Tech plan §4, §8)

### New decisions (from the systems deep-dives, `05-systems/`)

- **Attribute model: 72 attributes across visible / fogged / hidden layers.** Hidden "chemistry drivers" are the only inputs meshing may read (the interface guarantee). ([players-and-attributes.md](05-systems/players-and-attributes.md))
- **Meshing spine = pairwise chemistry matrix** (chosen over playstyle-identity and wavelength models by a judged design panel), with lane-duo weighting and a time-based ramp. Grafts from the runners-up (signed/negative ceilings for true implosions; draft↔meta↔identity coupling) are roadmapped. ([meshing.md](05-systems/meshing.md))
- **The ranked ladder is a first-class talent pipeline.** It reads a distinct `soloAbility`, not pro ability, so rank is a *legible-but-wrong-in-known-ways* proxy — smurfs, boosted accounts, one-tricks, and hidden gems are all mechanical archetypes revealed through scouting. ([ranked-ladder.md](05-systems/ranked-ladder.md))
- **The climb is gated by two currencies — sporting AND financial.** Top-league entry is either the promotion gauntlet or a franchise auction; a mid-career franchise-conversion event is the marquee storyline. ([competition-pyramid.md](05-systems/competition-pyramid.md))
- **Sponsor deals = base + performance clauses + obligations** (media/content time is a real fatigue/morale cost), with offers generated from reputation, brand, results, and roster star-power. ([sponsorships-and-economy.md](05-systems/sponsorships-and-economy.md))
- **Calendar: an idealized 52-week / 364-day year** (clean, boundary-free scheduling) rather than the Gregorian calendar. (`core/src/world/clock.ts`)

### Decisions from the draft round (user-confirmed)

- **Draft ships first** (before contracts/salaries), with the **full tournament ban/pick sequence** — no compressed variant; delegation is the speed valve. ([draft-and-champions.md](05-systems/draft-and-champions.md))
- **48 champions at launch**, shipped as a validated content pack with per-champion flavor and crowd lines. (`packages/data/src/champions.ts`)
- **Humor is a design pillar-adjacent layer:** the sim stays deadpan; comedy lives in flavor fields and **The Crowd** — a scrolling, context-reactive chat rail on the draft board and match view. ([the-crowd.md](05-systems/the-crowd.md))
- **Wireframe formats:** both piloted (in-doc sketches in [`06-ui-architecture.md`](06-ui-architecture.md) + an editable design canvas); user to pick the standard.

## Parking lot (ideas noted, deliberately not planned)

Academy/second roster management · playing as other regions' minor leagues · in-game "solo queue ladder" browser with generated drama · co-streaming/media minigames · multiplayer online leagues · other esports titles under one org umbrella · real-data import tooling (community-side only).
