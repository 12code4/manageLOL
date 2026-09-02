/* ============================================================= match day: draft · live · crowd =============================================================
   Injected into template.html at build. Uses the game layer's globals (G, S, el, $, render, toast, pushLog, …). */

function yourTeam(){ return {name:'Your Org', lineup:lineup(), chem:G.chem, coachQuality:G.coachQuality, patchFamiliarity:G.patchFamiliarity}; }
function oppTeam(opp){ return Object.assign({coachQuality:55, patchFamiliarity:65}, opp); }
function ensurePools(){
  ROLE_ORDER.forEach(r=>{const p=G.roster[r]; if(p&&(!p.championPool||!Object.keys(p.championPool).length))S.seedPool(p,new S.Rng(G.seed,'pool:'+p.id));});
}
function ensureOppPools(opp){
  ROLE_ORDER.forEach(r=>{const p=opp.lineup[r]; if(!p.championPool||!Object.keys(p.championPool).length)S.seedPool(p,new S.Rng(G.seed,'opp-pool:'+opp.name+':'+r));});
}
function otherSide(side){ return side==='blue'?'red':'blue'; }
function sideTeam(side){ const m=G.match; return side===m.yourSide? yourTeam(): oppTeam(m.opp); }
function sideName(side){ return side===G.match.yourSide?'Your Org':G.match.opp.name; }

