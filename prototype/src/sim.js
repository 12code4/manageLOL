/* manageLOL — self-contained sim (faithful JS port of @managelol/core).
   Same algorithms as packages/core; kept dependency-free for the prototype. */
(function (root) {
  'use strict';

  // ---------- RNG (xmur3 + mulberry32) ----------
  function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return function () {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return h >>> 0;
    };
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function Rng(seed, stream) {
    const s = xmur3(seed + '::' + stream);
    this.next = mulberry32(s());
    this._spare = null;
  }
  Rng.prototype.float = function () { return this.next(); };
  Rng.prototype.range = function (lo, hi) { return lo + (hi - lo) * this.next(); };
  Rng.prototype.int = function (lo, hi) { return Math.floor(this.range(lo, hi + 1)); };
  Rng.prototype.chance = function (p) { return this.next() < Math.max(0, Math.min(1, p)); };
  Rng.prototype.pick = function (arr) { return arr[Math.floor(this.next() * arr.length)]; };
  Rng.prototype.normal = function () {
    if (this._spare !== null) { const s = this._spare; this._spare = null; return s; }
    const u1 = 1 - this.next(), u2 = this.next();
    const mag = Math.sqrt(-2 * Math.log(u1));
    this._spare = mag * Math.sin(2 * Math.PI * u2);
    return mag * Math.cos(2 * Math.PI * u2);
  };
  Rng.prototype.gaussian = function (m, sd, lo, hi) {
    let v = m + sd * this.normal();
    if (lo !== undefined) v = Math.max(lo, v);
    if (hi !== undefined) v = Math.min(hi, v);
    return v;
  };

  const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
  const c100 = (x) => clamp(x, 0, 100);
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const round = (x, dp) => { const f = Math.pow(10, dp || 0); return Math.round(x * f) / f; };
  function winProb(diff, scale) { return 1 / (1 + Math.pow(10, -diff / (scale || 120))); }

  // ---------- content: roles / archetypes / regions ----------
  const ROLES = ['top', 'jungle', 'mid', 'bot', 'support'];
  const ARCHES = ['tankEngage', 'skirmisher', 'assassin', 'scalingCarry', 'laneBully', 'controlMage', 'poke', 'enchanter', 'catcher', 'splitPush', 'earlyJungle'];
  const ROLE_ARCH = {
    top: ['tankEngage', 'skirmisher', 'splitPush', 'controlMage'],
    jungle: ['earlyJungle', 'skirmisher', 'assassin', 'tankEngage', 'catcher'],
    mid: ['assassin', 'controlMage', 'scalingCarry', 'poke', 'laneBully'],
    bot: ['scalingCarry', 'laneBully', 'poke'],
    support: ['enchanter', 'catcher', 'tankEngage'],
  };
  const REGIONS = {
    kyo: { name: 'Kyorin', wealth: 1.05, langs: ['kyoril', 'common'], bias: { mechanics: 8, reflexes: 7, laning: 6, waveManagement: 5, consistency: 4, professionalism: 6, workEthic: 6, streamAppeal: -3 }, on: ['Se', 'Ky', 'Ji', 'Ha', 'Do', 'Mu', 'Ry', 'Ta', 'Wo', 'Bi', 'Gu', 'Sh'], nu: ['a', 'eo', 'u', 'i', 'o', 'ae', 'ya'], co: ['n', 'k', 'ng', 'l', 'm', 'ru', 'ho', ''] },
    tia: { name: 'Tianxu', wealth: 1.5, langs: ['tianhua', 'common'], bias: { teamfighting: 7, playstyleAggression: 10, mechanics: 5, objectiveControl: 5, ego: 5, ambition: 6, mapAwareness: -2 }, on: ['Xi', 'Zh', 'Ru', 'Ka', 'Ll', 'Sh', 'Ti', 'Ya', 'Fo', 'We', 'Ji', 'Ma'], nu: ['a', 'ao', 'e', 'ai', 'ou', 'u', 'ei'], co: ['n', 'ng', 'o', 'i', 'x', 'ge', 'ke', ''] },
    mer: { name: 'Meridia', wealth: 1.1, langs: ['meric', 'auran', 'common'], bias: { rotations: 7, shotcalling: 6, adaptability: 6, visionControl: 5, leadership: 5, communication: 6, mediaHandling: 4, mechanics: -3 }, on: ['Ca', 'Vi', 'Lu', 'Ma', 'Re', 'Th', 'Ni', 'Ga', 'Br', 'El', 'Or', 'Fe'], nu: ['a', 'e', 'i', 'o', 'au', 'ie', 'ea'], co: ['s', 'x', 'n', 'r', 'z', 'll', 'ne', ''] },
    van: { name: 'Vantia', wealth: 1.55, langs: ['vanto', 'common'], bias: { starPower: 8, streamAppeal: 10, marketability: 8, fanbase: 6, ego: 4, mechanics: -2, professionalism: -3, consistency: -3 }, on: ['Ja', 'Ma', 'Da', 'Ko', 'Ze', 'Ni', 'Bl', 'Tr', 'Sn', 'Vi', 'Ra', 'Cl'], nu: ['a', 'e', 'i', 'o', 'u', 'ay', 'oo'], co: ['x', 'z', 'n', 'r', 'sh', 'ke', 'per', ''] },
    wilds: { name: 'the Wilds', wealth: 0.5, langs: ['common'], bias: { potential: 4, playstyleRiskTaking: 8, consistency: -6, professionalism: -4, mechanics: 2 }, on: ['Ak', 'Zu', 'Ne', 'Ov', 'Ka', 'Ri', 'Ta', 'Yo', 'Mi', 'Du', 'Fa', 'Pe'], nu: ['a', 'e', 'i', 'o', 'u', 'ia', 'ou'], co: ['n', 'k', 's', 'r', 'm', 'to', 'vi', ''] },
  };
  function handle(rng, reg) {
    const syl = () => rng.pick(reg.on) + rng.pick(reg.nu) + rng.pick(reg.co);
    let h = syl();
    if (rng.chance(0.35)) h += rng.pick(reg.nu) + rng.pick(reg.co);
    h = h.charAt(0).toUpperCase() + h.slice(1).toLowerCase();
    return h.slice(0, 10);
  }

  // ---------- player generation ----------
  function genPlayer(rng, opts) {
    const reg = REGIONS[opts.region];
    const bias = reg.bias, c = opts.qualityCenter, sd = opts.spread || 8;
    const b = (k) => c100(rng.gaussian(c + (bias[k] || 0), sd));
    const ar = opts.ageRange || [16, 27];
    const age = rng.int(ar[0], ar[1]);
    const primaryRole = opts.primaryRole || rng.pick(ROLES);
    const roleApt = {};
    ROLES.forEach((r) => { if (r !== primaryRole) roleApt[r] = c100(rng.gaussian(c - 18, 12)); });
    const bestOff = Math.max.apply(null, ROLES.filter((r) => r !== primaryRole).map((r) => roleApt[r]));
    roleApt[primaryRole] = c100(Math.max(rng.gaussian(c + 12, 6), bestOff + rng.range(2, 8)));
    const secondaryRole = ROLES.filter((r) => r !== primaryRole).sort((x, y) => roleApt[y] - roleApt[x])[0];
    const preferredArchetype = rng.pick(ROLE_ARCH[primaryRole]);
    const champ = {};
    ARCHES.forEach((a) => { let v = rng.gaussian(c - 8, 10); if (ROLE_ARCH[primaryRole].indexOf(a) >= 0) v += 12; if (a === preferredArchetype) v += 10; champ[a] = c100(v); });
    const peakAge = rng.int(20, 24), declineStartAge = peakAge + rng.int(1, 4);
    const yearsToPeak = Math.max(0, peakAge - age);
    const gapMean = yearsToPeak * 2.2 + (bias.potential || 0);
    const reflexYouth = c100((peakAge - age) * 1.3);
    const A = {
      mechanical: { mechanics: b('mechanics'), laning: b('laning'), teamfighting: b('teamfighting'), reflexes: c100(c100(rng.gaussian(c + (bias.reflexes || 0), sd)) + reflexYouth - 4), positioning: b('positioning') },
      gameKnowledge: { mapAwareness: b('mapAwareness'), waveManagement: b('waveManagement'), objectiveControl: b('objectiveControl'), visionControl: b('visionControl'), rotations: b('rotations'), adaptability: b('adaptability'), shotcalling: b('shotcalling') },
      mental: { composure: b('composure'), consistency: b('consistency'), focus: b('focus'), clutch: c100(rng.gaussian(50, 18)), tiltResistance: c100(rng.gaussian(52, 16)) },
      roleAptitude: { primaryRole: primaryRole, secondaryRole: secondaryRole, top: roleApt.top, jungle: roleApt.jungle, mid: roleApt.mid, bot: roleApt.bot, support: roleApt.support, roleFlexibility: c100(rng.gaussian(45, 18)) },
      championAptitude: champ,
      growth: { potential: 0, growthRate: c100(rng.gaussian(60, 15)), peakAge: peakAge, declineStartAge: declineStartAge, declineRate: c100(rng.gaussian(50, 15)), mechanicalDeclineBias: Math.max(0.3, rng.gaussian(1.1, 0.35)), learningRate: c100(rng.gaussian(58, 15)), workEthic: b('workEthic'), burnoutProneness: c100(rng.gaussian(45, 18)) },
      personality: { ambition: b('ambition'), loyalty: c100(rng.gaussian(50, 20)), professionalism: b('professionalism') },
      chemistry: { communication: b('communication'), leadership: c100(rng.gaussian(45, 18)), ego: c100(rng.gaussian(45, 18) + (bias.ego || 0)), temperament: c100(rng.gaussian(50, 20)), coachability: c100(rng.gaussian(55, 18)), introversion: c100(rng.gaussian(52, 20)), mentorship: c100(rng.gaussian(40, 18) + Math.max(0, age - 22) * 2), teamplayOrientation: c100(rng.gaussian(52, 18)), playstyleAggression: b('playstyleAggression'), playstyleTempo: c100(rng.gaussian(50, 20)), playstyleRiskTaking: b('playstyleRiskTaking'), preferredArchetype: preferredArchetype },
      brand: { starPower: c100(rng.gaussian(30, 15) + (bias.starPower || 0)), streamAppeal: b('streamAppeal'), fanbase: c100(rng.gaussian(25, 15) + (bias.fanbase || 0)), marketability: b('marketability'), mediaHandling: b('mediaHandling') },
    };
    const ca = currentAbility(A);
    A.growth.potential = c100(Math.max(ca + 1, ca + rng.gaussian(gapMean, 6)));
    const langs = [reg.langs[0]];
    if (reg.langs[0] !== 'common' && rng.chance(0.7)) langs.push('common');
    return {
      id: opts.id, name: handle(rng, reg), age: age, region: opts.region,
      nationality: opts.region, languageIds: langs, attributes: A,
      state: { form: Math.round(rng.gaussian(50, 8)), fatigue: Math.round(c100(rng.gaussian(15, 10))), morale: Math.round(c100(rng.gaussian(58, 12))), sharpness: Math.round(c100(rng.gaussian(70, 15))) },
    };
  }

  // ---------- ratings ----------
  function currentAbility(A) {
    const m = A.mechanical, k = A.gameKnowledge, mn = A.mental;
    const mechAvg = mean([m.mechanics, m.laning, m.teamfighting, m.reflexes, m.positioning]);
    const knowAvg = mean([k.mapAwareness, k.waveManagement, k.objectiveControl, k.visionControl, k.rotations, k.adaptability, k.shotcalling]);
    const menAvg = mean([mn.composure, mn.consistency, mn.focus, mn.clutch, mn.tiltResistance]);
    return 0.34 * mechAvg + 0.34 * knowAvg + 0.22 * menAvg + 0.10 * m.teamfighting;
  }
  const formMult = (s) => 1 + (s.form - 50) / 250;
  const fatigueMult = (s) => 1 - (s.fatigue / 100) * 0.25;
  const sharpMult = (s) => 0.9 + 0.1 * (s.sharpness / 100);
  const stateMult = (s) => formMult(s) * fatigueMult(s) * sharpMult(s);
  const roleMult = (A, r) => 0.4 + 0.6 * (A.roleAptitude[r] / 100);
  const discomfort = (A, r) => (r === A.roleAptitude.primaryRole ? 1 : 0.85 + 0.15 * (A.roleAptitude.roleFlexibility / 100));
  const effRoleMult = (A, r) => roleMult(A, r) * discomfort(A, r);
  const ROLE_W = {
    top: { laning: 0.35, mechanics: 0.2, waveManagement: 0.15, teamfighting: 0.15, mapAwareness: 0.15 },
    jungle: { mapAwareness: 0.3, objectiveControl: 0.25, mechanics: 0.2, teamfighting: 0.15, waveManagement: 0.1 },
    mid: { laning: 0.35, mechanics: 0.25, waveManagement: 0.15, mapAwareness: 0.15, teamfighting: 0.1 },
    bot: { laning: 0.3, mechanics: 0.25, teamfighting: 0.25, positioning: 0.15, waveManagement: 0.05 },
    support: { visionControl: 0.25, mapAwareness: 0.2, teamfighting: 0.2, objectiveControl: 0.15, positioning: 0.1, mechanics: 0.1 },
  };
  function roleCore(A, r) {
    const w = ROLE_W[r]; let sum = 0;
    for (const k in w) { const v = A.mechanical[k] !== undefined ? A.mechanical[k] : A.gameKnowledge[k] || 0; sum += v * w[k]; }
    return sum;
  }
  const effRoleStrength = (A, s, r) => roleCore(A, r) * effRoleMult(A, r) * stateMult(s);

  // ---------- ladder ----------
  const TIERS = [
    { key: 'slate', name: 'Slate', floor: 500 }, { key: 'copper', name: 'Copper', floor: 900 },
    { key: 'quartz', name: 'Quartz', floor: 1200 }, { key: 'amber', name: 'Amber', floor: 1500 },
    { key: 'jade', name: 'Jade', floor: 1800 }, { key: 'cobalt', name: 'Cobalt', floor: 2050 },
    { key: 'onyx', name: 'Onyx', floor: 2300 }, { key: 'ascendant', name: 'Ascendant', floor: 2600 },
    { key: 'paragon', name: 'Paragon', floor: 2850 }, { key: 'apex', name: 'Apex', floor: 3050 },
  ];
  function tierFromMmr(m) { let o = TIERS[0]; for (const t of TIERS) if (m >= t.floor) o = t; return o; }
  function divFromMmr(m) { const t = tierFromMmr(m), i = TIERS.indexOf(t), n = TIERS[i + 1]; if (!n) return 1; const w = (n.floor - t.floor) / 4; return 4 - Math.min(3, Math.floor((m - t.floor) / w)); }
  function soloAbility(A) {
    const m = A.mechanical, k = A.gameKnowledge;
    return c100(0.26 * m.mechanics + 0.16 * m.laning + 0.14 * m.teamfighting + 0.12 * k.mapAwareness + 0.10 * m.reflexes + 0.08 * m.positioning + 0.08 * k.waveManagement + 0.06 * A.mental.composure);
  }
  const SOLO_APTS = ['assassin', 'laneBully', 'skirmisher', 'scalingCarry', 'earlyJungle', 'catcher'];
  const maxSoloApt = (A) => Math.max.apply(null, SOLO_APTS.map((x) => A.championAptitude[x]));
  function computeMmr(i) {
    const RANGE = 2900, base = 500 + RANGE * Math.pow(i.soloAbility / 100, 1.6);
    const bMeta = RANGE * 0.1 * ((i.maxSoloApt - 50) / 50);
    const bMental = RANGE * 0.04 * (((i.composure - 50) / 50) + ((i.tiltResistance - 50) / 50)) / 2;
    const bRole = i.autofill ? -RANGE * 0.05 : 0;
    const steady = clamp(base + bMeta + bMental + bRole + i.boost, 500, 3400);
    const placement = 1200 + 0.15 * steady;
    const conv = 1 - Math.exp(-i.games / 120);
    const cur = clamp(placement + (steady - placement) * conv, 500, 3400);
    return { base: base, steady: steady, current: cur, tier: tierFromMmr(cur).key };
  }
  function genLadderEntity(rng, opts) {
    const plant = opts.plant || null;
    let qc = 55, ar = [16, 24];
    // Band-aware generation: the visible ladder starts at Onyx I, so accounts
    // are generated *to* a band rather than to one flat quality centre.
    const bandDef = opts.band && root.LOLSim.BAND_BY_KEY ? root.LOLSim.BAND_BY_KEY[opts.band] : null;
    if (bandDef) { qc = bandDef.qualityCenter; ar = bandDef.ageRange; }
    if (plant === 'hiddenGem' || plant === 'smurf') { qc = bandDef ? bandDef.qualityCenter - 4 : 72; ar = [16, 19]; }
    if (plant === 'boosted' || plant === 'bust') { qc = bandDef ? bandDef.qualityCenter - 6 : 58; ar = [20, 25]; }
    const player = genPlayer(rng, { id: opts.id, region: opts.region, qualityCenter: qc, ageRange: ar });
    if (plant === 'hiddenGem') player.attributes.growth.potential = c100(Math.max(player.attributes.growth.potential, 82 + rng.range(0, 10)));
    if (plant === 'bust') player.attributes.growth.potential = c100(Math.min(player.attributes.growth.potential, 55));
    if (bandDef && bandDef.potentialBonus > 0 && plant !== 'bust')
      player.attributes.growth.potential = c100(player.attributes.growth.potential + bandDef.potentialBonus);
    const solo = soloAbility(player.attributes), pot = player.attributes.growth.potential;
    const autofill = plant === 'hiddenGem' || rng.chance(0.12);
    const boost = plant === 'boosted' ? rng.range(350, 600) : (rng.chance(0.08) ? rng.range(150, 400) : 0);
    const games = (plant === 'smurf' || plant === 'hiddenGem') ? Math.round(rng.range(30, 70)) : Math.round(rng.range(140, 320));
    const derived = computeMmr({ soloAbility: solo, maxSoloApt: maxSoloApt(player.attributes), composure: player.attributes.mental.composure, tiltResistance: player.attributes.mental.tiltResistance, autofill: autofill, boost: boost, games: games });
    // A forced MMR moves only what the ladder shows; steady stays truth, so an
    // account that belongs far higher reads — correctly — as a smurf.
    const mmr = opts.forceMmr === undefined ? derived
      : { current: opts.forceMmr, steady: derived.steady, tier: tierFromMmr(opts.forceMmr).key };
    const flags = [];
    if (autofill) flags.push('autofillVictim');
    if (boost > 300) flags.push('boosted');
    if (mmr.current < mmr.steady - 250) flags.push('smurf');
    if (maxSoloApt(player.attributes) > 82 && solo < 70) flags.push('oneTrick');
    if (pot >= 80 && tierFromMmr(mmr.current).floor < TIERS[6].floor) flags.push('hiddenGem');
    if (pot < 56 && mmr.current > 2050) flags.push('bust');
    return {
      id: opts.id, handle: player.name, region: opts.region, roleGuess: player.attributes.roleAptitude.primaryRole,
      age: player.age, mmr: Math.round(mmr.current), tier: mmr.tier, division: divFromMmr(mmr.current),
      games: games, winRate: clamp(0.5 + (mmr.current - mmr.steady) / 4000 + rng.range(-0.03, 0.03), 0.4, 0.72),
      topArch: player.attributes.chemistry.preferredArchetype,
      hidden: { player: player, soloAbility: solo, steady: Math.round(mmr.steady), flags: flags, potential: pot },
    };
  }
  function revealedFlags(e, conf) {
    const out = [], has = (f) => e.hidden.flags.indexOf(f) >= 0;
    if (conf >= 0.5) { if (has('oneTrick')) out.push('oneTrick'); if (has('autofillVictim')) out.push('autofillVictim'); }
    if (conf >= 0.65) { ['smurf', 'boosted', 'hiddenGem', 'bust'].forEach((f) => { if (has(f)) out.push(f); }); }
    return out;
  }

  // ---------- meshing ----------
  const STRUCT_W = { 'bot|support': 2, 'jungle|mid': 1.6, 'jungle|top': 1.3, 'bot|jungle': 1.2, 'jungle|support': 1.1, 'mid|support': 1, 'bot|mid': 0.9, 'mid|top': 0.8, 'support|top': 0.7, 'bot|top': 0.6 };
  const STRUCT_SUM = 11.2;
  const rolePairW = (a, b) => STRUCT_W[[a, b].sort().join('|')] || 0;
  const n100 = (x) => x / 100, mean2 = (x, y) => (x + y) / 200;
  const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
  const sharedLang = (a, b) => a.languageIds.some((l) => b.languageIds.indexOf(l) >= 0);
  function pairTarget(a, b) {
    const ca = a.attributes.chemistry, cb = b.attributes.chemistry;
    const egoClash = n100(ca.ego) * n100(cb.ego);
    const egoTerm = 1 - 0.5 * egoClash * (0.5 + 0.5 * mean2(ca.temperament, cb.temperament));
    const tempTerm = 1 - 0.3 * n100(ca.temperament) * n100(cb.temperament);
    const fitPersona = egoTerm * tempTerm;
    const fitTeam = 0.7 + 0.3 * mean2(ca.teamplayOrientation, cb.teamplayOrientation);
    const diffPlay = (Math.abs(ca.playstyleAggression - cb.playstyleAggression) + Math.abs(ca.playstyleTempo - cb.playstyleTempo) + Math.abs(ca.playstyleRiskTaking - cb.playstyleRiskTaking)) / 300;
    const fitPlay = 0.6 + 0.4 * (1 - diffPlay);
    const commCeil = 0.85 + 0.15 * mean2(ca.communication, cb.communication);
    const older = a.age >= b.age ? a : b, younger = older === a ? b : a, gap = Math.abs(a.age - b.age);
    const fitMentor = 1 + 0.15 * n100(older.attributes.chemistry.mentorship) * clamp((25 - younger.age) / 8, 0, 1) * (gap >= 3 ? 1 : 0);
    return c100(100 * fitPersona * fitTeam * fitPlay * commCeil * fitMentor);
  }
  function rampSpeed(a, b) {
    const langRamp = sharedLang(a, b) ? 1 : 0.55;
    const introFac = 1 - 0.4 * mean2(a.attributes.chemistry.introversion, b.attributes.chemistry.introversion);
    const commRamp = 0.7 + 0.3 * mean2(a.attributes.chemistry.communication, b.attributes.chemistry.communication);
    return langRamp * introFac * commRamp;
  }
  function initChem(lineup) {
    const ps = ROLES.map((r) => lineup[r]).filter(Boolean), pairs = {};
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], b = ps[j], t = pairTarget(a, b);
      pairs[pairKey(a.id, b.id)] = { a: a.id, b: b.id, target: t, current: 0.35 * t, gel: 0 };
    }
    return { pairs: pairs };
  }
  function rampWeek(chem, lineup, gel) {
    const byId = {}; ROLES.forEach((r) => { if (lineup[r]) byId[lineup[r].id] = lineup[r]; });
    Object.keys(chem.pairs).sort().forEach((k) => {
      const pc = chem.pairs[k], a = byId[pc.a], b = byId[pc.b]; if (!a || !b) return;
      pc.current = c100(pc.current + 0.1 * rampSpeed(a, b) * gel * (pc.target - pc.current));
      pc.gel += gel;
    });
  }
  function reconcileChem(prev, lineup) {
    const ps = ROLES.map((r) => lineup[r]).filter(Boolean), ids = {}; ps.forEach((p) => (ids[p.id] = 1));
    const pairs = {};
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], b = ps[j], key = pairKey(a.id, b.id), ex = prev && prev.pairs[key];
      if (ex && ids[ex.a] && ids[ex.b]) pairs[key] = ex;
      else { const t = pairTarget(a, b); pairs[key] = { a: a.id, b: b.id, target: t, current: 0.35 * t, gel: 0 }; }
    }
    return { pairs: pairs };
  }
  function maxSharedLang(lineup) {
    const counts = {}; ROLES.forEach((r) => { if (lineup[r]) lineup[r].languageIds.forEach((l) => (counts[l] = (counts[l] || 0) + 1)); });
    let mx = 1; for (const l in counts) mx = Math.max(mx, counts[l]); return mx;
  }
  function cohesion(chem, lineup) {
    const roleById = {}; ROLES.forEach((r) => { if (lineup[r]) roleById[lineup[r].id] = r; });
    let weighted = 0; const list = [];
    Object.keys(chem.pairs).sort().forEach((k) => {
      const pc = chem.pairs[k], ra = roleById[pc.a], rb = roleById[pc.b]; if (!ra || !rb) return;
      weighted += rolePairW(ra, rb) * pc.current; list.push({ key: k, current: pc.current, target: pc.target, a: pc.a, b: pc.b });
    });
    const pairScore = weighted / STRUCT_SUM;
    let voices = 0; ROLES.forEach((r) => { const p = lineup[r]; if (!p) return; const call = clamp((p.attributes.gameKnowledge.shotcalling - 50) / 30, 0, 1); voices += call * (0.5 + 0.5 * n100(p.attributes.chemistry.leadership)); });
    const shotBalance = clamp(1 - 0.3 * Math.max(0, 0.8 - voices) - 0.1 * Math.max(0, voices - 2), 0.7, 1);
    const langCov = 0.9 + 0.1 * (maxSharedLang(lineup) / 5);
    const coh = pairScore * shotBalance * langCov;
    const meshMult = 0.88 + 0.24 * (coh / 100);
    const gelling = Object.keys(chem.pairs).some((k) => chem.pairs[k].current < 0.8 * chem.pairs[k].target);
    return { pairScore: pairScore, shotBalance: shotBalance, langCoverage: langCov, cohesion: coh, meshMult: meshMult, voices: voices, gelling: gelling, pairs: list };
  }

  // ---------- match ----------
  const CARRY = { top: 0.2, jungle: 0.14, mid: 0.26, bot: 0.3, support: 0.1 };
  function teamBreakdown(team) {
    const rs = {}; let sum = 0;
    ROLES.forEach((r) => { const p = team.lineup[r]; const s = p ? effRoleStrength(p.attributes, p.state, r) : 0; rs[r] = round(s, 1); sum += s; });
    const base = sum / 5 + (team.draftScore || 0);
    const co = cohesion(team.chem, team.lineup);
    return { name: team.name, roleStrength: rs, base: round(base, 1), meshMult: round(co.meshMult, 3), cohesion: round(co.cohesion, 1), strength: round(base * co.meshMult, 1) };
  }
  function genLines(team, won, totalKills, rng) {
    const lines = [], weights = ROLES.map((r) => CARRY[r] * rng.range(0.6, 1.4)), wsum = weights.reduce((s, w) => s + w, 0);
    ROLES.forEach((role, i) => {
      const p = team.lineup[role], share = weights[i] / wsum;
      const kills = Math.max(0, Math.round(totalKills * share * (won ? 1 : 0.85)));
      const deaths = Math.max(0, Math.round(rng.gaussian(won ? 1.6 : 3, 1.1)));
      const am = role === 'support' ? 1.8 : role === 'jungle' ? 1.4 : 1;
      const assists = Math.max(0, Math.round(totalKills * 0.4 * am * rng.range(0.5, 1.1)));
      let dmg = clamp(CARRY[role] * rng.range(0.75, 1.25), 0.03, 0.45);
      const kda = (kills + assists) / Math.max(1, deaths), indiv = effRoleStrength(p.attributes, p.state, role) / 100;
      const rating = clamp(3 + kda * 0.7 + indiv * 3 + (won ? 0.8 : -0.4) + rng.range(-0.6, 0.6), 0, 10);
      lines.push({ playerId: p.id, name: p.name, role: role, kills: kills, deaths: deaths, assists: assists, dmgShare: dmg, rating: round(rating, 1) });
    });
    const ds = lines.reduce((s, l) => s + l.dmgShare, 0); lines.forEach((l) => (l.dmgShare = round(l.dmgShare / ds, 3)));
    return lines;
  }
  function timeline(winName, wl, len, rng) {
    const ev = [], srt = wl.slice().sort((a, b) => b.rating - a.rating), star = srt[0], jg = wl.filter((l) => l.role === 'jungle')[0];
    ev.push('Min 3 — Both teams path safely; an even start.');
    ev.push('Min ' + rng.int(6, 10) + ' — ' + jg.name + ' finds a gank ' + rng.pick(['bot', 'top', 'mid']) + '. First blood, ' + winName + '.');
    ev.push('Min ' + rng.int(14, 20) + ' — A neutral-objective fight breaks; ' + winName + ' comes out ahead.');
    if (len > 30) ev.push('Min ' + rng.int(24, 30) + ' — The losing side stabilizes and stalls for scaling.');
    ev.push('Min ' + rng.int(28, Math.max(30, Math.floor(len) - 2)) + ' — ' + star.name + ' pops off (' + star.kills + '/' + star.deaths + '/' + star.assists + '). ' + winName + ' takes the deciding fight.');
    ev.push('Min ' + Math.round(len) + ' — ' + winName + ' closes it out.');
    return ev;
  }
  function simulateGame(a, b, rng) {
    const ba = teamBreakdown(a), bb = teamBreakdown(b), pA = winProb(ba.strength - bb.strength, 15);
    const aWins = rng.chance(pA), dom = Math.abs(pA - 0.5) * 2;
    const len = round(clamp(rng.gaussian(34 - dom * 6, 5), 22, 52), 0);
    const totalKills = Math.max(6, Math.round(rng.gaussian(24, 6) * (len / 32)));
    const wShare = 0.55 + dom * 0.2 + rng.range(-0.05, 0.05), wK = Math.round(totalKills * wShare), lK = Math.max(0, totalKills - wK);
    const lw = genLines(aWins ? a : b, true, wK, rng), ll = genLines(aWins ? b : a, false, lK, rng);
    const mvp = lw.slice().sort((x, y) => y.rating - x.rating)[0];
    return {
      winner: aWins ? 'a' : 'b', lengthMin: len, killsA: aWins ? wK : lK, killsB: aWins ? lK : wK,
      linesA: aWins ? lw : ll, linesB: aWins ? ll : lw,
      mvp: { side: aWins ? 'a' : 'b', name: mvp.name }, winProbA: round(pA, 3),
      breakdown: { a: ba, b: bb }, timeline: timeline(aWins ? a.name : b.name, lw, len, rng),
    };
  }
  function simulateSeries(a, b, bestOf, rng) {
    const need = Math.ceil(bestOf / 2); let sa = 0, sb = 0; const games = [];
    while (sa < need && sb < need) { const g = simulateGame(a, b, rng); games.push(g); if (g.winner === 'a') sa++; else sb++; }
    return { bestOf: bestOf, winner: sa > sb ? 'a' : 'b', scoreA: sa, scoreB: sb, games: games };
  }

  root.LOLSim = {
    Rng: Rng, ROLES: ROLES, ARCHES: ARCHES, REGIONS: REGIONS, TIERS: TIERS,
    genPlayer: genPlayer, currentAbility: currentAbility, effRoleStrength: effRoleStrength,
    soloAbility: soloAbility, computeMmr: computeMmr, tierFromMmr: tierFromMmr, divFromMmr: divFromMmr,
    genLadderEntity: genLadderEntity, revealedFlags: revealedFlags,
    initChem: initChem, rampWeek: rampWeek, reconcileChem: reconcileChem, cohesion: cohesion, pairTarget: pairTarget,
    teamBreakdown: teamBreakdown, simulateGame: simulateGame, simulateSeries: simulateSeries,
    clamp: clamp, round: round,
  };
})(typeof window !== 'undefined' ? window : globalThis);

