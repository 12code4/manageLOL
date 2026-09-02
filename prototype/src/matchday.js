/* ============================================================= match day: draft · live · comms · crowd =============================================================
   Injected into template.html at build. Uses the game layer's globals (G, S, el, $, render, toast, pushLog, …). */

const AUTO = () => G.ui.autoDraft !== false;           // auto-draft toggle (default ON)
const PACE = () => G.ui.pace || 'normal';              // 'normal' 2s/step · 'fast' 0.5s · 'skip'
const dly = (ms) => (G.ui.turbo ? Math.min(ms, 40) : ms);

function yourTeam(){ const lu=lineup(); const coh=(G.chem&&rosterCount()===5)?S.cohesion(G.chem,lu).cohesion:50; return {name:'Your Org', lineup:lu, chem:G.chem, coachQuality:G.coachQuality, patchFamiliarity:G.patchFamiliarity, cohesion:coh}; }
function oppTeam(opp){ const coh=opp.chem?S.cohesion(opp.chem,opp.lineup).cohesion:50; return Object.assign({coachQuality:55, patchFamiliarity:65, cohesion:coh}, opp); }
function ensurePools(){ ROLE_ORDER.forEach(r=>{const p=G.roster[r]; if(p&&(!p.championPool||!Object.keys(p.championPool).length))S.seedPool(p,new S.Rng(G.seed,'pool:'+p.id));}); }
function ensureOppPools(opp){ ROLE_ORDER.forEach(r=>{const p=opp.lineup[r]; if(!p.championPool||!Object.keys(p.championPool).length)S.seedPool(p,new S.Rng(G.seed,'opp-pool:'+opp.name+':'+r));}); }
function otherSide(side){ return side==='blue'?'red':'blue'; }
function sideTeam(side){ const m=G.match; return side===m.yourSide? yourTeam(): oppTeam(m.opp); }
function sideName(side){ return side===G.match.yourSide?'Your Org':G.match.opp.name; }
function clearTimers(){ const m=G.match; if(!m)return; clearTimeout(m.actT); clearInterval(m.timerI); clearTimeout(m.liveT); (m.beatT||[]).forEach(clearTimeout); m.beatT=[]; }

