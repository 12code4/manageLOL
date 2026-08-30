/**
 * Attribute metadata — the flat catalogue of every player attribute.
 *
 * Generated from the design taxonomy (docs/05-systems/players-and-attributes.md).
 * The FLAT key space here (e.g. `roleAptitudeMid`, `aptAssassin`) is the id used
 * for scouting confidence and UI display; `readAttr` maps a key to its value on
 * a nested `Player`. `group`/`visibility`/`volatility` drive generation, the fog
 * transform, and how the UI renders each attribute.
 */

import type { Player } from './types.js';

export type AttrGroup =
  | 'mechanical' | 'gameKnowledge' | 'mental' | 'roleAptitude'
  | 'championAptitude' | 'growth' | 'personality' | 'chemistryDriver'
  | 'brand' | 'state';
export type Visibility = 'visible' | 'fogged' | 'hidden';
export type Volatility = 'stableTrait' | 'slowMoving' | 'fastState';

export type AttrKey =
  | "mechanics"
  | "laning"
  | "teamfighting"
  | "reflexes"
  | "positioning"
  | "mapAwareness"
  | "waveManagement"
  | "objectiveControl"
  | "visionControl"
  | "rotations"
  | "adaptability"
  | "shotcalling"
  | "composure"
  | "consistency"
  | "focus"
  | "clutch"
  | "tiltResistance"
  | "primaryRole"
  | "secondaryRole"
  | "roleAptitudeTop"
  | "roleAptitudeJungle"
  | "roleAptitudeMid"
  | "roleAptitudeBot"
  | "roleAptitudeSupport"
  | "roleFlexibility"
  | "aptTankEngage"
  | "aptSkirmisher"
  | "aptAssassin"
  | "aptScalingCarry"
  | "aptLaneBully"
  | "aptControlMage"
  | "aptPoke"
  | "aptEnchanter"
  | "aptCatcher"
  | "aptSplitPush"
  | "aptEarlyJungle"
  | "potential"
  | "growthRate"
  | "peakAge"
  | "declineStartAge"
  | "declineRate"
  | "mechanicalDeclineBias"
  | "learningRate"
  | "workEthic"
  | "burnoutProneness"
  | "ambition"
  | "loyalty"
  | "professionalism"
  | "nationality"
  | "residencyRegion"
  | "communication"
  | "leadership"
  | "ego"
  | "temperament"
  | "coachability"
  | "introversion"
  | "mentorship"
  | "teamplayOrientation"
  | "playstyleAggression"
  | "playstyleTempo"
  | "playstyleRiskTaking"
  | "preferredArchetype"
  | "languageIds"
  | "starPower"
  | "streamAppeal"
  | "fanbase"
  | "marketability"
  | "mediaHandling"
  | "form"
  | "fatigue"
  | "morale"
  | "sharpness";

export interface AttrMeta {
  key: AttrKey;
  label: string;
  group: AttrGroup;
  visibility: Visibility;
  volatility: Volatility;
  drives: string;
}

