'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {runInVm,MockPanel,sourceRoot,latestPublishedConfig}=require('./boot-layout');
const {setup,ring,evidence}=require('./timers-fixture');
test.after(()=>{
 const root=path.resolve(__dirname,'../.build/evidence/timers',process.env.HPV3_DEBUG==='1'?'debug':'release');fs.mkdirSync(root,{recursive:true});
 fs.writeFileSync(path.join(root,'timers-transcript.json'),JSON.stringify(evidence.map(capture=>capture()),null,2));
});
test('native samples publish through sibling relay to countdown and world ultimate progress',()=>{
 const f=setup();f.advance(3000);f.border.style.clip='radial(50% 50%, 0deg, -270deg)';f.remote.radial.style.clip='radial(50% 50%, 0deg, 120deg)';f.advance(3000);f.border.style.clip='radial(50% 50%, 0deg, -240deg)';f.advance(3000);
 assert.ok(f.traffic.some(x=>x.magic==='HPV3_PICKUP_SNAPSHOT'&&x.record&&x.record.progress[0].rate>0));assert.ok(!f.traffic.some(x=>JSON.stringify(x).includes('HPV2_')));
 assert.ok(ring(f));const before=ring(f).style.clip;f.advance(1000);assert.notEqual(ring(f).style.clip,before);
 const progress=f.r.FindChildTraverse('HPColorsV3UltimateFill');assert.ok(progress);assert.notEqual(progress.style.clip,'radial(50% 50%, 0deg, 0deg)');
 f.edit('ultimateTimerColorMode','fixed');f.edit('ultimateTimerUnavailableColor','#123456');assert.equal(progress.style.washColor,'#123456');
 f.edit('ultSize',30);assert.equal(f.bg.style.preTransformScale2d,'1.5');assert.equal(f.flame.style.preTransformScale2d,'1.5');
 f.edit('ultimateTimerEnabled',false);assert.equal(f.bg.style.preTransformScale2d,'0.85');assert.equal(f.flame.style.preTransformScale2d,'0.75');assert.equal(f.r.FindChildTraverse('HPColorsV3UltimateOverlay').style.visibility,'collapse');
 f.edit('pickupTimersEnabled',false);assert.ok(f.remote.ult.GetParent()===f.remote.holder);assert.equal(f.remote.cooldown.style.horizontalAlign,'right');assert.equal(f.border.style.washColor||'','');
});
test('scan gate, local exclusion, stale gates and hook-only parsing',()=>{
 const f=setup();f.top.harness.contextPanel.FindChildTraverse('GameTime').text='1:00';f.advance(5000);assert.equal(f.border.style.washColor||'','');assert.ok(!ring(f)||ring(f).style.visibility==='collapse');
 const g=f.traffic.filter(x=>x.magic==='HPV3_PICKUP_SCAN_GATE').at(-1);assert.equal(g.scan,false);assert.equal(g.localName,'LOCAL');
 f.broadcast(JSON.stringify({...g,at:f.h.now,since:g.since,scan:true,localName:'REMOTE'}));f.top.harness.$.HPColorsV3Timers.stop();f.advance(3000);assert.equal(f.border.style.washColor||'','');
 f.top.harness.$.HPColorsV3Timers.stop();f.advance(16000);assert.equal(f.border.style.washColor,'#FFEFD7','stale control fails open');
 const no=setup({noHook:true});const parses=no.world.context.JSON.parse;let count=0;no.world.context.JSON={...JSON,parse(raw){count++;return parses(raw);}};
 for(const localName of ['REMOTE','HP_COLORS_V3_CONFIG'])no.broadcast(JSON.stringify({magic:'HPV3_PICKUP_SCAN_GATE',scan:false,localName,since:0,at:0}));
 assert.equal(count,0);assert.equal(no.border.style.washColor,'#FFEFD7');
});
test('pause, expiry, malformed/replayed snapshots and lifecycle restore native topbar',()=>{
 const f=setup();f.advance(9000);const sent=f.traffic.filter(x=>x.magic==='HPV3_PICKUP_SNAPSHOT'&&x.record).at(-1);f.world.harness.$.HPColorsV3Timers.stop();const running={...sent,seq:sent.seq+2,at:f.h.now,record:{...sent.record,at:f.h.now,progress:[{angle:-240,rate:10,at:f.h.now},null,null,null]}};f.broadcast(JSON.stringify(running));f.advance(1000);const before=ring(f).style.clip;
 f.pause.AddClass('gameIsPaused');f.advance(1000);const paused=ring(f).style.clip;f.advance(3000);assert.equal(ring(f).style.clip,paused);f.pause.RemoveClass('gameIsPaused');f.advance(5000);assert.notEqual(ring(f).style.clip,paused);
 f.broadcast(JSON.stringify({...running,seq:running.seq+1,record:{...running.record,mask:16}}));assert.equal(f.remote.ult.GetParent().id,'HPColorsV3PickupIndicators');
 f.world.harness.$.HPColorsV3Timers.stop();f.advance(30000);assert.ok(f.remote.ult.GetParent()===f.remote.holder,'expired record releases native ultimate');
 f.broadcast(JSON.stringify(running));assert.ok(f.remote.ult.GetParent()===f.remote.holder,'stale record refused');
 f.top.harness.$.HPColorsV3Timers.stop();f.top.includeScripts();assert.equal(f.top.harness.handlerEntries.filter(x=>x.channel==='ClientUI_FireOutput').length,1);
 f.edit('enabled',false);assert.equal(f.bg.style.preTransformScale2d,'0.85');assert.equal(f.border.style.washColor||'','');assert.ok(f.remote.ult.GetParent()===f.remote.holder);
 assert.notEqual(before,undefined);
});

