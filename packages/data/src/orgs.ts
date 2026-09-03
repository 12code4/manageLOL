/**
 * Fictional esports organizations — content, not code.
 *
 * The world is populated by persistent orgs that live across seasons: they
 * sign and drop players, rise and fall through the pyramid, and accumulate
 * history. This pack is the *identity* layer only (name, tag, home region,
 * founding flavor and a personality that biases their transfer behavior);
 * every mutable stat — prestige, facilities, cash, form — is simulation state
 * owned by `core`, never stored here.
 *
 * IP stance (CLAUDE.md §IP): all names are invented. No real organization,
 * sponsor, or player name appears anywhere in this file.
 */

import type { RegionId } from './regions.js';

/**
 * How an org behaves in the market and in the front office. Personality is
 * fixed at creation and biases signing decisions, wage tolerance, and how
 * patiently it develops youth — it never touches match resolution directly.
 */
export type OrgPersonality =
  /** Buys proven ability now; overpays for stars; impatient with rebuilds. */
  | 'superteam'
  /** Signs teenagers and plays them; tolerates a bad split to grow one. */
  | 'academy'
  /** Spends within its means; renews rather than raids; stable rosters. */
  | 'stable'
  /** Chases the meta and the market; frequent roster churn, high variance. */
  | 'chaotic'
  /** Wins by preparation: coaching and analytics over raw talent. */
  | 'methodical';

export interface OrgIdentity {
  /** Slug id, stable across saves — used for RNG stream names, so never reorder. */
  id: string;
  name: string;
  /** 2–4 character scoreboard tag. Unique across the pack. */
  tag: string;
  region: RegionId;
  personality: OrgPersonality;
  /** One line of world flavor. A legitimate humor slot (see the-crowd.md §5). */
  blurb: string;
}

/**
 * The starting population. ~14 orgs per major region + the Wilds, enough to
 * fill a five-tier pyramid in one region deeply and stock the others for
 * international events. New orgs are *generated* at runtime when one folds
 * (core/src/world/orgs.ts) — this pack seeds the named, historied ones.
 */