/* ===================== meta · pool · draft · crowd (port of @managelol/core) ===================== */
(function (root) {
  'use strict';
  const S = root.LOLSim;
  const clamp = S.clamp, round = S.round, ROLES = S.ROLES, ARCHES = S.ARCHES;
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

  // champions are injected at build time from packages/data (single source of truth)
  S.CHAMPIONS = /*__CHAMPIONS__*/[];
  S.CHAMP_BY_ID = {}; S.CHAMPIONS.forEach((c) => (S.CHAMP_BY_ID[c.id] = c));

  // ---------- meta ----------
  S.genPatch = function (rng, index, prev) {
    const archDelta = {};
    ARCHES.forEach((a) => { const p = prev ? prev.archDelta[a] || 0 : 0; archDelta[a] = clamp(0.6 * p + rng.gaussian(0, 4), -10, 10); });
    const outliers = {}; const ids = S.CHAMPIONS.map((c) => c.id).sort(); const n = rng.int(3, 5);
    for (let i = 0; i < n; i++) { const id = rng.pick(ids); outliers[id] = clamp(Math.round(rng.gaussian(0, 7)), -10, 10); }
    return { index: index, archDelta: archDelta, outliers: outliers };
  };
  S.champStrength = function (c, patch) {
    let s = c.basePower;
    for (const a in c.styleTags) s += (patch.archDelta[a] || 0) * c.styleTags[a];
    s += patch.outliers[c.id] || 0;
    return clamp(s, 20, 90);
  };
  S.tierOf = (s) => (s >= 62 ? 'S' : s >= 55 ? 'A' : s >= 47 ? 'B' : 'C');

  // ---------- champion pool ----------
  function profCeiling(apt, tags) { let m = 0; for (const a in tags) m += (apt[a] || 0) * tags[a]; return clamp(100 * (0.4 + 0.6 * m / 100), 0, 100); }
  S.seedPool = function (player, rng) {
    const ra = player.attributes.roleAptitude, learning = player.attributes.growth.learningRate / 100, pref = player.attributes.chemistry.preferredArchetype;
    player.championPool = {};
    S.CHAMPIONS.forEach((c) => {
      const ceiling = profCeiling(player.attributes.championAptitude, c.styleTags);
      let frac;
      if (c.roles.indexOf(ra.primaryRole) >= 0) frac = 0.45 + 0.5 * rng.float() * (0.6 + 0.4 * learning);
      else if (c.roles.indexOf(ra.secondaryRole) >= 0) frac = 0.3 + 0.3 * rng.float();
      else frac = 0.15 + 0.2 * rng.float();
      if ((c.styleTags[pref] || 0) >= 0.5) frac = Math.min(1, frac + 0.15);
      player.championPool[c.id] = round(clamp(ceiling * frac, 0, 100), 0);
    });
  };
  S.prof = (player, id) => (player.championPool && player.championPool[id] !== undefined ? player.championPool[id] : 20);

  // ---------- draft ----------
  const B = 'blue', R = 'red';
  S.DRAFT_SEQUENCE = [
    { side: B, type: 'ban' }, { side: R, type: 'ban' }, { side: B, type: 'ban' }, { side: R, type: 'ban' }, { side: B, type: 'ban' }, { side: R, type: 'ban' },
    { side: B, type: 'pick' }, { side: R, type: 'pick' }, { side: R, type: 'pick' }, { side: B, type: 'pick' }, { side: B, type: 'pick' }, { side: R, type: 'pick' },
    { side: R, type: 'ban' }, { side: B, type: 'ban' }, { side: R, type: 'ban' }, { side: B, type: 'ban' },
    { side: R, type: 'pick' }, { side: B, type: 'pick' }, { side: B, type: 'pick' }, { side: R, type: 'pick' },
  ];
  S.newDraft = () => ({ step: 0, bans: { blue: [], red: [] }, picks: { blue: [], red: [] } });
  S.currentStep = (s) => S.DRAFT_SEQUENCE[s.step] || null;
  S.isComplete = (s) => s.step >= S.DRAFT_SEQUENCE.length;
  S.takenIds = function (s) { const t = {}; [B, R].forEach((side) => { s.bans[side].forEach((id) => (t[id] = 1)); s.picks[side].forEach((p) => (t[p.champId] = 1)); }); return t; };
  S.openRoles = function (s, side) { const f = {}; s.picks[side].forEach((p) => (f[p.role] = 1)); return ROLES.filter((r) => !f[r]); };
  S.assignRole = function (c, open) { for (const r of c.roles) if (open.indexOf(r) >= 0) return { role: r, offRole: false }; return open.length ? { role: open[0], offRole: true } : null; };
  S.legalActions = function (s) { const t = S.takenIds(s); return S.CHAMPIONS.map((c) => c.id).filter((id) => !t[id]).sort(); };
  S.applyAction = function (s, champId, team) {
    const step = S.currentStep(s); if (!step) throw new Error('draft complete');
    if (S.takenIds(s)[champId]) throw new Error('taken');
    const c = S.CHAMP_BY_ID[champId];
    const next = { step: s.step + 1, bans: { blue: s.bans.blue.slice(), red: s.bans.red.slice() }, picks: { blue: s.picks.blue.slice(), red: s.picks.red.slice() } };
    if (step.type === 'ban') next.bans[step.side].push(champId);
    else { const a = S.assignRole(c, S.openRoles(s, step.side)); next.picks[step.side].push({ champId: champId, role: a.role, playerId: team.lineup[a.role].id, offRole: a.offRole }); }
    return next;
  };
  const COMBO_ANCHORS = { dive: ['jungle', 'mid'], pick: ['bot', 'support'], protectTheCarry: ['bot', 'support'], split131: ['jungle', 'top'], pokeSiege: ['mid', 'support'], earlyInvade: ['jungle', 'top'], frontToBack: ['top', 'support'] };
  const comfortTerm = (p) => 2.0 * ((p - 50) / 50), metaTerm = (s) => 1.5 * ((s - 50) / 50);
  S.pickValue = function (c, role, offRole, team, oppPicks, patch) {
    const player = team.lineup[role];
    const comfort = comfortTerm(S.prof(player, c.id)), meta = metaTerm(S.champStrength(c, patch));
    let counter = 0;
    oppPicks.forEach((op) => { if (c.counters.indexOf(op.champId) >= 0) counter += 1.2; const oc = S.CHAMP_BY_ID[op.champId]; if (oc && oc.counters.indexOf(c.id) >= 0) counter -= 1.2; });
    const off = offRole ? -1.5 : 0;
    return { champId: c.id, role: role, comfort: comfort, meta: meta, counter: counter, offRole: off, total: comfort + meta + counter + off };
  };
  S.winCondition = function (picks) {
    const ch = picks.map((p) => S.CHAMP_BY_ID[p.champId]).filter(Boolean);
    if (!ch.length) return { label: '—', curve: { early: 0.33, mid: 0.34, late: 0.33 } };
    const curve = { early: mean(ch.map((c) => c.curve.early)), mid: mean(ch.map((c) => c.curve.mid)), late: mean(ch.map((c) => c.curve.late)) };
    const tc = (t) => ch.filter((c) => c.comboTags.indexOf(t) >= 0).length;
    let label = 'Teamfight';
    if (curve.early >= 0.42) label = 'Early Snowball';
    else if (tc('protectTheCarry') >= 2 && curve.late >= 0.38) label = 'Protect the Star';
    else if (tc('pick') >= 2) label = 'Pick & Punish';
    else if (tc('pokeSiege') >= 2) label = 'Siege';
    else if (tc('split131') >= 2) label = '1-3-1';
    else if (curve.late >= 0.42) label = 'Scaling';
    return { label: label, curve: curve };
  };
  S.evaluateSide = function (s, side, team, patch) {
    const opp = side === B ? R : B, picks = s.picks[side];
    const pickEvals = picks.map((p) => { const v = S.pickValue(S.CHAMP_BY_ID[p.champId], p.role, p.offRole, team, s.picks[opp], patch); v.playerId = p.playerId; v.total = round(v.total, 2); return v; });
    const combos = []; const byRole = {}; picks.forEach((p) => (byRole[p.role] = p));
    for (const tag in COMBO_ANCHORS) {
      const carriers = picks.filter((p) => S.CHAMP_BY_ID[p.champId].comboTags.indexOf(tag) >= 0); if (carriers.length < 2) continue;
      const ra = COMBO_ANCHORS[tag][0], rb = COMBO_ANCHORS[tag][1], pa = byRole[ra], pb = byRole[rb]; if (!pa || !pb) continue;
      const plA = team.lineup[ra], plB = team.lineup[rb];
      const aptGate = mean([S.prof(plA, pa.champId), S.prof(plB, pb.champId)]) / 100;
      const key = plA.id < plB.id ? plA.id + '|' + plB.id : plB.id + '|' + plA.id;
      const pc = team.chem && team.chem.pairs[key];
      const chemGate = 0.5 + 0.5 * ((pc ? pc.current : 30) / 100);
      combos.push({ tag: tag, aptGate: round(aptGate, 3), chemGate: round(chemGate, 3), payoff: round(2.5 * aptGate * chemGate, 2) });
    }
    const wc = S.winCondition(picks); let curveFit = 0;
    if (picks.length === 5) {
      const commit = Math.max(wc.curve.early, wc.curve.late); curveFit = commit >= 0.45 ? 2.0 : commit >= 0.4 ? 1.0 : 0;
      const ch = picks.map((p) => S.CHAMP_BY_ID[p.champId]); const ftb = ch.some((c) => c.comboTags.indexOf('frontToBack') >= 0);
      if (wc.curve.early >= 0.42 && ch.some((c) => c.curve.late >= 0.5) && !ftb) curveFit -= 2.0;
    }
    const teamTempo = mean(ROLES.map((r) => team.lineup[r].attributes.chemistry.playstyleTempo));
    const compTempo = 50 + 50 * (wc.curve.early - wc.curve.late);
    const identity = round(1.05 - 0.1 * (Math.abs(teamTempo - compTempo) / 100), 3);
    const raw = (pickEvals.reduce((a, p) => a + p.total, 0) + combos.reduce((a, c) => a + c.payoff, 0) + curveFit) * identity;
    return { side: side, score: round(clamp(raw, -8, 8), 2), picks: pickEvals, combos: combos, curveFit: curveFit, identity: identity, label: wc.label, curve: wc.curve };
  };
  const noiseSigma = (t) => 1.3 * (1 - 0.5 * ((t.coachQuality || 50) / 100)) * (1 - 0.4 * ((t.patchFamiliarity || 50) / 100));
  S.scoreActions = function (s, side, team, opp, patch) {
    const step = S.currentStep(s); if (!step) return [];
    const oppSide = side === B ? R : B, legal = S.legalActions(s), out = [];
    if (step.type === 'ban') {
      const oppOpen = S.openRoles(s, oppSide);
      legal.forEach((id) => {
        const c = S.CHAMP_BY_ID[id]; let best = -Infinity, who = '';
        oppOpen.forEach((r) => { const p = opp.lineup[r]; const inRole = c.roles.indexOf(r) >= 0 ? 1 : 0.4; const v = (comfortTerm(S.prof(p, id)) + metaTerm(S.champStrength(c, patch))) * inRole; if (v > best) { best = v; who = p.name; } });
        if (best === -Infinity) best = metaTerm(S.champStrength(c, patch));
        const flexTax = c.roles.length > 1 ? 0.5 : 0;
        const protect = s.picks[side].some((p) => c.counters.indexOf(p.champId) >= 0) ? 1.0 : 0;
        out.push({ champId: id, value: best + flexTax + protect, reason: protect ? 'protects your plan' : 'denies ' + who + "'s comfort" });
      });
    } else {
      const open = S.openRoles(s, side);
      legal.forEach((id) => {
        const c = S.CHAMP_BY_ID[id], a = S.assignRole(c, open); if (!a) return;
        const v = S.pickValue(c, a.role, a.offRole, team, s.picks[oppSide], patch), option = c.roles.length > 1 ? 0.3 : 0;
        const reason = v.counter > 0 ? 'counters their lock' : v.comfort > 1 ? 'comfort pick' : v.meta > 0.6 ? 'meta power' : a.offRole ? 'off-role gamble' : 'fills the plan';
        out.push({ champId: id, value: v.total + option, reason: reason, role: a.role, offRole: a.offRole });
      });
    }
    return out.sort((x, y) => y.value - x.value || (x.champId < y.champId ? -1 : 1));
  };
  S.aiChoose = function (s, side, team, opp, patch, rng) {
    const scored = S.scoreActions(s, side, team, opp, patch), sigma = noiseSigma(team);
    let best = scored[0], bestV = -Infinity;
    scored.forEach((a) => { const v = a.value + rng.normal() * sigma; if (v > bestV) { bestV = v; best = a; } });
    return best.champId;
  };
  S.coachSuggestions = (s, side, team, opp, patch, n) => S.scoreActions(s, side, team, opp, patch).slice(0, n || 3).map((a) => ({ champId: a.champId, value: round(a.value, 1), reason: a.reason, role: a.role, offRole: a.offRole }));

  // ---------- the crowd ----------
  const EMOTES = ['CLAP', 'GRIEF', 'Throwge', 'WardDog', 'PogSnail', 'Copeium', 'FFCELLO', 'BONKED'];
  const SUFFIX = ['_fan88', 'Main', '_enjoyer', '_truther', 'xX', '_lol', '99', '_invoice', 'TTV', '_gaming'];
  const T = {
    ban: ['they banned {champ} LOL scared of {champ} mains', '{champ} ban? tactical {emote}', 'no {champ}?? in this economy', 'respect ban on {champ} {emote}', '{champ} gone. {opp} exhale'],
    pickGeneric: ['{champ} {emote}', '{champ} pick — {team} is cooking', '{champ}?? bold', 'ok {champ} enjoyers eating good tonight'],
    pilotWarning: ['{player} has NEVER played {champ} chat', '{player} on {champ}?? coach diff incoming', 'first time {champ}? {emote}', 'this is either genius or a disaster. no in between'],
    comp: {
      'Early Snowball': ['early snowball comp — win by 25 or FF', 'tempo comp {emote} someone is getting invaded', 'if this game hits 30 min {team} is cooked'],
      'Protect the Star': ['protect-the-carry comp = 40 minute game incoming', '{team} said protect the carry at ALL costs', 'four bodyguards and a hypercarry, classic'],
      'Pick & Punish': ["pick comp. don't facecheck chat", 'HOOK CITY POPULATION: {opp}', 'one misstep and its over {emote}'],
      Siege: ['siege comp, bastions crying already', 'poke poke poke {emote}', 'they are going to make {opp} play from behind'],
      '1-3-1': ['1-3-1 the map, ignore the game', 'sidelane enjoyers rise up', "{team}'s top laner will not join a single fight and win"],
      Scaling: ['scaling comp — FF timers OFF', '{team} needs 3 items and a dream', 'gripping 15 minutes of farming incoming'],
      Teamfight: ['5v5 comp, just fight them 4head', 'teamfight comp {emote} lets see it', 'no gimmicks, just violence'],
    },
    firstBlood: ['FIRST BLOOD {team} {emote}', '{player} with the first blood CLAP', 'early lead lets gooo', 'ok THAT was clean'],
    objective: ['WARDEN SECURED {emote}', '{team} takes the Warden, scaling online', 'COLOSSUS?? {emote} {emote}', 'the Battering Shade goes in and the bastion is GONE'],
    throw: ['its over', 'THROWGE {emote}', '{team} throwing?? GRIEF', 'why would you fight there. why.'],
    comeback: ["WE'RE SO BACK {emote} {emote}", 'never doubted (i doubted)', '{team} comeback {emote}', 'chat i am unwell'],
    stall: ['both teams respectfully farming. gripping stuff', 'chat is this real', '30 minutes and nobody has died. love esports', 'stall game {emote} wake me up at the Colossus'],
    win: ['GG {team} {emote}', '{player} diff', 'ez clap {emote}', '{opp} gg go next', 'it was the draft. it was always the draft'],
    loss: ['ff15 next time', '{opp} diff', 'it was the draft. it was always the draft', 'gg go next', 'coach diff btw', '{team} fans in shambles'],
    ambient: ['chat is this real', '[message removed by AutoMod]', "anyone else's stream lagging", 'W chat', 'L take above me', 'first time watching, is this good?'],
    sponsor: ['this pause brought to you by {sponsor}. CAFFEINATE RESPONSIBLY', '{sponsor} thanks you for your energy', 'the {sponsor} logo is doing a lot of work on that jersey'],
    patchDay: ['{champ} mains in shambles', 'my whole pool is C tier FFCELLO', 'new patch who dis'],
  };
  function fill(t, p, rng) {
    return t.replace(/\{emote\}/g, () => rng.pick(EMOTES)).replace(/\{champ\}/g, p.champ || 'that champ').replace(/\{team\}/g, p.team || 'they').replace(/\{opp\}/g, p.opp || 'the enemy').replace(/\{player\}/g, p.player || 'he').replace(/\{sponsor\}/g, p.sponsor || 'our sponsor');
  }
  function username(rng, p) {
    const base = p && p.champ && rng.chance(0.35) ? p.champ.toLowerCase().replace(/[^a-z]/g, '') : rng.pick(['fenwick', 'wardDog', 'hesper', 'grapnel', 'quill', 'mossback', 'brindle', 'vexalia', 'pip', 'ogden', 'cindra', 'jorun']);
    const suf = rng.pick(SUFFIX);
    return suf === 'xX' ? 'xX' + base + 'Xx' : base + suf;
  }
  /** React to a trigger; returns messages {user, text, mood}. */
  S.crowdReact = function (trigger, payload, rng, count) {
    const p = payload || {}; const out = []; const n = count || 2;
    let pool;
    if (trigger === 'pick') { const c = p.champObj; pool = (c && c.chatLines ? c.chatLines : []).concat(T.pickGeneric); }
    else if (trigger === 'compLock') pool = (T.comp[p.label] || T.comp.Teamfight).concat(T.ambient.slice(0, 1));
    else if (trigger === 'result') pool = p.won ? T.win : T.loss;
    else pool = T[trigger] || T.ambient;
    for (let i = 0; i < n; i++) {
      const raw = rng.pick(pool);
      out.push({ user: username(rng, p), text: fill(raw, p, rng), mood: trigger });
      if (rng.chance(0.18)) out.push({ user: username(rng, p), text: fill(rng.pick(T.ambient), p, rng), mood: 'ambient' });
    }
    return out;
  };
  S.EMOTES = EMOTES;
})(typeof window !== 'undefined' ? window : globalThis);