test('row identity, duplicate sources, ready/dead states, invalid traffic and module teardown fail closed',()=>{
 const f=setup();f.advance(6000);const packet=f.traffic.filter(x=>x.magic==='HPV3_PICKUP_SNAPSHOT'&&x.record).at(-1);
 f.broadcast(JSON.stringify({...packet,source:'second'}));f.broadcast(JSON.stringify({...packet,source:'third'}));assert.ok(f.remote.ult.GetParent()===f.remote.holder,'three sources cannot resolve an ambiguous name');
 f.advance(30000);assert.equal(f.remote.ult.GetParent().id,'HPColorsV3PickupIndicators','expired conflicting sources permit a fresh unique source');
 const base=f.traffic.filter(x=>x.magic==='HPV3_PICKUP_SNAPSHOT'&&x.record).at(-1);
 f.remote.owner.AddClass('Dead');f.advance(5000);assert.ok(f.remote.ult.GetParent()===f.remote.holder);
 f.world.harness.$.HPColorsV3Timers.stop();f.remote.owner.RemoveClass('Dead');f.advance(1000);f.broadcast(JSON.stringify(base));assert.ok(f.remote.ult.GetParent()===f.remote.holder,'pre-respawn observation is rejected');
 const timer=f.world.tree.children.find(node=>node.tag==='scripts').children.find(node=>/\/hp_colors_v3_timers(?:_world)?\.vjs_c$/.test(node.attrs.src)).attrs.src.replace('s2r://','').replace('.vjs_c','.js');
 runInVm(fs.readFileSync(path.join(sourceRoot,timer),'utf8'),f.world.context);f.advance(6000);assert.equal(f.remote.ult.GetParent().id,'HPColorsV3PickupIndicators');
 f.remote.label.text='RENAMED';f.advance(5000);assert.ok(f.remote.ult.GetParent()===f.remote.holder);
 const overlay=f.r.FindChildTraverse('HPColorsV3UltimateOverlay');assert.ok(overlay);
 f.ready.visible=true;f.advance(1000);assert.equal(overlay.style.visibility,'collapse','native ready state wins immediately');
 f.ready.visible=false;f.name.text='DIFFERENT';f.advance(1000);assert.equal(overlay.style.visibility,'collapse','old identity cannot paint the new world name');
 for(const data of [{magic:'HPV2_PICKUP_SCAN_GATE',scan:false,localName:'RENAMED',since:0,at:f.h.now},{magic:'HPV3_ULTIMATE_SNAPSHOT',since:0,at:f.h.now+1,players:[['RENAMED',90,2]]},{magic:'HPV3_ULTIMATE_SNAPSHOT',since:0,at:f.h.now,players:[['RENAMED',90,2],['RENAMED',120,2]]}])f.broadcast(JSON.stringify(data));
 assert.equal(overlay.style.visibility,'collapse');
 f.world.harness.$.HPColorsV3Timers.stop();f.advance(150);assert.equal(f.border.style.washColor||'','');
 f.top.harness.$.HPColorsV3Timers.stop();assert.ok(f.remote.ult.GetParent()===f.remote.holder);assert.equal(f.top.harness.scheduler.jobs.length,0);
 f.world.harness.$.HPColorsV3Renderer.stop();assert.equal(f.world.harness.scheduler.jobs.length,0);
});

test('renderer stop cancels the independent world module and releases its sibling relay',()=>{
 const f=setup();f.advance(6000);f.world.harness.$.HPColorsV3Renderer.stop();
 assert.equal(f.world.harness.scheduler.jobs.length,0);
 assert.ok(!f.h.root.FindChild('HPColorsV3EventRelay'),'no release publication recreates a relay after teardown');
 assert.equal(f.border.style.washColor||'','');assert.equal(f.bg.style.preTransformScale2d,'0.85');
});

test('topbar pickup wings retain v2 slot ordering and shared colors/size as masks change',()=>{
 const f=setup();f.advance(6000);const base=f.traffic.filter(x=>x.magic==='HPV3_PICKUP_SNAPSHOT'&&x.record).at(-1);
 f.h.$.HPColorsV3Timers.stop();let seq=0;
 for(const mask of [13,7,15,3,5,1,15,12,15,6,9,15]) {
  f.broadcast(JSON.stringify({...base,source:'manual',instance:'manual',seq:++seq,at:f.h.now,record:{name:'REMOTE',mask,at:f.h.now,progress:[null,null,null,null]}}));
  const bits=[0,1,2,3].filter(bit=>mask&(1<<bit)),half=Math.ceil(bits.length/2);
  for(const [wing,wanted] of [['Left',bits.slice(0,half)],['Right',bits.slice(half)]]) {
   const children=f.remote.owner.FindChildTraverse('HPColorsV3Pickup'+wing).Children().filter(p=>p.style.visibility==='visible').map(p=>Number(p.id.slice(-1)));
   assert.deepEqual(children,wanted,'balanced '+wing+' for mask '+mask);
  }
 }
 f.edit('pickupSize',32);f.edit('pickupGunColor','#204080');f.edit('pickupBackgroundDarkness',50);f.edit('pickupGlyphColor','#123456');f.edit('pickupSpacing',4);
 const icon=f.remote.owner.FindChildTraverse('HPColorsV3Pickup0');assert.equal(icon.style.width,'32px');assert.equal(icon.style.backgroundColor,'#102040');assert.equal(icon.style.margin,'0px 4px');
 assert.equal(icon.FindChild('HPColorsV3Pickup0Glyph').style.washColor,'#123456');
 assert.equal(icon.FindChild('HPColorsV3Pickup0Progress').style.washColor,'#204080');
 f.edit('enabled',false);assert.ok(f.remote.ult.GetParent()===f.remote.holder);assert.equal(f.remote.cooldown.style.horizontalAlign,'right');
 assert.equal(f.top.harness.scheduler.jobs.length,0,'master-off leaves no HUD timer/discovery loop');
});

test('world carrier replacement clears the old source before publishing the new identity',()=>{
 const f=setup();f.advance(6000);f.h.root.id='replacement-carrier';f.advance(3300);
 const packets=f.traffic.filter(x=>x.magic==='HPV3_PICKUP_SNAPSHOT');
 assert.ok(packets.some(x=>x.source==='world-carrier'&&x.record===null));
 assert.equal(packets.filter(x=>x.record).at(-1).source,'replacement-carrier');
 assert.equal(f.remote.ult.GetParent().id,'HPColorsV3PickupIndicators','old source does not create duplicate-name ambiguity');
});

test('late HUD configuration retries the real menu request seam without an edit or duplicate listener',()=>{
 let drop=true;const f=setup({dropTopConfig:()=>drop});f.advance(5000);assert.ok(!ring(f));
 drop=false;f.advance(9000);assert.ok(ring(f));assert.equal(f.remote.ult.GetParent().id,'HPColorsV3PickupIndicators');
 assert.equal(f.top.harness.handlerEntries.filter(x=>x.channel==='ClientUI_FireOutput').length,1);
 f.top.harness.$.HPColorsV3Timers.stop();assert.equal(f.top.harness.scheduler.jobs.length,0);
});