export const ORGS: readonly OrgIdentity[] = [
  // ── Kyorin: the proving ground. Corporate, disciplined, terrifying. ──
  { id: 'kyo-hallowvane', name: 'Hallowvane', tag: 'HVN', region: 'kyo' as RegionId, personality: 'methodical', blurb: 'Twelve-hour scrim blocks and a coach who has never once raised his voice.' },
  { id: 'kyo-seorin', name: 'Seorin Dynamics', tag: 'SRD', region: 'kyo' as RegionId, personality: 'superteam', blurb: 'A conglomerate side that treats a second-place finish as a governance failure.' },
  { id: 'kyo-whitecrane', name: 'White Crane', tag: 'WCR', region: 'kyo' as RegionId, personality: 'academy', blurb: 'Their academy has produced four world champions and one very good barista.' },
  { id: 'kyo-ironpine', name: 'Ironpine', tag: 'IRP', region: 'kyo' as RegionId, personality: 'stable', blurb: 'Same five players for three years. The scene calls it stubborn until they win.' },
  { id: 'kyo-nocturn', name: 'Nocturn Guild', tag: 'NCT', region: 'kyo' as RegionId, personality: 'methodical', blurb: 'Publishes its own patch analysis. Rivals read it. Rivals still lose.' },
  { id: 'kyo-blueleaf', name: 'Blueleaf', tag: 'BLF', region: 'kyo' as RegionId, personality: 'academy', blurb: 'Signs sixteen-year-olds and lets them lose in public until they stop losing.' },
  { id: 'kyo-taeryu', name: 'Taeryu Esports', tag: 'TRY', region: 'kyo' as RegionId, personality: 'superteam', blurb: 'Buys the best player at every position. Occasionally remembers they must play together.' },
  { id: 'kyo-stonewell', name: 'Stonewell', tag: 'STW', region: 'kyo' as RegionId, personality: 'stable', blurb: 'Forty years old as a company, six as a team, and allergic to hype.' },
  { id: 'kyo-quietmoon', name: 'Quiet Moon', tag: 'QMN', region: 'kyo' as RegionId, personality: 'methodical', blurb: 'No social media presence. No interviews. An unreasonable number of trophies.' },
  { id: 'kyo-emberhold', name: 'Emberhold', tag: 'EMB', region: 'kyo' as RegionId, personality: 'chaotic', blurb: 'Rebuilds the entire roster every off-season. It has worked exactly twice.' },
  { id: 'kyo-goldenroe', name: 'Golden Roe', tag: 'GRO', region: 'kyo' as RegionId, personality: 'stable', blurb: 'Owned by a fish-processing empire. The jersey is, unavoidably, a fish.' },
  { id: 'kyo-lanternward', name: 'Lanternward', tag: 'LWD', region: 'kyo' as RegionId, personality: 'academy', blurb: 'Runs three tiers of youth teams and a genuinely excellent cafeteria.' },
  { id: 'kyo-severance', name: 'Severance', tag: 'SVR', region: 'kyo' as RegionId, personality: 'superteam', blurb: 'Named by a founder who thought it sounded cool before HR explained it.' },
  { id: 'kyo-hanbit', name: 'Hanbit Foundry', tag: 'HBF', region: 'kyo' as RegionId, personality: 'methodical', blurb: 'Machine-shop money, machine-shop attitude: measure twice, engage once.' },

  // ── Tianxu: enormous money, enormous ambition, enormous roster churn. ──
  { id: 'tia-crimsonarc', name: 'Crimson Arc', tag: 'CRA', region: 'tia' as RegionId, personality: 'superteam', blurb: 'Has never met a transfer record it did not want to break.' },
  { id: 'tia-jadeharbor', name: 'Jade Harbor', tag: 'JDH', region: 'tia' as RegionId, personality: 'stable', blurb: 'A port-city institution whose fans have opinions about everything, loudly.' },
  { id: 'tia-vermilion', name: 'Vermilion Nine', tag: 'VM9', region: 'tia' as RegionId, personality: 'chaotic', blurb: 'Nine was the lucky number. They have fielded eleven rosters since.' },
  { id: 'tia-lotusgate', name: 'Lotus Gate', tag: 'LTG', region: 'tia' as RegionId, personality: 'academy', blurb: 'Scouts the ladder obsessively and signs whoever is angriest at 4am.' },
  { id: 'tia-thunderpeak', name: 'Thunderpeak', tag: 'THP', region: 'tia' as RegionId, personality: 'superteam', blurb: 'Their owner attends every match and every press conference. Especially the bad ones.' },
  { id: 'tia-silkroute', name: 'Silk Route', tag: 'SLK', region: 'tia' as RegionId, personality: 'methodical', blurb: 'Logistics money. They talk about drafting the way freight companies talk about routes.' },
  { id: 'tia-glasswing', name: 'Glasswing', tag: 'GLW', region: 'tia' as RegionId, personality: 'chaotic', blurb: 'Beautiful to watch, structurally unsound, beloved for both.' },
  { id: 'tia-northgate', name: 'Northgate Union', tag: 'NGU', region: 'tia' as RegionId, personality: 'stable', blurb: 'Members vote on the jersey. It takes four months and nobody is happy.' },
  { id: 'tia-orchidsteel', name: 'Orchid Steel', tag: 'ORS', region: 'tia' as RegionId, personality: 'superteam', blurb: 'Steel conglomerate, orchid logo, zero sense of irony.' },
  { id: 'tia-ninefold', name: 'Ninefold', tag: 'NFD', region: 'tia' as RegionId, personality: 'methodical', blurb: 'Employs more analysts than players. The analysts have analysts.' },
  { id: 'tia-riverlantern', name: 'River Lantern', tag: 'RVL', region: 'tia' as RegionId, personality: 'academy', blurb: 'A charity foundation that accidentally became a very good esports team.' },
  { id: 'tia-blackpagoda', name: 'Black Pagoda', tag: 'BPG', region: 'tia' as RegionId, personality: 'chaotic', blurb: 'Signs a superstar, benches him, signs him back. Every single year.' },
  { id: 'tia-cloudbreak', name: 'Cloudbreak', tag: 'CBK', region: 'tia' as RegionId, personality: 'stable', blurb: 'The neutral favourite. Everyone likes them. Nobody fears them.' },
  { id: 'tia-goldenfleet', name: 'Golden Fleet', tag: 'GFL', region: 'tia' as RegionId, personality: 'superteam', blurb: 'Shipping magnate, shipping metaphors, shipping their entire roster each spring.' },

  // ── Meridia: the home region. Loud, commercial, streamer-adjacent. ──
  { id: 'mer-halcyon', name: 'Halcyon', tag: 'HAL', region: 'mer' as RegionId, personality: 'stable', blurb: 'The region’s grown-ups. Boring, solvent, permanently in the playoffs.' },
  { id: 'mer-blackrail', name: 'Blackrail', tag: 'BRL', region: 'mer' as RegionId, personality: 'methodical', blurb: 'Built out of a freight depot. Still smells faintly of diesel and spite.' },
  { id: 'mer-novaturn', name: 'Novaturn', tag: 'NVT', region: 'mer' as RegionId, personality: 'superteam', blurb: 'Venture-funded. Spends like the money is imaginary, which it partly is.' },
  { id: 'mer-driftwood', name: 'Driftwood', tag: 'DWD', region: 'mer' as RegionId, personality: 'academy', blurb: 'A coastal org that signs kids nobody has heard of and is usually right.' },
  { id: 'mer-saltandiron', name: 'Salt & Iron', tag: 'SAI', region: 'mer' as RegionId, personality: 'chaotic', blurb: 'Their content team is better than their coaching staff and everyone knows it.' },
  { id: 'mer-atlascorp', name: 'Atlas Collective', tag: 'ATC', region: 'mer' as RegionId, personality: 'stable', blurb: 'Player-owned. Democratic. Slow. Occasionally magnificent.' },
  { id: 'mer-vulture', name: 'Vulture Club', tag: 'VUL', region: 'mer' as RegionId, personality: 'chaotic', blurb: 'Buys distressed talent at a discount. Sometimes the discount was correct.' },
  { id: 'mer-brightside', name: 'Brightside', tag: 'BRS', region: 'mer' as RegionId, personality: 'academy', blurb: 'Relentlessly wholesome. The crowd finds this suspicious.' },
  { id: 'mer-kestrel', name: 'Kestrel', tag: 'KST', region: 'mer' as RegionId, personality: 'methodical', blurb: 'Small budget, enormous prep. The team nobody wants to draw in a gauntlet.' },
  { id: 'mer-goldenhour', name: 'Golden Hour', tag: 'GHR', region: 'mer' as RegionId, personality: 'superteam', blurb: 'An entertainment label that signed five pros and a documentary crew.' },
  { id: 'mer-ferrous', name: 'Ferrous', tag: 'FER', region: 'mer' as RegionId, personality: 'stable', blurb: 'Has finished exactly fourth for six consecutive splits. It is becoming a bit.' },
  { id: 'mer-lowtide', name: 'Low Tide', tag: 'LTD', region: 'mer' as RegionId, personality: 'chaotic', blurb: 'Named after their bank balance, which was honest of them.' },
  { id: 'mer-pinnacle', name: 'Pinnacle Divison', tag: 'PIN', region: 'mer' as RegionId, personality: 'superteam', blurb: 'Yes, the typo is in the legal name. No, they will not fix it.' },
  { id: 'mer-hearthstead', name: 'Hearthstead', tag: 'HTH', region: 'mer' as RegionId, personality: 'academy', blurb: 'Runs a bootcamp house with one bathroom and a startling success rate.' },

  // ── Vantia: old money, older grudges, immaculate branding. ──
  { id: 'van-solveig', name: 'Solveig', tag: 'SLV', region: 'van' as RegionId, personality: 'methodical', blurb: 'A century-old sporting club that added an esports section and then took over.' },
  { id: 'van-argentum', name: 'Argentum', tag: 'ARG', region: 'van' as RegionId, personality: 'superteam', blurb: 'Silver everything. Silver jersey, silver stage, silver medals, historically.' },
  { id: 'van-lindenfell', name: 'Lindenfell', tag: 'LDF', region: 'van' as RegionId, personality: 'stable', blurb: 'Owned by the city. Relegating them would cause an actual municipal crisis.' },
  { id: 'van-marchfield', name: 'Marchfield', tag: 'MFD', region: 'van' as RegionId, personality: 'academy', blurb: 'Sells its best youngster every summer and somehow keeps getting better.' },
  { id: 'van-oriflamme', name: 'Oriflamme', tag: 'ORF', region: 'van' as RegionId, personality: 'chaotic', blurb: 'Fires the coach at the first sign of trouble. There is always trouble.' },
  { id: 'van-kestenholt', name: 'Kestenholt', tag: 'KTH', region: 'van' as RegionId, personality: 'methodical', blurb: 'The most detailed scouting report in the world, delivered forty minutes late.' },
  { id: 'van-blauwvogel', name: 'Blauwvogel', tag: 'BVG', region: 'van' as RegionId, personality: 'stable', blurb: 'Fan-owned, fan-funded, and fan-criticised with unusual precision.' },
  { id: 'van-consortium', name: 'The Consortium', tag: 'CNS', region: 'van' as RegionId, personality: 'superteam', blurb: 'Nobody is entirely sure who owns them. The lawyers are excellent.' },
  { id: 'van-varangian', name: 'Varangian', tag: 'VRG', region: 'van' as RegionId, personality: 'chaotic', blurb: 'A mercenary org: highest bidder, shortest contracts, best highlight reel.' },
  { id: 'van-holloway', name: 'Holloway Athletic', tag: 'HWA', region: 'van' as RegionId, personality: 'stable', blurb: 'Football club first, esports team second, and the fans never let them forget it.' },
  { id: 'van-nordhavn', name: 'Nordhavn', tag: 'NDH', region: 'van' as RegionId, personality: 'academy', blurb: 'Cold, patient, and willing to lose for two years to win for five.' },
  { id: 'van-ravelin', name: 'Ravelin', tag: 'RVN', region: 'van' as RegionId, personality: 'methodical', blurb: 'Named for a fortification. Drafts like one, too.' },
  { id: 'van-augurey', name: 'Augurey', tag: 'AUG', region: 'van' as RegionId, personality: 'chaotic', blurb: 'Predicts its own doom in every pre-match interview, then wins 3–0.' },
  { id: 'van-castellan', name: 'Castellan', tag: 'CTL', region: 'van' as RegionId, personality: 'superteam', blurb: 'Has bought a title before. Intends to keep buying until one sticks.' },

  // ── the Wilds: unfranchised, unfunded, unbothered. ──
  { id: 'wld-tinhouse', name: 'Tin House', tag: 'TIN', region: 'wilds' as RegionId, personality: 'chaotic', blurb: 'Five friends, one gaming house, zero staff, occasional brilliance.' },
  { id: 'wld-longshot', name: 'Longshot', tag: 'LGS', region: 'wilds' as RegionId, personality: 'academy', blurb: 'Exists purely to sell players upward, and is entirely at peace with that.' },
  { id: 'wld-saltflats', name: 'Saltflats', tag: 'SLF', region: 'wilds' as RegionId, personality: 'stable', blurb: 'The most remote org in the pyramid. Their ping is a personality trait.' },
  { id: 'wld-freeport', name: 'Freeport', tag: 'FPT', region: 'wilds' as RegionId, personality: 'chaotic', blurb: 'Takes anyone with a visa problem and turns them into a cult hero.' },
  { id: 'wld-emberline', name: 'Emberline', tag: 'EML', region: 'wilds' as RegionId, personality: 'methodical', blurb: 'One coach, one whiteboard, one very specific plan that keeps working.' },
  { id: 'wld-outriders', name: 'Outriders', tag: 'OUT', region: 'wilds' as RegionId, personality: 'academy', blurb: 'Scours regions nobody scouts. Half their signings cannot legally travel yet.' },
  { id: 'wld-driftline', name: 'Driftline', tag: 'DRF', region: 'wilds' as RegionId, personality: 'stable', blurb: 'Been around eleven years, never promoted, never folded, never shut up.' },
  { id: 'wld-lastcall', name: 'Last Call', tag: 'LSC', region: 'wilds' as RegionId, personality: 'chaotic', blurb: 'Formed in a bar, funded by a bar, named after the bar. Still in the bar.' },
];

