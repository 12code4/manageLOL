/**
 * The launch champion roster — 48 fictional champions. CONTENT, not rules.
 *
 * Spec: docs/05-systems/draft-and-champions.md §3. Fully IP-safe: no Riot
 * names anywhere. `styleTags` weights (sum ≈ 1) feed proficiency ceilings;
 * `curve` (sum = 1) feeds comp coherence; `comboTags` anchor the meshing
 * combo gates; `chatLines` feed The Crowd. `counters` lists champions this
 * champion beats (sparse, tunable).
 *
 * Distribution: Top 10 · Jungle 9 · Mid 10 · Bot 9 · Support 10, with 8 flex.
 */

// Local vocabulary (mirrors core's enums; data must not import from core).
export type ChampRole = 'top' | 'jungle' | 'mid' | 'bot' | 'support';
export type ChampArchetype =
  | 'tankEngage' | 'skirmisher' | 'assassin' | 'scalingCarry' | 'laneBully'
  | 'controlMage' | 'poke' | 'enchanter' | 'catcher' | 'splitPush' | 'earlyJungle';
export type ComboTag =
  | 'dive' | 'pick' | 'protectTheCarry' | 'split131' | 'pokeSiege' | 'earlyInvade' | 'frontToBack';

export interface Champion {
  id: string;
  name: string;
  epithet: string;
  roles: ChampRole[]; // [primary, ...flex]
  styleTags: Partial<Record<ChampArchetype, number>>;
  curve: { early: number; mid: number; late: number };
  comboTags: ComboTag[];
  counters: string[]; // champion ids this champion beats
  basePower: number; // ~50; patches move effective strength
  flavor: string;
  chatLines: string[];
}