test('frozen world ultimate models paint once without a 1Hz progress job and still expire',()=>{
 const f=setup();f.advance(2100);const fill=f.r.FindChildTraverse('HPColorsV3UltimateFill');assert.ok(fill);
 assert.equal(f.h.scheduler.jobs.filter(job=>job.delay===1).length,0,'zero-rate progress sleeps on the existing 3s lifecycle cadence');
 f.top.harness.$.HPColorsV3Timers.stop();f.advance(15000);
 assert.equal(f.r.FindChildTraverse('HPColorsV3UltimateOverlay').style.visibility,'collapse');
});

test('HUD script reinclusion replaces its owned artwork pool without leaking duplicate panels',()=>{
 const f=setup();f.advance(6000);
 const count=p=>(p.id==='HPColorsV3PickupIndicators'?1:0)+p.Children().reduce((sum,child)=>sum+count(child),0);
 for(let i=0;i<3;i++){f.top.includeScripts();f.advance(6500);assert.equal(count(f.remote.owner),1);assert.equal(f.remote.ult.GetParent().id,'HPColorsV3PickupIndicators');}
 f.top.harness.$.HPColorsV3Timers.stop();assert.equal(count(f.remote.owner),0);assert.ok(f.remote.ult.GetParent()===f.remote.holder);
});

test('a native world-name race releases timer facts and retries on the existing 3s cadence',()=>{
 const f=setup();f.advance(6000);let broken=true;
 Object.defineProperty(f.name,'text',{configurable:true,get(){if(broken)throw new Error('native name race');return 'REMOTE';}});
 assert.doesNotThrow(()=>f.advance(3300));assert.equal(f.border.style.washColor||'','');
 broken=false;f.advance(6600);assert.equal(f.border.style.washColor,'#FFEFD7');assert.equal(f.remote.ult.GetParent().id,'HPColorsV3PickupIndicators');
});

// citadel_unit_status_hero_name_mode 1 ("Name shown above hero health bars. 0: player name, 1: hero name,
// 2: none", client.dll) titles world bars with the hero name, as in the Street Brawl report (2026-10-19,
// world bar "Drifter"). The topbar row still carries the player name, with the hero in its HeroName label.
// Hero matching is opt-in through the topbar root class HPColorsV3TimersHeroNames (QOLLOCK's composed
// topbar, ticket 39); the canonical and ShowRank topbars keep player-name matching only.
function heroTitled(options){
 const f=setup({heroes:{REMOTE:'Drifter',LOCAL:'Abrams'},...options});f.name.text='Drifter';
 f.top.harness.root.AddClass('gamemode_streetbrawl');f.top.harness.contextPanel.FindChildTraverse('GameTime').text='0:09';
 f.advance(3000);f.border.style.clip='radial(50% 50%, 0deg, -270deg)';f.remote.radial.style.clip='radial(50% 50%, 0deg, 120deg)';f.advance(3000);f.border.style.clip='radial(50% 50%, 0deg, -240deg)';f.advance(3000);
 return f;
}
test('ticket 39: without the opt-in class a hero-titled world bar keeps the player-name-only behavior and wire',()=>{
 assert.ok(!fs.readFileSync(path.join(sourceRoot,'panorama/layout/citadel_hud_top_bar.xml'),'utf8').includes('HPColorsV3TimersHeroNames'),'canonical topbar does not opt in');
 const f=heroTitled();
 const sent=f.traffic.filter(x=>x.magic==='HPV3_ULTIMATE_SNAPSHOT').at(-1);assert.deepEqual(sent.players.map(p=>p.length),[3]);assert.equal(sent.players[0][0],'REMOTE');
 assert.ok(f.traffic.filter(x=>x.magic==='HPV3_PICKUP_SCAN_GATE').every(g=>!('localHero' in g)),'no localHero on the gate');
 const overlay=f.r.FindChildTraverse('HPColorsV3UltimateOverlay');assert.equal(overlay?.style.visibility||'collapse','collapse','no progress on a bar whose title is not a player name');
 assert.ok(!ring(f)||ring(f).style.visibility==='collapse','no topbar pickup ring for the hero-titled record');
});
test('ticket 39: with HPColorsV3TimersHeroNames, hero-titled world bars match by hero name; the local hero stays excluded',()=>{
 const f=heroTitled({topClass:'HPColorsV3TimersHeroNames'});
 const sent=f.traffic.filter(x=>x.magic==='HPV3_ULTIMATE_SNAPSHOT').at(-1);assert.deepEqual(sent.players.map(p=>[p[0],p[3]]),[['REMOTE','DRIFTER']]);
 assert.equal(f.traffic.filter(x=>x.magic==='HPV3_PICKUP_SCAN_GATE').at(-1).localHero,'ABRAMS');
 const overlay=f.r.FindChildTraverse('HPColorsV3UltimateOverlay'),progress=f.r.FindChildTraverse('HPColorsV3UltimateFill');
 assert.ok(overlay&&progress,'world ultimate progress is built');assert.notEqual(overlay.style.visibility,'collapse','world ultimate progress shows on the hero-titled bar');
 assert.notEqual(progress.style.clip,'radial(50% 50%, 0deg, 0deg)');
 assert.ok(ring(f),'the hero-titled world pickup reaches the topbar row');assert.equal(f.remote.ult.GetParent().id,'HPColorsV3PickupIndicators');
 f.name.text='Abrams';f.advance(3500);
 assert.equal(overlay.style.visibility,'collapse','a bar titled with the local hero gets no ultimate progress');
 assert.equal(f.border.style.washColor||'','','a bar titled with the local hero keeps stock pickups');
});

test('topbar override without the v3 module fails closed for world pickups and ultimate progress',()=>{
 const f=setup({noTopBoot:true});f.advance(18000);
 assert.equal(f.border.style.washColor||'','');
 const health=f.r.FindChildTraverse('unit_healthbar_lagging');health.style.clip='rect(0%, 10%, 100%, 0%)';f.advance(300);
 assert.equal(health.style.washColor,'#FD4949','missing topbar never stops health-bar rendering');
 f.broadcast(JSON.stringify({magic:'HPV3_ULTIMATE_SNAPSHOT',since:0,at:f.h.now,players:[['REMOTE',180,2]]}));
 assert.equal(f.r.FindChildTraverse('HPColorsV3UltimateOverlay')?.style.visibility||'collapse','collapse');
 f.top.includeScripts();f.advance(3100);
 assert.equal(f.border.style.washColor,'#FFEFD7','booted topbar opens the authorized world scan');
});