/* -------- series lifecycle -------- */
function startSeries(){
  if(rosterCount()<5){toast('You need all five roles filled to compete.','bad');return;}
  ensurePools();
  const opp=G.matchOpp||(G.matchOpp=makeOpponent()); ensureOppPools(opp);
  G.match={opp:opp, gameIndex:0, games:[], phase:'draft', crowd:[], comms:[], hype:30, timer:30, beatT:[],
    chatRng:new S.Rng(G.seed,'chat:'+G.week+':'+G.stageWins), commsRng:new S.Rng(G.seed,'comms:'+G.week+':'+G.stageWins)};
  beginDraft();
}
function beginDraft(){
  const m=G.match; clearTimers();
  m.yourSide = m.gameIndex%2===0?'blue':'red';
  m.draft=S.newDraft(); m.verdict=null; m.phase='draft'; m.lastWarning=null; m.hype=30; m.deliberating=null;
  m.draftRng=new S.Rng(G.seed,'draft:'+G.week+':'+G.stageWins+':'+m.gameIndex);
  crowdPush('ambient',{team:'Your Org',opp:m.opp.name},2);
  commsPush({who:'Coach',text:'Game '+(m.gameIndex+1)+'. We are '+m.yourSide+' side'+(m.yourSide==='blue'?' — we get first pick.':' — we get the counter-pick window.'),mood:'Ok'});
  render(); scheduleAction();
}
function stepKey(){ const m=G.match; return m?m.gameIndex+':'+m.draft.step:''; }
function scheduleAction(){
  const m=G.match; if(!m||m.phase!=='draft')return;
  const step=S.currentStep(m.draft); if(!step){finishDraft();return;}
  const ours=step.side===m.yourSide;
  clearTimeout(m.actT); clearInterval(m.timerI); (m.beatT||[]).forEach(clearTimeout); m.beatT=[];
  if(ours&&!AUTO()){ m.deliberating=null; startTimer(); return; }
  const total=dly(m.draftRng.range(3000,6000)); const key=stepKey();
  m.deliberating={side:step.side, until:Date.now()+total, total:total};
  const alive=()=>G.match&&G.match.phase==='draft'&&stepKey()===key;
  if(ours){
    const you=yourTeam(), them=oppTeam(m.opp);
    const sugg=S.coachSuggestions(m.draft,m.yourSide,you,them,G.patch,2);
    const champ=sugg[0]?S.CHAMP_BY_ID[sugg[0].champId].name:'…', alt=sugg[1]?S.CHAMP_BY_ID[sugg[1].champId].name:'the other one';
    const rolePlayer=(step.type==='pick'&&sugg[0]&&sugg[0].role)?you.lineup[sugg[0].role].name:undefined;
    const enemy=enemyComfortName(sugg[0],them);
    const lines=S.commsDraft(step.type==='ban'?'ban':'pick',{lineup:you.lineup,cohesion:you.cohesion,champ:champ,alt:alt,need:needOf(),rolePlayer:rolePlayer,enemy:enemy},m.commsRng);
    m.beatT.push(setTimeout(()=>{ if(alive()){ commsPush(lines[0]); renderPanels(); } },total*0.25));
    m.beatT.push(setTimeout(()=>{ if(alive()&&lines[1]){ commsPush(lines[1]); renderPanels(); } },total*0.6));
  } else {
    m.beatT.push(setTimeout(()=>{ if(!alive())return; const sug=S.coachSuggestions(m.draft,step.side,oppTeam(m.opp),yourTeam(),G.patch,2);
      const pred=sug[0]?S.CHAMP_BY_ID[sug[0].champId].name:'a comfort pick', alt=sug[1]?S.CHAMP_BY_ID[sug[1].champId].name:'our plan B';
      const you=yourTeam(); const lines=S.commsDraft('wait',{lineup:you.lineup,cohesion:you.cohesion,pred:pred,alt:alt},m.commsRng);
      commsPush(lines[0]); if(m.commsRng.chance(0.45))crowdPush('ambient',{team:'Your Org',opp:m.opp.name},1); renderPanels(); },total*0.45));
  }
  m.actT=setTimeout(()=>{ if(!alive())return; const st=S.currentStep(G.match.draft); if(!st)return;
    const id=S.aiChoose(G.match.draft,st.side,sideTeam(st.side),sideTeam(otherSide(st.side)),G.patch,G.match.draftRng); doDraftAction(id); },total);
}
function needOf(){
  const m=G.match; const picks=m.draft.picks[m.yourSide].map(p=>S.CHAMP_BY_ID[p.champId]);
  const has=(t)=>picks.some(c=>c.comboTags.indexOf(t)>=0||(c.styleTags[t]||0)>=0.5);
  if(!has('tankEngage')&&!has('frontToBack'))return 'a frontline';
  if(!has('scalingCarry')&&!picks.some(c=>c.curve.late>=0.4))return 'damage that scales';
  if(!picks.some(c=>c.roles[0]==='support'))return 'a support who can peel';
  return 'engage';
}
function enemyComfortName(sug,them){ if(sug&&sug.reason){ const mt=/denies (.+?)'s comfort/.exec(sug.reason); if(mt)return mt[1]; } return them.lineup.mid.name; }
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
  clearInterval(m.timerI); clearTimeout(m.actT); (m.beatT||[]).forEach(clearTimeout); m.beatT=[]; m.deliberating=null;
  const team=sideTeam(st.side), c=S.CHAMP_BY_ID[champId], ours=st.side===m.yourSide;
  m.draft=S.applyAction(s,champId,team);
  const tn=sideName(st.side), on=sideName(otherSide(st.side));
  if(st.type==='ban'){ crowdPush('ban',{champ:c.name,team:tn,opp:on},1); m.hype=Math.min(100,m.hype+4);
    if(ours){ const l=S.commsDraft('lock',{lineup:team.lineup,cohesion:team.cohesion,rolePlayer:team.lineup[ROLE_ORDER[m.commsRng.int(0,4)]].name,champ:c.name},m.commsRng); commsPush(Object.assign(l[0],{text:'ban '+c.name+' — '+l[0].text})); } }
  else {
    const pk=m.draft.picks[st.side][m.draft.picks[st.side].length-1]; const pl=team.lineup[pk.role];
    crowdPush('pick',{champ:c.name,champObj:c,team:tn,opp:on,player:pl.name},1);
    const pf=S.prof(pl,champId);
    if(pf<45||pk.offRole){ crowdPush('pilotWarning',{champ:c.name,player:pl.name,team:tn},1); if(ours)m.lastWarning=(pk.offRole?'OFF-ROLE — ':'PILOT — ')+c.name+' → '+pl.name+': '+pf+' proficiency'+(pk.offRole?' (playing out of position)':''); }
    if(ours){ const l=S.commsDraft('lock',{lineup:team.lineup,cohesion:team.cohesion,rolePlayer:pl.name,champ:c.name},m.commsRng); l.forEach(commsPush); }
    m.hype=Math.min(100,m.hype+7);
  }
  render();
  if(S.isComplete(m.draft))finishDraft(); else scheduleAction();
}
function toggleAuto(){ G.ui.autoDraft=!AUTO(); toast(AUTO()?'Auto-draft ON — your team drafts itself.':'Auto-draft OFF — you make every pick and ban.'); const m=G.match; if(m&&m.phase==='draft'){ clearTimers(); render(); scheduleAction(); } else render(); }
function delegateDraft(){
  const m=G.match; if(!m||m.phase!=='draft')return; clearTimers();
  while(!S.isComplete(m.draft)){ const st=S.currentStep(m.draft); const id=S.aiChoose(m.draft,st.side,sideTeam(st.side),sideTeam(otherSide(st.side)),G.patch,m.draftRng); m.draft=S.applyAction(m.draft,id,sideTeam(st.side)); }
  commsPush({who:'Coach',text:'Fine, I will finish this one. Keep up.',mood:'Ok'}); pushLog('You let the coach finish the game '+(m.gameIndex+1)+' draft.','info');
  finishDraft();
}
function finishDraft(){
  const m=G.match; clearTimers(); m.deliberating=null;
  const you=S.evaluateSide(m.draft,m.yourSide,yourTeam(),G.patch);
  const them=S.evaluateSide(m.draft,otherSide(m.yourSide),oppTeam(m.opp),G.patch);
  m.verdict={you:you,them:them}; m.phase='verdict'; m.hype=Math.min(100,m.hype+10);
  crowdPush('compLock',{label:you.label,team:'Your Org',opp:m.opp.name,player:G.roster.mid?G.roster.mid.name:'mid'},2);
  const edge=you.score-them.score;
  commsPush({who:'Coach',text:edge>0.5?'Good draft. We play '+you.label+' — execute it.':edge<-0.5?'They out-drafted us. We win this on execution, not on paper.':'Even draft. Play clean.',mood:S.moodOf(yourTeam().cohesion)});
  render();
}
function playGame(){
  const m=G.match; if(!m||m.phase!=='verdict')return;
  const you=yourTeam(); you.draftScore=m.verdict.you.score;
  const opp=oppTeam(m.opp); opp.draftScore=m.verdict.them.score;
  const g=S.simulateGame(you,opp,new S.Rng(G.seed,'game:'+G.week+':'+G.stageWins+':'+m.gameIndex));
  g.verdict=m.verdict; g.yourSide=m.yourSide;
  g.ticks=S.generateTicks(g,'Your Org',m.opp.name,new S.Rng(G.seed,'ticks:'+G.week+':'+G.stageWins+':'+m.gameIndex));
  m.games.push(g); m.phase='live'; m.tickIdx=0; m.hype=40;
  commsPush({who:'Coach',text:'Loading in. Comms clean, play the plan.',mood:'Ok'});
  render(); scheduleTick();
}
function scheduleTick(){
  const m=G.match; if(!m||m.phase!=='live')return; clearTimeout(m.liveT);
  if(PACE()==='skip'){ while(G.match&&G.match.phase==='live')applyTick(true); return; }
  m.liveT=setTimeout(()=>{ if(!G.match||G.match.phase!=='live')return; applyTick(false); if(G.match&&G.match.phase==='live')scheduleTick(); },dly(PACE()==='fast'?500:2000));
}
function applyTick(quiet){
  const m=G.match; const g=m.games[m.games.length-1]; const tk=g.ticks[m.tickIdx]; if(!tk){ finishLive(); return; }
  m.tickIdx++;
  const you=yourTeam(); const won=g.winner==='a';
  tk.events.forEach(ev=>{
    const ours=ev.side==='a'; const notable=ev.type!=='kill'&&ev.type!=='bastion';
    if(!quiet||notable){
      if(notable||m.commsRng.chance(0.5)) S.commsGame(ev,{lineup:you.lineup,cohesion:you.cohesion,ours:ours},m.commsRng).forEach(commsPush);
      const tn=ours?'Your Org':m.opp.name, on=ours?m.opp.name:'Your Org';
      if(ev.type==='firstBlood')crowdPush('firstBlood',{team:tn,player:ev.player,opp:on},2);
      else if(ev.type==='warden'||ev.type==='shade')crowdPush('objective',{team:tn,opp:on},1);
      else if(ev.type==='colossus')crowdPush('objective',{team:tn,opp:on},2);
      else if(ev.type==='fight')crowdPush(ours?'comeback':'throw',{team:tn,opp:on},1);
      else if(ev.type==='end')crowdPush('result',{won:won,team:'Your Org',opp:m.opp.name,player:g.mvp.name},3);
      else if(ev.type==='kill'&&m.chatRng.chance(0.3))crowdPush('ambient',{team:tn},1);
    }
    m.hype=Math.min(100,m.hype+(ev.type==='colossus'||ev.type==='fight'?14:ev.type==='kill'?5:ev.type==='end'?20:3));
  });
  if(!tk.events.length){ m.hype=Math.max(20,m.hype-3); if(!quiet&&m.commsRng.chance(0.16))S.commsGame(null,{lineup:you.lineup,cohesion:you.cohesion,ours:true},m.commsRng).forEach(commsPush); if(!quiet&&m.chatRng.chance(0.12))crowdPush(tk.t>1200?'stall':'ambient',{team:'Your Org',opp:m.opp.name},1); }
  if(m.tickIdx>=g.ticks.length){ finishLive(); return; }
  if(!quiet)render();
}
function finishLive(){ const m=G.match; if(!m)return; m.phase='postgame'; clearTimeout(m.liveT); render(); }
function setPace(p){ G.ui.pace=p; const m=G.match; if(m&&m.phase==='live'){ scheduleTick(); } render(); }
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
function crowdPush(trigger,payload,count){ const m=G.match; if(!m)return; const msgs=S.crowdReact(trigger,payload,m.chatRng,count); m.crowd=m.crowd.concat(msgs).slice(-40); }
function commsPush(line){ const m=G.match; if(!m||!line)return; m.comms=m.comms.concat([line]).slice(-40); }

/* -------- rendering -------- */
function renderCompete(main){
  const m=G.match;
  if(!m) return renderPrep(main);
  if(m.phase==='draft'||m.phase==='verdict') return renderDraft(main);
  if(m.phase==='live'||m.phase==='postgame') return renderLive(main);
  if(m.phase==='series') return renderSeries(main);
}
function autoToggleBtn(){ const b=el('button','btn'+(AUTO()?' primary':'')); b.style.cssText='font-size:12px;padding:6px 12px'; b.innerHTML=AUTO()?'Auto-draft: ON':'Auto-draft: OFF (manual)'; b.title='When ON, your team drafts for itself — quality comes from your coach, team cohesion, and your players\' game sense. When OFF, you make every pick and ban.'; b.onclick=toggleAuto; return b; }
function paceSeg(){ const seg=el('div','seg'); [['normal','2s / step'],['fast','fast'],['skip','skip ⏭']].forEach(([k,lab])=>{ const b=el('button',PACE()===k?'on':''); b.textContent=lab; b.onclick=()=>setPace(k); seg.appendChild(b); }); return seg; }
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
  vs.innerHTML='<div class="card teamcard you"><div class="role-tag" style="color:var(--gold)">You</div><div class="tn">'+you.name+'</div><div class="ts">'+byou.strength.toFixed(1)+'<small>TEAM STRENGTH · PRE-DRAFT</small></div><div class="mono" style="color:var(--muted);font-size:11px;margin-top:6px">base '+byou.base.toFixed(1)+' × mesh '+byou.meshMult.toFixed(3)+' · draft skill '+Math.round(S.draftSkill(you))+'</div></div>'+
    '<div class="mid">VS</div>'+
    '<div class="card teamcard"><div class="role-tag">'+st.name+'</div><div class="tn">'+opp.name+'</div><div class="ts">'+bopp.strength.toFixed(1)+'<small>TEAM STRENGTH · PRE-DRAFT</small></div><div class="mono" style="color:var(--muted);font-size:11px;margin-top:6px">base '+bopp.base.toFixed(1)+' × mesh '+bopp.meshMult.toFixed(3)+' · draft skill '+Math.round(S.draftSkill(oppTeam(opp)))+'</div></div>';
  main.appendChild(vs);
  const wp=el('div','wpbar'); wp.innerHTML='<div class="you" style="width:'+(pA*100)+'%">'+Math.round(pA*100)+'% '+you.name+'</div><div class="opp" style="width:'+((1-pA)*100)+'%">'+opp.name+' '+Math.round((1-pA)*100)+'%</div>'; main.appendChild(wp);
  const info=el('div','role-tag'); info.style.cssText='margin:-6px 0 14px;color:var(--muted)'; info.innerHTML='Patch '+(G.patch.index+1)+' · patch familiarity <b style="color:var(--ink)">'+G.patchFamiliarity+'%</b> · head coach: <b style="color:var(--ink)">interim (your cousin, rating '+G.coachQuality+')</b> · team cohesion <b style="color:var(--ink)">'+Math.round(you.cohesion)+'</b>. Draft skill blends coach, cohesion and your players\' game sense — it shrinks the randomness in your picks.'; main.appendChild(info);
  const controls=el('div'); controls.style.cssText='display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap;align-items:center';
  const play=el('button','btn primary'); play.textContent='Start Bo3 series — game 1 draft'; play.onclick=startSeries;
  const wk=el('button','btn'); wk.textContent='Advance a week (scrim & gel)'; wk.onclick=advanceWeek;
  controls.appendChild(play); controls.appendChild(wk); controls.appendChild(autoToggleBtn());
  const pl=el('span','role-tag'); pl.textContent='match pace'; controls.appendChild(pl); controls.appendChild(paceSeg());
  main.appendChild(controls);
  if(G.ui.match) main.appendChild(seriesSummaryCard(G.ui.match));
  const logc=el('div','card'); logc.style.cssText='padding:14px 16px;margin-top:18px'; logc.innerHTML='<div class="section-label">Inbox</div>'; logc.appendChild(logList()); main.appendChild(logc);
}

