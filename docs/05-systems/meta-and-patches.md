# manageLOL — Meta & Patches

*Systems deep-dive (`docs/05-systems/`). The mechanic football managers don't have: the ground shifts. Every four weeks a patch re-weights what's strong; teams that prepare re-draft faster, deep-pool players hold value, one-tricks swing with the tide.*

> Feeds: [`draft-and-champions.md`](draft-and-champions.md) (`strength(c, t)`), the ladder's `b_meta` recompute ([`ranked-ladder.md`](ranked-ladder.md) §5), and player value on the market. Reads: coach `adaptability`, player `adaptability` + `learningRate`, scrim allocation.

---

## 1. Cadence

A patch lands every **4 weeks**, aligned to the calendar (never mid-playoff series; the pre-playoff patch is the famous "the meta they'll play Worlds on" moment). Patches are generated per-save on the seeded `meta` stream — every career lives a different meta history.

## 2. The generator

Two layers of change, both mean-reverting so no archetype dies forever:

```
// per archetype a, per patch t:
delta(a,t)   = clamp( 0.6*delta(a,t-1) + draw(N(0, 4)), -10, +10 )   // momentum + shock
strengthArch(a,t) = 50 + delta(a,t)

// 3–5 champion outliers per patch (the "they gutted my champ" moment):
outlier(c,t) ∈ {−10 .. +10}, drawn for a seeded handful; 0 for everyone else

// effective champion strength (what the draft reads):
strength(c,t) = clamp( basePower(c)
                + Σ styleTags(c)[a] * delta(a,t)
                + outlier(c,t), 20, 90 )
```

Derived per role: a **tier list** (S ≥ 62, A ≥ 55, B ≥ 47, C below) with movement arrows. Deterministic; the tier list is a pure function of `(seed, patchIndex)`.

## 3. Preparation — the manager's lever

Each org carries **patchFamiliarity ∈ 0..100** per patch, starting at 25 on patch day:

```
weeklyGain = 22 * scrimShare * (0.5 + 0.5*coachAdaptability/100)
```

Familiarity does not change champion strength — it changes **how well you and your coach evaluate it**: the draft AI's noise σ shrinks with familiarity, coach suggestions sharpen, and the meta chips on the draft board go from "estimated" to "confirmed". Skimp on patch prep and you draft last patch's tier list — visibly, in the post-draft review.

**Players adapt individually:** a champion whose strength rose faster than a player's pool can follow plays at `effectiveProf = prof − lag`, where lag melts at `learningRate`-speed over 2–3 weeks. Deep-pool players (`adaptability`, broad `championAptitude`) barely feel patches; a one-trick's team value swings exactly like their ladder rank does (`b_meta`).

## 4. Surfaces

- **Meta Report screen** — per-role tier lists, biggest movers, your roster's fit ("your bot lane's pool lost 9 strength this patch"), rival-team fit.
- **Patch notes inbox item** — flavor + humor slot (fictional balance-team voice: *"Grombak's boulders now respect the laws of physics. Grombak mains in shambles."*). The Crowd reacts on patch day.
- **Draft board** — tier chips + arrows on every champion card (draft doc §6).

## 5. Determinism & tests

Pure functions of `(seed, patchIndex)` on the `meta` stream. Golden tests: snapshot 10 patches of tier lists on a fixed seed; property: every archetype returns to ≥45 strength within 4 patches of its trough (mean reversion holds); ladder `b_meta` and draft `strength()` read identical values.