test('world samples newly arrived pickups within one 3s interval, not two independent scans',()=>{
 const f=setup();f.advance(3050);
 const icon=new MockPanel('Panel',f.container,'late');icon.AddClass('movement_pickup');
 new MockPanel('Panel',icon,'StatusEffectInner');
 const border=new MockPanel('Panel',icon,'StatusEffectsBorder');border.style.clip='radial(50% 50%, 0deg, -250deg)';
 new MockPanel('Image',icon,'StatusEffectImage');f.advance(3000);
 const packet=f.traffic.filter(m=>m.magic==='HPV3_PICKUP_SNAPSHOT'&&m.record).at(-1);
 assert.equal(packet.record.mask,3);assert.equal(packet.record.progress[1].angle,-250);
});

for(const loop of ['discovery','ultimate','progress'])test('topbar '+loop+' loop survives a transient native exception without a config edit',()=>{
 const f=setup();f.advance(6000);
 if(loop==='progress'){
  const base=f.traffic.filter(m=>m.magic==='HPV3_PICKUP_SNAPSHOT'&&m.record).at(-1);
  f.h.$.HPColorsV3Timers.stop();
  f.broadcast(JSON.stringify({...base,seq:base.seq+2,at:f.h.now,record:{...base.record,at:f.h.now,progress:[{angle:-240,rate:10,at:f.h.now},null,null,null]}}));
 }
 let failures=0;
 const panel=loop==='discovery'?f.top.harness.contextPanel:f.remote.owner;
 const key=loop==='discovery'?'FindChildrenWithClassTraverse':'BHasClass',original=panel[key].bind(panel);
 panel[key]=name=>{
  if(failures===0&&(loop==='discovery'||name===(loop==='ultimate'?'UltimateUnlocked':'Dead'))){failures++;throw new Error('transient '+loop);}
  return original(name);
 };
 assert.doesNotThrow(()=>f.advance(loop==='discovery'?4100:1100));
 assert.equal(failures,1);
 const before=loop==='progress'?ring(f).style.clip:f.traffic.filter(m=>m.magic===(loop==='ultimate'?'HPV3_ULTIMATE_SNAPSHOT':'HPV3_PICKUP_SCAN_GATE')).length;
 f.advance(loop==='discovery'?5100:3100);
 if(loop==='progress')assert.notEqual(ring(f).style.clip,before);
 else assert.ok(f.traffic.filter(m=>m.magic===(loop==='ultimate'?'HPV3_ULTIMATE_SNAPSHOT':'HPV3_PICKUP_SCAN_GATE')).length>before);
 f.edit('enabled',false);assert.equal(f.top.harness.scheduler.jobs.length,0,'recovery jobs cancel on master-off');
});

test('missing pause panel is searched only by the 5s discovery loop',()=>{
 const f=setup();f.pause.DeleteAsync(0);
 const root=f.top.harness.root,find=root.FindChildTraverse.bind(root);let searches=0;
 root.FindChildTraverse=id=>{if(id==='PausedGameContainer')searches++;return find(id);};
 f.advance(4500);assert.equal(searches,0);
 f.advance(600);assert.equal(searches,1);
});

test('world ultimate gradient blends progress colors and follow mode honors a custom badge color',()=>{
 const f=setup();f.advance(3000);
 f.edit('ultimateTimerColorMode','gradient');f.edit('ultimateTimerUnavailableColor','#000000');f.edit('ultimateTimerAvailableColor','#FFFFFF');
 f.broadcast(JSON.stringify({magic:'HPV3_ULTIMATE_SNAPSHOT',since:0,at:f.h.now,players:[['REMOTE',180,0]]}));
 const fill=f.r.FindChildTraverse('HPColorsV3UltimateFill'),dark=f.r.FindChildTraverse('HPColorsV3UltimateDark'),overlay=f.r.FindChildTraverse('HPColorsV3UltimateOverlay');
 assert.equal(fill.style.washColor,'#808080');assert.equal(dark.style.washColor,'#808080');
 f.edit('ultMode','custom');f.edit('ultCustom','#123456');f.edit('ultimateTimerColorMode','follow');
 f.broadcast(JSON.stringify({magic:'HPV3_ULTIMATE_SNAPSHOT',since:0,at:f.h.now,players:[['REMOTE',180,0]]}));
 assert.equal(overlay.style.washColor,'#123456');assert.equal(fill.style.washColor,'#FFFFFF');
});

// 3.4.0 (user, 2026-10-29): the progress art is one vector SVG (stock icon_ultimate_off_blk eye inside the
// v3 ring), compiled from panorama/images/hpv3/ultimate_progress.svg, so it stays sharp at every badge size.
test('world ultimate progress draws the vector ring artwork on both layers',()=>{
 const f=setup();f.advance(3000);
 f.broadcast(JSON.stringify({magic:'HPV3_ULTIMATE_SNAPSHOT',since:0,at:f.h.now,players:[['REMOTE',180,0]]}));
 for(const id of ['HPColorsV3UltimateFill','HPColorsV3UltimateDark'])assert.equal(f.r.FindChildTraverse(id).src,'s2r://panorama/images/hpv3/ultimate_progress.vsvg');
 const root=process.env.HPV3_SOURCE_ROOT||require('node:path').join(__dirname,'..');
 const svg=require('node:fs').readFileSync(require('node:path').join(root,'panorama/images/hpv3/ultimate_progress.svg'),'utf8');
 assert.match(svg,/^<svg [^>]*viewBox="0 0 18 18"/);
});

