# manageLOL — UI Architecture & Layout

*The screen map, navigation model, core interaction flows, and the codified design system. Wireframes for the two biggest new surfaces (Draft Board, Match Day) are included inline below — this doc's sketches are **format B**; the same screens exist as an editable design canvas (**format A**, linked from the session) so both formats can be compared before we standardize.*

---

## 1. Navigation model

A persistent left rail in five groups (the prototype's rail grows into this), a top status strip, and one modal surface (Match Day) that takes over when a match starts. **Continue** is the single primary action in the top strip — it advances to the next thing that needs you (FM's model), so the game is playable almost entirely from Dashboard + Continue.

```
TOP STRIP   [manageLOL]  ..........................  Week 14 · Split 1 | 128◈ | Rep 41 | ▶ CONTINUE

CLUB        Dashboard / Inbox        ← home; the narrative engine
            Finances                 cash flow, wage bill, projections
            Staff                    coach, analyst, psychologist
            Facilities               training house, scouting network, content studio

SQUAD       Roster                   the five + bench; lineup setting
            Player                   (drill-in) full profile: attributes, growth, pool, contract
            Training                 the weekly plan: scrims / solo queue / VOD / drills / rest
            Chemistry                the Chemistry Web + analyst reads

SCOUTING    Ladder                   the fogged ranked ladder browser
            Shortlist                pinned prospects, passive scouting drip
            Market                   contracted players, free agents, buyout targets

SEASON      Schedule                 calendar; next match; patch timeline
            Competition              tables, brackets, championship points, the pyramid
            Meta Report              patch tier lists, movers, roster fit
            Match Day                (modal) prep → draft → live → post

BUSINESS    Sponsors                 offers, active deals, clauses
            Board                    season goals, expectations, franchising criteria
```

Rule of thumb: **a screen exists only if it hosts a decision** (pillar 1). Anything that's pure information joins an existing screen as a panel.

## 2. The three core flows

**Match day** (the centerpiece): `Schedule → Prep sheet (opponent scout, lineup check, chemistry state, meta chips) → DRAFT BOARD (20 actions or delegation) → LIVE VIEW (win-prob graph + timeline + Crowd) → POST-MATCH (result, box score, the "why you won/lost" attribution: draft ±, mesh ±, form ±, matchup ±)`. Each stage is one screen; back-navigation is blocked once the draft starts (as in real life).

**Signing a player:** `Ladder/Market row → prospect detail (fog panel) → Scout (repeatable) → Contact → Negotiation screen (offer/counter loop: salary, length, buyout, promises) → signed → lands on Roster with chemistry-impact preview ("signing him resets 4 pairs — projected cohesion −11 for ~6 weeks")`. The chemistry-impact preview is the signature moment of this flow: the game warns you *before* the superteam mistake.

**The weekly loop:** `Inbox (events needing decisions) → Training plan (if changing) → CONTINUE → auto-advance day-by-day until the next interrupt (match, deadline, drama event, patch day)`.

## 3. Wireframe — Draft Board (format B: in-doc sketch)

The one screen where the game is a *game*. Three columns over a champion pool; The Crowd lives in the right rail and reacts to every lock.

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  DRAFT · Game 2 of 3        PHASE: PICK 1        ⏱ 0:22        YOUR ACTION (Red)     │
├───────────────┬──────────────────────────────────────────┬───────────────────────────┤
│ YOUR SIDE (R) │            CHAMPION POOL                 │ ENEMY SIDE (B)   THE CROWD│
│               │  [search…] [role ▾] [S/A/B ▾] [combo ▾]  │                  ─────────│
│ BANS          │ ┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐     │ BANS             fenwick_ │
│ ▣ Bellwether  │ │Cin │ │Fen │ │Gra │ │Ser │ │Vex │ │…│  │ ▣ Grapnel        fan88:   │
│ ▣ Cindra      │ │ S↑ │ │ A  │ │ A↓ │ │ B  │ │ S  │     │ ▣ Ryx            THEY     │
│ ▣ ─           │ └────┘└────┘└────┘└────┘└────┘└────┘     │ ▣ ─              BANNED   │
│               │   card: name · tier chip · curve spark   │                  GRAPNEL  │
│ PICKS         │   + prof badge for YOUR assigned pilot   │ PICKS            LOL      │
│ 1 Fenwick 82p │                                          │ 1 Cindra         ───────  │
│ 2 Brindle 77p │ ┌────────────────────────────────────┐   │ 2 Vann           wardDog_ │
│ 3 ─           │ │ COACH SUGGESTS                      │  │ 3 Bellweth─ ✕    enjoyer: │
│ 4 ─           │ │ 1. Marrow — counter their mid +2.6  │  │ 4 ─              early    │
│ 5 ─           │ │ 2. Mordell — lane kingdom   +2.1    │  │ 5 ─              comp vs  │
│               │ │ 3. Kraywn — completes Dive  +1.8    │  │                  scaling, │
│ COMP READS    │ └────────────────────────────────────┘   │ COMP READS       bold LUL │
│ EARLY SNOWBALL│                                          │ TEAMFIGHT        ───────  │
│ clarity ▓▓▓░  │            [ LOCK IN  ▸ ]                │ clarity ▓▓░░     Copeium  │
│ dive: 61% gel │                                          │                  spam…    │
├───────────────┴──────────────────────────────────────────┴───────────────────────────┤
│ ⚠ PILOT: Duskrow→Maaz prof 34 (ceiling 58) · META: dive junglers +6 this patch       │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

