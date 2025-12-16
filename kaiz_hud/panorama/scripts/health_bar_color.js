(()=>{"use strict";
const UI={hb:null,pl:null,lbl:null},CLS=["health_white","health_yellow","health_orange","health_red"];
let rdy=0,last=null;
function boot(){
  if(rdy)return;
  const hb=$("#health_bar");
  if(!hb)return;
  UI.hb=hb;
  const n=hb.GetChildCount();
  for(let i=0;i<n;i++){const c=hb.GetChild(i);if(c?.BHasClass?.("ProgressBarLeft")){UI.pl=c;break;}}
  if(!UI.pl)return;
  UI.lbl=hb.FindChildTraverse("current_health");
  rdy=1;
}
function pct(){
  const h=UI.pl.actuallayoutheight,c=UI.pl.GetParent().actuallayoutheight;
  return c>0?(h/c)*100:100;
}
function set(cls){
  if(last===cls)return;
  const hb=UI.hb,lbl=UI.lbl;
  for(let i=0;i<4;i++)hb.RemoveClass(CLS[i]);
  if(cls)hb.AddClass(cls);
  if(lbl){for(let i=0;i<4;i++)lbl.RemoveClass(CLS[i]);if(cls)lbl.AddClass(cls);}
  last=cls;
}
function run(){
  if(!rdy){boot();if(!rdy)return $.Schedule(0.1,run);}
  const p=pct();
  set(p<28?"health_red":p<50?"health_orange":p<65?"health_yellow":"health_white");
  $.Schedule(0.05,run);
}
boot();run();
})();