test('finished pickup rings stop the 1s progress loop until another moving model arrives',()=>{
 const f=setup();f.advance(6000);
 const base=f.traffic.filter(m=>m.magic==='HPV3_PICKUP_SNAPSHOT'&&m.record).at(-1);
 f.h.$.HPColorsV3Timers.stop();f.edit('ultimateTimerEnabled',false);
 f.broadcast(JSON.stringify({...base,seq:base.seq+2,at:f.h.now,record:{...base.record,at:f.h.now,progress:[{angle:-1,rate:10,at:f.h.now},null,null,null]}}));
 f.advance(1100);assert.equal(ring(f).style.clip,'radial(50% 50%, 0deg, 0deg)');
 const text=Object.getOwnPropertyDescriptor(f.remote.label,'text');let reads=0;
 Object.defineProperty(f.remote.label,'text',{...text,get(){reads++;return text.get();}});
 f.advance(2000);assert.equal(reads,0,'completed rings do not poll rows between 5s discovery ticks');
 f.broadcast(JSON.stringify({...base,seq:base.seq+3,at:f.h.now,record:{...base.record,at:f.h.now,progress:[{angle:-120,rate:10,at:f.h.now},null,null,null]}}));
 const before=ring(f).style.clip;f.advance(1100);assert.notEqual(ring(f).style.clip,before,'new moving progress wakes the loop');
});

test('F3: renderer and topbar refuse retired epochs, including revision-zero startup and long replay history',()=>{
 const f=setup(),a=latestPublishedConfig(f.menu.harness);a.epoch='epoch-A';a.revision=10;
 f.broadcast(JSON.stringify(a));f.advance(6000);
 assert.equal(f.remote.ult.GetParent().id,'HPColorsV3PickupIndicators');
 const b=JSON.parse(JSON.stringify(a));b.epoch='epoch-B';b.revision=0;b.settings.shared.pickupTimersEnabled=false;b.settings.shared.ultimateTimerEnabled=false;
 f.broadcast(JSON.stringify(b));f.advance(150);
 assert.equal(f.h.$.HPColorsV3Renderer.status.epoch,'epoch-B');
 assert.equal(f.h.$.HPColorsV3Renderer.status.revision,0,'a fresh epoch may start at revision zero');
 assert.ok(f.remote.ult.GetParent()===f.remote.holder,'the new topbar epoch disables pickup work');
 const replay=()=>{
  const paints=f.h.$.HPColorsV3Renderer.status.fullPaints;
  f.broadcast(JSON.stringify(a));
  assert.equal(f.h.$.HPColorsV3Renderer.status.epoch,'epoch-B','retired renderer authority stays retired');
  assert.equal(f.h.$.HPColorsV3Renderer.status.fullPaints,paints,'replay causes no renderer paint');
  assert.equal(f.top.harness.scheduler.jobs.filter(j=>j.delay===5).length,0,'retired topbar authority cannot restart discovery');
  assert.ok(f.remote.ult.GetParent()===f.remote.holder);
 };
 replay();
 for(let i=0;i<40;i++){b.epoch='replacement-'+i;f.broadcast(JSON.stringify(b));}
 b.epoch='epoch-B-current';f.broadcast(JSON.stringify(b));
 // Check A independently in each consumer after more than 32 replacements.
 f.broadcast(JSON.stringify(a));
 assert.equal(f.h.$.HPColorsV3Renderer.status.epoch,b.epoch,'epoch history must not expire');
 assert.equal(f.top.harness.scheduler.jobs.filter(j=>j.delay===5).length,0,'topbar retirement history must not expire');
});

for(const consumer of ['renderer','topbar'])test('M4: '+consumer+' retains epoch authority across same-context script reinclusion',()=>{
 const f=setup(),a=latestPublishedConfig(f.menu.harness);a.epoch='epoch-A';a.revision=10;
 f.broadcast(JSON.stringify(a));
 const b=JSON.parse(JSON.stringify(a));b.epoch='epoch-B';b.revision=0;b.settings.shared.pickupTimersEnabled=false;b.settings.shared.ultimateTimerEnabled=false;
 f.broadcast(JSON.stringify(b));
 const reinclude=()=>{f.world.includeScripts();f.top.includeScripts();};
 const check=()=>{
  if(consumer==='renderer'){
   assert.equal(f.h.$.HPColorsV3Renderer.status.epoch,b.epoch,'retired renderer authority survives reinclusion');
   assert.equal(f.h.$.HPColorsV3Renderer.status.revision,b.revision);
  }else{
   assert.equal(f.top.harness.scheduler.jobs.filter(j=>j.delay===5).length,0,'retired topbar authority cannot restart discovery after reinclusion');
   assert.ok(f.remote.ult.GetParent()===f.remote.holder);
  }
 };
 reinclude();f.broadcast(JSON.stringify(b));f.broadcast(JSON.stringify(a));check();
 for(let i=0;i<40;i++){b.epoch='reinclusion-publisher-'+i;f.broadcast(JSON.stringify(b));}
 reinclude();f.broadcast(JSON.stringify(b));f.broadcast(JSON.stringify(a));check();
 // The current epoch's revision floor must survive even before its replacement script hydrates.
 b.revision=10;f.broadcast(JSON.stringify(b));reinclude();
 const stale=JSON.parse(JSON.stringify(b));stale.revision=9;stale.settings.shared.pickupTimersEnabled=true;
 f.broadcast(JSON.stringify(stale));
 if(consumer==='renderer')assert.notEqual(f.h.$.HPColorsV3Renderer.status.revision,9,'reinclusion retains the current revision floor before hydration');
 else assert.equal(f.top.harness.scheduler.jobs.filter(j=>j.delay===5).length,0,'an older current-epoch revision cannot start discovery before hydration');
 f.broadcast(JSON.stringify(b));check();
 // A real menu publisher reincarnation remains a legitimate new epoch at revision zero.
 f.menu.includeScripts();f.menu.onload();
 const fresh=latestPublishedConfig(f.menu.harness);assert.notEqual(fresh.epoch,b.epoch);assert.equal(fresh.revision,0);
 assert.equal(f.h.$.HPColorsV3Renderer.status.epoch,fresh.epoch);
 assert.equal(f.top.harness.scheduler.jobs.filter(j=>j.delay===5).length,1,'a new publisher can restart timer discovery');
});