export const ATTRIBUTE_META: readonly AttrMeta[] = [
  { key: "mechanics", label: "Mechanics", group: "mechanical", visibility: "fogged", volatility: "slowMoving", drives: "Raw outplay ceiling; per-fight upset and skirmish outplay chance." },
  { key: "laning", label: "Laning", group: "mechanical", visibility: "fogged", volatility: "slowMoving", drives: "Dominant input to the laning phase (gold/XP leads)." },
  { key: "teamfighting", label: "Teamfighting", group: "mechanical", visibility: "fogged", volatility: "slowMoving", drives: "Dominant input to the 5v5 teamfight phase." },
  { key: "reflexes", label: "Reflexes", group: "mechanical", visibility: "fogged", volatility: "slowMoving", drives: "Reaction speed modifier on mechanics/teamfighting; declines earliest with age." },
  { key: "positioning", label: "Positioning", group: "mechanical", visibility: "fogged", volatility: "slowMoving", drives: "Spacing/survivability; lowers carry death probability in fights." },
  { key: "mapAwareness", label: "Map Awareness", group: "gameKnowledge", visibility: "fogged", volatility: "slowMoving", drives: "Reduces getting-caught events; heavy jungle weight in role strength." },
  { key: "waveManagement", label: "Wave Management", group: "gameKnowledge", visibility: "fogged", volatility: "slowMoving", drives: "Feeds lane gold/XP lead generation via wave states and tempo." },
  { key: "objectiveControl", label: "Objective Control", group: "gameKnowledge", visibility: "fogged", volatility: "slowMoving", drives: "Feeds neutral-objective setup/contest windows." },
  { key: "visionControl", label: "Vision Control", group: "gameKnowledge", visibility: "fogged", volatility: "slowMoving", drives: "Team-level multiplier on mapAwareness and objectiveControl." },
  { key: "rotations", label: "Rotations", group: "gameKnowledge", visibility: "fogged", volatility: "slowMoving", drives: "Feeds the mid-game macro/tempo phase." },
  { key: "adaptability", label: "Adaptability", group: "gameKnowledge", visibility: "fogged", volatility: "slowMoving", drives: "Player-level meta re-learning and mid-series adjustment; buffers patch value loss." },
  { key: "shotcalling", label: "Shotcalling", group: "gameKnowledge", visibility: "fogged", volatility: "slowMoving", drives: "Quality of in-game calls; roster needs one high value or takes a close-out penalty." },
  { key: "composure", label: "Composure", group: "mental", visibility: "fogged", volatility: "slowMoving", drives: "In-game tilt resistance; resists throwing after a bad play." },
  { key: "consistency", label: "Consistency", group: "mental", visibility: "fogged", volatility: "slowMoving", drives: "Variance dial: sets the standard deviation of per-game performance samples." },
  { key: "focus", label: "Focus", group: "mental", visibility: "fogged", volatility: "slowMoving", drives: "Sustained attention across long days/series; guards late-series slippage." },
  { key: "clutch", label: "Clutch", group: "mental", visibility: "hidden", volatility: "slowMoving", drives: "Conditional performance modifier in elimination/Bo5-game5/Worlds contexts only." },
  { key: "tiltResistance", label: "Tilt Resistance", group: "mental", visibility: "hidden", volatility: "slowMoving", drives: "Recovery speed of form/morale after losses and drama; limits bleed into next game." },
  { key: "primaryRole", label: "Primary Role", group: "roleAptitude", visibility: "visible", volatility: "stableTrait", drives: "Main role; baseline for off-role discomfort and import/lineup construction." },
  { key: "secondaryRole", label: "Secondary Role", group: "roleAptitude", visibility: "fogged", volatility: "slowMoving", drives: "Best off-role; can develop; enables role-swap flexibility." },
  { key: "roleAptitudeTop", label: "Top Aptitude", group: "roleAptitude", visibility: "fogged", volatility: "stableTrait", drives: "Fit multiplier when played Top." },
  { key: "roleAptitudeJungle", label: "Jungle Aptitude", group: "roleAptitude", visibility: "fogged", volatility: "stableTrait", drives: "Fit multiplier when played Jungle." },
  { key: "roleAptitudeMid", label: "Mid Aptitude", group: "roleAptitude", visibility: "fogged", volatility: "stableTrait", drives: "Fit multiplier when played Mid." },
  { key: "roleAptitudeBot", label: "Bot Aptitude", group: "roleAptitude", visibility: "fogged", volatility: "stableTrait", drives: "Fit multiplier when played Bot (ADC)." },
  { key: "roleAptitudeSupport", label: "Support Aptitude", group: "roleAptitude", visibility: "fogged", volatility: "stableTrait", drives: "Fit multiplier when played Support." },
  { key: "roleFlexibility", label: "Role Flexibility", group: "roleAptitude", visibility: "hidden", volatility: "stableTrait", drives: "Off-role penalty dial: shrinks the discomfort multiplier when played off primary." },
  { key: "aptTankEngage", label: "Tank/Engage Aptitude", group: "championAptitude", visibility: "hidden", volatility: "stableTrait", drives: "Proficiency ceiling on frontline engage champions; comp-identity input." },
  { key: "aptSkirmisher", label: "Skirmisher Aptitude", group: "championAptitude", visibility: "hidden", volatility: "stableTrait", drives: "Proficiency ceiling on bruiser/duelist champions." },
  { key: "aptAssassin", label: "Assassin Aptitude", group: "championAptitude", visibility: "hidden", volatility: "stableTrait", drives: "Proficiency ceiling on burst-diver assassins." },
  { key: "aptScalingCarry", label: "Scaling Carry Aptitude", group: "championAptitude", visibility: "hidden", volatility: "stableTrait", drives: "Proficiency ceiling on hyperscaling hypercarries; late-game insurance." },
  { key: "aptLaneBully", label: "Lane Bully Aptitude", group: "championAptitude", visibility: "hidden", volatility: "stableTrait", drives: "Proficiency ceiling on early lane-dominant tempo champions." },
  { key: "aptControlMage", label: "Control Mage Aptitude", group: "championAptitude", visibility: "hidden", volatility: "stableTrait", drives: "Proficiency ceiling on zone/waveclear control mages." },
  { key: "aptPoke", label: "Poke Aptitude", group: "championAptitude", visibility: "hidden", volatility: "stableTrait", drives: "Proficiency ceiling on long-range poke/siege champions." },
  { key: "aptEnchanter", label: "Enchanter Aptitude", group: "championAptitude", visibility: "hidden", volatility: "stableTrait", drives: "Proficiency ceiling on buff/heal/shield support champions." },
  { key: "aptCatcher", label: "Catcher Aptitude", group: "championAptitude", visibility: "hidden", volatility: "stableTrait", drives: "Proficiency ceiling on hook/pick playmaking champions." },
  { key: "aptSplitPush", label: "Split Push Aptitude", group: "championAptitude", visibility: "hidden", volatility: "stableTrait", drives: "Proficiency ceiling on 1-3-1 sidelane threats." },
  { key: "aptEarlyJungle", label: "Early Jungle Aptitude", group: "championAptitude", visibility: "hidden", volatility: "stableTrait", drives: "Proficiency ceiling on early ganking/invade tempo junglers." },
  { key: "potential", label: "Potential", group: "growth", visibility: "hidden", volatility: "stableTrait", drives: "Current-ability ceiling; scouting shows only a coarse tier + confidence estimate." },
  { key: "growthRate", label: "Growth Rate", group: "growth", visibility: "hidden", volatility: "stableTrait", drives: "Speed of approach to potential in the weekly development tick." },
  { key: "peakAge", label: "Peak Age", group: "growth", visibility: "hidden", volatility: "stableTrait", drives: "Age growth stops and plateau begins." },
  { key: "declineStartAge", label: "Decline Start Age", group: "growth", visibility: "hidden", volatility: "stableTrait", drives: "Age decline begins; plateau length = declineStartAge - peakAge." },
  { key: "declineRate", label: "Decline Rate", group: "growth", visibility: "hidden", volatility: "stableTrait", drives: "Steepness of post-peak attribute decline." },
  { key: "mechanicalDeclineBias", label: "Mechanical Decline Bias", group: "growth", visibility: "hidden", volatility: "stableTrait", drives: "How much decline loads onto mechanical vs knowledge attributes." },
  { key: "learningRate", label: "Learning Rate", group: "growth", visibility: "hidden", volatility: "stableTrait", drives: "Champion-pool acquisition speed and post-patch new-champ adaptation." },
  { key: "workEthic", label: "Work Ethic", group: "growth", visibility: "fogged", volatility: "slowMoving", drives: "Training-gain multiplier in the development tick." },
  { key: "burnoutProneness", label: "Burnout Proneness", group: "growth", visibility: "hidden", volatility: "stableTrait", drives: "Fatigue-accumulation multiplier; likelihood of burnout events under grind." },
  { key: "ambition", label: "Ambition", group: "personality", visibility: "hidden", volatility: "slowMoving", drives: "Raises transfer demands and unhappiness at a stagnating org." },
  { key: "loyalty", label: "Loyalty", group: "personality", visibility: "hidden", volatility: "slowMoving", drives: "Resistance to poaching; renewal discount with a liked club." },
  { key: "professionalism", label: "Professionalism", group: "personality", visibility: "fogged", volatility: "slowMoving", drives: "Dampens drama-event probability; stabilises fatigue and form." },
  { key: "nationality", label: "Nationality", group: "personality", visibility: "visible", volatility: "stableTrait", drives: "Feeds import cap and residency rules for lineup legality." },
  { key: "residencyRegion", label: "Residency Region", group: "personality", visibility: "visible", volatility: "slowMoving", drives: "Current residency; can convert over years to relax the import cap." },
  { key: "communication", label: "Communication", group: "chemistryDriver", visibility: "hidden", volatility: "slowMoving", drives: "Meshing: backbone of pairwise synergy ramp and teamfight coordination." },
  { key: "leadership", label: "Leadership", group: "chemistryDriver", visibility: "hidden", volatility: "slowMoving", drives: "Meshing: locker-room authority; propagates morale and lifts team cohesion cap." },
  { key: "ego", label: "Ego", group: "chemistryDriver", visibility: "hidden", volatility: "slowMoving", drives: "Meshing/drama: bench intolerance and clashes between high-ego teammates; rises with fame." },
  { key: "temperament", label: "Temperament", group: "chemistryDriver", visibility: "hidden", volatility: "stableTrait", drives: "Meshing/drama: volatility amplitude of mood swings and feud escalation." },
  { key: "coachability", label: "Coachability", group: "chemistryDriver", visibility: "hidden", volatility: "slowMoving", drives: "Meshing + growth: staff/shotcaller friction and targeted-drill gain multiplier." },
  { key: "introversion", label: "Introversion", group: "chemistryDriver", visibility: "hidden", volatility: "stableTrait", drives: "Meshing/brand: slows synergy ramp with new teammates; dampens stream appeal." },
  { key: "mentorship", label: "Mentorship", group: "chemistryDriver", visibility: "hidden", volatility: "slowMoving", drives: "Meshing: veteran presence boosts young teammates' growth tick and morale." },
  { key: "teamplayOrientation", label: "Teamplay Orientation", group: "chemistryDriver", visibility: "hidden", volatility: "slowMoving", drives: "Meshing: selfish-carry vs selfless-team axis; central cohesion input." },
  { key: "playstyleAggression", label: "Playstyle Aggression", group: "chemistryDriver", visibility: "hidden", volatility: "stableTrait", drives: "Meshing: passive/aggressive tempo preference for playstyle alignment." },
  { key: "playstyleTempo", label: "Playstyle Tempo", group: "chemistryDriver", visibility: "hidden", volatility: "stableTrait", drives: "Meshing: scaling vs early-game plan preference for playstyle alignment." },
  { key: "playstyleRiskTaking", label: "Playstyle Risk-Taking", group: "chemistryDriver", visibility: "hidden", volatility: "stableTrait", drives: "Meshing + variance: safe vs high-risk flashy preference; feeds outplay/throw spread." },
  { key: "preferredArchetype", label: "Preferred Archetype", group: "chemistryDriver", visibility: "hidden", volatility: "stableTrait", drives: "Meshing: desired playstyle identity (comp-identity input, distinct from ability)." },
  { key: "languageIds", label: "Languages", group: "chemistryDriver", visibility: "visible", volatility: "stableTrait", drives: "Meshing: shared-language overlap sets synergy ramp speed across the roster." },
  { key: "starPower", label: "Star Power", group: "brand", visibility: "visible", volatility: "slowMoving", drives: "Overall fame; drives merch and sponsor tiering." },
  { key: "streamAppeal", label: "Stream Appeal", group: "brand", visibility: "visible", volatility: "slowMoving", drives: "Content/streaming draw; feeds content-studio income; dampened by introversion." },
  { key: "fanbase", label: "Fanbase", group: "brand", visibility: "visible", volatility: "slowMoving", drives: "Current following size; multiplies merch; drops with inactivity/bench." },
  { key: "marketability", label: "Marketability", group: "brand", visibility: "fogged", volatility: "stableTrait", drives: "Brand ceiling if pushed; read by sponsors and the media team." },
  { key: "mediaHandling", label: "Media Handling", group: "brand", visibility: "fogged", volatility: "slowMoving", drives: "Interview/press competence; modifies media drama events and PR sponsor clauses." },
  { key: "form", label: "Form", group: "state", visibility: "visible", volatility: "fastState", drives: "Hot/cold streak; performance multiplier 0.80-1.20." },
  { key: "fatigue", label: "Fatigue", group: "state", visibility: "visible", volatility: "fastState", drives: "Grind accumulation; up to -25% performance; scaled by burnoutProneness." },
  { key: "morale", label: "Morale", group: "state", visibility: "visible", volatility: "fastState", drives: "From results/playtime/fairness/promises; gates drama triggers and small swings." },
  { key: "sharpness", label: "Sharpness", group: "state", visibility: "visible", volatility: "fastState", drives: "Match-readiness from recent competitive play; low if benched (0.90-1.00 multiplier)." },
];