/* ===================== ticks · auto-draft skill · team comms (port of @managelol/core + prototype voice) ===================== */
(function (root) {
  'use strict';
  const S = root.LOLSim;
  const clamp = S.clamp, round = S.round, ROLES = S.ROLES;
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

  // ---------- auto-draft skill (team quality → less noise) ----------
  S.draftSkill = function (team) {
    const sense = mean(ROLES.map((r) => { const k = team.lineup[r].attributes.gameKnowledge; return (k.shotcalling + k.adaptability + k.mapAwareness) / 3; }));
    const coh = team.cohesion !== undefined ? team.cohesion : 50;
    return clamp(0.35 * (team.coachQuality || 50) + 0.3 * coh + 0.35 * sense, 0, 100);
  };
  S.draftNoiseSigma = (team) => 1.6 * (1 - 0.7 * (S.draftSkill(team) / 100)) * (1 - 0.3 * ((team.patchFamiliarity || 50) / 100));
  S.aiChoose = function (s, side, team, opp, patch, rng) {
    const scored = S.scoreActions(s, side, team, opp, patch), sigma = S.draftNoiseSigma(team);
    let best = scored[0], bestV = -Infinity;
    scored.forEach((a) => { const v = a.value + rng.normal() * sigma; if (v > bestV) { bestV = v; best = a; } });
    return best.champId;
  };

  // ---------- game ticks (30s steps) ----------
  S.TICK_SECONDS = 30;
  const smooth = (x) => { const c = clamp(x, 0, 1); return c * c * (3 - 2 * c); };
  function pickW(rng, items, w) { return rng.weighted ? rng.weighted(items, items.map((x) => w(x) + 0.5)) : items[0]; }
  // Rng port lacks weighted(); add it (same semantics as core)
  if (!S.Rng.prototype.weighted) S.Rng.prototype.weighted = function (items, weights) { let total = 0; weights.forEach((w) => (total += Math.max(0, w))); let roll = this.next() * total; for (let i = 0; i < items.length; i++) { roll -= Math.max(0, weights[i]); if (roll < 0) return items[i]; } return items[items.length - 1]; };
  const KILL_VERBS = ['takes down', 'picks off', 'finds', 'punishes', 'deletes', 'catches out'];
  const clockOf = (t) => Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
  S.generateTicks = function (g, aName, bName, rng) {
    const N = Math.max(20, Math.round(g.lengthMin * 2)), T = N * 30, aWins = g.winner === 'a';
    const name = (s) => (s === 'a' ? aName : bName), lines = (s) => (s === 'a' ? g.linesA : g.linesB);
    const killGap = Math.abs(g.killsA - g.killsB);
    const finalGold = clamp(6 + 0.45 * killGap + rng.range(0, 3), 5, 18) * (aWins ? 1 : -1);
    const kw = (t) => (t < 150 ? 0 : t < 600 ? 0.6 : t < 1500 ? 1 : 0.8);
    const idx = []; for (let i = 1; i <= N; i++) idx.push(i);
    const sched = (n) => { const out = []; for (let k = 0; k < n; k++) out.push(pickW(rng, idx, (i) => kw(i * 30))); return out; };
    const killsAt = { a: sched(g.killsA), b: sched(g.killsB) };
    const wardenTimes = []; for (let t = 300; t < T - 90; t += 300 + rng.int(-30, 60)) wardenTimes.push(Math.round(t / 30) * 30);
    const shadeTime = T > 600 ? rng.int(16, Math.min(28, N - 2)) * 30 : -1;
    const colTimes = []; if (T > 1260) colTimes.push(rng.int(40, Math.min(48, N - 2)) * 30); if (T > 1900 && colTimes.length) colTimes.push(colTimes[0] + rng.int(10, 13) * 30);
    const ticks = []; let killsA = 0, killsB = 0, noise = 0, fb = false;
    const wardens = [0, 0], colossus = [0, 0], bastions = [0, 0]; let nextBastion = 600 + rng.int(0, 4) * 30;
    for (let i = 1; i <= N; i++) {
      const t = i * 30, progress = i / N, events = [];
      noise = noise * 0.85 + rng.gaussian(0, 0.35);
      const base = finalGold * smooth((t - 180) / Math.max(1, T - 180));
      let gold = i === N ? finalGold : base + noise * (1 - progress * 0.6);
      const leader = gold >= 0 ? 'a' : 'b';
      const ka = killsAt.a.filter((x) => x === i).length, kb = killsAt.b.filter((x) => x === i).length;
      const addKill = (side) => {
        const killer = pickW(rng, lines(side), (l) => l.kills), victim = pickW(rng, lines(side === 'a' ? 'b' : 'a'), (l) => l.deaths);
        if (side === 'a') killsA++; else killsB++;
        if (!fb) { fb = true; events.push({ type: 'firstBlood', side: side, text: killer.name + ' ' + rng.pick(KILL_VERBS) + ' ' + victim.name + ' — first blood to ' + name(side) + '.', player: killer.name, victim: victim.name }); }
        else events.push({ type: 'kill', side: side, text: killer.name + ' ' + rng.pick(KILL_VERBS) + ' ' + victim.name + '.', player: killer.name, victim: victim.name });
        gold += side === 'a' ? 0.3 : -0.3;
      };
      for (let k = 0; k < ka; k++) addKill('a'); for (let k = 0; k < kb; k++) addKill('b');
      if (ka + kb >= 3) { const fw = ka > kb ? 'a' : kb > ka ? 'b' : leader; events.push({ type: 'fight', side: fw, text: 'A teamfight breaks out — ' + name(fw) + ' come out ahead ' + Math.max(ka, kb) + '-for-' + Math.min(ka, kb) + '.' }); }
      if (wardenTimes.indexOf(t) >= 0) { const o = rng.chance(0.7) ? leader : (leader === 'a' ? 'b' : 'a'); wardens[o === 'a' ? 0 : 1]++; const n = wardens[o === 'a' ? 0 : 1]; events.push({ type: 'warden', side: o, text: n >= 2 ? name(o) + ' secure their ' + (n === 2 ? 'second' : n === 3 ? 'third' : n === 4 ? 'fourth' : n + 'th') + ' Warden — the scaling is online.' : name(o) + ' take the first Warden.' }); gold += o === 'a' ? 0.2 : -0.2; }
      if (t === shadeTime) { const o = rng.chance(0.75) ? leader : (leader === 'a' ? 'b' : 'a'); events.push({ type: 'shade', side: o, text: 'The Battering Shade slams a bastion for ' + name(o) + '.' }); bastions[o === 'a' ? 0 : 1]++; gold += o === 'a' ? 0.4 : -0.4; }
      if (colTimes.indexOf(t) >= 0) { const stolen = !rng.chance(0.8); const o = stolen ? (leader === 'a' ? 'b' : 'a') : leader; colossus[o === 'a' ? 0 : 1]++; events.push({ type: 'colossus', side: o, text: stolen ? 'COLOSSUS STOLEN — ' + name(o) + ' snatch it from under ' + name(leader) + '!' : name(o) + ' slay the Colossus.' }); gold += o === 'a' ? 1.2 : -1.2; }
      if (t >= nextBastion && i < N) { const o = rng.chance(0.8) ? leader : (leader === 'a' ? 'b' : 'a'); bastions[o === 'a' ? 0 : 1]++; events.push({ type: 'bastion', side: o, text: name(o) + ' knock down a bastion.' }); nextBastion = t + (180 + rng.int(0, 6) * 30); }
      if (i === N) { const w = aWins ? 'a' : 'b'; bastions[aWins ? 0 : 1] += 2; events.push({ type: 'end', side: w, text: name(w) + ' break the Keep — victory at ' + clockOf(t) + '.' }); }
      const pGold = 1 / (1 + Math.pow(10, -gold / 6)), w = clamp((progress - 0.85) / 0.15, 0, 1);
      const wp = i === N ? (aWins ? 1 : 0) : pGold * (1 - w) + (aWins ? 1 : 0) * w;
      ticks.push({ i: i, t: t, goldDiff: round(gold, 2), killsA: killsA, killsB: killsB, wardens: wardens.slice(), colossus: colossus.slice(), bastions: bastions.slice(), winProbA: round(wp, 3), events: events });
    }
    return ticks;
  };
  S.clockOf = clockOf;

  // ---------- team comms (your players + coach; tone follows cohesion) ----------
  const D = {
    banTight: ['Coach: {enemy} lives on {champ}. Ban it.', '{p1}: ban {champ}, I do not want to lane into that', '{p2}: agreed, kill it'],
    banOk: ['Coach: thoughts on banning {champ}?', '{p1}: yeah {champ} is annoying', '{p2}: or {alt}? either works'],
    banFrayed: ['{p1}: ban {champ}', '{p2}: why?? ban {alt}', 'Coach: …we are banning {champ}.'],
    pickTight: ['{rp}: I have {champ} or {alt} here', 'Coach: {champ} fits the plan', '{other}: go {champ}, I will play around you'],
    pickOk: ['{rp}: {champ}? or {alt}?', '{other}: we still need some {need}', 'Coach: {champ}. lock it'],
    pickFrayed: ['{rp}: give me {champ}', '{other}: we have no {need} and you want {champ}?', '{rp}: I am not playing {alt}', 'Coach: {champ}. moving on.'],
    lockTight: ['{rp}: locked. trust.', '{other}: nice', 'Coach: good'],
    lockOk: ['{rp}: ok locked', 'Coach: fine'],
    lockFrayed: ['{rp}: locked.', '{other}: …sure.', '{rp}: what'],
    waitTight: ['Coach: they will want {pred}', '{p1}: if they take {pred} we go {alt}', '{p2}: watch the flex pick'],
    waitOk: ['{p1}: what do we think they take?', 'Coach: probably {pred}', '{p2}: fine either way'],
    waitFrayed: ['{p1}: they are taking {pred} obviously', '{p2}: you said that last game', 'Coach: focus.'],
  };
  const GM = {
    fbUs: ['{killer}: got him', '{other}: FIRST BLOOD lets go', 'Coach: good — keep the tempo'],
    fbThemTight: ['{victim}: my bad, bad flash', '{other}: it is fine, reset', '{sc}: we play for Warden'],
    fbThemOk: ['{victim}: died, no flash', '{sc}: ok, careful now'],
    fbThemFrayed: ['{victim}: no follow??', '{other}: why were you even there', '{sc}: stop. play.'],
    killUs: ['{killer}: ez', '{killer}: one down', '{sc}: push the wave, then reset', '{other}: clean'],
    killThemTight: ['{victim}: died, my fault', '{sc}: fine, we scale'],
    killThemOk: ['{victim}: died', '{sc}: careful, they have numbers'],
    killThemFrayed: ['{victim}: nobody said anything', '{other}: I pinged three times', '{sc}: …'],
    wardenUs: ['{sup}: Warden secured, reset', '{sc}: good, group mid', '{jg}: they gave it for free'],
    wardenThem: ['{sc}: we take the top bastion for it', '{jg}: nobody came for Warden', '{sup}: no vision there, sorry'],
    shadeUs: ['{jg}: Shade is ours, mid bastion now', '{sc}: push it push it'],
    shadeThem: ['{sc}: hold, do not fight for it', '{top}: I can hold the wave'],
    colUs: ['{sc}: COLOSSUS NOW', '{jg}: go go go', '{sup}: we have it, fall back'],
    colThem: ['{sc}: fall back, do not chase', '{other}: who is calling??', '{sup}: reset and defend'],
    fightWin: ['{sc}: WE WIN THE FIGHT', '{other}: so clean', 'Coach: that is the team'],
    fightLoss: ['{sc}: ok that one is on me', '{other}: that was so bad', '{sup}: reset, we are still fine'],
    bastionUs: ['{other}: bastion down', '{sc}: good, rotate'],
    bastionThem: ['{sc}: fine, we trade top'],
    endWin: ['{sc}: GG', '{other}: LETS GOOO', 'Coach: proud of you lot'],
    endLossTight: ['{sc}: gg. we review tomorrow.', 'Coach: heads up. next one.'],
    endLossFrayed: ['{other}: …', '{sc}: gg', 'Coach: we will talk.'],
    idle: ['{other}: wave state is good', '{sup}: ward here', '{sc}: Warden in 60', '{other}: no flash bot', '{jg}: pathing top side', 'Coach: breathe.'],
  };
  const moodOf = (coh) => (coh >= 68 ? 'Tight' : coh >= 48 ? 'Ok' : 'Frayed');
  function fillC(t, ctx) { return t.replace(/\{(\w+)\}/g, (m, k) => (ctx[k] !== undefined ? ctx[k] : m)); }
  function speakerSplit(line) { const i = line.indexOf(': '); return i > 0 ? { who: line.slice(0, i), text: line.slice(i + 2) } : { who: 'Comms', text: line }; }
  S.moodOf = moodOf;
  /** Draft deliberation lines for our team. kind: 'ban'|'pick'|'lock'|'wait' */
  S.commsDraft = function (kind, ctx, rng) {
    const mood = moodOf(ctx.cohesion || 50);
    const pool = D[kind + mood] || D[kind + 'Ok'];
    const names = ROLES.map((r) => ctx.lineup[r].name);
    const rp = ctx.rolePlayer || rng.pick(names);
    const others = names.filter((n) => n !== rp);
    const c = Object.assign({ p1: rng.pick(others), p2: rng.pick(others), rp: rp, other: rng.pick(others), champ: ctx.champ || 'that', alt: ctx.alt || 'the other one', enemy: ctx.enemy || 'their carry', pred: ctx.pred || 'a comfort pick', need: ctx.need || 'engage' }, {});
    if (c.p2 === c.p1 && others.length > 1) c.p2 = others.find((n) => n !== c.p1);
    const n = kind === 'lock' ? 1 + (rng.chance(0.5) ? 1 : 0) : 2;
    const chosen = pool.slice(0, n); // keep the scripted beat order
    return chosen.map((l) => Object.assign(speakerSplit(fillC(l, c)), { mood: mood }));
  };
  /** In-game comms for a tick event; `ours` = event side is our team. */
  S.commsGame = function (ev, ctx, rng) {
    const mood = moodOf(ctx.cohesion || 50);
    const lu = ctx.lineup, names = ROLES.map((r) => lu[r].name);
    const sc = ROLES.map((r) => lu[r]).sort((a, b) => b.attributes.gameKnowledge.shotcalling - a.attributes.gameKnowledge.shotcalling)[0].name;
    const c = { sc: sc, sup: lu.support.name, jg: lu.jungle.name, top: lu.top.name, killer: ev && ev.player || sc, victim: ev && ev.victim || sc, other: rng.pick(names.filter((n) => n !== sc)) };
    let pool;
    if (!ev) pool = GM.idle;
    else if (ev.type === 'firstBlood') pool = ctx.ours ? GM.fbUs : GM['fbThem' + mood];
    else if (ev.type === 'kill') pool = ctx.ours ? GM.killUs : GM['killThem' + mood];
    else if (ev.type === 'warden') pool = ctx.ours ? GM.wardenUs : GM.wardenThem;
    else if (ev.type === 'shade') pool = ctx.ours ? GM.shadeUs : GM.shadeThem;
    else if (ev.type === 'colossus') pool = ctx.ours ? GM.colUs : GM.colThem;
    else if (ev.type === 'fight') pool = ctx.ours ? GM.fightWin : GM.fightLoss;
    else if (ev.type === 'bastion') pool = ctx.ours ? GM.bastionUs : GM.bastionThem;
    else if (ev.type === 'end') pool = ctx.ours ? GM.endWin : (mood === 'Frayed' ? GM.endLossFrayed : GM.endLossTight);
    else pool = GM.idle;
    // for events where the victim/killer is on the OTHER team, swap names to ours sensibly
    if (ev && !ctx.ours && ev.victim) c.victim = names.indexOf(ev.victim) >= 0 ? ev.victim : rng.pick(names);
    if (ev && ctx.ours && ev.player) c.killer = names.indexOf(ev.player) >= 0 ? ev.player : rng.pick(names);
    if (pool === GM.idle) return [Object.assign(speakerSplit(fillC(rng.pick(pool), c)), { mood: mood })];
    const n = Math.min(pool.length, 1 + (rng.chance(0.55) ? 1 : 0));
    const out = []; const used = {};
    for (let i = 0; i < n; i++) { let l = pool[i]; if (used[l]) continue; used[l] = 1; out.push(Object.assign(speakerSplit(fillC(l, c)), { mood: mood })); }
    return out;
  };
})(typeof window !== 'undefined' ? window : globalThis);