export const ORG_BY_ID: Readonly<Record<string, OrgIdentity>> = Object.freeze(
  Object.fromEntries(ORGS.map((o) => [o.id, o])),
);

/** Orgs whose home region is `region`, in pack order (deterministic). */
export function orgsOfRegion(region: RegionId): OrgIdentity[] {
  return ORGS.filter((o) => o.region === region);
}

/**
 * Name fragments for orgs generated at runtime (expansion teams, replacements
 * for folded orgs). Kept separate from the handcrafted pack so a generated org
 * never collides with a named one — `core` checks both.
 */
export const ORG_NAME_PARTS = {
  prefixes: [
    'Ash', 'Bright', 'Cinder', 'Dawn', 'Ever', 'Frost', 'Grey', 'High',
    'Iron', 'Long', 'North', 'Pale', 'Quick', 'Red', 'Stone', 'Storm',
    'Thorn', 'Vale', 'Wild', 'Wolf',
  ],
  suffixes: [
    'bank', 'crest', 'fall', 'gate', 'harbor', 'hollow', 'mark', 'reach',
    'ridge', 'spire', 'vane', 'ward', 'watch', 'wind',
  ],
  standalone: [
    'Ascendancy', 'Bastion', 'Beacon', 'Cartel', 'Chorus', 'Compass',
    'Ensemble', 'Foundry', 'Horizon', 'Lantern', 'Legion', 'Meridian',
    'Odyssey', 'Paragon', 'Quarry', 'Relay', 'Sable', 'Tempo', 'Vector',
    'Verdict', 'Vigil', 'Zenith',
  ],
  qualifiers: ['Esports', 'Gaming', 'Collective', 'Club', 'Academy', 'Union', 'Syndicate', ''],
} as const;