/* -------- series lifecycle -------- */
function startSeries(){
  if(rosterCount()<5){toast('You need all five roles filled to compete.','bad');return;}
  ensurePools();
  const opp=G.matchOpp||(G.matchOpp=makeOpponent()); ensureOppPools(opp);
  G.match={opp:opp, gameIndex:0, games:[], phase:'draft', crowd:[], hype:30, timer:30, chatRng:new S.Rng(G.seed,'chat:'+G.week+':'+G.stageWins)};
  beginDraft();
}
function beginDraft(){
  const m=G.match; clearTimers();
  m.yourSide = m.gameIndex%2===0?'blue':'red';
  m.draft=S.newDraft(); m.verdict=null; m.phase='draft'; m.lastWarning=null; m.hype=30;
  m.draftRng=new S.Rng(G.seed,'draft:'+G.week+':'+G.stageWins+':'+m.gameIndex);
  crowdPush('ambient',{team:'Your Org',opp:m.opp.name},2);
  render(); scheduleAi();
}
function clearTimers(){ const m=G.match; if(!m)return; clearTimeout(m.aiT); clearInterval(m.timerI); clearTimeout(m.liveT); }
function scheduleAi(){
  const m=G.match; if(!m||m.phase!=='draft')return;
  const step=S.currentStep(m.draft); if(!step){finishDraft();return;}
  if(step.side!==m.yourSide){
    clearTimeout(m.aiT);
    m.aiT=setTimeout(()=>{
      const mm=G.match; if(!mm||mm.phase!=='draft')return;
      const st=S.currentStep(mm.draft); if(!st||st.side===mm.yourSide)return;
      const id=S.aiChoose(mm.draft,st.side,sideTeam(st.side),sideTeam(mm.yourSide),G.patch,mm.draftRng);
      doDraftAction(id);
    },700);
  } else startTimer();
}
function startTimer(){
  const m=G.match; m.timer=30; clearInterval(m.timerI);
  m.timerI=setInterval(()=>{
    const mm=G.match; if(!mm||mm.phase!=='draft'){clearInterval(m.timerI);return;}
    mm.timer--; const e=$('#draftTimer'); if(e)e.textContent='0:'+String(Math.max(0,mm.timer)).padStart(2,'0');
    if(mm.timer<=0){ clearInterval(m.timerI); const st=S.currentStep(mm.draft);
      if(st&&st.side===mm.yourSide){ const sug=S.coachSuggestions(mm.draft,mm.yourSide,yourTeam(),oppTeam(mm.opp),G.patch,1)[0]; if(sug){toast('Timer expired — coach locked '+S.CHAMP_BY_ID[sug.champId].name+'.');doDraftAction(sug.champId);} } }
  },1000);
}
function doDraftAction(champId){
  const m=G.match; if(!m||m.phase!=='draft')return;
  const s=m.draft, st=S.currentStep(s); if(!st)return;
  if(S.takenIds(s)[champId])return;
  clearInterval(m.timerI); clearTimeout(m.aiT);
  const team=sideTeam(st.side), c=S.CHAMP_BY_ID[champId];
  m.draft=S.applyAction(s,champId,team);
  const tn=sideName(st.side), on=sideName(otherSide(st.side));
  if(st.type==='ban'){ crowdPush('ban',{champ:c.name,team:tn,opp:on},1); m.hype=Math.min(100,m.hype+4); }
  else {
    const pk=m.draft.picks[st.side][m.draft.picks[st.side].length-1]; const pl=team.lineup[pk.role];
    crowdPush('pick',{champ:c.name,champObj:c,team:tn,opp:on,player:pl.name},1);
    const pf=S.prof(pl,champId);
    if(pf<45||pk.offRole){ crowdPush('pilotWarning',{champ:c.name,player:pl.name,team:tn},1); m.lastWarning=(pk.offRole?'OFF-ROLE — ':'PILOT — ')+c.name+' → '+pl.name+': '+pf+' proficiency'+(pk.offRole?' (playing out of position)':''); }
    m.hype=Math.min(100,m.hype+7);
  }
  render();
  if(S.isComplete(m.draft))finishDraft(); else scheduleAi();
}
function delegateDraft(){
  const m=G.match; if(!m||m.phase!=='draft')return; clearTimers();
  while(!S.isComplete(m.draft)){ const st=S.currentStep(m.draft); const id=S.aiChoose(m.draft,st.side,sideTeam(st.side),sideTeam(otherSide(st.side)),G.patch,m.draftRng); m.draft=S.applyAction(m.draft,id,sideTeam(st.side)); }
  crowdPush('ambient',{team:'Your Org'},1); pushLog('You let the coach run the rest of the game '+(m.gameIndex+1)+' draft.','info');
  finishDraft();
}
function finishDraft(){
  const m=G.match; clearTimers();
  const you=S.evaluateSide(m.draft,m.yourSide,yourTeam(),G.patch);
  const them=S.evaluateSide(m.draft,otherSide(m.yourSide),oppTeam(m.opp),G.patch);
  m.verdict={you:you,them:them}; m.phase='verdict'; m.hype=Math.min(100,m.hype+10);
  crowdPush('compLock',{label:you.label,team:'Your Org',opp:m.opp.name,player:G.roster.mid?G.roster.mid.name:'mid'},2);
  render();
}
function playGame(){
  const m=G.match; if(!m||m.phase!=='verdict')return;
  const you=yourTeam(); you.draftScore=m.verdict.you.score;
  const opp=oppTeam(m.opp); opp.draftScore=m.verdict.them.score;
  const g=S.simulateGame(you,opp,new S.Rng(G.seed,'game:'+G.week+':'+G.stageWins+':'+m.gameIndex));
  g.verdict=m.verdict; g.yourSide=m.yourSide;
  // deterministic synthetic win-prob path for the live graph
  const wr=new S.Rng(G.seed,'wp:'+G.week+':'+G.stageWins+':'+m.gameIndex);
  const end=g.winner==='a'?90:10; const pts=[50]; for(let i=1;i<14;i++){ const t=i/13; const target=50+(end-50)*Math.pow(t,1.6); pts.push(S.clamp(target+wr.gaussian(0,9)*(1-t*0.6),4,96)); } pts.push(end);
  g.wpPath=pts;
  m.games.push(g); m.phase='live'; m.liveStep=0; m.hype=45;
  render(); runLive();
}
function runLive(){
  const m=G.match; const g=m.games[m.games.length-1]; const steps=g.timeline.length; const won=g.winner==='a';
  const tick=()=>{
    const mm=G.match; if(!mm||mm.phase!=='live')return;
    mm.liveStep++; const i=mm.liveStep-1; const tn=won?'Your Org':mm.opp.name; const on=won?mm.opp.name:'Your Org';
    if(i===1)crowdPush('firstBlood',{team:tn,player:g.mvp.name,opp:on},2);
    else if(i===2)crowdPush('objective',{team:tn,opp:on},2);
    else if(i===3)crowdPush(g.lengthMin>30?'stall':'objective',{team:tn,opp:on},1);
    else if(i>=4&&i<steps-1)crowdPush(won?'comeback':'throw',{team:won?'Your Org':mm.opp.name,opp:on},1);
    else if(i===steps-1)crowdPush('result',{won:won,team:'Your Org',opp:mm.opp.name,player:g.mvp.name},3);
    mm.hype=Math.min(100,45+i*11);
    render();
    if(mm.liveStep<steps) mm.liveT=setTimeout(tick,850); else { mm.phase='postgame'; setTimeout(()=>{ if(G.match)render(); },200); }
  };
  m.liveT=setTimeout(tick,600);
}
function nextGame(){
  const m=G.match; const yw=m.games.filter(g=>g.winner==='a').length, ow=m.games.length-yw;
  if(yw>=2||ow>=2){ concludeSeries(yw,ow); return; }
  m.gameIndex++; beginDraft();
}
function concludeSeries(yw,ow){
  const m=G.match; clearTimers(); const won=yw>ow; const st=stage(); const opp=m.opp;
  G.ui.match={series:{scoreA:yw,scoreB:ow,games:m.games,winner:won?'a':'b',bestOf:3},opp:opp,won:won};
  if(won){
    G.cash+=st.prize; G.reputation=Math.min(100,G.reputation+st.rep); G.stageWins++; G.matchOpp=null;
    pushLog('Won the series vs <b>'+opp.name+'</b> '+yw+'-'+ow+' (+'+st.prize+'◈, +'+st.rep+' rep).','good');
    toast('Series won vs '+opp.name+' — '+yw+'-'+ow+'!','good');
    if(G.stageWins>=st.wins){
      if(G.stageIndex<STAGES.length-1){ G.stageIndex++; G.stageWins=0; const ns=stage(); pushLog('★ Promoted to <b>'+ns.name+'</b>!','good'); toast('★ You\'ve reached '+ns.name+'!','good'); refreshSponsorOffers(); }
      else { pushLog('★★ You are WORLD CHAMPIONS. The garage org made it all the way.','good'); toast('★★ WORLDS CHAMPIONS. You did it.','good'); }
    }
  } else {
    pushLog('Lost the series vs '+opp.name+' '+ow+'-'+yw+'. Regroup and try again.','bad');
    toast('Series lost vs '+opp.name+'. Back to the drawing board.','bad');
  }
  m.phase='series'; G.patchFamiliarity=Math.min(100,G.patchFamiliarity+6);
  advanceWeekQuiet(); render();
}
function endSeriesView(){ clearTimers(); G.match=null; render(); }
function crowdPush(trigger,payload,count){
  const m=G.match; if(!m)return;
  const msgs=S.crowdReact(trigger,payload,m.chatRng,count);
  m.crowd=m.crowd.concat(msgs).slice(-40);
}

