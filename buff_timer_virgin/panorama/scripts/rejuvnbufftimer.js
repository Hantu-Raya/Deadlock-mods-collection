(()=>{"use strict";
const REJUV_DUR=240,BRIDGE_DUR=300,SPAWN_TH=10,TICK_FAST=0.1,TICK_NORM=1,TICK_IDLE=3;
const SEQ=[{d:600,n:"1"},{d:420,n:"2"},{d:360,n:"3"},{d:300,n:"3"}];
const REJUV_CLS=["RejuvCount_1","RejuvCount_2","RejuvCount_3","RejuvCount_4"];
const TIME_IDS=["HudGameTime","GameTime","MainGameTime"];

// Soul Timer Constants
const SOUL_BASE_FLAT=1.6,SOUL_FLAT_GROWTH=0.08,SOUL_PCT_DRAIN=0.005,SOUL_STEP=0.1,SOUL_MAX_TIME=600;
const SOUL_COLOR_RED=1000,SOUL_COLOR_YELLOW=500,SOUL_SHOW_MS=300;

let hnd,running=false,inHideout=true,spawnWait=false,idx=0,counter=0,phaseStart=0,claimCnt=0;
let buffStart=0,buffCnt=0,lastSec=-1,lastGlobalSec=-1,lastGateChk=0,lastRunChk=0,lastScan=0,tick=TICK_NORM,lastFound=false;
let _tCache=0,_tCacheTs=0;

// Soul Timer State
let _soulLastSouls=-1,_soulLastText=null,_soulLastColor=null,_soulLastVisible=false;

const UI={root:null,hud:null,gameTimePanel:null,rLab:null,rNum:null,rImg:null,buffLab:null,rejuvBuff:null,rejuvBuffTime:null,rejuvFriendly:null,rejuvEnemy:null,
  soulPanel:null,soulLabel:null,unsecuredLabel:null};

function boot(){
  const r=findRoot($.GetContextPanel());UI.root=r;UI.hud=r.FindChildTraverse("Hud");
  UI.rLab=r.FindChildTraverse("RejuvTime");UI.rNum=r.FindChildTraverse("RejuvNum");UI.rImg=r.FindChildTraverse("RejuvImg");
  UI.buffLab=r.FindChildTraverse("BuffTime");UI.rejuvBuff=r.FindChildTraverse("RejuvBuff");UI.rejuvBuffTime=r.FindChildTraverse("RejuvTimeBuff");
  // Soul Timer panels
  UI.soulPanel=r.FindChildTraverse("SoulTimer");UI.soulLabel=r.FindChildTraverse("SoulTimerLabel");
  UI.unsecuredLabel=r.FindChildTraverse("hudDealthGoldLabel");
  const tb=r.FindChildTraverse("TopBar")||r.FindChildTraverse("CitadelHudTopBar");
  if(tb){const ch=tb.FindChildTraverse("RejuvenatorCharges");if(ch){UI.rejuvFriendly=ch.FindChildTraverse("RejuvenatorFriendly");UI.rejuvEnemy=ch.FindChildTraverse("RejuvenatorEnemy");}}
  if(!UI.rLab||!UI.rNum||!UI.rImg||!UI.buffLab)return $.Schedule(0.5,boot);
  reset(1);loop();
}

function loop(){
  const now=gTime(),rn=Date.now();
  if(!running){if(rn-lastGateChk>=30000){lastGateChk=rn;inHideout=isHideout();if(!inHideout)startRun(now);}updateSoulTimer(now/60);hnd=$.Schedule(TICK_IDLE,loop);return;}
  if(rn-lastRunChk>=60000){lastRunChk=rn;if(isHideout()){reset(1);loop();return;}}
  if(lastGlobalSec>=0&&(now+5<lastGlobalSec||(lastGlobalSec>30&&now<=2))){reset(1);loop();return;}
  lastGlobalSec=now;
  if(now!==lastSec){lastSec=now;const rem=Math.max(0,SEQ[idx].d-(now-phaseStart));if(rem<=0)showSpawn();else{counter=rem;UI.rLab.text=fmt(rem);}tick=spawnWait||rem<=SPAWN_TH?TICK_FAST:TICK_NORM;}
  if(buffStart>0){buffCnt=Math.max(0,REJUV_DUR-(now-buffStart));if(UI.rejuvBuffTime)UI.rejuvBuffTime.text=fmt(buffCnt);if(buffCnt<=0)endBuff();}
  UI.buffLab.text=fmt(BRIDGE_DUR-(now%BRIDGE_DUR));
  updateSoulTimer(now/60);
  if(rn-lastScan>=3000){lastScan=rn;doScan(now);}
  hnd=$.Schedule(tick,loop);
}

function doScan(now){if(!running)return;const f=hasRejuv();if(spawnWait&&f&&!lastFound){claimCnt++;startBuff(now);startPhase(claimCnt>2?3:claimCnt,now);}lastFound=f;}
function hasRejuv(){return panelHas(UI.rejuvFriendly)||panelHas(UI.rejuvEnemy);}
function panelHas(p){if(!p)return false;for(let i=0;i<4;i++){try{if(p.BHasClass(REJUV_CLS[i]))return true;}catch{}}try{const k=p.Children();for(let j=0;j<k.length;j++)for(let i=0;i<4;i++){try{if(k[j].BHasClass(REJUV_CLS[i]))return true;}catch{}}}catch{}return false;}

function startPhase(t,now){spawnWait=false;idx=t<0?0:t>3?3:t;counter=SEQ[idx].d;phaseStart=now;UI.rLab.text=fmt(counter);UI.rNum.text=SEQ[idx].n;setImg(idx);}
function startPhaseAuto(now){spawnWait=false;let c=0;for(let i=0;i<4;i++){if(now<c+SEQ[i].d){idx=i;phaseStart=c;counter=c+SEQ[i].d-now;UI.rLab.text=fmt(counter);UI.rNum.text=SEQ[i].n;setImg(i);return;}c+=SEQ[i].d;}const ld=SEQ[3].d,w=(now-c)%BRIDGE_DUR%ld;idx=3;phaseStart=now-w;counter=ld-w;UI.rLab.text=fmt(counter);UI.rNum.text="3";setImg(3);}
function showSpawn(){UI.rLab.text="Spawn";UI.rNum.text=SEQ[idx].n;resetImg();UI.rImg.AddClass("white");spawnWait=true;lastFound=false;tick=TICK_FAST;}

function startBuff(now){buffStart=now;buffCnt=REJUV_DUR;if(UI.rejuvBuff){UI.rejuvBuff.RemoveClass("pop-in");UI.rejuvBuff.AddClass("pop-out");UI.rejuvBuff.style.opacity="1";}if(UI.rejuvBuffTime)UI.rejuvBuffTime.text=fmt(buffCnt);}
function endBuff(){buffStart=0;buffCnt=0;if(UI.rejuvBuff){UI.rejuvBuff.RemoveClass("pop-out");UI.rejuvBuff.AddClass("pop-in");$.Schedule(0.5,()=>{if(UI.rejuvBuff)UI.rejuvBuff.style.opacity="0";});}}

function startRun(now){running=true;claimCnt=0;lastFound=false;spawnWait=false;inHideout=false;lastRunChk=Date.now();lastScan=0;startPhaseAuto(now);}
function reset(f){if(hnd){$.CancelScheduled(hnd);hnd=null;}if(f){idx=0;counter=0;phaseStart=0;claimCnt=0;buffStart=0;buffCnt=0;lastSec=-1;lastGlobalSec=-1;spawnWait=false;lastFound=false;running=false;inHideout=true;if(UI.rLab)UI.rLab.text=fmt(SEQ[0].d);if(UI.rNum)UI.rNum.text="1";resetImg();endBuff();}}
function setImg(i){resetImg();if(i>0){UI.rImg.AddClass("reverse");UI.rImg.AddClass("rotating");$.Schedule(0.8,()=>UI.rImg.RemoveClass("rotating"));}}
function resetImg(){UI.rImg.RemoveClass("rotating");UI.rImg.RemoveClass("buff");UI.rImg.RemoveClass("reverse");UI.rImg.RemoveClass("white");}

// ============================================================================
// SOUL TIMER FUNCTIONS
// ============================================================================
function parseSoulValue(text){
  if(!text)return 0;
  const str=String(text);
  let result=0,c;
  for(let i=0;i<str.length;i++){
    c=str.charCodeAt(i);
    if(c>=48&&c<=57)result=result*10+(c-48);
  }
  return result;
}

function calcSoulTime(souls,gameMin){
  let s=souls,elapsed=0;
  while(s>0&&elapsed<SOUL_MAX_TIME){
    const gm=gameMin+(elapsed/60);
    const flat=SOUL_BASE_FLAT*(1+SOUL_FLAT_GROWTH*gm);
    const drain=(s*SOUL_PCT_DRAIN)+flat;
    s-=drain*SOUL_STEP;
    elapsed+=SOUL_STEP;
  }
  return elapsed>0?elapsed:0;
}

function fmtSoulTime(sec,showMs){
  if(sec<=0)return"0:00";
  const ts=sec|0,mm=(ts/60)|0,ss=ts%60;
  const mmS=mm<10?"0"+mm:""+mm,ssS=ss<10?"0"+ss:""+ss;
  if(!showMs)return mmS+":"+ssS;
  const ms=((sec-ts)*100)|0,msS=ms<10?"0"+ms:""+ms;
  return mmS+":"+ssS+"."+msS;
}

function getSoulColor(souls){
  if(souls>=SOUL_COLOR_RED)return"red";
  if(souls>=SOUL_COLOR_YELLOW)return"yellow";
  return"green";
}

function updateSoulTimer(gameMin){
  const panel=UI.soulPanel,label=UI.soulLabel;
  if(!panel||!label)return;
  const unsec=UI.unsecuredLabel;
  const souls=unsec?.text?parseSoulValue(unsec.text):0;
  const shouldShow=souls>0;
  if(shouldShow!==_soulLastVisible){
    if(shouldShow){panel.RemoveClass("hidden");label.RemoveClass("hidden");}
    else{panel.AddClass("hidden");label.AddClass("hidden");}
    _soulLastVisible=shouldShow;
  }
  if(!shouldShow){_soulLastSouls=0;return;}
  if(souls!==_soulLastSouls){
    const timeToZero=calcSoulTime(souls,gameMin);
    const showMs=souls>=SOUL_SHOW_MS;
    const txt=fmtSoulTime(timeToZero,showMs);
    const col=getSoulColor(souls);
    if(txt!==_soulLastText){label.text=txt;_soulLastText=txt;}
    if(col!==_soulLastColor){
      label.RemoveClass("red");label.RemoveClass("yellow");label.RemoveClass("green");
      label.AddClass(col);
      _soulLastColor=col;
    }
    _soulLastSouls=souls;
  }
}

function gTime(){const n=Date.now();if(n-_tCacheTs<200)return _tCache;let t=0;try{t=typeof Game!=="undefined"&&Game.GetGameTime?.()|0;}catch{}if(t>0){_tCache=t;_tCacheTs=n;return t;}try{t=typeof Game!=="undefined"&&Game.GetDOTATime?.()|0;}catch{}if(t>0){_tCache=t;_tCacheTs=n;return t;}try{t=typeof GameUI!=="undefined"&&GameUI.GetGameTime?.()|0;}catch{}if(t>0){_tCache=t;_tCacheTs=n;return t;}t=uiTime();_tCache=t;_tCacheTs=n;return t;}
function uiTime(){if(UI.gameTimePanel){try{return parseSec(UI.gameTimePanel.text);}catch{}}for(let i=0;i<3;i++){try{const p=UI.root.FindChildTraverse(TIME_IDS[i]);if(p?.text){UI.gameTimePanel=p;return parseSec(p.text);}}catch{}}try{const a=(UI.hud||UI.root).FindChildrenWithClassTraverse("GameTime");if(a?.[0]?.text){UI.gameTimePanel=a[0];return parseSec(a[0].text);}}catch{}return 0;}
function parseSec(t){if(!t)return 0;const s=String(t),ci=s.indexOf(":");if(ci<0)return 0;let mm=0,ss=0,c;for(let i=0;i<ci;i++){c=s.charCodeAt(i);if(c>=48&&c<=57)mm=mm*10+(c-48);}for(let i=ci+1,n=0;i<s.length&&n<2;i++,n++){c=s.charCodeAt(i);if(c>=48&&c<=57)ss=ss*10+(c-48);else break;}return mm*60+(ss>59?ss%60:ss);}
function isHideout(){if(!UI.hud?.BHasClass)return false;try{return UI.hud.BHasClass("connectedToHideout")||UI.hud.BHasClass("connectedtoHideout")||UI.hud.BHasClass("connectedtohideout");}catch{}return false;}
function fmt(s){s=Math.max(0,s|0);const m=(s/60)|0,ss=s%60;return(m<10?"0"+m:""+m)+":"+(ss<10?"0"+ss:""+ss);}
function findRoot(p){while(p.GetParent?.())p=p.GetParent();return p;}
boot();
})();
