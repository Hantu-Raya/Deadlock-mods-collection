(()=>{"use strict";
const REJUV_DUR=240,BRIDGE_DUR=300,SPAWN_TH=10,TICK_FAST=0.1,TICK_NORM=1,TICK_IDLE=3;
const SEQ=[{d:600,n:"1"},{d:420,n:"2"},{d:360,n:"3"},{d:300,n:"3"}];
const REJUV_CLS=["RejuvCount_1","RejuvCount_2","RejuvCount_3","RejuvCount_4"];
const POWERUP_TYPES=["powerup_gun","powerup_survival","powerup_casting","powerup_movement"];
const POWERUP_CHECK_TH=10,POWERUP_LINGER=1500;
const MONITOR_INTERVAL=300,CLAIM_RADIUS=8,PRETRACK_INTERVAL=750;
const CLAIM_DISPLAY_DUR=4.0;
const POWERUP_BUFF_DUR=180;
const DEATH_GRACE_MS=2000;
const BUTTON_CACHE_TTL=400;

let hnd,running=false,inHideout=true,spawnWait=false,idx=0,counter=0,phaseStart=0,claimCnt=0;
let buffStart=0,buffCnt=0,lastSec=-1,lastGlobalSec=-1,lastGateChk=0,lastRunChk=0,lastScan=0,tick=TICK_NORM,lastFound=false;
let lastPowerupScan=0,prevBuffRem=300,buffResetTs=0;
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
const _posResult={x:0,y:0};

const UI={root:null,hud:null,minimap:null,glowLeft:null,glowRight:null,rLab:null,rNum:null,rImg:null,buffLab:null,rejuvBuff:null,rejuvBuffTime:null,rejuvFriendly:null,rejuvEnemy:null,claimLeft:null,claimRight:null,claimIconLeft:null,claimIconRight:null,claimRingLeft:null,claimRingRight:null,claimTimerLeft:null,claimTimerRight:null};

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
  const tb=r.FindChildTraverse("TopBar")||r.FindChildTraverse("CitadelHudTopBar");
  if(tb){const ch=tb.FindChildTraverse("RejuvenatorCharges");if(ch){UI.rejuvFriendly=ch.FindChildTraverse("RejuvenatorFriendly");UI.rejuvEnemy=ch.FindChildTraverse("RejuvenatorEnemy");}}
  if(!UI.rLab||!UI.rNum||!UI.rImg||!UI.buffLab)return $.Schedule(0.5,boot);
  reset(1);loop();
}

function loop(){
  const now=gTime(),rn=Date.now();
  if(!running){if(rn-lastGateChk>=30000){lastGateChk=rn;inHideout=isHideout();if(!inHideout)startRun(now);}hnd=$.Schedule(TICK_IDLE,loop);return;}
  if(rn-lastRunChk>=60000){lastRunChk=rn;if(isHideout()){reset(1);loop();return;}}
  if(lastGlobalSec>=0&&(now+5<lastGlobalSec||(lastGlobalSec>30&&now<=2))){reset(1);loop();return;}
  lastGlobalSec=now;
  if(now!==lastSec){lastSec=now;const rem=Math.max(0,SEQ[idx].d-(now-phaseStart));if(rem<=0)showSpawn();else{counter=rem;UI.rLab.text=fmt(rem);}tick=spawnWait||rem<=SPAWN_TH?TICK_FAST:TICK_NORM;}
  if(buffStart>0){buffCnt=Math.max(0,REJUV_DUR-(now-buffStart));if(UI.rejuvBuffTime)UI.rejuvBuffTime.text=fmt(buffCnt);if(buffCnt<=0)endBuff();}
  const buffRem=BRIDGE_DUR-(now%BRIDGE_DUR);UI.buffLab.text=fmt(buffRem);
  
  if(buffRem<=POWERUP_CHECK_TH&&!pretrackActive&&!monitoringActive&&knownSpawnPos){
    pretrackActive=true;
    pretrackData={left:{minAlly:Infinity,minEnemy:Infinity},right:{minAlly:Infinity,minEnemy:Infinity}};
  }
  
  if(pretrackActive&&knownSpawnPos&&rn-lastPretrackCheck>=PRETRACK_INTERVAL){
    lastPretrackCheck=rn;
    doPretrack();
  }
  
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
    monitorPowerups();
  }
  
  if(rn-lastScan>=3000){lastScan=rn;doScan(now);}
  updateClaimProgress(now);
  hnd=$.Schedule(tick,loop);
}