/* -------- rendering -------- */
function renderCompete(main){
  const m=G.match;
  if(!m) return renderPrep(main);
  if(m.phase==='draft'||m.phase==='verdict') return renderDraft(main);
  if(m.phase==='live'||m.phase==='postgame') return renderLive(main);
  if(m.phase==='series') return renderSeries(main);
}
function renderPrep(main){
  const st=stage();
  const head=el('div','screen-head');
  head.innerHTML='<p class="eyebrow">'+st.name+'</p><h1 class="title cond">Compete</h1><p class="sub">'+st.blurb+' <b style="color:var(--ink)">'+G.stageWins+' / '+st.wins+'</b> series won at this tier.</p>';
  main.appendChild(head);
  if(rosterCount()<5){ const c=el('div','card'); c.innerHTML='<div class="empty-note">You need all five roles filled before you can enter a match.<br>Head to <b>Scout the Ladder</b> and sign a full starting five.</div>'; main.appendChild(c); return; }
  ensurePools();
  const you=yourTeam(); const opp=G.matchOpp||(G.matchOpp=makeOpponent()); ensureOppPools(opp);
  const byou=S.teamBreakdown(you), bopp=S.teamBreakdown(opp);
  const pA=1/(1+Math.pow(10,-(byou.strength-bopp.strength)/15));
  const vs=el('div','vs');
  vs.innerHTML='<div class="card teamcard you"><div class="role-tag" style="color:var(--gold)">You</div><div class="tn">'+you.name+'</div><div class="ts">'+byou.strength.toFixed(1)+'<small>TEAM STRENGTH · PRE-DRAFT</small></div><div class="mono" style="color:var(--muted);font-size:11px;margin-top:6px">base '+byou.base.toFixed(1)+' × mesh '+byou.meshMult.toFixed(3)+'</div></div>'+
    '<div class="mid">VS</div>'+
    '<div class="card teamcard"><div class="role-tag">'+st.name+'</div><div class="tn">'+opp.name+'</div><div class="ts">'+bopp.strength.toFixed(1)+'<small>TEAM STRENGTH · PRE-DRAFT</small></div><div class="mono" style="color:var(--muted);font-size:11px;margin-top:6px">base '+bopp.base.toFixed(1)+' × mesh '+bopp.meshMult.toFixed(3)+'</div></div>';
  main.appendChild(vs);
  const wp=el('div','wpbar'); wp.innerHTML='<div class="you" style="width:'+(pA*100)+'%">'+Math.round(pA*100)+'% '+you.name+'</div><div class="opp" style="width:'+((1-pA)*100)+'%">'+opp.name+' '+Math.round((1-pA)*100)+'%</div>'; main.appendChild(wp);
  const info=el('div','role-tag'); info.style.cssText='margin:-6px 0 14px;color:var(--muted)'; info.innerHTML='Patch '+(G.patch.index+1)+' · your patch familiarity <b style="color:var(--ink)">'+G.patchFamiliarity+'%</b> · head coach: <b style="color:var(--ink)">interim (your cousin, rating '+G.coachQuality+')</b> — draft edge is bounded to ±8 strength; win the draft and a weaker roster can steal a series.'; main.appendChild(info);
  const controls=el('div'); controls.style.cssText='display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap';
  const play=el('button','btn primary'); play.textContent='Start Bo3 series — draft game 1'; play.onclick=startSeries;
  const wk=el('button','btn'); wk.textContent='Advance a week (scrim & gel)'; wk.onclick=advanceWeek;
  controls.appendChild(play); controls.appendChild(wk); main.appendChild(controls);
  if(G.ui.match) main.appendChild(seriesSummaryCard(G.ui.match));
  const logc=el('div','card'); logc.style.cssText='padding:14px 16px;margin-top:18px'; logc.innerHTML='<div class="section-label">Inbox</div>'; logc.appendChild(logList()); main.appendChild(logc);
}

function tierChip(c){ const s=S.champStrength(c,G.patch); const t=S.tierOf(s); const o=G.patch.outliers[c.id]||0; return '<span class="tierchip tier-'+t+'">'+t+(o>0?' ↑':o<0?' ↓':'')+'</span>'; }
function curveBars(c){ const v=[c.curve.early,c.curve.mid,c.curve.late]; const mx=Math.max.apply(null,v); return '<div class="curve">'+v.map(x=>'<i class="'+(x===mx?'hi':'')+'" style="height:'+Math.max(2,Math.round(x*24))+'px"></i>').join('')+'</div>'; }

