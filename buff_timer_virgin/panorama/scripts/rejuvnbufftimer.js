(()=>{"use strict";
const REJUV_DUR=220,BRIDGE_DUR=300,SPAWN_TH=10,TICK_FAST=0.1,TICK_NORM=1;
const SEQ=[{d:600,n:"1"},{d:410,n:"2"},{d:350,n:"3"},{d:290,n:"3"}];
const POWERUP_TYPES=["powerup_gun","powerup_survival","powerup_casting","powerup_movement"];
const POWERUP_CHECK_TH=10,POWERUP_LINGER=1500;
const MONITOR_INTERVAL=300,CLAIM_RADIUS_SQ=64,PRETRACK_INTERVAL=1000;
const POWERUP_BUFF_DUR=180;
const DEATH_GRACE_MS=2000;
const BUTTON_CACHE_TTL=800;
const LINGER_DURATION=5;
const LINGER_CHECK_INTERVAL=300;

let hnd,running=false,inHideout=true,spawnWait=false,idx=0,counter=0,phaseStart=0,claimCnt=0;
let buffStart=0,buffCnt=0,lastSec=-1,lastGlobalSec=-1,lastGateChk=0,lastRunChk=0,lastScan=0,tick=TICK_NORM,lastFound=false;
let lastPowerupScan=0,prevBuffRem=300,buffResetTs=0;
let lastLingerCheck=0;
let trackedPowerups=[];
let monitoringActive=false;
let lastMonitorCheck=0;
let pretrackActive=false;
let lastPretrackCheck=0;
let pretrackData={left:{minAlly:Infinity,minEnemy:Infinity},right:{minAlly:Infinity,minEnemy:Infinity}};
let knownSpawnPos=null;
let _claimTimeoutLeft=null,_claimTimeoutRight=null;
let _claimStartLeft=0,_claimStartRight=0;
let _gameTimePanel=null;
let _tCache=0,_tCacheTs=0;
let _playerCache=null,_playerCacheTs=0;
let _playerState={};
let _lastRejuvText="",_lastBuffText="",_lastRejuvBuffText="",_lastRejuvNum="",_lastClaimTimerL="",_lastClaimTimerR="";
const _posResult={x:0,y:0};
const _nearResult={ally:Infinity,enemy:Infinity};
const _pwPos={x:0,y:0};
let _lingerState={};
let _enemySlots={};
let _slotUsed=[false,false,false,false,false,false];


const UI={root:null,hud:null,minimap:null,glowLeft:null,glowRight:null,rLab:null,rNum:null,rImg:null,buffLab:null,rejuvBuff:null,rejuvBuffTime:null,rejuvFriendly:null,rejuvEnemy:null,claimLeft:null,claimRight:null,claimIconLeft:null,claimIconRight:null,claimRingLeft:null,claimRingRight:null,claimTimerLeft:null,claimTimerRight:null,lingerPanels:[]};

const POWERUP_ICONS={
  powerup_gun:"s2r://panorama/images/minimap/powerup_weapon.vsvg",
  powerup_survival:"s2r://panorama/images/minimap/powerup_health.vsvg",
  powerup_casting:"s2r://panorama/images/minimap/powerup_magic.vsvg",
  powerup_movement:"s2r://panorama/images/minimap/powerup_movement.vsvg"
};

const GLOW_CLASSES=["glow-survival","glow-casting","glow-movement","glow-gun","glow-enemy"];

function boot(){
  const r=findRoot($.GetContextPanel());UI.root=r;UI.hud=r.FindChildTraverse("Hud");
  UI.rLab=r.FindChildTraverse("RejuvTime");UI.rNum=r.FindChildTraverse("RejuvNum");UI.rImg=r.FindChildTraverse("RejuvImg");
  UI.buffLab=r.FindChildTraverse("BuffTime");UI.rejuvBuff=r.FindChildTraverse("RejuvBuff");UI.rejuvBuffTime=r.FindChildTraverse("RejuvTimeBuff");
  UI.glowLeft=r.FindChildTraverse("MinimapGlowLeft");UI.glowRight=r.FindChildTraverse("MinimapGlowRight");
  UI.claimLeft=r.FindChildTraverse("MinimapBuffClaimLeft");UI.claimRight=r.FindChildTraverse("MinimapBuffClaimRight");
  UI.claimIconLeft=r.FindChildTraverse("ClaimIconLeft");UI.claimIconRight=r.FindChildTraverse("ClaimIconRight");
  UI.claimRingLeft=r.FindChildTraverse("ClaimRingLeft");UI.claimRingRight=r.FindChildTraverse("ClaimRingRight");
UI.claimTimerLeft=r.FindChildTraverse("ClaimTimerLeft");UI.claimTimerRight=r.FindChildTraverse("ClaimTimerRight");
  for(let i=0;i<6;i++){UI.lingerPanels[i]=r.FindChildTraverse("LingerOverlay"+i);}
  const tb=r.FindChildTraverse("TopBar");
  if(tb){const ch=tb.FindChildTraverse("RejuvenatorCharges");if(ch){UI.rejuvFriendly=ch.FindChildTraverse("RejuvenatorFriendly");UI.rejuvEnemy=ch.FindChildTraverse("RejuvenatorEnemy");}}
  if(!UI.rLab||!UI.rNum||!UI.rImg||!UI.buffLab)return $.Schedule(0.5,boot);
  reset(1);loop();
}

function loop(){
  const now=gTime(),rn=Date.now();
  if(!running){if(rn-lastGateChk>=30000){lastGateChk=rn;inHideout=isHideout();if(!inHideout)startRun(now);}hnd=$.Schedule(30,loop);return;}
  if(rn-lastRunChk>=60000){lastRunChk=rn;if(isHideout()){reset(1);loop();return;}}
  if(lastGlobalSec>=0&&(now+5<lastGlobalSec||(lastGlobalSec>30&&now<=2))){reset(1);loop();return;}
  lastGlobalSec=now;
  if(now!==lastSec){lastSec=now;const rem=Math.max(0,SEQ[idx].d-(now-phaseStart));if(rem<=0)showSpawn();else{counter=rem;const t=fmt(rem);if(t!==_lastRejuvText){UI.rLab.text=t;_lastRejuvText=t;}}tick=spawnWait||rem<=SPAWN_TH?TICK_FAST:TICK_NORM;}
  if(buffStart>0){buffCnt=Math.max(0,REJUV_DUR-(now-buffStart));if(UI.rejuvBuffTime){const t=fmt(buffCnt);if(t!==_lastRejuvBuffText){UI.rejuvBuffTime.text=t;_lastRejuvBuffText=t;}}if(buffCnt<=0)endBuff();}
  const buffRem=BRIDGE_DUR-(now%BRIDGE_DUR);{const t=fmt(buffRem);if(t!==_lastBuffText){UI.buffLab.text=t;_lastBuffText=t;}}
  
  if(buffRem<=POWERUP_CHECK_TH&&!pretrackActive&&!monitoringActive&&knownSpawnPos){
    pretrackActive=true;
    pretrackData.left.minAlly=pretrackData.left.minEnemy=pretrackData.right.minAlly=pretrackData.right.minEnemy=Infinity;
  }
  
  if(pretrackActive&&knownSpawnPos&&rn-lastPretrackCheck>=PRETRACK_INTERVAL){lastPretrackCheck=rn;doPretrack(rn);}
  
  if(prevBuffRem<=POWERUP_CHECK_TH&&prevBuffRem>0&&buffRem>POWERUP_CHECK_TH){
    buffResetTs=rn;
    trackedPowerups=[];
    monitoringActive=false;
  }
  prevBuffRem=buffRem;
  
  const lingerActive=buffResetTs>0&&rn-buffResetTs<POWERUP_LINGER;
  if(lingerActive&&!monitoringActive&&rn-lastPowerupScan>=200){
    lastPowerupScan=rn;
    scanPowerups();
  }
  
  if(!monitoringActive&&trackedPowerups.length===0&&buffResetTs>0&&rn-buffResetTs>=3000&&rn-buffResetTs<4000){
    scanPowerups();
  }
  
  if(monitoringActive&&rn-lastMonitorCheck>=MONITOR_INTERVAL){
    lastMonitorCheck=rn;
    monitorPowerups(rn);
  }
  
if(rn-lastScan>=3000){lastScan=rn;doScan();}
  if(rn-lastLingerCheck>=LINGER_CHECK_INTERVAL){lastLingerCheck=rn;checkEnemyLinger(rn);}
  updateClaimProgress(now);
  hnd=$.Schedule(tick,loop);
}

function doPretrack(nowMs){
  const mm=findMinimap();
  if(!mm||!knownSpawnPos)return;
  
  const nearLeft=getPlayersNearPowerup(mm,knownSpawnPos.left,nowMs);
  const nearRight=getPlayersNearPowerup(mm,knownSpawnPos.right,nowMs);
  
  if(nearLeft.ally<pretrackData.left.minAlly)pretrackData.left.minAlly=nearLeft.ally;
  if(nearLeft.enemy<pretrackData.left.minEnemy)pretrackData.left.minEnemy=nearLeft.enemy;
  if(nearRight.ally<pretrackData.right.minAlly)pretrackData.right.minAlly=nearRight.ally;
  if(nearRight.enemy<pretrackData.right.minEnemy)pretrackData.right.minEnemy=nearRight.enemy;
}

function doScan(){if(!running)return;const f=hasRejuv();if(spawnWait&&f&&!lastFound){claimCnt++;const t=gTime();startBuff(t);startPhase(claimCnt>2?3:claimCnt,t);}lastFound=f;}
function hasRejuv(){return panelHas(UI.rejuvFriendly)||panelHas(UI.rejuvEnemy);}
function panelHas(p){if(!p)return false;try{if(p.BHasClass("RejuvCount_1")||p.BHasClass("RejuvCount_2")||p.BHasClass("RejuvCount_3")||p.BHasClass("RejuvCount_4"))return true;const k=p.Children();if(k)for(let j=0;j<k.length;j++){const c=k[j];if(c.BHasClass("RejuvCount_1")||c.BHasClass("RejuvCount_2")||c.BHasClass("RejuvCount_3")||c.BHasClass("RejuvCount_4"))return true;}}catch{}return false;}

function findMinimap(){if(UI.minimap?.IsValid?.())return UI.minimap;try{UI.minimap=UI.root.FindChildTraverse("hud_minimap");}catch(e){$.Msg("[BT-P][ERR] findMinimap: "+e+"\n");}return UI.minimap;}

function clearSideGlow(side){
  const panel=side==="LEFT"?UI.glowLeft:UI.glowRight;
  if(!panel)return;
  for(let i=0;i<GLOW_CLASSES.length;i++){try{panel.RemoveClass(GLOW_CLASSES[i]);}catch{}}
}

function clearGlows(){
  clearSideGlow("LEFT");
  clearSideGlow("RIGHT");
}

function applyGlow(side,type){
  const panel=side==="LEFT"?UI.glowLeft:UI.glowRight;
  if(!panel||!type)return;
  const shortType=type.replace("powerup_","");
  const cls="glow-"+shortType;
  try{panel.AddClass(cls);}catch{}
}

function applyEnemyClaim(side){
  const panel=side==="LEFT"?UI.glowLeft:UI.glowRight;
  if(!panel)return;
  try{
    panel.AddClass("glow-enemy");
    $.Schedule(3,()=>{try{panel.RemoveClass("glow-enemy");}catch{}});
  }catch{}
}

function showClaimIndicator(side,isEnemy,powerupType){
  try{
    const isLeft=side==="LEFT";
    const claimBox=isLeft?UI.claimLeft:UI.claimRight;
    const claimIcon=isLeft?UI.claimIconLeft:UI.claimIconRight;
    const claimTimer=isLeft?UI.claimTimerLeft:UI.claimTimerRight;
    if(!claimBox?.IsValid?.()||!claimIcon?.IsValid?.())return;
    const prevTimeout=isLeft?_claimTimeoutLeft:_claimTimeoutRight;
    if(prevTimeout){try{$.CancelScheduled(prevTimeout);}catch{}}
    claimBox.RemoveClass("active");claimBox.RemoveClass("ally-claim");claimBox.RemoveClass("enemy-claim");
    const iconSrc=POWERUP_ICONS[powerupType];
    if(iconSrc){try{claimIcon.style.backgroundImage='url("'+iconSrc+'")';}catch{}}
    claimBox.SetHasClass("ally-claim",!isEnemy);
    claimBox.SetHasClass("enemy-claim",isEnemy);
    if(claimTimer?.IsValid?.()){try{claimTimer.text=fmt(POWERUP_BUFF_DUR);}catch{}}
    const claimTime=gTime();
    if(isLeft)_claimStartLeft=claimTime;else _claimStartRight=claimTime;
    $.Schedule(0.016,()=>{try{if(claimBox?.IsValid?.()){claimBox.AddClass("active");}}catch{}});
    const timeoutHandle=$.Schedule(POWERUP_BUFF_DUR,()=>{hideClaimIndicator(side);});
    if(isLeft)_claimTimeoutLeft=timeoutHandle;else _claimTimeoutRight=timeoutHandle;
  }catch(e){$.Msg("[BT-P][ERR] showClaimIndicator: "+e+"\n");}
}

function hideClaimIndicator(side){
  try{
    const claimBox=side==="LEFT"?UI.claimLeft:UI.claimRight;
    if(claimBox?.IsValid?.()){
      claimBox.RemoveClass("active");
      $.Schedule(0.4,()=>{try{if(claimBox?.IsValid?.()){claimBox.RemoveClass("ally-claim");claimBox.RemoveClass("enemy-claim");}}catch{}});
    }
  }catch{}
  if(side==="LEFT"){_claimTimeoutLeft=null;_claimStartLeft=0;}else{_claimTimeoutRight=null;_claimStartRight=0;}
}

function clearClaimIndicators(){
  if(_claimTimeoutLeft){try{$.CancelScheduled(_claimTimeoutLeft);}catch{}_claimTimeoutLeft=null;}
  if(_claimTimeoutRight){try{$.CancelScheduled(_claimTimeoutRight);}catch{}_claimTimeoutRight=null;}
  _claimStartLeft=0;_claimStartRight=0;
  try{UI.claimLeft?.RemoveClass?.("active");UI.claimLeft?.RemoveClass?.("ally-claim");UI.claimLeft?.RemoveClass?.("enemy-claim");}catch{}
  try{UI.claimRight?.RemoveClass?.("active");UI.claimRight?.RemoveClass?.("ally-claim");UI.claimRight?.RemoveClass?.("enemy-claim");}catch{}
}

function updateClaimProgress(now){
  if(_claimStartLeft>0){
    const elapsed=now-_claimStartLeft;
    const rem=Math.max(0,POWERUP_BUFF_DUR-elapsed);
    const pct=rem/POWERUP_BUFF_DUR;
    try{if(UI.claimTimerLeft?.IsValid?.()){const t=fmt(rem);if(t!==_lastClaimTimerL){UI.claimTimerLeft.text=t;_lastClaimTimerL=t;}}}catch{}
    try{if(UI.claimRingLeft?.IsValid?.()){
      const sc=0.5+pct*0.5;
      UI.claimRingLeft.style.preTransformScale2d=sc;
      UI.claimRingLeft.style.opacity=0.3+pct*0.7;
    }}catch{}
    if(rem<=0)hideClaimIndicator("LEFT");
  }
  if(_claimStartRight>0){
    const elapsed=now-_claimStartRight;
    const rem=Math.max(0,POWERUP_BUFF_DUR-elapsed);
    const pct=rem/POWERUP_BUFF_DUR;
    try{if(UI.claimTimerRight?.IsValid?.()){const t=fmt(rem);if(t!==_lastClaimTimerR){UI.claimTimerRight.text=t;_lastClaimTimerR=t;}}}catch{}
    try{if(UI.claimRingRight?.IsValid?.()){
      const sc=0.5+pct*0.5;
      UI.claimRingRight.style.preTransformScale2d=sc;
      UI.claimRingRight.style.opacity=0.3+pct*0.7;
    }}catch{}
    if(rem<=0)hideClaimIndicator("RIGHT");
  }
}

function getPanelPos(panel){
  let x=0,y=0;
  try{
    const mm=UI.minimap;
    if(mm){
      const mw=mm.contentwidth||200;
      const mh=mm.contentheight||200;
      x=(panel.actualxoffset||0)/mw*100;
      y=(panel.actualyoffset||0)/mh*100;
    }
  }catch(e){$.Msg("[BT-P][ERR] getPanelPos: "+e+"\n");}
  _posResult.x=x;_posResult.y=y;
  return _posResult;
}

function distSq(p1,p2){const dx=p1.x-p2.x,dy=p1.y-p2.y;return dx*dx+dy*dy;}

function showLinger(enemyId,btn){
  if(_lingerState[enemyId])return;
  if(!btn||!btn.IsValid?.())return;
  try{
    const slotIdx=assignSlot(enemyId);
    if(slotIdx<0)return;
    btn.style.opacity="0.5";
    btn.AddClass("linger-hidden");
    const panel=UI.lingerPanels[slotIdx];
    if(panel?.IsValid?.()){
      const bx=btn.actualxoffset||0,by=btn.actualyoffset||0;
      const bw=btn.actualwidth||16,bh=btn.actualheight||16;
      panel.style.marginLeft=(bx+bw/2-12)+"px";
      panel.style.marginTop=(by+bh/2-12)+"px";
      panel.AddClass("active");
    }
    const hideHandle=$.Schedule(LINGER_DURATION,()=>{hideLinger(enemyId);});
    _lingerState[enemyId]={slotIdx:slotIdx,hideHandle:hideHandle,btn:btn};
  }catch{}
}

function hideLinger(enemyId){
  const state=_lingerState[enemyId];
  if(!state)return;
  try{
    if(state.btn?.IsValid?.()){state.btn.style.opacity=null;state.btn.RemoveClass("linger-hidden");state.btn.RemoveClass("linger-active");}
    const panel=UI.lingerPanels[state.slotIdx];
    if(panel?.IsValid?.())panel.RemoveClass("active");
  }catch{}
  delete _lingerState[enemyId];
}

function cancelLinger(enemyId){
  const state=_lingerState[enemyId];
  if(!state)return;
  try{
    $.CancelScheduled(state.hideHandle);
    if(state.btn?.IsValid?.()){state.btn.style.opacity=null;state.btn.RemoveClass("linger-hidden");state.btn.RemoveClass("linger-active");}
    const panel=UI.lingerPanels[state.slotIdx];
    if(panel?.IsValid?.())panel.RemoveClass("active");
  }catch{}
  delete _lingerState[enemyId];
}

function clearAllLingers(){
  for(const id in _lingerState){
    try{$.CancelScheduled(_lingerState[id].hideHandle);}catch{}
    try{if(_lingerState[id].btn?.IsValid?.()){_lingerState[id].btn.style.opacity=null;_lingerState[id].btn.RemoveClass("linger-hidden");_lingerState[id].btn.RemoveClass("linger-active");}}catch{}
    try{UI.lingerPanels[_lingerState[id].slotIdx]?.RemoveClass?.("active");}catch{}
  }
  _lingerState={};_enemySlots={};_slotUsed[0]=_slotUsed[1]=_slotUsed[2]=_slotUsed[3]=_slotUsed[4]=_slotUsed[5]=false;
}

function assignSlot(enemyId){
  if(_enemySlots[enemyId]!==undefined)return _enemySlots[enemyId];
  for(let i=0;i<6;i++){if(!_slotUsed[i]){_slotUsed[i]=true;_enemySlots[enemyId]=i;return i;}}
  return -1;
}

function checkEnemyLinger(nowMs){
  const mm=findMinimap();
  if(!mm)return;
  const now=nowMs||Date.now();
  try{
    let buttons=_playerCache;
    if(!buttons||now-_playerCacheTs>BUTTON_CACHE_TTL){buttons=mm.FindChildrenWithClassTraverse("map_button");_playerCache=buttons;_playerCacheTs=now;}
    for(let i=0,len=buttons.length;i<len;i++){
      const btn=buttons[i];
      try{
        if(!btn?.IsValid?.()||!btn.BHasClass("player"))continue;
        if(!btn.BHasClass("enemy")&&!btn.BHasClass("team2"))continue;
        const id=btn.id||"enemy_"+i;
        const isDead=btn.BHasClass("playerdead");
        const isActive=btn.BHasClass("active");
        const pos=getPanelPos(btn);
        let ps=_playerState[id];
        const wasActive=ps?.wasActive??true;
        if(!ps){ps={x:0,y:0,deadTs:0,wasActive:true};_playerState[id]=ps;}
        ps.wasActive=isActive;ps.x=pos.x;ps.y=pos.y;
        if(isDead){ps.deadTs=now;cancelLinger(id);continue;}
        if(wasActive&&!isActive)showLinger(id,btn);
        else if(!wasActive&&isActive)cancelLinger(id);
      }catch{}
    }
  }catch{}
}

function getPlayersNearPowerup(mm,pwPos,nowMs){
  _nearResult.ally=Infinity;_nearResult.enemy=Infinity;
  const now=nowMs||Date.now();
  try{
    let buttons=_playerCache;
    if(!buttons||now-_playerCacheTs>BUTTON_CACHE_TTL){buttons=mm.FindChildrenWithClassTraverse("map_button");_playerCache=buttons;_playerCacheTs=now;}
    for(let i=0,len=buttons.length;i<len;i++){
      const btn=buttons[i];
      try{
        if(!btn?.IsValid?.()||!btn.BHasClass("player"))continue;
        const pos=getPanelPos(btn);
        if(pos.x===0&&pos.y===0)continue;
        const id=btn.id||"p"+i;
        const isDead=btn.BHasClass("playerdead");
        let ps=_playerState[id];
        const posChanged=!ps||Math.abs(ps.x-pos.x)>0.5||Math.abs(ps.y-pos.y)>0.5;
        if(!ps){ps={x:0,y:0,deadTs:0,wasActive:true};_playerState[id]=ps;}
        if(isDead){
          const deadTs=ps.deadTs||(posChanged?0:now);
          ps.x=pos.x;ps.y=pos.y;ps.deadTs=deadTs||now;
          if(btn.BHasClass("enemy")||btn.BHasClass("team2"))cancelLinger(id);
          if(!posChanged&&now-deadTs>=DEATH_GRACE_MS)continue;
        }else{ps.x=pos.x;ps.y=pos.y;ps.deadTs=0;}
        const d=distSq(pos,pwPos);
        if(btn.BHasClass("friend")||btn.BHasClass("ally")||btn.BHasClass("team1")){if(d<_nearResult.ally)_nearResult.ally=d;}
        else if(btn.BHasClass("enemy")||btn.BHasClass("team2")){if(d<_nearResult.enemy)_nearResult.enemy=d;}
      }catch{}
    }
  }catch{}
  return _nearResult;
}

function scanPowerups(){
  const mm=findMinimap();
  if(!mm)return;
  try{
    const buttons=mm.FindChildrenWithClassTraverse("map_button");
    if(!buttons?.length)return;
    let powerups=[];
    for(let i=0;i<buttons.length;i++){
      const btn=buttons[i];
      try{
        if(!btn?.BHasClass?.("powerup_spawn"))continue;
        if(!btn.BHasClass("active"))continue;
        let type="unknown";
        for(let j=0;j<POWERUP_TYPES.length;j++){if(btn.BHasClass(POWERUP_TYPES[j])){type=POWERUP_TYPES[j];break;}}
        const pos=getPanelPos(btn);
        powerups.push({type:type,x:pos.x,y:pos.y,panel:btn,claimed:false,minAllyDist:Infinity,minEnemyDist:Infinity});
      }catch{}
    }
    if(powerups.length===0)return;
    
    powerups.sort((a,b)=>a.x-b.x);
    clearGlows();
    for(let i=0,len=powerups.length;i<len;i++){powerups[i].pos=i===0?"LEFT":"RIGHT";applyGlow(powerups[i].pos,powerups[i].type);}
    
    knownSpawnPos={left:{x:powerups[0].x,y:powerups[0].y},right:powerups[1]?{x:powerups[1].x,y:powerups[1].y}:{x:powerups[0].x,y:powerups[0].y}};
    
    if(pretrackActive){
      powerups[0].minAllyDist=pretrackData.left.minAlly;
      powerups[0].minEnemyDist=pretrackData.left.minEnemy;
      if(powerups[1]){
        powerups[1].minAllyDist=pretrackData.right.minAlly;
        powerups[1].minEnemyDist=pretrackData.right.minEnemy;
      }
      pretrackActive=false;
    }
    
    trackedPowerups=powerups;
    monitoringActive=true;
    buffResetTs=0;
  }catch(e){$.Msg("[BT-P][ERR] scanPowerups: "+e+"\n");}
}

function monitorPowerups(nowMs){
  if(trackedPowerups.length===0){monitoringActive=false;return;}
  const mm=findMinimap();
  if(!mm)return;
  let allClaimed=true;
  for(let i=0,len=trackedPowerups.length;i<len;i++){
    const p=trackedPowerups[i];
    if(p.claimed)continue;
    let stillActive=false;
    try{if(p.panel?.IsValid?.()){stillActive=p.panel.BHasClass("active");}}catch{}
    _pwPos.x=p.x;_pwPos.y=p.y;
    const nearest=getPlayersNearPowerup(mm,_pwPos,nowMs);
    
    if(nearest.ally<p.minAllyDist){p.minAllyDist=nearest.ally;}
    if(nearest.enemy<p.minEnemyDist){p.minEnemyDist=nearest.enemy;}
    
    if(stillActive){
      allClaimed=false;
    }else{
      const allyClose=p.minAllyDist<=CLAIM_RADIUS_SQ;
      const enemyClose=p.minEnemyDist<=CLAIM_RADIUS_SQ;
      const allyCloser=p.minAllyDist<p.minEnemyDist;
      let enemyClaimed=false;
      
      if(allyClose&&allyCloser){
        enemyClaimed=false;
      }else if(enemyClose&&!allyCloser){
        enemyClaimed=true;
      }else{
        enemyClaimed=true;
      }
      clearSideGlow(p.pos);
      if(enemyClaimed)applyEnemyClaim(p.pos);
      showClaimIndicator(p.pos,enemyClaimed,p.type);
      p.claimed=true;
    }
  }
  
  if(allClaimed){
    clearGlows();
    monitoringActive=false;
    trackedPowerups=[];
  }
}

function startPhase(t,now){spawnWait=false;idx=t<0?0:t>3?3:t;counter=SEQ[idx].d;phaseStart=now;UI.rLab.text=fmt(counter);UI.rNum.text=SEQ[idx].n;setImg(idx);}
function startPhaseAuto(now){spawnWait=false;let c=0;for(let i=0;i<4;i++){if(now<c+SEQ[i].d){idx=i;phaseStart=c;counter=c+SEQ[i].d-now;UI.rLab.text=fmt(counter);UI.rNum.text=SEQ[i].n;setImg(i);return;}c+=SEQ[i].d;}const ld=SEQ[3].d,w=(now-c)%BRIDGE_DUR%ld;idx=3;phaseStart=now-w;counter=ld-w;UI.rLab.text=fmt(counter);UI.rNum.text="3";setImg(3);}
function showSpawn(){UI.rLab.text="Spawn";UI.rNum.text=SEQ[idx].n;resetImg();UI.rImg.AddClass("white");spawnWait=true;lastFound=false;tick=TICK_FAST;}

function startBuff(now){buffStart=now;buffCnt=REJUV_DUR;if(UI.rejuvBuff){UI.rejuvBuff.RemoveClass("pop-in");UI.rejuvBuff.AddClass("pop-out");UI.rejuvBuff.style.opacity="1";}if(UI.rejuvBuffTime)UI.rejuvBuffTime.text=fmt(buffCnt);}
function endBuff(){buffStart=0;buffCnt=0;if(UI.rejuvBuff){UI.rejuvBuff.RemoveClass("pop-out");UI.rejuvBuff.AddClass("pop-in");$.Schedule(0.5,()=>{if(UI.rejuvBuff)UI.rejuvBuff.style.opacity="0";});}}

function startRun(now){running=true;claimCnt=0;lastFound=false;spawnWait=false;inHideout=false;lastRunChk=Date.now();lastScan=0;trackedPowerups=[];monitoringActive=false;pretrackActive=false;startPhaseAuto(now);}
function reset(f){if(hnd){$.CancelScheduled(hnd);hnd=null;}if(f){idx=0;counter=0;phaseStart=0;claimCnt=0;buffStart=0;buffCnt=0;lastSec=-1;lastGlobalSec=-1;spawnWait=false;lastFound=false;running=false;inHideout=true;trackedPowerups.length=0;monitoringActive=false;pretrackActive=false;_playerCache=null;_playerCacheTs=0;_playerState={};clearGlows();clearClaimIndicators();_enemySlots={};_slotUsed[0]=_slotUsed[1]=_slotUsed[2]=_slotUsed[3]=_slotUsed[4]=_slotUsed[5]=false;clearAllLingers();if(UI.rLab)UI.rLab.text=fmt(SEQ[0].d);if(UI.rNum)UI.rNum.text="1";resetImg();endBuff();}}
function setImg(i){resetImg();if(i>0){UI.rImg.AddClass("reverse");UI.rImg.AddClass("rotating");$.Schedule(0.8,()=>UI.rImg.RemoveClass("rotating"));}}
function resetImg(){UI.rImg.RemoveClass("rotating");UI.rImg.RemoveClass("reverse");UI.rImg.RemoveClass("white");}

function gTime(){
  const n=Date.now();
  if(n-_tCacheTs<200)return _tCache;
  let t=0;
  if(_gameTimePanel?.IsValid?.()){try{t=parseSec(_gameTimePanel.text);}catch{}}
  if(!t){
    try{const tb=UI.root.FindChildTraverse("TopBar");if(tb){const a=tb.FindChildrenWithClassTraverse("GameTime");if(a?.[0]?.text){_gameTimePanel=a[0];t=parseSec(a[0].text);}}}catch{}
  }
  if(t>0){_tCache=t;_tCacheTs=n;}
  return t;
}
function parseSec(t){if(!t)return 0;const s=String(t),ci=s.indexOf(":");if(ci<0)return 0;let mm=0,ss=0,c;for(let i=0;i<ci;i++){c=s.charCodeAt(i);if(c>=48&&c<=57)mm=mm*10+(c-48);}for(let i=ci+1,n=0;i<s.length&&n<2;i++,n++){c=s.charCodeAt(i);if(c>=48&&c<=57)ss=ss*10+(c-48);else break;}return mm*60+(ss>59?ss%60:ss);}
function isHideout(){if(!UI.hud?.BHasClass)return false;try{return UI.hud.BHasClass("connectedToHideout")||UI.hud.BHasClass("connectedtoHideout")||UI.hud.BHasClass("connectedtohideout");}catch{}return false;}
function fmt(s){s=Math.max(0,s|0);const m=(s/60)|0,ss=s%60;return(m<10?"0"+m:""+m)+":"+(ss<10?"0"+ss:""+ss);}
function findRoot(p){while(p.GetParent?.())p=p.GetParent();return p;}
boot();
})();