function tierChip(c){ const s=S.champStrength(c,G.patch); const t=S.tierOf(s); const o=G.patch.outliers[c.id]||0; return '<span class="tierchip tier-'+t+'">'+t+(o>0?' ↑':o<0?' ↓':'')+'</span>'; }
function curveBars(c){ const v=[c.curve.early,c.curve.mid,c.curve.late]; const mx=Math.max.apply(null,v); return '<div class="curve">'+v.map(x=>'<i class="'+(x===mx?'hi':'')+'" style="height:'+Math.max(2,Math.round(x*24))+'px"></i>').join('')+'</div>'; }

function renderDraft(main){
  const m=G.match, s=m.draft, step=S.currentStep(s);
  const ours=!!step&&step.side===m.yourSide, manual=ours&&!AUTO();
  const you=yourTeam(), them=oppTeam(m.opp);
  const head=el('div','screen-head');
  head.innerHTML='<p class="eyebrow">'+stage().name+' · vs '+m.opp.name+'</p><h1 class="title cond">Draft — Game '+(m.gameIndex+1)+'</h1><p class="sub">Blue buys first pick; Red buys the counter-pick window. '+(AUTO()?'Your team is drafting for itself — listen to the comms.':'You are on the clock for every pick and ban.')+'</p>';
  main.appendChild(head);

  const board=el('div','draft');
  const phaseIdx=s.step<6?0:s.step<12?1:s.step<16?2:3;
  const dh=el('div','dhead');
  let status;
  if(!step) status='<span class="pill gold">DRAFT COMPLETE</span>';
  else if(manual) status='<span class="pill gold">YOUR '+step.type.toUpperCase()+' · '+m.yourSide.toUpperCase()+' SIDE</span>';
  else if(ours) status='<span class="delib">YOUR TEAM DELIBERATING</span>';
  else status='<span class="delib" style="color:var(--info)">'+m.opp.name.toUpperCase()+' '+(step.type==='ban'?'BANNING':'PICKING')+'</span>';
  dh.innerHTML='<div class="cond" style="font-weight:700;font-size:20px">DRAFT <span style="color:var(--faint)">· GAME '+(m.gameIndex+1)+' OF 3</span></div>'+
    '<div class="phase-chips">'+['BAN 1','PICK 1','BAN 2','PICK 2'].map((p,i)=>'<span class="pchip '+(i===phaseIdx&&step?'on':'')+'">'+p+'</span>').join('')+'</div>'+
    '<div style="margin-left:auto;display:flex;align-items:center;gap:12px">'+(manual?'<span class="dtimer" id="draftTimer">0:'+String(m.timer).padStart(2,'0')+'</span>':'')+status+'</div>';
  const tog=autoToggleBtn(); tog.style.marginLeft='6px'; dh.appendChild(tog);
  board.appendChild(dh);

  const left=sideColumn(m.yourSide,you,'you',step);
  left.appendChild(commsBlock());
  board.appendChild(left);
  board.appendChild(centerColumn(step,ours,manual,you,them));
  const right=sideColumn(otherSide(m.yourSide),them,'them',step);
  right.appendChild(crowdBlock());
  board.appendChild(right);

  const foot=el('div','dfoot');
  const top=Object.entries(G.patch.archDelta).sort((a,b)=>b[1]-a[1])[0];
  foot.innerHTML=(m.lastWarning?'<span style="color:var(--warn)">'+m.lastWarning+'</span><span style="color:var(--faint)">·</span>':'')+
    '<span>META — '+ARCH_LABEL[top[0]]+' '+(top[1]>=0?'+':'')+top[1].toFixed(0)+' this patch · familiarity '+G.patchFamiliarity+'%</span>'+
    '<span style="color:var(--faint)">·</span><span>Draft skill '+Math.round(S.draftSkill(you))+' (coach '+G.coachQuality+' · cohesion '+Math.round(you.cohesion)+') vs '+Math.round(S.draftSkill(them))+'</span>';
  board.appendChild(foot);
  main.appendChild(board);
  if(m.phase==='verdict') main.appendChild(verdictPanel());
}
function sideColumn(side,team,cls,step){
  const m=G.match, s=m.draft; const col=el('div','dcol '+cls);
  const isYou=cls==='you'; const label=isYou?'YOUR SIDE · '+side.toUpperCase():m.opp.name.toUpperCase()+' · '+side.toUpperCase();
  col.innerHTML='<div class="role-tag" style="color:'+(isYou?'var(--gold)':'var(--info)')+';letter-spacing:.14em">'+label+'</div>';
  const bans=s.bans[side]; const banRow=el('div'); banRow.innerHTML='<div class="role-tag" style="margin-bottom:5px;font-size:9px">BANS</div>';
  const br=el('div','bans-row');
  for(let i=0;i<5;i++){ const b=bans[i]; const d=el('div','slot'+(b?' filled ban':'')); d.textContent=b?S.CHAMP_BY_ID[b].name:''; if(!b&&step&&step.type==='ban'&&step.side===side&&i===bans.length){d.className='slot now';d.textContent='…';} br.appendChild(d); }
  banRow.appendChild(br); col.appendChild(banRow);
  const picks=s.picks[side]; const pr=el('div'); pr.innerHTML='<div class="role-tag" style="margin-bottom:5px;font-size:9px">PICKS</div>';
  const list=el('div'); list.style.cssText='display:flex;flex-direction:column;gap:5px';
  for(let i=0;i<5;i++){
    const p=picks[i]; const d=el('div','slot'+(p?' filled':''));
    if(p){ const c=S.CHAMP_BY_ID[p.champId]; const pl=team.lineup[p.role]; const pf=S.prof(pl,p.champId);
      d.innerHTML='<span>'+c.name+'</span><span class="rt">'+p.role.toUpperCase()+(p.offRole?' ⟲':'')+'</span>'+(isYou?'<span class="pf" style="color:'+(pf>=65?'var(--gel)':pf>=45?'var(--ink)':'var(--toxic)')+'">'+pf+'p</span>':'<span class="pf" style="color:var(--faint)">'+pl.name+'</span>'); }
    else if(step&&step.type==='pick'&&step.side===side&&i===picks.length){ d.className='slot now'; d.textContent=(side===m.yourSide?'PICKING…':'THINKING…'); }
    list.appendChild(d);
  }
  pr.appendChild(list); col.appendChild(pr);
  const wc=S.winCondition(picks); const clarity=picks.length?Math.round(Math.min(1,Math.max(wc.curve.early,wc.curve.late)/0.5)*100*(picks.length/5)):0;
  const cr=el('div','compread'); cr.style.marginTop='0';
  cr.innerHTML='<div class="role-tag" style="font-size:9px">COMP READ</div><div class="lbl '+(isYou?'':'them')+'">'+(picks.length?wc.label.toUpperCase():'—')+'</div><div class="clarity"><i class="'+(isYou?'':'them')+'" style="width:'+clarity+'%"></i></div>'+
    (isYou&&picks.length>=2?'<div style="font-size:11px;color:var(--muted);margin-top:6px">'+comboHint(side,team)+'</div>':'');
  col.appendChild(cr);
  return col;
}
function comboHint(side,team){
  const ev=S.evaluateSide(G.match.draft,side,team,G.patch);
  if(!ev.combos.length) return 'No combo online yet — two picks sharing a plan light one up.';
  const c=ev.combos.sort((a,b)=>b.payoff-a.payoff)[0];
  return cap(c.tag.replace(/([A-Z])/g,' $1').toLowerCase())+' payoff at <b style="color:var(--ink)">'+Math.round(c.chemGate*100)+'%</b> chemistry gate'+(c.chemGate<0.8?' — anchor pair still gelling':'');
}
function centerColumn(step,ours,manual,you,them){
  const m=G.match, s=m.draft; const col=el('div','dcenter');
  const taken=S.takenIds(s);
  const bar=el('div','toolbar'); bar.style.marginBottom='0';
  const roleSel=el('select'); roleSel.innerHTML='<option value="">All roles</option>'+ROLE_ORDER.map(r=>'<option value="'+r+'">'+ROLE_LABEL[r]+'</option>').join(''); roleSel.value=G.ui.draftRole||''; roleSel.onchange=()=>{G.ui.draftRole=roleSel.value;render();};
  const lbl=el('span','section-label'); lbl.style.margin='0';
  lbl.textContent=manual?(step.type==='ban'?'Choose a champion to ban':'Choose your pick'):ours?'Your team is weighing options…':(step?'Waiting on '+m.opp.name+'…':'Draft locked');
  const sp=el('span'); sp.style.flex='1'; bar.appendChild(lbl); bar.appendChild(sp); bar.appendChild(roleSel); col.appendChild(bar);

  let scored=null, topIds={};
  if(ours&&step){ scored=S.scoreActions(s,m.yourSide,you,them,G.patch); scored.slice(0,3).forEach(a=>topIds[a.champId]=1); }
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
    if(ours&&step&&step.type==='pick'&&!isTaken&&open){ const a=S.assignRole(c,open); if(a){ const pl=you.lineup[a.role]; const pf=S.prof(pl,c.id); pilot='<div class="pilot '+(a.offRole?'off':pf<45?'warn':'')+'">'+ROLE_LABEL[a.role]+' · '+pl.name+' · '+pf+'p'+(a.offRole?' ⟲ off-role':'')+'</div>'; } }
    else pilot='<div class="pilot dim">'+c.roles.map(r=>ROLE_LABEL[r]).join(' / ')+'</div>';
    card.innerHTML='<div class="cn"><span>'+c.name+'</span>'+tierChip(c)+'</div><div class="ep">'+c.epithet+'</div>'+curveBars(c)+pilot;
    card.title=c.flavor;
    if(manual&&!isTaken) card.onclick=()=>doDraftAction(c.id); else card.disabled=true;
    grid.appendChild(card);
  });
  col.appendChild(grid);

  if(ours&&scored){
    const box=el('div','coachbox'); box.innerHTML='<div class="role-tag" style="font-size:9px;margin-bottom:4px">'+(manual?'COACH SUGGESTS — click to lock':'COACH\'S BOARD — what the room is weighing')+'</div>';
    scored.slice(0,3).forEach((a,i)=>{ const c=S.CHAMP_BY_ID[a.champId]; const row=el('div','row'); row.innerHTML='<span class="mono" style="color:'+(i===0?'var(--gold)':'var(--muted)')+'">'+(i+1)+'.</span><span><b>'+c.name+'</b> — '+a.reason+'</span><span class="v">'+(a.value>=0?'+':'')+a.value.toFixed(1)+'</span>'; if(manual)row.onclick=()=>doDraftAction(a.champId); else row.style.cursor='default'; box.appendChild(row); });
    col.appendChild(box);
  }
  const actions=el('div'); actions.style.cssText='display:flex;gap:10px;margin-top:auto;justify-content:center;flex-wrap:wrap';
  if(step){ const del=el('button','btn'); del.textContent='Let the coach finish this draft (instant)'; del.onclick=delegateDraft; actions.appendChild(del); }
  col.appendChild(actions);
  return col;
}
function speakerColor(who){ if(who==='Coach')return 'var(--gold)'; const r=ROLE_ORDER.find(role=>G.roster[role]&&G.roster[role].name===who); return ({top:'#d9a066',jungle:'#78c9a0',mid:'#65a1e6',bot:'#e0665a',support:'#c98bd6'})[r]||'var(--muted)'; }
function commsBlock(){
  const m=G.match; const wrap=el('div','crowd comms'); wrap.style.marginTop='10px';
  wrap.innerHTML='<div class="ch"><span class="role-tag" style="font-size:9px;letter-spacing:.14em;color:var(--gold)">TEAM COMMS</span><span style="margin-left:auto" class="role-tag" style="font-size:8.5px">'+S.moodOf(yourTeam().cohesion).toUpperCase()+'</span></div>';
  const list=el('div','list'); list.id='commsList';
  m.comms.slice(-10).forEach((c,i,arr)=>{ const d=el('div','m '+c.mood); d.style.animationDelay=(i>=arr.length-2?((i-(arr.length-2))*0.1):0)+'s'; d.innerHTML='<span class="u" style="color:'+speakerColor(c.who)+'">'+esc(c.who)+'</span> <span class="t">'+esc(c.text)+'</span>'; list.appendChild(d); });
  if(!m.comms.length) list.innerHTML='<div class="empty-note" style="padding:10px">…</div>';
  wrap.appendChild(list); return wrap;
}
function crowdBlock(){
  const m=G.match; const wrap=el('div','crowd'); wrap.style.marginTop='10px';
  wrap.innerHTML='<div class="ch"><span class="role-tag" style="font-size:9px;letter-spacing:.14em">THE CROWD</span><span style="margin-left:auto"></span><span class="hype"><i style="width:'+m.hype+'%"></i></span><span class="role-tag" style="font-size:8.5px">HYPE</span></div>';
  const list=el('div','list'); list.id='crowdList';
  m.crowd.slice(-14).forEach((msg,i,arr)=>{ const d=el('div','m'); d.style.animationDelay=(i>=arr.length-3?((i-(arr.length-3))*0.12):0)+'s'; d.innerHTML='<span class="u" style="color:'+userColor(msg.user)+'">'+esc(msg.user)+':</span> <span class="t">'+esc(msg.text)+'</span>'; list.appendChild(d); });
  if(!m.crowd.length) list.innerHTML='<div class="empty-note" style="padding:10px">chat is quiet…</div>';
  wrap.appendChild(list); return wrap;
}
function renderPanels(){ // light refresh of the two feeds during deliberation
  const cl=$('#commsList'), cr=$('#crowdList'); if(!cl&&!cr){render();return;}
  const m=G.match; if(!m)return;
  if(cl){ cl.innerHTML=''; m.comms.slice(-10).forEach((c,i,arr)=>{ const d=el('div','m '+c.mood); if(i<arr.length-1)d.style.animation='none',d.style.opacity='1'; d.innerHTML='<span class="u" style="color:'+speakerColor(c.who)+'">'+esc(c.who)+'</span> <span class="t">'+esc(c.text)+'</span>'; cl.appendChild(d); }); }
  if(cr){ cr.innerHTML=''; m.crowd.slice(-14).forEach((msg,i,arr)=>{ const d=el('div','m'); if(i<arr.length-1)d.style.animation='none',d.style.opacity='1'; d.innerHTML='<span class="u" style="color:'+userColor(msg.user)+'">'+esc(msg.user)+':</span> <span class="t">'+esc(msg.text)+'</span>'; cr.appendChild(d); }); }
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
  const row=el('div'); row.style.cssText='display:flex;gap:10px;align-items:center;margin-top:14px;flex-wrap:wrap';
  const b=el('button','btn primary'); b.textContent='Play game '+(m.gameIndex+1)+' ▸'; b.onclick=playGame; row.appendChild(b);
  const pl=el('span','role-tag'); pl.textContent='pace'; row.appendChild(pl); row.appendChild(paceSeg()); box.appendChild(row);
  return box;
}

