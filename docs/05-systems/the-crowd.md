# manageLOL — The Crowd (live chat & the humor layer)

*Systems deep-dive (`docs/05-systems/`). A scrolling, Twitch-chat-style crowd that reacts to drafts and matches in real time — the game's main humor engine, and a stealth readability tool: chat freaks out about the things that actually matter, which teaches the player what mattered.*

> Status: designed here, not yet in the prototype — the prototype's Compete screen currently shows only the timeline. The Crowd's home is a right-hand rail on the **Draft Board** and the **Match Day live view** (see `docs/06-ui-architecture.md`). Champion-specific lines already live in the champion pack (`chatLines` per champion).

---

## 1. What it is (and isn't)

A side rail of generated pseudo-chat from fictional viewers: reactions to picks and bans, first bloods and throws, gold swings, your org by name, patch-day discourse. It is **pure flavor** — it reads sim state and never writes it — drawn from the seeded `chat` stream so replays produce identical chaos. Collapsible and mutable; the sim is fully playable with it off.

Two jobs:
1. **Humor.** This is where the game's comedy is *loudest*. The sim's own voice stays deadpan (FM-style); the chat is the unhinged id in a box.
2. **Readability reinforcement.** Chat volume and content spike on the moments the sim considers important — a comfort ban, a chemistry-gated combo failing, a Colossus throw. If chat is screaming, something load-bearing happened.

## 2. Data model (content, moddable)

```ts
interface ChatTemplate {
  id: string;
  text: string;                 // "{champ} PICKED?? in {year}?? {emote}" — slot-filled
  trigger: ChatTrigger;         // what event class fires it (see §3)
  conditions?: {                // all optional; sparse matching
    champTag?: Archetype;       // fires for champs with this styleTag
    champId?: ChampionId;       // champion-specific (the pack's chatLines compile to these)
    compLabel?: WinCondition;   // "Early Snowball" etc.
    stateAbove?: Partial<{goldLead: number; hype: number}>;
    stateBelow?: Partial<{goldLead: number; hype: number}>;
    context?: 'winStreak'|'lossStreak'|'patchDay'|'promotion'|'rivalry'|'stall';
  };
  weight: number;               // selection weight among eligible templates
  cooldownSec: number;          // no template repeats within its cooldown
  mood: 'hype'|'grief'|'cope'|'clown'|'shine'|'neutral';
}
```

**Emotes are pack content** — fictional, so we never ship real Twitch emote names: `CLAP`, `GRIEF`, `Throwge`, `WardDog`, `PogSnail` (Mossback fandom), `Copeium`, `FFCELLO`, `BONKED`. Usernames are generated from the region handle pools with chat-flavored suffixes (`xXFenwickMainXx`, `WardDog_Enjoyer`, `hesper_invoice`).

## 3. Triggers & examples

| Trigger | Fires on | Example lines |
| --- | --- | --- |
| `ban` | any ban; louder for high-presence champs | *"they banned Grapnel LOL they're scared of hook city"* · *"tactical ban Copeium"* |
| `pick` | any pick; champion `chatLines` + archetype lines | *"MOSSBACK PogSnail PogSnail"* · *"a scaling comp vs THIS jungler? bold"* |
| `pilotWarning` | a pick under 45 proficiency | *"he has NEVER played this champ chat"* · *"coach diff incoming"* |
| `compLock` | draft completes; keyed to `WinCondition` | *"early snowball comp, win by 25 or FF"* · *"1-3-1 the map, ignore the game"* |
| `firstBlood` / `objective` | timeline events (Warden / Colossus / Battering Shade) | *"COLOSSUS AT 20?? GRIEF"* |
| `throw` / `comeback` | win-prob swing > 25 pts | *"it's over"* → 40s later → *"we're so back"* (the sacred cycle — paired templates) |
| `stall` | no kills for 8+ min | *"both teams respectfully farming. gripping stuff"* |
| `result` | series end; louder on upsets | *"jungle diff"* · *"gg go next"* · *"ref check the smurf"* |
| `patchDay` | patch drops | *"Grombak mains in shambles"* · *"my whole champ pool is C tier FFCELLO"* |
| `sponsor` | occasional, if you have a deal | *"this pause brought to you by Voltcurrent. CAFFEINATE RESPONSIBLY"* |
| `ambient` | low-rate filler | *"chat is this real"* · *"[message removed by AutoMod]"* |

## 4. Behavior

- **Hype meter** (0–100, derived: draft lock-ins, fight windows, win-prob swings) drives message rate — a lull is ~1 line/4s, a Colossus fight is a wall of `CLAP`. Rate caps keep it ambient, never a performance problem (recycle DOM nodes, ~40 visible max).
- **Selection:** eligible templates by trigger + conditions → weighted pick on the `chat` stream → slot-fill → cooldowns tick. Deterministic per `(seed, matchId)`.
- **Allegiance mix:** ~55% your fans, 30% theirs, 15% neutrals; the mix shifts with your `fanbase` — a big org's chat is *your* chat, an away crowd dunks on you. Losing streaks breed doomers; a promotion floods gold `CLAP`.

## 5. The wider humor map (where else it lives)

The rule: **the sim is deadpan, the world is funny.** Humor never obscures information — it rides on flavor fields.

- **Champion epithets & flavor** — already in the pack (*Bruna, the Doorframe* · *Tolliver, the Unlicensed Wizard* · *Hesper, Dawn's Accountant — "she'll invoice you for the deficit"*).
- **Patch notes voice** — a fictional balance team slowly losing its composure across a season of notes.
- **Sponsor copy & clauses** — already seeded (*"more money than sense"*); obligations get flavor (*"2 content days/month. Voltcurrent thanks you for your energy."*).
- **Inbox drama events** — the event templates (drama-engine spec, upcoming) are comedy-capable by construction: the role-swap request, the two mids who won't queue together, the fan petition.
- **Award names** — the Golden Ward (best support), the Landslide Trophy (most first bloods), the Doorframe Award (most damage absorbed).
- **AutoMod gags** — occasional `[message removed]`, one-week chat "slow mode" after a rivalry loss.

**Tone guardrails:** punch at *situations*, never at identities; region ribbing stays gentle and mutual; no real people, brands, or tragedy-adjacent material; the drama engine can be sad (retirements are played straight — the chat going quiet with `:saluting_face:`-style respect is itself a beat).

## 6. Determinism & tests

`chat` stream only; zero sim writes. Tests: template schema validation (all slots resolvable, cooldowns > 0); a fixed match produces a byte-identical transcript; rate caps hold at max hype; the `throw`→`comeback` pairing always resolves in order.