export const ATTR_BY_KEY: Readonly<Record<AttrKey, AttrMeta>> = Object.fromEntries(
  ATTRIBUTE_META.map((m) => [m.key, m]),
) as Record<AttrKey, AttrMeta>;

export const HIDDEN_KEYS: ReadonlySet<AttrKey> = new Set(
  ATTRIBUTE_META.filter((m) => m.visibility === 'hidden').map((m) => m.key),
);
export const FOGGED_KEYS: ReadonlySet<AttrKey> = new Set(
  ATTRIBUTE_META.filter((m) => m.visibility === 'fogged').map((m) => m.key),
);


/**
 * Read a numeric attribute value off a nested Player by its flat key.
 * Returns `undefined` for non-numeric attributes (roles, region, archetype,
 * languages) — those are always visible and rendered directly, never fogged.
 */
export function readAttr(p: Player, key: AttrKey): number | undefined {
  const a = p.attributes;
  const meta = ATTR_BY_KEY[key];
  switch (meta.group) {
    case 'mechanical':
      return (a.mechanical as Record<string, number>)[key];
    case 'gameKnowledge':
      return (a.gameKnowledge as Record<string, number>)[key];
    case 'mental':
      return (a.mental as Record<string, number>)[key];
    case 'growth':
      return (a.growth as Record<string, number>)[key];
    case 'brand':
      return (a.brand as Record<string, number>)[key];
    case 'state':
      return (p.state as Record<string, number>)[key];
    case 'personality':
      // ambition/loyalty/professionalism are numeric; nationality/residency are not.
      return key === 'nationality' || key === 'residencyRegion'
        ? undefined
        : (a.personality as Record<string, number>)[key];
    case 'chemistryDriver':
      // preferredArchetype (enum) and languageIds (array) are non-numeric.
      return key === 'preferredArchetype' || key === 'languageIds'
        ? undefined
        : (a.chemistry as Record<string, number>)[key];
    case 'roleAptitude': {
      if (key === 'primaryRole' || key === 'secondaryRole') return undefined;
      if (key === 'roleFlexibility') return a.roleAptitude.roleFlexibility;
      // roleAptitudeTop → top, etc.
      const role = key.slice('roleAptitude'.length).toLowerCase();
      return (a.roleAptitude as Record<string, number>)[role];
    }
    case 'championAptitude': {
      // aptTankEngage → tankEngage
      const arch = key.charAt(3).toLowerCase() + key.slice(4);
      return (a.championAptitude as Record<string, number>)[arch];
    }
    default:
      return undefined;
  }
}
