'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadLayout, MockPanel, installTopBarIdentityTree } = require('./boot-layout');
const { setup } = require('./timers-fixture');
const results = {};
const copy = value => JSON.parse(JSON.stringify(value));
function reset(h) { for (const key of Object.keys(h.operationCounts)) h.operationCounts[key] = 0; }
function snapshot(panel) {
  return [panel.id, panel.type, [...panel.classes].sort(), {...panel.style}, panel.__text,
    panel.children.map(snapshot)];
}
function record(t, scenario, h, observed) {
  const operations = {...h.operationCounts};
  const output = copy(observed());
  const digest = crypto.createHash('sha256').update(JSON.stringify(output)).digest('hex');
  results[scenario] = {operations, observed: output, digest};
  t.diagnostic(JSON.stringify({scenario, operations, digest}));
}
function menu(options = {}) {
  const b = loadLayout('hud_escape_menu.xml', {skipScripts:['hp_colors_v3_storage']});
  b.includeScripts(); let api;
  b.harness.$.HPColorsV3Store = {attach(value) { api = value; api.hydrateSettings(api.getSettings()); }};
  if (options.prepare) options.prepare(b.harness);
  if(options.traceChrome){
    const h=b.harness, counts=h.operationCounts;h.chromeCounts={};
    h.operationCounts=new Proxy(counts,{set(target,key,value){
      if(['boundaryValidityCalls','boundaryQueries','classReads','classWrites','parentReads','styleWrites','textWrites'].includes(key)&&new Error().stack.includes('at bindChrome'))
        h.chromeCounts[key]=(h.chromeCounts[key]||0)+(value-(target[key]||0));
      target[key]=value;return true;
    }});
    (function visit(p){p.operationCounts=h.operationCounts;p.children.forEach(visit);})(h.root);
  }
  b.onload();
  const h = b.harness, find = id => h.contextPanel.FindChildTraverse(id);
  const refs = {};
  for (const id of ['HPColorsPreview', 'HPColorsPreviewHealthSlider', 'HPColorsPreviewPlay', 'HPColorsBarWidthEnemySlider']) refs[id] = find(id);
  const m = {b, h, find, api, refs};
  return m;
}
function drag(m) {
  const slider = m.refs.HPColorsBarWidthEnemySlider;
  for (let i=0;i<20;i++) { slider.value=100+i; m.h.scheduler.runFor(50); }
  m.h.releaseSlider(slider);
}
function hud(h) {
  let p = new MockPanel('Panel',h.root,'Hud');
  for (const id of ['HudMiddle','health_and_abilities_container','HealthWrapper','hud_health_bars','health_bar','health_bar_Left']) {
    p = new MockPanel('Panel',p,id); if(id==='health_and_abilities_container')p.AddClass('team1');
  }
  return p;
}
test('audit: native-boundary counters exclude mock query internals and retain historical work', () => {
  const counts={}; const root=new MockPanel('root',{operationCounts:counts});
  const middle=new MockPanel('Panel',root,'middle'), leaf=new MockPanel('Panel',middle,'leaf');
  reset({operationCounts:counts});
  root.FindChild('middle'); root.FindChildTraverse('leaf'); root.FindChildrenWithClassTraverse('absent');
  assert.equal(counts.boundaryQueries,3); assert.equal(counts.boundaryValidityCalls||0,0);
  assert.equal(counts.traversal,5,'historical recursive work unchanged');
  leaf.IsValid(); assert.equal(counts.boundaryValidityCalls,1);
});
test('audit: preview open, twenty-publish drag and one play sequence', t => {
  const m=menu({preview:true}); m.h.$.HPColorsMenuToggle(); m.h.scheduler.runFor(1000);
  reset(m.h); drag(m); m.refs.HPColorsPreviewPlay.events.onactivate(); m.h.scheduler.runFor(5000);
  assert.equal(m.h.$.HPColorsV3Preview.inspect().painted,true);
  record(t,'preview',m.h,()=>snapshot(m.refs.HPColorsPreview));
});
test('audit: own HUD twenty-publish drag plus one-second full topology watch',t=>{
  let left; const m=menu({prepare(h){left=hud(h);}}); m.h.scheduler.runFor(1000);
  reset(m.h); drag(m);
  record(t,'ownHud',m.h,()=>snapshot(left));
});
for (const rootHud of [false,true]) test('audit: ten-second active local hero polling '+(rootHud?'with root equal to Hud':'with distinct Hud'),t=>{
  let tree;const m=menu({prepare(h){
    tree=installTopBarIdentityTree(h,{heroName:'Infernus'});
    if(rootHud){tree.topBar.SetParent(h.root);tree.hud.DeleteAsync(0);h.root.id='Hud';}
  }});
  m.h.scheduler.runFor(3000);
  for(const hero of m.h.$.HPColorsV3Settings.heroes)for(const key of ['name','nameToken']){
    const value=hero[key];Object.defineProperty(hero,key,{configurable:true,get(){m.h.operationCounts.jsHeroNameReads=(m.h.operationCounts.jsHeroNameReads||0)+1;return value;}});
  }
  reset(m.h);m.h.scheduler.runFor(10000);
  record(t,rootHud?'heroRoutingRootHud':'heroRouting',m.h,()=>[snapshot(m.find('HPColorsHeroIdentityLabel')),m.api.getSettings()]);
});
test('audit: boot binding and one applySettings with native hue thumbs',t=>{
  const m=menu({traceChrome:true});record(t,'boot',m.h,()=>Object.entries(m.refs).map(([id,p])=>[id,Object.keys(p.events).sort()]));
  record(t,'bootChrome',{operationCounts:m.h.chromeCounts},()=>Object.entries(m.refs).map(([id,p])=>[id,Object.keys(p.events).sort()]));
  for(const row of m.h.$.HPColorsV3Settings.controls)if(row.hueId)new MockPanel('Panel',m.find(row.hueId),'SliderThumb');
  const slots=m.h.$.HPColorsV3Settings.slots,filter=slots.filter;
  slots.filter=function(fn){return filter.call(this,(...args)=>{m.h.operationCounts.jsCellVisits=(m.h.operationCounts.jsCellVisits||0)+1;return fn(...args);});};
  m.api.applySettings(m.api.getSettings());reset(m.h);m.api.applySettings(m.api.getSettings());
  record(t,'syncAll',m.h,()=>m.h.$.HPColorsV3Settings.controls.map(row=>snapshot(m.find(row.rowId))));
});
test('audit: hero-picker search updates matching without rebuilding owner state',t=>{
  const m=menu(); m.h.$.HPColorsMenuToggle();
  m.find('HPColorsNavPresetsButton').events.onactivate();
  m.find('HPColorsPresetSelectedHeroesButton').events.onactivate();
  const entry=m.find('HPColorsHeroSearchField'),list=m.find('HPColorsHeroList');
  assert.ok(list.children.length>40);reset(m.h);entry.text='infer';entry.events.ontextentrychange();
  record(t,'heroSearch',m.h,()=>snapshot(list));
});
test('audit: eleven topbar publishers, six-second heartbeats and ten seconds of progress',t=>{
  const f=setup();f.edit('ultimateTimerEnabled',false);f.h.$.HPColorsV3Timers.stop();
  const top=f.top.harness;
  for(let i=1;i<11;i++){
    const owner=new MockPanel('CitadelHudTopBarPlayer',top.contextPanel,'AUDIT'+i),label=new MockPanel('Label',owner,'PlayerName');label.AddClass('PlayerName');label.text='AUDIT'+i;
    const holder=new MockPanel('Panel',owner,'UltimateHolder');new MockPanel('Panel',holder,'UltimateStatus');new MockPanel('Label',holder,'UltimateCooldownTextShown');
  }
  f.advance(5000);
  const start=top.now;
  function heartbeat(seq){for(let i=0;i<11;i++)f.broadcast(JSON.stringify({magic:'HPV3_PICKUP_SNAPSHOT',source:'audit'+i,instance:'audit',seq,at:top.now,record:{name:i?'AUDIT'+i:'REMOTE',mask:15,at:top.now,progress:[0,1,2,3].map(()=>({angle:-300+(top.now-start)/1000,rate:1,at:top.now}))}}));}
  heartbeat(1);reset(top);
  for(let i=0;i<10;i++){f.advance(1000);if(i===5)heartbeat(2);}
  const cards=top.contextPanel.children.filter(p=>p.paneltype==='CitadelHudTopBarPlayer'&&!p.classes.has('LocalPlayer'));
  record(t,'timers',top,()=>cards.map(snapshot));
  assert.equal(cards.length,11);assert.ok(cards.every(p=>p.FindChildTraverse('HPColorsV3PickupIndicators')));
});
test('audit: equal-value synchronization repairs uncommitted text and replaced native hue thumbs',()=>{
  const m=menu(), row=m.h.$.HPColorsV3Settings.controls.find(row=>row.key==='barColorLow'&&row.side==='enemy');
  const hue=m.find(row.hueId),entry=m.find(row.hexId);
  let thumb=new MockPanel('Panel',hue,'SliderThumb');m.api.applySettings(m.api.getSettings());
  assert.equal(thumb.style.backgroundColor,m.api.getSettings().side.enemy.barColorLow);
  thumb.DeleteAsync(0);thumb=new MockPanel('Panel',hue,'SliderThumb');entry.text='uncommitted';
  m.api.applySettings(m.api.getSettings());assert.equal(entry.text,m.api.getSettings().side.enemy.barColorLow);
  assert.equal(thumb.style.backgroundColor,entry.text);
});
test('audit review F2: generation replacement restarts the HUD watch before incomplete menu controls become ready',()=>{
  const m=menu({prepare(h){hud(h);}});
  assert.equal(m.h.scheduler.jobs.filter(job=>job.fn.name==='hudWatch').length,1);
  m.b.mount();m.h.contextPanel.FindChildTraverse('HPColorsUndoButton').DeleteAsync(0);
  m.h.$.HPColorsV3Store=null;m.b.onload();
  assert.equal(m.h.scheduler.jobs.filter(job=>job.fn.name==='hudWatch').length,1,'same HUD settings in a new generation still restart ownership watching');
});
test('audit: measured boundary budgets remain bounded',()=>{
  const ops=name=>results[name].operations;
  // Ticket 52: the preview's status effect sample is one more looked-up part; its inside-the-pane walk at each
  // attach adds 40 parent reads (1974 -> 2014 measured). Painting adds none.
  assert.ok(ops('preview').boundaryValidityCalls<=11000);assert.ok(ops('preview').parentReads<=2020);
  assert.ok(ops('ownHud').parentReads<=10,'unrelated gestures retain only the full topology watch');
  // +1 class read per identity sample since 2026-11-02: the ESC update badge reads #Hud.ShowEscapeMenu (70 -> 80, 80 measured).
  assert.ok(ops('heroRoutingRootHud').classReads<=80);assert.ok(ops('heroRoutingRootHud').boundaryValidityCalls<=170);
  // bindChrome attribution reads the function name from stacks. Release staging runs Closure ADVANCED,
  // which renames it, so the attribution is checked on unminified (source/debug) scripts only.
  const menuScript=path.resolve(process.env.HPV3_SOURCE_ROOT||path.join(__dirname,'..'),'panorama/scripts/hp_colors_v3_menu.js');
  if(fs.readFileSync(menuScript,'utf8').includes('function bindChrome')){
    assert.equal(ops('bootChrome').classReads||0,0);
    // Tickets 31 and 33 add four and four boot-only event bindings; each validates its target once.
    // Ticket 35 adds the two preview team buttons (resolved and bound once each at boot).
    // Ticket 36 adds the NEW tab: open and dismiss per item plus CLEAR ALL, bound once at boot (246 measured
    // with 9 items); the five 3.4.0 items add one validity call each (251 measured with 14); the two 3.5.0
    // items add two each (255 measured with 16; 251 with them removed). Ticket 50 (3.6.0) adds the Kill bounty
    // card and preview pill (260 measured without its NEW item) and that item (262 measured with 17). The 3.6.0
    // status-effects item adds two (264 measured with 18), and the deferred damage color item two more (266 with 19).
    // Ticket 51 (3.7.0): the HP percent item adds two (268 measured with 20). Ticket 52: the Status effect sizes
    // card, the preview sample and its NEW item add six (274 measured with 21).
    assert.ok(ops('bootChrome').boundaryValidityCalls<=274);
    assert.ok(ops('bootChrome').boundaryQueries>=1,'bindChrome attribution must observe its native query');
  }
  // About 4.5 validity calls per control row; ticket 35 grows the table from 176 to 195 controls (884 measured).
  // 3.5.0 (user, 2026-10-29): five neutral HP number rows replace Customize NPC bars (two) for 199 controls (903 measured);
  // five objective HP number rows make 204 controls (922 measured); three kill bounty rows make 207 (934 measured);
  // the two deferred damage color rows (enemy, ally) make 209 (946 measured); kill bounty size and tilt make 211 (954 measured);
  // ticket 51's HP number format rows (enemy, ally) make 213 (964 measured); ticket 52's eight status effect size
  // rows make 221 (997 measured).
  assert.ok(ops('syncAll').boundaryValidityCalls<=1000);assert.ok(ops('syncAll').boundaryQueries<=1);
  assert.equal(ops('syncAll').jsCellVisits||0,0);assert.ok(ops('heroRouting').jsHeroNameReads<=10);
  assert.ok(ops('heroSearch').classWrites<=55);
  const panelCalls=['boundaryQueries','boundaryValidityCalls','parentReads','parentWrites','classReads','classWrites','styleReads','styleWrites','textReads','textWrites','layoutWidthReads','moveChildCalls'];
  assert.ok(panelCalls.reduce((sum,key)=>sum+(ops('timers')[key]||0),0)/10<300,'eleven pickup rows remain under 300 panel calls/s/HUD');
});
test.after(()=>{if(process.env.HPV3_AUDIT_OUTPUT){fs.mkdirSync(path.dirname(process.env.HPV3_AUDIT_OUTPUT),{recursive:true});fs.writeFileSync(process.env.HPV3_AUDIT_OUTPUT,JSON.stringify(results,null,2)+'\n');}});
