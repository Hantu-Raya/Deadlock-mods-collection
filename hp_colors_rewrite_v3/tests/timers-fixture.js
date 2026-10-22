'use strict';
// Shared topbar/world timer fixture: the real Escape menu, topbar and world layouts wired through the
// sibling relay. Used by timers.test.js and by variant lanes that compose their own menu/topbar.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {loadLayout,createVmContext,runInVm,MockPanel,sourceRoot,latestPublishedConfig}=require('./boot-layout');
const evidence=[];
function setup(options={}) {
 // options.load: another composition of the Escape menu and topbar (variant lanes); options.decorateRow
 // adds variant-specific panels to each topbar player row; options.heroes maps a row name to the text of
 // its stock HeroName label ({s:hero_name}); options.topClass adds a class to the topbar root before boot.
 const load=options.load||loadLayout,menu=load('hud_escape_menu.xml'),top=load('citadel_hud_top_bar.xml'),world=loadLayout('unit_status_overlay_v2.xml',{skipScripts:options.noHook?['hp_colors_v3_timers','hp_colors_v3_timers_world']:[]});
 const all=[menu,top,world],traffic=[];
 function broadcast(raw){const message=JSON.parse(raw);traffic.push(message);for(const b of all){if(b===top&&message.magic==='HP_COLORS_V3_CONFIG'&&options.dropTopConfig&&options.dropTopConfig())continue;for(const e of [...b.harness.handlerEntries])if(e.channel==='ClientUI_FireOutput')e.fn(raw);}}
 for(const b of [menu,top])b.harness.$.DispatchEvent=(event,raw)=>{b.harness.dispatches.push([event,raw]);if(event==='ClientUI_FireOutput')broadcast(raw);return true;};
 const h=world.harness,r=h.contextPanel;r.type=r.paneltype='ClientUIDialogPanel';h.root.id='world-carrier';h.root.classes=['CLASS_PLAYER','enemy'];
 const name=r.FindChild('name');name.text='REMOTE';
 for(const panel of [r,r.FindChild('UnitStatus'),r.FindChildTraverse('InfoHealthContainer'),r.FindChildTraverse('UnitHealthbarsContainer'),r.FindChild('HPColorsV3MotionFrame'),r.FindChildTraverse('HPColorsV3ReadoutAnchor')]){panel.actuallayoutwidth=200;panel.actuallayoutheight=210;panel.actualuiscale_x=panel.actualuiscale_y=1;}
 const primary=r.FindChildTraverse('UnitHealthbar'),inner=primary.FindChild('UnitHealthbarInner'),fill=inner.FindChild('unit_healthbar_lagging');primary.actuallayoutwidth=79;primary.actuallayoutheight=18;inner.actuallayoutwidth=69;inner.actuallayoutheight=12;fill.actuallayoutwidth=69;fill.style.clip='rect(0%, 70%, 100%, 0%)';
 const bg=r.FindChildTraverse('unit_info_bg'),ready=bg.FindChild('unit_ult_ready_icon');bg.style.preTransformScale2d='0.85';ready.visible=false;
 const container=new MockPanel('Panel',r.FindChild('StatusEffects'),'StatusEffectContainer'),icon=new MockPanel('Panel',container,'native');icon.AddClass('gunpower_pickup');icon.style.width='17px';
 const border=new MockPanel('Panel',icon,'StatusEffectsBorder');border.style.clip='radial(50% 50%, 0deg, -300deg)';new MockPanel('Panel',icon,'StatusEffectInner');new MockPanel('Image',icon,'StatusEffectImage');
 const flame=r.FindChild('KillStreakIndicator');flame.style.preTransformScale2d='0.75';
 const create=h.$.CreatePanel;h.$.CreatePanel=(type,parent,id)=>{const p=create(type,parent,id);p.BLoadLayout=()=>{const ctx=createVmContext(h);ctx.$={...h.$,GetContextPanel:()=>p,DispatchEvent(event,raw){assert.equal(event,'ClientUI_FireOutput');assert.ok(p.GetParent()===r.GetParent(),'sibling dispatch');broadcast(raw);return true;}};runInVm(fs.readFileSync(path.join(sourceRoot,'panorama/scripts/hp_colors_v3_bridge.js'),'utf8'),ctx);return true;};return p;};
 h.$.DispatchEvent=(event,p)=>{assert.equal(event,'Activated','world never emits FireOutput');p.events.onactivate();return true;};
 function row(n,local=false){const owner=new MockPanel('CitadelHudTopBarPlayer',top.harness.contextPanel,n);if(local)owner.AddClass('LocalPlayer');owner.AddClass('UltimateUnlocked');if(options.decorateRow)options.decorateRow(owner,n);const label=new MockPanel('Label',owner,'PlayerName');label.AddClass('PlayerName');label.text=n;if(options.heroes&&options.heroes[n]){const hero=new MockPanel('Label',owner,'');hero.AddClass('HeroName');hero.text=options.heroes[n];}const holder=new MockPanel('Panel',owner,'UltimateHolder'),ult=new MockPanel('Panel',holder,'UltimateStatus'),radial=new MockPanel('Panel',ult,'UltimateStatusBG');radial.style.clip='radial(50% 50%, 0deg, 90deg)';const cooldown=new MockPanel('Label',holder,'UltimateCooldownTextShown');cooldown.style.horizontalAlign='right';return {owner,label,holder,ult,radial,cooldown};}
 const remote=row('REMOTE'),local=row('LOCAL',true);top.harness.root.AddClass('isDefaultMap');top.harness.contextPanel.FindChildTraverse('GameTime').text='5:01';const pause=new MockPanel('Panel',top.harness.root,'PausedGameContainer');
 if(options.topClass)top.harness.contextPanel.AddClass(options.topClass);menu.includeScripts();menu.onload();world.includeScripts();if(!options.noTopBoot)top.includeScripts();broadcast(JSON.stringify(latestPublishedConfig(menu.harness)));
 function advance(ms){
  const end=h.now+ms;
  for(let i=0;i<20000;i++){
   const next=all.map(b=>({b,job:b.harness.scheduler.jobs.slice().sort((a,b)=>a.due-b.due)[0]})).filter(x=>x.job&&x.job.due<=end).sort((a,b)=>a.job.due-b.job.due)[0];
   if(!next)break;for(const b of all)b.harness.now=Math.max(b.harness.now,next.job.due);next.b.harness.scheduler.runNext();
  }
  for(const b of all)b.harness.now=end;
 }
 function edit(key,value){const row=menu.harness.$.HPColorsV3Settings.controls.find(x=>x.key===key&&(x.side==='shared'||x.side==='enemy'));assert.ok(row,key);const p=menu.harness.contextPanel.FindChildTraverse(row.type==='boolean'?row.toggleId:row.type==='color'?row.hexId:row.type==='number'?row.entryId:row.options.find(x=>x.value===value).id);if(row.type==='boolean'){if(p.BHasClass('Checked')!==value)p.events.onactivate();}else if(row.type==='enum')p.events.onactivate();else{p.text=String(value);p.events.ontextentrysubmit();}}
 const fixture={menu,top,world,h,r,name,bg,ready,container,icon,border,flame,remote,local,pause,traffic,broadcast,advance,edit};
 evidence.push(()=>({hook:!options.noHook,messages:traffic.filter(m=>m.magic!=='HP_COLORS_V3_CONFIG'&&m.magic!=='HPV3_CONFIG_REQUEST'),
  panels:{pickupWidth:icon.style.width,badgeScale:bg.style.preTransformScale2d,flameScale:flame.style.preTransformScale2d,ultimateParent:remote.ult.GetParent()?.id},
  listeners:{world:h.handlerEntries.length,topbar:top.harness.handlerEntries.length},jobs:{world:h.scheduler.jobs.length,topbar:top.harness.scheduler.jobs.length}}));
 return fixture;
}
function ring(f){return f.remote.owner.FindChildTraverse('HPColorsV3Pickup0Progress');}
module.exports={setup,ring,evidence};