test('F4: cancelled timer-facts wakes cannot clear or duplicate the restarted renderer loop',()=>{
 const f=setup({noHook:true,noTopBoot:true}),r=f.h.$.HPColorsV3Renderer;
 r.setTimerFacts({pickupAllowed:false,ultimateAngle:null});
 const wake=f.h.scheduler.jobs.find(j=>j.delay===0);assert.ok(wake);
 r.stop();r.start();f.broadcast(JSON.stringify(latestPublishedConfig(f.menu.harness)));
 const ticks=()=>f.h.scheduler.jobs.filter(j=>j.delay===0.15);
 assert.equal(ticks().length,1);
 const current=ticks()[0],paints=r.status.fullPaints;
 wake.fn();wake.fn();
 assert.equal(r.status.fullPaints,paints,'cancelled work cannot paint');
 assert.equal(ticks().length,1,'only one recurring tick');
 assert.ok(ticks()[0]===current,'the current job handle remains untouched');
 f.advance(1000);assert.equal(ticks().length,1);
 r.setTimerFacts({pickupAllowed:true,ultimateAngle:null});
 const replaced=f.h.scheduler.jobs.find(j=>j.delay===0);assert.ok(replaced);
 r.setTimerFacts({pickupAllowed:false,ultimateAngle:null});
 const replacement=f.h.scheduler.jobs.find(j=>j.delay===0);assert.ok(replacement!==replaced);
 replaced.fn();
 assert.ok(f.h.scheduler.jobs.includes(replacement),'same-generation replaced wake cannot erase its successor');
 f.advance(1000);assert.equal(ticks().length,1);
 r.stop();assert.equal(f.h.scheduler.jobs.length,0,'stop still owns and cancels the single live handle');
});

test('audit A2: replacing only a surviving card label retires its artwork pool',()=>{
 const f=setup();f.advance(6000);
 const count=p=>(p.id==='HPColorsV3PickupIndicators'?1:0)+p.children.reduce((sum,child)=>sum+count(child),0);
 for(let i=0;i<3;i++){
  f.remote.label.DeleteAsync(0);f.remote.label=new MockPanel('Label',f.remote.owner,'PlayerName');f.remote.label.AddClass('PlayerName');f.remote.label.text='REMOTE';
  f.advance(6000);assert.equal(count(f.remote.owner),1,'one pool after label replacement');
 }
 f.top.harness.$.HPColorsV3Timers.stop();assert.equal(count(f.remote.owner),0);assert.ok(f.remote.ult.GetParent()===f.remote.holder);
});
test('audit A2: failed native restoration retains its container and retries after stop',()=>{
 const f=setup();f.advance(6000);const container=f.remote.ult.GetParent(),setParent=f.remote.ult.SetParent.bind(f.remote.ult);
 let fail=true;f.remote.ult.SetParent=parent=>{if(fail)throw Error('native restoration race');return setParent(parent);};
 f.top.harness.$.HPColorsV3Timers.stop();assert.ok(container.valid);assert.ok(f.remote.ult.GetParent()===container);
 fail=false;f.advance(1100);assert.ok(f.remote.ult.GetParent()===f.remote.holder);assert.equal(container.valid,false);
 assert.equal(f.top.harness.scheduler.jobs.length,0,'cleanup stops after successful restoration');
});

test('audit A3: a late cancelled discovery cannot erase or duplicate its replacement',()=>{
 const f=setup();f.advance(6000);const h=f.top.harness,old=h.scheduler.jobs.find(job=>job.delay===5);assert.ok(old);
 f.edit('pickupTimersEnabled',false);f.edit('ultimateTimerEnabled',false);f.edit('pickupTimersEnabled',true);
 const next=h.scheduler.jobs.find(job=>job.delay===5);assert.ok(next&&next!==old);old.fn();
 assert.equal(h.scheduler.jobs.filter(job=>job.delay===5).length,1);assert.ok(h.scheduler.jobs.includes(next));
 f.top.harness.$.HPColorsV3Timers.stop();assert.equal(h.scheduler.jobs.length,0,'stop still cancels the owned discovery');
 old.fn();assert.equal(h.scheduler.jobs.length,0);
});

test('audit A2: reinclusion waits for an old failed restoration instead of nesting native ownership',()=>{
 const f=setup();f.advance(6000);const container=f.remote.ult.GetParent(),setParent=f.remote.ult.SetParent.bind(f.remote.ult);
 let fail=true;f.remote.ult.SetParent=parent=>{if(fail&&parent===f.remote.holder)throw Error('native restoration race');return setParent(parent);};
 const packet=f.traffic.filter(m=>m.magic==='HPV3_PICKUP_SNAPSHOT'&&m.record).at(-1);
 f.top.includeScripts();f.advance(200);
 f.broadcast(JSON.stringify({...packet,seq:packet.seq+100,at:f.h.now,record:{...packet.record,at:f.h.now}}));
 assert.ok(f.remote.ult.GetParent()===container,'new owner waits while the native ultimate is still leased by cleanup');
 fail=false;f.advance(1100);assert.ok(f.remote.ult.valid,'old cleanup never deletes the native ultimate');
 f.advance(6000);assert.equal(f.remote.ult.GetParent().id,'HPColorsV3PickupIndicators');
 f.top.harness.$.HPColorsV3Timers.stop();assert.ok(f.remote.ult.GetParent()===f.remote.holder);
 assert.equal(container.valid,false);
});

test('audit A2: retiring a replaced label keeps retrying after both timers are disabled',()=>{
 const f=setup();f.advance(6000);const container=f.remote.ult.GetParent(),setParent=f.remote.ult.SetParent.bind(f.remote.ult);
 let fail=true;f.remote.ult.SetParent=parent=>{if(fail)throw Error('native restoration race');return setParent(parent);};
 f.remote.label.DeleteAsync(0);f.remote.label=new MockPanel('Label',f.remote.owner,'PlayerName');f.remote.label.AddClass('PlayerName');f.remote.label.text='REMOTE';
 f.advance(4100);f.edit('pickupTimersEnabled',false);f.edit('ultimateTimerEnabled',false);
 assert.ok(container.valid);fail=false;f.advance(1100);
 assert.ok(f.remote.ult.GetParent()===f.remote.holder,'retirement cleanup is independent of enabled discovery');
 assert.equal(container.valid,false);assert.equal(f.top.harness.scheduler.jobs.length,0);
});
test('audit A2: partial restoration holds its whole lease across timer reinclusion',()=>{
 const f=setup();f.advance(6000);const container=f.remote.ult.GetParent(),style=f.remote.cooldown.style;
 let fail=true;f.remote.cooldown.style=new Proxy(style,{set(target,key,value){if(fail&&key==='horizontalAlign'&&value==='right')throw Error('native cooldown race');return Reflect.set(target,key,value);}});
 const packet=f.traffic.filter(m=>m.magic==='HPV3_PICKUP_SNAPSHOT'&&m.record).at(-1);
 f.top.includeScripts();f.advance(200);
 f.broadcast(JSON.stringify({...packet,seq:packet.seq+100,at:f.h.now,record:{...packet.record,at:f.h.now}}));
 assert.ok(f.remote.ult.GetParent()===f.remote.holder,'partial restoration still blocks a new artwork owner');
 fail=false;f.advance(1100);assert.equal(container.valid,false);assert.equal(f.remote.cooldown.style.horizontalAlign,'right');
 f.advance(6000);assert.equal(f.remote.ult.GetParent().id,'HPColorsV3PickupIndicators');assert.equal(f.remote.cooldown.style.horizontalAlign,'center');
 f.top.harness.$.HPColorsV3Timers.stop();assert.ok(f.remote.ult.GetParent()===f.remote.holder);
 assert.equal(f.remote.cooldown.style.horizontalAlign,'right','new incarnation captures the fully restored alignment');
});

