(function(){'use strict';
var C='rgb(255,201,97)',C2='rgb(100,133,252)',CM='rgb(255,123,0)',CN='rgb(91,239,181)',CR='#e16161',
LP='low_hp_bar_pulse',LS='low_hp_ult_static',
ctx=$.GetContextPanel(),rb=null,ui=null,ll=null,lc=null,wr=null,
cp=null,tid=0,fl=0,lCol=null,lUlt=null,lHp=-1,lLow=-1,lW=-1,lPW=-1,
lAT=0,lUT=0,sFC=0,pPct=-1,pulse=0,lLv=-1,LT_=[11,19,27,35],LC_=['level_tier2','level_tier3','level_tier4','level_tier5'];
function fRB(){return ctx.FindChildTraverse('unit_healthbar_lagging')||ctx.FindChildTraverse('health_bar')||ctx.FindChildTraverse('unit_health')||ctx.FindChildTraverse('hero_health_lagging')}
function scan(p){var t=0,f=0,d=0,c=p;while(c&&d<10){if(c.BHasClass){if(!t){if(c.BHasClass('team2'))t=2;else if(c.BHasClass('team1'))t=1}if(!(f&1)&&c.BHasClass('enemy'))f|=1;if(!(f&2)&&(c.BHasClass('team_neutral')||c.BHasClass('neutral')))f|=2;if(t&&(f&3))break}if(!c.GetParent)break;c=c.GetParent();d++}tid=t;fl=f}
function sBC(c){if(lCol!==c){if(rb)rb.style.washColor=c;lCol=c}}
function sUC(c){if(!ui||!ui.IsValid())ui=ctx.FindChildTraverse('unit_ult_ready_icon')||ctx.FindChildTraverse('ult_icon')||ctx.FindChildTraverse('ability_ult');if(!ui||!ui.style)return;if(lUlt!==c){ui.style.washColor=c;lUlt=c}}
function gL(){var n=Date.now();if(!rb){rb=fRB();if(!rb){$.Schedule(0.15,gL);return}}if(rb.GetParent){var p=rb.GetParent();if(cp!==p)cp=p}if(n-lAT>2e3){lAT=n;scan(rb)}if(fl&2){sBC(CN);lUT=n;$.Schedule(1.5,gL);return}if(!(fl&1)){lUT=n;$.Schedule(0.4,gL);return}var w=rb.actuallayoutwidth|0,pw=cp&&cp.actuallayoutwidth!==void 0?cp.actuallayoutwidth|0:0;if(w===lW&&pw===lPW){if(n-lUT>2e3){$.Schedule(1,gL);return}$.Schedule(0.15,gL);return}lW=w;lPW=pw;lUT=n;if(pw<=0){$.Schedule(0.18,gL);return}var hp=(w/pw*100)|0;if(Math.abs(hp-lHp)<3&&hp>25){$.Schedule(0.15,gL);return}if(hp===pPct)sFC++;else{sFC=0;pPct=hp}lHp=hp;var sc=0.15;if(hp<=25){if(!rb||!rb.IsValid()){$.Schedule(0.15,gL);return}if(!pulse){rb.AddClass(LP);if(ui)ui.AddClass(LS);pulse=1;lCol=lUlt=null}sUC(CR);if(lLow===-1||Math.abs(hp-lLow)>=5){lLow=hp;sFC=0}}else{if(pulse){rb.RemoveClass(LP);if(ui)ui.RemoveClass(LS);pulse=0;lUlt=null}var cl=hp<=65?CM:tid===2?C2:C;sBC(cl);sUC(cl);lLow=hp;if(sFC>=5)sc=Math.min(0.15*Math.pow(2,Math.floor(sFC/5)),1)}$.Schedule(sc,gL)}
function pLv(t){var v=0;for(var i=0;i<t.length;i++){var c=t.charCodeAt(i)-48;if(c>=0&&c<=9)v=v*10+c}return v}
function fER(p){var c=p;while(c){if(c.BHasClass&&c.BHasClass('enemy'))return c;if(!c.GetParent)break;c=c.GetParent()}return null}
function cLU(){if(!ll||!ll.IsValid())ll=ctx.FindChildTraverse('unit_level_label');if(!lc||!lc.IsValid())lc=ctx.FindChildTraverse('LevelContainer');if(lc&&(!wr||!wr.IsValid()))wr=fER(lc);return ll&&lc&&wr}
function uLT(){if(!cLU())return;var t='';try{t=ll.text||ll.GetAttributeString('text','')||''}catch(e){t=''}if(!t||t.charCodeAt(0)===123)return;var lv=pLv(t);if(lv===lLv||!lv)return;lLv=lv;for(var i=0;i<4;i++)wr.RemoveClass(LC_[i]);for(var i=3;i>=0;i--)if(lv>=LT_[i]){wr.AddClass(LC_[i]);break}}
function lL(){uLT();$.Schedule(0.5,lL)}
gL();lL()})();
