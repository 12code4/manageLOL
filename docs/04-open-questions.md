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
- **Auto-draft is the default** (toggle to manual). Both sides draft in real time, 3–6s per action, with Team Comms deliberating; quality = coach + cohesion + players' game sense with randomness that skilled rosters shrink. ([draft-and-champions.md](05-systems/draft-and-champions.md) §5, [the-crowd.md](05-systems/the-crowd.md) §7)
- **Games play back in 30-second steps at ~2s each** with fast/skip controls; the outcome is resolved first and expanded into a consistent tick log. (`core/src/match/ticks.ts`)
- **Champion images are deferred**; cards/feeds are built to take them. Art brief (48 descriptions + exact sizes) is a later deliverable.
- **Wireframe formats:** both piloted (in-doc sketches in [`06-ui-architecture.md`](06-ui-architecture.md) + an editable design canvas); user to pick the standard.

### Decisions from the persistent-world round (user-confirmed)

- **Persistent rival orgs per tier.** 48 orgs hold 48 conserved seats across a four-tier pyramid, forever. New names appear when one folds or a seat is expanded; folding is confined to the bottom two tiers and a long history protects a club from it. ([orgs-and-season.md](05-systems/orgs-and-season.md) §3–4)
- **Org strength is longevity plus results, and it never touches a match directly.** `prestige = 0.62·standing + 0.38·legacy`, where legacy accrues per season at a tier-weighted rate and bleeds slowly. What it buys is off the pitch — cheaper wages, better staff, deeper scouting — so a dynasty is strong because of the roster it can assemble. The one direct channel, a sharper draft, is capped at 2.6 team-strength points (≈59.8% odds). Upsets survive by construction, and a test pins the bound. (`core/src/world/orgs.ts`)
- **The visible ladder starts at Onyx I (2525) — our Diamond 1.** Nothing below is listed. The cutoff falls out of the existing tier bands rather than being a display filter. ([ranked-ladder.md](05-systems/ranked-ladder.md), `core/src/ladder/bands.ts`)
- **Deep Scout is the door beneath the cutoff.** Four analyst weeks for one account from the Cobalt badlands; a gem 18% of the time for an amateur, 45% for a well-networked org. Everyone can buy a ticket, only a good org buys a repeatable edge.
- **Development is headroom × environment, never rank.** A good org roughly doubles the solo-queue rate, so a 17-year-old Onyx I signing reaches ~88 CA in four or five seasons and ~74 if left alone. Potential is a hard wall. (`core/src/players/development.ts`)
- **Contracts price on an exponential wage curve** (`0.22 × 1.068^(CA−50)`), so the last five ability points cost as much as the first thirty — which is what makes developing a prospect the smart play rather than the sentimental one. Prestige is the discount that converts history into strength.
- **League revenue is calibrated against the ladder cutoff, not against tier quality** — the cheapest signable player is an Onyx I account, so even an amateur org pays elite-ladder wages for five. A test pins that every tier can afford the roster it can actually sign, and cannot afford it twice over.
- **The season is a shared 52-week calendar** where every week has a kind (match / training / market / event), nine regular match weeks a split tiling an 18-round double round-robin exactly. (`core/src/season/calendar.ts`)
- **Everything the manager is not watching resolves through `resolveFastSeries`** — the draft sampled in one Gaussian, day form drawn once per series. Twenty thousand series in well under a second. (`core/src/season/fast.ts`)
- **Playoffs are single elimination with byes at every tier** — 5 series at tier 1, 3 at tier 2, 7 at tier 3. It is the format that makes a top seed's reward legible (you skip a round), keeps the count low enough that a manager plays all of them, and needs one builder rather than a feed graph per format. Double elimination is the better sport and the obvious later upgrade. The table decides who is good; the bracket decides who lifts the trophy, and a title is now the playoff champion rather than the top of the table. (`core/src/season/bracket.ts`)
- **The promotion gauntlet is one Bo5 per boundary.** The club just above the automatic relegation line defends against the best challenger that did not go up automatically. Deliberately a single series rather than a ladder: the drama of promotion is a night, not a tournament, and a manager who has just played a playoff run should not face three more series to keep their seat.
- **Season is the home screen**, Compete is gone as a nav entry (match day is a takeover launched from the fixture), Scout became Recruit, and the inbox became a topbar drawer. Net −1 rail entry while the game roughly tripled in surface area. ([orgs-and-season.md](05-systems/orgs-and-season.md) §11)

## Parking lot (ideas noted, deliberately not planned)

Academy/second roster management · playing as other regions' minor leagues · in-game "solo queue ladder" browser with generated drama · co-streaming/media minigames · multiplayer online leagues · other esports titles under one org umbrella · real-data import tooling (community-side only).