test('audit A2: losing the artwork container does not discard the cooldown restoration lease',()=>{
 const f=setup();f.advance(6000);const container=f.remote.ult.GetParent();
 f.remote.ult.SetParent(f.remote.holder);container.DeleteAsync(0);f.top.harness.$.HPColorsV3Timers.stop();
 assert.equal(f.remote.cooldown.style.horizontalAlign,'right');
});
test('audit A2: replacing the native ultimate cannot bypass a pending cooldown lease on its card',()=>{
 const f=setup();f.advance(6000);const style=f.remote.cooldown.style;
 let fail=true;f.remote.cooldown.style=new Proxy(style,{set(target,key,value){if(fail&&key==='horizontalAlign'&&value==='right')throw Error('native cooldown race');return Reflect.set(target,key,value);}});
 const packet=f.traffic.filter(m=>m.magic==='HPV3_PICKUP_SNAPSHOT'&&m.record).at(-1);
 f.top.harness.$.HPColorsV3Timers.stop();f.remote.ult.DeleteAsync(0);f.remote.ult=new MockPanel('Panel',f.remote.holder,'UltimateStatus');
 f.top.includeScripts();f.advance(200);
 f.broadcast(JSON.stringify({...packet,seq:packet.seq+100,at:f.h.now,record:{...packet.record,at:f.h.now}}));
 assert.ok(f.remote.ult.GetParent()===f.remote.holder,'card ownership, not just ultimate identity, blocks a new lease');
 fail=false;f.advance(6100);assert.equal(f.remote.cooldown.style.horizontalAlign,'center');
 f.top.harness.$.HPColorsV3Timers.stop();assert.equal(f.remote.cooldown.style.horizontalAlign,'right');
});

test('audit A2: partial parent restoration retries native sibling order before deleting artwork',()=>{
 const f=setup();f.advance(6000);const container=f.remote.ult.GetParent(),move=f.remote.holder.MoveChildBefore.bind(f.remote.holder);
 let fail=true;f.remote.holder.MoveChildBefore=(child,before)=>{if(fail)throw Error('native order race');move(child,before);};
 f.top.harness.$.HPColorsV3Timers.stop();assert.ok(container.valid);fail=false;f.advance(1100);
 const siblings=f.remote.holder.children;assert.ok(siblings.indexOf(f.remote.ult)<siblings.indexOf(f.remote.cooldown));
 assert.equal(container.valid,false);
});

for(const mode of ['stop','rediscover'])test('audit review R1: replacement ultimate under owned artwork survives '+mode+' and restoration retry',()=>{
 const f=setup();f.advance(6000);const container=f.remote.ult.GetParent();
 f.remote.ult.DeleteAsync(0);const replacement=new MockPanel('Panel',container,'UltimateStatus'),setParent=replacement.SetParent.bind(replacement);
 let fail=true;replacement.SetParent=parent=>{if(fail&&parent===f.remote.holder)throw Error('replacement restoration race');return setParent(parent);};
 if(mode==='stop')f.top.harness.$.HPColorsV3Timers.stop();else f.edit('pickupTimersEnabled',false);
 assert.ok(container.valid,'failed replacement restoration cannot authorize deletion');
 assert.ok(replacement.GetParent()===container);
 fail=false;f.advance(1100);
 assert.ok(replacement.GetParent()===f.remote.holder,'current native descendant is restored through the old lease');
 assert.equal(container.valid,false,'artwork is deleted only after replacement restoration');
 assert.ok(replacement.valid);
});

