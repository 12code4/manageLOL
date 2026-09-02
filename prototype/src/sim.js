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
    if (plant === 'hiddenGem' || plant === 'smurf') { qc = 72; ar = [16, 19]; }
    if (plant === 'boosted' || plant === 'bust') { qc = 58; ar = [20, 25]; }
    const player = genPlayer(rng, { id: opts.id, region: opts.region, qualityCenter: qc, ageRange: ar });
    if (plant === 'hiddenGem') player.attributes.growth.potential = c100(Math.max(player.attributes.growth.potential, 82 + rng.range(0, 10)));
    if (plant === 'bust') player.attributes.growth.potential = c100(Math.min(player.attributes.growth.potential, 55));
    const solo = soloAbility(player.attributes), pot = player.attributes.growth.potential;
    const autofill = plant === 'hiddenGem' || rng.chance(0.12);
    const boost = plant === 'boosted' ? rng.range(350, 600) : (rng.chance(0.08) ? rng.range(150, 400) : 0);
    const games = (plant === 'smurf' || plant === 'hiddenGem') ? Math.round(rng.range(30, 70)) : Math.round(rng.range(140, 320));
    const mmr = computeMmr({ soloAbility: solo, maxSoloApt: maxSoloApt(player.attributes), composure: player.attributes.mental.composure, tiltResistance: player.attributes.mental.tiltResistance, autofill: autofill, boost: boost, games: games });
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