function doPretrack(){
  const mm=findMinimap();
  if(!mm||!knownSpawnPos)return;
  
  const nearLeft=getPlayersNearPowerup(mm,knownSpawnPos.left);
  const nearRight=getPlayersNearPowerup(mm,knownSpawnPos.right);
  
  if(nearLeft.ally<pretrackData.left.minAlly)pretrackData.left.minAlly=nearLeft.ally;
  if(nearLeft.enemy<pretrackData.left.minEnemy)pretrackData.left.minEnemy=nearLeft.enemy;
  if(nearRight.ally<pretrackData.right.minAlly)pretrackData.right.minAlly=nearRight.ally;
  if(nearRight.enemy<pretrackData.right.minEnemy)pretrackData.right.minEnemy=nearRight.enemy;
}

function doScan(now){if(!running)return;const f=hasRejuv();if(spawnWait&&f&&!lastFound){claimCnt++;startBuff(now);startPhase(claimCnt>2?3:claimCnt,now);}lastFound=f;}
function hasRejuv(){return panelHas(UI.rejuvFriendly)||panelHas(UI.rejuvEnemy);}
function panelHas(p){if(!p)return false;for(let i=0;i<4;i++){try{if(p.BHasClass(REJUV_CLS[i]))return true;}catch{}}try{const k=p.Children();for(let j=0;j<k.length;j++)for(let i=0;i<4;i++){try{if(k[j].BHasClass(REJUV_CLS[i]))return true;}catch{}}}catch{}return false;}

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

function showClaimIndicator(side,isEnemy,claimerBtn,powerupType){
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
    try{if(UI.claimTimerLeft?.IsValid?.())UI.claimTimerLeft.text=fmt(rem);}catch{}
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
    try{if(UI.claimTimerRight?.IsValid?.())UI.claimTimerRight.text=fmt(rem);}catch{}
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
    const st=panel.style;
    if(st){
      const pos=st.position;
      if(pos&&typeof pos==="string"&&pos.indexOf("%")>0){
        const parts=pos.trim().split(/[\s%]+/);
        if(parts.length>=2){
          x=parseFloat(parts[0])||0;
          y=parseFloat(parts[1])||0;
        }
      }
      if(x===0&&y===0){
        const left=st.marginLeft||st["margin-left"];
        const top=st.marginTop||st["margin-top"];
        if(left&&left.indexOf("%")>0)x=parseFloat(left)||0;
        if(top&&top.indexOf("%")>0)y=parseFloat(top)||0;
      }
    }
    if(x===0&&y===0){
      const pw=panel.contentwidth||panel.actualxoffset||0;
      const ph=panel.contentheight||panel.actualyoffset||0;
      const mm=UI.minimap;
      if(mm&&pw>0){
        const mw=mm.contentwidth||mm.actuallayoutwidth||200;
        const mh=mm.contentheight||mm.actuallayoutheight||200;
        x=(panel.actualxoffset||panel.actuallayoutx||0)/mw*100;
        y=(panel.actualyoffset||panel.actuallayouty||0)/mh*100;
      }
    }
  }catch(e){$.Msg("[BT-P][ERR] getPanelPos: "+e+"\n");}
  _posResult.x=x;
  _posResult.y=y;
  return _posResult;
}

function dist(p1,p2){const dx=p1.x-p2.x,dy=p1.y-p2.y;return Math.sqrt(dx*dx+dy*dy);}