export const CHAMPIONS: readonly Champion[] = [
  // ───────────────────────────── TOP (10) ─────────────────────────────
  {
    id: 'grombak', name: 'Grombak', epithet: 'the Landslide', roles: ['top'],
    styleTags: { tankEngage: 0.8, skirmisher: 0.2 }, curve: { early: 0.2, mid: 0.4, late: 0.4 },
    comboTags: ['frontToBack'], counters: ['thackery'], basePower: 52,
    flavor: 'A hillside that got up one day and decided it had opinions.',
    chatLines: ['GROMBAK SMASH', 'the hill is walking again CLAP'],
  },
  {
    id: 'serelith', name: 'Serelith', epithet: 'Blade of the Hollow', roles: ['top'],
    styleTags: { skirmisher: 0.6, splitPush: 0.4 }, curve: { early: 0.3, mid: 0.45, late: 0.25 },
    comboTags: ['split131'], counters: ['bruna'], basePower: 51,
    flavor: 'Duels anything that steps into the side lane. Anything.',
    chatLines: ['serelith top = free sidelane', '1v1 me at bastion two'],
  },
  {
    id: 'vann', name: 'Vann', epithet: 'the Last Door', roles: ['top'],
    styleTags: { tankEngage: 0.9, skirmisher: 0.1 }, curve: { early: 0.15, mid: 0.35, late: 0.5 },
    comboTags: ['frontToBack'], counters: ['serelith'], basePower: 49,
    flavor: 'When Vann closes, nothing else opens.',
    chatLines: ['the door is LOCKED', 'good luck diving THAT'],
  },
  {
    id: 'okkra', name: 'Okkra', epithet: 'Warden of Thorns', roles: ['top', 'support'],
    styleTags: { tankEngage: 0.5, controlMage: 0.5 }, curve: { early: 0.3, mid: 0.4, late: 0.3 },
    comboTags: ['frontToBack', 'pick'], counters: ['jorun'], basePower: 50,
    flavor: 'Grows a hedge. The hedge grows grudges.',
    chatLines: ['OKKRA FLEX PICK?? coach is cooking', 'hedge diff'],
  },
  {
    id: 'pyrelle', name: 'Pyrelle', epithet: 'the Cinder Duelist', roles: ['top'],
    styleTags: { skirmisher: 0.7, laneBully: 0.3 }, curve: { early: 0.45, mid: 0.35, late: 0.2 },
    comboTags: ['dive'], counters: ['vann'], basePower: 52,
    flavor: 'Fights with two swords because one kept going out.',
    chatLines: ['pyrelle lane kingdom incoming', 'she is NOT here to farm'],
  },
  {
    id: 'jorun', name: 'Jorun', epithet: 'Halfwall', roles: ['top'],
    styleTags: { splitPush: 0.8, skirmisher: 0.2 }, curve: { early: 0.2, mid: 0.3, late: 0.5 },
    comboTags: ['split131'], counters: ['grombak'], basePower: 48,
    flavor: 'Built half a wall once. Has been knocking down bastions ever since.',
    chatLines: ['jorun still farming top btw', 'he has not joined a single fight LUL wait we won?'],
  },
  {
    id: 'maelis', name: 'Maelis', epithet: 'the Tidebound', roles: ['top', 'mid'],
    styleTags: { controlMage: 0.7, poke: 0.3 }, curve: { early: 0.25, mid: 0.45, late: 0.3 },
    comboTags: ['pokeSiege'], counters: ['pyrelle'], basePower: 49,
    flavor: 'The tide comes in on her schedule, not the moon’s.',
    chatLines: ['mage top? in this economy?', 'the wave respects HER wave management'],
  },
  {
    id: 'thackery', name: 'Thackery', epithet: 'Doom', roles: ['top'],
    styleTags: { skirmisher: 0.75, tankEngage: 0.25 }, curve: { early: 0.35, mid: 0.45, late: 0.2 },
    comboTags: ['dive'], counters: ['sylquin'], basePower: 50,
    flavor: 'A very cheerful knight with a deeply unfortunate family name.',
    chatLines: ['THE DOOM ARRIVES (he waved at chat)', 'nicest man in the league, 0 mercy'],
  },
  {
    id: 'bruna', name: 'Bruna', epithet: 'the Doorframe', roles: ['top'],
    styleTags: { tankEngage: 0.85, skirmisher: 0.15 }, curve: { early: 0.2, mid: 0.35, late: 0.45 },
    comboTags: ['frontToBack'], counters: ['maelis'], basePower: 50,
    flavor: 'Vann is the last door. Bruna is what the door hangs on.',
    chatLines: ['BRUNA HOLDS', 'they picked the load-bearing woman CLAP'],
  },
  {
    id: 'sylquin', name: 'Sylquin', epithet: 'of the Green', roles: ['top', 'jungle'],
    styleTags: { splitPush: 0.5, skirmisher: 0.3, earlyJungle: 0.2 }, curve: { early: 0.3, mid: 0.4, late: 0.3 },
    comboTags: ['split131', 'earlyInvade'], counters: ['okkra'], basePower: 48,
    flavor: 'Half ranger, half rumor. The trees file reports for her.',
    chatLines: ['sylquin flex WardDog', 'she’s in your jungle. she’s in your walls'],
  },

  // ─────────────────────────── JUNGLE (9) ───────────────────────────
  {
    id: 'fenwick', name: 'Fenwick', epithet: 'the Underbrush', roles: ['jungle'],
    styleTags: { earlyJungle: 0.8, catcher: 0.2 }, curve: { early: 0.55, mid: 0.3, late: 0.15 },
    comboTags: ['earlyInvade', 'dive'], counters: ['mossback'], basePower: 53,
    flavor: 'You don’t see Fenwick. You see the bush. The bush is lying.',
    chatLines: ['FENWICK IN THE BUSH. HE’S ALWAYS IN THE BUSH', 'gank at 2:40 calling it now'],
  },
  {
    id: 'korrigan', name: 'Korrigan', epithet: 'Nine-Lives', roles: ['jungle'],
    styleTags: { assassin: 0.7, skirmisher: 0.3 }, curve: { early: 0.35, mid: 0.45, late: 0.2 },
    comboTags: ['dive'], counters: ['wisp'], basePower: 51,
    flavor: 'On life seven. Spending them like he found them.',
    chatLines: ['korrigan int speedrun any%', 'he’s got lives to spare and he KNOWS it'],
  },
  {
    id: 'umbra', name: 'Umbra', epithet: 'Shade of the Path', roles: ['jungle'],
    styleTags: { assassin: 0.5, catcher: 0.5 }, curve: { early: 0.3, mid: 0.5, late: 0.2 },
    comboTags: ['pick', 'dive'], counters: ['ryx'], basePower: 49,
    flavor: 'The shortest path between two points is through Umbra. Unfortunately.',
    chatLines: ['caught by the SHADE', 'don’t walk there. don’t ever walk there'],
  },
  {
    id: 'mossback', name: 'Mossback', epithet: 'the Elder Snail', roles: ['jungle'],
    styleTags: { tankEngage: 0.85, catcher: 0.15 }, curve: { early: 0.1, mid: 0.35, late: 0.55 },
    comboTags: ['frontToBack'], counters: ['korrigan'], basePower: 47,
    flavor: 'Nature’s answer to the question: what if patience had a shell?',
    chatLines: ['PogSnail PogSnail PogSnail', 'MOSSBACK ROLLING IN (slowly) (inevitably)'],
  },
  {
    id: 'ryx', name: 'Ryx', epithet: 'the Red Harvest', roles: ['jungle'],
    styleTags: { earlyJungle: 0.7, assassin: 0.3 }, curve: { early: 0.5, mid: 0.35, late: 0.15 },
    comboTags: ['earlyInvade', 'dive'], counters: ['golgotha'], basePower: 52,
    flavor: 'Harvest season is whenever Ryx says it is.',
    chatLines: ['level 2 invade INCOMING', 'ryx pick = someone’s jungle is getting repossessed'],
  },
  {
    id: 'tinder', name: 'Tinder', epithet: 'the Spark That Took', roles: ['jungle'],
    styleTags: { earlyJungle: 0.55, skirmisher: 0.45 }, curve: { early: 0.45, mid: 0.4, late: 0.15 },
    comboTags: ['earlyInvade', 'dive'], counters: ['umbra'], basePower: 50,
    flavor: 'Started one small fire. It’s still going. So is she.',
    chatLines: ['tinder gank bot pls she always ganks bot', 'the spark is SPARKING'],
  },
  {
    id: 'golgotha', name: 'Golgotha', epithet: 'the Grave Bloom', roles: ['jungle', 'top'],
    styleTags: { tankEngage: 0.6, catcher: 0.4 }, curve: { early: 0.2, mid: 0.4, late: 0.4 },
    comboTags: ['frontToBack', 'pick'], counters: ['fenwick'], basePower: 48,
    flavor: 'Where Golgotha walks, flowers grow. Nobody asks what they grow from.',
    chatLines: ['the flowers are BLOOMING (run)', 'golgotha top flex?? GRIEF for their toplaner'],
  },
  {
    id: 'wisp', name: 'Wisp', epithet: 'the Lantern Thief', roles: ['jungle', 'support'],
    styleTags: { catcher: 0.7, earlyJungle: 0.3 }, curve: { early: 0.4, mid: 0.4, late: 0.2 },
    comboTags: ['pick', 'earlyInvade'], counters: ['tinder'], basePower: 49,
    flavor: 'Steals your light, your buffs, and — witnesses insist — your sense of direction.',
    chatLines: ['WISP TOOK THE LANTERN AGAIN', 'their whole map is dark rn LUL'],
  },
  {
    id: 'skarnfell', name: 'Skarnfell', epithet: 'the Avalanche’s Son', roles: ['jungle'],
    styleTags: { skirmisher: 0.65, tankEngage: 0.35 }, curve: { early: 0.3, mid: 0.45, late: 0.25 },
    comboTags: ['dive', 'frontToBack'], counters: ['wisp'], basePower: 49,
    flavor: 'His mother was an avalanche. Family reunions are brief.',
    chatLines: ['SKARNFELL DROPS IN', 'scrap with the avalanche kid, see what happens'],
  },

  // ───────────────────────────── MID (10) ─────────────────────────────
  {
    id: 'vexalia', name: 'Vexalia', epithet: 'the Hollow Blade', roles: ['mid'],
    styleTags: { assassin: 0.85, skirmisher: 0.15 }, curve: { early: 0.3, mid: 0.55, late: 0.15 },
    comboTags: ['dive'], counters: ['quill'], basePower: 53,
    flavor: 'The blade is hollow so it can hold what it takes.',
    chatLines: ['VEXALIA PICKED. mid is now a 1v9 role', 'their backline is about to have a bad month'],
  },
  {
    id: 'cindra', name: 'Cindra', epithet: 'Mistress of the Nine Suns', roles: ['mid'],
    styleTags: { controlMage: 0.6, scalingCarry: 0.4 }, curve: { early: 0.15, mid: 0.4, late: 0.45 },
    comboTags: ['frontToBack', 'pokeSiege'], counters: ['marrow'], basePower: 54,
    flavor: 'Owns nine suns. Rents out the light. Collects.',
    chatLines: ['NINE SUNS?? in THIS meta??', 'cindra just needs 3 items and a dream'],
  },
  {
    id: 'bellwether', name: 'Bellwether', epithet: 'the Patient Storm', roles: ['mid'],
    styleTags: { scalingCarry: 0.7, controlMage: 0.3 }, curve: { early: 0.1, mid: 0.3, late: 0.6 },
    comboTags: ['frontToBack', 'protectTheCarry'], counters: ['oleander'], basePower: 51,
    flavor: 'The storm arrives exactly when it said it would. Check the forecast. It’s you.',
    chatLines: ['bellwether pick = FF timers off, we’re going 45 minutes', 'the forecast says GRIEF for you specifically'],
  },
  {
    id: 'quill', name: 'Quill', epithet: 'the Ink-Fingered', roles: ['mid'],
    styleTags: { poke: 0.8, controlMage: 0.2 }, curve: { early: 0.35, mid: 0.45, late: 0.2 },
    comboTags: ['pokeSiege'], counters: ['tolliver'], basePower: 49,
    flavor: 'Writes your obituary from 900 units away. Excellent penmanship.',
    chatLines: ['poked to death by STATIONERY', 'quill mains type in cursive'],
  },
  {
    id: 'marrow', name: 'Marrow', epithet: 'the Borrowed King', roles: ['mid'],
    styleTags: { assassin: 0.55, laneBully: 0.45 }, curve: { early: 0.45, mid: 0.4, late: 0.15 },
    comboTags: ['dive'], counters: ['hesper'], basePower: 51,
    flavor: 'Borrowed the crown. And the sword. And, technically, the kingdom.',
    chatLines: ['the king has ARRIVED (illegally)', 'marrow lane = their mid is renting now'],
  },
  {
    id: 'oleander', name: 'Oleander', epithet: 'the Kind Poison', roles: ['mid'],
    styleTags: { controlMage: 0.8, enchanter: 0.2 }, curve: { early: 0.25, mid: 0.45, late: 0.3 },
    comboTags: ['frontToBack'], counters: ['vexalia'], basePower: 50,
    flavor: 'Genuinely wants you to feel comfortable. For as long as that lasts.',
    chatLines: ['so polite. so toxic. oleander CLAP', 'assassins can’t even touch this man'],
  },
  {
    id: 'zaffre', name: 'Zaffre', epithet: 'the Cobalt Comet', roles: ['mid', 'bot'],
    styleTags: { poke: 0.6, laneBully: 0.4 }, curve: { early: 0.4, mid: 0.4, late: 0.2 },
    comboTags: ['pokeSiege'], counters: ['bellwether'], basePower: 50,
    flavor: 'Seen once every game, screaming, at your health bar.',
    chatLines: ['COMET SIGHTED', 'zaffre flex — is it mid is it bot NOBODY KNOWS'],
  },
  {
    id: 'hesper', name: 'Hesper', epithet: 'Dawn’s Accountant', roles: ['mid'],
    styleTags: { scalingCarry: 0.85, controlMage: 0.15 }, curve: { early: 0.1, mid: 0.25, late: 0.65 },
    comboTags: ['protectTheCarry', 'frontToBack'], counters: ['cindra'], basePower: 50,
    flavor: 'Every minion, every coin, itemized. The invoice arrives at minute 35.',
    chatLines: ['hesper_invoice: your 20 min lead has been AUDITED', 'she’s just farming. she’ll bill you later'],
  },
  {
    id: 'nix', name: 'Nix', epithet: 'Vane', roles: ['mid'],
    styleTags: { assassin: 0.6, laneBully: 0.4 }, curve: { early: 0.4, mid: 0.45, late: 0.15 },
    comboTags: ['dive'], counters: ['zaffre'], basePower: 49,
    flavor: 'Turns with the wind. The wind has terrible intentions.',
    chatLines: ['nix vane one trick spotted (it’s always a one trick)', 'which way is the wind blowing? at YOUR carry'],
  },
  {
    id: 'tolliver', name: 'Tolliver', epithet: 'the Unlicensed Wizard', roles: ['mid'],
    styleTags: { controlMage: 0.7, poke: 0.3 }, curve: { early: 0.3, mid: 0.45, late: 0.25 },
    comboTags: ['pokeSiege', 'frontToBack'], counters: ['nix'], basePower: 48,
    flavor: 'Regulatory status: pending. Fireballs: fully operational.',
    chatLines: ['is he even allowed to cast that', 'TOLLIVER: not certified, not sorry'],
  },

  // ───────────────────────────── BOT (9) ─────────────────────────────
  {
    id: 'seraphel', name: 'Seraphel', epithet: 'the Longshot', roles: ['bot'],
    styleTags: { scalingCarry: 0.85, poke: 0.15 }, curve: { early: 0.1, mid: 0.3, late: 0.6 },
    comboTags: ['protectTheCarry', 'frontToBack'], counters: ['whistler'], basePower: 53,
    flavor: 'Nobody believed in her at 15 minutes. Nobody was still alive at 40 to apologize.',
    chatLines: ['seraphel 3 items = gg CLAP', 'protect the longshot at ALL costs'],
  },
  {
    id: 'brindle', name: 'Brindle', epithet: 'the Powder Fox', roles: ['bot'],
    styleTags: { laneBully: 0.8, skirmisher: 0.2 }, curve: { early: 0.55, mid: 0.3, late: 0.15 },
    comboTags: ['dive', 'earlyInvade'], counters: ['seraphel'], basePower: 52,
    flavor: 'A fox found a musket. Evolution is still processing this.',
    chatLines: ['FOX WITH A GUN FOX WITH A GUN', 'lane over by 6 minutes calling it'],
  },
  {
    id: 'rooke', name: 'Rooke', epithet: 'the Calamity', roles: ['bot'],
    styleTags: { laneBully: 0.55, poke: 0.45 }, curve: { early: 0.45, mid: 0.4, late: 0.15 },
    comboTags: ['pokeSiege'], counters: ['pip'], basePower: 50,
    flavor: 'Insurance companies have a clause named after her.',
    chatLines: ['ROOKE CLAUSE ACTIVATED', 'their bot lane’s premiums just went UP'],
  },
  {
    id: 'whistler', name: 'Whistler', epithet: 'the Quiet Round', roles: ['bot'],
    styleTags: { poke: 0.75, scalingCarry: 0.25 }, curve: { early: 0.3, mid: 0.45, late: 0.25 },
    comboTags: ['pokeSiege', 'pick'], counters: ['ferrous'], basePower: 49,
    flavor: 'You hear the whistle. That means it missed. You never hear the one that doesn’t.',
    chatLines: ['*whistling stops* uh oh', 'sniped from ACTUAL narnia'],
  },
  {
    id: 'ferrous', name: 'Ferrous', epithet: 'the Iron Songbird', roles: ['bot'],
    styleTags: { scalingCarry: 0.75, laneBully: 0.25 }, curve: { early: 0.2, mid: 0.35, late: 0.45 },
    comboTags: ['protectTheCarry', 'frontToBack'], counters: ['brindle'], basePower: 51,
    flavor: 'Sings one note. It’s the note bastions fall on.',
    chatLines: ['the songbird is WARMING UP', 'iron bird go brrr (metallic)'],
  },
  {
    id: 'duskrow', name: 'Duskrow', epithet: 'the Carrion Prince', roles: ['bot', 'mid'],
    styleTags: { scalingCarry: 0.5, assassin: 0.5 }, curve: { early: 0.2, mid: 0.4, late: 0.4 },
    comboTags: ['dive', 'split131'], counters: ['halcyra'], basePower: 50,
    flavor: 'Royalty among crows. The inheritance is whatever you drop.',
    chatLines: ['DUSKROW FLEX — draft cooking detected', 'the crows are circling your gold'],
  },
  {
    id: 'pip', name: 'Pip', epithet: 'the Smallest Cannon', roles: ['bot'],
    styleTags: { scalingCarry: 0.8, poke: 0.2 }, curve: { early: 0.15, mid: 0.3, late: 0.55 },
    comboTags: ['protectTheCarry'], counters: ['mordell'], basePower: 49,
    flavor: 'Legally a siege weapon. Emotionally a golden retriever.',
    chatLines: ['PIP PogSnail wait wrong emote. PIP CLAP', 'smallest champ, largest damage numbers, no notes'],
  },
  {
    id: 'halcyra', name: 'Halcyra', epithet: 'Wings of the Ninth', roles: ['bot'],
    styleTags: { poke: 0.55, scalingCarry: 0.45 }, curve: { early: 0.25, mid: 0.4, late: 0.35 },
    comboTags: ['pokeSiege', 'protectTheCarry'], counters: ['rooke'], basePower: 49,
    flavor: 'Eight squadrons fell. The ninth learned to stay out of range.',
    chatLines: ['death from above, taxes from nowhere', 'halcyra siege comp = bastions crying rn'],
  },
  {
    id: 'mordell', name: 'Mordell', epithet: 'the Debt Collector', roles: ['bot'],
    styleTags: { laneBully: 0.7, skirmisher: 0.3 }, curve: { early: 0.5, mid: 0.35, late: 0.15 },
    comboTags: ['dive', 'earlyInvade'], counters: ['duskrow'], basePower: 50,
    flavor: 'Every trade in lane is a loan. Mordell charges interest.',
    chatLines: ['MORDELL COLLECTING EARLY', 'their ADC owes him money and his lane'],
  },

  // ─────────────────────────── SUPPORT (10) ───────────────────────────
  {
    id: 'lumen', name: 'Lumen', epithet: 'the Second Sunrise', roles: ['support'],
    styleTags: { enchanter: 0.85, controlMage: 0.15 }, curve: { early: 0.25, mid: 0.35, late: 0.4 },
    comboTags: ['protectTheCarry', 'frontToBack'], counters: ['grapnel'], basePower: 51,
    flavor: 'If the first sunrise didn’t fix it, Lumen brings another.',
    chatLines: ['LUMEN HEALS THROUGH THE GRIEF', 'their carry is literally unkillable rn'],
  },
  {
    id: 'thistle', name: 'Thistle', epithet: 'the Overbearing Gardener', roles: ['support'],
    styleTags: { enchanter: 0.7, catcher: 0.3 }, curve: { early: 0.35, mid: 0.4, late: 0.25 },
    comboTags: ['protectTheCarry'], counters: ['yorrel'], basePower: 49,
    flavor: 'You WILL be watered. You WILL grow. This is not a negotiation.',
    chatLines: ['thistle said GROW and the adc GREW', 'aggressively nurtured CLAP'],
  },
  {
    id: 'grapnel', name: 'Grapnel', epithet: 'the Harbor Ghost', roles: ['support'],
    styleTags: { catcher: 0.9, tankEngage: 0.1 }, curve: { early: 0.4, mid: 0.4, late: 0.2 },
    comboTags: ['pick'], counters: ['miriel'], basePower: 52,
    flavor: 'Something in the harbor throws hooks. The harbormaster stopped asking.',
    chatLines: ['HOOK CITY POPULATION: YOU', 'grapnel landed ONE hook and chat lost its mind'],
  },
  {
    id: 'vharn', name: 'Auntie Vharn', epithet: 'the Unmoved', roles: ['support'],
    styleTags: { enchanter: 0.55, tankEngage: 0.45 }, curve: { early: 0.25, mid: 0.4, late: 0.35 },
    comboTags: ['protectTheCarry', 'frontToBack'], counters: ['kraywn'], basePower: 48,
    flavor: 'Everyone’s aunt. Nobody’s pushover. Brings snacks to teamfights.',
    chatLines: ['AUNTIE IS HERE. everyone behave', 'she peeled that with a HANDBAG'],
  },
  {
    id: 'basalt', name: 'Basalt', epithet: 'the Patient Wall', roles: ['support'],
    styleTags: { tankEngage: 0.9, catcher: 0.1 }, curve: { early: 0.2, mid: 0.4, late: 0.4 },
    comboTags: ['frontToBack'], counters: ['grapnel'], basePower: 49,
    flavor: 'Walls fall. Basalt waits. Then Basalt falls — forward, on purpose, on you.',
    chatLines: ['THE WALL ENGAGES', 'basalt front line = free real estate behind him'],
  },
  {
    id: 'yorrel', name: 'Yorrel', epithet: 'Keeper of the Toll', roles: ['support'],
    styleTags: { catcher: 0.75, tankEngage: 0.25 }, curve: { early: 0.35, mid: 0.45, late: 0.2 },
    comboTags: ['pick'], counters: ['sable'], basePower: 49,
    flavor: 'Crossing the river is free. Crossing Yorrel’s river costs exactly one positioning error.',
    chatLines: ['TOLL PAID (it was their midlaner)', 'yorrel just taxed the whole botlane'],
  },
  {
    id: 'sable', name: 'Sable', epithet: 'the Last Candle', roles: ['support'],
    styleTags: { enchanter: 0.8, poke: 0.2 }, curve: { early: 0.2, mid: 0.35, late: 0.45 },
    comboTags: ['protectTheCarry'], counters: ['basalt'], basePower: 48,
    flavor: 'When every other light goes out, Sable is still burning. Quietly. Stubbornly.',
    chatLines: ['sable keeping this team alive EMOTIONALLY and literally', 'the candle STAYS lit'],
  },
  {
    id: 'kraywn', name: 'Kraywn', epithet: 'the Undertow', roles: ['support'],
    styleTags: { catcher: 0.55, tankEngage: 0.45 }, curve: { early: 0.35, mid: 0.45, late: 0.2 },
    comboTags: ['pick', 'dive'], counters: ['lumen'], basePower: 50,
    flavor: 'The current that pulls you exactly where you swore you wouldn’t go.',
    chatLines: ['UNDERTOW GOT HIM', 'kraywn engage = swim lessons cancelled'],
  },
  {
    id: 'miriel', name: 'Miriel', epithet: 'Chorus of One', roles: ['support', 'mid'],
    styleTags: { enchanter: 0.5, poke: 0.5 }, curve: { early: 0.3, mid: 0.4, late: 0.3 },
    comboTags: ['pokeSiege', 'protectTheCarry'], counters: ['thistle'], basePower: 48,
    flavor: 'Sings every part herself. The harmony hits like a volley.',
    chatLines: ['one woman CHOIR', 'miriel mid?? the flex tech is real'],
  },
  {
    id: 'ogden', name: 'Ogden', epithet: 'the Round Table', roles: ['support'],
    styleTags: { tankEngage: 0.85, enchanter: 0.15 }, curve: { early: 0.2, mid: 0.4, late: 0.4 },
    comboTags: ['frontToBack'], counters: ['korrigan'], basePower: 49,
    flavor: 'The knights sat around him for years before anyone realized.',
    chatLines: ['OGDEN IS THE TABLE. HE WAS ALWAYS THE TABLE', 'flip the table CLAP wait he flipped THEM'],
  },
];

export const CHAMPION_BY_ID: Readonly<Record<string, Champion>> = Object.fromEntries(
  CHAMPIONS.map((c) => [c.id, c]),
) as Record<string, Champion>;
