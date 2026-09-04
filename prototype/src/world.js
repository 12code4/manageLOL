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
    // Seats for the three leagues, plus a floating pool of unaffiliated orgs
    // for The Open. The player is one of the floaters, and starts with nothing.
    const POOL_SIZE = 21;
    const need = S.LEAGUES.reduce((n, l) => n + l.slots, 0) + POOL_SIZE;

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
    const seats = { 1: [], 2: [], 3: [], 4: [] };
    const pool = [];
    let cursor = 0;
    S.LEAGUES.forEach((cfg) => {
      for (let i = 0; i < cfg.slots; i++) {
        const idn = keyed[cursor++].idn;
        const r = new S.Rng(seed, 'org:' + idn.id);
        // Deeper history the higher the seat: institutions live at the top.
        const history = Math.round(r.range(cfg.tier === 1 ? 9 : cfg.tier === 2 ? 5 : 2, cfg.tier === 1 ? 24 : cfg.tier === 2 ? 16 : 10));
        const org = S.seedOrg(r, idn, cfg.tier, history);
        orgs[org.id] = org;
        seats[cfg.tier].push(org.id);
      }
    });
    // The Open. Amateur clubs: little history, little money, no seat. Some of
    // them have been grinding this circuit for years and never got out.
    for (let i = 0; i < POOL_SIZE; i++) {
      const idn = keyed[cursor++].idn;
      const r = new S.Rng(seed, 'org:' + idn.id);
      const org = S.seedOrg(r, idn, 4, Math.round(r.range(0, 6)));
      org.cash = round(r.range(25, 70), 1);
      orgs[org.id] = org;
      pool.push(org.id);
    }
    return { orgs: orgs, seats: seats, pool: pool };
  };

  /** Stock every AI org with five players sized to its tier and prestige. */
  W.stockRosters = function (G) {
    Object.keys(G.orgs).sort().forEach((id) => {
      const org = G.orgs[id];
      if (id === G.you) return;
      const rng = new S.Rng(G.seed, 'roster:' + id);
      const centre = (S.isLeagueTier(org.tier) ? { 1: 80, 2: 72, 3: 66 }[org.tier] : S.OPEN_QUALITY_CENTRE)
        + (S.prestige(org) - 50) * 0.12;
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
    S.LEAGUES.forEach((cfg) => (G.leagues[cfg.tier] = W.newLeagueState(G, cfg.tier)));
    G.champion = null;
    G.playoffs = null;
    G.gauntlet = null;
    G.lastSeason = null;
    G.intl = null;
    // The Open runs a points table across the year instead of a league table.
    G.circuit = { points: {}, results: [], live: null, entered: {}, seatWinners: [] };
    // Keyed off the live field, not just the pool: a club relegated into The
    // Open at rollover, or one minted by turnover, has to be visible to the
    // standings or it cannot be promoted no matter how well it does.
    W.openField(G).forEach((id) => (G.circuit.points[id] = 0));
    G.circuit.points[G.you] = 0;
  };

  /** True when the player holds no league seat and lives on the circuit. */
  W.unaffiliated = (G) => !S.isLeagueTier(G.orgs[G.you].tier);

  /** Everyone competing in The Open, the player included, in a stable order. */
  W.openField = function (G) {
    const ids = G.pool.slice();
    if (W.unaffiliated(G) && ids.indexOf(G.you) < 0) ids.push(G.you);
    return ids.sort();
  };

  /* ─────────────────────────── playoffs ─────────────────────────── */

  /** Seed the brackets from the regular-season tables. Idempotent. */
  W.startPlayoffs = function (G) {
    if (G.playoffs) return G.playoffs;
    G.playoffs = {};
    S.LEAGUES.forEach((cfg) => {
      const order = W.orderOf(G.leagues[cfg.tier]);
      G.playoffs[cfg.tier] = S.buildBracket(order.slice(0, cfg.playoffTeams), cfg.playoffBestOf);
    });
    return G.playoffs;
  };

  /** Your playoff series this week, if you made it and it is ready. */
  W.yourPlayoffMatch = function (G) {
    if (!G.playoffs || W.unaffiliated(G)) return null;
    const b = G.playoffs[G.orgs[G.you].tier];
    return b ? S.nextMatchFor(b, G.you) : null;
  };

  /** Resolve one bracket series through the fast path. */
  W.fastBracketResolver = function (G, tier, label) {
    const cfg = S.LEAGUE_BY_TIER[tier];
    return (m) => {
      const rng = new S.Rng(G.seed, label + ':' + G.season + ':' + tier + ':' + m.id);
      const res = S.resolveFastSeries(W.fastSide(G, m.a), W.fastSide(G, m.b), cfg.playoffBestOf, rng, { games: false });
      const winner = res.winner === 0 ? m.a : m.b;
      const hi = Math.max(res.score[0], res.score[1]), lo = Math.min(res.score[0], res.score[1]);
      return { winner: winner, score: [hi, lo] };
    };
  };

  /** Play every bracket, optionally leaving your own series for the takeover. */
  W.playPlayoffWeek = function (G, skipYours) {
    W.startPlayoffs(G);
    const lines = [];
    S.LEAGUES.forEach((cfg) => {
      const b = G.playoffs[cfg.tier];
      const skip = skipYours && cfg.tier === G.orgs[G.you].tier ? G.you : undefined;
      S.playBracket(b, W.fastBracketResolver(G, cfg.tier, 'po'), new S.Rng(G.seed, 'po:' + G.season + ':' + cfg.tier), skip);
      if (b.champion && !b.announced) {
        b.announced = true;
        lines.push(G.orgs[b.champion].name + ' win ' + cfg.name + '.');
      }
    });
    return lines;
  };

  /* ──────────────────────── the promotion gauntlet ──────────────────────── */

  /**
   * One contested seat per boundary: the club just above the automatic
   * relegation line defends against the best challenger that did not go up
   * automatically. One Bo5, everything on it.
   */
  W.startGauntlets = function (G) {
    if (G.gauntlet) return G.gauntlet;
    G.gauntlet = {};
    for (let t = 1; t < 3; t++) {
      const upper = W.orderOf(G.leagues[t]);
      const lower = W.orderOf(G.leagues[t + 1]);
      const auto = t === 3 ? 2 : 1;
      const defender = upper[upper.length - auto - 1];
      const challenger = lower[auto];
      if (!defender || !challenger) continue;
      G.gauntlet[t] = S.buildGauntlet(defender, challenger);
    }
    return G.gauntlet;
  };

  W.yourGauntlet = function (G) {
    if (!G.gauntlet) return null;
    const keys = Object.keys(G.gauntlet);
    for (let i = 0; i < keys.length; i++) {
      const g = G.gauntlet[keys[i]];
      if (g.winner === null && (g.defender === G.you || g.challenger === G.you)) return { tier: Number(keys[i]), g: g };
    }
    return null;
  };

  W.playGauntlets = function (G, skipYours) {
    W.startGauntlets(G);
    const lines = [];
    Object.keys(G.gauntlet).sort().forEach((t) => {
      const g = G.gauntlet[t];
      if (g.winner !== null) return;
      if (skipYours && (g.defender === G.you || g.challenger === G.you)) return;
      const rng = new S.Rng(G.seed, 'gaunt:' + G.season + ':' + t);
      const cfgTier = Number(t);
      const res = S.resolveFastSeries(W.fastSide(G, g.defender), W.fastSide(G, g.challenger), 5, rng, { games: false });
      g.winner = res.winner === 0 ? g.defender : g.challenger;
      g.score = [Math.max(res.score[0], res.score[1]), Math.min(res.score[0], res.score[1])];
      if (S.gauntletPromoted(g)) {
        lines.push(G.orgs[g.challenger].name + ' take ' + G.orgs[g.defender].name + '’s seat in ' + S.LEAGUE_BY_TIER[cfgTier].name + '.');
      } else {
        lines.push(G.orgs[g.defender].name + ' survive the gauntlet ' + g.score[0] + '–' + g.score[1] + '.');
      }
    });
    return lines;
  };

  /** Rounds played in a given match week, spread evenly across the split. */
  W.roundsThisWeek = function (league, week) {
    const d = S.weekDef(week);
    if (d.kind !== 'match' || d.split === null) return [];
    const total = league.fixtures.reduce((m, f) => Math.max(m, f.round), 0);
    return S.roundsInWeek(total, d.split, week);
  };

  /** Your fixture this week, if any. */
  W.yourFixture = function (G) {
    if (W.unaffiliated(G)) return null;
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
    // The purse: winning pays now, not only in the season-end prize table.
    // At the bottom of the pyramid this is most of how an org earns its way up.
    if (G.orgs[winner]) G.orgs[winner].cash = round(G.orgs[winner].cash + league.cfg.winPurse, 2);
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
    const seated = S.isLeagueTier(org.tier);
    // A league seat pays you every week just for holding it. Without one there
    // is a grassroots trickle and nothing else — which is the whole squeeze of
    // The Open: you are losing money every week you do not win something.
    const base = seated ? cfg.weeklyRevenue : S.GRASSROOTS_STIPEND;
    const merch = 0.02 * org.fanbase * (org.tier === 1 ? 1.6 : org.tier === 2 ? 1 : 0.5);
    const sponsors = orgId === G.you
      ? G.sponsors.active.reduce((s, d) => s + d.weekly, 0)
      : round((seated ? 0.6 : 0.15) + 0.05 * S.prestige(org) * (org.tier === 1 ? 1.4 : 1), 2);
    // Opex is the drain that keeps a budget a budget: staff, the building,
    // travel. Without it every org's cash grows forever and by season ten the
    // economy is decorative.
    return round(base + merch + sponsors - cfg.operatingCost, 2);
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

  /**
   * Off-season turnover: careers end, seats are refilled, and clubs that ran
   * out of money and history disappear so new names can take their place.
   * Without this the world never turns over — the same forty-eight orgs field
   * the same players a year older, forever.
   */
  W.turnover = function (G) {
    const lines = [];
    const yourRetirees = [];

    Object.keys(G.orgs).sort().forEach((id) => {
      const org = G.orgs[id];
      ROLES.forEach((role) => {
        const p = org.roster[role];
        if (!p) return;
        const rng = new S.Rng(G.seed, 'retire:' + G.season + ':' + p.id);
        if (!S.retiresNow(p, rng)) return;
        delete org.contracts[p.id];
        org.roster[role] = null;
        if (p.ladder) p.ladder.signed = false;
        if (id === G.you) yourRetirees.push(p);
        else W.refillSeat(G, org, role);
        if (org.tier <= 2 && S.currentAbility(p.attributes) > 78) {
          lines.push(p.name + ' retires after ' + Math.floor(p.age - 17) + ' years. ' + org.name + ' need a ' + role + '.');
        }
      });
      if (org.roster.top || org.roster.mid) org.chem = S.reconcileChem(org.chem, W.lineupOf(org) || org.roster);
    });
    yourRetirees.forEach((p) => lines.push('<b>' + p.name + '</b> has retired. That seat is yours to fill.'));

    // Clubs at the bottom that are broke and have no history behind them fold,
    // and a new name takes the seat.
    const taken = {};
    Object.keys(G.orgs).forEach((k) => (taken[G.orgs[k].name] = 1));
    Object.keys(G.orgs).sort().forEach((id) => {
      if (id === G.you) return;
      const org = G.orgs[id];
      if (org.tier < 3) return;
      const rng = new S.Rng(G.seed, 'fold:' + G.season + ':' + id);
      const last = org.history.finishes[0];
      const placeFraction = last && last.of > 1 ? (last.place - 1) / (last.of - 1) : 0.5;
      if (org.cash <= 0) {
        if (rng.chance(0.35 + 0.6 * (org.legacy / 100))) return;
      } else {
        // Solvent amateurs with no history still disband after a bad season.
        if (org.tier !== 4 || org.legacy >= 8 || org.seasons < 1) return;
        if (!rng.chance(0.10 * placeFraction)) return;
      }
      const seat = G.seats[org.tier].indexOf(id);
      const fresh = S.generateOrg(new S.Rng(G.seed, 'new:' + G.season + ':' + id), 'new-' + G.season + '-' + id, org.region, org.tier, taken);
      taken[fresh.name] = 1;
      delete G.orgs[id];
      G.orgs[fresh.id] = fresh;
      if (seat >= 0) G.seats[org.tier][seat] = fresh.id;
      W.stockOrg(G, fresh);
      lines.push(org.name + ' have folded after ' + org.seasons + ' seasons. <b>' + fresh.name + '</b> take the seat.');
    });
    return lines;
  };

  /** Sign a replacement into one empty seat on an AI roster. */
  W.refillSeat = function (G, org, role) {
    const rng = new S.Rng(G.seed, 'refill:' + G.season + ':' + org.id + ':' + role);
    const centre = (S.isLeagueTier(org.tier) ? { 1: 80, 2: 72, 3: 66 }[org.tier] : S.OPEN_QUALITY_CENTRE)
      + (S.prestige(org) - 50) * 0.12;
    const p = S.genPlayer(rng, {
      id: org.id + ':' + role + ':' + G.season,
      region: org.region,
      qualityCenter: clamp(rng.gaussian(centre, 4.5), 30, 94),
      ageRange: [17, 22],
      primaryRole: role,
    });
    org.roster[role] = p;
    const wage = S.wageDemand(p, org.tier, S.prestige(org));
    const term = S.SEASON_WEEKS * 2;
    org.contracts[p.id] = { playerId: p.id, orgId: org.id, wage: wage, weeksRemaining: term,
      termWeeks: term, signedSeason: G.season, buyout: S.defaultBuyout(wage, term), role: role };
  };

  W.stockOrg = function (G, org) {
    ROLES.forEach((role) => W.refillSeat(G, org, role));
    org.chem = S.initChem(org.roster);
    for (let w = 0; w < 20; w++) S.rampWeek(org.chem, org.roster, 1);
  };

  /* ──────────────────────────── The Open ───────────────────────────── */

  W.reindexSeats = function (G) {
    G.seats = { 1: [], 2: [], 3: [], 4: [] };
    G.pool = [];
    Object.keys(G.orgs).sort().forEach((id) => {
      const t = G.orgs[id].tier;
      G.seats[t].push(id);
      if (!S.isLeagueTier(t) && id !== G.you) G.pool.push(id);
    });
  };

  /** The circuit's season table, best first. Points, then a stable id. */
  W.circuitStandings = function (G) {
    const pts = G.circuit ? G.circuit.points : {};
    return Object.keys(pts).sort()
      .map((id) => ({ orgId: id, points: pts[id] || 0, rep: G.orgs[id] ? S.prestige(G.orgs[id]) : 0 }))
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        // Points first, then who the scene actually rates. Falling straight to
        // the id would rank a whole scoreless field alphabetically.
        if (Math.abs(b.rep - a.rep) > 1e-9) return b.rep - a.rep;
        return a.orgId < b.orgId ? -1 : 1;
      });
  };

  /** Which events run this week, for an org sitting in The Open. */
  /** The circuit's calendar is a plain list of weeks. Nothing is derived. */
  W.eventsThisWeek = (G) => S.eventsInWeek(G.week);

  /**
   * Draw a field for one event. The player is seated first when they entered;
   * the rest come from the pool, ordered by circuit points so the good
   * amateurs keep turning up and the field has some continuity — then by a
   * seeded shuffle so it is never the same sixteen every time.
   */
  W.drawField = function (G, event, includeYou) {
    const rng = new S.Rng(G.seed, 'field:' + G.season + ':' + G.week + ':' + event.id);
    // The reputation gate is the *manager's* barrier — it is the thing being
    // climbed. It must not also filter the field, or the Gateway draws from
    // the handful of amateur clubs that happen to have cleared 36 and comes up
    // empty in season one: a one-team bracket the player wins by walking in.
    // A qualifier for a league seat attracts the best amateurs in the scene,
    // so that is exactly who it invites — ranked, not gated.
    const eligible = G.pool.filter((id) => {
      const org = G.orgs[id];
      return W.lineupOf(org) && org.cash >= event.entryFee;
    });
    // Seed only the top of the scene, then shuffle the rest. Ranking the whole
    // field meant `rest` was always empty and the shuffle below it was dead
    // code: the same eight clubs turned up in the same bracket slots every
    // single week, which is the difference between a circuit and a treadmill.
    const ranked = W.circuitStandings(G).map((r) => r.orgId).filter((id) => eligible.indexOf(id) >= 0);
    const seeds = ranked.slice(0, Math.max(1, Math.floor(event.fieldSize / 4)));
    const rest = eligible.filter((id) => seeds.indexOf(id) < 0);
    const keyed = rest.map((id) => ({ id: id, k: rng.float() }));
    keyed.sort((a, b) => (a.k !== b.k ? a.k - b.k : a.id < b.id ? -1 : 1));
    const ordered = seeds.concat(keyed.map((k) => k.id));
    const field = includeYou ? [G.you] : [];
    for (let i = 0; field.length < event.fieldSize && i < ordered.length; i++) field.push(ordered[i]);
    return field;
  };

  /** A bracket this thin is not a tournament; nobody should win one by default. */
  W.MIN_FIELD = 4;

  /** Enter an event: pay the fee, draw the field, build the bracket. */
  W.enterEvent = function (G, event) {
    const you = G.orgs[G.you];
    const check = S.canEnter(event, { reputation: S.prestige(you), cash: you.cash, rosterFilled: !!W.lineupOf(you) });
    if (!check.allowed) return check;
    const field = W.drawField(G, event, true);
    if (field.length < W.MIN_FIELD) {
      return { allowed: false, reason: 'field', repShort: 0 };
    }
    you.cash = round(you.cash - event.entryFee, 2);
    G.circuit.live = {
      rung: event.id,
      bracket: S.buildBracket(field, event.bestOf),
      exits: {},
      week: G.week,
    };
    G.circuit.entered[G.season + ':' + G.week + ':' + event.id] = true;
    return check;
  };

  /** A resolver that records who went out in which round. */
  W.circuitResolver = function (G, event, live) {
    return (m) => {
      const rng = new S.Rng(G.seed, 'circ:' + G.season + ':' + G.week + ':' + event.id + ':' + m.id);
      const isFinal = m.feedsInto === null;
      const bestOf = isFinal ? event.finalBestOf : event.bestOf;
      const res = S.resolveFastSeries(W.fastSide(G, m.a), W.fastSide(G, m.b), bestOf, rng, { games: false });
      const winner = res.winner === 0 ? m.a : m.b;
      const loser = res.winner === 0 ? m.b : m.a;
      live.exits[loser] = m.round;
      const hi = Math.max(res.score[0], res.score[1]), lo = Math.min(res.score[0], res.score[1]);
      return { winner: winner, score: [hi, lo] };
    };
  };

  /** Pay out a finished bracket to everyone in it. */
  W.settleEvent = function (G, event, live) {
    const b = live.bracket;
    const lines = [];
    b.teams.forEach((id) => {
      const org = G.orgs[id];
      if (!org) return;
      const won = b.champion === id;
      const place = S.placementOf(b.rounds, live.exits[id] || 1, won);
      const reward = S.rewardFor(event, place, S.prestige(org));
      // rewardFor already nets the entry fee off the purse. The player paid
      // theirs when they entered, so give it back to them here; the AI never
      // paid, so the netted figure is exactly right for them.
      org.cash = round(org.cash + reward.cash + (id === G.you ? event.entryFee : 0), 2);
      // Reputation is what the player sees as prestige, and prestige is
      // 0.62*standing + 0.38*legacy — so a rep point has to arrive as more
      // than one point of standing to actually move the number by that much.
      org.standing = S.clamp(org.standing + reward.reputation / 0.62, 0, 100);
      G.circuit.points[id] = (G.circuit.points[id] || 0) + reward.points;
      if (won) {
        lines.push(event.name + ': <b>' + org.name + '</b> take it.');
        if (event.id === 'gateway') {
          G.circuit.seatWinners.push(id);
          lines.push('★ ' + org.name + ' have won a seat in ' + S.LEAGUE_BY_TIER[S.GATEWAY_PRIZE_TIER].name + ' for next season.');
        }
      }
    });
    // Fold every series the manager actually played into the rivalry ledger,
    // and surface any that carried history. Shadow events (no player in the
    // field) fall straight through — this is the manager's memory alone.
    W.foldPlayerMeetings(G, event, b).forEach((l) => lines.push(l));
    G.circuit.results.push({
      season: G.season, week: G.week, rung: event.id,
      champion: b.champion, runnerUp: W.runnerUpOf(b),
      yours: b.teams.indexOf(G.you) >= 0
        ? S.placementOf(b.rounds, live.exits[G.you] || 1, b.champion === G.you)
        : null,
    });
    return lines;
  };

  /**
   * Read the manager's own path through a finished bracket into the head-to-head
   * ledger — every series they played, in round order, the seat-deciding ones
   * weighing heaviest. Returns the grudge lines worth putting in the feed (at
   * most two, so a bracket run cannot flood it), and nothing at all when the
   * manager was not in this field.
   */
  W.foldPlayerMeetings = function (G, event, b) {
    if (!G.rivalry || b.teams.indexOf(G.you) < 0) return [];
    const mine = b.matches
      .filter((m) => m.winner && (m.a === G.you || m.b === G.you))
      .slice()
      .sort((x, y) => (x.round !== y.round ? x.round - y.round : x.id < y.id ? -1 : 1));
    const lines = [];
    mine.forEach((m) => {
      const opp = m.a === G.you ? m.b : m.a;
      if (!opp || !G.orgs[opp]) return;
      const won = m.winner === G.you;
      const isFinal = m.feedsInto === null;
      const prev = G.rivalry.h2h[opp];
      const line = S.grudgeLine(prev, G.orgs[opp].name, won);
      G.rivalry.h2h[opp] = S.recordMeeting(prev, opp, won, {
        season: G.season, week: G.week,
        weight: S.meetingWeight({ rung: event.id, isFinal: isFinal, seatOnLine: event.id === 'gateway' && isFinal }),
      });
      if (line) lines.push(line);
    });
    return lines.slice(0, 2);
  };

  /**
   * Name the one peer a career is set against: closest in standing, tilted
   * toward a developer that climbs the way the manager must. Picked once at the
   * start and again only if the rival folds. Records the rival's tier so a
   * later promotion or relegation can be told as a story beat and not repeated.
   */
  W.assignRival = function (G, seedTag) {
    const cands = G.pool.map((id) => ({ id: id, prestige: S.prestige(G.orgs[id]), personality: G.orgs[id].personality }));
    const id = S.pickRival(cands, S.prestige(G.orgs[G.you]), new S.Rng(G.seed, seedTag));
    G.rivalry.rivalId = id;
    G.rivalry.lastTier = id && G.orgs[id] ? G.orgs[id].tier : null;
    return id;
  };

  /**
   * Where the rivalry stands after a rollover: the rival climbing past you, or
   * falling back to you, or folding and a new face stepping up. One beat per
   * change, never the same one twice — the rival's last known tier is the memo.
   */
  W.rivalBeats = function (G) {
    const r = G.rivalry;
    if (!r || !r.rivalId) return [];
    const lines = [];
    const rival = G.orgs[r.rivalId];
    if (!rival) {
      lines.push('Your rival is gone — folded, and the circuit closes over the space. Time for a new one.');
      W.assignRival(G, 'rival:repick:' + G.season);
      const fresh = G.orgs[r.rivalId];
      if (fresh) lines.push('You mark <b>' + fresh.name + '</b> as the team to beat now.');
      return lines;
    }
    const was = r.lastTier;
    const now = rival.tier;
    if (now !== was) {
      const youUp = S.isLeagueTier(G.orgs[G.you].tier);
      if (now < was) {
        lines.push((youUp ? '' : '★ ') + 'Your rival <b>' + rival.name + '</b> climb into ' + S.LEAGUE_BY_TIER[now].name +
          (youUp ? '.' : ' — and you are still grinding The Open.'));
      } else {
        lines.push('Your rival ' + rival.name + ' slip back to ' +
          (S.isLeagueTier(now) ? S.LEAGUE_BY_TIER[now].name : 'The Open') + '.');
      }
      r.lastTier = now;
    }
    return lines;
  };

  W.runnerUpOf = function (b) {
    const final = b.matches.filter((m) => m.feedsInto === null)[0];
    if (!final || !final.winner) return null;
    return final.winner === final.a ? final.b : final.a;
  };

  /** Your live circuit match, if you are in a bracket with a series ready. */
  W.yourCircuitMatch = function (G) {
    const live = G.circuit && G.circuit.live;
    if (!live) return null;
    return S.nextMatchFor(live.bracket, G.you);
  };

  /** Resolve the running event around you, or entirely if you are not in it. */
  W.runCircuitWeek = function (G, skipYours) {
    const live = G.circuit && G.circuit.live;
    if (!live) return [];
    const event = S.EVENT_BY_RUNG[live.rung];
    S.playBracket(live.bracket, W.circuitResolver(G, event, live),
      new S.Rng(G.seed, 'circw:' + G.season + ':' + G.week + ':' + live.rung),
      skipYours && live.bracket.teams.indexOf(G.you) >= 0 ? G.you : undefined);
    if (live.bracket.champion === null) return [];
    const lines = W.settleEvent(G, event, live);
    G.circuit.live = null;
    return lines;
  };

  /**
   * Everything in The Open that the manager is not in. AI amateurs run their
   * own weekend brackets so the circuit's points table moves whether or not
   * the player shows up.
   */
  W.runShadowCircuit = function (G) {
    const events = W.eventsThisWeek(G);
    const lines = [];
    events.forEach((event) => {
      const key = G.season + ':' + G.week + ':' + event.id + ':shadow';
      if (G.circuit.entered[key]) return;
      G.circuit.entered[key] = true;
      const inYours = G.circuit.live && G.circuit.live.rung === event.id;
      if (inYours) return; // the player's own bracket already covers this one
      const field = W.drawField(G, event, false);
      if (field.length < W.MIN_FIELD) return;
      const shadow = { rung: event.id, bracket: S.buildBracket(field, event.bestOf), exits: {}, week: G.week };
      S.playBracket(shadow.bracket, W.circuitResolver(G, event, shadow),
        new S.Rng(G.seed, 'shadow:' + G.season + ':' + G.week + ':' + event.id));
      W.settleEvent(G, event, shadow).forEach((l) => {
        if (event.id !== 'weekend') lines.push(l);
      });
    });
    return lines;
  };

  /* ─────────────────────── the international stage ─────────────────────── */
  /* Worlds and the Crucible. The home region sends its real tier-1 teams; the
     rest of the world is drawn from each region's character. See sim.js /
     packages/core/src/season/international.ts. */

  W.intlEventThisWeek = (G) => S.INTL_EVENTS.filter((e) => e.fixedWeeks.indexOf(G.week) >= 0)[0] || null;

  /** The home region's real qualifiers: the top of the tier-1 table. */
  W.homeReps = function (G, event) {
    const league = G.leagues[1];
    if (!league) return [];
    return W.orderOf(league).slice(0, event.homeSlots);
  };

  /** A fresh name for a foreign entrant, from the same pool the pyramid uses. */
  W.intlName = function (rng, taken) {
    const P = S.ORG_NAME_PARTS;
    let name = '';
    for (let i = 0; i < 30 && !name; i++) {
      const stem = rng.chance(0.55) ? rng.pick(P.prefixes) + rng.pick(P.suffixes) : rng.pick(P.standalone);
      const q = rng.pick(P.qualifiers);
      const cand = q === '' ? stem : stem + ' ' + q;
      if (!taken[cand]) name = cand;
    }
    if (!name) name = rng.pick(P.standalone) + ' ' + rng.int(2, 99);
    taken[name] = 1;
    const tag = name.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3) || 'INT';
    return { name: name, tag: tag };
  };

  /** Build the field, seed it, draw the bracket. One per season and event. */
  W.buildIntl = function (G, event) {
    const nameRng = new S.Rng(G.seed, 'intlname:' + G.season + ':' + event.id);
    const meta = {};
    const sides = {};
    const entrants = [];
    const taken = {};
    Object.keys(G.orgs).forEach((k) => (taken[G.orgs[k].name] = 1));
    W.homeReps(G, event).forEach((id) => {
      const org = G.orgs[id];
      meta[id] = { name: org.name, tag: org.tag, region: org.region, home: true };
      sides[id] = null; // resolved live via fastSide
      entrants.push({ id: id, seedStrength: W.fastSide(G, id).strength });
    });
    const alloc = S.foreignAllocation(event);
    S.FOREIGN_REGIONS.forEach((region) => {
      for (let s = 0; s < alloc[region]; s++) {
        const id = 'intl-' + region + '-' + s;
        const strength = S.regionChampionStrength(region, new S.Rng(G.seed, 'intlpow:' + G.season + ':' + event.id + ':' + region + ':' + s));
        const nm = W.intlName(nameRng, taken);
        meta[id] = { name: nm.name, tag: nm.tag, region: region, home: false };
        sides[id] = S.foreignChampionSide(id, region, strength);
        entrants.push({ id: id, seedStrength: strength });
      }
    });
    const order = S.seedInternational(entrants.map((e) => ({ id: e.id, seedStrength: e.seedStrength })));
    const ids = order.map((e) => e.id);
    G.intl = {
      event: event.id, season: G.season,
      bracket: S.buildBracket(ids, event.bestOf),
      meta: meta, sides: sides, exits: {}, done: false, settled: false,
      playerIn: ids.indexOf(G.you) >= 0,
    };
    return G.intl;
  };

  /** A side for the resolver: home teams live off their roster, foreigns synthetic. */
  W.intlSideOf = function (G, id) {
    const s = G.intl.sides[id];
    return s ? s : W.fastSide(G, id);
  };

  W.intlResolver = function (G, event) {
    return (m) => {
      const rng = new S.Rng(G.seed, 'intlm:' + G.season + ':' + event.id + ':' + m.id);
      const isFinal = m.feedsInto === null;
      const bestOf = isFinal ? event.finalBestOf : event.bestOf;
      const res = S.resolveFastSeries(W.intlSideOf(G, m.a), W.intlSideOf(G, m.b), bestOf, rng, { games: false });
      const winner = res.winner === 0 ? m.a : m.b;
      const loser = res.winner === 0 ? m.b : m.a;
      G.intl.exits[loser] = m.round;
      const hi = Math.max(res.score[0], res.score[1]), lo = Math.min(res.score[0], res.score[1]);
      return { winner: winner, score: [hi, lo] };
    };
  };

  /** Advance the bracket around the player, or fully if they are not in it. */
  W.runIntlWeek = function (G, skipYours) {
    if (!G.intl || G.intl.done) return [];
    const event = S.INTL_BY_ID[G.intl.event];
    S.playBracket(G.intl.bracket, W.intlResolver(G, event),
      new S.Rng(G.seed, 'intlw:' + G.season + ':' + event.id),
      skipYours && G.intl.bracket.teams.indexOf(G.you) >= 0 ? G.you : undefined);
    if (G.intl.bracket.champion === null) return [];
    return W.settleIntl(G, event);
  };

  W.yourIntlMatch = function (G) {
    if (!G.intl || G.intl.done) return null;
    return S.nextMatchFor(G.intl.bracket, G.you);
  };

  /** Pay the real orgs in the field; announce who conquered the world. */
  W.settleIntl = function (G, event) {
    if (G.intl.settled) return [];
    const b = G.intl.bracket;
    const lines = [];
    b.teams.forEach((id) => {
      const org = G.orgs[id];
      if (!org) return; // foreign synthetic team: no persistent state to pay
      const place = S.placementOf(b.rounds, G.intl.exits[id] || 1, b.champion === id);
      const rw = S.intlReward(event, place);
      org.cash = round(org.cash + rw.cash, 2);
      org.standing = S.clamp(org.standing + rw.standing, 0, 100);
      org.legacy = S.clamp(org.legacy + rw.legacy, 0, 100);
    });
    const champId = b.champion;
    const champ = G.intl.meta[champId];
    if (champId === G.you) {
      lines.push('★★ <b>' + G.orgs[G.you].name + '</b> ARE ' + (event.id === 'worlds' ? 'WORLD CHAMPIONS' : 'CRUCIBLE CHAMPIONS') + '! ★★');
    } else if (champ) {
      lines.push(event.name + ': <b>' + champ.name + '</b> of ' + S.REGIONS[champ.region].name + ' take the title.');
      if (champ.home) lines.push('★ Meridia rules the world — a home-region team wins ' + event.name + '.');
    }
    if (G.intl.playerIn && champId !== G.you) {
      const place = S.placementOf(b.rounds, G.intl.exits[G.you] || 1, false);
      const LAB = { finalist: 'the final', semi: 'the semi-finals', quarter: 'the quarter-finals', entered: 'the group stage' };
      lines.push('Your ' + event.name + ' run ends in ' + (LAB[place] || 'the group stage') + '.');
    }
    G.intl.done = true;
    G.intl.settled = true;
    return lines;
  };

  W.finishSeason = function (G) {
    const lines = [];
    const movements = {};
    // Every table is read before anything is applied, so promotion cannot
    // depend on which tier happens to be processed first.
    S.LEAGUES.forEach((cfg) => {
      movements[cfg.tier] = W.orderOf(G.leagues[cfg.tier]);
    });

    // The table decides who is good; the bracket decides who lifts the
    // trophy, so a title is the playoff champion, not the top of the table.
    const champions = {};
    if (G.playoffs) S.LEAGUES.forEach((cfg) => { if (G.playoffs[cfg.tier]) champions[cfg.tier] = G.playoffs[cfg.tier].champion; });

    S.LEAGUES.forEach((cfg) => {
      const order = movements[cfg.tier];
      order.forEach((id, i) => {
        const org = G.orgs[id];
        const place = i + 1;
        const prize = S.prizeFor(cfg, place);
        const wonTitle = champions[cfg.tier] ? champions[cfg.tier] === id : place === 1;
        const invest = S.investmentBudget(org);
        G.orgs[id] = S.advanceOrgSeason(org, {
          season: G.season, tier: cfg.tier, place: place, of: order.length,
          wonTitle: wonTitle, netCash: prize, investment: invest,
        });
        if (wonTitle) lines.push(cfg.name + ': <b>' + org.name + '</b> are champions.');
      });
    });

    // League-to-league boundaries: the automatic places come from the table,
    // one more per boundary was settled in the gauntlet, and both directions
    // commit together so the result cannot depend on processing order.
    for (let t = 1; t < 3; t++) {
      const move = S.resolveBoundary(movements[t], movements[t + 1], 1);
      const g = G.gauntlet ? G.gauntlet[t] : null;
      if (g && S.gauntletPromoted(g)) {
        move.relegated.push(g.defender);
        move.promoted.push(g.challenger);
      }
      move.relegated.forEach((id) => { G.orgs[id].tier = t + 1; });
      move.promoted.forEach((id) => { G.orgs[id].tier = t; });
      move.promoted.forEach((id) => lines.push('<b>' + G.orgs[id].name + '</b> are promoted to ' + S.LEAGUE_BY_TIER[t].name + '.'));
      move.relegated.forEach((id) => lines.push(G.orgs[id].name + ' are relegated from ' + S.LEAGUE_BY_TIER[t].name + '.'));
    }

    // The bottom boundary is different: there is no league below tier 3 to be
    // promoted *from*, only The Open. Two clubs drop into the circuit and the
    // two Gateway winners take their seats — which is the whole reason the
    // Gateway exists, and the only way in that does not cost money.
    const bottom = S.LEAGUES[S.LEAGUES.length - 1].tier;
    const relegated = movements[bottom].slice(-2);
    const risers = (G.circuit.seatWinners || []).slice(0, relegated.length);
    relegated.forEach((id) => {
      const org = G.orgs[id];
      org.tier = 4;
      // A club that just left the league would otherwise land in The Open with
      // more reputation than the Gateway asks for, and could walk straight
      // back up. Dropping out costs you your standing as well as your seat:
      // the Open's own ceiling is the most any unaffiliated club may carry.
      org.standing = Math.min(org.standing, S.EVENT_BY_RUNG.contenders.repCap / 0.62);
      lines.push(org.name + ' drop out of ' + S.LEAGUE_BY_TIER[bottom].name + ' and into The Open.');
    });
    risers.forEach((id) => {
      G.orgs[id].tier = bottom;
      lines.push('★ <b>' + G.orgs[id].name + '</b> win their way into ' + S.LEAGUE_BY_TIER[bottom].name + '.');
    });
    // Any seat the Gateway did not fill goes to the circuit's points leader —
    // a league cannot run a man short.
    if (risers.length < relegated.length) {
      // Seats must conserve: two clubs went down, so two must come up, or the
      // league drains a pair a year until there is nobody left in it. Circuit
      // Points decide it, but they cannot decide it alone — in a season where
      // nobody scored, an id tiebreak would promote the same two lowest-id
      // orgs forever, so reputation breaks the tie underneath. That is the
      // honest fallback anyway: the league invites its most established
      // amateur clubs.
      const standings = W.circuitStandings(G)
        .filter((r) => risers.indexOf(r.orgId) < 0)
        .map((r) => r.orgId);
      for (let i = 0; risers.length < relegated.length && i < standings.length; i++) {
        const id = standings[i];
        if (G.orgs[id].tier !== 4) continue;
        G.orgs[id].tier = bottom;
        risers.push(id);
        lines.push('<b>' + G.orgs[id].name + '</b> are invited up on Circuit Points.');
      }
    }

    // The Open's clubs live too. Without this their seasons counter, legacy,
    // infrastructure and reinvestment all freeze, and the amateur scene is a
    // set of statues the player walks past.
    const openOrder = W.circuitStandings(G).map((r) => r.orgId).filter((id) => G.orgs[id] && G.orgs[id].tier === 4);
    openOrder.forEach((id, i) => {
      const org = G.orgs[id];
      const advanced = S.advanceOrgSeason(org, {
        season: G.season, tier: 4, place: i + 1, of: Math.max(1, openOrder.length),
        wonTitle: false, netCash: 0, investment: S.investmentBudget(org),
      });
      // Everything advances except standing. On the circuit, standing *is* the
      // reputation the manager is climbing with, and letting the season-end
      // regression drag it toward the amateur band would undo a year of
      // tournament results every rollover — a player at 42 would be pulled
      // back under 30 for the crime of a mid-table year. The rung ceilings are
      // already what stop reputation running away; nothing else needs to.
      advanced.standing = org.standing;
      G.orgs[id] = advanced;
    });

    W.reindexSeats(G);

    G.season++;
    G.week = 1;
    W.turnover(G).slice(0, 8).forEach((l) => lines.push(l));

    // Seats may have changed hands during turnover, so rebuild the index.
    W.reindexSeats(G);
    // Where the rivalry stands now the dust has settled — told before the new
    // season starts, while the tiers that just changed are still the news.
    W.rivalBeats(G).forEach((l) => lines.push(l));
    W.startSeason(G);
    return lines;
  };

  W.tableRows = function (G, tier) {
    const league = G.leagues[tier];
    if (!league) return [];
    return S.standings(Object.keys(league.table).sort().map((k) => league.table[k]));
  };
})(typeof window !== 'undefined' ? window : globalThis);