function renderDraft(main){
  const m=G.match, s=m.draft, step=S.currentStep(s);
  const yourTurn=!!step&&step.side===m.yourSide;
  const you=yourTeam(), them=oppTeam(m.opp);
  const head=el('div','screen-head');
  head.innerHTML='<p class="eyebrow">'+stage().name+' · vs '+m.opp.name+'</p><h1 class="title cond">Draft — Game '+(m.gameIndex+1)+'</h1><p class="sub">Blue buys first pick; Red buys the counter-pick window. Deny their comfort, protect your plan, and mind who is piloting what.</p>';
  main.appendChild(head);

  const board=el('div','draft');
  const phaseIdx=s.step<6?0:s.step<12?1:s.step<16?2:3;
  const dh=el('div','dhead');
  dh.innerHTML='<div class="cond" style="font-weight:700;font-size:20px">DRAFT <span style="color:var(--faint)">· GAME '+(m.gameIndex+1)+' OF 3</span></div>'+
    '<div class="phase-chips">'+['BAN 1','PICK 1','BAN 2','PICK 2'].map((p,i)=>'<span class="pchip '+(i===phaseIdx&&step?'on':'')+'">'+p+'</span>').join('')+'</div>'+
    '<div style="margin-left:auto;display:flex;align-items:center;gap:14px"><span class="dtimer" id="draftTimer">'+(yourTurn?'0:'+String(m.timer).padStart(2,'0'):'—')+'</span>'+
    '<span class="pill '+(yourTurn?'gold':'')+'">'+(step?(yourTurn?'YOUR '+step.type.toUpperCase()+' · '+m.yourSide.toUpperCase()+' SIDE':m.opp.name.toUpperCase()+' IS '+(step.type==='ban'?'BANNING…':'PICKING…')):'DRAFT COMPLETE')+'</span></div>';
  board.appendChild(dh);

  board.appendChild(sideColumn(m.yourSide,you,'you',step));
  board.appendChild(centerColumn(step,yourTurn,you,them));
  const right=sideColumn(otherSide(m.yourSide),them,'them',step);
  right.appendChild(crowdBlock());
  board.appendChild(right);

  const foot=el('div','dfoot');
  const top=Object.entries(G.patch.archDelta).sort((a,b)=>b[1]-a[1])[0];
  foot.innerHTML=(m.lastWarning?'<span style="color:var(--warn)">'+m.lastWarning+'</span><span style="color:var(--faint)">·</span>':'')+
    '<span>META — '+ARCH_LABEL[top[0]]+' '+(top[1]>=0?'+':'')+top[1].toFixed(0)+' this patch · familiarity '+G.patchFamiliarity+'%</span>'+
    '<span style="color:var(--faint)">·</span><span>Coach (interim, '+G.coachQuality+') suggestions are decent but stale on new patches.</span>';
  board.appendChild(foot);
  main.appendChild(board);

  if(m.phase==='verdict') main.appendChild(verdictPanel());
}
function sideColumn(side,team,cls,step){
  const m=G.match, s=m.draft; const col=el('div','dcol '+cls);
  const isYou=cls==='you'; const label=isYou?'YOUR SIDE · '+side.toUpperCase():m.opp.name.toUpperCase()+' · '+side.toUpperCase();
  col.innerHTML='<div class="role-tag" style="color:'+(isYou?'var(--gold)':'var(--info)')+';letter-spacing:.14em">'+label+'</div>';
  // bans
  const bans=s.bans[side]; const banRow=el('div'); banRow.innerHTML='<div class="role-tag" style="margin-bottom:5px;font-size:9px">BANS</div>';
  const br=el('div','bans-row');
  for(let i=0;i<5;i++){ const b=bans[i]; const d=el('div','slot'+(b?' filled ban':'')); d.textContent=b?S.CHAMP_BY_ID[b].name:''; if(!b&&step&&step.type==='ban'&&step.side===side&&i===bans.length){d.className='slot now';d.textContent='…';} br.appendChild(d); }
  banRow.appendChild(br); col.appendChild(banRow);
  // picks
  const picks=s.picks[side]; const pr=el('div'); pr.innerHTML='<div class="role-tag" style="margin-bottom:5px;font-size:9px">PICKS</div>';
  const list=el('div'); list.style.cssText='display:flex;flex-direction:column;gap:5px';
  for(let i=0;i<5;i++){
    const p=picks[i]; const d=el('div','slot'+(p?' filled':''));
    if(p){ const c=S.CHAMP_BY_ID[p.champId]; const pl=team.lineup[p.role]; const pf=S.prof(pl,p.champId);
      d.innerHTML='<span>'+c.name+'</span><span class="rt">'+p.role.toUpperCase()+(p.offRole?' ⟲':'')+'</span>'+(isYou?'<span class="pf" style="color:'+(pf>=65?'var(--gel)':pf>=45?'var(--ink)':'var(--toxic)')+'">'+pf+'p</span>':'<span class="pf" style="color:var(--faint)">'+pl.name+'</span>'); }
    else if(step&&step.type==='pick'&&step.side===side&&i===picks.length){ d.className='slot now'; d.textContent=(side===m.yourSide?'PICKING NOW…':'THINKING…'); }
    list.appendChild(d);
  }
  pr.appendChild(list); col.appendChild(pr);
  // comp read
  const wc=S.winCondition(picks); const clarity=picks.length?Math.round(Math.min(1,Math.max(wc.curve.early,wc.curve.late)/0.5)*100*(picks.length/5)):0;
  const cr=el('div','compread');
  cr.innerHTML='<div class="role-tag" style="font-size:9px">COMP READ</div><div class="lbl '+(isYou?'':'them')+'">'+(picks.length?wc.label.toUpperCase():'—')+'</div><div class="clarity"><i class="'+(isYou?'':'them')+'" style="width:'+clarity+'%"></i></div>'+
    (isYou&&picks.length>=2?'<div style="font-size:11px;color:var(--muted);margin-top:6px">'+comboHint(side,team)+'</div>':'');
  if(!isYou) cr.style.marginTop='0';
  col.appendChild(cr);
  return col;
}
function comboHint(side,team){
  const ev=S.evaluateSide(G.match.draft,side,team,G.patch);
  if(!ev.combos.length) return 'No combo online yet — two picks sharing a plan light one up.';
  const c=ev.combos.sort((a,b)=>b.payoff-a.payoff)[0];
  return cap(c.tag.replace(/([A-Z])/g,' $1').toLowerCase())+' payoff at <b style="color:var(--ink)">'+Math.round(c.chemGate*100)+'%</b> chemistry gate'+(c.chemGate<0.8?' — anchor pair still gelling':'');
}
function centerColumn(step,yourTurn,you,them){
  const m=G.match, s=m.draft; const col=el('div','dcenter');
  const taken=S.takenIds(s);
  const bar=el('div','toolbar'); bar.style.marginBottom='0';
  const roleSel=el('select'); roleSel.innerHTML='<option value="">All roles</option>'+ROLE_ORDER.map(r=>'<option value="'+r+'">'+ROLE_LABEL[r]+'</option>').join(''); roleSel.value=G.ui.draftRole||''; roleSel.onchange=()=>{G.ui.draftRole=roleSel.value;render();};
  const lbl=el('span','section-label'); lbl.style.margin='0'; lbl.textContent=yourTurn?(step.type==='ban'?'Choose a champion to ban':'Choose your pick'):(step?'Waiting on '+m.opp.name:'Draft locked');
  const sp=el('span'); sp.style.flex='1'; bar.appendChild(lbl); bar.appendChild(sp); bar.appendChild(roleSel); col.appendChild(bar);

  // coach scores (for ordering + suggestions)
  let scored=null, topIds={};
  if(yourTurn){ scored=S.scoreActions(s,m.yourSide,you,them,G.patch); scored.slice(0,3).forEach(a=>topIds[a.champId]=1); }
  const scoreOf={}; if(scored)scored.forEach(a=>scoreOf[a.champId]=a);
  let champs=S.CHAMPIONS.slice();
  if(G.ui.draftRole) champs=champs.filter(c=>c.roles.indexOf(G.ui.draftRole)>=0);
  champs.sort((a,b)=>{ const ta=taken[a.id]?1:0, tb=taken[b.id]?1:0; if(ta!==tb)return ta-tb; if(scored){ const va=scoreOf[a.id]?scoreOf[a.id].value:-99, vb=scoreOf[b.id]?scoreOf[b.id].value:-99; if(vb!==va)return vb-va; } return a.name<b.name?-1:1; });

  const grid=el('div','champ-grid');
  const open=step&&step.type==='pick'?S.openRoles(s,m.yourSide):null;
  champs.forEach(c=>{
    const isTaken=!!taken[c.id];
    const card=el('button','ccard'+(isTaken?' taken':'')+(topIds[c.id]?' top':''));
    let pilot='';
    if(yourTurn&&step.type==='pick'&&!isTaken&&open){ const a=S.assignRole(c,open); if(a){ const pl=you.lineup[a.role]; const pf=S.prof(pl,c.id); pilot='<div class="pilot '+(a.offRole?'off':pf<45?'warn':'')+'">'+ROLE_LABEL[a.role]+' · '+pl.name+' · '+pf+'p'+(a.offRole?' ⟲ off-role':'')+'</div>'; } }
    else pilot='<div class="pilot dim">'+c.roles.map(r=>ROLE_LABEL[r]).join(' / ')+'</div>';
    card.innerHTML='<div class="cn"><span>'+c.name+'</span>'+tierChip(c)+'</div><div class="ep">'+c.epithet+'</div>'+curveBars(c)+pilot;
    card.title=c.flavor;
    if(yourTurn&&!isTaken) card.onclick=()=>doDraftAction(c.id); else card.disabled=true;
    grid.appendChild(card);
  });
  col.appendChild(grid);

  if(yourTurn&&scored){
    const box=el('div','coachbox'); box.innerHTML='<div class="role-tag" style="font-size:9px;margin-bottom:4px">COACH SUGGESTS</div>';
    scored.slice(0,3).forEach((a,i)=>{ const c=S.CHAMP_BY_ID[a.champId]; const row=el('div','row'); row.innerHTML='<span class="mono" style="color:'+(i===0?'var(--gold)':'var(--muted)')+'">'+(i+1)+'.</span><span><b>'+c.name+'</b> — '+a.reason+'</span><span class="v">'+(a.value>=0?'+':'')+a.value.toFixed(1)+'</span>'; row.onclick=()=>doDraftAction(a.champId); box.appendChild(row); });
    col.appendChild(box);
  }
  const actions=el('div'); actions.style.cssText='display:flex;gap:10px;margin-top:auto;justify-content:center;flex-wrap:wrap';
  if(step){ const del=el('button','btn'); del.textContent='Let the coach draft the rest'; del.onclick=delegateDraft; actions.appendChild(del); }
  col.appendChild(actions);
  return col;
}
function crowdBlock(){
  const m=G.match; const wrap=el('div','crowd'); wrap.style.marginTop='10px'; wrap.style.minHeight='220px';
  wrap.innerHTML='<div class="ch"><span class="role-tag" style="font-size:9px;letter-spacing:.14em">THE CROWD</span><span style="margin-left:auto"></span><span class="hype"><i style="width:'+m.hype+'%"></i></span><span class="role-tag" style="font-size:8.5px">HYPE</span></div>';
  const list=el('div','list'); list.id='crowdList';
  m.crowd.slice(-14).forEach((msg,i,arr)=>{ const d=el('div','m'); d.style.animationDelay=(i>=arr.length-3?((i-(arr.length-3))*0.12):0)+'s'; d.innerHTML='<span class="u" style="color:'+userColor(msg.user)+'">'+esc(msg.user)+':</span> <span class="t">'+esc(msg.text)+'</span>'; list.appendChild(d); });
  if(!m.crowd.length) list.innerHTML='<div class="empty-note" style="padding:10px">chat is quiet…</div>';
  wrap.appendChild(list);
  return wrap;
}
function userColor(u){ let h=0; for(let i=0;i<u.length;i++)h=(h*31+u.charCodeAt(i))>>>0; return ['var(--gold)','var(--info)','var(--gel)','var(--muted)','var(--warn)','#c98bd6'][h%6]; }
function esc(s){ return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

function verdictPanel(){
  const m=G.match, v=m.verdict; const edge=v.you.score-v.them.score;
  const box=el('div','verdict');
  const contrib=(ev)=>{ const items=ev.picks.map(p=>({k:S.CHAMP_BY_ID[p.champId].name+' ('+ROLE_LABEL[p.role]+')',v:p.total})).concat(ev.combos.map(c=>({k:cap(c.tag.replace(/([A-Z])/g,' $1').toLowerCase())+' combo',v:c.payoff}))); if(ev.curveFit)items.push({k:'Curve coherence',v:ev.curveFit}); return items.sort((a,b)=>Math.abs(b.v)-Math.abs(a.v)).slice(0,3); };
  box.innerHTML='<div style="display:flex;align-items:baseline;gap:14px;flex-wrap:wrap"><div class="role-tag" style="font-size:9px;letter-spacing:.14em">DRAFT VERDICT</div>'+
    '<div class="big" style="color:'+(edge>0.5?'var(--gel)':edge<-0.5?'var(--toxic)':'var(--ink)')+'">'+(edge>0.5?'YOU WON THE DRAFT':edge<-0.5?'THEY WON THE DRAFT':'EVEN DRAFT')+' <span class="mono" style="font-size:18px">'+(edge>=0?'+':'')+edge.toFixed(1)+'</span></div>'+
    '<div class="mono" style="margin-left:auto;color:var(--muted);font-size:12px">you '+(v.you.score>=0?'+':'')+v.you.score.toFixed(1)+' · them '+(v.them.score>=0?'+':'')+v.them.score.toFixed(1)+' · strength points</div></div>'+
    '<div class="vgrid"><div><div class="role-tag" style="color:var(--gold)">YOUR PLAN — '+v.you.label.toUpperCase()+'</div>'+contrib(v.you).map(i=>'<div class="k"><span>'+i.k+'</span><b style="color:'+(i.v>=0?'var(--gel)':'var(--toxic)')+'">'+(i.v>=0?'+':'')+i.v.toFixed(1)+'</b></div>').join('')+'</div>'+
    '<div><div class="role-tag" style="color:var(--info)">'+m.opp.name.toUpperCase()+' — '+v.them.label.toUpperCase()+'</div>'+contrib(v.them).map(i=>'<div class="k"><span>'+i.k+'</span><b style="color:'+(i.v>=0?'var(--gel)':'var(--toxic)')+'">'+(i.v>=0?'+':'')+i.v.toFixed(1)+'</b></div>').join('')+'</div></div>';
  const b=el('button','btn primary'); b.style.marginTop='14px'; b.textContent='Play game '+(m.gameIndex+1)+' ▸'; b.onclick=playGame; box.appendChild(b);
  return box;
}

function renderLive(main){
  const m=G.match; const g=m.games[m.games.length-1]; const won=g.winner==='a'; const done=m.phase==='postgame';
  const shown=Math.min(m.liveStep,g.timeline.length);
  const head=el('div','screen-head');
  head.innerHTML='<p class="eyebrow">'+stage().name+' · game '+(m.gameIndex+1)+' of 3</p><h1 class="title cond">Match Day — Live</h1><p class="sub">You are the manager. Watch, read, and learn what mattered — the post-game breakdown attributes the result to draft, chemistry, and form.</p>';
  main.appendChild(head);
  const live=el('div','live');
  const left=el('div');
  const frac=shown/g.timeline.length;
  const kA=Math.round(g.killsA*frac), kB=Math.round(g.killsB*frac), minute=Math.round(g.lengthMin*Math.max(0.1,frac));
  const sb=el('div','scoreb');
  sb.innerHTML='<span class="tn" style="color:var(--gold)">YOUR ORG</span><span class="sc">'+kA+' – '+kB+'</span><span class="tn" style="color:var(--muted)">'+m.opp.name.toUpperCase()+'</span>'+
    '<span class="mono" style="font-size:12px;color:var(--muted)">'+g.verdict.you.label+' vs '+g.verdict.them.label+'</span><span class="mono" style="margin-left:auto;font-weight:600;font-size:20px">'+String(Math.floor(minute)).padStart(2,'0')+':'+(shown%2?'41':'12')+'</span>';
  left.appendChild(sb);
  // win prob
  const pts=g.wpPath; const n=pts.length; const upto=Math.max(2,Math.round(n*frac));
  const poly=pts.slice(0,upto).map((v,i)=>((i/(n-1))*620+10).toFixed(1)+','+(110-(v/100)*100).toFixed(1)).join(' ');
  const cur=pts[upto-1];
  const wp=el('div','wp-card');
  wp.innerHTML='<div style="display:flex;align-items:baseline"><span class="role-tag" style="font-size:9px;letter-spacing:.14em">WIN PROBABILITY</span><span class="cond" style="margin-left:auto;font-weight:700;font-size:22px;color:'+(cur>=50?'var(--gel)':'var(--toxic)')+'">'+Math.round(cur)+'%</span></div>'+
    '<svg viewBox="0 0 640 120" width="100%" height="120" role="img" aria-label="Win probability over the game"><line x1="10" y1="60" x2="630" y2="60" stroke="var(--line)" stroke-dasharray="3 4"/><polyline points="'+poly+'" fill="none" stroke="var(--gold)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/><circle cx="'+(((upto-1)/(n-1))*620+10).toFixed(1)+'" cy="'+(110-(cur/100)*100).toFixed(1)+'" r="4" fill="var(--gold)"/></svg>';
  left.appendChild(wp);
  // timeline
  const tl=el('div','tl-card'); tl.innerHTML='<div class="role-tag" style="font-size:9px;letter-spacing:.14em;margin-bottom:6px">TIMELINE</div>';
  const ul=el('ul','timeline'); g.timeline.slice(0,shown).forEach((t,i)=>{ const li=el('li',null,esc(t)); li.style.animationDelay=(i===shown-1?0.05:0)+'s'; ul.appendChild(li); });
  if(!shown) ul.innerHTML='<li style="opacity:1;color:var(--faint)">Loading into the Rift-analogue…</li>';
  tl.appendChild(ul); left.appendChild(tl);
  if(done){
    const bn=el('div','banner');
    bn.innerHTML='<div class="big" style="color:'+(won?'var(--gel)':'var(--toxic)')+'">'+(won?'GAME '+(m.gameIndex+1)+' — VICTORY':'GAME '+(m.gameIndex+1)+' — DEFEAT')+'</div><div class="mono" style="color:var(--muted);font-size:12px">'+g.lengthMin+' min · '+g.killsA+'–'+g.killsB+' · MVP <span class="mvp">'+esc(g.mvp.name)+'</span></div>';
    const yw=m.games.filter(x=>x.winner==='a').length, ow=m.games.length-yw; const over=yw>=2||ow>=2;
    const b=el('button','btn primary'); b.style.marginLeft='auto'; b.textContent=over?'Finish series ▸':'Next game ▸'; b.onclick=nextGame; bn.appendChild(b);
    left.appendChild(bn);
    // why panel
    const why=el('div','card'); why.style.padding='12px 16px';
    const bd=g.breakdown; const dA=bd.a.strength-bd.b.strength;
    why.innerHTML='<div class="section-label">Why it went this way</div><div class="vgrid" style="margin-top:0"><div>'+
      '<div class="k"><span>Draft</span><b style="color:'+(g.verdict.you.score-g.verdict.them.score>=0?'var(--gel)':'var(--toxic)')+'">'+(g.verdict.you.score-g.verdict.them.score>=0?'+':'')+(g.verdict.you.score-g.verdict.them.score).toFixed(1)+'</b></div>'+
      '<div class="k"><span>Team synergy (mesh ×'+bd.a.meshMult.toFixed(3)+' vs ×'+bd.b.meshMult.toFixed(3)+')</span><b>'+((bd.a.meshMult-bd.b.meshMult)*100>=0?'+':'')+((bd.a.meshMult-bd.b.meshMult)*100).toFixed(1)+'%</b></div>'+
      '<div class="k"><span>Roster base strength</span><b>'+bd.a.base.toFixed(1)+' vs '+bd.b.base.toFixed(1)+'</b></div></div>'+
      '<div><div class="k"><span>Final strength gap</span><b style="color:'+(dA>=0?'var(--gel)':'var(--toxic)')+'">'+(dA>=0?'+':'')+dA.toFixed(1)+'</b></div><div class="k"><span>Pre-game win probability</span><b>'+Math.round(g.winProbA*100)+'%</b></div><div class="k"><span>Result</span><b>'+(won?'held':'upset')+'</b></div></div></div>';
    left.appendChild(why);
    // box score
    const sl=el('table','statline'); sl.innerHTML='<thead><tr><th>Your player</th><th>K</th><th>D</th><th>A</th><th>DMG%</th><th>Rating</th></tr></thead>';
    const tb=el('tbody'); ROLE_ORDER.forEach(r=>{ const line=g.linesA.find(l=>l.role===r); if(!line)return; const tr=el('tr'); const mv=(g.mvp.side==='a'&&g.mvp.name===line.name); tr.innerHTML='<td>'+(mv?'<span class="mvp">★ </span>':'')+ROLE_LABEL[r]+' · '+esc(line.name)+'</td><td>'+line.kills+'</td><td>'+line.deaths+'</td><td>'+line.assists+'</td><td>'+Math.round(line.dmgShare*100)+'</td><td style="color:'+ratingColor(line.rating)+'">'+line.rating.toFixed(1)+'</td>'; tb.appendChild(tr); });
    sl.appendChild(tb); const sc=el('div','card'); sc.style.cssText='padding:10px 14px;margin-top:12px'; sc.innerHTML='<div class="section-label">Your box score</div>'; sc.appendChild(sl); left.appendChild(sc);
  }
  live.appendChild(left);
  const cc=el('div','crowd-card'); cc.appendChild(crowdBlock()); cc.insertAdjacentHTML('beforeend','<div class="mono" style="border-top:1px solid var(--line-soft);margin-top:8px;padding-top:6px;font-size:9px;color:var(--faint)">'+(8000+Math.round(G.reputation*140)).toLocaleString()+' watching · slow mode off</div>');
  live.appendChild(cc);
  main.appendChild(live);
}
function seriesSummaryCard(mt){
  const st2=el('div','card'); st2.style.padding='16px';
  let pips=''; mt.series.games.forEach((gm,i)=>{ const w=gm.winner==='a'; pips+='<div class="gpip '+(w?'win':'loss')+'">Game '+(i+1)+'<div style="font-family:Barlow Condensed;font-weight:700;font-size:18px">'+(w?'W':'L')+'</div><div class="mono" style="font-size:10px">'+gm.killsA+'–'+gm.killsB+' · '+gm.lengthMin+'m</div></div>'; });
  const last=mt.series.games[mt.series.games.length-1];
  st2.innerHTML='<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;flex-wrap:wrap;gap:8px"><div class="section-label" style="margin:0">Last series · vs '+esc(mt.opp.name)+'</div>'+
    '<div class="cond" style="font-weight:700;font-size:22px;color:'+(mt.won?'var(--gel)':'var(--toxic)')+'">'+(mt.won?'VICTORY':'DEFEAT')+' '+mt.series.scoreA+'–'+mt.series.scoreB+'</div></div><div class="games">'+pips+'</div>'+
    '<div class="mono" style="font-size:11px;color:var(--muted);margin-top:8px">Deciding game MVP: <span class="mvp">'+esc(last.mvp.name)+'</span> · drafts: '+mt.series.games.map(g=>(g.verdict.you.score-g.verdict.them.score>=0?'+':'')+(g.verdict.you.score-g.verdict.them.score).toFixed(1)).join(' / ')+'</div>';
  return st2;
}
function renderSeries(main){
  const m=G.match; const mt=G.ui.match;
  const head=el('div','screen-head');
  head.innerHTML='<p class="eyebrow">'+stage().name+'</p><h1 class="title cond">Series '+(mt.won?'won':'lost')+'</h1><p class="sub">'+(mt.won?'The crowd goes home happy. Chemistry keeps building; the next opponent is already scouting you.':'It happens. Chemistry still gelled this week — and you learned what the draft cost you.')+'</p>';
  main.appendChild(head);
  main.appendChild(seriesSummaryCard(mt));
  const row=el('div'); row.style.cssText='display:flex;gap:10px;margin-top:14px;flex-wrap:wrap';
  const b=el('button','btn primary'); b.textContent='Continue ▸'; b.onclick=endSeriesView; row.appendChild(b); main.appendChild(row);
  const cc=el('div','card'); cc.style.cssText='padding:12px 14px;margin-top:14px;max-width:520px'; cc.appendChild(crowdBlock()); main.appendChild(cc);
}