// Cross-context protocol (B4). The topbar and world scripts run in different contexts and keep their own copies of
// the small helpers; these tests drive both real scripts through the real messages and compare what is observable.
const GATE='HPV3_PICKUP_SCAN_GATE',ULT='HPV3_ULTIMATE_SNAPSHOT',PICKUP='HPV3_PICKUP_SNAPSHOT';
const fillClip=f=>{const p=f.r.FindChildTraverse('HPColorsV3UltimateFill');return p?p.style.clip:'';};
const clipAngle=raw=>{const m=/^radial\(50% 50%, 0deg, (-?[\d.]+)deg\)$/.exec(raw);return m?Number(m[1]):null;};
test('protocol: every topbar snapshot is republished inside the window its consumer accepts it for',()=>{
 const f=setup();f.advance(40000);
 const gaps=magic=>{const at=f.traffic.filter(m=>m.magic===magic).map(m=>m.at);assert.ok(at.length>=3,magic);return Math.max(...at.slice(1).map((x,i)=>x-at[i]));};
 assert.ok(gaps(GATE)<15000,'gate: world accepts for 15 s');
 assert.ok(gaps(ULT)<12000,'ultimate: world accepts for 12 s');
 assert.ok(gaps(PICKUP)<24001,'pickup: topbar keeps a record for 24 s');
});
test('protocol: both contexts extrapolate an ultimate the same way (rate, 359.999 ceiling, 15 degree correction)',()=>{
 const f=setup();f.advance(3000);f.top.harness.$.HPColorsV3Timers.stop();
 for(const [angle,rate,seconds,expected] of [[100,30,1,130],[100,30,3,190],[350,30,1,359.999],[0,360,1,359.999],[200,0,2,200]]){
  f.broadcast(JSON.stringify({magic:ULT,since:0,at:f.h.now,players:[['REMOTE',angle,rate]]}));
  f.advance(seconds*1000);assert.equal(clipAngle(fillClip(f)),expected,angle+'@'+rate);
 }
 // The producer republishes early only when the world's extrapolation would drift 15 degrees or more.
 const drift=offset=>{const g=setup();g.advance(3000);let a=60;const sent=[];
  for(let i=0;i<4;i++){a+=30+(i===3?offset:0);g.remote.radial.style.clip='radial(50% 50%, 0deg, '+a+'deg)';const n=g.traffic.length;g.advance(1000);sent.push(g.traffic.slice(n).filter(m=>m.magic===ULT).length);}
  return sent;};
 assert.deepEqual(drift(0),[1,1,0,1],'on-trend samples wait for the 2 s heartbeat');
 assert.equal(drift(10)[3],1,'heartbeat second still sends');
 const quiet=drift(0),off=drift(10),jump=drift(20);assert.deepEqual(off,quiet,'under 15 degrees changes nothing');assert.ok(jump.reduce((a,b)=>a+b)>=quiet.reduce((a,b)=>a+b),'a 20 degree jump is republished');
});
test('protocol: name normalisation, radial parsing and freshness agree between topbar and world',()=>{
 // Names: the topbar publishes the card's trimmed upper-case text; the world matches its bar title the same way.
 for(const [card,bar,matched] of [['  remote ','Remote ',true],['REMOTE','remote',true],['{s:hero}','{s:hero}',false],['Remote','Other',false]]){
  const f=setup();f.top.harness.contextPanel.FindChildTraverse('GameTime').text='1:00';f.remote.label.text=card;f.name.text=bar;f.advance(4000);
  const sent=f.traffic.filter(m=>m.magic===ULT).at(-1);
  if(card.charAt(0)==='{')assert.ok(!sent||sent.players.length===0,'unresolved text is never a name');
  else assert.equal(sent.players[0][0],card.trim().toUpperCase());
  f.top.harness.$.HPColorsV3Timers.stop();
  f.broadcast(JSON.stringify({magic:ULT,since:0,at:f.h.now,players:[[card.trim().toUpperCase(),180,0]]}));
  assert.equal(clipAngle(fillClip(f))===180,matched,card+' / '+bar);
 }
 // Radial: ultimate clips are 0..360 on the topbar, pickup clips -360..0 on the world bar; both read one grammar.
 for(const [clip,top,world] of [['radial(50% 50%, 0deg, 120deg)',120,null],['radial(50.0%  50%, 0deg, -120.5deg)',null,-120.5],['radial(40% 50%, 0deg, 10deg)',null,null],['radial(50% 50%, 0deg, 361deg)',null,null],['radial(50% 50%, 0deg, -361deg)',null,null],['nonsense',null,null]]){
  const f=setup();f.advance(3000);f.remote.radial.style.clip=clip;let n=f.traffic.length;f.advance(1000);
  const ult=f.traffic.slice(n).filter(m=>m.magic===ULT).at(-1);assert.equal(ult&&ult.players.length?ult.players[0][1]:null,top,'topbar '+clip);
  f.border.style.clip=clip;n=f.traffic.length;f.advance(3100);
  const pick=f.traffic.slice(n).filter(m=>m.magic===PICKUP&&m.record).at(-1);assert.equal(pick?pick.record.progress[0]&&pick.record.progress[0].angle:null,world,'world '+clip);
 }
 // Freshness: a snapshot dated in the future or at/after the window is ignored by the world.
 for(const [offset,accepted] of [[0,true],[-11999,true],[-12000,false],[1,false]]){
  const f=setup();f.top.harness.$.HPColorsV3Timers.stop();f.advance(30000);
  f.broadcast(JSON.stringify({magic:GATE,scan:false,localName:'LOCAL',since:0,at:f.h.now}));
  f.broadcast(JSON.stringify({magic:ULT,since:0,at:f.h.now+offset,players:[['REMOTE',250,0]]}));f.advance(100);
  assert.equal(clipAngle(fillClip(f))===250,accepted,'offset '+offset);
 }
});
test('protocol: the topbar accepts a config envelope by the same rules as the renderer',()=>{
 const make=()=>{const f=setup({dropTopConfig:()=>true});f.advance(1000);const base=latestPublishedConfig(f.menu.harness);assert.ok(base);
  const gates=()=>f.traffic.filter(m=>m.magic===GATE).length;
  const send=(patch,raw)=>{const text=raw||JSON.stringify({...base,...patch}),before=gates();for(const e of [...f.top.harness.handlerEntries])if(e.channel==='ClientUI_FireOutput')e.fn(text);return gates()>before;};
  return {f,base,send};};
 let t=make();
 assert.equal(t.send({epoch:''},null),false,'empty epoch');
 assert.equal(t.send({epoch:'e'.repeat(129)}),false,'epoch over 128');
 assert.equal(t.send({epoch:'e'.repeat(128),revision:1}),true,'epoch of 128 is accepted');
 t=make();for(const revision of [-1,1.5,'3',NaN,Number.MAX_SAFE_INTEGER+2])assert.equal(t.send({epoch:'a',revision}),false,'revision '+revision);
 assert.equal(t.send({epoch:'a',revision:1,magic:'HP_COLORS_V3_CONFIGX'}),false,'wrong magic');
 const big=JSON.stringify({...t.base,epoch:'a',revision:1,pad:'x'.repeat(64000)});assert.ok(big.length>64000);assert.equal(t.send(null,big),false,'over 64000 characters');
 assert.equal(t.send({epoch:'a',revision:5}),true,'first envelope hydrates');
 assert.equal(t.send({epoch:'a',revision:5}),false,'equal revision once configured');
 assert.equal(t.send({epoch:'a',revision:4}),false,'lower revision');
 assert.equal(t.send({epoch:'a',revision:6}),true,'higher revision');
 assert.equal(t.send({epoch:'b',revision:1}),true,'a new epoch starts again from any revision');
 assert.equal(t.send({epoch:'a',revision:99}),false,'a retired epoch is never accepted again');
 assert.equal(t.send({epoch:'b',revision:0}),false,'lower revision in the current epoch');
});
