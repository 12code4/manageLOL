/**
 * The fictional world's regions — CONTENT, not rules.
 *
 * Four major regions (distinct competitive cultures and wealth), plus emerging
 * regions abstracted as a pool. Everything here is fictional and IP-safe (no
 * Riot league/region names). Each region biases player generation so scouting
 * abroad feels different (taxonomy §12): a region of mechanical prodigies vs one
 * of disciplined macro players, etc.
 *
 * These are TS data structures for now; the eventual form is JSON packs validated
 * by zod (tech plan §6). Kept in `packages/data` so `core` never hardcodes content.
 */

export type RegionId = 'kyo' | 'tia' | 'mer' | 'van' | 'wilds';
export type LanguageId = 'common' | 'kyoril' | 'tianhua' | 'meric' | 'auran' | 'vanto';

export interface RegionDef {
  id: RegionId;
  name: string;
  /** Adjectival demonym, e.g. "Kyorin talent". */
  demonym: string;
  blurb: string;
  /** Native languages spoken here (index 0 is the primary). */
  languages: LanguageId[];
  /** Relative org wealth / prize scale (1.0 = world median). */
  wealth: number;
  /** Relative depth of the talent pool (population on the ladder). */
  talentDepth: number;
  /**
   * Additive biases (in attribute points) applied to a region's players at
   * generation. Sparse: only the attributes that give the region its identity.
   */
  attrBias: Partial<Record<string, number>>;
  /** Syllable pools for generating fictional player handles (gamer tags). */
  handle: { onsets: string[]; nuclei: string[]; codas: string[] };
}

export const REGIONS: readonly RegionDef[] = [
  {
    id: 'kyo',
    name: 'Kyorin',
    demonym: 'Kyorin',
    blurb:
      'The proving ground. A brutal solo-queue ladder and a culture of endless practice forge the most mechanically precise players in the world — and the least forgiving fans.',
    languages: ['kyoril', 'common'],
    wealth: 1.05,
    talentDepth: 1.6,
    attrBias: {
      mechanics: 8, reflexes: 7, laning: 6, waveManagement: 5, consistency: 4,
      professionalism: 6, workEthic: 6, streamAppeal: -3,
    },
    handle: {
      onsets: ['Se', 'Ky', 'Ji', 'Ha', 'Do', 'Mu', 'Ry', 'Ta', 'Wo', 'Bi', 'Gu', 'Sh'],
      nuclei: ['a', 'eo', 'u', 'i', 'o', 'ae', 'ya'],
      codas: ['n', 'k', 'ng', 'l', 'm', 'ru', 'ho', ''],
    },
  },
  {
    id: 'tia',
    name: 'Tianxu',
    demonym: 'Tianxu',
    blurb:
      'The gold rush. Enormous money, deep talent, and a relentlessly aggressive style. Superteams are built and detonated here faster than anywhere else.',
    languages: ['tianhua', 'common'],
    wealth: 1.5,
    talentDepth: 1.5,
    attrBias: {
      teamfighting: 7, playstyleAggression: 10, mechanics: 5, objectiveControl: 5,
      ego: 5, ambition: 6, mapAwareness: -2,
    },
    handle: {
      onsets: ['Xi', 'Zh', 'Ru', 'Ka', 'Ll', 'Sh', 'Ti', 'Ya', 'Fo', 'We', 'Ji', 'Ma'],
      nuclei: ['a', 'ao', 'e', 'ai', 'ou', 'u', 'ei'],
      codas: ['n', 'ng', 'o', 'i', 'x', 'ge', 'ke', ''],
    },
  },
  {
    id: 'mer',
    name: 'Meridia',
    demonym: 'Meridian',
    blurb:
      'The tacticians. A multilingual patchwork of proud nations that wins on preparation, shotcalling, and drafting rather than raw hands. Home of the great strategic minds.',
    languages: ['meric', 'auran', 'common'],
    wealth: 1.1,
    talentDepth: 1.2,
    attrBias: {
      rotations: 7, shotcalling: 6, adaptability: 6, visionControl: 5, leadership: 5,
      communication: 6, mediaHandling: 4, mechanics: -3,
    },
    handle: {
      onsets: ['Ca', 'Vi', 'Lu', 'Ma', 'Re', 'Th', 'Ni', 'Ga', 'Br', 'El', 'Or', 'Fe'],
      nuclei: ['a', 'e', 'i', 'o', 'au', 'ie', 'ea'],
      codas: ['s', 'x', 'n', 'r', 'z', 'll', 'ne', ''],
    },
  },
  {
    id: 'van',
    name: 'Vantia',
    demonym: 'Vantian',
    blurb:
      'The marketplace. The richest orgs and the biggest streamers, forever importing stars and forever falling short on the international stage. Brand is king.',
    languages: ['vanto', 'common'],
    wealth: 1.55,
    talentDepth: 0.85,
    attrBias: {
      starPower: 8, streamAppeal: 10, marketability: 8, fanbase: 6, ego: 4,
      mechanics: -2, professionalism: -3, consistency: -3,
    },
    handle: {
      onsets: ['Ja', 'Ma', 'Da', 'Ko', 'Ze', 'Ni', 'Bl', 'Tr', 'Sn', 'Vi', 'Ra', 'Cl'],
      nuclei: ['a', 'e', 'i', 'o', 'u', 'ay', 'oo'],
      codas: ['x', 'z', 'n', 'r', 'sh', 'ke', 'per', ''],
    },
  },
  {
    id: 'wilds',
    name: 'the Wilds',
    demonym: 'Wildcard',
    blurb:
      'The frontier. A dozen scrappy emerging scenes with little money but the occasional raw prodigy who upsets the giants and gets bought within a season.',
    languages: ['common'],
    wealth: 0.5,
    talentDepth: 1.0,
    attrBias: {
      potential: 4, playstyleRiskTaking: 8, consistency: -6, professionalism: -4, mechanics: 2,
    },
    handle: {
      onsets: ['Ak', 'Zu', 'Ne', 'Ov', 'Ka', 'Ri', 'Ta', 'Yo', 'Mi', 'Du', 'Fa', 'Pe'],
      nuclei: ['a', 'e', 'i', 'o', 'u', 'ia', 'ou'],
      codas: ['n', 'k', 's', 'r', 'm', 'to', 'vi', ''],
    },
  },
];

export const REGION_BY_ID: Readonly<Record<RegionId, RegionDef>> = Object.fromEntries(
  REGIONS.map((r) => [r.id, r]),
) as Record<RegionId, RegionDef>;

export const LANGUAGES: Readonly<Record<LanguageId, string>> = {
  common: 'Common',
  kyoril: 'Kyoril',
  tianhua: 'Tianhua',
  meric: 'Meric',
  auran: 'Auran',
  vanto: 'Vanto',
};