function getPlayersNearPowerup(mm,pwPos){
  let nearestAlly=Infinity,nearestEnemy=Infinity;
  let closestAllyBtn=null,closestEnemyBtn=null;
  const now=Date.now();
  try{
    let buttons=_playerCache;
    if(!buttons||now-_playerCacheTs>BUTTON_CACHE_TTL){
      buttons=mm.FindChildrenWithClassTraverse("map_button");
      _playerCache=buttons;_playerCacheTs=now;
    }
    for(let i=0;i<buttons.length;i++){
      const btn=buttons[i];
      try{
        if(!btn?.IsValid?.())continue;
        if(!btn.BHasClass("player"))continue;
        const pos=getPanelPos(btn);
        if(pos.x===0&&pos.y===0)continue;
        
        const id=btn.id||"p"+i;
        const isDead=btn.BHasClass("playerdead");
        const prev=_playerState[id];
        const posChanged=!prev||Math.abs(prev.x-pos.x)>0.5||Math.abs(prev.y-pos.y)>0.5;
        
        if(isDead){
          const deadTs=prev?.deadTs||(posChanged?0:now);
          _playerState[id]={x:pos.x,y:pos.y,deadTs:deadTs||now};
          const diedRecently=now-deadTs<DEATH_GRACE_MS;
          if(!posChanged&&!diedRecently)continue;
        }else{
          _playerState[id]={x:pos.x,y:pos.y,deadTs:0};
        }
        
        const d=dist(pos,pwPos);
        if(btn.BHasClass("friend")||btn.BHasClass("ally")||btn.BHasClass("team1")){
          if(d<nearestAlly){nearestAlly=d;closestAllyBtn=btn;}
        }else if(btn.BHasClass("enemy")||btn.BHasClass("team2")){
          if(d<nearestEnemy){nearestEnemy=d;closestEnemyBtn=btn;}
        }
      }catch{}
    }
  }catch{}
  return {ally:nearestAlly,enemy:nearestEnemy,allyBtn:closestAllyBtn,enemyBtn:closestEnemyBtn};
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
        powerups.push({type:type,x:pos.x,y:pos.y,panel:btn,claimed:false,minAllyDist:Infinity,minEnemyDist:Infinity,closestAllyBtn:null,closestEnemyBtn:null});
      }catch{}
    }
    if(powerups.length===0)return;
    
    powerups.sort((a,b)=>a.x-b.x);
    clearGlows();
    for(let i=0;i<powerups.length;i++){
      powerups[i].pos=i===0?"LEFT":"RIGHT";
      applyGlow(powerups[i].pos,powerups[i].type);
    }
    
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

function monitorPowerups(){
  if(trackedPowerups.length===0){monitoringActive=false;return;}
  const mm=findMinimap();
  if(!mm)return;
  
  let allClaimed=true;
  for(let i=0;i<trackedPowerups.length;i++){
    const p=trackedPowerups[i];
    if(p.claimed)continue;
    
    let stillActive=false;
    try{if(p.panel?.IsValid?.()){stillActive=p.panel.BHasClass("active");}}catch{}
    
    const pwPos={x:p.x,y:p.y};
    const nearest=getPlayersNearPowerup(mm,pwPos);
    
    if(nearest.ally<p.minAllyDist){p.minAllyDist=nearest.ally;p.closestAllyBtn=nearest.allyBtn;}
    if(nearest.enemy<p.minEnemyDist){p.minEnemyDist=nearest.enemy;p.closestEnemyBtn=nearest.enemyBtn;}
    
    if(stillActive){
      allClaimed=false;
    }else{
      const allyClose=p.minAllyDist<=CLAIM_RADIUS;
      const enemyClose=p.minEnemyDist<=CLAIM_RADIUS;
      const allyCloser=p.minAllyDist<p.minEnemyDist;
      let enemyClaimed=false;
      let claimerBtn=null;
      
      if(allyClose&&allyCloser){
        claimerBtn=p.closestAllyBtn;
      }else if(enemyClose&&!allyCloser){
        enemyClaimed=true;
        claimerBtn=p.closestEnemyBtn;
      }else{
        enemyClaimed=true;
        claimerBtn=p.closestEnemyBtn;
      }
      clearSideGlow(p.pos);
      if(enemyClaimed)applyEnemyClaim(p.pos);
      showClaimIndicator(p.pos,enemyClaimed,claimerBtn,p.type);
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
function reset(f){if(hnd){$.CancelScheduled(hnd);hnd=null;}if(f){idx=0;counter=0;phaseStart=0;claimCnt=0;buffStart=0;buffCnt=0;lastSec=-1;lastGlobalSec=-1;spawnWait=false;lastFound=false;running=false;inHideout=true;trackedPowerups=[];monitoringActive=false;pretrackActive=false;_playerCache=null;_playerCacheTs=0;_playerState={};clearGlows();clearClaimIndicators();if(UI.rLab)UI.rLab.text=fmt(SEQ[0].d);if(UI.rNum)UI.rNum.text="1";resetImg();endBuff();}}
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
