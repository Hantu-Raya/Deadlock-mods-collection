(()=>{"use strict";
const STEP=0.1,MAX_T=600,TTL=200,COL_R=1000,COL_Y=500,MS_TH=300,TICK_HI=0.1,TICK_MD=1,TICK_LO=3;
let hnd,_tC=0,_tCTs=0,lastS=-1,lastTxt="",lastCol="";
const UI={root:null,tLab:null,sLab:null,cLab:null};
function log(c,m){$.Msg("[ST]["+c+"] "+m+"\n");}
function boot(){const r=fRoot($.GetContextPanel());UI.root=r;UI.tLab=r.FindChildTraverse("soulTimerLabel");UI.sLab=r.FindChildTraverse("hudDealthGoldLabel");log("BOOT","tLab="+!!UI.tLab+" sLab="+!!UI.sLab);if(!UI.tLab||!UI.sLab)return $.Schedule(0.5,boot);const c=r.FindChildrenWithClassTraverse("GameTime");UI.cLab=c?.[0];log("BOOT","Starting");loop();}
function loop(){if(!UI.tLab||!UI.sLab){log("ERR","Missing");return $.Schedule(1,boot);}const raw=UI.sLab.text||"",s=pSoul(raw),gm=gT()/60;log("LOOP","s="+s+" gm="+gm.toFixed(2));if(s===0){if(lastS!==0){UI.tLab.text="";UI.tLab.AddClass("hidden");lastS=0;log("LOOP","Hidden");}}else{if(UI.tLab.BHasClass("hidden"))UI.tLab.RemoveClass("hidden");const ttl=calc(s,gm),txt=fmt(ttl,s>=MS_TH),col=s>=COL_R?"red":s>=COL_Y?"yellow":"green";UI.tLab.text=txt;log("LOOP","txt="+txt);if(col!==lastCol){UI.tLab.RemoveClass("red");UI.tLab.RemoveClass("yellow");UI.tLab.RemoveClass("green");UI.tLab.AddClass(col);lastCol=col;}lastS=s;lastTxt=txt;}const tick=s<50?TICK_LO:s<500?TICK_MD:TICK_HI;hnd=$.Schedule(tick,loop);}
function calc(s,gm){if(s<=0)return 0;let n=s,t=0,i=0,mx=MAX_T/STEP;while(n>0&&i<mx){const g=gm+(t/60),fl=1.6*(1+0.08*g),r=(n*0.005)+fl;n-=r*STEP;t+=STEP;i++;}return Math.max(0,t);}
function fmt(sc,ms){if(sc<=0)return "0:00";const m=(sc/60)|0,s=(sc|0)%60,b=m+":"+(s<10?"0":"")+s;if(!ms)return b;const f=((sc%1)*100)|0;return b+"."+(f<10?"0":"")+f;}
function pSoul(t){if(!t)return 0;let r=0,c;for(let i=0;i<t.length;i++){c=t.charCodeAt(i);if(c>=48&&c<=57)r=r*10+(c-48);}return r;}
function gT(){const n=Date.now();if(n-_tCTs<TTL)return _tC;let t=0;try{t=Game?.GetGameTime?.()|0;}catch{}if(t>0){_tC=t;_tCTs=n;return t;}t=uiT();_tC=t;_tCTs=n;return t;}
function uiT(){if(UI.cLab?.text)return pClock(UI.cLab.text);return 0;}
function pClock(t){if(!t)return 0;const ci=t.indexOf(":");if(ci<0)return 0;let mm=0,ss=0,c;for(let i=0;i<ci;i++){c=t.charCodeAt(i);if(c>=48&&c<=57)mm=mm*10+(c-48);}for(let i=ci+1,n=0;i<t.length&&n<2;i++,n++){c=t.charCodeAt(i);if(c>=48&&c<=57)ss=ss*10+(c-48);else break;}return mm*60+ss;}
function fRoot(p){while(p?.GetParent?.())p=p.GetParent();return p;}
boot();
})();