function renderLive(main){
  const m=G.match; const g=m.games[m.games.length-1]; const won=g.winner==='a'; const done=m.phase==='postgame';
  const idx=Math.min(m.tickIdx,g.ticks.length); const cur=idx>0?g.ticks[idx-1]:null;
  const head=el('div','screen-head');
  head.innerHTML='<p class="eyebrow">'+stage().name+' · game '+(m.gameIndex+1)+' of 3</p><h1 class="title cond">Match Day — Live</h1><p class="sub">Thirty-second steps. You are the manager: watch the comms, read the map, and learn what mattered.</p>';
  main.appendChild(head);
  const live=el('div','live');
  const left=el('div');
  const kA=cur?cur.killsA:0, kB=cur?cur.killsB:0, gold=cur?cur.goldDiff:0, t=cur?cur.t:0;
  const sb=el('div','scoreb');
  sb.innerHTML='<span class="tn" style="color:var(--gold)">YOUR ORG</span><span class="sc">'+kA+' – '+kB+'</span><span class="tn" style="color:var(--muted)">'+esc(m.opp.name).toUpperCase()+'</span>'+
    '<span class="mono" style="font-size:12px;color:'+(gold>=0?'var(--gel)':'var(--toxic)')+'">gold '+(gold>=0?'+':'')+gold.toFixed(1)+'k</span>'+
    '<span class="sbobj">'+(cur?'<span>Wardens '+cur.wardens[0]+'–'+cur.wardens[1]+'</span><span>Colossus '+cur.colossus[0]+'–'+cur.colossus[1]+'</span><span>Bastions '+cur.bastions[0]+'–'+cur.bastions[1]+'</span>':'')+'</span>'+
    '<span class="mono" style="margin-left:auto;font-weight:600;font-size:20px">'+S.clockOf(t)+'</span>';
  left.appendChild(sb);
  const ctrl=el('div'); ctrl.style.cssText='display:flex;gap:10px;align-items:center;margin-bottom:12px';
  const pl=el('span','role-tag'); pl.textContent=done?'game over':'pace'; ctrl.appendChild(pl); if(!done)ctrl.appendChild(paceSeg());
  ctrl.insertAdjacentHTML('beforeend','<span class="mono" style="margin-left:auto;font-size:11px;color:var(--muted)">'+g.verdict.you.label+' vs '+g.verdict.them.label+'</span>');
  left.appendChild(ctrl);
  // win prob
  const n=g.ticks.length; const pts=g.ticks.slice(0,Math.max(1,idx)).map(tk=>tk.winProbA*100);
  const poly=pts.map((v,i)=>(((i+1)/n)*620+10).toFixed(1)+','+(110-v).toFixed(1)).join(' ');
  const wpNow=pts.length?pts[pts.length-1]:50;
  const wp=el('div','wp-card');
  wp.innerHTML='<div style="display:flex;align-items:baseline"><span class="role-tag" style="font-size:9px;letter-spacing:.14em">WIN PROBABILITY</span><span class="cond" style="margin-left:auto;font-weight:700;font-size:22px;color:'+(wpNow>=50?'var(--gel)':'var(--toxic)')+'">'+Math.round(wpNow)+'%</span></div>'+
    '<svg viewBox="0 0 640 120" width="100%" height="120" role="img" aria-label="Win probability over the game"><line x1="10" y1="60" x2="630" y2="60" stroke="var(--line)" stroke-dasharray="3 4"/>'+(pts.length>1?'<polyline points="'+poly+'" fill="none" stroke="var(--gold)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>':'')+'<circle cx="'+((Math.max(1,idx)/n)*620+10).toFixed(1)+'" cy="'+(110-wpNow).toFixed(1)+'" r="4" fill="var(--gold)"/></svg>';
  left.appendChild(wp);
  // timeline (latest events)
  const evs=[]; g.ticks.slice(0,idx).forEach(tk=>tk.events.forEach(e=>evs.push({t:tk.t,e:e})));
  const tl=el('div','tl-card'); tl.innerHTML='<div class="role-tag" style="font-size:9px;letter-spacing:.14em;margin-bottom:6px">TIMELINE</div>';
  const show=evs.slice(-10); if(evs.length>10)tl.insertAdjacentHTML('beforeend','<div class="role-tag" style="font-size:9px;color:var(--faint);margin-bottom:4px">… '+(evs.length-10)+' earlier moments</div>');
  if(!show.length) tl.insertAdjacentHTML('beforeend','<div class="tl-ev"><span class="ts">0:00</span><span>Both teams load in. Laning phase.</span></div>');
  show.forEach((x,i)=>{ const hl=x.e.type!=='kill'&&x.e.type!=='bastion'; const d=el('div','tl-ev'+(hl?' hl':'')+(x.e.side==='a'?' us':'')); if(i===show.length-1){d.style.animation='reveal .35s forwards';d.style.opacity='0';} d.innerHTML='<span class="ts">'+S.clockOf(x.t)+'</span><span>'+esc(x.e.text)+'</span>'; tl.appendChild(d); });
  left.appendChild(tl);
  if(done){
    const bn=el('div','banner');
    bn.innerHTML='<div class="big" style="color:'+(won?'var(--gel)':'var(--toxic)')+'">'+(won?'GAME '+(m.gameIndex+1)+' — VICTORY':'GAME '+(m.gameIndex+1)+' — DEFEAT')+'</div><div class="mono" style="color:var(--muted);font-size:12px">'+g.lengthMin+' min · '+g.killsA+'–'+g.killsB+' · MVP <span class="mvp">'+esc(g.mvp.name)+'</span></div>';
    const yw=m.games.filter(x=>x.winner==='a').length, ow=m.games.length-yw; const over=yw>=2||ow>=2;
    const b=el('button','btn primary'); b.style.marginLeft='auto'; b.textContent=over?'Finish series ▸':'Next game ▸'; b.onclick=nextGame; bn.appendChild(b);
    left.appendChild(bn);
    const why=el('div','card'); why.style.padding='12px 16px';
    const bd=g.breakdown; const dA=bd.a.strength-bd.b.strength; const de=g.verdict.you.score-g.verdict.them.score;
    why.innerHTML='<div class="section-label">Why it went this way</div><div class="vgrid" style="margin-top:0"><div>'+
      '<div class="k"><span>Draft</span><b style="color:'+(de>=0?'var(--gel)':'var(--toxic)')+'">'+(de>=0?'+':'')+de.toFixed(1)+'</b></div>'+
      '<div class="k"><span>Team synergy (mesh ×'+bd.a.meshMult.toFixed(3)+' vs ×'+bd.b.meshMult.toFixed(3)+')</span><b>'+((bd.a.meshMult-bd.b.meshMult)*100>=0?'+':'')+((bd.a.meshMult-bd.b.meshMult)*100).toFixed(1)+'%</b></div>'+
      '<div class="k"><span>Roster base strength</span><b>'+bd.a.base.toFixed(1)+' vs '+bd.b.base.toFixed(1)+'</b></div></div>'+
      '<div><div class="k"><span>Final strength gap</span><b style="color:'+(dA>=0?'var(--gel)':'var(--toxic)')+'">'+(dA>=0?'+':'')+dA.toFixed(1)+'</b></div><div class="k"><span>Pre-game win probability</span><b>'+Math.round(g.winProbA*100)+'%</b></div><div class="k"><span>Result</span><b>'+((won&&g.winProbA>=0.5)||(!won&&g.winProbA<0.5)?'held':'upset')+'</b></div></div></div>';
    left.appendChild(why);
    const sl=el('table','statline'); sl.innerHTML='<thead><tr><th>Your player</th><th>K</th><th>D</th><th>A</th><th>DMG%</th><th>Rating</th></tr></thead>';
    const tb=el('tbody'); ROLE_ORDER.forEach(r=>{ const line=g.linesA.find(l=>l.role===r); if(!line)return; const tr=el('tr'); const mv=(g.mvp.side==='a'&&g.mvp.name===line.name); tr.innerHTML='<td>'+(mv?'<span class="mvp">★ </span>':'')+ROLE_LABEL[r]+' · '+esc(line.name)+'</td><td>'+line.kills+'</td><td>'+line.deaths+'</td><td>'+line.assists+'</td><td>'+Math.round(line.dmgShare*100)+'</td><td style="color:'+ratingColor(line.rating)+'">'+line.rating.toFixed(1)+'</td>'; tb.appendChild(tr); });
    sl.appendChild(tb); const sc=el('div','card'); sc.style.cssText='padding:10px 14px;margin-top:12px'; sc.innerHTML='<div class="section-label">Your box score</div>'; sc.appendChild(sl); left.appendChild(sc);
  }
  live.appendChild(left);
  const rail=el('div'); rail.style.cssText='display:flex;flex-direction:column;gap:12px';
  const cm=el('div','crowd-card'); cm.style.minHeight='230px'; cm.appendChild(commsBlock()); rail.appendChild(cm);
  const cc=el('div','crowd-card'); cc.style.minHeight='320px'; cc.appendChild(crowdBlock()); cc.insertAdjacentHTML('beforeend','<div class="mono" style="border-top:1px solid var(--line-soft);margin-top:8px;padding-top:6px;font-size:9px;color:var(--faint)">'+(8000+Math.round(G.reputation*140)).toLocaleString()+' watching · slow mode off</div>'); rail.appendChild(cc);
  live.appendChild(rail);
  main.appendChild(live);
}
function seriesSummaryCard(mt){
  const st2=el('div','card'); st2.style.padding='16px';
  let pips=''; mt.series.games.forEach((gm,i)=>{ const w=gm.winner==='a'; pips+='<div class="gpip '+(w?'win':'loss')+'">Game '+(i+1)+'<div style="font-family:Barlow Condensed;font-weight:700;font-size:18px">'+(w?'W':'L')+'</div><div class="mono" style="font-size:10px">'+gm.killsA+'–'+gm.killsB+' · '+gm.lengthMin+'m</div></div>'; });
  const last=mt.series.games[mt.series.games.length-1];
  st2.innerHTML='<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:10px;flex-wrap:wrap;gap:8px"><div class="section-label" style="margin:0">Last series · vs '+esc(mt.opp.name)+'</div>'+
    '<div class="cond" style="font-weight:700;font-size:22px;color:'+(mt.won?'var(--gel)':'var(--toxic)')+'">'+(mt.won?'VICTORY':'DEFEAT')+' '+mt.series.scoreA+'–'+mt.series.scoreB+'</div></div><div class="games">'+pips+'</div>'+
    '<div class="mono" style="font-size:11px;color:var(--muted);margin-top:8px">Deciding game MVP: <span class="mvp">'+esc(last.mvp.name)+'</span> · draft edges: '+mt.series.games.map(g=>(g.verdict.you.score-g.verdict.them.score>=0?'+':'')+(g.verdict.you.score-g.verdict.them.score).toFixed(1)).join(' / ')+'</div>';
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
  const g2=el('div','grid-2'); g2.style.marginTop='14px';
  const c1=el('div','card'); c1.style.padding='12px 14px'; c1.appendChild(commsBlock()); const c2=el('div','card'); c2.style.padding='12px 14px'; c2.appendChild(crowdBlock()); g2.appendChild(c1); g2.appendChild(c2); main.appendChild(g2);
}