Key behaviors: hovering a champion previews its effect on your comp meters; the warning strip (bottom) is where pilot/chemistry/meta cautions surface — loud but never blocking; delegation mode replaces LOCK IN with a "coach is drafting…" ticker you can interrupt.

## 4. Wireframe — Match Day live view (format B)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  YOUR ORG  14 ─ 9  ASHFALL      gold +2.1k      ⛨ Wardens 2-1   ⛨ Colossus 0-0  28:41│
├──────────────────────────────────────────────────────┬───────────────────────────────┤
│  WIN PROBABILITY                                     │  THE CROWD            [mute]  │
│  100 ┤                                    ▄▄▀▀       │  ───────────────────────────  │
│   50 ┤▀▀▀▄▄▄▄▄▀▀▄▄▄▄▄▄▄▄▄▀▀▀▀▄▄▄▀▀                  │  hesper_invoice: COLOSSUS     │
│    0 ┴──────────────────────────────────             │    AT 20?? GRIEF              │
│                                                      │  xXFenwickMainXx: it’s over   │
│  TIMELINE                                            │  brindle_truther: we're so    │
│  28:12 ● Teamfight at the Colossus — you win 4-1     │    back CLAP CLAP             │
│  26:40 ● Seraphel caught crossing river (Yorrel)     │  [message removed by AutoMod] │
│  24:03 ● Battering Shade → mid bastion falls         │  wardDog_enjoyer: jungle diff │
│  19:55 ● Second Warden secured — scaling online      │       …scrolls with hype…     │
├──────────────────────────────────────────────────────┴───────────────────────────────┤
│  BOX SCORE   Top·Ryyan 2/1/6 ▮6.8   Jg·Zeaysh 3/2/9 ▮7.4   Mid·Yoito ★ 6/1/5 ▮9.1 …  │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

The live view is *watched, not played* (pillar: you're the manager). Its job is narrative tension: the win-prob graph is the heartbeat, the timeline the story, the Crowd the atmosphere. Post-match replaces this layout with the attribution panel.

## 5. Design system (codifying what the prototype established)

**Palette.** Deep ink `#0d1016` ground / cool paper `#e7eaf0` in light; surfaces layered by elevation; **one gold accent** `#e3b24d` (dark) / `#9a7413` (light) spent on: active nav, primary action, key numbers, the wordmark. Semantic: gel-green, toxic-red, info-blue, warn-amber — never used decoratively. Tier gems keep their 10 mineral hues.

**Type.** Barlow Condensed 600/700 — display, team/champion names, big numbers (jersey energy). IBM Plex Sans 400–600 — UI body. IBM Plex Mono — every aligned digit (`tabular-nums`), labels, eyebrows.

**Signature components** (reuse, don't reinvent): the **fog band** (gradient range that narrows with confidence — the game's visual thesis), **tier gem** badges, the **Chemistry Web**, **pill** flags (SMURF/BOOSTED/…), the win-prob split bar, timeline dots, stat tables with mono digits. New from this round: champion cards (portrait-less: name + epithet + tier chip + curve sparkline), comp-identity meter, the Crowd rail.

**Rules.** Hairline dividers over boxes; 4–6px radii (nothing pillowy); density is a feature but every screen leads with its one decision; humor lives in flavor fields and the Crowd rail, never in data labels; both themes always; `prefers-reduced-motion` respected (the Crowd becomes a slow fade, not a scroll).

## 6. Screen inventory status

| Screen | Status |
| --- | --- |
| Dashboard/Inbox, Finances, Staff, Facilities, Board | designed at doc level; wireframes next round |
| Roster, Chemistry, Ladder, Sponsors | **live in the prototype** (v1 of each) |
| Training, Market/Negotiation, Schedule, Competition, Meta Report | spec'd in systems docs; screens next |
| **Draft Board, Match Day live** | wireframed above + on the design canvas; next prototype targets |