/* ── world: orgs, development, contracts, the ladder cutoff, the season ──
   Port of packages/core/src/{world,players/development,ladder/bands,season}.
   Same constants, same formulas, same determinism guarantees. */
(function (root) {
  'use strict';
  const S = root.LOLSim;
  const Rng = S.Rng, ROLES = S.ROLES, clamp = S.clamp, round = S.round;
  const c100 = (x) => clamp(x, 0, 100);
  const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

  // ---------- org identities (injected from packages/data at build) ----------
  S.ORG_PACK = /*__ORGS__*/[];
  S.ORG_NAME_PARTS = /*__ORGPARTS__*/{ prefixes: [], suffixes: [], standalone: [], qualifiers: [] };

  // ---------- orgs ----------
  S.TIER_WEIGHT = { 1: 1, 2: 0.45, 3: 0.18, 4: 0.05 };
  const LEGACY_GAIN = 4.2, LEGACY_DECAY = 0.35, STANDING_RAMP = 0.34, FACILITY_DECAY = 1.1;

  S.prestige = (o) => c100(0.62 * o.standing + 0.38 * o.legacy);
  S.statureLabel = function (o) {
    const p = S.prestige(o);
    if (p >= 82) return o.legacy >= 60 ? 'Dynasty' : 'Superpower';
    if (p >= 66) return o.legacy >= 45 ? 'Institution' : 'Contender';
    if (p >= 48) return 'Established';
    if (p >= 30) return o.seasons <= 3 ? 'Upstart' : 'Journeyman';
    return o.seasons <= 2 ? 'Newcomer' : 'Minnow';
  };
  S.orgEffects = function (o) {
    const env = 0.55 * o.facilities + 0.45 * o.coaching;
    return {
      coachQuality: round(o.coaching, 1),
      patchFamiliarity: round(o.analytics, 1),
      chemRampMult: round(0.85 + 0.4 * (o.facilities / 100), 3),
      developmentMult: round(0.55 + 0.9 * (env / 100), 3),
    };
  };
  S.tierWealth = (t) => ({ 1: 240, 2: 90, 3: 34, 4: 14 })[t];
  S.accrueLegacy = (legacy, tier) => c100(legacy + LEGACY_GAIN * S.TIER_WEIGHT[tier] * (1 - legacy / 100) - LEGACY_DECAY);
  S.standingTarget = function (tier, placeFraction) {
    const ceil = { 1: 96, 2: 72, 3: 50, 4: 30 }[tier], floor = { 1: 56, 2: 36, 3: 20, 4: 6 }[tier];
    return floor + (ceil - floor) * (1 - clamp(placeFraction, 0, 1));
  };

  S.seedOrg = function (rng, identity, tier, history) {
    const seasons = Math.max(0, history);
    let legacy = 0, best = tier;
    const titles = { 1: 0, 2: 0, 3: 0, 4: 0 }, atTier = { 1: 0, 2: 0, 3: 0, 4: 0 };
    for (let s = 0; s < seasons; s++) {
      const drift = rng.chance(0.22) ? (rng.chance(0.5) ? -1 : 1) : 0;
      const t = clamp(tier + drift, 1, 4);
      atTier[t]++; if (t < best) best = t;
      legacy = S.accrueLegacy(legacy, t);
      if (rng.chance(0.12 * S.TIER_WEIGHT[t] + 0.04)) titles[t]++;
    }
    const p = identity.personality;
    // Years at a tier build the place; arriving at it does not.
    const built = clamp(0.55 * seasons, 0, 11);
    const infra = (bias) => c100(rng.gaussian(30 + 52 * (1 - (tier - 1) / 3) + bias + built, 9));
    const standing = c100(rng.gaussian(S.standingTarget(tier, 0.5), 7));
    return {
      id: identity.id, name: identity.name, tag: identity.tag, region: identity.region,
      personality: p, blurb: identity.blurb,
      founded: -seasons, seasons: seasons,
      legacy: round(legacy, 2), standing: round(standing, 2),
      facilities: infra(p === 'academy' ? 8 : 0),
      coaching: infra(p === 'methodical' ? 10 : p === 'chaotic' ? -8 : 0),
      analytics: infra(p === 'methodical' ? 12 : p === 'superteam' ? -4 : 0),
      scouting: c100(infra(p === 'academy' ? 12 : p === 'superteam' ? -6 : 0) - built * 0.5),
      fanbase: c100(rng.gaussian(18 + 0.55 * legacy + 0.25 * standing, 8)),
      cash: round(S.tierWealth(tier) * rng.range(0.7, 1.4), 1),
      tier: tier,
      history: { titles: titles, bestTier: best, seasonsAtTier: atTier, finishes: [] },
      // Divergence from core, on purpose: core keeps rosters and contracts in
      // their own stores, but the prototype has one G object and no indices,
      // so an org carries its own five and their deals.
      roster: { top: null, jungle: null, mid: null, bot: null, support: null },
      contracts: {},
    };
  };

  S.advanceOrgSeason = function (org, out) {
    const pf = out.of <= 1 ? 0 : (out.place - 1) / (out.of - 1);
    const standing = c100(org.standing + (S.standingTarget(out.tier, pf) - org.standing) * STANDING_RAMP);
    let legacy = S.accrueLegacy(org.legacy, out.tier);
    if (out.wonTitle) legacy = c100(legacy + 3.4 * S.TIER_WEIGHT[out.tier] + 0.6);
    const spend = Math.max(0, out.investment || 0);
    const lift = (v, share) => c100(v + 9 * (1 - v / 100) * Math.sqrt(Math.max(0, (spend * share) / 40)) - FACILITY_DECAY);
    const titles = Object.assign({}, org.history.titles); if (out.wonTitle) titles[out.tier]++;
    const atTier = Object.assign({}, org.history.seasonsAtTier); atTier[out.tier]++;
    const nextPrestige = 0.62 * standing + 0.38 * legacy;
    return Object.assign({}, org, {
      seasons: org.seasons + 1,
      standing: round(standing, 2), legacy: round(legacy, 2),
      facilities: round(lift(org.facilities, 0.34), 2),
      coaching: round(lift(org.coaching, 0.26), 2),
      analytics: round(lift(org.analytics, 0.22), 2),
      scouting: round(lift(org.scouting, 0.18), 2),
      fanbase: round(c100(org.fanbase + (nextPrestige - org.fanbase) * 0.22 + (out.wonTitle ? 4 : 0) - 0.6), 2),
      cash: round(org.cash + (out.netCash || 0) - spend, 1),
      tier: out.tier,
      history: {
        titles: titles, bestTier: Math.min(org.history.bestTier, out.tier), seasonsAtTier: atTier,
        finishes: [{ season: out.season, tier: out.tier, place: out.place, of: out.of }].concat(org.history.finishes).slice(0, 24),
      },
    });
  };

  /* Rates are high on purpose: money nothing drains stops meaning anything. */
  S.investmentBudget = function (o) {
    const rate = { superteam: 0.45, academy: 0.62, stable: 0.50, chaotic: 0.35, methodical: 0.60 }[o.personality];
    const pull = 0.85 + 0.004 * S.prestige(o);
    return round(Math.max(0, (o.cash - S.tierWealth(o.tier) * 0.5) * rate * pull), 1);
  };

  S.generateOrg = function (rng, id, region, tier, taken) {
    const P = S.ORG_NAME_PARTS;
    let name = '';
    for (let i = 0; i < 40 && !name; i++) {
      const stem = rng.chance(0.55) ? rng.pick(P.prefixes) + rng.pick(P.suffixes) : rng.pick(P.standalone);
      const q = rng.pick(P.qualifiers);
      const cand = q === '' ? stem : stem + ' ' + q;
      if (!taken[cand]) name = cand;
    }
    if (!name) name = rng.pick(P.standalone) + ' ' + id.toUpperCase();
    const letters = name.replace(/[^A-Za-z]/g, '').toUpperCase();
    const personalities = ['superteam', 'academy', 'stable', 'chaotic', 'methodical'];
    return S.seedOrg(rng, {
      id: id, name: name, tag: letters.slice(0, 3) || 'NEW', region: region,
      personality: rng.pick(personalities),
      blurb: 'A new name in the scene. No history, no habits, nothing to lose.',
    }, tier, 0);
  };

  // ---------- development ----------
  const DEV_BASE = 0.085, FULL_SPEED_HEADROOM = 22;
  S.LADDER_ENV = 22; S.LADDER_PLAYTIME = 25;
  S.ladderContext = () => ({ environment: 22, playingTime: 25, mentorship: 0, success: 0.5, offRole: false });
  S.driveScore = (a) => c100(0.45 * a.growth.growthRate + 0.30 * a.growth.learningRate + 0.25 * a.growth.workEthic);
  S.supportScore = (ctx) => c100(0.5 * ctx.environment + 0.3 * ctx.playingTime + 0.2 * ctx.mentorship);
  S.ageGrowthMult = function (age, peakAge) {
    const t = clamp((age - 16) / Math.max(1, peakAge - 16), 0, 1);
    return clamp(1.32 * (1 - t * t), 0.04, 1.32);
  };
  S.growthMix = function (age) {
    if (age < 21) return { mechanical: 0.45, knowledge: 0.35, mental: 0.20 };
    if (age < 25) return { mechanical: 0.30, knowledge: 0.45, mental: 0.25 };
    return { mechanical: 0.10, knowledge: 0.55, mental: 0.35 };
  };
  const FAM_W = { mechanical: 0.44, knowledge: 0.34, mental: 0.22 };
  const MECH_K = ['mechanics', 'laning', 'teamfighting', 'reflexes', 'positioning'];
  const KNOW_K = ['mapAwareness', 'waveManagement', 'objectiveControl', 'visionControl', 'rotations', 'adaptability', 'shotcalling'];
  const MENT_K = ['composure', 'consistency', 'focus', 'clutch', 'tiltResistance'];

  S.developWeek = function (player, ctx, rng) {
    const a = player.attributes, g = a.growth, age = player.age;
    if (age >= g.declineStartAge) {
      const rate = 0.0055 * (g.declineRate / 50) * (1 + 0.45 * (age - g.declineStartAge));
      const resist = 0.75 + 0.5 * (1 - g.workEthic / 100);
      return { delta: round(-rate * resist, 4), leap: false, declining: true };
    }
    const headroom = clamp((g.potential - S.currentAbility(a)) / FULL_SPEED_HEADROOM, 0, 1.15);
    if (headroom <= 0) return { delta: 0, leap: false, declining: false };
    const drive = 0.45 + 1.1 * (S.driveScore(a) / 100);
    const support = 0.45 + 1.1 * (S.supportScore(ctx) / 100);
    let delta = DEV_BASE * headroom * S.ageGrowthMult(age, g.peakAge) * drive * support
      * (0.88 + 0.24 * clamp(ctx.success, 0, 1)) * (ctx.offRole ? 0.85 : 1);
    const leapChance = age < 22 ? 0.018 * headroom * (S.supportScore(ctx) / 100) : 0;
    const leap = leapChance > 0 && rng.chance(leapChance);
    if (leap) delta *= 3.2;
    return { delta: round(delta, 4), leap: leap, declining: false };
  };

  S.applyDevelopment = function (player, week, rng) {
    if (!week.delta) return;
    const a = player.attributes;
    const ceiling = c100(a.growth.potential + 6);
    const mix = week.declining
      ? { mechanical: 0.75 + 0.25 * (a.growth.mechanicalDeclineBias / 100), knowledge: -0.18, mental: -0.05 }
      : S.growthMix(player.age);
    const bump = (obj, keys, fam) => {
      if (!fam) return;
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i]; if (obj[k] === undefined) continue;
        const next = obj[k] + fam * (0.7 + 0.6 * rng.float());
        obj[k] = week.delta > 0 ? Math.min(c100(next), ceiling) : c100(next);
      }
    };
    bump(a.mechanical, MECH_K, (week.delta * mix.mechanical) / FAM_W.mechanical);
    bump(a.gameKnowledge, KNOW_K, (week.delta * mix.knowledge) / FAM_W.knowledge);
    bump(a.mental, MENT_K, (week.delta * mix.mental) / FAM_W.mental);
  };

  /* Careers here are short: a pro is old at 25 and rare past 30. Without this
     the world never turns over — rosters age a year a season and nothing
     replaces them. */
  S.retirementChance = function (player) {
    const age = player.age;
    if (age < 24) return 0;
    const ca = S.currentAbility(player.attributes);
    const base = clamp(0.06 + 0.14 * (age - 24), 0, 1);
    const quality = clamp((ca - 55) / 40, 0, 1);
    const professional = player.attributes.personality.professionalism / 100;
    return clamp(base * (1.35 - 0.55 * quality) * (1.1 - 0.2 * professional), 0, 1);
  };
  S.retiresNow = (player, rng) => rng.chance(S.retirementChance(player));

  S.developSeason = function (player, ctx, rng, weeks) {
    const w = weeks || 40, before = S.currentAbility(player.attributes);
    let leaps = 0;
    for (let i = 0; i < w; i++) {
      const week = S.developWeek(player, ctx, rng);
      if (week.leap) leaps++;
      S.applyDevelopment(player, week, rng);
    }
    player.age = round(player.age + w / 52, 2);
    return { gained: round(S.currentAbility(player.attributes) - before, 2), leaps: leaps };
  };

  // ---------- contracts ----------
  S.WAGE_BASE = 0.22; S.WAGE_CURVE = 1.068; S.SEASON_WEEKS = 52; S.ACCEPT_THRESHOLD = 0.72;

  S.wageDemand = function (player, tier, orgPrestige) {
    const ca = S.currentAbility(player.attributes), g = player.attributes.growth, age = player.age;
    const potentialPremium = Math.min(1.4, 1 + 0.011 * Math.max(0, g.potential - ca));
    const ageFactor = age >= g.declineStartAge ? 0.85 : age <= 18 ? 0.92 : 1;
    const prestigeDiscount = clamp(1.12 - 0.0022 * c100(orgPrestige), 0.9, 1.15);
    const star = 1 + 0.0025 * player.attributes.brand.starPower;
    return round(Math.max(0.05, S.WAGE_BASE * Math.pow(S.WAGE_CURVE, ca - 50)
      * potentialPremium * ageFactor * S.tierWageMult(tier) * prestigeDiscount * star), 3);
  };
  S.defaultBuyout = (wage, weeks) => round(wage * weeks * 1.8 + wage * 12, 1);

  S.evaluateOffer = function (player, org, offer, tier) {
    const p = player.attributes.personality, pres = S.prestige(org);
    const demand = S.wageDemand(player, tier, pres);
    const wageRatio = clamp(offer.wage / Math.max(0.01, demand), 0, 1.6);
    const prestigePull = (0.4 + 0.6 * (p.ambition / 100)) * (pres / 100);
    const seat = clamp(offer.starterChance, 0, 1);
    const loyalty = offer.renewal ? p.loyalty / 100 : 0;
    const lengthFit = offer.weeks >= S.SEASON_WEEKS * 2 ? (p.ambition > 70 ? -0.03 : 0.04) : 0;
    const utility = clamp(0.48 * wageRatio + 0.22 * prestigePull + 0.20 * seat + 0.10 * loyalty + lengthFit, 0, 1.6);
    let reason;
    if (wageRatio < 0.8) reason = 'the money is short';
    else if (seat < 0.5) reason = 'no guarantee of a starting seat';
    else if (prestigePull < 0.2 && p.ambition > 65) reason = 'the project is not ambitious enough';
    else if (utility >= S.ACCEPT_THRESHOLD) reason = offer.renewal ? 'happy to stay' : 'a step up';
    else reason = 'not convinced';
    return { accepted: utility >= S.ACCEPT_THRESHOLD, utility: round(utility, 3), reason: reason };
  };

  S.offerToAccept = function (player, org, tier, starterChance, renewal) {
    const p = player.attributes.personality, pres = S.prestige(org);
    const demand = S.wageDemand(player, tier, pres);
    const nonWage = 0.22 * (0.4 + 0.6 * (p.ambition / 100)) * (pres / 100)
      + 0.20 * clamp(starterChance, 0, 1) + 0.10 * (renewal ? p.loyalty / 100 : 0);
    return round(demand * clamp((S.ACCEPT_THRESHOLD - nonWage) / 0.48, 0, 1.6) * 1.02, 3);
  };

  S.wageBill = (contracts) => round(contracts.reduce((s, c) => s + c.wage, 0), 3);
  S.runwayWeeks = function (org, contracts, weeklyIncome) {
    const net = weeklyIncome - S.wageBill(contracts);
    return net >= 0 ? Infinity : Math.max(0, Math.floor(org.cash / -net));
  };
  S.financialState = function (org, contracts, weeklyIncome) {
    if (org.cash < 0) return 'insolvent';
    const r = S.runwayWeeks(org, contracts, weeklyIncome);
    if (r === Infinity) return 'healthy';
    return r > S.SEASON_WEEKS / 2 ? 'tight' : 'critical';
  };
  S.attractsApproach = function (contract, player, rng) {
    const ca = S.currentAbility(player.attributes);
    if (ca < 55) return false;
    const base = contract.weeksRemaining <= S.SEASON_WEEKS / 2 ? 0.05 : 0.012;
    return rng.chance(base * (0.4 + clamp((ca - 55) / 40, 0, 1)));
  };
  /* An expiry is reported exactly once: an already-expired deal is left alone. */
  S.tickContracts = function (contracts) {
    const expired = [];
    contracts.forEach((c) => {
      if (c.weeksRemaining <= 0) return;
      c.weeksRemaining--;
      if (c.weeksRemaining <= 0) expired.push(c);
    });
    return expired;
  };
  S.bidInterest = function (org, player, opts) {
    const ca = S.currentAbility(player.attributes);
    const upgrade = (ca - opts.incumbentAbility) / 20;
    if (upgrade <= 0 && org.personality !== 'academy') return 0;
    const wage = S.wageDemand(player, opts.tier, S.prestige(org));
    if (wage > opts.budgetPerWeek) return 0;
    const youth = Math.max(0, player.attributes.growth.potential - ca) / 40;
    const taste = {
      superteam: { now: 1.15, later: 0.35 }, academy: { now: 0.5, later: 1.3 },
      stable: { now: 0.9, later: 0.8 }, chaotic: { now: 1, later: 0.9 }, methodical: { now: 0.85, later: 1 },
    }[org.personality];
    const afford = clamp(1 - wage / Math.max(0.01, opts.budgetPerWeek), 0, 1);
    return round(clamp(taste.now * clamp(upgrade, 0, 1.4) * 0.6 + taste.later * clamp(youth, 0, 1) * 0.4 + 0.15 * afford, 0, 1), 3);
  };

  // ---------- the visible ladder ----------
  S.SHOW_CUTOFF = 2525; S.DEEP_FLOOR = 2050; S.DEEP_SCOUT_COST = 4;
  S.BAND_DEFS = [
    { key: 'onyxI', floor: 2525, qualityCenter: 66, potentialBonus: 0, ageRange: [16, 24], label: 'Onyx I' },
    { key: 'ascendant', floor: 2600, qualityCenter: 71, potentialBonus: 2, ageRange: [16, 24], label: 'Ascendant' },
    { key: 'paragon', floor: 2850, qualityCenter: 76, potentialBonus: 4, ageRange: [17, 25], label: 'Paragon' },
    { key: 'apex', floor: 3050, qualityCenter: 81, potentialBonus: 7, ageRange: [17, 26], label: 'Apex' },
  ];
  S.BAND_BY_KEY = {}; S.BAND_DEFS.forEach((b) => (S.BAND_BY_KEY[b.key] = b));
  S.bandFromMmr = function (mmr) {
    if (mmr < S.SHOW_CUTOFF) return null;
    let out = 'onyxI';
    S.BAND_DEFS.forEach((b) => { if (mmr >= b.floor) out = b.key; });
    return out;
  };
  S.onBoard = (mmr) => mmr >= 2850;
  S.visibleOnLadder = (mmr) => mmr >= S.SHOW_CUTOFF;
  S.deepScoutGemChance = (networkTier, analystScouting) =>
    clamp(0.18 + 0.22 * (networkTier / 3) + 0.10 * ((c100(analystScouting) - 50) / 50), 0.10, 0.55);
  S.deepScoutTargetMmr = (rng) => Math.round(rng.range(S.DEEP_FLOOR, S.SHOW_CUTOFF));
  S.reentryMmr = (lastMmr, steady) => Math.round(0.55 * lastMmr + 0.45 * steady);
  S.SOLO_PHASE_MULT = { preseason: 1.2, regular: 1, playoffs: 0.5, offseason: 1.8 };
  S.soloGamesPerWeek = (workEthic, phase, contracted) =>
    Math.round((contracted ? 6 : 6 * 3.4) * (0.7 + 0.6 * (c100(workEthic) / 100)) * S.SOLO_PHASE_MULT[phase]);

  // ---------- fixtures & standings ----------
  S.roundRobin = function (teams, legs) {
    legs = legs || 1;
    if (teams.length < 2) return [];
    const BYE = ' bye';
    const field = teams.length % 2 === 0 ? teams.slice() : teams.concat([BYE]);
    const n = field.length, rounds = n - 1, half = n / 2;
    const blue = {}; teams.forEach((t) => (blue[t] = 0));
    const rot = field.slice(), leg1 = [];
    for (let r = 0; r < rounds; r++) {
      for (let i = 0; i < half; i++) {
        const x = rot[i], y = rot[n - 1 - i];
        if (x === BYE || y === BYE) continue;
        const xFirst = blue[x] !== blue[y] ? blue[x] < blue[y] : (r % 2 === 0 ? x < y : x > y);
        const a = xFirst ? x : y, b = xFirst ? y : x;
        blue[a]++;
        leg1.push({ round: r + 1, a: a, b: b });
      }
      const last = rot[n - 1];
      for (let i = n - 1; i > 1; i--) rot[i] = rot[i - 1];
      rot[1] = last;
    }
    const out = [];
    for (let leg = 0; leg < legs; leg++) {
      const off = leg * rounds, flip = leg % 2 === 1;
      leg1.forEach((m) => out.push(flip ? { round: m.round + off, a: m.b, b: m.a } : { round: m.round + off, a: m.a, b: m.b }));
    }
    return out;
  };

  S.emptyRow = (orgId) => ({ orgId: orgId, wins: 0, losses: 0, gameWins: 0, gameLosses: 0, form: [], h2h: {} });
  S.recordResult = function (table, winnerId, loserId, wg, lg, formWindow) {
    const w = table[winnerId], l = table[loserId];
    if (!w || !l) return;
    const win = formWindow || 5;
    w.wins++; l.losses++;
    w.gameWins += wg; w.gameLosses += lg; l.gameWins += lg; l.gameLosses += wg;
    w.h2h[loserId] = (w.h2h[loserId] || 0) + 1;
    if (l.h2h[winnerId] === undefined) l.h2h[winnerId] = 0;
    w.form.unshift(true); l.form.unshift(false);
    if (w.form.length > win) w.form.length = win;
    if (l.form.length > win) l.form.length = win;
  };
  /* Block-wise mini-table: head-to-head is not transitive, so it may never be
     evaluated inside a pairwise comparator (see core/world/fixtures.ts). */
  S.standings = function (rows) {
    const canon = rows.slice().sort((x, y) => (x.orgId < y.orgId ? -1 : x.orgId > y.orgId ? 1 : 0));
    const levels = [];
    canon.forEach((r) => { if (levels.indexOf(r.wins) < 0) levels.push(r.wins); });
    levels.sort((a, b) => b - a);
    const out = [];
    levels.forEach((w) => {
      const block = canon.filter((r) => r.wins === w);
      if (block.length === 1) { out.push(block[0]); return; }
      const mini = {};
      block.forEach((r) => {
        let s = 0;
        block.forEach((o) => { if (o.orgId !== r.orgId) s += r.h2h[o.orgId] || 0; });
        mini[r.orgId] = s;
      });
      block.sort((x, y) => {
        if (mini[x.orgId] !== mini[y.orgId]) return mini[y.orgId] - mini[x.orgId];
        const dx = x.gameWins - x.gameLosses, dy = y.gameWins - y.gameLosses;
        if (dx !== dy) return dy - dx;
        if (x.gameWins !== y.gameWins) return y.gameWins - x.gameWins;
        return x.orgId < y.orgId ? -1 : 1;
      });
      block.forEach((r) => out.push(r));
    });
    return out;
  };

  // ---------- fast resolution ----------
  S.DRAFT_GAIN = 4; S.VAR_BASE = 3.2; S.MATCH_SCALE = 15;
  S.resolveFastSeries = function (a, b, bestOf, rng, opts) {
    opts = opts || {};
    const draftMu = (S.DRAFT_GAIN * (a.drafting - b.drafting)) / 100 + (a.metaFit - b.metaFit);
    const draftSigma = 1.9 - 0.85 * ((a.drafting + b.drafting) / 200);
    const draftDelta = rng.gaussian(draftMu, draftSigma, -8, 8);
    const noiseSigma = S.VAR_BASE * (1 - 0.4 * ((a.consistency + b.consistency) / 200));
    const dayDelta = rng.gaussian(0, noiseSigma, -3 * noiseSigma, 3 * noiseSigma);
    const gap = a.strength - b.strength + draftDelta + dayDelta;
    const pA = 1 / (1 + Math.pow(10, -gap / S.MATCH_SCALE));
    const need = Math.ceil((bestOf + 1) / 2), dom = Math.abs(pA - 0.5) * 2;
    const games = []; let wa = 0, wb = 0;
    while (wa < need && wb < need) {
      const aWon = rng.chance(pA);
      if (aWon) wa++; else wb++;
      if (opts.games === false) continue;
      const len = clamp(Math.round(rng.gaussian(34 - 6 * dom, 5)), 22, 52);
      const total = Math.max(6, Math.round((24 * len) / 32 + rng.gaussian(0, 5)));
      const wk = Math.round(total * (0.55 + 0.2 * dom));
      games.push({ winnerIdx: aWon ? 0 : 1, lengthMin: len, killsA: aWon ? wk : total - wk, killsB: aWon ? total - wk : wk });
    }
    const winner = wa > wb ? 0 : 1, favA = pA >= 0.5, decisive = Math.abs(pA - 0.5) >= 0.15;
    return {
      winner: winner, score: [wa, wb], games: games, winProbA: round(pA, 3),
      upset: decisive && ((favA && winner === 1) || (!favA && winner === 0)),
      draftDelta: round(draftDelta, 2),
    };
  };
  S.fastRating = (roleStrength, teamStrength, won, rng) =>
    round(clamp(rng.gaussian(5.6 + (won ? 1.1 : -1.1) + (roleStrength - teamStrength) / 8, 0.85), 0, 10), 1);

  // ---------- the calendar & the pyramid ----------
  S.CALENDAR = (function () {
    const w = [];
    const add = (week, kind, window, note, split, tw) =>
      w.push({ week: week, kind: kind, window: window, note: note, split: split || null, transferWindow: !!tw });
    add(1, 'market', 'Preseason', 'Rosters lock at the end of the week.', null, true);
    add(2, 'training', 'Preseason', 'Bootcamp. Set the training emphasis for the split.');
    for (let i = 3; i <= 11; i++) add(i, 'match', 'Spring Split', 'Split 1, rounds ' + ((i - 3) * 2 + 1) + '–' + ((i - 3) * 2 + 2) + '.', 1);
    add(12, 'training', 'Seeding', 'Tiebreakers, if you are in one. Otherwise, rest.', 1);
    add(13, 'match', 'Spring Playoffs', 'Playoffs. Win the bracket and the split is yours.', 1);
    add(14, 'match', 'Spring Playoffs', 'The Spring final.', 1);
    add(15, 'market', 'Split break', 'The mid-season window opens.', null, true);
    add(16, 'event', 'Mid-season', 'The Crucible: the champions of every region.', null, true);
    add(17, 'event', 'Mid-season', 'The Crucible continues.', null, true);
    add(18, 'event', 'Mid-season', 'The Crucible final.', null, true);
    add(19, 'market', 'Split break', 'The mid-season window closes on Sunday.', null, true);
    for (let i = 20; i <= 28; i++) add(i, 'match', 'Summer Split', 'Split 2, rounds ' + ((i - 20) * 2 + 1) + '–' + ((i - 20) * 2 + 2) + '.', 2);
    add(29, 'training', 'Seeding', 'Tiebreakers and the last week of prep.', 2);
    add(30, 'match', 'Summer Playoffs', 'Playoffs. The Summit seeds are decided here.', 2);
    add(31, 'match', 'Summer Playoffs', 'The Summer final.', 2);
    add(32, 'event', 'Seeding', 'Championship points reconciled; Summit seeds announced.');
    add(33, 'match', 'Regional Finals', 'The gauntlet for the last seat at the Summit.');
    add(34, 'match', 'Regional Finals', 'Regional finals conclude.');
    add(35, 'training', 'Bootcamp', 'Travel and bootcamp, or a double scouting week.');
    add(36, 'event', 'The Summit', 'The Summit: play-in.');
    add(37, 'event', 'The Summit', 'The Summit: groups.');
    add(38, 'event', 'The Summit', 'The Summit: groups conclude.');
    add(39, 'event', 'The Summit', 'The Summit: quarters and semis.');
    add(40, 'event', 'The Summit', 'The Summit final.');
    add(41, 'event', 'Season review', 'Awards, and the legacy tick every org lives or dies by.');
    add(42, 'match', 'Promotion', 'The promotion gauntlets. Seats change hands.');
    add(43, 'match', 'Promotion', 'Gauntlets conclude; the pyramid is redrawn.');
    add(44, 'event', 'Structure', 'Expansion review and any franchise conversion.');
    add(45, 'market', 'Expiries', 'The contract expiry wave. Renew now or lose them.', null, true);
    add(46, 'market', 'Free agency', 'Free agency opens. Rivals are bidding.', null, true);
    add(47, 'market', 'Free agency', 'Free agency. The good ones go early.', null, true);
    add(48, 'market', 'Free agency', 'Free agency closes on the best of them.', null, true);
    add(49, 'event', 'Turnover', 'Retirements, new talent on the ladder, academy intake.', null, true);
    add(50, 'event', 'Board', 'The awards show, and next season’s mandate from the board.', null, true);
    add(51, 'event', 'Preseason patch', 'A big patch lands and the ladder season resets.', null, true);
    add(52, 'training', 'Preseason', 'Scrims on the new patch. The roster deadline approaches.', null, true);
    return w;
  })();
  S.weekDef = (week) => S.CALENDAR[(((week - 1) % 52) + 52) % 52];
  S.phaseOfWeek = function (week) {
    const d = S.weekDef(week);
    if (d.window.indexOf('Playoffs') >= 0 || d.window === 'Promotion') return 'playoffs';
    if (d.split !== null) return 'regular';
    if (d.window === 'Preseason') return 'preseason';
    return 'offseason';
  };
  S.matchWeeksOfSplit = (split) =>
    S.CALENDAR.filter((d) => d.split === split && d.kind === 'match' && d.window.indexOf('Playoffs') < 0).map((d) => d.week);
  /* Even spread, not ceil(): front-loading leaves match weeks with no fixture
     behind them, and then the Season hub's week strip is lying. */
  S.roundsInWeek = function (totalRounds, split, week) {
    const weeks = S.matchWeeksOfSplit(split);
    const idx = weeks.indexOf(week);
    if (idx < 0 || totalRounds <= 0) return [];
    const out = [];
    for (let r = 1; r <= totalRounds; r++) {
      if (Math.floor(((r - 1) * weeks.length) / totalRounds) === idx) out.push(r);
    }
    return out;
  };

  S.PYRAMID = [
    { id: 'prime', name: 'The Prime League', tier: 1, slots: 10, legs: 2, regularBestOf: 3, playoffBestOf: 5, playoffTeams: 6, prizePool: 300, weeklyRevenue: 12, winPurse: 5, operatingCost: 5.5, promotionLine: 0, relegationLine: 10, blurb: 'The top of the sport. Revenue share, real money, and a seat at the Summit.' },
    { id: 'ascent', name: 'Ascent Division', tier: 2, slots: 10, legs: 2, regularBestOf: 3, playoffBestOf: 5, playoffTeams: 4, prizePool: 110, weeklyRevenue: 5, winPurse: 2.5, operatingCost: 2.0, promotionLine: 3, relegationLine: 9, blurb: 'Semi-pro, and one gauntlet from everything. Also one bad split from nothing.' },
    { id: 'circuit', name: 'Regional Circuit', tier: 3, slots: 16, legs: 1, regularBestOf: 1, playoffBestOf: 3, playoffTeams: 8, prizePool: 34, weeklyRevenue: 3.4, winPurse: 1.2, operatingCost: 0.8, promotionLine: 3, relegationLine: 13, blurb: 'The widest band in the pyramid, and where most careers actually happen.' },
    { id: 'open', name: 'The Open', tier: 4, slots: 0, legs: 1, regularBestOf: 1, playoffBestOf: 3, playoffTeams: 4, prizePool: 0, weeklyRevenue: 0, winPurse: 0, operatingCost: 0.35, promotionLine: 0, relegationLine: 99, blurb: 'No seats, no table — just entry fees and weekend brackets. Everyone starts here.' },
  ];
  S.LEAGUE_BY_TIER = {}; S.PYRAMID.forEach((l) => (S.LEAGUE_BY_TIER[l.tier] = l));
  /* Iterate LEAGUES for anything that runs a season. PYRAMID still holds The
     Open, which is a price band with no seats behind it. */
  S.LEAGUES = S.PYRAMID.filter((l) => l.slots > 0);
  S.isLeagueTier = (t) => S.LEAGUE_BY_TIER[t].slots > 0;
  S.OPEN_TIER = 4;
  S.prizeFor = function (cfg, place) {
    const shares = [0.34, 0.21, 0.14, 0.10, 0.07, 0.05, 0.035, 0.025, 0.015, 0.01];
    return round(cfg.prizePool * (shares[place - 1] !== undefined ? shares[place - 1] : 0.005), 1);
  };
  S.championshipPoints = function (cfg, place) {
    if (cfg.tier !== 1) return 0;
    const table = [90, 70, 55, 40, 25, 25, 12, 12, 4, 4];
    return table[place - 1] || 0;
  };
  /* ---------- playoff brackets & the promotion gauntlet ---------- */
  S.seedOrder = function (size) {
    let order = [1];
    while (order.length < size) {
      const n = order.length * 2, next = [];
      order.forEach((sd) => { next.push(sd); next.push(n + 1 - sd); });
      order = next;
    }
    return order;
  };
  S.bracketSize = function (n) { let p = 1; while (p < n) p *= 2; return p; };

  /* Single elimination with byes: byes are resolved at construction, so the
     match list holds only series that will actually be played (teams − 1). */
  S.buildBracket = function (teams, bestOf) {
    const n = teams.length;
    if (n < 2) return { teams: teams.slice(), bestOf: bestOf, matches: [], champion: teams[0] || null, rounds: 0 };
    const size = S.bracketSize(n), rounds = Math.round(Math.log(size) / Math.log(2));
    const order = S.seedOrder(size);
    const teamOfSeed = (sd) => (sd - 1 < n ? teams[sd - 1] : null);
    const matches = [], byId = {};
    for (let r = 1; r <= rounds; r++) {
      const count = size / Math.pow(2, r);
      for (let m = 0; m < count; m++) {
        const match = {
          id: 'r' + r + 'm' + m, round: r, a: null, b: null, seedA: 0, seedB: 0,
          winner: null, score: null,
          feedsInto: r === rounds ? null : 'r' + (r + 1) + 'm' + Math.floor(m / 2),
          feedsSlot: m % 2 === 0 ? 'a' : 'b',
        };
        matches.push(match); byId[match.id] = match;
      }
    }
    const first = matches.filter((m) => m.round === 1);
    first.forEach((m, i) => {
      m.seedA = order[i * 2]; m.seedB = order[i * 2 + 1];
      m.a = teamOfSeed(m.seedA); m.b = teamOfSeed(m.seedB);
    });
    const drop = {};
    first.forEach((m) => {
      if (m.a !== null && m.b !== null) return;
      const through = m.a !== null ? m.a : m.b;
      const seed = m.a !== null ? m.seedA : m.seedB;
      drop[m.id] = 1;
      if (through === null || !m.feedsInto) return;
      const next = byId[m.feedsInto];
      if (m.feedsSlot === 'a') { next.a = through; next.seedA = seed; }
      else { next.b = through; next.seedB = seed; }
    });
    const live = matches.filter((m) => !drop[m.id] && (m.round > 1 || (m.a !== null && m.b !== null)));
    return { teams: teams.slice(), bestOf: bestOf, matches: live, champion: null, rounds: rounds };
  };

  S.pendingMatches = (b) => b.matches.filter((m) => m.winner === null && m.a !== null && m.b !== null);
  S.nextMatchFor = (b, orgId) => S.pendingMatches(b).filter((m) => m.a === orgId || m.b === orgId)[0] || null;
  S.recordBracketResult = function (b, matchId, winner, score) {
    const m = b.matches.filter((x) => x.id === matchId)[0];
    if (!m || m.winner !== null) return;
    m.winner = winner; m.score = score;
    const seed = winner === m.a ? m.seedA : m.seedB;
    if (!m.feedsInto) { b.champion = winner; return; }
    const next = b.matches.filter((x) => x.id === m.feedsInto)[0];
    if (!next) { b.champion = winner; return; }
    if (m.feedsSlot === 'a') { next.a = winner; next.seedA = seed; }
    else { next.b = winner; next.seedB = seed; }
  };
  S.playBracket = function (b, resolve, rng, skip) {
    const played = [];
    for (let guard = 0; guard < b.matches.length + 2; guard++) {
      const ready = S.pendingMatches(b).filter((m) => skip === undefined || (m.a !== skip && m.b !== skip));
      if (!ready.length) break;
      ready.sort((x, y) => (x.id < y.id ? -1 : 1));
      ready.forEach((m) => {
        const out = resolve(m, rng);
        S.recordBracketResult(b, m.id, out.winner, out.score);
        played.push(m);
      });
    }
    return played;
  };
  S.bracketPlacings = function (b) {
    const out = [];
    if (b.champion) out.push(b.champion);
    b.matches.filter((m) => m.winner !== null)
      .slice().sort((x, y) => (y.round !== x.round ? y.round - x.round : x.seedA - y.seedA))
      .forEach((m) => { const l = m.winner === m.a ? m.b : m.a; if (l !== null && out.indexOf(l) < 0) out.push(l); });
    b.teams.forEach((t) => { if (out.indexOf(t) < 0) out.push(t); });
    return out;
  };
  S.buildGauntlet = (defender, challenger) => ({ defender: defender, challenger: challenger, bestOf: 5, winner: null, score: null });
  S.gauntletPromoted = (g) => g.winner !== null && g.winner === g.challenger;

  /* ---------- The Open: the amateur circuit ---------- */
  S.CIRCUIT = [
    { id: 'weekend', name: 'Weekend Open', entryFee: 1, fieldSize: 8, bestOf: 1, finalBestOf: 3,
      repGate: 0, repCap: 18,
      purse: { winner: 6, finalist: 2.5, semi: 1, quarter: 0.4, entered: 0 },
      points: { winner: 100, finalist: 60, semi: 35, quarter: 18, entered: 6 },
      repBase: { winner: 3, finalist: 1.6, semi: 0.8, quarter: 0.35, entered: 0.1 },
      fixedWeeks: [3, 4, 5, 6, 7, 8, 9, 10, 11, 20, 21, 22, 23, 24, 25, 26, 27, 28],
      blurb: 'Eight teams, one Saturday, one game a round. Everyone starts here.' },
    { id: 'contenders', name: 'Contenders Cup', entryFee: 3, fieldSize: 16, bestOf: 1, finalBestOf: 3,
      repGate: 12, repCap: 38,
      purse: { winner: 22, finalist: 10, semi: 4.5, quarter: 2, entered: 0 },
      points: { winner: 260, finalist: 150, semi: 85, quarter: 42, entered: 12 },
      repBase: { winner: 10, finalist: 5.5, semi: 2.6, quarter: 1.2, entered: 0.35 },
      fixedWeeks: [6, 11, 17, 23, 28, 34],
      blurb: 'Sixteen teams and a month of bragging rights. Where a name gets made.' },
    { id: 'gateway', name: 'The Gateway', entryFee: 5, fieldSize: 16, bestOf: 3, finalBestOf: 5,
      repGate: 36, repCap: 68,
      purse: { winner: 40, finalist: 18, semi: 8, quarter: 3, entered: 0 },
      points: { winner: 500, finalist: 300, semi: 170, quarter: 85, entered: 25 },
      repBase: { winner: 13, finalist: 7, semi: 3.5, quarter: 1.5, entered: 0.4 },
      fixedWeeks: [19, 42],
      blurb: 'Sixteen teams. The winner takes a seat in the Regional Circuit.' },
  ];
  S.EVENT_BY_RUNG = {}; S.CIRCUIT.forEach((e) => (S.EVENT_BY_RUNG[e.id] = e));
  S.GATEWAY_PRIZE_TIER = 3;
  S.GRASSROOTS_STIPEND = 0.5;
  S.OPEN_WAGE_MULT = 0.4;
  S.OPEN_QUALITY_CENTRE = 60;
  S.SEAT_BUY_IN_COST = 140;
  S.SEAT_BUY_IN_REP = 20;

  S.repGain = (event, place, rep) => round(event.repBase[place] * clamp(1 - rep / event.repCap, 0, 1), 3);
  S.canEnter = function (event, o) {
    if (!o.rosterFilled) return { allowed: false, reason: 'roster', repShort: 0 };
    if (o.reputation < event.repGate) return { allowed: false, reason: 'reputation', repShort: round(event.repGate - o.reputation, 1) };
    if (o.cash < event.entryFee) return { allowed: false, reason: 'money', repShort: 0 };
    return { allowed: true, reason: 'ok', repShort: 0 };
  };
  S.nextUnlock = function (rep) {
    for (let i = 0; i < S.CIRCUIT.length; i++) {
      if (rep < S.CIRCUIT[i].repGate) return { event: S.CIRCUIT[i], short: round(S.CIRCUIT[i].repGate - rep, 1) };
    }
    return null;
  };
  S.eventsInWeek = (week) => S.CIRCUIT.filter((e) => e.fixedWeeks.indexOf(week) >= 0)
    .sort((a, b) => S.CIRCUIT.indexOf(b) - S.CIRCUIT.indexOf(a));
  S.placementOf = function (rounds, exitRound, won) {
    if (won) return 'winner';
    const fromEnd = rounds - exitRound;
    if (fromEnd === 0) return 'finalist';
    if (fromEnd === 1) return 'semi';
    if (fromEnd === 2) return 'quarter';
    return 'entered';
  };
  S.rewardFor = (event, place, rep) => ({
    cash: round(event.purse[place] - event.entryFee, 2),
    points: event.points[place],
    reputation: S.repGain(event, place, rep),
  });
  S.seatOfferFor = function (tier, vacatedBy, week) {
    const mult = ({ 1: 4, 2: 2.2, 3: 1, 4: 1 })[tier];
    return { tier: tier, vacatedBy: vacatedBy, cost: round(S.SEAT_BUY_IN_COST * mult, 0),
      repRequired: round(S.SEAT_BUY_IN_REP * mult, 0), expiresWeek: week + 3 };
  };
  S.canBuySeat = function (offer, o) {
    if (o.reputation < offer.repRequired) return { allowed: false, reason: 'reputation', repShort: round(offer.repRequired - o.reputation, 1) };
    if (o.cash < offer.cost) return { allowed: false, reason: 'money', repShort: 0 };
    return { allowed: true, reason: 'ok', repShort: 0 };
  };
  /* Amateur players cost amateur money. */
  S.tierWageMult = (t) => ({ 1: 1.25, 2: 1, 3: 0.75, 4: S.OPEN_WAGE_MULT })[t];

  S.resolveBoundary = (upper, lower, autoSeats) => ({
    relegated: upper.slice(Math.max(0, upper.length - autoSeats)),
    promoted: lower.slice(0, autoSeats),
  });
})(typeof window !== 'undefined' ? window : globalThis);
