/* manageLOL — the persistent world.
   Builds the pyramid out of orgs that have a past, runs a league week for
   every tier, moves players between the ladder and rosters, and advances a
   season. Everything here reads the sim (window.LOLSim) and mutates G. */
(function (root) {
  'use strict';
  const S = root.LOLSim;
  const W = {};
  root.LOLWorld = W;

  const ROLES = S.ROLES;
  const clamp = S.clamp;
  const round = S.round;
  const HOME = 'mer';

  /* ─────────────────────────── world creation ─────────────────────────── */

  // Orgs whose home is the player's region anchor the pyramid; the rest of the
  // seats are filled with generated names that are *also* given a past, so the
  // world reads as though it existed long before the manager turned up.
  W.buildOrgs = function (seed) {
    const rng = new S.Rng(seed, 'world:orgs');
    const pack = S.ORG_PACK.filter((o) => o.region === HOME || o.region === 'wilds');
    const foreign = S.ORG_PACK.filter((o) => o.region !== HOME && o.region !== 'wilds');
    const need = S.PYRAMID.reduce((n, l) => n + l.slots, 0);

    const identities = pack.slice();
    // A few clubs from abroad have relocated into the region — cheap colour,
    // and it keeps every handcrafted name in play across a long career.
    for (let i = 0; identities.length < need - 8 && i < foreign.length; i += 3) identities.push(foreign[i]);

    const taken = {};
    S.ORG_PACK.forEach((o) => (taken[o.name] = 1));
    let gen = 0;
    while (identities.length < need) {
      const o = S.generateOrg(new S.Rng(seed, 'world:gen:' + gen), 'gen-' + gen, HOME, 3, taken);
      taken[o.name] = 1;
      identities.push({ id: o.id, name: o.name, tag: o.tag, region: HOME, personality: o.personality, blurb: o.blurb });
      gen++;
    }

    // Strongest identities settle at the top. Deterministic: sort by a hash of
    // the id, never by pack order, so adding a name later does not reshuffle
    // an existing save's entire pyramid.
    const keyed = identities.map((idn) => ({ idn: idn, k: new S.Rng(seed, 'seat:' + idn.id).float() }));
    keyed.sort((a, b) => (a.k !== b.k ? a.k - b.k : a.idn.id < b.idn.id ? -1 : 1));

    const orgs = {};
    const seats = {};
    let cursor = 0;
    S.PYRAMID.forEach((cfg) => {
      seats[cfg.tier] = [];
      // The player takes one seat at the bottom; the rest are filled.
      const fill = cfg.tier === 4 ? cfg.slots - 1 : cfg.slots;
      for (let i = 0; i < fill; i++) {
        const idn = keyed[cursor++].idn;
        const r = new S.Rng(seed, 'org:' + idn.id);
        // Deeper history the higher the seat: institutions live at the top.
        const history = Math.round(r.range(cfg.tier === 1 ? 9 : cfg.tier === 2 ? 5 : 2, cfg.tier === 1 ? 24 : cfg.tier === 2 ? 16 : 10));
        const org = S.seedOrg(r, idn, cfg.tier, history);
        orgs[org.id] = org;
        seats[cfg.tier].push(org.id);
      }
    });
    return { orgs: orgs, seats: seats };
  };

  /** Stock every AI org with five players sized to its tier and prestige. */
  W.stockRosters = function (G) {
    Object.keys(G.orgs).sort().forEach((id) => {
      const org = G.orgs[id];
      if (id === G.you) return;
      const rng = new S.Rng(G.seed, 'roster:' + id);
      const centre = { 1: 76, 2: 67, 3: 58, 4: 49 }[org.tier] + (S.prestige(org) - 50) * 0.12;
      ROLES.forEach((role, i) => {
        const p = S.genPlayer(rng, {
          id: id + ':' + role,
          region: org.region,
          qualityCenter: clamp(rng.gaussian(centre, 4.5), 30, 94),
          ageRange: [17, 28],
          primaryRole: role,
        });
        org.roster[role] = p;
        const wage = S.wageDemand(p, org.tier, S.prestige(org));
        org.contracts[p.id] = {
          playerId: p.id, orgId: id, wage: wage,
          weeksRemaining: Math.round(rng.range(20, 120)),
          termWeeks: 80, signedSeason: 0,
          buyout: S.defaultBuyout(wage, 80), role: role,
        };
        void i;
      });
      org.chem = S.initChem(org.roster);
      for (let w = 0; w < 30; w++) S.rampWeek(org.chem, org.roster, 1);
    });
  };

  /* ────────────────────────── strength & the table ────────────────────── */

  /** One org's precomputed fast-path side. Recomputed once a week, not per match. */
  W.fastSide = function (G, orgId) {
    const org = G.orgs[orgId];
    const lineup = W.lineupOf(org);
    if (!lineup) return { orgId: orgId, strength: 35, drafting: 30, metaFit: 0, consistency: 45 };
    const bd = S.teamBreakdown({ name: org.name, lineup: lineup, chem: org.chem, draftScore: 0 });
    const eff = S.orgEffects(org);
    const sense = ROLES.map((r) => {
      const k = lineup[r].attributes.gameKnowledge;
      return (k.shotcalling + k.adaptability + k.mapAwareness) / 3;
    });
    const cohesionV = bd.cohesion;
    const drafting = clamp(0.35 * eff.coachQuality + 0.30 * cohesionV + 0.35 * (sense.reduce((a, b) => a + b, 0) / 5), 0, 100);
    return {
      orgId: orgId,
      strength: bd.strength,
      drafting: drafting,
      metaFit: clamp((eff.patchFamiliarity - 50) / 25, -2, 2),
      consistency: ROLES.reduce((s, r) => s + lineup[r].attributes.mental.consistency, 0) / 5,
    };
  };

  W.lineupOf = function (org) {
    const l = {};
    let n = 0;
    ROLES.forEach((r) => { if (org.roster[r]) { l[r] = org.roster[r]; n++; } });
    return n === 5 ? l : null;
  };

  /* ──────────────────────────── the season ────────────────────────────── */

  W.newLeagueState = function (G, tier) {
    const cfg = S.LEAGUE_BY_TIER[tier];
    const seats = G.seats[tier].slice().sort();
    const fixtures = S.roundRobin(seats, cfg.legs);
    const table = {};
    seats.forEach((id) => (table[id] = S.emptyRow(id)));
    return { tier: tier, cfg: cfg, fixtures: fixtures, table: table, round: 0, lastOrder: seats.slice(), results: [] };
  };

  W.startSeason = function (G) {
    G.leagues = {};
    S.PYRAMID.forEach((cfg) => (G.leagues[cfg.tier] = W.newLeagueState(G, cfg.tier)));
    G.champion = null;
  };

  /** Rounds played in a given match week: two a week for the Bo3 tiers. */
  W.roundsThisWeek = function (league, week) {
    const weeks = S.matchWeeksOfSplit(S.weekDef(week).split || 1);
    const idx = weeks.indexOf(week);
    if (idx < 0) return [];
    const total = Math.max.apply(null, league.fixtures.map((f) => f.round));
    const perWeek = Math.ceil(total / weeks.length);
    const out = [];
    for (let i = 0; i < perWeek; i++) {
      const r = idx * perWeek + i + 1;
      if (r <= total) out.push(r);
    }
    return out;
  };

  /** Your fixture this week, if any. */
  W.yourFixture = function (G) {
    const league = G.leagues[G.orgs[G.you].tier];
    if (!league) return null;
    const rounds = W.roundsThisWeek(league, G.week);
    for (let i = 0; i < rounds.length; i++) {
      const f = league.fixtures.filter((x) => x.round === rounds[i] && (x.a === G.you || x.b === G.you))[0];
      if (f && !league.results.some((r) => r.round === f.round && (r.a === f.a && r.b === f.b))) return f;
    }
    return null;
  };

  /**
   * Play every fixture in this week's rounds. Your own is skipped when
   * `skipYours` is set — the match-day takeover resolves that one.
   */
  W.playLeagueWeek = function (G, tier, skipYours) {
    const league = G.leagues[tier];
    if (!league) return [];
    const cfg = league.cfg;
    const rounds = W.roundsThisWeek(league, G.week);
    const sides = {};
    league.fixtures.forEach((f) => {
      if (!sides[f.a]) sides[f.a] = W.fastSide(G, f.a);
      if (!sides[f.b]) sides[f.b] = W.fastSide(G, f.b);
    });
    const before = W.orderOf(league);
    const played = [];
    rounds.forEach((r) => {
      league.fixtures.filter((f) => f.round === r).forEach((f) => {
        if (skipYours && (f.a === G.you || f.b === G.you)) return;
        if (league.results.some((x) => x.round === r && x.a === f.a && x.b === f.b)) return;
        const rng = new S.Rng(G.seed, 'match:' + G.season + ':' + tier + ':' + r + ':' + f.a + ':' + f.b);
        const res = S.resolveFastSeries(sides[f.a], sides[f.b], cfg.regularBestOf, rng, { games: false });
        W.commitResult(G, league, f, res);
        played.push({ f: f, res: res });
      });
      league.round = Math.max(league.round, r);
    });
    W.stampMovement(league, before);
    return played;
  };

  W.commitResult = function (G, league, fixture, res) {
    const winner = res.winner === 0 ? fixture.a : fixture.b;
    const loser = res.winner === 0 ? fixture.b : fixture.a;
    const wg = Math.max(res.score[0], res.score[1]);
    const lg = Math.min(res.score[0], res.score[1]);
    S.recordResult(league.table, winner, loser, wg, lg);
    league.results.push({ round: fixture.round, a: fixture.a, b: fixture.b, score: res.score, upset: res.upset });
  };

  W.orderOf = (league) => S.standings(Object.keys(league.table).sort().map((k) => league.table[k])).map((r) => r.orgId);

  /** Cache each row's movement once, when the round is recorded. */
  W.stampMovement = function (league, before) {
    const after = W.orderOf(league);
    after.forEach((id, i) => {
      const was = before.indexOf(id);
      league.table[id].move = was < 0 ? 0 : was - i;
    });
    league.lastOrder = after;
  };

  /* ───────────────────────────── the ladder ───────────────────────────── */

  W.buildLadder = function (G) {
    const board = [];
    const pool = [];
    const alloc = { apex: 14, paragon: 26, ascendant: 34, onyxI: 46 };
    let n = 0;
    ['apex', 'paragon', 'ascendant', 'onyxI'].forEach((band) => {
      const def = S.BAND_BY_KEY[band];
      const ceiling = { apex: 3400, paragon: 3050, ascendant: 2850, onyxI: 2600 }[band];
      for (let i = 0; i < alloc[band]; i++) {
        const rng = new S.Rng(G.seed, 'lad:' + band + ':' + i);
        // A thin, honest sprinkle of the archetypes that make scouting matter.
        const plant = i % 17 === 3 ? 'smurf' : i % 23 === 5 ? 'boosted' : i % 19 === 7 ? 'bust' : null;
        const e = S.genLadderEntity(rng, {
          id: 'lad' + n++, region: rng.chance(0.72) ? HOME : rng.pick(['kyo', 'tia', 'van', 'wilds']),
          band: band, plant: plant,
          forceMmr: Math.round(rng.range(def.floor, ceiling)),
        });
        e.band = band;
        e.scout = { conf: 0, status: 'spotted', revealed: [] };
        (S.onBoard(e.mmr) ? board : pool).push(e);
      }
    });
    board.sort((a, b) => b.mmr - a.mmr);
    board.forEach((e, i) => (e.boardRank = i + 1));
    pool.sort((a, b) => b.mmr - a.mmr);
    return { board: board, pool: pool, deepDraws: 0, deep: [] };
  };

  /** One deep scout: four analyst weeks for one account out of the badlands. */
  W.deepScout = function (G) {
    const you = G.orgs[G.you];
    const rng = new S.Rng(G.seed, 'deep:' + G.season + ':' + G.ladderDeepDraws++);
    const chance = S.deepScoutGemChance(Math.min(3, Math.floor(you.scouting / 25)), you.scouting);
    const gem = rng.chance(chance);
    if (!gem) return null;
    const e = S.genLadderEntity(rng, {
      id: 'deep' + G.ladderDeepDraws, region: HOME, band: 'onyxI', plant: 'hiddenGem',
      forceMmr: S.deepScoutTargetMmr(rng),
    });
    e.band = 'onyxI';
    e.isDeep = true;
    // You already paid the weeks, so the file opens partly filled in.
    e.scout = { conf: 0.3, status: 'watched', revealed: [] };
    G.ladderDeep.push(e);
    G.ladderPool.unshift(e);
    G.ladder.unshift(e);
    return e;
  };

  /* ───────────────────────── weekly world tick ────────────────────────── */

  /** Develop everyone: your roster in your environment, the rest in theirs. */
  W.developWeek = function (G) {
    const notes = [];
    const phase = S.phaseOfWeek(G.week);
    Object.keys(G.orgs).sort().forEach((id) => {
      const org = G.orgs[id];
      const eff = S.orgEffects(org);
      const lineup = W.lineupOf(org);
      if (!lineup) return;
      const success = W.successOf(G, id);
      const mentor = W.mentorshipOf(org);
      ROLES.forEach((role) => {
        const p = org.roster[role];
        const rng = new S.Rng(G.seed, 'dev:' + G.season + ':' + G.week + ':' + p.id);
        const ctx = {
          environment: 0.55 * org.facilities + 0.45 * org.coaching,
          playingTime: 100,
          mentorship: mentor,
          success: success,
          offRole: p.attributes.roleAptitude.primaryRole !== role,
        };
        void eff;
        const wk = S.developWeek(p, ctx, rng);
        S.applyDevelopment(p, wk, rng);
        p.age = round(p.age + 1 / 52, 3);
        if (wk.leap && id === G.you) notes.push(p.name + ' had a week. Something clicked.');
      });
    });
    // Ladder hopefuls keep grinding — slower, but they are not standing still.
    const ctx = S.ladderContext();
    G.ladder.forEach((e, i) => {
      if (e.signed) return;
      if (i % 4 !== G.week % 4) return; // stagger: a quarter of the pool a week
      const rng = new S.Rng(G.seed, 'ladderdev:' + G.season + ':' + G.week + ':' + e.id);
      const wk = S.developWeek(e.hidden.player, ctx, rng);
      S.applyDevelopment(e.hidden.player, wk, rng);
      e.hidden.player.age = round(e.hidden.player.age + 4 / 52, 3);
    });
    void phase;
    return notes;
  };

  W.successOf = function (G, orgId) {
    const league = G.leagues[G.orgs[orgId].tier];
    if (!league || !league.table[orgId]) return 0.5;
    const row = league.table[orgId];
    const played = row.wins + row.losses;
    return played === 0 ? 0.5 : row.wins / played;
  };

  W.mentorshipOf = function (org) {
    const lineup = W.lineupOf(org);
    if (!lineup) return 0;
    let sum = 0;
    let n = 0;
    ROLES.forEach((r) => {
      const p = lineup[r];
      if (p.age >= 23) { sum += p.attributes.chemistry.mentorship; n++; }
    });
    return n === 0 ? 0 : sum / n;
  };

  /** Weekly income for an org: league revenue plus sponsors plus fanbase. */
  W.weeklyIncome = function (G, orgId) {
    const org = G.orgs[orgId];
    const cfg = S.LEAGUE_BY_TIER[org.tier];
    const merch = 0.02 * org.fanbase * (org.tier === 1 ? 1.6 : org.tier === 2 ? 1 : 0.5);
    const sponsors = orgId === G.you
      ? G.sponsors.active.reduce((s, d) => s + d.weekly, 0)
      : round(0.6 + 0.05 * S.prestige(org) * (org.tier === 1 ? 1.4 : 1), 2);
    return round(cfg.weeklyRevenue + merch + sponsors, 2);
  };

  W.contractsOf = function (org) {
    return Object.keys(org.contracts).sort().map((k) => org.contracts[k]);
  };

  /** Money, contracts and rival interest — the weekly business tick. */
  W.businessWeek = function (G) {
    const events = [];
    Object.keys(G.orgs).sort().forEach((id) => {
      const org = G.orgs[id];
      const cs = W.contractsOf(org);
      org.cash = round(org.cash + W.weeklyIncome(G, id) - S.wageBill(cs), 2);
      const expired = S.tickContracts(cs);
      expired.forEach((c) => {
        if (id === G.you) {
          events.push({ kind: 'expiry', text: (org.roster[c.role] ? org.roster[c.role].name : 'A player') + '’s contract has run out.', role: c.role });
        } else {
          W.aiRenew(G, org, c);
        }
      });
    });

    // Rivals come knocking on your short deals. Never silent — always an item.
    const you = G.orgs[G.you];
    W.contractsOf(you).forEach((c) => {
      const p = you.roster[c.role];
      if (!p) return;
      const rng = new S.Rng(G.seed, 'approach:' + G.season + ':' + G.week + ':' + p.id);
      if (!S.attractsApproach(c, p, rng)) return;
      const suitor = W.findSuitor(G, p, c.role, rng);
      if (!suitor) return;
      events.push({
        kind: 'bid', text: suitor.name + ' have made an approach for ' + p.name + '.',
        orgId: suitor.id, role: c.role,
        wage: S.offerToAccept(p, suitor, suitor.tier, 0.9, false),
        fee: round(c.buyout * (0.6 + rng.range(0, 0.5)), 1),
      });
    });
    return events;
  };

  W.findSuitor = function (G, player, role, rng) {
    const you = G.orgs[G.you];
    const candidates = Object.keys(G.orgs).sort().map((k) => G.orgs[k]).filter((o) => {
      if (o.id === G.you) return false;
      const incumbent = o.roster[role];
      const budget = Math.max(0.3, W.weeklyIncome(G, o.id) - S.wageBill(W.contractsOf(o)) + 2);
      return S.bidInterest(o, player, {
        incumbentAbility: incumbent ? S.currentAbility(incumbent.attributes) : 40,
        tier: o.tier, budgetPerWeek: budget,
      }) > 0.35;
    });
    void you;
    return candidates.length ? candidates[Math.floor(rng.float() * candidates.length)] : null;
  };

  /** An AI org re-signs its own expiring player, or lets them go. */
  W.aiRenew = function (G, org, c) {
    const p = org.roster[c.role];
    if (!p) return;
    const wage = S.offerToAccept(p, org, org.tier, 0.9, true);
    const budget = Math.max(0.2, W.weeklyIncome(G, org.id) - S.wageBill(W.contractsOf(org)) + c.wage);
    if (wage <= budget) {
      c.wage = wage;
      c.weeksRemaining = S.SEASON_WEEKS * 2;
      c.termWeeks = S.SEASON_WEEKS * 2;
      c.buyout = S.defaultBuyout(wage, c.termWeeks);
    } else {
      c.weeksRemaining = S.SEASON_WEEKS; // they hang on a season, then it's a real problem
    }
  };

  /* ─────────────────────────── season rollover ────────────────────────── */

  W.finishSeason = function (G) {
    const lines = [];
    const movements = {};
    // Every table is read before anything is applied, so promotion cannot
    // depend on which tier happens to be processed first.
    S.PYRAMID.forEach((cfg) => {
      const league = G.leagues[cfg.tier];
      movements[cfg.tier] = W.orderOf(league);
    });

    S.PYRAMID.forEach((cfg) => {
      const order = movements[cfg.tier];
      order.forEach((id, i) => {
        const org = G.orgs[id];
        const place = i + 1;
        const prize = S.prizeFor(cfg, place);
        const wonTitle = place === 1;
        const invest = S.investmentBudget(org);
        G.orgs[id] = S.advanceOrgSeason(org, {
          season: G.season, tier: cfg.tier, place: place, of: order.length,
          wonTitle: wonTitle, netCash: prize, investment: invest,
        });
        if (wonTitle) lines.push(cfg.name + ': ' + org.name + ' are champions.');
      });
    });

    // Seats change hands, both directions committed together.
    for (let t = 1; t < 4; t++) {
      const auto = t === 3 ? 2 : 1;
      const move = S.resolveBoundary(movements[t], movements[t + 1], auto);
      move.relegated.forEach((id) => { G.orgs[id].tier = t + 1; });
      move.promoted.forEach((id) => { G.orgs[id].tier = t; });
      move.promoted.forEach((id) => lines.push(G.orgs[id].name + ' are promoted to ' + S.LEAGUE_BY_TIER[t].name + '.'));
      move.relegated.forEach((id) => lines.push(G.orgs[id].name + ' are relegated from ' + S.LEAGUE_BY_TIER[t].name + '.'));
    }

    G.seats = { 1: [], 2: [], 3: [], 4: [] };
    Object.keys(G.orgs).sort().forEach((id) => G.seats[G.orgs[id].tier].push(id));

    G.season++;
    G.week = 1;
    W.startSeason(G);
    return lines;
  };

  W.tableRows = function (G, tier) {
    const league = G.leagues[tier];
    if (!league) return [];
    return S.standings(Object.keys(league.table).sort().map((k) => league.table[k]));
  };
})(typeof window !== 'undefined' ? window : globalThis);
