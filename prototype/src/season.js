/* manageLOL — the Season hub, the standings table, and the org profile sheet.
   The FM surfaces. Craft here is rhythm and restraint: one gold button on the
   screen, hairline rules, tabular numerals that never jitter between rounds. */
(function () {
  'use strict';
  const S = window.LOLSim;
  const W = window.LOLWorld;

  // Small local helpers so this module never depends on load order.
  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };
  /** The mono all-caps rule every card in the app wears. */
  function sectionLabel(title, sub) {
    const d = el('div', 'seclabel');
    d.innerHTML = '<span class="section-label" style="margin:0">' + title + '</span>' +
      (sub ? '<span class="secsub mono">' + sub + '</span>' : '');
    return d;
  }

  /* ────────────────────────────── the run strip ───────────────────────── */

  const WEEK_GLYPH = {
    match: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 4l6 6M19 4l-6 6M12 11l-5 9h10l-5-9z"/></svg>',
    market: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 9h13l-3-3M20 15H7l3 3"/></svg>',
    training: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 12h16M7 8v8M17 8v8"/></svg>',
    event: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 3l2.4 5.5 6 .5-4.5 4 1.3 5.9L12 15.8 6.8 18.9 8.1 13 3.6 9l6-.5z"/></svg>',
  };

  function runStrip(G) {
    const box = el('div', 'card run');
    box.appendChild(sectionLabel('The run', 'Season ' + G.season + ' · ' + S.weekDef(G.week).window));
    const strip = el('div', 'runstrip');
    const start = Math.max(1, Math.min(41, G.week - 4));
    for (let i = 0; i < 12; i++) {
      const wk = start + i;
      const d = S.weekDef(wk);
      const cell = el('div', 'runcell k-' + d.kind + (wk === G.week ? ' now' : '') + (wk < G.week ? ' past' : ''));
      cell.title = 'Week ' + wk + ' — ' + d.note;
      const res = G.weekResults[G.season + ':' + wk];
      cell.innerHTML =
        '<span class="wknum">' + wk + '</span>' +
        '<span class="wkico">' + WEEK_GLYPH[d.kind] + '</span>' +
        '<span class="wkbar"></span>' +
        '<span class="wkres ' + (res || '') + '">' + (res === 'w' ? 'W' : res === 'l' ? 'L' : '·') + '</span>';
      strip.appendChild(cell);
    }
    box.appendChild(strip);
    const legend = el('div', 'runlegend');
    legend.innerHTML = [
      ['match', 'match'], ['market', 'window'], ['training', 'scrim'], ['event', 'event'],
    ].map((p) => '<span class="lg k-' + p[0] + '"><i></i>' + p[1] + '</span>').join('');
    box.appendChild(legend);
    return box;
  }

  /* ───────────────────────────── standings ────────────────────────────── */

  function movementCell(move) {
    if (!move) return '<span class="mv">·</span>';
    return '<span class="mv ' + (move > 0 ? 'up' : 'dn') + '">' + (move > 0 ? '▲' : '▼') + Math.abs(move) + '</span>';
  }

  function formDots(form) {
    const shown = form.slice(0, 5).reverse();
    let html = '<span class="form">';
    for (let i = 0; i < 5 - shown.length; i++) html += '<i class="n"></i>';
    shown.forEach((w) => (html += '<i class="' + (w ? 'w' : 'l') + '"></i>'));
    return html + '</span>';
  }

  function standingsTable(G, tier) {
    const league = G.leagues[tier];
    const cfg = league.cfg;
    const rows = W.tableRows(G, tier);
    const wrap = el('div', 'card table-card');

    const head = el('div', 'tablehead');
    head.innerHTML =
      '<div><h3>' + cfg.name + '</h3><p class="sub">' +
      (cfg.legs === 2 ? 'Double round-robin' : 'Single round-robin') + ' · Bo' + cfg.regularBestOf +
      ' · top ' + cfg.playoffTeams + ' to playoffs' +
      (cfg.relegationLine <= cfg.slots ? ' · bottom ' + (cfg.slots - cfg.relegationLine + 1) + ' relegated' : '') +
      '</p></div>' +
      '<span class="roundchip mono">R' + Math.max(1, league.round) + '/' + maxRound(league) + '</span>';
    wrap.appendChild(head);

    const t = el('table', 'standings');
    t.innerHTML =
      '<colgroup><col style="width:34px"><col style="width:30px"><col><col style="width:32px">' +
      '<col style="width:32px"><col style="width:32px"><col style="width:44px"><col style="width:76px"><col style="width:52px"></colgroup>' +
      '<thead><tr><th>Pos</th><th></th><th>Org</th><th class="r">P</th><th class="r">W</th><th class="r">L</th>' +
      '<th class="r">GD</th><th>Form</th><th class="r">Win%</th></tr></thead>';
    const body = el('tbody');

    rows.forEach((row, i) => {
      const place = i + 1;
      if (place === cfg.playoffTeams + 1) body.appendChild(cutRow('up', 'Playoffs ▲'));
      if (cfg.relegationLine <= cfg.slots && place === cfg.relegationLine) body.appendChild(cutRow('down', 'Relegation ▼'));

      const org = G.orgs[row.orgId];
      const played = row.wins + row.losses;
      const gd = row.gameWins - row.gameLosses;
      const tr = el('tr', row.orgId === G.you ? 'you' : '');
      tr.dataset.org = row.orgId;
      if (row.orgId === G.you) tr.setAttribute('aria-current', 'true');
      tr.innerHTML =
        '<td class="mono pos">' + place + '</td>' +
        '<td>' + movementCell(row.move) + '</td>' +
        '<td class="orgcell"><span class="otag mono">' + org.tag + '</span>' +
        '<span class="oname">' + org.name + '</span>' +
        (org.legacy >= 55 ? '<span class="laurel" title="' + S.statureLabel(org) + ' · ' + totalTitles(org) + ' titles · ' + org.seasons + ' seasons">⚜</span>' : '') +
        '</td>' +
        '<td class="mono r">' + played + '</td>' +
        '<td class="mono r">' + row.wins + '</td>' +
        '<td class="mono r">' + row.losses + '</td>' +
        '<td class="mono r gd">' + (gd > 0 ? '<em class="up">+</em>' : gd < 0 ? '<em class="dn">−</em>' : '') + Math.abs(gd) + '</td>' +
        '<td>' + formDots(row.form) + '</td>' +
        '<td class="mono r wr">' + (played ? (100 * row.wins / played).toFixed(1) : '—') + '</td>';
      body.appendChild(tr);
    });
    t.appendChild(body);
    // One delegated listener for the whole table, never one per row.
    body.onclick = (e) => {
      const tr = e.target.closest && e.target.closest('tr[data-org]');
      if (tr) window.openOrgSheet(tr.dataset.org);
    };
    wrap.appendChild(t);
    return wrap;
  }

  function cutRow(kind, label) {
    const tr = el('tr', 'cutrow ' + kind);
    tr.innerHTML = '<td colspan="9"><span>' + label + '</span></td>';
    return tr;
  }

  const maxRound = (league) => league.fixtures.reduce((m, f) => Math.max(m, f.round), 0);
  const totalTitles = (org) => [1, 2, 3, 4].reduce((s, t) => s + (org.history.titles[t] || 0), 0);

  /* ─────────────────────────── the fixture card ───────────────────────── */

  function fixtureCard(G) {
    const d = S.weekDef(G.week);
    const card = el('div', 'card fixture');
    const fx = W.yourFixture(G);

    if (d.kind === 'match' && fx) {
      const oppId = fx.a === G.you ? fx.b : fx.a;
      const opp = G.orgs[oppId];
      const you = G.orgs[G.you];
      const mine = W.fastSide(G, G.you);
      const theirs = W.fastSide(G, oppId);
      const p = 1 / (1 + Math.pow(10, -(mine.strength - theirs.strength) / 15));
      const league = G.leagues[you.tier];
      const order = W.orderOf(league);

      card.appendChild(sectionLabel('Next', 'Round ' + fx.round + ' · ' + (fx.a === G.you ? 'blue side' : 'red side')));
      const vs = el('div', 'fxvs');
      vs.innerHTML =
        '<div class="fxside"><span class="otag mono big">' + you.tag + '</span><span class="pos mono">' + ord(order.indexOf(G.you) + 1) + '</span></div>' +
        '<div class="fxmid"><span class="fxname">' + opp.name + '</span>' +
        '<span class="fxstat">' + S.statureLabel(opp) + ' · legacy ' + Math.round(opp.legacy) + (opp.legacy >= 55 ? ' ⚜' : '') + '</span></div>' +
        '<div class="fxside r"><span class="otag mono big">' + opp.tag + '</span><span class="pos mono">' + ord(order.indexOf(oppId) + 1) + '</span></div>';
      card.appendChild(vs);

      const bar = el('div', 'wpsplit');
      bar.innerHTML = '<i style="width:' + (p * 100).toFixed(1) + '%"></i>';
      card.appendChild(bar);
      const pct = el('div', 'wplabels');
      pct.innerHTML = '<span class="mono">' + Math.round(p * 100) + '% you</span><span class="mono">' + Math.round((1 - p) * 100) + '% ' + opp.tag + '</span>';
      card.appendChild(pct);

      const warn = matchWarnings(G, you);
      if (warn) card.appendChild(warn);

      const btn = el('button', 'btn primary wide', '▶  Play the series');
      btn.onclick = () => window.startFixture(fx);
      card.appendChild(btn);
      const links = el('div', 'fxlinks');
      links.innerHTML = '<a class="lnk" data-org="' + oppId + '">' + opp.name + ' profile ▸</a>';
      links.onclick = (e) => { if (e.target.dataset.org) window.openOrgSheet(e.target.dataset.org); };
      card.appendChild(links);
      return card;
    }

    card.appendChild(sectionLabel(d.kind === 'market' ? 'The window' : d.kind === 'training' ? 'Training' : 'This week', d.window));
    const body = el('div', 'weekbody');
    body.innerHTML = '<p class="wknote">' + d.note + '</p>' + weekDetail(G, d);
    card.appendChild(body);
    const btn = el('button', 'btn primary wide', continueLabel(G));
    btn.onclick = () => window.advanceWeek();
    card.appendChild(btn);
    return card;
  }

  function weekDetail(G, d) {
    const you = G.orgs[G.you];
    if (d.kind === 'training') {
      const lineup = W.lineupOf(you);
      const coh = lineup ? S.cohesion(you.chem, lineup).cohesion : 0;
      return '<div class="kv"><span>Cohesion</span><b class="mono">' + coh.toFixed(1) + '</b></div>' +
        '<div class="kv"><span>Facilities</span><b class="mono">' + Math.round(you.facilities) + '</b></div>' +
        '<div class="kv"><span>Coaching</span><b class="mono">' + Math.round(you.coaching) + '</b></div>';
    }
    if (d.kind === 'market') {
      const expiring = W.contractsOf(you).filter((c) => c.weeksRemaining <= 12).length;
      return '<div class="kv"><span>Contracts expiring soon</span><b class="mono">' + expiring + '</b></div>' +
        '<div class="kv"><span>Cash</span><b class="mono">' + you.cash.toFixed(1) + '◈</b></div>' +
        '<div class="kv"><span>Wage bill</span><b class="mono">' + S.wageBill(W.contractsOf(you)).toFixed(1) + '◈/wk</b></div>';
    }
    const order = W.orderOf(G.leagues[you.tier]);
    return '<div class="kv"><span>Position</span><b class="mono">' + ord(order.indexOf(G.you) + 1) + ' of ' + order.length + '</b></div>' +
      '<div class="kv"><span>Prestige</span><b class="mono">' + Math.round(S.prestige(you)) + '</b></div>';
  }

  function matchWarnings(G, you) {
    const lineup = W.lineupOf(you);
    if (!lineup) {
      const w = el('div', 'fxwarn');
      w.textContent = '⚠ You cannot field five players.';
      return w;
    }
    const notes = [];
    S.ROLES.forEach((r) => {
      const p = lineup[r];
      if (p.state.fatigue > 65) notes.push(p.name + ' fatigue ' + Math.round(p.state.fatigue));
    });
    const coh = S.cohesion(you.chem, lineup);
    if (coh.cohesion < 50) notes.push('cohesion ' + coh.cohesion.toFixed(0) + ' — the room is not settled');
    if (!notes.length) return null;
    const w = el('div', 'fxwarn');
    w.textContent = '⚠ ' + notes.join(' · ');
    return w;
  }

  function continueLabel(G) {
    const d = S.weekDef(G.week);
    if (d.kind === 'market') return '▶  Advance the week';
    if (d.kind === 'training') return '▶  Run the week';
    return '▶  Continue';
  }

  /* ─────────────────────────── side column cards ──────────────────────── */

  function formCard(G) {
    const you = G.orgs[G.you];
    const league = G.leagues[you.tier];
    const mine = league.results.filter((r) => r.a === G.you || r.b === G.you).slice(-5).reverse();
    const card = el('div', 'card');
    card.appendChild(sectionLabel('Form', mine.length ? 'last ' + mine.length : 'no games yet'));
    if (!mine.length) {
      card.appendChild(el('div', 'empty-note', 'The season has not started.'));
      return card;
    }
    const list = el('div', 'formlist');
    mine.forEach((r) => {
      const home = r.a === G.you;
      const oppId = home ? r.b : r.a;
      const my = home ? r.score[0] : r.score[1];
      const th = home ? r.score[1] : r.score[0];
      const won = my > th;
      const row = el('div', 'formrow');
      row.innerHTML =
        '<span class="mono rnd">R' + r.round + '</span>' +
        '<span class="res ' + (won ? 'w' : 'l') + '">' + (won ? '▲' : '▼') + '</span>' +
        '<span class="otag mono">' + G.orgs[oppId].tag + '</span>' +
        '<span class="score mono">' + my + '–' + th + '</span>' +
        '<span class="side">' + (home ? 'blue' : 'red') + '</span>';
      list.appendChild(row);
    });
    card.appendChild(list);
    return card;
  }

  function pyramidCard(G) {
    const you = G.orgs[G.you];
    const card = el('div', 'card');
    card.appendChild(sectionLabel('The pyramid', 'season ' + G.season));
    const list = el('div', 'pyrlist');
    S.PYRAMID.forEach((cfg) => {
      const here = cfg.tier === you.tier;
      const order = G.leagues[cfg.tier] ? W.orderOf(G.leagues[cfg.tier]) : [];
      const row = el('div', 'pyrrow' + (here ? ' here' : ''));
      row.innerHTML =
        '<span class="tno mono">T' + cfg.tier + '</span>' +
        '<span class="tname">' + cfg.name + '</span>' +
        '<span class="tnote mono">' + (here ? ord(order.indexOf(G.you) + 1) + ' of ' + cfg.slots : cfg.slots + ' seats') + '</span>';
      row.title = cfg.blurb;
      list.appendChild(row);
    });
    card.appendChild(list);
    return card;
  }

  function deskCard(G) {
    const unread = G.inbox.filter((m) => !m.read).length;
    const card = el('div', 'card');
    card.appendChild(sectionLabel('The desk', unread ? unread + ' new' : 'clear'));
    const list = el('div', 'desk');
    G.inbox.slice(0, 5).forEach((m) => {
      const row = el('div', 'deskrow k-' + (m.kind || 'info') + (m.read ? '' : ' unread'));
      row.innerHTML = '<span class="dglyph"></span><span class="dtx">' + m.text + '</span><span class="dwk mono">wk ' + m.week + '</span>';
      list.appendChild(row);
    });
    if (!G.inbox.length) list.appendChild(el('div', 'empty-note', 'Nothing yet.'));
    card.appendChild(list);
    return card;
  }

  /* ───────────────────────────── the org sheet ────────────────────────── */

  function orgSheet(G, orgId) {
    const org = G.orgs[orgId];
    const sheet = el('div', 'orgsheet');
    const close = el('button', 'iconbtn sheetclose', '✕');
    close.onclick = () => window.closeOrgSheet();
    sheet.appendChild(close);

    const head = el('div', 'osheet-head');
    head.innerHTML =
      '<div class="crest"><span class="mono">' + org.tag + '</span></div>' +
      '<div class="oid"><h2>' + org.name + '</h2>' +
      '<p class="sub">' + regionName(org.region) + ' · founded season ' + org.founded + ' · ' + org.personality + '</p>' +
      '<p class="blurb">“' + org.blurb + '”</p></div>' +
      '<div class="prestigebox"><span class="pval mono">' + Math.round(S.prestige(org)) + '</span>' +
      '<span class="plabel">Prestige</span><span class="pstature">' + S.statureLabel(org) + '</span>' +
      '<span class="pbar"><i style="width:' + S.prestige(org).toFixed(0) + '%"></i></span>' +
      '<span class="psplit mono">legacy ' + Math.round(org.legacy) + ' · standing ' + Math.round(org.standing) + '</span></div>';
    sheet.appendChild(head);

    sheet.appendChild(spineBlock(org));

    const cols = el('div', 'osheet-cols');
    cols.appendChild(rosterBlock(G, org));
    cols.appendChild(orgReadBlock(G, org));
    sheet.appendChild(cols);
    return sheet;
  }

  /* The spine: one row per tier, one cell per season. The whole point of a
     persistent world in a single glance — where this org has actually lived. */
  function spineBlock(org) {
    const card = el('div', 'card spine');
    card.appendChild(sectionLabel('The spine', org.seasons + ' seasons'));
    const grid = el('div', 'spinegrid');
    const total = [1, 2, 3, 4].reduce((s, t) => s + (org.history.seasonsAtTier[t] || 0), 0);
    if (!total) {
      card.appendChild(el('div', 'empty-note', 'No history yet. Everyone starts somewhere.'));
      return card;
    }
    [1, 2, 3, 4].forEach((t) => {
      const row = el('div', 'spinerow');
      const n = org.history.seasonsAtTier[t] || 0;
      const titles = org.history.titles[t] || 0;
      let cells = '';
      for (let i = 0; i < n; i++) cells += '<i class="' + (i < titles ? 'title' : '') + '"></i>';
      row.innerHTML = '<span class="tno mono">T' + t + '</span><span class="cells">' + cells + '</span>' +
        '<span class="tcount mono">' + (n ? n : '—') + '</span>';
      row.title = n ? n + ' season' + (n === 1 ? '' : 's') + ' at tier ' + t + (titles ? ', ' + titles + ' title' + (titles === 1 ? '' : 's') : '') : 'never';
      grid.appendChild(row);
    });
    card.appendChild(grid);
    const honors = el('div', 'honors');
    const titleTotal = totalTitles(org);
    honors.innerHTML =
      '<span>' + (titleTotal ? titleTotal + ' title' + (titleTotal === 1 ? '' : 's') : 'No titles') + '</span>' +
      '<span>Best tier reached: T' + org.history.bestTier + '</span>' +
      '<span>' + (org.history.seasonsAtTier[1] ? org.history.seasonsAtTier[1] + ' seasons in the top league' : 'Never in the top league') + '</span>';
    card.appendChild(honors);
    return card;
  }

  function rosterBlock(G, org) {
    const card = el('div', 'card');
    card.appendChild(sectionLabel('Roster', org.name === G.orgs[G.you].name ? 'yours' : 'their five'));
    const list = el('div', 'orgroster');
    S.ROLES.forEach((r) => {
      const p = org.roster[r];
      const row = el('div', 'orow');
      if (!p) {
        row.innerHTML = '<span class="role-tag">' + r.slice(0, 3) + '</span><span class="oempty">vacant</span>';
      } else {
        const c = org.contracts[p.id];
        const ca = Math.round(S.currentAbility(p.attributes));
        const weeks = c ? c.weeksRemaining : 0;
        row.innerHTML =
          '<span class="role-tag">' + r.slice(0, 3) + '</span>' +
          '<span class="oname">' + p.name + '</span>' +
          '<span class="mono oage">' + Math.floor(p.age) + '</span>' +
          '<span class="mono oca">' + ca + '</span>' +
          '<span class="termbar' + (weeks <= 12 ? ' warn' : '') + '"><i style="width:' +
          Math.max(4, Math.min(100, (weeks / 120) * 100)).toFixed(0) + '%"></i></span>' +
          '<span class="mono oterm">' + weeks + 'w</span>';
      }
      list.appendChild(row);
    });
    card.appendChild(list);
    return card;
  }

  function orgReadBlock(G, org) {
    const card = el('div', 'card');
    card.appendChild(sectionLabel('The org', 'your scouts’ read'));
    const list = el('div', 'orgread');
    [
      ['Facilities', org.facilities], ['Coaching', org.coaching],
      ['Analytics', org.analytics], ['Scouting', org.scouting], ['Fanbase', org.fanbase],
    ].forEach((pair) => {
      const row = el('div', 'oread');
      row.innerHTML = '<span>' + pair[0] + '</span><span class="track"><i style="width:' + pair[1].toFixed(0) + '%"></i></span>' +
        '<span class="mono">' + descriptor(pair[1]) + '</span>';
      list.appendChild(row);
    });
    const cs = W.contractsOf(org);
    const row = el('div', 'oread wide');
    row.innerHTML = '<span>Wage bill</span><span class="track"><i style="width:' +
      Math.min(100, S.wageBill(cs) * 4).toFixed(0) + '%"></i></span><span class="mono">' + S.wageBill(cs).toFixed(1) + '◈/wk</span>';
    list.appendChild(row);
    card.appendChild(list);
    return card;
  }

  const descriptor = (v) => (v >= 85 ? 'elite' : v >= 70 ? 'very good' : v >= 55 ? 'good' : v >= 40 ? 'fair' : v >= 25 ? 'poor' : 'threadbare');
  const regionName = (id) => ({ mer: 'Meridia', kyo: 'Kyorin', tia: 'Tianxu', van: 'Vantia', wilds: 'the Wilds' })[id] || id;
  const ord = (n) => (n <= 0 ? '—' : n + (n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'));

  /* ─────────────────────────────── assembly ───────────────────────────── */

  window.renderSeasonHub = function (G, main) {
    const you = G.orgs[G.you];
    const head = el('div', 'screen-head');
    head.innerHTML =
      '<h2>' + S.LEAGUE_BY_TIER[you.tier].name + '</h2>' +
      '<p class="sub">' + S.LEAGUE_BY_TIER[you.tier].blurb + '</p>';
    main.appendChild(head);

    main.appendChild(runStrip(G));

    const grid = el('div', 'hub');
    const left = el('div', 'hubcol');
    left.appendChild(fixtureCard(G));
    left.appendChild(standingsTable(G, you.tier));
    const right = el('div', 'hubcol');
    right.appendChild(formCard(G));
    right.appendChild(pyramidCard(G));
    right.appendChild(deskCard(G));
    grid.appendChild(left);
    grid.appendChild(right);
    main.appendChild(grid);
  };

  window.buildOrgSheet = orgSheet;
  window.seasonOrd = ord;
  window.seasonStandingsTable = standingsTable;
})();
