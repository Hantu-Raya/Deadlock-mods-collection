'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadLayout, parseLayout, createVmContext, runInVm, MockPanel, sourceRoot, latestPublishedConfig } = require('./boot-layout');
const { computed, keyframes, inline } = require('./style-cascade');
const oldGrid = require('./old-grid');
const COUNTED = ['traversal','parentReads','parentWrites','classReads','classWrites','styleReads','styleWrites','textReads','textWrites','layoutWidthReads','layoutOtherReads','jsonParses'];
const MAGIC = 'HP_COLORS_V3_CONFIG';

function network() {
  const net = { menu: null, worlds: [], broadcasts: [] };
  net.broadcast = raw => {
    net.broadcasts.push(raw);
    for (const target of [net.menu && net.menu.harness, ...net.worlds].filter(Boolean)) {
      if (target.noConfig && raw.includes(MAGIC)) continue;
      for (const entry of [...target.handlerEntries]) if (entry.channel === 'ClientUI_FireOutput') entry.fn(raw);
    }
  };
  net.advance = ms => {
    for (const world of net.worlds) world.scheduler.runFor(ms,10000);
    if (net.menu) net.menu.harness.scheduler.runFor(ms,10000);
  };
  return net;
}
function mountMenu(net) {
  if (net.menu) net.menu.harness.contextPanel.valid = false;
  const menu = loadLayout('hud_escape_menu.xml');
  net.menu = menu;
  menu.harness.$.DispatchEvent = (event,raw) => {
    menu.harness.dispatches.push([event,raw]);
    if (event === 'ClientUI_FireOutput') net.broadcast(raw);
    return true;
  };
  menu.includeScripts(); menu.onload();
  return menu;
}
function editMenu(menu,key,value,side = 'enemy') {
  const row = menu.harness.$.HPColorsV3Settings.controls.find(r => r.key === key && (r.side === side || r.side === 'shared'));
  assert.ok(row,key);
  let id = row.type === 'boolean' ? row.toggleId : row.type === 'color' ? row.hexId : row.type === 'number' ? row.entryId : row.id;
  let event = 'ontextentrysubmit';
  if (row.type === 'enum' && row.kind === 'segment') { id = row.options.find(o => o.value === value).id; event = 'onactivate'; }
  const panel = menu.harness.contextPanel.FindChildTraverse(id);
  assert.ok(panel,id);
  if (row.type === 'boolean') {
    if (panel.BHasClass('Checked') === value) return;
    event = 'onactivate';
  } else if (row.type === 'enum' && row.kind !== 'segment') {
    panel.SetSelected(panel.FindDropDownMenuChild(row.options.find(o => o.value === value).id)); event = 'oninputsubmit';
  } else if (row.type !== 'enum') panel.text = String(value);
  assert.equal(typeof panel.events[event],'function','real native control event bound');
  panel.events[event]();
}
function fixture(options = {}) {
  const net = options.network || network();
  if (!net.menu) mountMenu(net);
  const boot = loadLayout('unit_status_overlay_v2.xml');
  const h = boot.harness, root = h.contextPanel;
  root.type = root.paneltype = 'ClientUIDialogPanel';
  h.root.classes = options.classes || ['player','enemy'];
  if (options.ancestor) {
    h.root.classes = ['CLASS_PLAYER'];
    new MockPanel('Higher', { classes: ['enemy'] }).add(h.root);
  }
  const unit = root.FindChild('UnitStatus'), info = unit.FindChild('InfoHealthContainer'), stack = info.FindChild('UnitHealthbarsContainer');
  const primary = stack.FindChild('UnitHealthbar'), inner = primary.FindChild('UnitHealthbarInner');
  const fill = inner.FindChild('unit_healthbar_lagging'), shieldBar = stack.FindChild('UnitShieldbar');
  const motion = root.FindChild('HPColorsV3MotionFrame'), row = motion.FindChild('HPColorsV3Readout').FindChild('HPColorsV3ReadoutAnchor').FindChild('HPColorsV3ReadoutRow');
  const parts = {status:unit,info,stack,primary,inner,fill,motion,row,anchor:row.GetParent(),
    value:info.FindChild('UnitHealthbarValue'),name:root.FindChild('name'),lines:primary.FindChild('UnitHealthbarLines'),
    outline:primary.FindChild('HPColorsV3BarOutline'),healing:inner.FindChild('unit_healthbar_healing'),delta:inner.FindChild('unit_healthbar_delta'),
    shield:inner.FindChild('unit_healthbar_bullet_shield'),armor:inner.FindChild('unit_healthbar_ratking_armor'),
    deferred:inner.FindChild('unit_healthbar_deferred'),level:info.FindChild('HPColorsV3Level'),levelLabel:info.FindChildTraverse('unit_level_label'),
    ult:info.Children().find(panel=>panel.BHasClass('unit_info_panel'))};
  let canvasWidth = 200, canvasHeight = 210;
  function measure(panel,width,height,x=0,y=0,sx=2,sy=2) {
    panel.actualuiscale_x=sx; panel.actualuiscale_y=sy;
    panel.actuallayoutwidth=width*sx; panel.actuallayoutheight=height*sy; panel.actualxoffset=x*sx; panel.actualyoffset=y*sy;
  }
  function nativeLayout(full) {
    measure(unit,full?canvasWidth:100,full?canvasHeight:40,full?0:(canvasWidth-100)/2,full?0:65);
    measure(info,full?canvasWidth:100,full?canvasHeight:40); measure(stack,full?canvasWidth:100,full?canvasHeight:40);
    measure(primary,79,18,((full?canvasWidth:100)-79+13)/2,full?65:0);
  }
  measure(root,canvasWidth,canvasHeight); nativeLayout(false); measure(inner,69,12,6,3.5);
  for (const key of ['motion','anchor']) measure(parts[key],canvasWidth,canvasHeight);
  measure(parts.row,28,23); measure(parts.value,20,15); measure(parts.name,50,16);
  for (const key of ['shield','armor','healing','delta']) measure(parts[key],69,12);
  if(parts.level){measure(parts.level,21,21,27,67.5,1.25,3);parts.levelLabel.text='10';}
  parts.ultBackground=parts.ult.FindChild('unit_info_bg');parts.ultReady=parts.ultBackground.FindChild('unit_ult_ready_icon');
  measure(parts.ult,20,20,50,68,3,1.25);measure(parts.ultBackground,20,20);measure(parts.ultReady,20,20);
  measure(fill,69,12,0,0,1,1); fill.style.clip='rect(0%, 50%, 100%, 0%)';
  const nativeParent = unit.SetParent.bind(unit);
  unit.SetParent = parent => {nativeParent(parent); nativeLayout(parent===motion);};
  const resize = (width,height) => {canvasWidth=width;canvasHeight=height;measure(root,width,height);nativeLayout(unit.parent===motion);};
  if (options.inline) fill.style.washColor=options.inline;
  for (const [part,styles] of Object.entries(options.nativeStyles||{})) Object.assign(parts[part].style,styles);
  if (options.opacityUnlays) for (const panel of [inner,fill]) {
    const native = Object.getOwnPropertyDescriptor(panel,'actuallayoutwidth');
    Object.defineProperty(panel,'actuallayoutwidth',{...native,get() {
      const width=native.get(); return primary.style.opacity==='0'?0:width;
    }});
  }
  const duplicate = new MockPanel('Panel',shieldBar.FindChild('UnitHealthbarInner'),'unit_healthbar_lagging'); duplicate.style.washColor='#aabbcc';
  stack.children=[shieldBar,...stack.children.filter(p=>p!==shieldBar)];
  const {shield,armor}=parts;
  if (options.prepare) options.prepare(parts,h);
  function instrument(panel) {
    const nativeValid=panel.IsValid.bind(panel);
    panel.IsValid=()=>{h.operationCounts.validityCalls=(h.operationCounts.validityCalls||0)+1;return nativeValid();};
    for (const key of ['actualuiscale_x','actualuiscale_y']) {
      let value=panel[key];
      Object.defineProperty(panel,key,{configurable:true,get(){h.operationCounts.uiScaleReads=(h.operationCounts.uiScaleReads||0)+1;return value;},set(v){value=v;}});
    }
    for (const key of ['actualxoffset','actualyoffset','actuallayoutheight']) {
      let value=panel[key];
      Object.defineProperty(panel,key,{configurable:true,get() {h.operationCounts.layoutOtherReads=(h.operationCounts.layoutOtherReads||0)+1;return value;},set(v) {value=v;}});
    }
    for (const child of panel.children) instrument(child);
  }
  instrument(h.root);
  h.operationCounts.jsonParses = 0;
  boot.context.JSON = { stringify: JSON.stringify, parse(raw) { h.operationCounts.jsonParses++; return JSON.parse(raw); } };
  boot.context.Date = class extends boot.context.Date { static now() { h.operationCounts.clockReads=(h.operationCounts.clockReads||0)+1;return h.now; } };
  h.noConfig = options.deliver === false; net.worlds.push(h);
  const relayContexts = [], create = h.$.CreatePanel;
  h.$.CreatePanel = (type,parent,id) => {
    const panel = create(type,parent,id);
    instrument(panel);
    panel.BLoadLayout = url => {
      assert.equal(url,'file://{resources}/layout/hp_colors_v3_relay.xml');
      const tree = parseLayout(fs.readFileSync(path.join(sourceRoot,'panorama/layout/hp_colors_v3_relay.xml'),'utf8'));
      const context = createVmContext(h);
      context.$ = {...h.$,GetContextPanel: () => panel,DispatchEvent(event,raw) {
        assert.equal(event,'ClientUI_FireOutput');
        h.dispatches.push([event,raw,panel,panel.GetParent()]); net.broadcast(raw); return true;
      }};
      relayContexts.push(context);
      for (const include of tree.children.find(n => n.tag === 'scripts').children) {
        const file = include.attrs.src.replace('s2r://','').replace('.vjs_c','.js');
        runInVm(fs.readFileSync(path.join(sourceRoot,file),'utf8'),context,file);
      }
      return true;
    };
    return panel;
  };
  h.$.DispatchEvent = (event,panel) => {
    assert.notEqual(event,'ClientUI_FireOutput','dialog must never emit FireOutput');
    assert.equal(event,'Activated'); panel.events.onactivate(); return true;
  };
  h.GameUI.CustomUIConfig = () => { throw new Error('World config cannot be read'); };
  boot.includeScripts();
  net.broadcast(JSON.stringify({magic:'HPV3_PICKUP_SCAN_GATE',scan:true,localName:'LOCAL',since:0,at:h.now}));
  const api = h.$.HPColorsV3Renderer;
  // No onload is invoked: the included world_boot is the real startup seam.
  assert.equal(root.GetAttributeString('hpv3_renderer_boot',''),'ready');
  const advance = (ms = 150) => net.advance(ms);
  const edit = (key,value,side) => editMenu(net.menu,key,value,side);
  // Exact live 6779 format (console probe 2026-10-14): padded, with a trailing space.
  const setHealth = percent => { fill.style.clip = `rect( 0.0%, ${percent}%, 100.0%, 0.0%) `; };
  return {boot,net,get menu() { return net.menu; },h,root,fill,inner,shield,armor,duplicate,api,advance,edit,setHealth,relayContexts,parts,...parts,resize,measure};
}

function allCoreFeatures(fx) {
  for (const side of ['enemy','ally']) {
    for (const key of ['barColorEnabled','barColorTeamHigh','barOutlineEnabled','barOutlineCustomColor','hpTextVisible','nameVisible','nameColorEnabled']) fx.edit(key,true,side);
    fx.edit('hpTextOutline',7.5,side); fx.edit('nameOutline',7.5,side);
  }
}
function labels(panel) {
  return (panel.paneltype==='Label'?[panel]:[]).concat(...panel.children.map(labels));
}
function position(value) {
  const match=/translate3d\(([-\d.]+)px,\s*([-\d.]+)px,\s*0px\)/.exec(value);
  assert.ok(match,value); return match.slice(1).map(Number);
}

test('v2 core defaults convert native 79×18 percentages and raw offsets into exact CSS pixels',()=>{
  const fx=fixture(); fx.advance(600); fx.advance(1000);
  const settings=latestPublishedConfig(fx.menu.harness).settings.side.enemy;
  assert.equal(settings.barWidth,116.92); assert.equal(settings.barHeight,14.4); assert.equal(settings.barOffsetY,-3.8);
  assert.equal(fx.stack.style.preTransformScale2d,'1.48, 0.8');
  assert.deepEqual(position(fx.stack.style.transform),[-3.12,-10]);
  assert.equal(fx.status.GetParent(),fx.motion); assert.equal(fx.name.GetParent(),fx.motion);
  assert.equal(computed(fx.status,'width'),'100%'); assert.equal(computed(fx.status,'height'),'100%'); assert.equal(computed(fx.status,'marginTop'),'0px');
  assert.equal(computed(fx.primary,'marginTop'),'65px'); assert.equal(computed(fx.primary,'opacityMask'),undefined);
  assert.equal(computed(fx.primary,'backgroundColor'),'#00000000'); assert.equal(computed(fx.inner,'opacityMask'),undefined); assert.equal(computed(fx.lines,'opacityMask'),undefined);
  assert.equal(fx.outline.style.backgroundColor,'#10130D'); assert.equal(fx.outline.style.width,'71px'); assert.equal(fx.outline.style.height,'14px');
  assert.deepEqual(position(fx.outline.style.transform),[5,2.5]);
  assert.equal(fx.value.style.fontFamily,'VALVEOracle, Reaver, sans-serif'); assert.equal(fx.value.style.fontSize,'14.5px');
  assert.deepEqual(position(fx.row.style.transform),[-33.36,73.4]);
  const rows=fx.menu.harness.$.HPColorsV3Settings.controls;
  for (const key of ['barWidth','barHeight']) {const row=rows.find(r=>r.key===key);assert.equal(row.unit,'px');assert.equal(row.step,0.01);}
  for (const key of ['hpTextOutline','nameOutline']) {const row=rows.find(r=>r.key===key);assert.equal(row.unit,'');assert.equal(row.step,0.5);}
  fx.edit('barWidth',116.93); assert.equal(latestPublishedConfig(fx.menu.harness).settings.side.enemy.barWidth,116.93);
});

test('ally bands and all feedback colors are independent and primary-only',()=>{
  const net=network(), enemy=fixture({network:net}), ally=fixture({network:net,classes:['player','friend']}); net.advance(600);
  assert.equal(ally.fill.style.washColor,undefined); assert.notEqual(ally.api.status.state,'dormant');
  assert.equal(ally.outline.style.backgroundColor,'#042517'); assert.equal(ally.value.GetParent(),ally.info);
  ally.edit('barColorEnabled',true,'ally');
  for (const [key,value] of [['barColorLow','#110000'],['barColorMid','#008800'],['barColorHigh','#0000AA'],
    ['barHealingColor','#123456'],['barDeltaColor','#234567'],['barShieldColor','#345678'],['barArmorColor','#456789']]) ally.edit(key,value,'ally');
  for (const [health,color] of [[25,'#110000'],[50,'#008800'],[90,'#0000AA']]) {ally.setHealth(health);ally.advance();assert.equal(ally.fill.style.washColor,color);}
  assert.equal(ally.healing.style.washColor,'#123456');assert.equal(ally.delta.style.washColor,'#234567');
  assert.equal(ally.shield.style.backgroundColor,'#345678');assert.equal(ally.armor.style.backgroundColor,'#456789');
  assert.equal(enemy.healing.style.washColor,'#5FFF80');assert.equal(enemy.delta.style.washColor,'#FFE55B');
  assert.equal(enemy.shield.style.backgroundColor,'#FFFFFF');assert.equal(enemy.armor.style.backgroundColor,'#C7A674');
  assert.equal(ally.duplicate.style.washColor,'#aabbcc');assert.equal(enemy.duplicate.style.washColor,'#aabbcc');
  ally.edit('barColorMode','gradient','ally');ally.setHealth(45);ally.advance();assert.equal(ally.fill.style.washColor,'#094400');
  ally.h.root.AddClass('team2');ally.edit('barColorTeamHigh',true,'ally');ally.setHealth(100);ally.advance();assert.equal(ally.fill.style.washColor,'#5b79e6');
  ally.edit('barColorEnabled',false,'ally');assert.equal(computed(ally.fill,'washColor').toUpperCase(),'#FFEFD7');assert.equal(computed(ally.delta,'washColor').toUpperCase(),'#CC340A');
  assert.equal(computed(ally.shield,'backgroundColor'),'rgb(183, 220, 255)');assert.equal(computed(ally.armor,'backgroundColor').toUpperCase(),'#C7A674');
});

// Discord request (ccrom, 2026-11-01): Shiv's Bloodletting (3) and Nurse Harrow's Vapors (2) defer damage, and the
// engine draws that health as #unit_healthbar_deferred in stock orange rgb(232, 127, 61) on every side, so a white
// ally read as an enemy. Ways it can fail: the layer not found in the primary inner (or taken from the shield bar),
// one side's color leaking to the other, the default not matching the stock orange, the color applied while custom
// bar colors are off, a neutral camp bar recolored, or the stock wash not coming back when the colors are turned off.
test('deferred damage (Shiv Bloodletting, Nurse Vapors) takes its own color per side, stock orange by default',()=>{
  const net=network(), enemy=fixture({network:net}), ally=fixture({network:net,classes:['player','friend']}); net.advance(600);
  assert.equal(computed(ally.parts.deferred,'washColor'),'rgb(232, 127, 61)','custom colors off: stock orange');
  assert.equal(ally.parts.deferred.style.washColor,undefined,'nothing written while the ally side is off');
  assert.equal(enemy.parts.deferred.style.washColor,'#E87F3D','enemy default is the stock orange');
  ally.edit('barColorEnabled',true,'ally');ally.edit('barDeferredColor','#FFFFFF','ally');ally.advance();
  assert.equal(ally.parts.deferred.style.washColor,'#FFFFFF','ally takes its own color');
  assert.equal(enemy.parts.deferred.style.washColor,'#E87F3D','the enemy side is unchanged');
  enemy.edit('barDeferredColor','#FD4949','enemy');enemy.advance();
  assert.equal(enemy.parts.deferred.style.washColor,'#FD4949');assert.equal(ally.parts.deferred.style.washColor,'#FFFFFF');
  const shieldInner=ally.stack.FindChild('UnitShieldbar')?.FindChildTraverse?.('unit_healthbar_deferred');
  if (shieldInner) assert.equal(shieldInner.style.washColor,undefined,'the shield bar keeps the stock look');
  ally.edit('barColorEnabled',false,'ally');ally.advance();
  assert.ok(!ally.parts.deferred.style.washColor,'turning colors off hands the layer back: '+ally.parts.deferred.style.washColor);
  assert.equal(computed(ally.parts.deferred,'washColor'),'rgb(232, 127, 61)');
  const camp=fixture({classes:['neutral_normal','team_neutral'],nativeStyles:{deferred:{washColor:'#AABBCC'}}});camp.advance(1800);
  camp.edit('neutralEnabled',true);camp.edit('barDeferredColor','#123456');camp.advance(1600);
  assert.equal(camp.parts.deferred.style.washColor,'#AABBCC','neutral camps keep the stock deferred layer');
});

test('engine-bound HP label is adopted without new labels and updates while primary stays near-transparent',()=>{
  let original, originalLabels;
  const fx=fixture({opacityUnlays:true,prepare(parts){original=parts.value;originalLabels=labels(parts.motion.GetParent());}});fx.advance(600);
  assert.equal(fx.value,original);assert.equal(fx.value.GetParent(),fx.row);
  assert.deepEqual(new Set(labels(fx.root)),new Set(originalLabels));
  fx.edit('barVisible',false);assert.equal(computed(fx.primary,'opacity'),'0.01');assert.equal(computed(fx.value,'visibility'),'visible');
  fx.edit('levelsVisible',false); // Isolate HP binding reads from the engine-bound level feature.
  fx.h.operationCounts.textReads=0;fx.h.operationCounts.textWrites=0;
  fx.value.text='4321';fx.setHealth(10);fx.advance(1500);
  assert.equal(fx.value.style.washColor,'#FD4949');assert.equal(fx.api.facts().fraction,0.1);
  assert.equal(fx.h.operationCounts.textReads,0);assert.equal(fx.h.operationCounts.textWrites,1,'only the simulated engine binding writes text');
  assert.equal(fx.value.text,'4321');assert.equal(fx.value,original);
  fx.edit('barVisible',true);assert.equal(computed(fx.primary,'opacity'),'1');assert.notEqual(fx.api.status.state,'dormant');
  fx.edit('hpTextVisible',false);assert.equal(fx.value.GetParent(),fx.info);
  assert.equal(computed(fx.value,'fontSize'),'18px');assert.equal(computed(fx.value,'washColor'),'rgb(255, 160, 160)');assert.equal(computed(fx.value,'transform'),'rotateZ(-3deg)');
  assert.equal(fx.value.style.marginTop,'66px');assert.equal(fx.value.style.marginRight,'60px','stock compact-frame origin is preserved in full canvas');
  fx.h.root.AddClass('ShowHealthValue');fx.h.root.AddClass('active_damage_by_local_player');fx.advance(1100);
  assert.equal(computed(fx.value,'visibility'),'collapse');assert.equal(computed(fx.value,'opacity'),'1');
  fx.edit('hpTextVisible',true);assert.equal(fx.value.GetParent(),fx.row);assert.equal(fx.value.text,'4321');
});

test('native HP fonts, independent color bands, size and outline controls run through menu events',()=>{
  const fx=fixture();fx.advance(600);
  for (const [font,family] of [['default','Retail Demo, Noto Sans, sans-serif'],['pulp','VALVEPulp, Noto Sans, sans-serif'],['oracle','VALVEOracle, Reaver, sans-serif']]) {
    fx.edit('hpTextFont',font);assert.equal(fx.value.style.fontFamily,family);
  }
  fx.edit('hpTextSize',20.5);assert.equal(fx.value.style.fontSize,'20.5px');
  fx.edit('hpTextOutline',7.5);assert.equal(fx.value.style.textShadow,'0px 0px 0px 7.5 #10130D');assert.equal(fx.value.style.padding,'0px 8px');
  fx.edit('hpTextColorMode','custom');
  for (const [key,value] of [['hpTextLow','#110000'],['hpTextMid','#008800'],['hpTextHigh','#0000AA']]) fx.edit(key,value);
  fx.setHealth(50);fx.advance();assert.equal(fx.value.style.washColor,'#008800');assert.equal(fx.fill.style.washColor,'#fe681b');
  fx.edit('hpTextMode','gradient');fx.setHealth(45);fx.advance();assert.equal(fx.value.style.washColor,'#094400');
  fx.edit('hpTextColorMode','bar');assert.equal(fx.value.style.washColor,fx.fill.style.washColor);
  fx.edit('hpTextOutline',5);assert.equal(computed(fx.value,'textShadow'),'0px 0px 0px 5.0 offBlack');
});

test('live 6779: releasing textShadow clears with null because "" fails to parse; the bar keeps painting',()=>{
  // Panorama rejects "" for textShadow ("Failed to parse style value"); v2 clears with null.
  const strict = panel => {
    const store = Object.assign({}, panel.style);
    panel.style = new Proxy(store, { set(target, key, value) {
      if (key === 'textShadow' && value === '') throw new Error('Failed to parse style value for textShadow');
      if (value === null) delete target[key]; else target[key] = value; return true;
    } });
  };
  const fx=fixture({prepare:parts=>{strict(parts.value);strict(parts.name);}});fx.advance(600);
  fx.edit('hpTextOutline',7.5);fx.edit('nameOutline',7.5);assert.equal(fx.value.style.textShadow,'0px 0px 0px 7.5 #10130D');
  const painted=fx.fill.style.washColor;assert.ok(painted);
  fx.edit('hpTextOutline',5);fx.edit('nameOutline',5);fx.advance(1000);
  assert.equal(fx.value.style.textShadow,undefined,'inline outline released to the stylesheet');
  assert.equal(fx.name.style.textShadow,undefined);
  assert.equal(computed(fx.value,'textShadow'),'0px 0px 0px 5.0 offBlack');
  assert.equal(fx.fill.style.washColor,painted,'one release must not roll back the whole paint');
});

test('HP offsets scale per axis, row growth clamps and viewport changes invalidate measured facts',()=>{
  const fx=fixture();fx.advance(600);fx.advance(1000);
  fx.edit('barWidth',158);fx.edit('barHeight',36);fx.edit('barOffsetX',10);fx.edit('barOffsetY',-5);
  assert.equal(fx.stack.style.preTransformScale2d,'2, 2');assert.deepEqual(position(fx.stack.style.transform),[3.5,26]);
  fx.edit('hpTextOffsetX',10);fx.edit('hpTextOffsetY',10);
  assert.deepEqual(position(fx.row.style.transform),[-30,81]);
  fx.edit('hpTextOffsetX',334);fx.edit('hpTextOffsetY',350);assert.deepEqual(position(fx.row.style.transform),[0,187]);
  fx.edit('hpTextOffsetX',-334);fx.edit('hpTextOffsetY',-350);assert.deepEqual(position(fx.row.style.transform),[-172,0]);
  fx.measure(fx.row,60,30);fx.advance();assert.deepEqual(position(fx.row.style.transform),[-140,0],'native glyph growth alone wakes clamping');
  fx.resize(100,80);fx.advance(1600);assert.equal(fx.anchor.style.width,'100px');assert.equal(fx.anchor.style.height,'80px');
  assert.deepEqual(position(fx.row.style.transform),[-40,0]);
  fx.edit('hpTextAlign','right');fx.edit('hpTextOffsetX',334);fx.edit('hpTextOffsetY',350);assert.deepEqual(position(fx.row.style.transform),[40,50]);
  fx.measure(fx.row,140,100);fx.advance();assert.deepEqual(position(fx.row.style.transform),[0,0],'oversized rows keep their near edge at zero');
  fx.edit('hpTextAlign','left');assert.deepEqual(position(fx.row.style.transform),[40,0]);
});

test('logical geometry normalizes independent x/y scales without reading its own rendered scale',()=>{
  const fx=fixture();fx.advance(600);fx.advance(1000);
  fx.measure(fx.root,200,210,0,0,2,4);fx.measure(fx.status,200,210,0,0,3,5);fx.measure(fx.info,200,210,0,0,4,6);
  fx.measure(fx.stack,200,210,0,0,5,7);fx.measure(fx.primary,79,18,67,65,3,4);fx.measure(fx.inner,69,12,6,3.5,4,5);
  fx.measure(fx.row,28,23,0,0,3,4);fx.advance(1600);
  assert.deepEqual(position(fx.stack.style.transform),[-3.12,-10]);assert.deepEqual(position(fx.row.style.transform),[-33.36,73.4]);
  const before=fx.stack.style.transform;fx.advance(10000);assert.equal(fx.stack.style.transform,before);
});

test('name color, spectator alpha, size, outline, alignment and clamping retain native binding/fade',()=>{
  const fx=fixture({nativeStyles:{name:{opacity:'0.8'}}});fx.advance(600);
  fx.edit('nameColorEnabled',true);fx.edit('nameColor','#112233');assert.equal(fx.name.style.color,'#112233');
  fx.h.root.AddClass('spectating');fx.advance(1100);assert.equal(fx.name.style.color,'#11223380');
  fx.edit('nameSize',20);fx.edit('nameOutline',7.5);assert.equal(fx.name.style.fontSize,'20px');assert.equal(fx.name.style.maxHeight,'30px');
  assert.equal(fx.name.style.padding,'2px 8px 0px 8px');assert.equal(fx.name.style.maxWidth,'182px');assert.equal(fx.name.style.textShadow,'0px 0px 0px 7.5 #10130Dee');
  fx.edit('nameAlign','left');fx.edit('nameOffsetX',-200);fx.edit('nameOffsetY',-210);assert.deepEqual(position(fx.name.style.transform),[-150,-45]);
  fx.edit('nameAlign','right');fx.edit('nameOffsetX',200);fx.edit('nameOffsetY',210);assert.deepEqual(position(fx.name.style.transform),[150,149]);
  fx.edit('levelsVisible',false); // Names must never read their native binding.
  fx.h.operationCounts.textReads=0;fx.h.operationCounts.textWrites=0;fx.name.text='New native name';fx.advance(1500);
  assert.equal(fx.h.operationCounts.textReads,0);assert.equal(fx.h.operationCounts.textWrites,1);assert.equal(fx.name.style.opacity,'0.8');
  fx.edit('nameVisible',false);assert.equal(computed(fx.name,'visibility'),'collapse');
  fx.edit('nameColorEnabled',false);assert.equal(computed(fx.name,'color'),'offWhite&80');
  fx.edit('nameOutline',5);assert.equal(computed(fx.name,'textShadow'),'0px 0px 0px 4.0 offBlack&ee');
  fx.h.root.RemoveClass('spectating');fx.h.root.AddClass('HideName');fx.edit('nameVisible',true);assert.equal(computed(fx.name,'visibility'),'collapse');
});

test('name team colors need Custom name color, keep the spectator alpha and fall back to the own color without a team',()=>{
  const fx=fixture();fx.advance(600);fx.h.root.AddClass('team1');fx.advance(1100);
  // The source row is usable only with Custom name color on, so pick team there and switch the color off again.
  fx.edit('nameColorEnabled',true);fx.edit('nameColorMode','team');fx.edit('nameColorEnabled',false);fx.advance(1100);
  assert.equal(fx.name.style.color||undefined,undefined,'team source alone changes nothing while custom color is off');
  fx.edit('nameColorEnabled',true);fx.edit('nameColor','#112233');fx.edit('teamAmberColor','#C08020');fx.advance(1100);
  assert.equal(fx.name.style.color,'#C08020','the name takes the team color');
  fx.h.root.AddClass('spectating');fx.advance(1100);assert.equal(fx.name.style.color,'#C0802080');
  fx.h.root.RemoveClass('spectating');fx.h.root.RemoveClass('team1');fx.advance(1100);
  assert.equal(fx.name.style.color,'#112233','unknown team uses the own color');
  fx.edit('nameColorMode','custom');fx.h.root.AddClass('team1');fx.advance(1100);assert.equal(fx.name.style.color,'#112233');
});

test('outline defaults honor relation before team/spectator; custom thickness and opacity release cleanly',()=>{
  const fx=fixture({classes:['player','enemy','team2','spectating']});fx.advance(600);
  assert.equal(fx.outline.style.backgroundColor,'#10130D');
  fx.h.root.AddClass('health_critical');fx.h.root.AddClass('ShowCriticalState');fx.advance(1100);assert.equal(fx.outline.style.backgroundColor,'#2F0404');
  fx.edit('barOutlineCustomColor',true);fx.edit('barOutlineColor','#123456');fx.edit('barOutlineThickness',4);fx.edit('barOutlineOpacity',35);
  assert.equal(fx.outline.style.backgroundColor,'#123456');assert.equal(fx.outline.style.opacity,'0.35');
  assert.equal(fx.outline.style.width,'77px');assert.equal(fx.outline.style.height,'20px');assert.deepEqual(position(fx.outline.style.transform),[2,-0.5]);
  fx.edit('barOutlineEnabled',false);assert.equal(computed(fx.outline,'visibility'),'collapse');assert.equal(fx.outline.style.width,'');
  fx.edit('barOutlineEnabled',true);assert.equal(fx.outline.style.backgroundColor,'#123456');assert.equal(fx.outline.style.width,'77px');
  fx.edit('barOutlineCustomColor',false);assert.equal(fx.outline.style.backgroundColor,'#2F0404');
});

test('every native inline property and original sibling order survive master-off, restart and reinclusion',()=>{
  const original={
    status:{width:'125px',height:'45px',marginTop:'70px',animationName:'none',transitionProperty:'opacity'},
    info:{verticalAlign:'center'},stack:{transform:'translate3d(2px, 3px, 0px)',preTransformScale2d:'1.1, 1.1',transformOrigin:'40% 40%',animationName:'none'},
    primary:{marginLeft:'7px',marginTop:'9px',opacityMask:'none',backgroundColor:'#123456',opacity:'0.72'},inner:{opacityMask:'none'},lines:{opacityMask:'none'},
    fill:{washColor:'#010203'},healing:{washColor:'#112233'},delta:{washColor:'#223344'},shield:{backgroundColor:'#334455'},armor:{backgroundColor:'#445566'},
    value:{visibility:'visible',opacity:'0.7',washColor:'#556677',fontFamily:'VALVEPulp',fontSize:'19px',textShadow:'0px 0px 0px 6 #10130D',padding:'2px',
      marginLeft:'8px',marginRight:'9px',marginTop:'3px',horizontalAlign:'right',verticalAlign:'top',transform:'rotateZ(-2deg)'},
    name:{visibility:'visible',color:'#667788',fontSize:'17px',textShadow:'0px 0px 0px 6 #10130Dee',padding:'0px 3px',maxWidth:'173px',maxHeight:'24px',horizontalAlign:'left',transform:'none'}
  };
  let rootOrder,infoOrder;
  const fx=fixture({nativeStyles:original,prepare(parts){rootOrder=[...parts.motion.GetParent().children];infoOrder=[...parts.info.children];}});
  fx.advance(600);allCoreFeatures(fx);fx.edit('barVisible',false);fx.edit('enabled',false);
  function restored() {
    for(const [part,styles] of Object.entries(original)) for(const [key,value] of Object.entries(styles)) assert.equal(fx[part].style[key],value,part+'.'+key);
    assert.equal(fx.status.GetParent(),fx.root);assert.equal(fx.name.GetParent(),fx.root);assert.equal(fx.value.GetParent(),fx.info);
    assert.deepEqual(fx.root.children.filter(p=>rootOrder.includes(p)),rootOrder);assert.deepEqual(fx.info.children,infoOrder);
    assert.equal(computed(fx.outline,'visibility'),'collapse');assert.equal(fx.row.style.transform,'');
  }
  restored();fx.api.stop();fx.api.start();fx.advance(600);restored();fx.boot.includeScripts();fx.advance(600);restored();
  fx.edit('enabled',true);fx.edit('nameColorEnabled',false);assert.equal(fx.name.style.color,'#667788');
  fx.edit('enabled',false);restored();
});

test('released native defaults track ally, neutral, boss, critical, empty, show-HP and spectator state',()=>{
  const fx=fixture();fx.advance(600);allCoreFeatures(fx);fx.edit('barVisible',false);fx.edit('enabled',false);
  const cases=[
    [['player','friend'],'#FFEFD7','#CC340A','rgb(183, 220, 255)','14px','13px'],
    [['boss_tier1','team_neutral'],'#5BEFB5','#F24D4D','orange','18px','0px'],
    [['neutral_weak'],undefined,undefined,'orange','14px','0px'],
    [['player','enemy','team1','spectating'],'#E7B659','#FFE55B','#ff8181','14px','13px'],
    [['player','enemy','team1','team2','spectating'],'#5B79E6','#FFE55B','#ff8181','14px','13px'],
    [['player','enemy','health_critical','ShowCriticalState'],'#FD4949','#FFE55B','#ff8181','14px','20px']
  ];
  for(const [classes,fill,delta,shield,size,margin] of cases) {
    fx.h.root.classes=classes.filter(name=>name!=='ShowCriticalState');
    fx.root.SetHasClass('ShowCriticalState',classes.includes('ShowCriticalState'));fx.advance(2600);
    assert.equal(computed(fx.fill,'washColor')?.toUpperCase(),fill);assert.equal(computed(fx.primary,'backgroundColor'),undefined);assert.equal(computed(fx.delta,'washColor')?.toUpperCase(),delta);
    assert.equal(computed(fx.shield,'backgroundColor'),shield);assert.equal(computed(fx.name,'fontSize'),size);assert.equal(computed(fx.primary,'marginLeft'),margin);
    assert.equal(fx.status.GetParent(),fx.root);assert.equal(fx.value.GetParent(),fx.info);assert.equal(fx.primary.style.marginTop,undefined);
  }
  assert.equal(computed(fx.stack,'preTransformScale2d'),'1.2');assert.equal(computed(fx.stack,'animationName'),'healthCritFlash3');
  fx.primary.AddClass('healthbar_empty');fx.h.root.classes=['player','enemy','ShowHealthValue','active_damage_by_local_player'];fx.advance(2600);
  assert.equal(computed(fx.primary,'opacity'),'0.4');assert.equal(computed(fx.value,'visibility'),'visible');assert.equal(computed(fx.value,'opacity'),'1');
  fx.h.root.AddClass('unkillable');fx.advance(2600);assert.equal(computed(fx.value,'visibility'),'collapse');
  fx.h.root.classes=['player','friend','ShowAllyHealthValue','active_damage'];fx.advance(2600);
  assert.equal(computed(fx.primary,'opacity'),'0.9');assert.equal(computed(fx.value,'visibility'),'visible');assert.equal(computed(fx.value,'opacity'),'1');
  assert.equal(computed(fx.status,'animationName'),'active_damage_wiggle');assert.equal(computed(fx.value,'marginRight'),'20px');
});

test('ally HP, name and outline settings remain independent while ally bar colors are disabled',()=>{
  const net=network(),enemy=fixture({network:net}),ally=fixture({network:net,classes:['player','friend']});net.advance(600);
  ally.edit('hpTextVisible',true,'ally');ally.edit('hpTextFont','pulp','ally');ally.edit('hpTextColorMode','custom','ally');
  ally.edit('hpTextMid','#123456','ally');ally.edit('nameColorEnabled',true,'ally');ally.edit('nameColor','#234567','ally');
  ally.edit('barOutlineCustomColor',true,'ally');ally.edit('barOutlineColor','#345678','ally');ally.edit('barOutlineThickness',4,'ally');
  assert.equal(ally.fill.style.washColor,undefined);assert.equal(ally.value.GetParent(),ally.row);assert.equal(ally.value.style.washColor,'#123456');
  assert.equal(ally.value.style.fontFamily,'VALVEPulp, Noto Sans, sans-serif');assert.equal(ally.name.style.color,'#234567');
  assert.equal(ally.outline.style.backgroundColor,'#345678');assert.equal(ally.outline.style.width,'77px');
  assert.equal(enemy.value.style.fontFamily,'VALVEOracle, Reaver, sans-serif');assert.equal(enemy.name.style.color,undefined);
  assert.equal(enemy.outline.style.backgroundColor,'#10130D');assert.equal(enemy.outline.style.width,'71px');
  ally.edit('barColorEnabled',true,'ally');assert.equal(ally.value.style.washColor,'#123456');assert.equal(ally.name.style.color,'#234567');
});

test('HP-off origin compensation follows non-200px viewport width',()=>{
  const fx=fixture();fx.advance(600);fx.resize(320,300);fx.edit('hpTextVisible',false);
  assert.equal(fx.value.GetParent(),fx.info);assert.equal(fx.value.style.marginRight,'120px');assert.equal(fx.value.style.marginTop,'66px');
});

test('owned root noclip class releases exactly without touching native overflow',()=>{
  for(const preexisting of [false,true]) {
    const fx=fixture({prepare(parts){const root=parts.motion.GetParent();root.style.overflow='clip';if(preexisting)root.AddClass('HPColorsV3Core');}});fx.advance(600);
    assert.equal(fx.root.BHasClass('HPColorsV3Core'),true);assert.equal(fx.root.style.overflow,'clip');
    fx.edit('enabled',false);assert.equal(fx.root.BHasClass('HPColorsV3Core'),preexisting);assert.equal(fx.root.style.overflow,'clip');
    fx.boot.includeScripts();fx.advance(600);assert.equal(fx.root.BHasClass('HPColorsV3Core'),preexisting);
  }
});

test('released CSS observes stock-only ancestors immediately with all gates closed',()=>{
  let higher;
  const fx=fixture({prepare(parts,h){higher=new MockPanel('Higher',{classes:[],operationCounts:h.operationCounts});higher.add(h.root);}});
  fx.advance(600);allCoreFeatures(fx);fx.edit('enabled',false);fx.h.root.classes=[];fx.advance(1100);
  higher.classes=['midboss','team_neutral'];assert.equal(computed(fx.name,'visibility'),'collapse');assert.equal(computed(fx.fill,'washColor').toUpperCase(),'#5BEFB5');
  higher.classes=['neutral_vault','team_neutral','ShowHealthValue','active_damage_by_local_player'];
  assert.equal(computed(fx.name,'visibility'),'visible');assert.equal(computed(fx.name,'transform'),'none');
  assert.equal(computed(fx.value,'visibility'),'visible');assert.equal(computed(fx.value,'opacity'),'1');assert.equal(fx.value.GetParent(),fx.info);
  higher.classes=[];fx.h.root.classes=['player','friend'];assert.equal(computed(fx.fill,'washColor').toUpperCase(),'#FFEFD7');
});

test('empty stock opacity and native state survive restart when panel cache is cleared',()=>{
  const fx=fixture();fx.advance(600);allCoreFeatures(fx);fx.edit('barVisible',false);fx.primary.AddClass('healthbar_empty');
  fx.root.AddClass('HideName');fx.edit('enabled',false);assert.equal(computed(fx.primary,'opacity'),'0.4');assert.equal(computed(fx.name,'visibility'),'collapse');
  fx.api.stop();fx.api.start();fx.advance(600);assert.equal(computed(fx.primary,'opacity'),'0.4');assert.equal(computed(fx.name,'visibility'),'collapse');
  fx.boot.includeScripts();fx.advance(600);assert.equal(computed(fx.primary,'opacity'),'0.4');
  fx.primary.RemoveClass('healthbar_empty');fx.root.RemoveClass('HideName');
  assert.equal(fx.primary.style.opacity,undefined);assert.equal(computed(fx.name,'visibility'),'visible');
});

test('stop write failure retains exact lease for reinclusion retry and cancels old jobs',()=>{
  const fx=fixture({inline:'#abcdef'});fx.advance(600);let fail=true;
  const native=fx.fill.style;fx.fill.style=new Proxy(native,{set(target,key,value){if(key==='washColor'&&fail)throw new Error('teardown race');target[key]=value;return true;}});
  fx.api.stop();assert.equal(fx.h.scheduler.jobs.length,0);assert.equal(fx.api.status.state,'stopped');
  assert.ok(fx.root.HPColorsV3StockLedger.some(owner=>owner.panel===fx.fill&&owner.owned));
  fail=false;fx.boot.includeScripts();fx.advance(600);fx.edit('enabled',false);assert.equal(fx.fill.style.washColor,'#abcdef');
  assert.equal(fx.h.scheduler.jobs.length,1);
});

test('cold native class-read failures back off for a second instead of an overdue 1ms loop',()=>{
  const fx=fixture();fx.advance(600);fx.edit('enabled',false);let attempts=0;
  const carrier=fx.h.root,native=carrier.BHasClass.bind(carrier);
  carrier.BHasClass=name=>{attempts++;throw new Error('native class race: '+name);};
  fx.advance(5500);assert.ok(attempts>=4&&attempts<=6,'bounded retries: '+attempts);assert.equal(fx.h.scheduler.jobs.length,1);
  assert.equal(fx.api.status.state,'dormant');carrier.BHasClass=native;carrier.classes=['player','friend'];
  fx.advance(1100);assert.equal(computed(fx.fill,'washColor').toUpperCase(),'#FFEFD7');assert.equal(fx.h.scheduler.jobs.length,1);
});

test('deeper plain ancestry remains supported without claiming representative-depth operation ceilings',()=>{
  const fx=fixture({prepare(parts,h){let child=h.root;for(let i=0;i<6;i++){const parent=new MockPanel('Plain'+i,{operationCounts:h.operationCounts});parent.add(child);child=parent;}}});
  fx.advance(600);assert.equal(fx.fill.style.washColor,'#fe681b');fx.advance(6000);assert.equal(fx.h.scheduler.jobs.filter(job=>job.fn.name==='rendererTick').length,1);
  fx.h.root.classes=['player','friend'];fx.advance(1100);assert.equal(fx.value.GetParent(),fx.info);assert.equal(fx.api.status.state,'idle');
});

test('missing owned frame fails closed; zero layout keeps ownership and recovers without duplicate labels or NaN styles',()=>{
  const missing=fixture({prepare(parts){parts.row.valid=false;}});missing.advance(600);
  assert.equal(missing.api.status.state,'dormant');assert.equal(missing.fill.style.washColor,undefined);assert.equal(missing.value.GetParent(),missing.info);
  missing.row.valid=true;missing.advance(1100);assert.equal(missing.value.GetParent(),missing.row);
  const fx=fixture();fx.advance(600);fx.inner.actuallayoutwidth=0;fx.advance();assert.notEqual(fx.api.status.state,'dormant');assert.equal(fx.value.GetParent(),fx.row);
  fx.inner.actuallayoutwidth=138;fx.advance(150);assert.equal(fx.value.GetParent(),fx.row);
  for(const owner of fx.root.HPColorsV3StockLedger) if(owner.key!=='@parent') assert.doesNotMatch(String(owner.value),/NaN|Infinity/);
  fx.info.valid=false;fx.advance(1100);assert.equal(fx.api.status.state,'dormant');assert.equal(fx.value.IsValid(),true);
  fx.info.valid=true;fx.advance(1100);assert.equal(fx.value.GetParent(),fx.row);
  fx.edit('enabled',false);assert.equal(fx.value.GetParent(),fx.info);
});

for(const afterMutation of [false,true]) test('native adoption failure rolls back parents and retains binding for retry: '+afterMutation,()=>{
  let fail=true,original;
  const fx=fixture({prepare(parts){original=parts.value;const set=parts.value.SetParent.bind(parts.value);
    parts.value.SetParent=parent=>{if(fail){fail=false;if(afterMutation)set(parent);throw new Error('Native adoption race');}set(parent);};}});
  fx.advance(600);assert.equal(fx.api.status.state,'dormant');assert.equal(fx.value,original);assert.equal(fx.value.GetParent(),fx.info);
  assert.equal(fx.status.GetParent(),fx.root);assert.equal(fx.name.GetParent(),fx.root);assert.equal(fx.fill.style.washColor,undefined);
  fx.advance(1100);assert.equal(fx.value,original);assert.equal(fx.value.GetParent(),fx.row);assert.equal(fx.fill.style.washColor,'#fe681b');
});

test('initially unclassified ancestor gaining player enemy wakes the dormant renderer', () => {
  const fx = fixture({classes: []}); fx.advance(1200);
  assert.equal(fx.api.status.state,'dormant');
  assert.equal(fx.fill.style.washColor,undefined);
  fx.h.root.classes = ['player','enemy']; fx.advance(3000);
  assert.equal(fx.fill.style.washColor,'#fe681b');
  assert.notEqual(fx.api.status.state,'dormant');
});

test('menu edit publishes settings-only config, sibling requests deliver to isolated world, off restores stock', () => {
  const fx = fixture(); fx.advance(600);
  assert.ok(fx.relayContexts.length); assert.equal(fx.fill.style.washColor,'#fe681b');
  assert.equal(fx.h.dispatches[0][3],fx.root.GetParent());
  const wire = latestPublishedConfig(fx.menu.harness);
  assert.deepEqual(Object.keys(wire).sort(),['epoch','magic','revision','settings']);
  assert.equal(typeof wire.epoch,'string');
  assert.equal(fx.h.$.HPColorsV3Settings,undefined,'world never evaluates the menu/catalog contract');
  assert.equal(typeof fx.h.$.HPColorsV3WorldSettings.validate,'function');
  fx.edit('barColorLow','#112233'); fx.setHealth(10); fx.advance();
  assert.equal(latestPublishedConfig(fx.menu.harness).settings.side.enemy.barColorLow,'#112233');
  assert.equal(fx.fill.style.washColor,'#112233');
  fx.edit('barColorEnabled',false); fx.advance(); assert.equal(fx.fill.style.washColor,'');assert.equal(computed(fx.fill,'washColor').toUpperCase(),'#FD4949');
  assert.notEqual(fx.api.status.state,'dormant','colors off does not disable geometry or native HP');
  fx.edit('enabled',false); assert.equal(fx.api.status.state,'dormant');
});

test('v2 shipped defaults, fixed bins, gradients, ordered thresholds and team high', () => {
  const fx = fixture(); fx.advance(600);
  const settings = latestPublishedConfig(fx.menu.harness).settings;
  assert.equal(settings.side.enemy.barColorLow,'#FD4949'); assert.equal(settings.side.enemy.barColorMode,'gradient');
  assert.equal(settings.shared.lowThreshold,25); assert.equal(settings.shared.highThreshold,65);
  fx.edit('barColorMode','fixed');
  for (const [hp,color] of [[0,'#FD4949'],[25,'#FD4949'],[26,'#FF7B00'],[65,'#FF7B00'],[66,'#00FF00'],[100,'#00FF00']]) { fx.setHealth(hp); fx.advance(); assert.equal(fx.fill.style.washColor,color); }
  fx.edit('lowThreshold',99); assert.equal(settings.shared.lowThreshold,25);
  assert.equal(latestPublishedConfig(fx.menu.harness).settings.shared.lowThreshold,64);
  fx.edit('lowThreshold',25); fx.edit('barColorMode','gradient');
  for (const [hp,color] of [[25,'#fd4949'],[45,'#fe6225'],[65,'#ff7b00'],[100,'#00ff00']]) { fx.setHealth(hp); fx.advance(); assert.equal(fx.fill.style.washColor.toLowerCase(),color); }
  fx.h.root.AddClass('team2'); fx.edit('barColorTeamHigh',true); fx.advance(1000); assert.equal(fx.fill.style.washColor,'#5b79e6');
});

test('released stock remains tracked through off→ally→neutral, stop/restart and spectating end', () => {
  const fx = fixture(); fx.advance(600); fx.edit('barColorEnabled',false);
  assert.equal(computed(fx.fill,'washColor').toUpperCase(),'#FD4949');
  fx.h.root.classes = ['player','friend']; fx.advance(1100); assert.equal(computed(fx.fill,'washColor').toUpperCase(),'#FFEFD7');
  fx.api.stop(); fx.api.start(); fx.advance(600); assert.equal(computed(fx.fill,'washColor').toUpperCase(),'#FFEFD7');
  fx.h.root.classes = ['boss_tier1','team_neutral']; fx.advance(1100); assert.equal(computed(fx.fill,'washColor').toUpperCase(),'#5BEFB5');
  fx.h.root.classes = ['player','enemy','team1','spectating']; fx.advance(1100); assert.equal(computed(fx.fill,'washColor').toUpperCase(),'#E7B659');
  fx.h.root.RemoveClass('spectating'); fx.advance(1100); assert.equal(computed(fx.fill,'washColor').toUpperCase(),'#FD4949');
  fx.edit('barColorEnabled',true); fx.setHealth(100); fx.advance(1000); assert.equal(fx.fill.style.washColor,'#00ff00');
  fx.edit('barColorEnabled',false); assert.equal(fx.fill.style.washColor,'','never recapture our own customization as explicit stock');
});

test('captured nonpalette stock and released records survive renderer reinclusion', () => {
  const fx = fixture({inline:'#abcdef'}); fx.advance(600); fx.edit('barColorEnabled',false);
  assert.equal(fx.fill.style.washColor,'#abcdef');
  fx.h.root.classes = ['player','friend']; fx.boot.includeScripts(); fx.advance(600);
  assert.equal(fx.fill.style.washColor,'#abcdef','captured non-empty inline value remains exact across relation changes');
  fx.h.root.classes = ['boss_tier1','team_neutral']; fx.advance(1100); assert.equal(fx.fill.style.washColor,'#abcdef');
});

test('explicit inline stock is preserved even when it matches another relation palette', () => {
  const fx = fixture({inline:'#FFEFD7'}); fx.advance(600); fx.edit('barColorEnabled',false);
  assert.equal(fx.fill.style.washColor,'#FFEFD7');
});

test('failed native release remains tracked and retries exact stock', () => {
  const fx = fixture({classes:['player','enemy','team1','spectating']}); fx.advance(600);
  let fail = true; const native = fx.fill.style;
  fx.fill.style = new Proxy(native,{set(target,key,value) { if (key === 'washColor' && fail) throw new Error('Native write race'); target[key]=value; return true; }});
  fx.edit('barColorEnabled',false); assert.equal(fx.fill.style.washColor,'#fe681b');
  fail=false; fx.advance(1000); assert.equal(fx.fill.style.washColor,'');assert.equal(computed(fx.fill,'washColor').toUpperCase(),'#E7B659');
});

for (const part of ['shield','armor']) test('health fraction corrects visible primary '+part+' allocation and signature changes', () => {
  const fx = fixture(); fx.advance(600); fx.setHealth(200/3);
  const panel = fx[part]; panel.AddClass('HasHealth'); panel.style.clip = 'rect(0%, 100%, 100%, 66.6666666667%)';
  fx.advance(); assert.equal(fx.fill.style.washColor,'#00ff00');
  assert.ok(Math.abs(fx.api.facts().fraction-1)<1e-8);
  assert.equal(fx.duplicate.style.washColor,'#aabbcc','separate UnitShieldbar never touched');
  panel.style.clip = 'rect(0%, 80%, 100%, 66.6666666667%)'; fx.advance();
  assert.ok(fx.api.facts().fraction<1,'layer extent alone invalidates idle probe');
  panel.style.visibility='collapse';fx.advance(1600);
  assert.ok(Math.abs(fx.api.facts().fraction-2/3)<1e-8,'hidden percent-clipped layers release allocation on the full-paint cadence');
  panel.style.visibility='visible';fx.advance(1600);
  panel.visible=false;fx.setHealth(60);fx.advance();
  assert.ok(Math.abs(fx.api.facts().fraction-0.6)<1e-8,'fill changes refresh the native visible flag immediately');
  panel.visible=true;fx.setHealth(200/3);fx.advance();assert.ok(fx.api.facts().fraction>2/3);
});

test('unclipped health geometry normalizes each panel own UI scale and observes transform changes', () => {
  const fx = fixture(); fx.advance(600);
  fx.fill.style.clip = ''; fx.fill.actuallayoutwidth = 34.5; fx.fill.actualuiscale_x = 1;
  fx.advance(); assert.equal(fx.api.facts().fraction,0.5); assert.equal(fx.fill.style.washColor,'#fe681b');
  fx.fill.style.transform = 'scaleX(0.25)'; fx.advance();
  assert.equal(fx.api.facts().fraction,0.25); assert.equal(fx.fill.style.washColor,'#FD4949');
});

test('publisher context recreation resets revision but new epoch paints subsequent edits', () => {
  const fx = fixture(); fx.advance(600); fx.setHealth(0);
  fx.edit('barColorLow','#112233'); fx.edit('barColorLow','#445566'); fx.advance();
  const old = latestPublishedConfig(fx.menu.harness); assert.ok(old.revision>=2);
  mountMenu(fx.net); const current = latestPublishedConfig(fx.menu.harness);
  assert.notEqual(current.epoch,old.epoch); assert.equal(current.revision,0);
  fx.edit('barColorLow','#778899'); fx.advance(); assert.equal(fx.fill.style.washColor,'#778899');
  fx.net.broadcast(JSON.stringify({magic:old.magic,epoch:current.epoch,revision:0,settings:old.settings}));
  assert.equal(fx.fill.style.washColor,'#778899','same-epoch stale revision rejected');
});

test('N-world broadcast requests are coalesced; duplicate configs and requests cause no N×N world parses', () => {
  const net = network(), bars = Array.from({length:12},() => fixture({network:net})); net.advance(600);
  const before = net.broadcasts.filter(raw => raw.includes(MAGIC)).length;
  const parses = bars.map(fx => fx.h.operationCounts.jsonParses);
  for (const fx of bars) assert.equal(fx.h.$.HPColorsV3Bridge.request(-1,''),true);
  net.advance(500);
  const answers = net.broadcasts.filter(raw => raw.includes(MAGIC)).length - before;
  assert.ok(answers<=1,'one coalesced answer per half second');
  for (let i=0;i<bars.length;i++) {
    assert.equal(bars[i].h.operationCounts.jsonParses,parses[i],'raw compare precedes JSON parse');
    assert.equal(bars[i].fill.style.washColor,'#fe681b');
  }
});

test('world boot runs at include without dialog onload; renderer alone exports without self-start', () => {
  const fx = fixture({ancestor:true}); fx.advance(600); assert.equal(fx.fill.style.washColor,'#fe681b');
  assert.equal(fx.boot.panelNode.attrs.onload,undefined);
  const isolated = loadLayout('unit_status_overlay_v2.xml',{skipScripts:['hp_colors_v3_world_boot']}); isolated.includeScripts();
  assert.equal(isolated.harness.scheduler.jobs.length,0);
  assert.equal(typeof isolated.harness.$.HPColorsV3Renderer.plan,'function');
  const old = fx.api; fx.boot.includeScripts();
  fx.net.broadcast(JSON.stringify({magic:'HPV3_PICKUP_SCAN_GATE',scan:true,localName:'LOCAL',since:0,at:fx.h.now}));
  fx.advance(600);
  assert.equal(old.status.state,'stopped'); assert.equal(fx.h.scheduler.jobs.filter(job=>job.fn.name==='rendererTick').length,1);
  assert.equal(fx.h.handlerEntries.filter(e => e.channel === 'ClientUI_FireOutput').length,1);
});

for (const classes of [['boss_tier1','enemy'],['building','enemy'],['player','enemy','friend'],['player','enemy','team_neutral'],['player','enemy','boss_tier1']]) test('nonhero/ambiguous stays stock: '+classes.join(' '),() => {
  const fx = fixture({classes}); fx.advance(5000); assert.equal(fx.fill.style.washColor,undefined); assert.equal(fx.api.status.state,'dormant');
});

test('missing/invalid/stale config and invalid context remain safe', () => {
  const fx = fixture({deliver:false}); fx.advance(30000); assert.equal(fx.fill.style.washColor,undefined);
  const handler = fx.h.handlerEntries.find(e => e.channel === 'ClientUI_FireOutput').fn;
  const local = latestPublishedConfig(fx.menu.harness), raw = JSON.stringify(local);
  for (const mutate of [d=>{d.epoch='';},d=>{d.revision=-1;},d=>{d.revision=.5;},d=>{d.settings.side.enemy.barColorLow='red';},
    d=>{d.settings.side.enemy.barColorMode='bad';},d=>{d.settings.shared.lowThreshold=65;},d=>{d.settings.side.ally.barWidth=NaN;},
    d=>{d.settings.side.ally.barHeight=0;},d=>{d.settings.side.enemy.hpTextFont='missing';},d=>{d.settings.side.enemy.nameColor='#123456ff';},
    d=>{d.settings.side.enemy.nameOutline=7.25;},d=>{d.settings.side.enemy.barOutlineOpacity=101;},d=>{d.settings.side.ally.hpTextVisible=1;}]) {
    const bad = JSON.parse(raw); mutate(bad); handler(JSON.stringify(bad)); assert.equal(fx.api.status.revision,-1);
  }
  handler(raw); fx.advance(); assert.equal(fx.fill.style.washColor,'#fe681b');
  const count = fx.h.operationCounts.jsonParses; handler(raw); assert.equal(fx.h.operationCounts.jsonParses,count);
  fx.root.valid=false; fx.advance(1000); assert.equal(fx.h.scheduler.jobs.length,0);
});

test('cached idle facts pure/memoized and dead fill recovered at one-second lineage cadence', () => {
  const fx = fixture(); fx.advance(600); fx.advance(1000); const plans=fx.api.status.plansComputed; fx.advance(3000); assert.equal(fx.api.status.plansComputed,plans);
  const facts=fx.api.facts(), counts={...fx.h.operationCounts}, planned=fx.api.plan(facts,latestPublishedConfig(fx.menu.harness).settings);
  assert.equal(planned.styles.fill.washColor,'#fe681b'); assert.deepEqual(JSON.parse(JSON.stringify(planned.parents)),{status:'motion',name:'motion',value:'row',killStreak:{parent:'ult',before:'ultBackground'},rejuv:'rejuvAnchor'});
  assert.deepEqual(fx.h.operationCounts,counts);
  fx.fill.DeleteAsync(0); const replacement = new MockPanel('Panel',fx.inner,'unit_healthbar_lagging'); replacement.style.clip='rect(0%, 100%, 100%, 0%)';
  fx.advance(1100); assert.equal(replacement.style.washColor,'#00ff00');
});

test('debug timing/carrier lifecycle logs are observable and release remains silent', () => {
  const fx = fixture(); fx.advance(6000);
  fx.h.root.classes = ['player','friend']; fx.advance(1000);
  if (process.env.HPV3_DEBUG === '1') {
    assert.ok(fx.h.logs.some(line => line.startsWith('[HPV3] renderer timing')));
    assert.ok(fx.h.logs.some(line => line.startsWith('[HPV3] renderer carrier changed')));
    const depths=fx.h.logs.filter(line=>line.startsWith('[HPV3] renderer carrier depth='));
    assert.equal(depths.length,1,'one observation per carrier, not per role change/tick');
    assert.match(depths[0],/depth=2 ancestry=2 /);
  } else assert.deepEqual(fx.h.logs,[]);
});

for (const [scenario,ceiling] of [['active',300],['idle',200],['dormant',30],['released',30],['releasedSplitStock',30],['shieldedActive',300],['pulseActive',300],['pulseIdle',200],['shieldedPulseActive',300],['arrowPulseIdle',200],['shieldedArrowPulseActive',300],['pickupArrowPulseIdle',200],['shieldedPickupArrowPulseActive',300],['ordinaryEffectsPickupArrowPulseIdle',200],['ordinaryEffectsShieldedPickupArrowPulseActive',300],['ultimateOrdinaryEffectsPickupArrowPulseIdle',200],['ultimateOrdinaryEffectsShieldedPickupArrowPulseActive',300],['ultimateOrdinaryEffectsShieldedPickupArrowPulseIdle',200],['ultimateChurn12PickupArrowPulseIdle',200],['ultimateChurn24PickupArrowPulseIdle',200],['ultimateManyEffectsPickupArrowPulseIdle',200],['ultimateChurn12ShieldedPickupArrowPulseIdle',200],['ultimateChurn24ShieldedPickupArrowPulseIdle',200],['ultimateManyEffectsShieldedPickupArrowPulseIdle',200],
    // Ticket 19 bar styles (V1 is every scenario above): V2 masks are class-only; OLD adds the line-total probe and box writes.
    ['maskActive',300],['maskIdle',200],['oldActive',300],['oldIdle',200],['shieldedPulseOldActive',300],['pulseOldIdle',200],
    ['ultimateOrdinaryEffectsShieldedPickupArrowPulseOldActive',300],['ultimateOrdinaryEffectsShieldedPickupArrowPulseOldIdle',200],
    // Audit 19: 50 lines (12,500 HP, 125 boxes) and the 128-box cap (12,749 HP) under the full stress fixture.
    ['oldHp12500Active',300],['oldHp12500Idle',200],['ultimateOrdinaryEffectsShieldedPickupArrowPulseOldHp12500Active',300],
    ['ultimateOrdinaryEffectsShieldedPickupArrowPulseOldHp12500Idle',200],['ultimateOrdinaryEffectsShieldedPickupArrowPulseOldHp12749Active',300],
    ['ultimateOrdinaryEffectsShieldedPickupArrowPulseOldHp12749Idle',200],
    // Ticket 20: non-default shake strength and all three tilts are a class swap and plan-memoised inline values.
    ['shakeTiltActive',300],['shakeTiltIdle',200],['ultimateChurn12ShieldedPickupArrowPulseShakeTiltIdle',200],
    ['ultimateOrdinaryEffectsShieldedPickupArrowPulseShakeTiltActive',300],['shakeOffTiltOldActive',300],
    // Ticket 21: non-default outline widths, both alignments and offsets are plan-memoised inline values.
    ['textAlignActive',300],['textAlignIdle',200],['ultimateOrdinaryEffectsShieldedPickupArrowPulseTextAlignShakeTiltActive',300],
    ['ultimateChurn12ShieldedPickupArrowPulseTextAlignIdle',200],['textAlignOldActive',300],['textAlignOldIdle',200],
    // Ticket 22: SHOW BOUNDS is one owned root class; the HUD color lives in the menu, not on world bars.
    ['boundsActive',300],['boundsIdle',200],
    // Audit whole 3: hero bars with every unit gate open (NPC tags on a player cannot change ownership).
    // Ticket 28: all three label leases coexist with the expensive active/idle fixtures.
    ['ultimateOrdinaryEffectsShieldedPickupArrowPulseLabelsActive',300],['ultimateChurn12ShieldedPickupArrowPulseLabelsIdle',200],
    ['ultimateChurn12ShieldedPickupArrowPulseUnitGatesIdle',200],['ultimateOrdinaryEffectsShieldedPickupArrowPulseUnitGatesActive',300],['ultimateOrdinaryEffectsShieldedPickupArrowPulseBoundsTextAlignShakeTiltActive',300],['ultimateChurn12ShieldedPickupArrowPulseBoundsIdle',200],
    ['ultimateOrdinaryEffectsShieldedPickupArrowPulseLowStaminaActive',300],['ultimateChurn12ShieldedPickupArrowPulseLowStaminaIdle',200],
    ['ultimateOrdinaryEffectsShieldedPickupPulseLowStaminaActive',300],['ultimateChurn12ShieldedPickupPulseLowStaminaIdle',200],
    ['ultimateChurn12ShieldedPickupArrowPulseLowStaminaHiddenIdle',200],['ultimateChurn12ShieldedPickupPulseLowStaminaHiddenIdle',200],
    // Review: six charges (base 4 plus Superior Stamina), the label leases and the show class on the window root.
    ['ultimateChurn12ShieldedPickupPulseLabelsLowStaminaSixRootIdle',200],['ultimateChurn12ShieldedPickupArrowPulseLabelsLowStaminaSixRootIdle',200],
    ['ultimateOrdinaryEffectsShieldedPickupArrowPulseLabelsLowStaminaSixRootActive',300],
    // Vyper's ten charges: idle reads stretch so the idle ceiling still holds.
    ['ultimateChurn12ShieldedPickupArrowPulseLabelsLowStaminaTenRootIdle',200],['ultimateOrdinaryEffectsShieldedPickupArrowPulseLabelsLowStaminaTenRootActive',300],
    // Ticket 50: kill bounty snapshots every 2 s with a new value every 4 s (faster than the game moves it).
    ['ultimateChurn12ShieldedPickupArrowPulseBountyIdle',200],['ultimateOrdinaryEffectsShieldedPickupArrowPulseBountyActive',300],
    // Ticket 51: HP percent on both sides (one owned label text per percent step; tilt turns the row).
    ['ultimateChurn12ShieldedPickupArrowPulseHpPercentIdle',200],['ultimateOrdinaryEffectsShieldedPickupArrowPulseHpPercentTiltActive',300]]) test(scenario+' operation ceiling includes world JSON parses',t => {
  const mode = scenario.startsWith('released') ? 'dormant' : /Idle$/.test(scenario)?'idle': /Active$/.test(scenario)?'active':scenario;
  const hpTotal = /Hp(\d+)/.exec(scenario), total = hpTotal ? Number(hpTotal[1]) : 2000;
  const churn = /Churn(\d+)/.exec(scenario), ordinary = /ManyEffects/.test(scenario) ? 96 : /ordinaryEffects/i.test(scenario) ? 12 : 0;
  let effectContainer;
  const fx=fixture({classes:scenario==='dormant'?['boss_tier1','enemy']:['player','enemy'],prepare(parts) {
    // 2000 HP unless the scenario names a total: the engine positions each line at 250k/total (read only by BAR STYLE OLD).
    for(let i=1;i<=Math.floor(total/250);i++){const line=new MockPanel('Panel',parts.lines,'EngineLine'+i);line.AddClass(i%4?'line_small':'line_large');line.style.position=(250*i/total*100)+'% 0px 0px';}
    engineStamina(parts,{contextPanel:parts.status.GetParent()});
    const charges=/Ten/.test(scenario)?10:/Six/.test(scenario)?6:4;
    for(let i=4;i<charges;i++) {
      const pip=new MockPanel('Panel',parts.stamina,'EngineStamina'+i);pip.AddClass('StaminaPip');
      const icon=new MockPanel('Panel',pip,'EngineStaminaIcon'+i);icon.AddClass('StaminaPipIcon');parts.staminaPips.push({pip,icon});
    }
    if (/pickup/i.test(scenario)) enginePickups(parts,{contextPanel:parts.status.GetParent()});
    if (ordinary || churn) {
      effectContainer=parts.pickups[0].icon.GetParent();
      for(let i=0;i<ordinary;i++) {
        const effect=new MockPanel('Panel',effectContainer,'Ordinary'+i);effect.AddClass('statusEffect');
        const wrapper=new MockPanel('Panel',effect,'OrdinaryContents'+i);
        for(let j=0;j<6;j++)new MockPanel('Panel',wrapper,'OrdinaryArt'+i+'-'+j);
      }
    }
    // Full native availability remains the worst case for customized arrow polling.
    if (scenario === 'idle' || /Idle$/.test(scenario) || /shielded/i.test(scenario)) for(const {pip,icon} of parts.staminaPips)
      for(const name of ['PipEmpty','StaminaRecentlyUsed','StaminaRecentlyDepleted']) {pip.RemoveClass(name);icon.RemoveClass(name);}
  }}); fx.advance(6000);
  allCoreFeatures(fx);fx.edit('lineOpacity',40);fx.edit('killMarkerEnabled',true);
  fx.edit('ultSize',30);fx.edit('ultOffsetX',12);fx.levelLabel.text='19';fx.advance(1100);
  fx.edit('staminaShape','box');fx.edit('staminaColorEnabled',true);fx.edit('staminaWidth',22);fx.edit('staminaOffsetX',12.3);
  if (/arrow/i.test(scenario)) fx.edit('staminaShape','arrow');
  if (/^old|Old/.test(scenario)) fx.edit('barStyle','old');
  if (/^mask/.test(scenario)) fx.edit('barStyle','original');
  if (/ShakeTilt|shakeTilt/.test(scenario)) {fx.edit('damageShakeStrength',7);fx.edit('rejuvTilt',-40);}
  if (/shakeOff/.test(scenario)) fx.edit('damageShakeEnabled',false);
  if (/[Tt]ilt/.test(scenario)) {fx.edit('nameTilt',-12);fx.edit('hpTextTilt',15);fx.edit('hpTextTilt',-9,'ally');}
  if (/[Tt]extAlign/.test(scenario)) for(const [side,align,width] of [['enemy','left',0],['ally','right',10]]) {
    fx.edit('nameAlign',align,side);fx.edit('hpTextAlign',align==='left'?'center':'right',side);fx.edit('nameOutline',width,side);fx.edit('hpTextOutline',10-width,side);
    fx.edit('nameOffsetX',side==='enemy'?14:-9,side);fx.edit('nameOffsetY',-5,side);fx.edit('hpTextOffsetX',-12,side);
  }
  if (/UnitGates/.test(scenario)) openUnitGates(fx);
  if (/HpPercent/.test(scenario)) {fx.edit('hpTextVisible',true,'ally');fx.edit('hpTextFormat','both');fx.edit('hpTextFormat','percent','ally');}
  if (/Bounds/i.test(scenario)) {toggleBounds(fx.menu);fx.edit('hudHealthColorMode','team');fx.edit('hudHealthColor','#123456');}
  if (/Labels/.test(scenario)) for(const key of ['critical','assassinate','unkillable']){
    fx.edit(key+'IndicatorVisible',false);fx.edit(key+'OffsetX',17);fx.edit(key+'OffsetY',-11);
  }
  // Ticket 35: team HP number and team stamina with the low threshold always met (10 >= any count).
  // Shown keeps the game's stamina row visible the whole window (worst case); Hidden leaves it hidden.
  if (/LowStamina/.test(scenario)) {
    if (!/Hidden/.test(scenario)) (/Root/.test(scenario) ? fx.root : fx.parts.stamina).AddClass('StaminaRecentlyUsed');
    fx.h.root.AddClass('team2');fx.edit('hpTextColorMode','team');
    fx.edit('staminaColorMode','team');fx.edit('staminaLowThreshold',10);fx.edit('staminaLowColor','#ABCDEF');
  }
  if (scenario.startsWith('released')) fx.edit('enabled',false);
  if (scenario === 'releasedSplitStock') {
    const higher=new MockPanel('Higher',{classes:['team_neutral','HideName'],operationCounts:fx.h.operationCounts});higher.add(fx.root);
    fx.advance(2600);
  }
  if (/shielded/i.test(scenario)) {
    fx.shield.AddClass('HasHealth'); fx.shield.style.clip = 'rect(0%, 85%, 100%, 80%)';
    fx.armor.AddClass('HasHealth'); fx.armor.style.clip = 'rect(0%, 90%, 100%, 85%)';
  }
  if (/pulse/i.test(scenario)) {
    fx.edit('pulseThreshold',100);fx.edit('pulseColorEnabled',true);fx.edit('pulseReadout',true);
    fx.setHealth(10);
  }
  if (/ultimate/i.test(scenario)) {
    fx.name.text='REMOTE';fx.ultReady.visible=false;
    fx.edit('ultimateTimerColorMode','gradient');
    fx.net.broadcast(JSON.stringify({magic:'HPV3_PICKUP_SCAN_GATE',scan:true,localName:'LOCAL',since:0,at:fx.h.now}));
    fx.net.broadcast(JSON.stringify({magic:'HPV3_ULTIMATE_SNAPSHOT',since:0,at:fx.h.now,players:[['REMOTE',90,2]]}));
  }
  const bountyAt=value=>JSON.stringify({magic:'HPV3_BOUNTY_SNAPSHOT',since:0,at:fx.h.now,players:[['REMOTE',value],['OTHER',600]]});
  if (/Bounty/.test(scenario)) {fx.edit('killBountyEnabled',true);fx.net.broadcast(bountyAt(1460));}
  fx.advance(1000);
  for (const key of Object.keys(fx.h.operationCounts)) fx.h.operationCounts[key]=0;
  const timerStarted=fx.h.now;
  let injected=0;
  for (let ms=0;ms<10000;ms+=100) {
    if(churn && ms%3000===0) {
      const before={...fx.h.operationCounts};
      for(const panel of [...effectContainer.children]) if(/^Churn/.test(panel.id)) panel.DeleteAsync(0);
      for(let i=0;i<Number(churn[1]);i++) {
        const panel=new MockPanel('Panel',effectContainer,'Churn'+ms+'-'+i);panel.classes=['statusEffect'];
      }
      // Engine fixture mutations are not renderer API calls; measure only its scheduled response.
      for(const key of Object.keys(fx.h.operationCounts)) fx.h.operationCounts[key]=before[key]||0;
    }
    if (mode==='active') {fx.setHealth(50+(ms/100)%30);injected++;}
    if(/ultimate/i.test(scenario)&&ms%2000===0)
      fx.net.broadcast(JSON.stringify({magic:'HPV3_ULTIMATE_SNAPSHOT',since:0,at:fx.h.now,players:[['REMOTE',92+2*(fx.h.now-timerStarted)/1000,2]]}));
    if(/Bounty/.test(scenario)&&ms%2000===0)fx.net.broadcast(bountyAt(1460+10*Math.floor((fx.h.now-timerStarted)/4000)));
    if(/ultimate/i.test(scenario)&&ms%5000===0)
      fx.net.broadcast(JSON.stringify({magic:'HPV3_PICKUP_SCAN_GATE',scan:true,localName:'LOCAL',since:0,at:fx.h.now}));
    fx.advance(100);
  }
  const operations={...fx.h.operationCounts}; operations.styleWrites-=injected;
  const ops=COUNTED.reduce((sum,key)=>sum+(operations[key]||0),0)/10;
  function observe(panel) { return [panel.id, [...panel.classes].sort(), {...panel.style}, panel.__text, panel.children.map(observe)]; }
  const observedDigest = crypto.createHash('sha256').update(JSON.stringify(observe(fx.root))).digest('hex');
  t.diagnostic(JSON.stringify({scenario,mode,COUNTED:ops,boundaryValidityCallsPerBarSecond:(operations.boundaryValidityCalls||0)/10,validityCallsPerBarSecond:(operations.validityCalls||0)/10,uiScaleReadsPerBarSecond:(operations.uiScaleReads||0)/10,classTraversalNodesPerBarSecond:(operations.classTraversalNodes||0)/10,operations,observedDigest}));
  assert.ok(ops<=ceiling,`${ops} > ${ceiling}`); assert.ok(operations.traversal<=(/pickup/i.test(scenario)?350:180),'bounded topology reconciliation');
  if (mode!=='dormant' && !/^old|Old|^mask|Labels|LowStamina|Bounty|HpPercent/.test(scenario)) assert.ok(ops<=(mode==='idle'?194.3:219.3),'closed unit gates preserve the pre-Units hero polling budget: '+ops);
  // Ticket 50: on top of that budget the bounty may add only its 5 snapshot parses and, per new value, one name read and one label write (0.9/s).
  if (/Bounty/.test(scenario)) assert.ok(ops<=(mode==='idle'?194.3:219.3)+0.9+1e-9,'the bounty adds only its JSON parses and one name read and label write per new value: '+ops);
  // Ticket 51: idle costs nothing; the active sweep (a new health every 100 ms) adds one percent text write per shown step
  // (25 in 10 s) and the percent's copy of the moving gradient color (21): 4.6/s measured, no reads.
  if (/HpPercent/.test(scenario)) {
    assert.ok(ops<=(mode==='idle'?194.3:219.3+4.6)+1e-9,'the HP percent adds only its text and color writes: '+ops);
    assert.equal(fx.row.FindChild('HPColorsV3HPPercent').text.endsWith('%'),true,'HP percent path was exercised');
  }
  if (/LowStaminaHidden/.test(scenario)) assert.ok(ops<=194.3,'hidden low-stamina charges cost no more than the plain idle budget: '+ops);
  if (/LowStamina/.test(scenario)) {
    const icon=fx.parts.staminaPips[0].icon;
    if (/Arrow/.test(scenario)) assert.equal(icon.style.washColor,'#ABCDEF','low stamina path was exercised');
    else assert.equal(fx.parts.stamina.style.washColor,'#ABCDEF','low stamina path was exercised');
    assert.equal(fx.value.style.washColor.toUpperCase(),'#5B79E6','team HP number was exercised');
  }
  if (/^old|Old/.test(scenario)) {assert.equal(fx.root.BHasClass('HPColorsV3BarPips'),true,'OLD boxes were painted throughout');assert.equal(oldGrid.boxes(fx.primary.FindChild('HPColorsV3PipGrid').FindChild('HPColorsV3PipEmpty')).length,Math.ceil(total/100-0.05));
    if (mode==='active') assert.ok(ops<=270,'OLD active keeps 30 ops of margin under 300: '+ops);}
  if (/^mask/.test(scenario)) assert.equal(fx.root.BHasClass('HPColorsV3BarMask'),true);
  if (/shakeOff/.test(scenario)) assert.deepEqual(shakeClasses(fx.root),['HPColorsV3ShakeOff'],'shake off holds its class under OLD');
  if (/Bounds/i.test(scenario)) assert.equal(fx.root.BHasClass('HPColorsV3Bounds'),true,'bounds shown throughout');
  assert.ok((operations.classTraversalNodes||0)/10<=1500,'native class queries walk at most 1500 nodes/bar/s (1256 measured worst case plus 244 headroom)');
  assert.equal(operations.jsonParses,(/ultimate/i.test(scenario)?7:0)+(/Bounty/.test(scenario)?5:0),'only the registered timer hook parses the heartbeat traffic');
  assert.equal(operations.parentWrites,0);assert.equal(operations.classWrites,0);
  // The bounty label is written once per new value (1470, 1480 in the window), never per tick; the HP percent
  // once per shown percent step of the active sweep (25), never while health holds.
  assert.equal(operations.textWrites,/Bounty/.test(scenario)?2:/HpPercent/.test(scenario)&&mode==='active'?25:0);
  if (/HpPercent/.test(scenario)) assert.equal(fx.row.FindChild('HPColorsV3HPPercent').BHasClass('HPColorsV3Pulse'),true,'the percent pulses with the number');
  if (/Bounty/.test(scenario)) {assert.equal(fx.root.BHasClass('HPColorsV3KillBounty'),true,'bounty shown throughout');assert.equal(fx.root.FindChildTraverse('HPColorsV3BountyValue').text,'1,480');}
  if(mode==='dormant')assert.equal(operations.textReads,0);
  else assert.ok(operations.textReads>=9&&operations.textReads<=(/ultimate/i.test(scenario)?30:15)+(/Bounty/.test(scenario)?2:0),'level 1s and independent timer sampling/progress cadence stay bounded');
  assert.equal(fx.api.status.state,mode);
  if (mode==='active') assert.ok(operations.styleWrites>30,'moving health really paints');
  if (mode!=='dormant') assert.ok(/^#/.test(fx.fill.style.washColor));
  if (/pulse/i.test(scenario)) {
    assert.equal(fx.fill.BHasClass('HPColorsV3Pulse'),true,'pulse path was exercised throughout the measured window');
    assert.equal(fx.inner.FindChild('HPColorsV3PulseOverlay').BHasClass('HPColorsV3ColorPulse'),true);
    assert.equal(fx.value.BHasClass('HPColorsV3Pulse'),true);
    if(mode==='idle') {
      if(/ultimate/i.test(scenario))assert.ok(operations.styleWrites<=35,'only bounded 1Hz ultimate clips/colors write during CSS pulse');
      else assert.equal(operations.styleWrites,0,'CSS animation performs no JS frame writes');
    }
  }
});

test('audit: released class-driven presentation follows native CSS immediately, with no scheduler tick',()=>{
  const fx=fixture();fx.advance(600);allCoreFeatures(fx);fx.edit('enabled',false);
  fx.h.root.AddClass('active_damage');
  assert.equal(computed(fx.status,'animationName'),'active_damage_wiggle');
  fx.h.root.AddClass('health_critical');fx.root.AddClass('ShowCriticalState');
  assert.equal(computed(fx.stack,'animationName'),'healthCritFlash3');
  assert.equal(computed(fx.stack,'preTransformScale2d'),'1.2');
  fx.h.root.classes=['player','friend','ShowAllyHealthValue','active_damage'];
  assert.equal(computed(fx.fill,'washColor').toLowerCase(),'#ffefd7');
  assert.equal(computed(fx.value,'opacity'),'1');
  assert.equal(computed(fx.value,'visibility'),'visible');
  fx.h.root.AddClass('spectating');
  assert.equal(computed(fx.value,'visibility'),'collapse');
  fx.h.root.classes=['neutral_vault','team_neutral'];
  assert.equal(computed(fx.name,'transform'),'none');
});

test('audit: untouched default names are level like v2 without inline ownership; master off restores the native tilt',()=>{
  const fx=fixture();fx.advance(600);
  assert.equal(computed(fx.name,'transform'),'none','v2 .WindowRoot #name parity fix (ticket 20)');
  assert.equal(computed(fx.name,'padding'),'2px 2px 0px 2px');
  assert.equal(computed(fx.name,'maxWidth'),'170px');
  assert.equal(fx.name.style.transform,undefined);
  fx.edit('enabled',false);
  assert.equal(computed(fx.name,'transform'),'rotateZ(-4deg)');assert.equal(fx.name.style.transform,undefined);
});

test('6790 name box keeps stock text top in customized world and preview names, with box-based clamping',()=>{
  const stock=fs.readFileSync(path.join(sourceRoot,'panorama/styles/unit_status_v2.css'),'utf8').match(/\n#name\s*\{([^}]+)\}/)[1];
  const stockTop=parseFloat(stock.match(/margin-top:\s*([^;]+)/)[1]);
  const stockPadding=stock.match(/padding:\s*([^;]+)/)[1];
  assert.equal(stockTop,45);assert.equal(stockPadding,'2px 2px 0px 2px');
  const fx=fixture();fx.advance(600);
  const menu=fx.menu,find=id=>menu.harness.contextPanel.FindChildTraverse(id);
  modelPreviewLayout({find},1);
  runInVm(find('HPColorsMenuButton').GetAttributeString('onactivate',''),menu.context);
  fx.advance(1600);
  const preview=find('HPColorsPreviewName');
  const top=panel=>parseFloat(computed(panel,'marginTop'))+parseFloat(computed(panel,'padding'));
  assert.equal(top(fx.name),47,'untouched world text stays at the stock ink top');
  for(const side of ['enemy','ally']) {
    find(side==='enemy'?'HPColorsPreviewSideOptionEnemy':'HPColorsPreviewSideOptionAlly').events.onactivate();
    fx.h.root.classes=['player',side==='enemy'?'enemy':'friend'];fx.advance(1600);
    fx.edit('nameColorEnabled',true,side);fx.advance(1600);
    for(const panel of [fx.name,preview]) {
      assert.equal(computed(panel,'marginTop'),stockTop+'px','world and preview use the stock box top');
      assert.equal(computed(panel,'padding'),'2px 5px 0px 5px','custom outline room preserves stock vertical padding');
      assert.equal(top(panel),47,'customizing color does not lift the name');
    }
    fx.edit('nameOffsetY',-210,side);fx.advance(1600);
    assert.equal(position(fx.name.style.transform)[1],-45,'near clamp moves the box, not the text origin');
    assert.equal(position(preview.style.transform)[1],-45);
    fx.edit('nameOffsetY',210,side);fx.advance(1600);
    assert.equal(position(fx.name.style.transform)[1],149,'far clamp uses the 16px world label');
    assert.equal(position(preview.style.transform)[1],145,'far clamp uses the 20px preview label');
    fx.edit('nameOffsetY',0,side);fx.edit('nameColorEnabled',false,side);fx.advance(1600);
    for(const panel of [fx.name,preview]) {
      assert.equal(computed(panel,'padding'),stockPadding,'release returns to native padding');
      assert.equal(top(panel),47);
    }
  }
  fx.edit('enabled',false);fx.advance(1600);
  assert.equal(computed(fx.name,'padding'),stockPadding);
  assert.equal(top(fx.name),47,'master off preserves the stock text top');
});

test('audit: HP-off enemies suppress the native number while HP-off allies retain class-driven show and fade',()=>{
  const enemy=fixture();enemy.advance(600);enemy.edit('hpTextVisible',false);
  enemy.h.root.classes=['player','enemy','ShowHealthValue','active_damage_by_local_player'];
  assert.equal(computed(enemy.value,'visibility'),'collapse');
  const ally=fixture({classes:['player','friend','ShowAllyHealthValue']});ally.advance(600);
  assert.equal(computed(ally.value,'visibility'),'visible');
  assert.equal(computed(ally.value,'opacity'),'0');
  ally.h.root.AddClass('active_damage');
  assert.equal(computed(ally.value,'opacity'),'1');
});

test('audit: momentarily unlaid health keeps the last ownership plan and resumes at the normal 0.15s cadence',()=>{
  const fx=fixture();fx.advance(600);const color=fx.fill.style.washColor;
  fx.inner.actuallayoutwidth=0;fx.advance(150);
  assert.ok(fx.value.GetParent()===fx.row,'unlaid HP label remains in the same owned row');assert.equal(fx.fill.style.washColor,color);
  assert.notEqual(fx.api.status.state,'dormant');
  fx.advance(1600);assert.equal(fx.outline.style.width,'71px','last laid geometry survives a full refresh while collapsed');
  fx.inner.actuallayoutwidth=138;fx.setHealth(10);fx.advance(150);
  assert.equal(fx.fill.style.washColor.toLowerCase(),'#fd4949');
});

test('audit: name-on never leases native visibility or bypasses immediate native class gates',()=>{
  const fx=fixture({classes:['CLASS_PLAYER','enemy']});fx.advance(600);
  assert.equal(computed(fx.name,'visibility'),'collapse');
  assert.equal(fx.name.style.visibility,undefined);
  fx.h.root.AddClass('player');
  assert.equal(computed(fx.name,'visibility'),'visible');
  fx.h.root.AddClass('HideName');
  assert.equal(computed(fx.name,'visibility'),'collapse');
  fx.h.root.RemoveClass('HideName');fx.h.root.AddClass('beingSpectatedInEye');
  assert.equal(computed(fx.name,'visibility'),'collapse');
  fx.edit('nameVisible',false);fx.h.root.RemoveClass('beingSpectatedInEye');
  assert.equal(computed(fx.name,'visibility'),'collapse');
  fx.edit('nameVisible',true);
  assert.equal(computed(fx.name,'visibility'),'visible');
});

test('audit: oversized left and right names center their whole extent instead of their anchor',()=>{
  for(const align of ['left','right']) {
    const fx=fixture();fx.advance(600);fx.measure(fx.name,260,16);fx.edit('nameAlign',align);
    assert.equal(position(fx.name.style.transform)[0],align==='left'?30:-30);
  }
});

test('audit: color-gated bar visibility follows v2 and returns immediately to empty opacity',()=>{
  const fx=fixture();fx.advance(600);fx.primary.AddClass('healthbar_empty');
  assert.equal(computed(fx.primary,'opacity'),'1','enabled colors repaint visible empty bars');
  fx.edit('barVisible',false);assert.equal(computed(fx.primary,'opacity'),'0.01');
  fx.edit('barColorEnabled',false);assert.equal(computed(fx.primary,'opacity'),'0.4');
  fx.edit('barVisible',true);assert.equal(computed(fx.primary,'opacity'),'0.4');
});

test('audit: stable feedback leases avoid per-paint native validity probes',()=>{
  const fx=fixture();fx.advance(2000);let checks=0;
  const valid=fx.healing.IsValid.bind(fx.healing);
  fx.healing.IsValid=()=>{checks++;return valid();};
  for(let i=0;i<6;i++){fx.setHealth(45+i);fx.advance(150);}
  assert.ok(checks<=1,'healing IsValid probes at carrier cadence only: '+checks);
});

test('audit: remaining native geometry and color constants match parsed vendored CSS',()=>{
  const vendor=fs.readFileSync(path.join(__dirname,'../vendor/unit_status_v2.css'),'utf8');
  const rules=[...vendor.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  function native(selector,key) {
    const match=rules.find(rule=>rule[1].split(',').map(value=>value.trim()).includes(selector));
    assert.ok(match,selector);
    const declarations=[...match[2].matchAll(/([\w-]+)\s*:\s*([^;]+);/g)].filter(value=>value[1]===key);
    assert.ok(declarations.length,selector+'.'+key);return declarations.at(-1)[2].trim();
  }
  const macros=Object.fromEntries([...vendor.matchAll(/@define\s+(\w+)\s*:\s*([^;]+);/g)].map(match=>[match[1].toLowerCase(),match[2].trim()]));
  const fx=fixture();fx.advance(600);
  const config=structuredClone(latestPublishedConfig(fx.menu.harness).settings);
  assert.equal(config.side.enemy.nameSize,parseFloat(native('#name','font-size')));
  config.side.enemy.barWidth=parseFloat(native('.UnitHealthbarContainer','width'));
  config.side.enemy.barHeight=parseFloat(native('.UnitHealthbarContainer','height'));
  config.side.enemy.nameSize=parseFloat(native('#name','font-size'));
  config.side.enemy.nameAlign='left';
  for(const [team,macro] of [['team1','team1color'],['team2','team2color']]) {
    const facts={...fx.api.facts(),team,fraction:1};
    config.side.enemy.barColorTeamHigh=true;
    const plan=fx.api.plan(facts,config);
    assert.equal(plan.styles.fill.washColor.toUpperCase(),macros[macro].toUpperCase());
    assert.equal(plan.styles.stack.preTransformScale2d,'1, 1');
    assert.equal(native('#name','transform'),'rotateZ(-4deg)');assert.ok(!/rotateZ/.test(plan.styles.name.transform),'customized names stay level like v2');
    assert.equal(plan.styles.name.maxWidth,parseFloat(native('#name','max-width'))+6+'px');
  }
  config.side.enemy.hpTextVisible=false;
  for(const [side,friend] of [['enemy',false],['ally',true]]) {
    const plan=fx.api.plan({...fx.api.facts(),side,friend},config);
    const right=parseFloat(native(friend?'.friend #UnitHealthbarValue':'#UnitHealthbarValue','margin-right'))+50;
    assert.equal(plan.styles.value.marginRight,right+'px');
    assert.equal(plan.styles.value.marginTop,parseFloat(native('#UnitStatus','margin-top'))+parseFloat(native('#UnitHealthbarValue','margin-top'))+'px');
  }
  const critical=fx.api.plan({...fx.api.facts(),flags:{health_critical:true,ShowCriticalState:true}},config);
  const rgb=native('.enemy.health_critical .ShowCriticalState .UnitHealthbarContainer','background-color').match(/\d+/g);
  assert.equal(critical.styles.outline.backgroundColor.toUpperCase(),'#'+rgb.map(value=>Number(value).toString(16).padStart(2,'0')).join('').toUpperCase());
  const ally=fx.api.plan({...fx.api.facts(),side:'ally',enemy:false,friend:true},config);
  const allyRGB=native('.friend .UnitHealthbarContainer','background-color').match(/\d+/g);
  assert.equal(ally.styles.outline.backgroundColor.toUpperCase(),'#'+allyRGB.map(value=>Number(value).toString(16).padStart(2,'0')).join('').toUpperCase());
});

test('audit: global v2 rectangular and unbacked baseline applies to shield and closed unit gates',()=>{
  for(const classes of [['player','enemy'],['boss_tier1','enemy'],['neutral_weak','team_neutral'],['building','friend']]) {
    const fx=fixture({classes});fx.advance(600);fx.edit('enabled',false);
    const shield=fx.stack.FindChild('UnitShieldbar');
    for(const panel of [fx.primary,fx.inner,fx.lines,shield,shield.FindChild('UnitHealthbarInner')])
      assert.equal(computed(panel,'opacityMask'),undefined,classes.join(' ')+' '+panel.id);
    assert.equal(computed(fx.primary,'backgroundColor'),undefined);assert.equal(computed(shield,'backgroundColor'),undefined);
  }
});

test('audit: closed objective gates never move damage wiggle onto the owned motion frame',()=>{
  for(const objective of ['boss_barracks','boss_tier1','boss_tier2','boss_tier3','building','CLASS_DESTROYABLE_BUILDING','barracks','neutral_vault','midboss']) {
    const fx=fixture({classes:['player','enemy','active_damage',objective]});fx.advance(1100);
    assert.equal(fx.root.BHasClass('HPColorsV3Core'),false,objective);
    assert.equal(computed(fx.motion,'animationName'),undefined,objective);
  }
});

test('indicator lines use per-side washes and container opacity, preserving native child opacity and exact release',()=>{
  function prepare(parts) {
    parts.small=new MockPanel('Panel',parts.lines,'EngineSmall');parts.small.AddClass('line_small');
    parts.large=new MockPanel('Panel',parts.lines,'EngineLarge');parts.large.AddClass('line_large');
    parts.small.style.washColor='#AABBCC';parts.lines.style.opacity='0.9';
    parts.other=new MockPanel('Panel',parts.lines,'EngineOther');parts.other.style.washColor='#654321';
  }
  const net=network(), enemy=fixture({network:net,prepare}), ally=fixture({network:net,classes:['player','friend'],prepare});
  net.advance(1600);
  assert.equal(enemy.parts.small.style.washColor,'#000000');
  assert.equal(ally.parts.small.style.washColor,'#AABBCC');
  enemy.edit('lineColor','#112233');enemy.edit('lineOpacity',40);
  ally.edit('lineColorEnabled',true,'ally');ally.edit('lineColor','#445566','ally');ally.edit('lineOpacity',25,'ally');
  for(const [fx,color,opacity,childOpacity] of [[enemy,'#112233','0.4','0.6'],[ally,'#445566','0.25','0.8']]) {
    assert.equal(fx.parts.small.style.washColor,color);assert.equal(fx.parts.large.style.washColor,color);
    assert.equal(fx.lines.style.opacity,opacity);assert.equal(computed(fx.parts.large,'opacity'),childOpacity);
    assert.equal(fx.parts.large.style.opacity,undefined);assert.equal(fx.parts.other.style.washColor,'#654321');
    assert.equal(computed(fx.lines,'height'),'100%');assert.equal(computed(fx.lines,'marginTop'),'0px');
    assert.equal(computed(fx.parts.large,'height'),'100%');assert.equal(computed(fx.parts.small,'height'),'8px');
  }
  const late=new MockPanel('Panel',enemy.lines,'EngineLate');late.AddClass('line_small');
  assert.equal(enemy.lines.style.opacity,'0.4','new children inherit container fade immediately');
  net.advance(1600);assert.equal(late.style.washColor,'#112233');
  enemy.edit('linesVisible',false);assert.equal(computed(enemy.lines,'visibility'),'collapse');
  assert.equal(enemy.parts.small.style.washColor,'#AABBCC');assert.equal(enemy.lines.style.opacity,'0.9');
  enemy.edit('linesVisible',true);assert.equal(enemy.parts.small.style.washColor,'#112233');
  enemy.edit('lineColorEnabled',false);enemy.edit('lineOpacity',100);
  assert.equal(enemy.parts.small.style.washColor,'#AABBCC');assert.equal(enemy.parts.large.style.washColor,'');
  assert.equal(enemy.lines.style.opacity,'0.9');
  enemy.edit('enabled',false);
  for(const fx of [enemy,ally]) {
    assert.equal(fx.lines.style.opacity,'0.9');assert.equal(fx.parts.small.style.washColor,'#AABBCC');
    assert.equal(computed(fx.lines,'height'),'18px');assert.equal(computed(fx.lines,'marginTop'),'2px');
    assert.equal(computed(fx.parts.large,'height'),'100px');
  }
});

test('enemy kill marker stays visible at its threshold position with v2 gates and measured geometry',()=>{
  const fx=fixture();fx.advance(600);
  const marker=()=>fx.primary.FindChild('HPColorsV3KillMarker');
  fx.edit('killMarkerEnabled',true);
  assert.ok(marker());assert.equal(computed(marker(),'visibility'),'visible');
  assert.equal(marker().GetAttributeString('hittest',''),'false');assert.equal(marker().GetParent().id,'UnitHealthbar');
  assert.equal(marker().style.width,'1px');assert.equal(marker().style.marginLeft,'22.75px');
  assert.equal(marker().style.backgroundColor,'#FF2222');assert.equal(computed(marker(),'height'),'100%');
  for(const hp of [0,25,26,100]) {fx.setHealth(hp);fx.advance();assert.equal(computed(marker(),'visibility'),'visible');}
  fx.edit('killMarkerThreshold',50);fx.edit('killMarkerWidth',2);
  assert.equal(marker().style.marginLeft,'39.5px');assert.equal(marker().style.width,'2px');
  fx.edit('killMarkerColor','#ABCDEF');assert.equal(marker().style.backgroundColor,'#ABCDEF');
  fx.edit('killMarkerWidth',10);fx.edit('killMarkerThreshold',5);assert.equal(marker().style.marginLeft,'6px','clamped inside primary inner');
  fx.edit('barVisible',false);assert.equal(computed(marker(),'visibility'),'collapse');
  fx.edit('barVisible',true);assert.equal(computed(marker(),'visibility'),'visible');
  fx.edit('barColorEnabled',false);assert.equal(computed(marker(),'visibility'),'collapse');
  fx.edit('barColorEnabled',true);assert.equal(computed(marker(),'visibility'),'visible');
  fx.h.root.classes=['player','friend'];fx.advance(1100);assert.equal(computed(marker(),'visibility'),'collapse');
  fx.h.root.classes=['player','enemy'];fx.advance(1100);assert.equal(computed(marker(),'visibility'),'visible');
  fx.edit('killMarkerEnabled',false);assert.equal(computed(marker(),'visibility'),'collapse');assert.equal(marker().style.marginLeft,'');
  fx.edit('killMarkerEnabled',true);fx.edit('enabled',false);assert.equal(computed(marker(),'visibility'),'collapse');
  assert.equal(marker().style.width,'');assert.equal(marker().style.backgroundColor,'');
});

test('engine line replacement and recycled roles recover color ownership without touching spectator or closed-unit lines',()=>{
  const fx=fixture({prepare(parts) {
    parts.line=new MockPanel('Panel',parts.lines,'OldLine');parts.line.AddClass('line_large');parts.line.style.washColor='#AABBCC';
  }});fx.advance(1600);fx.edit('lineColor','#123456');fx.edit('lineOpacity',40);
  fx.lines.DeleteAsync(0);
  const lines=new MockPanel('Panel',fx.primary,'UnitHealthbarLines');lines.style.opacity='0.75';
  const line=new MockPanel('Panel',lines,'ReplacementLine');line.AddClass('line_small');line.style.washColor='#ABCABC';
  fx.advance(1600);assert.equal(lines.style.opacity,'0.4');assert.equal(line.style.washColor,'#123456');
  line.DeleteAsync(0);
  const replaced=new MockPanel('Panel',lines,'ReplacementLine');replaced.AddClass('line_large');
  fx.advance(1600);assert.equal(replaced.style.washColor,'#123456','same-count replacement is discovered');
  fx.h.root.classes=['player','enemy','spectating','team2'];fx.advance(1100);
  assert.equal(lines.style.opacity,'0.75');assert.equal(replaced.style.washColor,'');
  assert.equal(computed(replaced,'opacity'),'0.8');assert.equal(computed(replaced,'washColor'),'team2ColorDarker');
  fx.h.root.classes=['boss_tier1','enemy'];fx.advance(1100);
  assert.equal(fx.api.status.state,'dormant');assert.equal(lines.style.opacity,'0.75');
  assert.equal(computed(lines,'height'),'18px');assert.equal(computed(replaced,'height'),'100px');
  fx.h.root.classes=['player','enemy'];fx.advance(1100);
  assert.equal(lines.style.opacity,'0.4');assert.equal(replaced.style.washColor,'#123456');
  fx.boot.includeScripts();fx.advance(600);fx.edit('enabled',false);
  assert.equal(lines.style.opacity,'0.75');assert.equal(replaced.style.washColor,'');
});

// Live 6782 (HPV3 debug log 2026-10-15, enemy Celeste bot using Prismatic Guard): after the engine
// deletes a panel, every native write to it throws "Underlying panel is deleted!". The line builder
// (client.dll rva 0x1bf1590) deletes surplus UnitHealthbarLines children whenever the bar total
// (max HP or HP + barrier + delta) drops, so barrier hits, decay and expiry delete lines we wash.
function deleteLive(panel,throws) {
  panel.DeleteAsync(0);
  const dead=new Proxy({},{get:()=>undefined,set(){throws.count++;throw new Error('Underlying panel is deleted!');}});
  Object.defineProperty(panel,'style',{configurable:true,get:()=>dead,set(){}});
}
function barrierFixture() {
  const fx=fixture({prepare(parts){
    parts.engineLines=[];
    for(let i=1;i<=9;i++){const line=new MockPanel('Panel',parts.lines,'EngineLine'+i);line.AddClass(i%4?'line_small':'line_large');parts.engineLines.push(line);}
  }});
  fx.advance(1600);
  fx.edit('barColorEnabled',true);fx.edit('barColorMode','fixed');
  for(const key of ['barColorLow','barColorMid','barColorHigh']) fx.edit(key,'#2E5BFF');
  fx.edit('barWidth',98.75);fx.edit('barHeight',22.5);fx.edit('hpTextVisible',true);
  fx.advance(1600);
  const look=()=>({wash:fx.fill.style.washColor,scale:fx.stack.style.preTransformScale2d,adopted:fx.value.GetParent()===fx.row,
    lineWash:fx.engineLines.filter(line=>line.IsValid()).map(line=>line.style.washColor)});
  const custom=look();
  assert.equal(custom.wash,'#2E5BFF');assert.equal(custom.adopted,true);assert.ok(custom.lineWash.every(wash=>wash==='#000000'));
  // Engine barrier gain: the barrier layer follows the fill and the total grows by two lines.
  const gainBarrier=()=>{
    fx.setHealth(88);fx.shield.AddClass('HasHealth');fx.shield.style.clip='rect( 0.0%, 100.0%, 100.0%, 88.0%) ';
    for(let i=0;i<2;i++){const line=new MockPanel('Panel',fx.lines,'BarrierLine'+fx.engineLines.length);line.AddClass('line_small');fx.engineLines.push(line);}
  };
  return {fx,look,custom,gainBarrier};
}

test('an engine line deleted between ticks during barrier gain drops only its lease without a stock flash',()=>{
  const {fx,look,custom,gainBarrier}=barrierFixture(), throws={count:0};
  gainBarrier();fx.advance(150);
  assert.ok(fx.engineLines.every(line=>line.style.washColor==='#000000'),'barrier lines washed within one active tick');
  // A hit on the barrier and its decay drop the total: the engine deletes the last line.
  fx.shield.style.clip='rect( 0.0%, 95.0%, 100.0%, 88.0%) ';deleteLive(fx.engineLines.pop(),throws);
  for(let ms=0;ms<1500;ms+=150){
    fx.advance(150);
    const now=look();
    assert.equal(now.wash,custom.wash,'fill stays customised at '+ms+'ms');assert.equal(now.scale,custom.scale,'geometry stays at '+ms+'ms');
    assert.equal(now.adopted,true,'HP text stays adopted at '+ms+'ms');assert.notEqual(fx.api.status.state,'dormant','no rollback at '+ms+'ms');
  }
  assert.ok(throws.count<=1,'a dead panel is written at most once, not in a loop: '+throws.count);
});

test('an engine line deleted mid-apply keeps the rest of the paint and styles its replacement next tick',()=>{
  const {fx,look,custom,gainBarrier}=barrierFixture(), throws={count:0};
  gainBarrier();fx.advance(150);
  // The engine deletes a later washed line and creates its replacement while our paint is
  // part-way through writing the line colour, so the same apply then writes the dead line.
  const first=fx.engineLines[0], doomed=fx.engineLines[5], bag=first.style;
  let replacement=null;
  Object.defineProperty(first,'style',{configurable:true,get:()=>new Proxy(bag,{set(target,key,value){
    target[key]=value;
    if(key==='washColor'&&!replacement){
      deleteLive(doomed,throws);
      replacement=new MockPanel('Panel',fx.lines,'ReplacementLine');replacement.AddClass('line_small');
    }
    return true;
  }}),set(){}});
  fx.edit('lineColor','#123456');
  assert.ok(replacement,'the deletion happened inside the paint');assert.equal(throws.count,1,'the paint reached the dead line');
  assert.equal(fx.fill.style.washColor,custom.wash,'the rest of the bar keeps its customisation');
  assert.equal(fx.stack.style.preTransformScale2d,custom.scale);assert.equal(look().adopted,true);
  assert.ok(fx.engineLines.filter(line=>line!==doomed).every(line=>line.style.washColor==='#123456'),'live lines took the new colour');
  assert.notEqual(fx.api.status.state,'dormant','no rollback');
  fx.advance(150);
  assert.equal(replacement.style.washColor,'#123456','replacement styled on the next active tick');
  fx.advance(1500);
  assert.equal(throws.count,1,'a dead panel is written once, not in a loop');
  assert.equal(fx.fill.style.washColor,custom.wash);
});

test('barrier line churn stays inside the active operation ceiling',t=>{
  const {fx,gainBarrier}=barrierFixture(), throws={count:0};
  for(const key of Object.keys(fx.h.operationCounts)) fx.h.operationCounts[key]=0;
  let injected=0;
  for(let ms=0;ms<10000;ms+=100){
    const before={...fx.h.operationCounts};
    if(ms%2000===0) gainBarrier();
    if(ms%2000===1000) {deleteLive(fx.engineLines.pop(),throws);deleteLive(fx.engineLines.pop(),throws);fx.shield.RemoveClass('HasHealth');}
    // Engine fixture mutations are not renderer API calls; measure only the scheduled response.
    for(const key of Object.keys(fx.h.operationCounts)) fx.h.operationCounts[key]=before[key]||0;
    fx.setHealth(80+(ms/100)%10);injected++;
    fx.advance(100);
  }
  const operations={...fx.h.operationCounts};operations.styleWrites-=injected;
  const ops=COUNTED.reduce((sum,key)=>sum+(operations[key]||0),0)/10;
  t.diagnostic(JSON.stringify({ops,throws:throws.count}));
  assert.ok(ops<=300,`${ops} > 300`);
  assert.ok(throws.count<=10,'each deleted line is written at most once: '+throws.count);
});

test('zero line opacity, independent ally visibility and late optional lines retain native stock ownership',()=>{
  const fx=fixture({prepare(parts){parts.lines.DeleteAsync(0);}});fx.advance(1600);
  fx.edit('lineOpacity',0);assert.notEqual(fx.api.status.state,'dormant','missing lines do not block the bar');
  const lines=new MockPanel('Panel',fx.primary,'UnitHealthbarLines'), line=new MockPanel('Panel',lines,'LateLine');
  line.AddClass('line_small');line.style.opacity='0.7';fx.advance(1600);
  assert.equal(lines.style.opacity,'0');assert.equal(line.style.opacity,'0.7');assert.equal(line.style.washColor,'#000000');
  fx.edit('linesVisible',false,'ally');assert.notEqual(computed(lines,'visibility'),'collapse','ally setting never hides enemy lines');
  fx.h.root.classes=['player','friend'];fx.advance(1100);
  assert.equal(computed(lines,'visibility'),'collapse');assert.equal(lines.style.opacity,'');assert.equal(line.style.washColor,'');
  fx.edit('enabled',false);assert.notEqual(computed(lines,'visibility'),'collapse');
  assert.equal(computed(lines,'height'),'18px');assert.equal(line.style.opacity,'0.7');
});

test('level badge follows stock-relative bar geometry with own-axis UI scales and enemy-only visibility',()=>{
  const fx=fixture();fx.advance(2000);
  const level=fx.root.FindChildTraverse('HPColorsV3Level'), label=fx.root.FindChildTraverse('unit_level_label');
  assert.ok(level && label,'engine-bound level badge exists');
  label.text='19';fx.measure(level,21,21,27,67.5,1.25,3);fx.advance(1800);
  assert.equal(computed(level,'visibility'),'visible');
  assert.equal(level.style.border,'2px solid #ff8c00');
  assert.equal(level.style.marginLeft,'15.44px');assert.equal(level.style.marginTop,'60.8px');
  label.text='35';fx.advance(1100);assert.equal(level.style.border,'2px solid #8b0000');
  label.text='19';fx.advance(1100);
  fx.edit('levelOffsetX',10);fx.edit('levelOffsetY',5);fx.advance(150);
  assert.equal(level.style.marginLeft,'18.04px');assert.equal(level.style.marginTop,'68.7px');
  fx.edit('accessoryAnchorEnabled',false);fx.advance(150);
  assert.equal(level.style.marginLeft,'22.84px');assert.equal(level.style.marginTop,'70.7px');
  fx.edit('levelsVisible',false);fx.advance(150);
  assert.equal(computed(level,'visibility'),'collapse');assert.equal(level.style.border,'');
  fx.edit('enabled',false);fx.advance(150);
  assert.equal(level.style.marginLeft,'');assert.equal(level.style.marginTop,'');
  assert.equal(computed(level,'visibility'),'collapse');assert.equal(label.text,'19');
});

test('ultimate badge follows shared offsets, colors and size without owning engine ready visibility',()=>{
  const fx=fixture({nativeStyles:{ult:{marginLeft:'9px',marginTop:'4px'},ultBackground:{preTransformScale2d:'1.2'},ultReady:{washColor:'#445566'}}});
  fx.advance(2000);
  assert.equal(fx.ult.style.marginLeft,'38.44px');assert.equal(fx.ult.style.marginTop,'61.3px');
  assert.equal(fx.ultReady.style.washColor,fx.fill.style.washColor);
  assert.equal(computed(fx.ultReady,'visibility'),'collapse');
  fx.h.root.AddClass('has_ultimate');
  assert.equal(computed(fx.ultReady,'visibility'),'visible','ready is immediately engine-class driven');
  fx.edit('ultMode','custom');fx.edit('ultCustom','#123456');fx.edit('ultSize',30);fx.edit('ultOffsetX',12);fx.edit('ultOffsetY',6);fx.advance(150);
  assert.equal(fx.ultReady.style.washColor,'#123456');assert.equal(fx.ultBackground.style.preTransformScale2d,'1.5');
  assert.equal(fx.ult.style.marginLeft,'43.04px');assert.equal(fx.ult.style.marginTop,'70.2px');
  fx.edit('ultMode','follow');fx.setHealth(10);fx.advance(150);
  assert.equal(fx.ultReady.style.washColor,'#FD4949');
  fx.edit('barColorEnabled',false);fx.edit('ultSize',20);fx.advance(150);
  assert.equal(fx.ultReady.style.washColor,'#445566');assert.equal(fx.ultBackground.style.preTransformScale2d,'1','enabled timer owns the default badge scale too');
  fx.edit('ultimateTimerEnabled',false);assert.equal(fx.ultBackground.style.preTransformScale2d,'1.2');
  fx.edit('enabled',false);fx.advance(150);
  assert.equal(fx.ult.style.marginLeft,'9px');assert.equal(fx.ult.style.marginTop,'4px');
  assert.equal(computed(fx.ultReady,'visibility'),'visible');
  assert.ok(fx.ult.GetParent()===fx.info);assert.ok(fx.status.GetParent()===fx.root);
});

test('stock-equal accessory geometry and ally follow mode leave native badge properties unowned',()=>{
  const fx=fixture({classes:['player','friend']});fx.advance(2000);
  fx.edit('barWidth',79,'ally');fx.edit('barHeight',18,'ally');fx.edit('barOffsetY',0,'ally');
  fx.edit('ultOffsetX',0);fx.edit('ultOffsetY',0);fx.advance(150);
  fx.edit('ultimateTimerEnabled',false);
  assert.equal(fx.ult.style.marginLeft,'');assert.equal(fx.ult.style.marginTop,'');
  assert.equal(fx.ultBackground.style.preTransformScale2d,'');assert.equal(fx.ultReady.style.washColor,undefined);
  assert.equal(computed(fx.level,'visibility'),'collapse');
  assert.equal(computed(fx.ult,'marginTop'),'68px');
  fx.edit('ultOffsetX',0.1);assert.equal(fx.ult.style.marginTop,'68px','turning placement on at zero vertical offset does not jump');
  fx.edit('ultOffsetX',0);assert.equal(computed(fx.ult,'marginTop'),'68px');
  fx.edit('ultMode','custom');fx.edit('ultCustom','#ABCDEF');fx.advance(150);
  assert.equal(fx.ultReady.style.washColor,'#ABCDEF','v2 custom ultimate is independent of disabled ally bar colors');
});

test('unlaid and replaced accessories recover on the existing cadence without poisoning bar colors',()=>{
  const fx=fixture({prepare(parts){parts.level.actuallayoutwidth=0;parts.ult.actuallayoutheight=0;}});fx.advance(1800);
  assert.equal(fx.level.style.marginLeft,undefined);assert.equal(fx.ult.style.marginLeft,undefined);
  assert.ok(/^#/.test(fx.fill.style.washColor));
  fx.measure(fx.level,21,21,27,67.5,0.75,4);fx.measure(fx.ult,20,20,50,68,4,0.75);fx.advance(1800);
  assert.equal(fx.level.style.marginLeft,'15.44px');assert.equal(fx.ult.style.marginLeft,'38.44px');
  const oldLevel=fx.level,oldUlt=fx.ult;
  oldLevel.SetParent(new MockPanel('Detached'));oldUlt.SetParent(new MockPanel('OtherDetached'));
  const level=new MockPanel('Panel',fx.info,'HPColorsV3Level'),label=new MockPanel('Label',level,'unit_level_label');
  const ult=new MockPanel('Panel',fx.info,'ReplacementUlt');ult.AddClass('unit_info_panel');
  const background=new MockPanel('Panel',ult,'unit_info_bg'),ready=new MockPanel('Image',background,'unit_ult_ready_icon');
  label.text='27';fx.measure(level,21,21,27,67.5,3,1);fx.measure(ult,20,20,50,68,1,3);
  fx.advance(1800);
  assert.equal(level.style.border,'2px solid #e53935');assert.equal(level.style.marginLeft,'15.44px');
  assert.equal(ult.style.marginLeft,'38.44px');assert.equal(ready.style.washColor,fx.fill.style.washColor);
  assert.equal(oldLevel.style.marginLeft,'');assert.equal(oldUlt.style.marginLeft,'');
  fx.h.root.classes=['player','friend'];fx.advance(1200);
  assert.equal(computed(level,'visibility'),'collapse');assert.equal(ready.style.washColor,'');
  fx.edit('enabled',false);fx.advance(150);
  assert.equal(ult.style.marginLeft,'');assert.equal(level.style.border,'');
});

function engineStamina(parts,h) {
  parts.stamina=h.contextPanel.FindChild('StaminaContainer');
  parts.staminaPips=Array.from({length:4},(_,i)=>{
    const pip=new MockPanel('Panel',parts.stamina,'EngineStamina'+i);pip.AddClass('StaminaPip');pip.AddClass('StaminaRecentlyUsed');
    const icon=new MockPanel('Panel',pip,'EngineStaminaIcon'+i);icon.AddClass('StaminaPipIcon');
    return {pip,icon};
  });
  parts.staminaPips[1].pip.AddClass('PipEmpty');
  parts.staminaPips[2].icon.AddClass('StaminaRecentlyDepleted');
  parts.staminaPips[3].icon.AddClass('StaminaRecentlyUsed');
  parts.staminaPips[0].pip.RemoveClass('StaminaRecentlyUsed');
}

test('enemy stamina keeps engine count/state and v2 arrow/circle/box geometry, color and stock release',()=>{
  const fx=fixture({prepare(parts,h){
    engineStamina(parts,h);
    parts.stamina.style.transform='rotateZ(2deg)';parts.stamina.style.washColor='#AABBCC';
    Object.assign(parts.staminaPips[0].icon.style,{width:'9px',height:'13px',backgroundColor:'#123123',borderColor:'#ABCABC',washColor:'#456456',backgroundSize:'contain'});
  }});fx.advance(1800);
  const {stamina,staminaPips:pips}=fx.parts;
  assert.equal(stamina.style.transform,'rotateZ(2deg)','shipped settings leave stock stamina alone');
  assert.equal(pips[0].icon.style.width,'9px');
  fx.edit('staminaColorEnabled',true);fx.edit('staminaColor','#123456');
  fx.edit('staminaWidth',22);fx.edit('staminaHeight',8.96);fx.edit('staminaOffsetX',12.3);fx.edit('staminaOffsetY',-4.7);
  for(const shape of ['arrow','circle','box']) {
    fx.edit('staminaShape',shape);fx.advance(1200);
    assert.equal(stamina.Children().length,4,'engine remains sole count authority');
    assert.equal(stamina.style.transform,'translate3d(12.3px, -4.7px, 0px)');assert.equal(stamina.style.washColor,shape==='arrow'?'#FFFFFF':'#123456');
    pips.forEach(({pip,icon},i)=>{
      assert.equal(icon.style.width,shape==='arrow'?'16px':'22px');assert.equal(icon.style.height,shape==='arrow'?'24px':'8.96px');
      assert.equal(icon.style.washColor,shape==='arrow'?(i?'#10130D':'#123456'):'#FFFFFF');
      if(shape!=='arrow') {
        assert.equal(computed(icon,'backgroundColor'),i?'#000000':'#FFFFFF');assert.equal(icon.style.borderColor,'#FFFFFF');
        assert.equal(computed(icon,'backgroundImage'),'none');assert.equal(computed(icon,'borderRadius'),shape==='circle'?'50%':'0px');
      } else assert.match(computed(icon,'backgroundImage'),/pip_stamina_filled/);
      assert.equal(icon.style.visibility,undefined);assert.equal(pip.style.visibility,undefined);
    });
  }
  pips[1].pip.RemoveClass('PipEmpty');pips[1].pip.RemoveClass('StaminaRecentlyUsed');fx.advance(1200);
  assert.equal(computed(pips[1].icon,'backgroundColor'),'#FFFFFF','engine replenishment immediately restores the custom-washed interior');
  fx.edit('barColorEnabled',false);fx.edit('barVisible',false);assert.equal(computed(pips[0].icon,'backgroundColor'),'#FFFFFF','stamina independent of bar color/visibility');
  fx.edit('staminaShape','arrow');fx.edit('staminaWidth',11);fx.edit('staminaHeight',4.48);fx.edit('staminaOffsetX',0);fx.edit('staminaOffsetY',0);fx.edit('staminaColorEnabled',false);
  assert.equal(stamina.style.transform,'rotateZ(2deg)');assert.equal(stamina.style.washColor,'#AABBCC');
  assert.equal(pips[0].icon.style.width,'9px');assert.equal(pips[0].icon.style.height,'13px');
  assert.equal(pips[0].icon.style.backgroundColor,'#123123');assert.equal(pips[0].icon.style.borderColor,'#ABCABC');assert.equal(pips[0].icon.style.washColor,'#456456');
  fx.edit('staminaShape','circle');fx.edit('enabled',false);
  assert.equal(stamina.style.transform,'rotateZ(2deg)');assert.equal(pips[0].icon.style.backgroundColor,'#123123');
  assert.match(computed(pips[1].icon,'backgroundImage'),/pip_stamina_filled/);
});

test('stamina replacement, native depletion classes and recycled unit gates restore the exact engine surface',()=>{
  const fx=fixture({prepare:engineStamina});fx.advance(1800);fx.edit('staminaShape','circle');
  const {stamina,staminaPips:pips}=fx.parts;
  assert.equal(pips[0].icon.style.width,undefined,'shape-only keeps native dimensions');
  assert.equal(pips[0].icon.style.height,undefined);assert.equal(computed(pips[0].icon,'backgroundColor'),'#FFFFFF');
  const old=pips[0].icon;old.SetParent(new MockPanel('Retired'));
  const replacement=new MockPanel('Panel',pips[0].pip,'NewIcon');replacement.AddClass('StaminaPipIcon');
  replacement.style.washColor='#ABCDEF';
  const extra=new MockPanel('Panel',stamina,'AdditionalNativePip');extra.AddClass('StaminaPip');
  const extraIcon=new MockPanel('Panel',extra,'AdditionalNativeIcon');extraIcon.AddClass('StaminaPipIcon');
  fx.advance(1200);
  assert.equal(stamina.Children().length,5);assert.equal(computed(extraIcon,'backgroundColor'),'#FFFFFF');
  assert.equal(computed(replacement,'backgroundColor'),'#FFFFFF');assert.equal(old.style.backgroundColor,'');
  for(const [panel,name] of [[replacement,'PipEmpty'],[extra,'StaminaRecentlyUsed'],[extraIcon,'StaminaRecentlyDepleted']]) {
    panel.AddClass(name);fx.advance(1200);
    assert.equal(computed(panel===replacement?replacement:extraIcon,'backgroundColor'),'#000000',name);
    panel.RemoveClass(name);fx.advance(1200);
    assert.equal(computed(panel===replacement?replacement:extraIcon,'backgroundColor'),'#FFFFFF',name+' releases');
  }
  for(const classes of [['player','friend'],['player','enemy','LocalPlayer'],['player','enemy','friend'],['player','enemy','team_neutral'],['boss_tier1','enemy']]) {
    fx.h.root.classes=classes;fx.advance(1200);
    assert.equal(replacement.style.washColor,'#ABCDEF',classes.join(' '));assert.equal(replacement.style.backgroundColor,'');
    assert.equal(stamina.BHasClass('HPColorsV3StaminaCircle'),false);
  }
  fx.h.root.classes=['player','enemy'];fx.advance(1200);assert.equal(computed(replacement,'backgroundColor'),'#FFFFFF');
  stamina.DeleteAsync(0);fx.advance(1200);assert.notEqual(fx.api.status.state,'dormant','missing optional stamina never blocks bar');
  const late=new MockPanel('Panel',fx.root,'StaminaContainer'),pip=new MockPanel('Panel',late,'LatePip'),icon=new MockPanel('Panel',pip,'LateIcon');
  pip.AddClass('StaminaPip');icon.AddClass('StaminaPipIcon');fx.advance(1200);
  assert.equal(computed(icon,'backgroundColor'),'#FFFFFF');
  fx.boot.includeScripts();fx.advance(600);fx.edit('enabled',false);
  assert.equal(icon.style.backgroundColor,'');assert.equal(late.BHasClass('HPColorsV3StaminaCircle'),false);
});

test('percent-clipped shield/barrier health does not depend on unused unlaid layer extents',()=>{
  const fx=fixture();fx.advance(1800);fx.edit('barColorMode','fixed');
  for(const panel of [fx.shield,fx.armor]) {
    panel.AddClass('HasHealth');panel.style.clip='rect(0%, 80%, 100%, 60%)';
    for(const key of ['actuallayoutwidth','actualxoffset'])
      Object.defineProperty(panel,key,{configurable:true,get(){throw new Error('unused percent-clip layout');}});
  }
  fx.advance(150);
  assert.equal(fx.fill.style.washColor,'#00FF00');
  assert.notEqual(fx.api.status.state,'dormant');
});

test('shaped stamina depletion follows native CSS immediately without a renderer tick',()=>{
  const fx=fixture({prepare:engineStamina});fx.advance(1800);
  fx.edit('staminaShape','box');fx.edit('staminaColorEnabled',true);fx.edit('staminaColor','#123456');
  const {pip,icon}=fx.parts.staminaPips[0];
  assert.equal(computed(icon,'backgroundColor'),'#FFFFFF');
  assert.equal(fx.parts.stamina.style.washColor,'#123456');
  for(const panel of [pip,icon]) for(const name of ['PipEmpty','StaminaRecentlyUsed','StaminaRecentlyDepleted']) {
    panel.AddClass(name);assert.equal(computed(icon,'backgroundColor'),'#000000',name);
    panel.RemoveClass(name);assert.equal(computed(icon,'backgroundColor'),'#FFFFFF');
  }
  fx.edit('staminaColorEnabled',false);assert.ok(!fx.parts.stamina.style.washColor,'custom off restores the native relation wash');
  fx.edit('enabled',false);assert.ok(!fx.parts.stamina.style.washColor);
});

// Ticket 35: editable Amber/Sapphire team colors, team HP number and side-aware low-stamina colors.
test('team colors are editable, drive Team high color and the HP number, and fall back to bar colors without a team',()=>{
  const fx=fixture();fx.advance(1800);
  fx.h.root.AddClass('team2');fx.advance(1200);
  fx.edit('barColorTeamHigh',true);fx.setHealth(100);fx.advance();
  assert.equal(fx.fill.style.washColor.toUpperCase(),'#5B79E6','game Sapphire stays the default');
  fx.edit('teamSapphireColor','#123456');fx.advance();
  assert.equal(fx.fill.style.washColor.toUpperCase(),'#123456','Team high color follows the editable Sapphire color');
  fx.edit('hpTextColorMode','team');
  for(const hp of [100,50,10]) {fx.setHealth(hp);fx.advance();assert.equal(fx.value.style.washColor,'#123456','whole number is the team color at '+hp);}
  fx.h.root.RemoveClass('team2');fx.h.root.AddClass('team1');fx.edit('teamAmberColor','#ABCDEF');fx.advance(1200);
  assert.equal(fx.value.style.washColor,'#ABCDEF');
  fx.h.root.RemoveClass('team1');fx.advance(1200);
  assert.equal(fx.value.style.washColor,fx.fill.style.washColor,'unknown team falls back to bar colors');
  fx.h.root.AddClass('team1');fx.advance(1200);
  fx.edit('hpTextColorMode','custom');fx.edit('hpTextMode','fixed');fx.edit('hpTextTeamHigh',true);
  fx.edit('hpTextMid','#008800');fx.edit('hpTextLow','#110000');
  for(const [hp,color] of [[100,'#ABCDEF'],[50,'#008800'],[20,'#110000']]) {fx.setHealth(hp);fx.advance();assert.equal(fx.value.style.washColor,color,'own colors with team high at '+hp);}
  fx.edit('hpTextTeamHigh',false);fx.setHealth(100);fx.advance();assert.equal(fx.value.style.washColor,'#FFFFFF');
  const config=structuredClone(latestPublishedConfig(fx.menu.harness).settings);
  config.side.enemy.hpTextColorMode='team';config.side.enemy.objectiveEnabled=true;
  const unit=fx.api.plan({...fx.api.facts(),kind:'objective',player:false,team:'team1',fraction:1},config);
  assert.equal(unit.styles.value,undefined,'team HP number is players only: unit bars keep the stock HP number');
  const level=fx.api.plan({...fx.api.facts(),team:'team1',level:5},{...config,side:{...config.side,enemy:{...config.side.enemy,levelsVisible:true}}});
  assert.equal(level.styles.level.border,'2px solid #E7B659','the level rim keeps the game team color');
});

test('stamina team colors need Custom stamina color and fall back to the own color without a team',()=>{
  const fx=fixture({prepare:engineStamina});fx.advance(1800);fx.h.root.AddClass('team2');fx.advance(1200);
  const {stamina,staminaPips:pips}=fx.parts;
  // Dependent rows: the source is set with Custom stamina color on, then the color is switched off again.
  fx.edit('staminaColorEnabled',true);fx.edit('staminaColorMode','team');fx.edit('staminaColorEnabled',false);fx.advance(1200);
  assert.equal(pips[0].icon.style.washColor||undefined,undefined,'team source alone changes nothing while custom color is off');
  fx.edit('staminaColorEnabled',true);fx.edit('staminaColor','#123456');fx.edit('teamSapphireColor','#2040A0');fx.advance(1200);
  assert.equal(pips[0].icon.style.washColor,'#2040A0','filled arrows take the team color');
  assert.equal(pips[1].icon.style.washColor,'#10130D','empty arrows stay black');
  fx.edit('staminaShape','circle');fx.advance(1200);assert.equal(stamina.style.washColor,'#2040A0');
  fx.h.root.RemoveClass('team2');fx.advance(1200);assert.equal(stamina.style.washColor,'#123456','unknown team uses the own color');
  fx.edit('staminaColorMode','custom');fx.h.root.AddClass('team2');fx.advance(1200);assert.equal(stamina.style.washColor,'#123456');
});

// Ticket 36 (user, 2026-10-21): the empty-charge shade is removed. At low stamina only filled charges and
// the circle/box outline take the low color; empty charges keep the stock look.
test('low stamina recolors filled charges and the rim at or below the threshold; empty charges stay stock',()=>{
  const fx=fixture({prepare:engineStamina});fx.advance(1800);
  const {stamina,staminaPips:pips}=fx.parts;stamina.AddClass('StaminaRecentlyUsed');
  // Low stamina counts the stock empty marker (.StaminaPip.PipEmpty): charge 0 is filled, 1-3 are empty.
  pips[2].pip.AddClass('PipEmpty');pips[3].pip.AddClass('PipEmpty');
  // Dependent rows: threshold and low color are set with Custom stamina color on, then it is switched off again.
  fx.edit('staminaColorEnabled',true);fx.edit('staminaLowThreshold',1);fx.edit('staminaLowColor','#ABCDEF');fx.edit('staminaColorEnabled',false);fx.advance(1200);
  assert.equal(pips[0].icon.style.washColor||undefined,undefined,'low stamina needs Custom stamina color');
  fx.edit('staminaColorEnabled',true);fx.edit('staminaColor','#123456');fx.advance(300);
  assert.equal(pips[0].icon.style.washColor,'#ABCDEF','1 charge left at threshold 1 is low');
  for(const i of [1,2,3]) assert.equal(pips[i].icon.style.washColor,'#10130D','empty charges keep the stock empty color');
  pips[1].pip.RemoveClass('PipEmpty');pips[1].pip.RemoveClass('StaminaRecentlyUsed');fx.advance(300);
  assert.equal(pips[0].icon.style.washColor,'#123456','2 charges left is above threshold 1 within one idle bar update (0.3 s)');
  assert.equal(pips[1].icon.style.washColor,'#123456');
  pips[0].pip.AddClass('PipEmpty');pips[1].pip.AddClass('PipEmpty');fx.advance(300);
  for(const {icon} of pips) assert.equal(icon.style.washColor,'#10130D','zero arrows left show the stock empty arrows');
  for(const shape of ['circle','box']) {
    fx.edit('staminaShape',shape);fx.advance(300);
    assert.equal(stamina.style.washColor,'#ABCDEF',shape+' rim takes the low color at zero charges');
    for(const {icon} of pips) {
      assert.equal(computed(icon,'backgroundColor'),'#000000',shape+' empty charges stay black');
      assert.ok(!icon.style.backgroundColor,shape+' writes no empty-charge shade');
    }
  }
  pips[0].pip.RemoveClass('PipEmpty');pips[1].pip.RemoveClass('PipEmpty');fx.advance(300);
  assert.equal(stamina.style.washColor,'#123456','above the threshold the own color returns');
  fx.edit('staminaLowThreshold',0);fx.advance(1200);assert.equal(stamina.style.washColor,'#123456','threshold 0 is off');
  fx.edit('staminaColorEnabled',false);fx.advance(300);assert.ok(!stamina.style.washColor,'custom off restores the native wash');
  assert.equal(pips[0].icon.style.backgroundColor,'');
});

test('low stamina samples charges only while the game shows them, and catches up when they appear',()=>{
  const fx=fixture({prepare:engineStamina});fx.advance(1800);
  const {stamina,staminaPips:pips}=fx.parts;pips[2].pip.AddClass('PipEmpty');pips[3].pip.AddClass('PipEmpty');
  fx.edit('staminaColorEnabled',true);fx.edit('staminaColor','#123456');fx.edit('staminaLowThreshold',1);fx.edit('staminaLowColor','#ABCDEF');
  stamina.AddClass('StaminaRecentlyUsed');fx.advance(300);
  assert.equal(pips[0].icon.style.washColor,'#ABCDEF');
  stamina.RemoveClass('StaminaRecentlyUsed');fx.advance(300);
  pips[1].pip.RemoveClass('PipEmpty');pips[1].pip.RemoveClass('StaminaRecentlyUsed');
  const reads=()=>fx.h.operationCounts.classReads||0, before=reads();
  fx.advance(3000);
  assert.equal(pips[0].icon.style.washColor,'#ABCDEF','hidden charges are not resampled');
  const hidden=reads()-before;
  stamina.AddClass('StaminaRecentlyUsed');fx.advance(300);
  assert.equal(pips[0].icon.style.washColor,'#123456','the first update after the charges appear resamples them');
  const shown=reads();fx.advance(3000);
  assert.ok(hidden<reads()-shown,'hidden charges cost fewer class reads than shown charges: '+hidden+' vs '+(reads()-shown));
});

test('low stamina counts only the stock empty marker and follows a replaced pip at the same position',()=>{
  const fx=fixture({prepare:engineStamina});fx.advance(1800);
  const {stamina,staminaPips:pips}=fx.parts;stamina.AddClass('StaminaRecentlyUsed');
  fx.edit('staminaShape','box');fx.edit('staminaColorEnabled',true);fx.edit('staminaColor','#123456');
  fx.edit('staminaLowThreshold',1);fx.edit('staminaLowColor','#ABCDEF');fx.advance(1200);
  // Charges 2 and 3 carry only RecentlyDepleted/RecentlyUsed, which stock does not draw as empty: 3 filled.
  assert.deepEqual(JSON.parse(JSON.stringify(fx.api.facts().stamina)),[false,true,false,false]);
  assert.equal(stamina.style.washColor,'#123456');
  pips[3].pip.AddClass('PipEmpty');pips[2].pip.AddClass('PipEmpty');fx.advance(300);
  assert.equal(stamina.style.washColor,'#ABCDEF','PipEmpty on the pips lowers the count within one idle update');
  assert.equal(pips[1].icon.style.backgroundColor,'','an empty box keeps the stock fill (ticket 36)');
  // Replace pip 1 in place with a filled pip that adopts the same icon.
  const replacement=new MockPanel('Panel',stamina,'ReplacementPip');replacement.AddClass('StaminaPip');
  stamina.children.splice(stamina.children.indexOf(replacement),1);
  pips[1].pip.SetParent(new MockPanel('Retired'));stamina.children.splice(1,0,replacement);
  // Low stamina walks the pip structure every 3 s (a deleted pip triggers it at once, see below).
  pips[1].icon.SetParent(replacement);fx.advance(3100);
  assert.deepEqual(JSON.parse(JSON.stringify(fx.api.facts().stamina)),[false,false,true,true],'the new pip is read, not the retired one');
  assert.equal(stamina.style.washColor,'#123456','2 charges left is above threshold 1');
  pips[2].pip.DeleteAsync(0);fx.advance(450);
  assert.equal(fx.api.facts().stamina.length,3,'a deleted pip seen by the low-stamina read rewalks the structure within two updates');
});

test('ally stamina has its own settings and enemy stamina settings never touch ally bars',()=>{
  const fx=fixture({classes:['player','friend'],prepare:engineStamina});fx.advance(1800);
  const {stamina,staminaPips:pips}=fx.parts;stamina.AddClass('StaminaRecentlyUsed');pips[2].pip.AddClass('PipEmpty');pips[3].pip.AddClass('PipEmpty');
  fx.edit('staminaColorEnabled',true,'enemy');fx.edit('staminaShape','box','enemy');fx.advance(1200);
  assert.equal(pips[0].icon.style.washColor,undefined,'enemy settings leave the ally bar stock');
  assert.equal(stamina.BHasClass('HPColorsV3StaminaBox'),false);
  fx.edit('staminaColorEnabled',true,'ally');fx.edit('staminaColor','#70F8C1','ally');fx.advance(1200);
  assert.equal(pips[0].icon.style.washColor,'#70F8C1');assert.equal(pips[1].icon.style.washColor,'#10130D');
  fx.edit('staminaLowThreshold',1,'ally');fx.edit('staminaLowColor','#FF00FF','ally');fx.advance(150);
  assert.equal(pips[0].icon.style.washColor,'#FF00FF');
  fx.edit('staminaShape','circle','ally');fx.advance(1200);assert.equal(stamina.BHasClass('HPColorsV3StaminaCircle'),true);
  fx.edit('staminaColorEnabled',false,'ally');fx.advance(1200);
  assert.equal(stamina.BHasClass('HPColorsV3StaminaCircle'),true,'ally shape stays without custom color');
  fx.edit('staminaShape','arrow','ally');fx.advance(1200);
  assert.ok(!pips[0].icon.style.washColor,'ally defaults restore the stock surface');
});

test('debug build logs team, stamina, color decisions, ally charges and a 10 s stamina cost summary',{ skip: process.env.HPV3_DEBUG === '0' && 'staged release strips HPV3_DEBUG lines' },()=>{
  const net=network(),enemy=fixture({network:net,prepare:engineStamina}),ally=fixture({network:net,classes:['player','friend','team1'],prepare:engineStamina});
  const messages=[];
  const source=fs.readFileSync(path.join(sourceRoot,'panorama/scripts/hp_colors_v3_renderer.js'),'utf8').replace(/\/\/ HPV3_DEBUG /g,'');
  const boot=fs.readFileSync(path.join(sourceRoot,'panorama/scripts/hp_colors_v3_world_boot.js'),'utf8');
  for(const fx of [enemy,ally]) {
    fx.name.text=fx===enemy?'Haze':'Abrams';
    fx.h.$.Msg=message=>messages.push(message);
    runInVm(source,fx.boot.context,'renderer-debug.js');runInVm(boot,fx.boot.context,'world-boot.js');
  }
  net.advance(1800);
  enemy.h.root.AddClass('team2');enemy.parts.stamina.AddClass('StaminaRecentlyUsed');
  for(const i of [2,3]) enemy.parts.staminaPips[i].pip.AddClass('PipEmpty');
  for(const side of ['enemy','ally']) {enemy.edit('staminaColorEnabled',true,side);enemy.edit('staminaColorMode','team',side);enemy.edit('staminaLowThreshold',1,side);}
  enemy.edit('hpTextColorMode','team');net.advance(1200);
  assert.ok(messages.includes('[HPV3] team Haze enemy team2'),messages.join('\n'));
  assert.ok(messages.includes('[HPV3] team Abrams ally team1'),messages.join('\n'));
  assert.ok(messages.some(line=>line==='[HPV3] stamina Haze enemy 1/4 threshold 1 low shown'),messages.join('\n'));
  assert.ok(messages.some(line=>line==='[HPV3] colors Haze enemy hp=team stamina=low'),messages.join('\n'));
  enemy.parts.staminaPips[1].pip.RemoveClass('PipEmpty');enemy.parts.staminaPips[1].pip.RemoveClass('StaminaRecentlyUsed');net.advance(300);
  assert.ok(messages.includes('[HPV3] stamina Haze enemy 2/4 threshold 1 high shown'));
  assert.ok(messages.includes('[HPV3] colors Haze enemy hp=team stamina=team'));
  const count=messages.length;net.advance(1500);
  assert.equal(messages.filter(line=>!/ (renderer timing|stamina cost) /.test(line)).length,messages.slice(0,count).filter(line=>!/ (renderer timing|stamina cost) /.test(line)).length,'unchanged state logs nothing');
  net.advance(10000);
  assert.ok(messages.some(line=>/^\[HPV3\] stamina cost Haze enemy reads\/s=\d+(\.\d)? skipped\/s=\d+(\.\d)? ticks\/s=\d+(\.\d)? paints=\d+ ms=\d+ gate=container pip0=StaminaPip icon0=$/.test(line)),messages.filter(line=>/cost/.test(line)).join('\n'));
  net.advance(50000);
  assert.ok(messages.includes('[HPV3] ally stamina none Abrams after 60s pips=4 shown=false'),'an ally bar whose charges never appear says so');
  ally.parts.stamina.AddClass('StaminaRecentlyUsed');net.advance(1600);
  assert.ok(messages.includes('[HPV3] ally stamina seen Abrams pips=4'));
  assert.ok(messages.every(line=>line.startsWith('[HPV3]')));
});

test('pulse thresholds, colors, native label modifiers and exact animation release use real menu events',()=>{
  const fx=fixture({nativeStyles:{fill:{animationDuration:'2.3s',animationName:'nativeFill'},value:{animationDuration:'1.7s',textShadow:'1px 2px 3px 4 #ABCDEF'}}});
  fx.advance(1800);fx.edit('pulseReadout',true);fx.edit('pulseReadoutModifiers',true);
  fx.edit('pulseReadoutSize',20);fx.edit('hpTextOutline',7.5);fx.edit('killMarkerEnabled',true);
  fx.edit('pulseBpm',120);fx.edit('pulseIntensity',2);fx.edit('pulseColorEnabled',true);fx.edit('pulseColorMode','fixed');fx.edit('pulseColor','#123456');
  fx.setHealth(25);fx.advance();
  assert.equal(computed(fx.fill,'animationName'),'HPColorsV3PulseIntense');
  assert.equal(fx.fill.style.animationDuration,'0.500s');assert.equal(fx.fill.style.washColor,'#123456');
  assert.equal(fx.ultReady.style.washColor,'#123456');
  assert.equal(fx.value.style.washColor,'#FD4949','fixed bar pulse does not replace the configured HP-text bands');
  assert.equal(computed(fx.value,'animationName'),'HPColorsV3PulseIntense');assert.equal(fx.value.style.fontSize,'20px');
  assert.equal(fx.value.style.textShadow,'0px 0px 0px 7.5 #10130D');
  assert.deepEqual(position(fx.row.style.transform),[-60,62.2]);
  fx.edit('pulseHideBar',true);assert.equal(computed(fx.primary,'opacity'),'0.01');assert.equal(computed(fx.primary.FindChild('HPColorsV3KillMarker'),'visibility'),'collapse');
  assert.equal(fx.ultBackground.style.opacity,'0.01','pulse-hide also dims the ultimate badge background');
  fx.setHealth(26);fx.advance();assert.equal(fx.fill.style.animationDuration,'2.3s');
  assert.equal(computed(fx.fill,'animationName'),'nativeFill');assert.equal(fx.value.style.animationDuration,'1.7s');
  assert.equal(fx.value.style.fontSize,'14.5px');assert.equal(computed(fx.primary,'opacity'),'1');
  assert.equal(fx.ultBackground.style.opacity,'1','leaving low HP restores the ultimate badge background');
  fx.setHealth(10);fx.advance();fx.edit('pulseEnabled',false);
  assert.equal(fx.fill.style.animationDuration,'2.3s');assert.equal(fx.value.style.animationDuration,'1.7s');assert.equal(fx.value.style.fontSize,'14.5px');
  fx.edit('pulseEnabled',true);fx.edit('barColorEnabled',false);
  assert.equal(computed(fx.fill,'animationName'),'nativeFill','bar pulse requires custom colors');
  assert.equal(computed(fx.value,'animationName'),'HPColorsV3PulseIntense','HP pulse is independent of bar colors');
  fx.edit('pulseReadout',false);assert.equal(fx.value.style.animationDuration,'1.7s');assert.equal(fx.value.style.fontSize,'20px','pulse modifiers are independent of HP animation');
  fx.edit('pulseReadout',true);
  fx.edit('hpTextVisible',false);assert.equal(fx.value.style.animationDuration,'1.7s');
  fx.edit('hpTextVisible',true);fx.edit('enabled',false);
  assert.equal(fx.value.style.textShadow,'1px 2px 3px 4 #ABCDEF');assert.equal(fx.value.style.animationDuration,'1.7s');
  assert.ok(fx.value.GetParent()===fx.info);assert.equal(fx.fill.style.animationDuration,'2.3s');
});

test('ally pulse is opt-in and gradient overlay tracks fill coverage, not shield-corrected HP',()=>{
  const fx=fixture({classes:['player','friend']});fx.advance(1800);fx.setHealth(10);fx.advance();
  assert.equal(fx.fill.BHasClass('HPColorsV3Pulse'),false);
  fx.edit('hpTextVisible',true,'ally');fx.edit('pulseEnabled',true,'ally');fx.edit('pulseReadout',true,'ally');
  assert.equal(computed(fx.value,'animationName'),'HPColorsV3PulseMedium');
  assert.equal(fx.fill.BHasClass('HPColorsV3Pulse'),false);
  fx.edit('barColorEnabled',true,'ally');fx.edit('pulseColorEnabled',true,'ally');fx.edit('pulseColorMode','gradient','ally');
  fx.edit('pulseColor','#ABCDEF','ally');
  const overlay=fx.inner.FindChild('HPColorsV3PulseOverlay');assert.ok(overlay);
  assert.equal(computed(overlay,'animationName'),'HPColorsV3ColorPulseMedium');
  assert.equal(overlay.style.washColor,'#ABCDEF');assert.equal(overlay.style.clip,'rect(0%, 10%, 100%, 0%)');
  fx.shield.AddClass('HasHealth');fx.shield.style.clip='rect(0%, 100%, 100%, 20%)';fx.setHealth(20);fx.advance();
  assert.equal(computed(overlay,'visibility'),'collapse','shield-corrected 100% health stops the pulse');
  fx.shield.RemoveClass('HasHealth');fx.setHealth(0);fx.advance();assert.equal(computed(fx.fill,'animationName'),'HPColorsV3PulseMedium','zero health is included');
  fx.edit('pulseIntensity',0,'ally');assert.equal(computed(fx.fill,'animationName'),'HPColorsV3PulseSubtle');
  assert.equal(computed(overlay,'animationName'),'HPColorsV3ColorPulseSubtle');
  fx.edit('enabled',false);assert.equal(computed(overlay,'visibility'),'collapse');assert.ok(!overlay.style.animationDuration);
});

test('new engine lines receive custom wash on the next health probe, not the 1s carrier check',()=>{
  const fx=fixture();fx.advance(1800);fx.advance(100);
  const line=new MockPanel('Panel',fx.lines,'ImmediateNativeLine');line.AddClass('line_small');
  fx.advance(150);assert.equal(line.style.washColor,'#000000');
});

function enginePickups(parts,h) {
  const container=new MockPanel('Panel',h.contextPanel.FindChild('StatusEffects'),'StatusEffectContainer');
  parts.pickups=['gunpower_pickup','movement_pickup','casting_pickup','survival_pickup'].map((name,i)=>{
    const icon=new MockPanel('Panel',container,'Pickup'+i);icon.AddClass(name);
    const inner=new MockPanel('Panel',icon,'StatusEffectInner'),border=new MockPanel('Panel',icon,'StatusEffectsBorder');
    const track=new MockPanel('Panel',icon,'StatusEffectCooldownOverlay');
    if(i===0)Object.assign(track.style,{washColor:'#445566',backgroundImage:'url("stock-track.vtex")',backgroundTextureSize:'32px',backgroundSize:'contain',zIndex:'-1'});
    track.style.clip='radial(50% 50%, 0deg, -123deg)';
    const glyph=new MockPanel('Image',inner,'StatusEffectImage');glyph.AddClass('statusEffectImage');
    Object.assign(icon.style,{width:'19px',height:'21px',margin:'1px 2px',transform:'rotateZ(3deg)'});
    inner.style.washColor='#AABBCC';border.style.washColor='#ABCDEF';border.style.clip='radial(50% 50%, 0deg, 123deg)';
    glyph.style.washColor='#112233';return {icon,inner,border,track,glyph};
  });
  parts.flame=h.contextPanel.FindChild('KillStreakIndicator');
  parts.flame.style.preTransformScale2d='0.8';
  parts.rejuv=h.contextPanel.FindChild('RejuvenatorActive');
  Object.assign(parts.rejuv.style,{transform:'rotateZ(11deg)',preTransformScale2d:'0.9'});
}

test('native pickups use bright discs, off-white progress and dark empty tracks with exact off restoration',()=>{
  const fx=fixture({prepare:enginePickups});
  const stockTracks=fx.parts.pickups.map(({track})=>Object.fromEntries(Object.keys(track.style).map(key=>[key,inline(track,key)])));
  fx.advance(1800);
  const colors=['#EC9719','#6E65EA','#CE90FF','#7BBA1D'];
  fx.parts.pickups.forEach(({icon,inner,border,track,glyph},i)=>{
    assert.equal(icon.style.width,'19px','stock status-effect size kept');assert.equal(icon.style.height,'21px');assert.equal(icon.style.margin,'1px 2px','stock gaps kept');
    assert.equal(inner.style.washColor,colors[i]);assert.equal(border.style.washColor,'#FFEFD7');assert.equal(glyph.style.washColor,'#10130D');
    assert.equal(track.style.washColor,['#472D08','#211E46','#3E2B4D','#253809'][i]);
    assert.equal(inline(track,'backgroundImage'),'url("s2r://panorama/images/hud/world_space/status_border.vsvg")');
    assert.equal(track.style.backgroundSize,'100%');assert.equal(track.style.backgroundTextureSize,'48px');assert.equal(track.style.zIndex,'-3','full track sits below the clipped stock progress at -2');
    assert.equal(border.style.clip,'radial(50% 50%, 0deg, 123deg)','engine progress remains untouched');
    assert.equal(track.style.clip,'none','empty track is a full ring underneath engine progress');
  });
  const before=fx.parts.pickups.map(({icon,inner,border,glyph})=>[icon,inner,border,glyph].map(panel=>({...panel.style})));
  fx.edit('pickupBackgroundDarkness',50);
  fx.parts.pickups.forEach(({icon,inner,border,track,glyph},i)=>{
    assert.deepEqual([icon,inner,border,glyph].map(panel=>({...panel.style})),before[i],'darkness changes only the empty track');
    assert.equal(track.style.washColor,['#764C0D','#373375','#674880','#3E5D0F'][i]);
  });
  for(const key of ['pickupGunColor','pickupMovementColor','pickupSpiritColor','pickupSurvivalColor'])fx.edit(key,'#204080');
  for(const [key,value] of Object.entries({pickupGlyphColor:'#123456',pickupSize:64,pickupSpacing:16,pickupOffsetX:200,pickupOffsetY:-100}))fx.edit(key,value);
  fx.parts.pickups.forEach(({icon,inner,border,track,glyph})=>{
    // yesdaddy, 2026-11-02: spacing only on pickups set them apart from the other status effects. The row keeps
    // the game's gaps; Top bar pickup spacing sizes only the top-bar wings (timers.test.js).
    assert.equal(icon.style.width,'19px','pickups keep the game status-effect size');assert.equal(icon.style.height,'21px');assert.equal(icon.style.margin,'1px 2px','pickups keep the row\'s own gaps');assert.equal(icon.style.transform,'rotateZ(3deg)','icons keep their place in the row');
    assert.equal(inner.style.washColor,'#204080');assert.equal(border.style.washColor,'#FFEFD7');assert.equal(track.style.washColor,'#102040');assert.equal(glyph.style.washColor,'#123456');
  });
  // Live 6839: the whole native status-effect row moves (ordinary effects too), inside the canvas and never above its top.
  const row=fx.h.contextPanel.FindChild('StatusEffects');
  assert.equal(row.style.transform,'translate3d(100px, 0px, 0px)','x kept inside the 200px canvas, y never above the native top');
  fx.edit('pickupOffsetY',21);assert.equal(row.style.transform,'translate3d(100px, 21px, 0px)');
  const stock=()=>{
    fx.parts.pickups.forEach(({icon,inner,border,track,glyph},i)=>{
      assert.equal(icon.style.width,'19px');assert.equal(icon.style.height,'21px');assert.equal(icon.style.margin,'1px 2px');assert.equal(icon.style.transform,'rotateZ(3deg)');
      assert.equal(inner.style.washColor,'#AABBCC');assert.equal(border.style.washColor,'#ABCDEF');assert.equal(glyph.style.washColor,'#112233');
      for(const key of ['washColor','backgroundImage','backgroundTextureSize','backgroundSize','zIndex','clip'])assert.equal(inline(track,key)||'',stockTracks[i][key]||'',`track ${i} restores ${key}`);
    });
  };
  fx.edit('pickupTimersEnabled',false);stock();assert.ok(!row.style.transform,'pickups off and no bar offset: the row is released');
  fx.edit('pickupTimersEnabled',true);assert.equal(fx.parts.pickups[0].track.style.washColor,'#102040');
  fx.edit('enabled',false);stock();
});

test('flame follows ultimate placement/scale and rejuvenator controls preserve native state, parent/order/classes on release',()=>{
  const fx=fixture({prepare:enginePickups});const {flame,rejuv}=fx.parts,stockOrder=fx.root.Children().map(p=>p.id);
  // Config arrives after startup; native binding/state remains authoritative.
  fx.advance(1800);
  assert.ok(flame.GetParent()===fx.ult,'native flame adopted into ultimate group');
  assert.ok(fx.ult.Children().indexOf(flame)<fx.ult.Children().indexOf(fx.ultBackground));
  assert.equal(computed(flame,'visibility'),'collapse');
  fx.h.root.AddClass('has_killstreak');assert.equal(computed(flame,'visibility'),'visible');
  assert.equal(flame.FindChildrenWithClassTraverse('KSImage').length,1);
  assert.equal(computed(flame,'horizontalAlign'),'center');assert.equal(computed(fx.ult,'flowChildren'),'none');
  assert.equal(computed(flame,'marginTop'),'-20px','flame sits 7.5px above centre');assert.equal(computed(flame,'verticalAlign'),'top');assert.equal(computed(flame,'marginLeft'),'0px');assert.equal(computed(flame,'zIndex'),'2');
  assert.equal(flame.style.preTransformScale2d,'1','v2 shipped ultimate size mirrors scale 1 on the adopted flame');
  fx.edit('ultSize',40);fx.edit('ultOffsetX',23.4);fx.edit('ultOffsetY',-12.3);
  assert.equal(flame.style.preTransformScale2d,'2');assert.equal(fx.ultBackground.style.preTransformScale2d,'2');
  for(const [key,value] of Object.entries({rejuvOffsetX:200,rejuvOffsetY:-210,rejuvTilt:-360,rejuvSize:48}))fx.edit(key,value);
  const anchor=fx.root.FindChild('HPColorsV3RejuvenatorAnchor');
  assert.ok(rejuv.GetParent()===anchor);assert.equal(anchor.style.transform,'translate3d(200px, -210px, 0px)');
  assert.equal(rejuv.style.transform,'rotateZ(-360deg)');assert.equal(rejuv.style.preTransformScale2d,'2');
  assert.equal(computed(rejuv,'visibility'),'collapse');fx.h.root.AddClass('has_rejuv');assert.equal(computed(rejuv,'visibility'),'visible');
  fx.edit('enabled',false);
  assert.ok(flame.GetParent()===fx.root);assert.ok(rejuv.GetParent()===fx.root);
  assert.deepEqual(fx.root.Children().filter(p=>p.id!=='HPColorsV3ConfigRelay').map(p=>p.id),stockOrder.filter(id=>id!=='HPColorsV3ConfigRelay'));
  assert.equal(flame.style.preTransformScale2d,'0.8');assert.equal(rejuv.style.transform,'rotateZ(11deg)');assert.equal(rejuv.style.preTransformScale2d,'0.9');
  assert.equal(flame.BHasClass('HPColorsV3KillStreakAdopted'),false);assert.equal(fx.ult.BHasClass('HPColorsV3KillStreakOwner'),false);
  assert.equal(fx.h.root.BHasClass('has_killstreak'),true);assert.equal(fx.h.root.BHasClass('has_rejuv'),true);
});

test('native pickup replacement/visibility and hero-local/recycled gates release adopted indicators',()=>{
  const fx=fixture({prepare:enginePickups});fx.advance(1800);
  // The off-white border wash marks a styled pickup (pickups no longer take a margin of their own).
  const old=fx.parts.pickups[0];old.icon.visible=false;fx.advance(3300);assert.equal(old.border.style.washColor,'#ABCDEF');
  old.icon.visible=true;fx.advance(3300);assert.equal(old.border.style.washColor,'#FFEFD7');
  old.icon.SetParent(new MockPanel('Retired'));fx.advance(3300);assert.equal(old.border.style.washColor,'#ABCDEF');
  const oldFlame=fx.parts.flame;oldFlame.SetParent(new MockPanel('RetiredFlame'));
  const next=new MockPanel('Panel',fx.root,'KillStreakIndicator');next.style.preTransformScale2d='0.7';fx.advance(1200);
  assert.ok(next.GetParent()===fx.ult);assert.ok(oldFlame.GetParent()===fx.root,'released old flame restores captured root');
  oldFlame.DeleteAsync(0); // Engine retires the restored previous generation after replacement.
  for(const classes of [['player','enemy','LocalPlayer'],['boss_tier1','enemy'],['player','enemy','friend'],['player','enemy','team_neutral']]){
    fx.h.root.classes=classes;fx.advance(1200);
    assert.ok(next.GetParent()===fx.root);assert.equal(next.style.preTransformScale2d,'0.7');
    assert.ok(fx.parts.rejuv.GetParent()===fx.root);
  }
  fx.h.root.classes=['player','friend'];fx.advance(1200);assert.ok(next.GetParent()===fx.ult,'remote ally also qualifies without custom bar colors');
  fx.boot.includeScripts();fx.advance(600);fx.edit('enabled',false);assert.ok(next.GetParent()===fx.root);
});

test('critical stock classes cannot replace customized fill pulse; fractional bands and thresholds floor like v2',()=>{
  for(const side of ['enemy','ally']) {
    const fx=fixture({classes:['player',side==='enemy'?'enemy':'friend','health_critical'],prepare(parts,h){h.contextPanel.AddClass('ShowCriticalState');}});fx.advance(1800);
    fx.edit('barColorEnabled',true,side);fx.edit('barColorMode','fixed',side);fx.edit('pulseEnabled',true,side);fx.setHealth(25.5);fx.advance();
    assert.equal(fx.fill.style.washColor,side==='enemy'?'#FD4949':'#FFEFD7');
    for(const [intensity,name] of [[0,'Subtle'],[1,'Medium'],[2,'Intense']]){
      fx.edit('pulseIntensity',intensity,side);assert.equal(computed(fx.fill,'animationName'),'HPColorsV3Pulse'+name);
    }
    fx.edit('pulseThreshold',0,side);fx.setHealth(0.9);fx.advance();assert.equal(computed(fx.fill,'animationName'),'HPColorsV3PulseIntense');
    fx.setHealth(1);fx.advance();assert.equal(fx.fill.BHasClass('HPColorsV3Pulse'),false);
    fx.edit('pulseEnabled',false,side);fx.edit('enabled',false);
    assert.equal(computed(fx.fill,'animationName'),'healthCritFlash2');
  }
});

test('flame ledger restores pre-existing owner/adoption classes and sibling order when its next sibling disappears',()=>{
  const fx=fixture({prepare(parts,h){
    enginePickups(parts,h);parts.flame.AddClass('HPColorsV3KillStreakAdopted');parts.flame.AddClass('NativeFlameClass');
    parts.ult.AddClass('HPColorsV3KillStreakOwner');
  }});const {flame}=fx.parts,previous=fx.root.Children()[fx.root.Children().indexOf(flame)-1];
  fx.advance(1800);fx.edit('ultSize',30);
  fx.root.FindChild('StaminaContainer').DeleteAsync(0);
  fx.api.stop();
  assert.ok(flame.GetParent()===fx.root);
  assert.equal(fx.root.Children().indexOf(flame),fx.root.Children().indexOf(previous)+1);
  assert.equal(flame.style.preTransformScale2d,'0.8');
  assert.equal(flame.BHasClass('NativeFlameClass'),true);assert.equal(flame.BHasClass('HPColorsV3KillStreakAdopted'),true);
  assert.equal(fx.ult.BHasClass('HPColorsV3KillStreakOwner'),true);
});

test('replacement rejuvenator anchor re-adopts the same native leaf and restores it on master-off',()=>{
  const fx=fixture({prepare:enginePickups});fx.advance(1800);fx.edit('rejuvOffsetX',42);
  const old=fx.root.FindChild('HPColorsV3RejuvenatorAnchor');old.SetParent(new MockPanel('RetiredAnchor'));
  const next=new MockPanel('Panel',fx.root,'HPColorsV3RejuvenatorAnchor');next.style.transform='rotateZ(2deg)';
  fx.advance(1200);assert.ok(fx.parts.rejuv.GetParent()===next);assert.equal(next.style.transform,'translate3d(42px, 0px, 0px)');
  assert.ok(!old.style.transform);fx.edit('enabled',false);
  assert.ok(fx.parts.rejuv.GetParent()===fx.root);assert.equal(next.style.transform,'rotateZ(2deg)');
});

test('native self-moves preserve sibling order before renderer adoption and after release',()=>{
  const fx=fixture({prepare(parts,h){
    const flame=h.contextPanel.FindChild('KillStreakIndicator'),ids=h.contextPanel.Children().map(p=>p.id);
    h.contextPanel.MoveChildBefore(flame,flame);assert.deepEqual(h.contextPanel.Children().map(p=>p.id),ids);
    h.contextPanel.MoveChildAfter(flame,flame);assert.deepEqual(h.contextPanel.Children().map(p=>p.id),ids);
  }});
  fx.advance(1800);fx.edit('enabled',false);assert.ok(fx.root.FindChild('KillStreakIndicator'));
});

test('rejuvenator sub-stock step size renders a clean exact scale string',()=>{
  const fx=fixture({prepare:enginePickups});fx.advance(1800);fx.edit('rejuvSize',8.4);
  assert.equal(fx.parts.rejuv.style.preTransformScale2d,'0.35');
});

test('reused status panels refresh pickup kind and release when the pickup class disappears',()=>{
  const fx=fixture({prepare:enginePickups});fx.advance(4000);
  const pickup=fx.parts.pickups[0];
  pickup.icon.RemoveClass('gunpower_pickup');pickup.icon.AddClass('movement_pickup');
  fx.advance(3100);
  assert.equal(pickup.inner.style.washColor,'#6E65EA');assert.equal(pickup.border.style.washColor,'#FFEFD7');
  assert.equal(pickup.track.style.washColor,'#211E46','cached track follows the reused pickup kind');
  pickup.icon.RemoveClass('movement_pickup');fx.advance(3100);
  assert.equal(pickup.border.style.washColor,'#ABCDEF','ordinary reused panel restores its pickup styles');
  assert.equal(pickup.inner.style.washColor,'#AABBCC');
  assert.equal(pickup.track.style.washColor,'#445566');assert.equal(inline(pickup.track,'backgroundImage'),'url("stock-track.vtex")');
  assert.equal(pickup.track.style.clip,'radial(50% 50%, 0deg, -123deg)');
});

test('the preview visualFill hook leaves world plans and applied panels byte-identical while it paints and releases', () => {
  const fx = fixture(); fx.advance(1800);
  const config = latestPublishedConfig(fx.menu.harness).settings;
  const plan = () => JSON.stringify(fx.api.plan(fx.api.facts(), config));
  const applied = () => JSON.stringify(Object.entries(fx.parts).filter(([, panel]) => panel && panel.style).map(([key, panel]) =>
    [key, { ...panel.style }, [...panel.classes], panel.GetParent().id]));
  const beforePlan = plan(), beforeApplied = applied();
  const preview = fx.menu.harness.$.HPColorsV3Preview;
  const visual = fx.menu.harness.contextPanel.FindChildTraverse('HPColorsPreviewBarVisualFill');
  preview.open();
  const slider = fx.menu.harness.contextPanel.FindChildTraverse('HPColorsPreviewHealthSlider');
  slider.value = 20; slider.events.onvaluechanged();
  assert.ok(visual.BHasClass('HPColorsV3Pulse'), 'optional visualFill ledger is actively painting');
  fx.advance(1000);
  assert.equal(plan(), beforePlan, 'world plan bytes with the optional hook active');
  assert.equal(applied(), beforeApplied, 'world applied panel bytes with the optional hook active');
  preview.retire(); fx.advance(1000);
  assert.ok(!visual.BHasClass('HPColorsV3Pulse'));
  assert.equal(plan(), beforePlan, 'world plan bytes without the optional hook active');
  assert.equal(applied(), beforeApplied, 'world applied panel bytes without the optional hook active');
});

// NPC bars lost their switch (user, 2026-10-29). Customized objectives and neutral camps keep the game's bar
// layout and change only colors: "the bars should remain the same and don't modify the layout to match the
// player ones" (user, 2026-10-29). Ways this can fail: the side's bar size, offset, outline, lines, BAR STYLE or
// HP TEXT placement/font leaking into a unit bar; colors not applied; the gate not releasing exact stock.
const UNIT_CASES = [
  ['enemy objective', ['boss_tier1','enemy'], 'objectiveEnabled', 'enemy'],
  ['ally objective', ['building','friend'], 'objectiveEnabled', 'ally'],
];
for (const [name,classes,gate,side] of UNIT_CASES) test(`units: ${name} gate defaults off, changes only colors when on (stock layout) and releases exact stock`,()=>{
  const fx=fixture({classes,nativeStyles:{fill:{washColor:'#AABBCC'},stack:{transform:'rotateZ(2deg)'},value:{fontSize:'19px'}},
    prepare(parts){parts.small=new MockPanel('Panel',parts.lines,'UnitLine');parts.small.AddClass('line_small');parts.small.style.washColor='#123123';}});
  fx.advance(1800);
  const config=latestPublishedConfig(fx.menu.harness).settings;
  assert.equal(gate==='neutralEnabled'?config.shared[gate]:config.side[side][gate],false);
  const stock=()=>{
    assert.equal(fx.fill.style.washColor,'#AABBCC');assert.equal(fx.stack.style.transform,'rotateZ(2deg)');
    assert.equal(fx.value.style.fontSize,'19px');assert.ok(fx.value.GetParent()===fx.info);
    assert.ok(fx.status.GetParent()===fx.root);assert.ok(fx.name.GetParent()===fx.root);
    assert.equal(fx.parts.small.style.washColor,'#123123');assert.equal(fx.root.BHasClass('HPColorsV3Core'),false);
    for(const panel of [fx.primary,fx.inner,fx.lines])assert.equal(computed(panel,'opacityMask'),undefined);
    assert.equal(computed(fx.primary,'backgroundColor'),undefined);
  };
  stock();
  // Dependent rows: open the gate first so the colors it uses are editable (player colors stay off).
  fx.edit(gate,true,side);fx.edit('barColorEnabled',false,side);fx.edit('hpTextVisible',true,side);
  fx.edit('barColorMode','fixed',side);fx.edit('barColorLow','#112233',side);fx.edit('barColorMid','#223344',side);fx.edit('barColorHigh','#334455',side);
  fx.edit('barWidth',158,side);fx.edit('barHeight',36,side);fx.edit('hpTextFont','pulp',side);fx.edit('hpTextSize',20,side);
  fx.edit('lineColorEnabled',true,side);fx.edit('lineColor','#445566',side);fx.edit('lineOpacity',40,side);
  fx.edit('barOffsetX',30,side);fx.edit('barOutlineEnabled',true,side);fx.edit('barStyle','old');fx.edit('barDeltaColor','#C0FFEE',side);fx.advance(1600);
  assert.notEqual(fx.api.status.state,'dormant');
  assert.equal(fx.fill.style.washColor,'#223344','unit gate is independent of player color toggle');
  assert.equal(fx.parts.delta.style.washColor,'#C0FFEE','the side damage delta color');
  assert.ok(fx.status.GetParent()===fx.root,'the native status is never moved into the hero motion frame');
  assert.equal(fx.root.BHasClass('HPColorsV3Layout'),false);
  assert.equal(fx.stack.style.transform,'rotateZ(2deg)','stock bar position');assert.ok(!fx.stack.style.preTransformScale2d,'stock bar size');
  assert.ok(fx.value.GetParent()===fx.info,'the HP number stays in its stock slot');
  assert.equal(fx.value.style.fontSize,'19px','HP TEXT settings do not apply');assert.ok(!fx.value.style.fontFamily);
  assert.equal(computed(fx.primary,'marginLeft'),'0px','no hero inset on units');
  assert.ok(!fx.lines.style.opacity,'stock lines');assert.equal(fx.parts.small.style.washColor,'#123123','stock line color');
  for(const key of ['HPColorsV3Outline','HPColorsV3BarOld','HPColorsV3BarPips','HPColorsV3BarMask','HPColorsV3BarLines','HPColorsV3HPText'])
    assert.equal(fx.root.BHasClass(key),false,key+' not on a unit bar');
  fx.edit('barStyle','none');fx.edit('linesVisible',false,side);fx.advance(1600);
  assert.equal(fx.root.BHasClass('HPColorsV3LinesHidden'),false,'Show health lines off never hides a unit bar\'s stock lines');
  assert.notEqual(computed(fx.lines,'visibility'),'collapse');
  fx.edit('linesVisible',true,side);fx.edit('barStyle','old');fx.advance(1600);
  fx.setHealth(10);fx.advance();
  assert.equal(fx.fill.BHasClass('HPColorsV3Pulse'),side==='enemy','v2 unit bar pulse (a color effect) follows the side toggle');
  for(const key of ['HPColorsV3KillMarker','HPColorsV3Level','HPColorsV3UltPlaced','HPColorsV3UltimateProgress','HPColorsV3NameHidden'])
    assert.equal(fx.root.BHasClass(key),false,key+' stays player-only');
  fx.edit('barOutlineCustomColor',true,side);fx.edit('barOutlineColor','#FF00FF',side);
  assert.notEqual(fx.outline.style.backgroundColor,'#FF00FF','unit outline retains stock relation color');
  fx.edit(gate,false,side);stock();assert.equal(fx.api.status.state,'dormant');
  fx.edit(gate,true,side);fx.advance(1600);assert.equal(fx.fill.style.washColor,'#112233','reopened gate paints the low band at 10%');
  fx.edit('enabled',false);stock();
});
// 2026-10-29 (user): customized neutral camps keep the game's bar shape and take custom bar colors only; their HP
// number shows by default (stock show/fade) or always, at the stock spot or at a custom position and tilt.
// Ways this can fail: the fill or damage flash left stock; the bar scaled, moved, outlined, lined, masked, OLD or
// shaken by enemy bar settings; enemy HP TEXT settings (adoption, font, size, color) leaking into the neutral number;
// Always show not forcing it, or Default forcing it; the custom spot not starting at the stock one, not offsetting
// or tilting, or still applied with its switch off; the gate not releasing exact stock; NPC bars still customized.
test('units: customized neutral camps keep the stock bar shape and change only its colors',()=>{
  const fx=fixture({classes:['neutral_normal','team_neutral'],nativeStyles:{fill:{washColor:'#AABBCC'},delta:{washColor:'#DDEEFF'},stack:{transform:'rotateZ(2deg)'},value:{fontSize:'19px'}}});
  fx.advance(1800);
  assert.equal(latestPublishedConfig(fx.menu.harness).settings.shared.neutralEnabled,false);
  fx.edit('neutralEnabled',true);fx.edit('neutralColor','#556677');fx.edit('barDeltaColor','#C0FFEE');
  fx.edit('hpTextVisible',true);fx.edit('hpTextFont','pulp');fx.edit('hpTextSize',20);fx.edit('barColorMode','fixed');fx.edit('barColorMid','#223344');
  fx.edit('barWidth',158);fx.edit('barOffsetX',30);fx.edit('barOutlineEnabled',true);fx.edit('lineOpacity',40);
  fx.edit('barStyle','old');fx.edit('damageShakeStrength',7);fx.advance(1600);
  assert.equal(fx.fill.style.washColor,'#556677','neutral fill color');
  assert.equal(fx.parts.delta.style.washColor,'#C0FFEE','enemy damage delta color');
  assert.equal(fx.stack.style.transform,'rotateZ(2deg)','stock bar position');
  assert.ok(!fx.stack.style.preTransformScale2d,'stock bar size');
  assert.ok(!fx.lines.style.opacity,'stock lines');
  for(const key of ['HPColorsV3Outline','HPColorsV3BarOld','HPColorsV3BarMask','HPColorsV3Shake7','HPColorsV3ShakeOff','HPColorsV3BarLines','HPColorsV3HPText'])
    assert.equal(fx.root.BHasClass(key),false,key+' not on a neutral bar');
  assert.ok(fx.value.GetParent()===fx.info,'the HP number stays in its stock slot');
  assert.equal(fx.value.style.fontSize,'19px','enemy HP TEXT settings do not apply');
  assert.ok(!fx.value.style.fontFamily);assert.ok(!fx.value.style.washColor);
  fx.edit('neutralEnabled',false);fx.advance(1600);
  assert.equal(fx.fill.style.washColor,'#AABBCC');assert.equal(fx.parts.delta.style.washColor,'#DDEEFF');
  assert.equal(fx.root.BHasClass('HPColorsV3Core'),false);
});
test('units: the neutral HP number shows by default or always, at the stock spot or a custom position and tilt',()=>{
  const fx=fixture({classes:['neutral_normal','team_neutral'],nativeStyles:{value:{fontSize:'19px'}}});
  fx.advance(1800);
  const shared=()=>latestPublishedConfig(fx.menu.harness).settings.shared;
  fx.edit('neutralEnabled',true);fx.advance(1600);
  assert.deepEqual(['neutralHpTextMode','neutralHpPositionEnabled','neutralHpOffsetX','neutralHpOffsetY','neutralHpTilt'].map(key=>shared()[key]),['default',false,0,0,-3]);
  assert.equal(fx.root.BHasClass('HPColorsV3Core'),true);
  assert.equal(fx.root.BHasClass('HPColorsV3UnitHPAlways'),false,'Default keeps the stock show/fade');
  assert.ok(!fx.value.style.transform,'stock spot and tilt');
  fx.edit('objectiveEnabled',true);fx.edit('objectiveHpTextMode','always');fx.edit('objectiveHpPositionEnabled',true);fx.edit('objectiveHpOffsetX',30);fx.advance(1600);
  assert.equal(fx.root.BHasClass('HPColorsV3UnitHPAlways'),false,'objective Always show never reaches neutral camps');
  assert.ok(!fx.value.style.transform,'objective position never reaches neutral camps');
  fx.edit('neutralHpTextMode','always');fx.advance(1600);
  assert.equal(fx.root.BHasClass('HPColorsV3UnitHPAlways'),true,'Always show');
  assert.equal(computed(fx.value,'visibility'),'visible');assert.equal(computed(fx.value,'opacity'),'1');
  fx.edit('neutralHpPositionEnabled',true);fx.advance(1600);
  assert.equal(fx.value.style.transform,'translate3d(0px, 0px, 0px) rotateZ(-3deg)','the custom spot starts at the stock one');
  fx.edit('neutralHpOffsetX',12);fx.edit('neutralHpOffsetY',-7);fx.edit('neutralHpTilt',10);fx.advance(1600);
  assert.equal(fx.value.style.transform,'translate3d(12px, -7px, 0px) rotateZ(10deg)');
  fx.edit('neutralHpPositionEnabled',false);fx.advance(1600);
  assert.ok(!fx.value.style.transform,'switch off returns the stock spot');
  fx.edit('neutralHpTextMode','default');fx.advance(1600);
  assert.equal(fx.root.BHasClass('HPColorsV3UnitHPAlways'),false);
  fx.edit('neutralHpTextMode','always');fx.edit('neutralEnabled',false);fx.advance(1600);
  assert.equal(fx.root.BHasClass('HPColorsV3UnitHPAlways'),false,'gate off releases Always show');
  assert.equal(fx.root.BHasClass('HPColorsV3Core'),false);
});
// Objective HP number (user, 2026-10-29: "make the option for the objective to be same customizable as the neutral").
// Shared like the neutral rows; each side's objective gate still decides which objectives take them. Ways this can
// fail: the neutral settings leaking onto objectives (or the reverse), the gate not releasing Always show or the
// custom spot, or one side's closed gate still moving that side's objective HP number.
for (const [name,classes,side,other] of [['enemy',['boss_tier1','enemy'],'enemy','ally'],['ally',['building','friend'],'ally','enemy']])
  test(`units: the ${name} objective HP number shows by default or always, at the stock spot or a custom position and tilt`,()=>{
    const fx=fixture({classes,nativeStyles:{value:{fontSize:'19px'}}});
    fx.advance(1800);
    const shared=()=>latestPublishedConfig(fx.menu.harness).settings.shared;
    assert.deepEqual(['objectiveHpTextMode','objectiveHpPositionEnabled','objectiveHpOffsetX','objectiveHpOffsetY','objectiveHpTilt'].map(key=>shared()[key]),['default',false,0,0,-3]);
    fx.edit('objectiveEnabled',true,side);fx.advance(1600);
    assert.equal(fx.root.BHasClass('HPColorsV3Core'),true);
    assert.equal(fx.root.BHasClass('HPColorsV3UnitHPAlways'),false,'Default keeps the stock show/fade');
    assert.ok(!fx.value.style.transform,'stock spot and tilt');
    // The neutral options never reach objectives.
    fx.edit('neutralEnabled',true);fx.edit('neutralHpTextMode','always');fx.edit('neutralHpPositionEnabled',true);fx.edit('neutralHpOffsetX',30);fx.advance(1600);
    assert.equal(fx.root.BHasClass('HPColorsV3UnitHPAlways'),false,'neutral Always show');
    assert.ok(!fx.value.style.transform,'neutral position');
    fx.edit('objectiveHpTextMode','always');fx.advance(1600);
    assert.equal(fx.root.BHasClass('HPColorsV3UnitHPAlways'),true,'Always show');
    assert.equal(computed(fx.value,'visibility'),'visible');assert.equal(computed(fx.value,'opacity'),'1');
    fx.edit('objectiveHpPositionEnabled',true);fx.advance(1600);
    assert.equal(fx.value.style.transform,'translate3d(0px, 0px, 0px) rotateZ(-3deg)','the custom spot starts at the stock one');
    fx.edit('objectiveHpOffsetX',12);fx.edit('objectiveHpOffsetY',-7);fx.edit('objectiveHpTilt',10);fx.advance(1600);
    assert.equal(fx.value.style.transform,'translate3d(12px, -7px, 0px) rotateZ(10deg)');
    assert.equal(fx.value.style.fontSize,'19px','stock font size kept');
    assert.ok(fx.value.GetParent()===fx.info,'the HP number stays in its stock slot');
    fx.edit('objectiveEnabled',true,other);fx.edit('objectiveEnabled',false,side);fx.advance(1600);
    assert.equal(fx.root.BHasClass('HPColorsV3UnitHPAlways'),false,'the other side\'s gate does not open this objective');
    assert.ok(!fx.value.style.transform,'gate off returns the stock spot');
    assert.equal(fx.root.BHasClass('HPColorsV3Core'),false);
    fx.edit('objectiveEnabled',true,side);fx.edit('objectiveHpPositionEnabled',false);fx.edit('objectiveHpTextMode','default');fx.advance(1600);
    assert.ok(!fx.value.style.transform,'switch off returns the stock spot');
    assert.equal(fx.root.BHasClass('HPColorsV3UnitHPAlways'),false);
  });
for (const [name,classes] of [['enemy NPC',['creature','enemy']],['ally NPC',['minion','friend']]])
  test(`units: ${name} bars are never customized (Customize NPCs removed)`,()=>{
    const fx=fixture({classes,nativeStyles:{fill:{washColor:'#AABBCC'},stack:{transform:'rotateZ(2deg)'}}});
    fx.advance(1800);
    const config=latestPublishedConfig(fx.menu.harness).settings;
    assert.equal(Object.hasOwn(config.side.enemy,'npcEnabled')||Object.hasOwn(config.side.ally,'npcEnabled'),false);
    fx.edit('neutralEnabled',true);fx.edit('objectiveEnabled',true,'enemy');fx.edit('objectiveEnabled',true,'ally');
    fx.edit('barWidth',158,'enemy');fx.edit('barWidth',158,'ally');fx.advance(1600);
    assert.equal(fx.fill.style.washColor,'#AABBCC');assert.equal(fx.stack.style.transform,'rotateZ(2deg)');
    assert.equal(fx.root.BHasClass('HPColorsV3Core'),false);
  });

function openUnitGates(fx) {
  for(const side of ['enemy','ally'])fx.edit('objectiveEnabled',true,side);
  fx.edit('neutralEnabled',true);
}
test('units: unknown kinds/relations, conflicting owners and neutral objectives never gain active customization',()=>{
  const fx=fixture({classes:[],prepare:enginePickups});fx.advance(1800);openUnitGates(fx);
  for(const classes of [[],['enemy'],['mystery','friend'],['mystery','team_neutral'],['creature'],['building','team1'],
    ['creature','enemy','friend'],['building','enemy','friend'],['creature','enemy','team1','team2'],
    ['player','enemy','friend'],['player','enemy','LocalPlayer'],['player','team_neutral'],['player','enemy','midboss'],
    ['neutral_vault','enemy'],['boss_tier1','team_neutral'],['building','team_neutral']]) {
    fx.h.root.classes=classes;fx.advance(1200);
    assert.equal(fx.api.status.state,'dormant',classes.join(' '));
    assert.equal(fx.root.BHasClass('HPColorsV3Core'),false,classes.join(' '));
    assert.ok(fx.status.GetParent()===fx.root);assert.ok(fx.value.GetParent()===fx.info);
    assert.equal(fx.root.HPColorsV3StockLedger.some(owner=>owner.owned),false);
    assert.equal(computed(fx.inner,'opacityMask'),undefined);
  }
});
test('units: v2 NPC facts never own a bar except neutral camps, building precedence holds, neutral facts win relation',()=>{
  const fx=fixture({classes:[]});fx.advance(1800);openUnitGates(fx);
  for(const name of ['creature','minion','CLASS_TROOPER','CLASS_TROOPER_BOSS','neutral_weak','neutral_normal','neutral_strong','midboss']) {
    fx.h.root.classes=[name,'enemy'];fx.advance(1200);
    const neutral=/^neutral_/.test(name);
    assert.equal(fx.api.facts().eligible,neutral,name+(neutral?': neutral gate':': NPC bars are never customized'));
    assert.equal(fx.root.BHasClass('HPColorsV3Core'),neutral,name);
    if(neutral)assert.equal(fx.fill.style.washColor,'#5BEFB5',name);
  }
  fx.h.root.classes=['creature','enemy','friend','team_neutral'];fx.advance(1200);
  assert.equal(fx.api.facts().side,'neutral');assert.equal(fx.fill.style.washColor,'#5BEFB5','neutral-first relation even with enemy/friend facts');
  fx.h.root.classes=['building','creature','enemy'];fx.advance(1200);
  assert.equal(fx.api.facts().kind,'objective');fx.edit('objectiveEnabled',false);
  assert.equal(fx.api.status.state,'dormant','no other gate owns a building');
});
// GameBanana report (panicpulsenow, 2026-10-27): a customized neutral copied the enemy bar setup but not its
// feedback color. Neutral bars only show the bar and the damage delta (user, 2026-10-28), so the delta now
// follows the enemy damage delta color; the bar keeps the neutral fill color and nothing else is styled.
test('units: customized neutral camps take the enemy damage delta color and release it back to stock',()=>{
  const fx=fixture({classes:['neutral_normal','team_neutral']});fx.advance(1800);
  const stock={delta:fx.delta.style.washColor,healing:fx.healing.style.washColor};
  fx.edit('neutralEnabled',true);fx.advance(1200);
  assert.equal(fx.api.facts().side,'neutral');
  assert.equal(fx.fill.style.washColor,'#5BEFB5','the bar keeps the neutral fill color');
  assert.equal(String(fx.delta.style.washColor).toUpperCase(),'#FFE55B','enemy damage delta default');
  fx.edit('barDeltaColor','#123456','enemy');fx.advance(400);
  assert.equal(String(fx.delta.style.washColor).toUpperCase(),'#123456','follows the enemy delta edit');
  fx.edit('barDeltaColor','#654321','ally');fx.advance(400);
  assert.equal(String(fx.delta.style.washColor).toUpperCase(),'#123456','the ally delta never applies to neutrals');
  assert.equal(fx.healing.style.washColor||'',stock.healing||'','no other feedback layer is styled');
  fx.edit('neutralEnabled',false);fx.advance(1200);
  assert.equal(fx.delta.style.washColor||'',stock.delta||'','closing the gate restores the stock delta (cleared inline)');
});
test('units: all nine boss/building kinds keep the native status and stock damage motion with gates open, including split carriers',()=>{
  for(const [index,name] of ['boss_barracks','boss_tier1','boss_tier2','boss_tier3','building','CLASS_DESTROYABLE_BUILDING','barracks','neutral_vault','midboss'].entries()) {
    // The vault is inherently neutral; every gate remains open but none can own it.
    // The midboss is a neutral NPC in game: only the neutral gate can own it since NPC bars lost their switch.
    const relation=name==='midboss'?'team_neutral':'enemy';
    const fx=fixture({classes:index%2?[relation,'active_damage']:[name,relation,'active_damage'],
      prepare(parts,h){if(index%2)new MockPanel('Higher',{classes:[name],operationCounts:h.operationCounts}).add(h.root);}});
    fx.advance(1800);const stockMotion=computed(fx.status,'animationName');openUnitGates(fx);fx.advance(1200);
    if(name==='neutral_vault') {
      assert.equal(fx.root.BHasClass('HPColorsV3Core'),false);
      assert.equal(computed(fx.motion,'animationName'),undefined,'neutral objective stays on the unowned motion frame');
      assert.ok(fx.status.GetParent()===fx.root);
      continue;
    }
    // Unit bars keep the native status and its stock damage motion (user, 2026-10-29: layout stays stock).
    assert.equal(fx.root.BHasClass('HPColorsV3Core'),true,name);
    assert.ok(fx.status.GetParent()===fx.root,name);
    assert.equal(computed(fx.status,'animationName'),stockMotion,name+': same damage motion as with the gate closed');
  }
  const npc=fixture({classes:['creature','enemy','active_damage']});npc.advance(1800);openUnitGates(npc);
  assert.equal(computed(npc.status,'animationName'),'active_damage_wiggle','ordinary NPC keeps damage motion');
});
test('units: dormant ancestors wake on late open-gate classes and recycled units release to stock',()=>{
  let higher;
  const fx=fixture({classes:[],prepare(parts,h){higher=new MockPanel('Higher',{classes:[],operationCounts:h.operationCounts});higher.add(h.root);}});
  fx.advance(1800);fx.edit('objectiveEnabled',true);fx.edit('hpTextVisible',true);
  const owned=()=>fx.root.BHasClass('HPColorsV3Core');
  higher.classes=['building','enemy'];fx.advance(1200);assert.equal(owned(),true);
  higher.classes=['CLASS_TROOPER','enemy'];fx.advance(1200);assert.equal(owned(),false,'a recycled NPC releases');
  higher.classes=['boss_tier1','enemy'];fx.advance(1200);assert.equal(owned(),true);
  higher.classes=['building','friend'];fx.advance(1200);assert.equal(owned(),false);
  fx.edit('objectiveEnabled',true,'ally');fx.advance(1200);assert.equal(fx.root.BHasClass('HPColorsV3Core'),true);
  higher.classes=['mystery','friend'];fx.advance(1200);assert.equal(fx.root.BHasClass('HPColorsV3Core'),false);
});
for(const [name,classes,gate,side] of UNIT_CASES)for(const scenario of ['dormant','released','otherGate','otherSide','active','idle','shieldedActive','shieldedIdle'])
  test(`units budget: ${name} ${scenario} stays under the operations and walk ceilings`,t=>{
    const mode=scenario.startsWith('shielded')?scenario.endsWith('Active')?'active':'idle':scenario;
    const fx=fixture({classes,prepare(parts){for(let i=1;i<=8;i++){const line=new MockPanel('Panel',parts.lines,'UnitLine'+i);line.AddClass(i%4?'line_small':'line_large');}}});
    fx.advance(1800);
    if(mode!=='dormant'){fx.edit('hpTextVisible',true,side);fx.edit('lineColorEnabled',true,side);fx.edit(gate,true,side);}
    if(mode==='released')fx.edit(gate,false,side);
    if(mode==='otherGate'){fx.edit(gate,false,side);fx.edit('neutralEnabled',true);}
    if(mode==='otherSide'){fx.edit(gate,false,side);fx.edit(gate,true,side==='enemy'?'ally':'enemy');}
    if(scenario.startsWith('shielded')){
      fx.shield.AddClass('HasHealth');fx.shield.style.clip='rect(0%, 85%, 100%, 80%)';
      fx.armor.AddClass('HasHealth');fx.armor.style.clip='rect(0%, 90%, 100%, 85%)';
    }
    fx.advance(6000);for(const key of Object.keys(fx.h.operationCounts))fx.h.operationCounts[key]=0;
    let injected=0;
    for(let ms=0;ms<10000;ms+=100){if(mode==='active'){fx.setHealth(50+(ms/100)%30);injected++;}fx.advance(100);}
    const operations={...fx.h.operationCounts};operations.styleWrites-=injected;
    const ops=COUNTED.reduce((sum,key)=>sum+(operations[key]||0),0)/10,walked=(operations.classTraversalNodes||0)/10;
    t.diagnostic(JSON.stringify({unit:name,scenario,mode,ops,walked}));
    assert.ok(ops<=(!['active','idle'].includes(mode)?30:mode==='idle'?200:300),`${name} ${mode}: ${ops}`);
    assert.ok(walked<=1500);assert.equal(operations.parentWrites,0);assert.equal(operations.classWrites,0);
    assert.equal(fx.api.status.state,['active','idle'].includes(mode)?mode:'dormant');
  });

test('units: v2 objective bar pulse follows unit colors, while pulse-hide and HP pulse/modifiers remain player-only',()=>{
  for(const [classes,gate,side] of [[['boss_tier1','enemy'],'objectiveEnabled','enemy'],[['building','friend'],'objectiveEnabled','ally']]) {
    const fx=fixture({classes});fx.advance(1800);
    fx.edit('barColorEnabled',false,side);fx.edit('hpTextVisible',true,side);fx.edit(gate,true,side);
    fx.edit('pulseEnabled',true,side);fx.edit('pulseColorEnabled',true,side);fx.edit('pulseColorMode','fixed',side);fx.edit('pulseColor','#123456',side);
    fx.edit('pulseReadout',true,side);fx.edit('pulseReadoutModifiers',true);fx.edit('pulseReadoutSize',30);
    fx.setHealth(10);fx.advance();
    assert.equal(computed(fx.fill,'animationName'),'HPColorsV3PulseMedium');
    assert.equal(fx.fill.style.washColor,'#123456');assert.equal(fx.value.BHasClass('HPColorsV3Pulse'),false);
    assert.ok(!fx.value.style.fontSize&&!fx.value.style.washColor,'unit bars keep the stock HP number');
    fx.edit('pulseHideBar',true);
    assert.equal(fx.root.BHasClass('HPColorsV3BarHidden'),false,'hiding the bar is player-only: unit layout stays stock');
    fx.edit('pulseColorMode','gradient',side);assert.equal(fx.root.FindChildTraverse('HPColorsV3PulseOverlay').BHasClass('HPColorsV3ColorPulse'),true);
    fx.edit(gate,false,side);assert.equal(fx.fill.BHasClass('HPColorsV3Pulse'),false);
  }
});

for(const classes of [[],['enemy'],['mystery','friend'],['creature','enemy','friend'],['neutral_vault','enemy'],['building','team_neutral']])
  test(`units budget: unknown/ambiguous/neutral-objective ${classes.join(' ')||'unclassified'} stays dormant with all gates open`,t=>{
    const fx=fixture({classes});fx.advance(1800);openUnitGates(fx);fx.advance(6000);
    for(const key of Object.keys(fx.h.operationCounts))fx.h.operationCounts[key]=0;
    fx.advance(10000);const ops=COUNTED.reduce((sum,key)=>sum+(fx.h.operationCounts[key]||0),0)/10;
    t.diagnostic(JSON.stringify({unit:'excluded '+classes.join(' '),mode:'dormant',ops,walked:(fx.h.operationCounts.classTraversalNodes||0)/10}));
    assert.ok(ops<=30,`${ops} > 30`);assert.equal(fx.api.status.state,'dormant');
    assert.equal(fx.root.HPColorsV3StockLedger.some(owner=>owner.owned),false);
  });

test('audit18: owned objective recycled into an unknown kind releases even with that side objective gate open',()=>{
  const fx=fixture({classes:['building','enemy']});fx.advance(1800);
  fx.edit('hpTextVisible',true,'enemy');fx.edit('objectiveEnabled',true,'enemy');fx.advance(1200);
  assert.equal(fx.root.BHasClass('HPColorsV3Core'),true);
  fx.h.root.classes=['mystery','enemy'];fx.advance(1200);
  assert.equal(fx.root.BHasClass('HPColorsV3Core'),false,'unknown kind must not keep objective ownership');
  assert.ok(fx.value.GetParent()===fx.info);
});
for(const [gate,relation,tag] of [['neutralEnabled','team_neutral','creature'],['objectiveEnabled','enemy','building']])
  test(`audit18: late ${tag} class on a relation-free ancestor wakes ${gate} within five seconds`,t=>{
    let higher;
    const fx=fixture({classes:[relation],prepare(parts,h){higher=new MockPanel('Higher',{classes:[],operationCounts:h.operationCounts});higher.add(h.root);}});
    fx.advance(1800);fx.edit(gate,true);fx.edit('hpTextVisible',true);fx.advance(1200);
    higher.classes=[tag];
    let elapsed=0;
    while(!fx.root.BHasClass('HPColorsV3Core')&&elapsed<5000){fx.advance(100);elapsed+=100;}
    t.diagnostic(JSON.stringify({gate,tag,lateKindWakeMs:elapsed}));
    assert.equal(fx.root.BHasClass('HPColorsV3Core'),true,'split kind/relation carriers should own after periodic wake');
    // Unit bars keep their HP number in the stock slot (user, 2026-10-29).
    assert.ok(fx.value.GetParent()===fx.info);
  });
test('audit18: all nine native kind classes exclude motion wiggle immediately before classification polls',()=>{
  for(const name of ['boss_barracks','boss_tier1','boss_tier2','boss_tier3','building','CLASS_DESTROYABLE_BUILDING','barracks','neutral_vault','midboss']) {
    // Only hero bars use the motion frame since 2026-10-29: a recycled hero panel that gains a kind class
    // stops the native-strength wiggle in CSS before classification catches up.
    const fx=fixture({classes:['player','enemy','active_damage']});fx.advance(1800);
    assert.equal(fx.root.BHasClass('HPColorsV3Core'),true);assert.ok(fx.status.GetParent()===fx.motion);
    assert.equal(computed(fx.motion,'animationName'),'active_damage_wiggle');
    const before=fx.api.status.fullPaints;
    fx.h.root.AddClass(name);
    assert.equal(fx.api.status.fullPaints,before,'no scheduler/config repaint');
    assert.equal(fx.root.BHasClass('HPColorsV3Core'),true,'script classification has not caught up');
    assert.equal(computed(fx.motion,'animationName'),'none',name+' native CSS responds immediately');
    assert.equal(computed(fx.motion,'preTransformScale2d'),'1',name);
  }
});

// ---- Ticket 19: BAR STYLE V1/V2/OLD (v2 barMask). Engine lines sit at 250k/total of the
// lines box with an inline percent position (IDA 6711 UpdateTickBar), none above 50 lines.
const MASK='url("s2r://panorama/images/hud/healthbar/healthbar_backer_horiz_mask_flipped.vsvg")';
function engineLines(fx,total) {
  for(const child of [...fx.lines.children]) child.DeleteAsync(0);
  const count=Math.floor(total/250)>50?0:Math.floor(total/250);
  for(let k=1;k<=count;k++) {
    const line=new MockPanel('Panel',fx.lines,'EngineLine'+k);line.AddClass(k%4?'line_small':'line_large');
    line.style.position=(250*k/total*100)+'% 0px 0px';
  }
}
function pipLayer(fx,name) { return fx.primary.FindChild('HPColorsV3PipGrid').FindChild('HPColorsV3Pip'+name); }
function expectGrid(fx,total,label) {
  const grid=fx.primary.FindChild('HPColorsV3PipGrid');
  assert.equal(fx.root.BHasClass('HPColorsV3BarPips'),true,label);
  const result=oldGrid.expectEmpty(pipLayer(fx,'Empty'),total,label);
  assert.equal(computed(grid,'visibility'),'visible',label);assert.equal(grid.style.height,Math.min(result.rows,4)*6+'px',label);
  for(const panel of oldGrid.descendants(pipLayer(fx,'Empty'))) if(panel.BHasClass('HPColorsV3Pip')) assert.equal(computed(panel,'backgroundColor'),'#182123');
  return { ...result, fill:oldGrid.boxes(pipLayer(fx,'Fill')) };
}
// Fill boxes for hp HP on a grid of total HP: full boxes, then one partial box.
function expectFill(list,total,hp,label) {
  const rows=Math.ceil(Math.ceil(total/100-0.05)/10), want=[];
  for(let i=0;i*100<hp;i++) want.push(8.5*Math.min(1,(hp-i*100)/100));
  assert.equal(list.length,want.length,label+' fill boxes');
  list.forEach((box,i)=>{oldGrid.near(box.x,i%10*10,label+' x'+i);oldGrid.near(box.y,(rows-1-Math.floor(i/10))*100/rows,label+' y'+i);oldGrid.near(box.w,want[i],label+' w'+i);});
}
function sameTree(actual,expected,label) {
  const a=JSON.parse(actual),b=JSON.parse(expected);
  assert.equal(a.length,b.length,label+' panel count');
  a.forEach((row,i)=>assert.deepEqual(row,b[i],label+' '+row[0]));
}
function nativeSnapshot(fx) {
  const out=[];
  (function walk(panel) {
    if (panel.id==='HPColorsV3PipGrid') return; // Renderer-created OLD boxes; asserted collapsed separately.
    if (panel.id==='HPColorsV3EventRelay') return; // Config transport, owned by the bridge lifecycle.
    // The mock stores a cleared (null) inline value as ''; both mean unset.
    out.push([panel.id,JSON.stringify(Object.fromEntries(Object.entries({...panel.style}).filter(([,value])=>value!==''&&value!==undefined))),[...panel.classes].sort().join(' '),panel.parent&&panel.parent.id]);
    panel.children.forEach(walk);
  })(fx.h.root);
  return JSON.stringify(out);
}
function counted(fx) { return COUNTED.reduce((sum,key)=>sum+(fx.h.operationCounts[key]||0),0)/10; }

test('ticket 19: BAR STYLE V2 restores exactly the stock masks on customized world bars and V1/off stay rectangular',()=>{
  const fx=fixture();fx.advance(600);
  const shield=fx.stack.FindChild('UnitShieldbar'),masked=[fx.inner,fx.lines,shield,shield.FindChild('UnitHealthbarInner')];
  for(const panel of [fx.primary,...masked]) assert.equal(computed(panel,'opacityMask'),undefined,'V1 default '+panel.id);
  fx.edit('barStyle','original');
  assert.equal(latestPublishedConfig(fx.menu.harness).settings.shared.barStyle,'original');
  assert.equal(fx.root.BHasClass('HPColorsV3BarMask'),true);
  for(const panel of masked) assert.equal(computed(panel,'opacityMask'),MASK,'V2 '+panel.id);
  // Outlined (default): only the primary container drops its mask; the backer rim takes it.
  assert.equal(computed(fx.primary,'opacityMask'),undefined);assert.equal(computed(fx.outline,'opacityMask'),MASK);
  assert.equal(computed(fx.outline,'visibility'),'visible');
  fx.edit('barOutlineEnabled',false);assert.equal(computed(fx.primary,'opacityMask'),MASK);
  assert.equal(computed(fx.primary,'backgroundColor'),'#00000000','outer backgrounds stay deleted');
  fx.edit('barStyle','none');
  for(const panel of [fx.primary,...masked]) assert.equal(computed(panel,'opacityMask'),undefined,'back to V1 '+panel.id);
  assert.equal(fx.root.BHasClass('HPColorsV3BarMask'),false);
  fx.edit('barStyle','original');fx.edit('enabled',false);
  for(const panel of [fx.primary,...masked]) assert.equal(computed(panel,'opacityMask'),undefined,'master off '+panel.id);
  // Unit bars keep the stock bar with V2 selected, gate closed or open (user, 2026-10-29: layout stays stock).
  const unit=fixture({classes:['boss_tier1','enemy']});unit.advance(600);unit.edit('enabled',true);unit.edit('barStyle','original');unit.advance(1100);
  assert.equal(unit.root.BHasClass('HPColorsV3BarMask'),false);assert.equal(computed(unit.inner,'opacityMask'),undefined);
  unit.edit('objectiveEnabled',true);unit.advance(1100);
  assert.equal(unit.root.BHasClass('HPColorsV3Core'),true);
  assert.equal(unit.root.BHasClass('HPColorsV3BarMask'),false);assert.equal(computed(unit.inner,'opacityMask'),undefined,'open objective gate keeps the stock bar');
  const camp=fixture({classes:['neutral_normal','team_neutral']});camp.advance(600);camp.edit('barStyle','original');camp.edit('neutralEnabled',true);camp.advance(1100);
  assert.equal(camp.root.BHasClass('HPColorsV3Core'),true);assert.equal(camp.root.BHasClass('HPColorsV3BarMask'),false,'neutral camps keep the stock bar');
});

test('ticket 19: OLD derives max HP from engine lines and lays out the v2 pip grid at several totals',()=>{
  const fx=fixture({prepare(parts) {
    // Live fact: opacity-0 panels are not laid out. OLD boxes hide the native inner.
    for(const panel of [parts.inner,parts.fill]) {
      const native=Object.getOwnPropertyDescriptor(panel,'actuallayoutwidth');
      Object.defineProperty(panel,'actuallayoutwidth',{...native,get() { const w=native.get(); return parts.status.GetParent()&&parts.status.GetParent().parent&&parts.status.GetParent().parent.__classes.has('HPColorsV3BarPips')?0:w; }});
    }
  }});
  engineLines(fx,1000);fx.advance(600);fx.edit('barStyle','old');fx.advance(1100);
  assert.equal(fx.root.BHasClass('HPColorsV3BarOld'),true);
  for(const panel of [fx.inner,fx.lines,fx.primary.FindChild('HPColorsV3KillMarker')]) assert.equal(computed(panel,'opacity'),'0',panel.id);
  assert.equal(fx.inner.actuallayoutwidth,0,'native inner is unlaid under the boxes');
  let grid=expectGrid(fx,1000,'1000 HP');assert.equal(grid.rows,1);
  // 50% of 1000: five full boxes. HP comes from the fill clip while the inner is unlaid.
  expectFill(grid.fill,1000,500,'1000 HP at 50%');
  assert.equal(pipLayer(fx,'Fill').style.washColor,fx.fill.style.washColor,'fill boxes wash with the bar color');
  for(const [total,rows] of [[2350,3],[4246,5],[12000,12]]) {
    engineLines(fx,total);fx.advance(1600);
    grid=expectGrid(fx,total,total+' HP');assert.equal(grid.rows,rows);
  }
  // 2350 HP at 50%: 1175 HP → 11 full boxes and a three-quarter box; a partial last box keeps 50 HP width.
  engineLines(fx,2350);fx.advance(1600);grid=expectGrid(fx,2350,'2350 again');
  oldGrid.near(grid.list[23].w,4.25,'partial last box');
  expectFill(grid.fill,2350,1175,'2350 at 50%');oldGrid.near(grid.fill[11].w,6.375,'three-quarter box');
  fx.setHealth(10);fx.advance(150);
  expectFill(oldGrid.boxes(pipLayer(fx,'Fill')),2350,235,'235 HP: third box 35%');
  // Beyond 50 lines and below 250 HP the engine draws no lines: v2's 250-HP gap fallback.
  for(const total of [13000,200]) {
    engineLines(fx,total);fx.advance(1600);
    assert.equal(fx.root.BHasClass('HPColorsV3BarOld'),true);assert.equal(fx.root.BHasClass('HPColorsV3BarPips'),false,total+' fallback');
    assert.equal(computed(fx.primary.FindChild('HPColorsV3PipGrid'),'visibility'),'collapse');
    assert.equal(computed(fx.inner,'backgroundColor'),'#182123');assert.equal(computed(fx.lines,'width'),'69px');
  }
  // Lines just returned, before the next paint: the fallback still shows them as 250-HP gaps.
  engineLines(fx,1000);const gap=fx.lines.children[0];assert.equal(fx.root.BHasClass('HPColorsV3BarPips'),false);
  assert.equal(computed(gap,'backgroundColor'),'#0B1012');assert.equal(computed(gap,'height'),'100%');assert.equal(computed(gap,'width'),'1px');
  fx.advance(1600);expectGrid(fx,1000,'lines return');
});
// GameBanana report (panicpulsenow, 2026-10-27, ticket 46): OLD boxes left customized neutral bars half empty
// (100 HP per box; 6821 camps have 129/322/1133 HP). Since 2026-10-29 (user) customized unit bars keep the
// stock bar, so BAR STYLE (OLD included) never applies to them.
test('units: OLD leaves customized neutral and objective bars on the stock bar; heroes keep the boxes',()=>{
  for(const [classes,gate,side] of [[['neutral_normal','team_neutral'],'neutralEnabled','enemy'],[['boss_tier1','enemy'],'objectiveEnabled','enemy'],[['building','friend'],'objectiveEnabled','ally']]) {
    for(const total of [129,322,1133,4246]) {
      const label=classes[0]+' '+total+' HP';
      const fx=fixture({classes});engineLines(fx,total);fx.advance(600);
      fx.edit(gate,true,side);fx.edit('barStyle','old');fx.advance(1600);
      assert.equal(fx.root.BHasClass('HPColorsV3Core'),true,label);
      assert.equal(fx.root.BHasClass('HPColorsV3BarOld'),false,label+': stock bar');
      assert.equal(fx.root.BHasClass('HPColorsV3BarPips'),false,label+': no box grid');
      assert.notEqual(computed(fx.inner,'opacity'),'0',label+': the native fill shows');
    }
  }
  const hero=fixture();engineLines(hero,322);hero.advance(600);hero.edit('barStyle','old');hero.advance(1600);
  assert.equal(hero.root.BHasClass('HPColorsV3BarPips'),true,'hero bars keep the 100-HP boxes');
});

test('ticket 19: OLD mirrors shield, barrier, healing and delta layers per box at the line total, not corrected HP',()=>{
  const fx=fixture();engineLines(fx,4246);fx.advance(600);fx.edit('barStyle','old');fx.edit('barShieldColor','#33AAFF');fx.edit('barDeltaColor','#CC8800');
  fx.setHealth(100);fx.advance(150);
  let grid=expectGrid(fx,4246,'no shield');assert.equal(grid.count,43);
  assert.equal(oldGrid.boxes(pipLayer(fx,'Shield')).length,0);
  // Live 6753 trace: 4,246 HP + 600 shield = 19 lines, fill clipped at 87.6%, shield 87.6-100%.
  engineLines(fx,4846);fx.setHealth(87.6);fx.shield.AddClass('HasHealth');fx.shield.style.clip='rect( 0.0%, 100.0%, 100.0%, 87.6%) ';fx.advance(150);
  grid=expectGrid(fx,4846,'shielded');assert.equal(grid.count,49);
  assert.equal(fx.api.facts().fraction,1,'health facts stay shield-corrected');
  expectFill(grid.fill,4846,4245.1,'fill uses the raw fraction: 4245.1 HP');
  const shield=oldGrid.boxes(pipLayer(fx,'Shield'));
  assert.equal(pipLayer(fx,'Shield').style.washColor,'#33AAFF');
  assert.equal(shield.length,7,'boxes 42-48');
  oldGrid.near(shield[0].x,20+8.5*0.451,'box 42 starts at 4245.1 HP');oldGrid.near(shield[0].y,0,'top row');oldGrid.near(shield[0].w,8.5*0.549,'54.9 HP');
  oldGrid.near(shield[6].x,80,'box 48');oldGrid.near(shield[6].w,3.91,'46-HP last box');
  const layers=fx.primary.FindChild('HPColorsV3PipGrid').children.map(panel=>panel.id);
  assert.deepEqual(layers,['HPColorsV3PipOutline','HPColorsV3PipEmpty','HPColorsV3PipShield','HPColorsV3PipArmor','HPColorsV3PipFill','HPColorsV3PipHealing','HPColorsV3PipDelta','HPColorsV3PipKillMarker'],'shield/barrier under the fill, feedback over it');
  // Damage feedback on the delta layer.
  fx.delta.AddClass('HasHealth');fx.delta.style.clip='rect(0%, 80%, 100%, 70%)';fx.advance(150);
  const delta=oldGrid.boxes(pipLayer(fx,'Delta'));
  assert.equal(pipLayer(fx,'Delta').style.washColor,'#CC8800');
  assert.equal(delta.length,6,'3392.2-3876.8 HP: boxes 33-38');oldGrid.near(delta[0].x,30+8.5*0.922,'starts at 3392.2 HP');oldGrid.near(delta[0].y,20,'fourth row');
  // Feedback-only changes are not in the cheap 0.15s probe (v2 probeHealth); the idle paint clears them.
  fx.delta.style.clip='rect(0%, 0%, 100%, 0%)';fx.advance(1600);assert.equal(oldGrid.boxes(pipLayer(fx,'Delta')).length,0);
  // Shield ends: the engine removes surplus lines and the grid shrinks back.
  engineLines(fx,4246);fx.shield.RemoveClass('HasHealth');fx.setHealth(100);fx.advance(150);
  grid=expectGrid(fx,4246,'shield ended');assert.equal(oldGrid.boxes(pipLayer(fx,'Shield')).length,0);
});

test('ticket 19 audit: Rat King barrier segments use the barrier color and clear when the barrier ends',()=>{
  const fx=fixture();engineLines(fx,2000);fx.advance(1800);fx.edit('barStyle','old');fx.edit('barArmorColor','#123456');
  fx.setHealth(80);fx.armor.AddClass('HasHealth');fx.armor.style.clip='rect(0%, 100%, 100%, 80%)';fx.advance(150);
  const armor=oldGrid.boxes(pipLayer(fx,'Armor'));
  assert.equal(pipLayer(fx,'Armor').style.washColor,'#123456');
  assert.deepEqual(armor.map(box=>[box.x,box.y,box.w]),[[60,0,8.5],[70,0,8.5],[80,0,8.5],[90,0,8.5]],'1600-2000 HP: boxes 16-19 of the top row');
  assert.equal(oldGrid.boxes(pipLayer(fx,'Shield')).length,0,'barrier is not drawn as shield');
  fx.armor.RemoveClass('HasHealth');fx.advance(150);
  assert.equal(oldGrid.boxes(pipLayer(fx,'Armor')).length,0);
});

test('ticket 19 audit: OLD falls back to measured line layout and refuses totals beyond 128 boxes',()=>{
  const fx=fixture();engineLines(fx,2000);fx.advance(1800);fx.edit('barStyle','old');
  // No inline percent position (lines still settling): the measured line offset gives the same total.
  fx.measure(fx.lines,69,12);
  fx.lines.children.forEach((line,i)=>{line.style.position='';fx.measure(line,1,12,69*250*(i+1)/2000);});
  fx.advance(1600);expectGrid(fx,2000,'measured fallback');
  // 50 stale lines whose last sits at 13,000 HP: 130 boxes exceed the 128-box cap, so the lined fallback stays.
  engineLines(fx,12500);fx.lines.children[49].style.position=(12500/13000*100)+'% 0px 0px';fx.advance(1600);
  assert.equal(fx.root.BHasClass('HPColorsV3BarPips'),false);assert.equal(computed(fx.primary.FindChild('HPColorsV3PipGrid'),'visibility'),'collapse');
  engineLines(fx,12749);fx.advance(1600);expectGrid(fx,12749,'128 boxes still draw');
});

test('ticket 19: OLD releases line color/opacity, keeps hidden lines as gaps and moves the kill marker and rims into the grid',()=>{
  const fx=fixture({prepare(parts) {parts.lines.style.opacity='0.9';}});engineLines(fx,1000);
  const line=fx.lines.children[0];line.style.washColor='#AABBCC';
  fx.advance(1600);fx.edit('lineOpacity',40);fx.edit('killMarkerEnabled',true);
  assert.equal(line.style.washColor,'#000000');assert.equal(fx.lines.style.opacity,'0.4');
  // The line rows grey out under OLD (2026-11-02), so Show health lines is turned off first.
  fx.edit('linesVisible',false);
  fx.edit('barStyle','old');
  assert.equal(line.style.washColor,'#AABBCC','native line wash restored');assert.equal(fx.lines.style.opacity,'0.9');
  assert.equal(fx.root.BHasClass('HPColorsV3LinesHidden'),false,'OLD forces the line signal visible');
  const primaryMarker=fx.primary.FindChild('HPColorsV3KillMarker'),marker=pipLayer(fx,'KillMarker');
  assert.equal(computed(primaryMarker,'visibility'),'collapse');assert.equal(fx.root.BHasClass('HPColorsV3KillMarker'),false);
  // 25% of 1000 = 250 HP: box 2, halfway.
  assert.equal(marker.style.visibility,'visible');assert.equal(marker.style.position,'24.250% 0.000% 0px');
  assert.equal(marker.style.height,'80.000%');assert.equal(marker.style.width,'1px');assert.equal(marker.style.marginLeft,'-0.5px');
  assert.equal(marker.style.backgroundColor,'#FF2222');
  fx.edit('killMarkerThreshold',61);assert.equal(marker.style.position,'60.850% 0.000% 0px');
  fx.edit('barVisible',false);assert.equal(marker.style.visibility,'collapse');fx.edit('barVisible',true);
  // Rims: the primary-inner backer is off; each box gets a solid px backer (box ± thickness).
  assert.equal(fx.root.BHasClass('HPColorsV3Outline'),false);assert.equal(computed(fx.outline,'visibility'),'collapse');
  let rims=oldGrid.rims(pipLayer(fx,'Outline'));
  assert.equal(pipLayer(fx,'Outline').style.visibility,'visible');assert.equal(rims.length,10);
  oldGrid.near(rims[0].x,-1,'rim 0 x');oldGrid.near(rims[0].y,-1,'rim y');oldGrid.near(rims[3].x,22.7,'rim 3 x');
  oldGrid.near(rims[0].w,8.715,'rim w');oldGrid.near(rims[0].h,6.8,'rim h');assert.equal(rims[0].color,'#10130D');
  fx.edit('barOutlineThickness',2);fx.edit('barOutlineCustomColor',true);fx.edit('barOutlineColor','#112233');fx.edit('barOutlineOpacity',50);
  rims=oldGrid.rims(pipLayer(fx,'Outline'));
  oldGrid.near(rims[0].w,10.715,'2px rim');assert.equal(rims[0].color,'#112233');assert.equal(pipLayer(fx,'Outline').style.opacity,'0.5');
  const rimWrites=()=>oldGrid.descendants(pipLayer(fx,'Outline')).reduce((sum,panel)=>sum+panel.styleWrites.length,0);
  const before=rimWrites();fx.setHealth(80);fx.advance(150);
  assert.equal(rimWrites(),before,'health never rewrites rims');
  fx.edit('barOutlineEnabled',false);assert.equal(pipLayer(fx,'Outline').style.visibility,'collapse');
  fx.edit('barStyle','none');
  assert.equal(line.style.washColor,'#AABBCC','linesVisible off still governs V1');assert.equal(fx.root.BHasClass('HPColorsV3LinesHidden'),true);
  fx.edit('linesVisible',true);assert.equal(line.style.washColor,'#000000');assert.equal(computed(primaryMarker,'visibility'),'visible');
});

test('ticket 19: names rise one OLD row per 1,000 max HP when lifting is on, and stay native when it is off',()=>{
  const fx=fixture();engineLines(fx,4246);fx.advance(600);
  assert.equal(fx.name.style.transform,undefined);
  fx.edit('barStyle','old');
  // Five rows compress into four: lift by three 6px rows at the 0.8 default bar height.
  assert.deepEqual(position(fx.name.style.transform),[0,-14.4]);assert.doesNotMatch(fx.name.style.transform,/rotateZ/,'level like v2');
  engineLines(fx,1000);fx.advance(1600);assert.equal(fx.name.style.transform,'','one row keeps the native spot');
  engineLines(fx,2350);fx.advance(1600);assert.deepEqual(position(fx.name.style.transform),[0,-9.6]);
  fx.edit('nameRiseWithPips',false);assert.equal(fx.name.style.transform,'');
  fx.edit('nameRiseWithPips',true);fx.edit('barStyle','original');assert.equal(fx.name.style.transform,'');
});

test('ticket 19 audit: anchored level and ultimate badges follow the OLD grid centre (v2 oldGridLift)',()=>{
  const fx=fixture();engineLines(fx,4246);fx.advance(1800);
  const top=panel=>parseFloat(panel.style.marginTop),left=panel=>panel.style.marginLeft;
  const v1={level:top(fx.level),ult:top(fx.ult),levelX:left(fx.level),ultX:left(fx.ult)};
  fx.edit('barStyle','old');fx.advance(150);
  // Four capped rows: (4*6/2 - 18/2 + 2.5) * 0.8 = 4.4px up; horizontal placement is unchanged.
  oldGrid.near(top(fx.level),v1.level-4.4,'level');oldGrid.near(top(fx.ult),v1.ult-4.4,'ultimate');
  assert.equal(left(fx.level),v1.levelX);assert.equal(left(fx.ult),v1.ultX);
  // One row: the grid centre sits 2.8px below the hidden bar's centre.
  engineLines(fx,1000);fx.advance(1600);oldGrid.near(top(fx.level),v1.level+2.8,'one-row level');oldGrid.near(top(fx.ult),v1.ult+2.8,'one-row ultimate');
  // Anchoring off: badges scale with the bar instead and ignore the grid, as in v2.
  fx.edit('accessoryAnchorEnabled',false);const unanchored={level:top(fx.level),ult:top(fx.ult)};
  fx.edit('barStyle','none');assert.equal(top(fx.level),unanchored.level);assert.equal(top(fx.ult),unanchored.ult);
  fx.edit('accessoryAnchorEnabled',true);oldGrid.near(top(fx.level),v1.level,'V1 restores the bar-centred badge');
});

test('ticket 19 audit: a recycled primary keeps no orphan OLD grid; only the current grid shows',()=>{
  const fx=fixture();engineLines(fx,2000);fx.advance(1800);fx.edit('barStyle','old');
  const grid=fx.primary.FindChild('HPColorsV3PipGrid');assert.equal(computed(grid,'visibility'),'visible');
  // The engine keeps the old primary inside the same root and creates a replacement in the stack.
  const retired=new MockPanel('Panel',fx.root,'Retired');fx.primary.SetParent(retired);
  const donor=fixture(),replacement=donor.primary;replacement.SetParent(fx.stack);donor.api.stop();
  engineLines({lines:replacement.FindChild('UnitHealthbarLines')},1000);fx.advance(2500);
  const next=replacement.FindChild('HPColorsV3PipGrid');
  assert.equal(computed(next,'visibility'),'visible','replacement grid active');
  oldGrid.expectEmpty(next.FindChild('HPColorsV3PipEmpty'),1000,'replacement boxes');
  assert.equal(computed(grid,'visibility'),'collapse','retired grid deactivated');
  fx.edit('enabled',false);
  for(const panel of [grid,next]) assert.equal(computed(panel,'visibility'),'collapse','master off');
});

test('ticket 19: switching V1/V2/OLD at runtime and master off restore every native panel exactly',()=>{
  const fx=fixture({nativeStyles:{primary:{opacityMask:'none'},lines:{opacity:'0.9'}}});engineLines(fx,2350);
  fx.lines.children[1].style.washColor='#AABBCC';fx.setHealth(50);fx.advance(1600);allCoreFeatures(fx);fx.edit('killMarkerEnabled',true);
  const v1=nativeSnapshot(fx);
  fx.edit('enabled',false);const stock=nativeSnapshot(fx);fx.edit('enabled',true);
  sameTree(nativeSnapshot(fx),v1,'re-enabled');
  for(const style of ['old','original','old','none','original','none']) {
    fx.edit('barStyle',style);fx.setHealth(style==='old'?35:60);fx.advance(150);fx.setHealth(50);fx.advance(150);
    if (style==='old') expectGrid(fx,2350,'cycle');
  }
  sameTree(nativeSnapshot(fx),v1,'back on V1 every native style, class and parent matches');
  assert.equal(computed(fx.primary.FindChild('HPColorsV3PipGrid'),'visibility'),'collapse');
  fx.edit('barStyle','old');fx.edit('enabled',false);
  sameTree(nativeSnapshot(fx),stock,'master off from OLD returns the exact stock tree');
  assert.equal(computed(fx.primary.FindChild('HPColorsV3PipGrid'),'visibility'),'collapse');
  fx.edit('enabled',true);expectGrid(fx,2350,'re-enabled');
  fx.edit('barStyle','original');fx.edit('enabled',false);sameTree(nativeSnapshot(fx),stock,'master off from V2');
  // Restart: stop/reinclusion with OLD on keeps one pool and releases to stock.
  fx.edit('enabled',true);fx.edit('barStyle','old');const pool=oldGrid.descendants(pipLayer(fx,'Empty')).length;
  fx.api.stop();sameTree(nativeSnapshot(fx),stock,'stop releases');
  fx.boot.includeScripts();fx.advance(600);fx.net.broadcast(fx.net.broadcasts.filter(raw=>raw.includes(MAGIC)).pop());fx.advance(600);
  assert.equal(oldGrid.descendants(pipLayer(fx,'Empty')).length,pool,'no duplicate boxes after reinclusion');expectGrid(fx,2350,'after reinclusion');
});

test('ticket 19 audit: a lost box cache deletes the previous boxes before repainting',()=>{
  const fx=fixture();engineLines(fx,2350);fx.setHealth(50);fx.advance(1600);fx.edit('barStyle','old');fx.edit('barOutlineThickness',2);
  const grid=fx.primary.FindChild('HPColorsV3PipGrid'),layers=['Outline','Empty','Fill'];
  // Direct children (rows or boxes): deleting a panel deletes its subtree in Panorama.
  const before=layers.map(name=>pipLayer(fx,name).children.slice()),size=layers.map(name=>oldGrid.descendants(pipLayer(fx,name)).length);
  // Deliberate cache loss (a host that drops expando state), then a fresh script instance.
  for(const key of Object.keys(grid)) if(/^HPColorsV3Pip/.test(key)) delete grid[key];
  fx.api.stop();fx.boot.includeScripts();fx.advance(600);fx.net.broadcast(fx.net.broadcasts.filter(raw=>raw.includes(MAGIC)).pop());fx.advance(600);
  layers.forEach((name,i)=>{
    assert.ok(before[i].length>0,name);
    assert.ok(before[i].every(panel=>!panel.IsValid()),name+': previous boxes deleted');
    assert.equal(oldGrid.descendants(pipLayer(fx,name)).length,size[i],name+': one fresh set');
  });
  expectGrid(fx,2350,'after cache loss');expectFill(oldGrid.boxes(pipLayer(fx,'Fill')),2350,1175,'fill after cache loss');
  assert.equal(oldGrid.rims(pipLayer(fx,'Outline')).length,24);
});

test('ticket 19 audit budget: OLD shield totals alternating every second stay inside the active ceiling with margin',t=>{
  const fx=fixture();engineLines(fx,2000);fx.advance(1800);fx.edit('barStyle','old');fx.advance(3000);
  for(const key of Object.keys(fx.h.operationCounts)) fx.h.operationCounts[key]=0;
  for(let ms=0;ms<10000;ms+=100) {
    const saved={...fx.h.operationCounts};
    if(ms%1000===0) {
      const on=(ms/1000)%2===0;engineLines(fx,on?2600:2000);fx.shield.SetHasClass('HasHealth',on);
      fx.shield.style.clip='rect(0%, 100%, 100%, 76.923%)';fx.setHealth(on?38.4615:50);
    }
    Object.assign(fx.h.operationCounts,saved); // Engine fixture mutations are not renderer calls.
    fx.advance(100);
  }
  const ops=counted(fx);t.diagnostic(JSON.stringify({scenario:'oldShieldTotalChurn',ops}));
  assert.ok(ops<=270,'shield total churn '+ops+' > 270');
  expectGrid(fx,2000,'last total');assert.equal(oldGrid.boxes(pipLayer(fx,'Shield')).length,0);
});

test('ticket 19: preview OLD/V2 boxes and masks match the world bar for the same max HP and health',()=>{
  const fx=fixture();engineLines(fx,1000);fx.setHealth(75);fx.advance(600);fx.edit('barStyle','old');fx.advance(150);
  const menu=fx.menu,find=id=>menu.harness.contextPanel.FindChildTraverse(id);
  runInVm(find('HPColorsMenuButton').GetAttributeString('onactivate',''),menu.context);
  const canvas=find('HPColorsPreviewCanvas');
  for(const name of ['Empty','Fill']) assert.deepEqual(oldGrid.boxes(find('HPColorsPreviewPip'+name)),oldGrid.boxes(pipLayer(fx,name)),name);
  assert.equal(oldGrid.rims(find('HPColorsPreviewPipOutline')).length,10,'one rim per box (px geometry follows each measured primary)');
  assert.equal(find('HPColorsPreviewPipGrid').style.height,pipLayer(fx,'Empty').GetParent().style.height);
  for(const name of ['HPColorsV3BarOld','HPColorsV3BarPips']) assert.equal(canvas.BHasClass(name),fx.root.BHasClass(name),name);
  assert.equal(computed(find('HPColorsPreviewPipGrid'),'visibility'),'visible');assert.equal(computed(find('HPColorsPreviewBarInner'),'opacity'),'0');
  fx.edit('barStyle','original');
  for(const id of ['HPColorsPreviewBarInner','HPColorsPreviewBarLines','HPColorsPreviewBarOutline']) assert.equal(computed(find(id),'opacityMask'),MASK,id);
  assert.equal(computed(find('HPColorsPreviewBar'),'opacityMask'),computed(fx.primary,'opacityMask'));
  assert.equal(computed(find('HPColorsPreviewPipGrid'),'visibility'),'collapse');
  fx.edit('barStyle','none');assert.equal(computed(find('HPColorsPreviewBarInner'),'opacityMask'),undefined);
});

// Ticket 20: damage shake strength and name/HP-text tilts (v2 slots 76-80).
function shakeClasses(panel) { return [...panel.classes].filter(name=>/^HPColorsV3Shake/.test(name)); }
const plain=value=>JSON.parse(JSON.stringify(value));
test('ticket 20: shake strength swaps the motion-frame keyframes at every level, off stops it, default keeps the native wiggle',()=>{
  const fx=fixture({classes:['player','enemy','active_damage']});fx.advance(600);
  const rows=fx.menu.harness.$.HPColorsV3Settings.controls;
  const strength=rows.find(r=>r.key==='damageShakeStrength'),enabled=rows.find(r=>r.key==='damageShakeEnabled');
  assert.deepEqual(plain([strength.bounds,strength.step,strength.unit,strength.side,strength.page,strength.level]),[[1,10],1,'deg','shared','Bar','advanced']);
  assert.deepEqual(plain([enabled.side,enabled.page,enabled.level]),['shared','Bar','basic']);
  assert.deepEqual(shakeClasses(fx.root),[],'default strength 3 adds no class');
  assert.equal(computed(fx.motion,'animationName'),'active_damage_wiggle');
  assert.equal(keyframes('active_damage_wiggle').stops['50%'].transform,'rotateZ(-3deg) skew(0deg)');
  for(let n=1;n<=10;n++) {
    fx.edit('damageShakeStrength',n);fx.advance(150);
    const name=n===3?'active_damage_wiggle':'HPColorsV3Shake'+n;
    assert.deepEqual(shakeClasses(fx.root),n===3?[]:['HPColorsV3Shake'+n],'one class at '+n);
    assert.equal(computed(fx.motion,'animationName'),name,'strength '+n);
    assert.equal(computed(fx.motion,'animationDuration'),'0.2s');
    const frames=keyframes(name).stops;
    assert.deepEqual(plain(Object.keys(frames)),['0%','50%','100%']);
    assert.equal(frames['0%'].transform,'rotateZ(0deg)');assert.equal(frames['100%'].transform,'rotateZ(0deg)');
    assert.equal(frames['50%'].transform,`rotateZ(-${n}deg) skew(0deg)`,'v2 hpv2_shake_'+n+' amplitude');
  }
  fx.edit('damageShakeEnabled',false);fx.advance(150);
  assert.deepEqual(shakeClasses(fx.root),['HPColorsV3ShakeOff']);assert.equal(computed(fx.motion,'animationName'),'none');
  // Dependent rows: strength is greyed while shake is off, so this edit is refused and 10 stays.
  fx.edit('damageShakeStrength',8);fx.advance(150);
  assert.deepEqual(shakeClasses(fx.root),['HPColorsV3ShakeOff'],'strength is ignored while shake is off');
  assert.equal(latestPublishedConfig(fx.menu.harness).settings.shared.damageShakeStrength,10,'greyed strength keeps its value');
  fx.h.root.RemoveClass('active_damage');assert.equal(computed(fx.motion,'animationName'),undefined,'no shake without damage');
  fx.h.root.AddClass('active_damage');
  fx.edit('damageShakeEnabled',true);fx.advance(150);assert.equal(computed(fx.motion,'animationName'),'HPColorsV3Shake10');
  // A late objective class on the carrier beats the shake class in CSS before the next classification.
  fx.h.root.AddClass('building');assert.equal(computed(fx.motion,'animationName'),'none','objective rules follow the shake rules');
  fx.h.root.RemoveClass('building');
  fx.edit('enabled',false);fx.advance(150);
  assert.deepEqual(shakeClasses(fx.root),[],'master off releases the class');
  assert.ok(fx.status.GetParent()!==fx.motion);assert.equal(computed(fx.status,'animationName'),'active_damage_wiggle','native wiggle returns');
});

test('ticket 20: shake strength never reaches unit bars: objectives, neutral bosses and NPCs keep the stock damage motion',()=>{
  const net=network();
  const building=fixture({network:net,classes:['building','enemy','active_damage']});
  const midboss=fixture({network:net,classes:['midboss','team_neutral','active_damage']});
  const npc=fixture({network:net,classes:['creature','enemy','active_damage']});
  net.advance(600);building.edit('damageShakeStrength',9);net.advance(150);
  assert.deepEqual(shakeClasses(npc.root),[],'closed NPC gate stays native');
  assert.equal(computed(npc.status,'animationName'),'active_damage_wiggle');
  building.edit('objectiveEnabled',true);building.edit('neutralEnabled',true);net.advance(1200);
  for(const [fx,stock] of [[building,'none'],[midboss,'active_damage_wiggle']]) {
    assert.equal(fx.root.BHasClass('HPColorsV3Core'),true);assert.ok(fx.status.GetParent()===fx.root,'native status stays in place');
    assert.deepEqual(shakeClasses(fx.root),[]);assert.equal(computed(fx.status,'animationName'),stock,'stock damage motion');
  }
  assert.deepEqual(shakeClasses(npc.root),[],'NPC bars are never customized');assert.equal(computed(npc.status,'animationName'),'active_damage_wiggle');
  building.edit('damageShakeEnabled',false);net.advance(150);
  for(const [fx,stock] of [[building,'none'],[midboss,'active_damage_wiggle']]) {assert.deepEqual(shakeClasses(fx.root),[]);assert.equal(computed(fx.status,'animationName'),stock);}
  assert.deepEqual(shakeClasses(npc.root),[]);assert.equal(computed(npc.status,'animationName'),'active_damage_wiggle');
});

test('ticket 20: name tilt is level by default, rotates after offset, alignment and OLD lift, is shared by both sides, and releases exactly',()=>{
  const net=network(),fx=fixture({network:net,nativeStyles:{name:{transform:'rotateZ(-2deg)'}}}),ally=fixture({network:net,classes:['player','friend']});
  net.advance(600);
  const row=fx.menu.harness.$.HPColorsV3Settings.controls.find(r=>r.key==='nameTilt');
  assert.deepEqual(plain([row.bounds,row.step,row.default,row.unit,row.side,row.page,row.level]),[[-360,360],1,0,'deg','shared','Name','advanced']);
  assert.equal(fx.name.style.transform,'rotateZ(-2deg)','captured native inline is untouched at the default');
  assert.equal(ally.name.style.transform,undefined);assert.equal(computed(ally.name,'transform'),'none','default name is level like v2');
  fx.edit('nameTilt',15);net.advance(150);
  for(const bar of [fx,ally]) {assert.equal(bar.name.style.transform,'rotateZ(15deg)');assert.equal(computed(bar.name,'transform'),'rotateZ(15deg)');}
  fx.edit('nameOffsetX',12);fx.edit('nameOffsetY',-6);net.advance(150);
  assert.deepEqual(position(fx.name.style.transform),[12,-6]);assert.match(fx.name.style.transform,/\) rotateZ\(15deg\)$/);
  assert.equal(ally.name.style.transform,'rotateZ(15deg)','side offsets stay per side');
  fx.edit('nameAlign','left');net.advance(150);assert.match(fx.name.style.transform,/^translate3d\(.*\) rotateZ\(15deg\)$/);
  fx.edit('nameAlign','center');fx.edit('nameOffsetX',0);fx.edit('nameOffsetY',0);
  engineLines(fx,4246);fx.edit('barStyle','old');net.advance(150);
  assert.deepEqual(position(fx.name.style.transform),[0,-14.4]);assert.match(fx.name.style.transform,/\) rotateZ\(15deg\)$/,'tilt follows the OLD lift');
  fx.edit('barStyle','original');net.advance(150);assert.equal(fx.name.style.transform,'rotateZ(15deg)','V2 keeps the tilt');
  fx.edit('nameTilt',-360);net.advance(150);assert.equal(ally.name.style.transform,'rotateZ(-360deg)');
  fx.edit('nameVisible',false,'ally');net.advance(150);
  assert.equal(computed(ally.name,'visibility'),'collapse');assert.equal(ally.name.style.transform,'','hidden names release their tilt');
  fx.edit('nameTilt',0);net.advance(150);
  assert.equal(fx.name.style.transform,'rotateZ(-2deg)','tilt 0 restores the captured inline value exactly');
  fx.edit('nameTilt',30);net.advance(150);assert.equal(fx.name.style.transform,'rotateZ(30deg)');
  fx.edit('enabled',false);net.advance(150);
  assert.equal(fx.name.style.transform,'rotateZ(-2deg)','master off restores the captured inline value');
  assert.equal(ally.name.style.transform,'');assert.equal(computed(ally.name,'transform'),'rotateZ(-4deg)','master off returns the stock tilt');
});

test('ticket 20: HP text tilt rotates only the adopted label per side and releases to the stock label',()=>{
  const net=network(),fx=fixture({network:net,nativeStyles:{value:{transform:'rotateZ(-1deg)'}}}),ally=fixture({network:net,classes:['player','friend']});
  net.advance(600);
  const rows=fx.menu.harness.$.HPColorsV3Settings.controls.filter(r=>r.key==='hpTextTilt');
  assert.deepEqual(plain(rows.map(r=>[r.side,r.bounds,r.step,r.default,r.unit,r.page,r.level])),[['enemy',[-360,360],1,0,'deg','HP Text','advanced'],['ally',[-360,360],1,0,'deg','HP Text','advanced']]);
  assert.equal(fx.value.style.transform,'rotateZ(-1deg)','default leaves the captured label transform alone');
  fx.edit('hpTextVisible',true,'ally');net.advance(600);
  assert.equal(ally.value.style.transform,undefined);assert.equal(computed(ally.value,'transform'),'none','default HP text is level like v2');
  const row=fx.row.style.transform;
  fx.edit('hpTextTilt',20);net.advance(150);
  assert.equal(fx.value.style.transform,'rotateZ(20deg)');assert.equal(fx.row.style.transform,row,'the row keeps its geometry translate');
  assert.equal(ally.value.style.transform,undefined,'enemy tilt does not touch allies');
  fx.edit('hpTextTilt',-45,'ally');net.advance(150);assert.equal(ally.value.style.transform,'rotateZ(-45deg)');assert.equal(fx.value.style.transform,'rotateZ(20deg)');
  fx.edit('hpTextAlign','center');fx.edit('hpTextOffsetX',-20);fx.edit('hpTextOffsetY',30);net.advance(600);
  assert.notEqual(fx.row.style.transform,row);assert.equal(fx.value.style.transform,'rotateZ(20deg)','tilt survives offsets and alignment');
  for(const style of ['old','original']) {engineLines(fx,2350);fx.edit('barStyle',style);net.advance(600);assert.equal(fx.value.style.transform,'rotateZ(20deg)',style);}
  fx.edit('hpTextTilt',0);net.advance(150);assert.equal(fx.value.style.transform,'rotateZ(-1deg)','tilt 0 restores the captured value');
  fx.edit('hpTextTilt',90);net.advance(150);assert.equal(fx.value.style.transform,'rotateZ(90deg)');
  fx.edit('hpTextVisible',false);net.advance(150);
  assert.equal(fx.value.style.transform,'rotateZ(-1deg)','HP text off restores the captured native value');
  fx.edit('enabled',false);net.advance(150);
  assert.equal(ally.value.style.transform,'');assert.equal(computed(ally.value,'transform'),'rotateZ(-3deg)','stock label tilt returns');
});

// Ticket 51 (Discord, FireworkPolymer, 2026-11-09): "add health percentage … the hero has 2000 hp, then 200 would be 200/10%".
test('ticket 51: HP number format adds the bar health percent after the number, or shows it alone, and releases exactly',()=>{
  const net=network(),fx=fixture({network:net}),ally=fixture({network:net,classes:['player','friend']});
  net.advance(600);
  const rows=fx.menu.harness.$.HPColorsV3Settings.controls.filter(r=>r.key==='hpTextFormat');
  assert.deepEqual(plain(rows.map(r=>[r.side,r.default,r.page,r.level])),[['enemy','number','HP Text','basic'],['ally','number','HP Text','basic']]);
  const pct=fx.row.FindChild('HPColorsV3HPPercent');
  assert.ok(pct,'the overlay row carries the owned percent label');
  assert.ok(fx.value.GetParent()===fx.row);
  assert.equal(computed(pct,'visibility'),'collapse','Number (default) shows no percent');
  assert.equal(fx.root.BHasClass('HPColorsV3HPPercent'),false);assert.equal(pct.text,'');
  const row=fx.row.style.transform;
  fx.setHealth(10);fx.edit('hpTextFormat','both');net.advance(600);
  assert.equal(pct.text,'/ 10%');assert.equal(computed(pct,'visibility'),'visible');assert.notEqual(computed(fx.value,'visibility'),'collapse');
  const order=fx.row.Children();assert.ok(order.indexOf(fx.value)<order.indexOf(pct),'number first, then the percent');
  for(const key of ['washColor','fontFamily','fontSize','padding','marginRight']) assert.equal(pct.style[key],fx.value.style[key],key+' matches the number');
  assert.equal(computed(ally.row.FindChild('HPColorsV3HPPercent'),'visibility'),'collapse','enemy format does not touch allies');
  for(const [health,text] of [[100,'/ 100%'],[55.4,'/ 55%'],[0.3,'/ 1%']]) {fx.setHealth(health);net.advance(600);assert.equal(pct.text,text,String(health));}
  fx.setHealth(10);fx.edit('hpTextTilt',20);net.advance(600);
  assert.ok(!fx.value.style.transform,'with a percent the row turns, not each label');assert.match(fx.row.style.transform,/ rotateZ\(20deg\)$/);
  fx.edit('hpTextFormat','percent');net.advance(600);
  assert.equal(pct.text,'10%');assert.equal(computed(fx.value,'visibility'),'collapse','Percent hides the number');assert.equal(computed(pct,'visibility'),'visible');
  fx.h.root.AddClass('unkillable');net.advance(600);assert.equal(computed(pct,'visibility'),'collapse','unkillable hides the percent like the number');
  fx.h.root.RemoveClass('unkillable');fx.edit('hpTextFormat','number');net.advance(600);
  assert.equal(computed(pct,'visibility'),'collapse');assert.notEqual(computed(fx.value,'visibility'),'collapse');
  assert.equal(fx.value.style.transform,'rotateZ(20deg)','Number keeps the per-label tilt');assert.doesNotMatch(fx.row.style.transform,/rotateZ/);
  fx.edit('hpTextTilt',0);fx.edit('hpTextFormat','both');net.advance(600);assert.equal(fx.row.style.transform,row,'no tilt: the row keeps its geometry translate');
  fx.edit('hpTextVisible',false);net.advance(600);
  assert.ok(fx.value.GetParent()===fx.info,'Custom HP number off returns the number');assert.equal(computed(pct,'visibility'),'collapse');assert.ok(!pct.style.fontSize);
  fx.edit('hpTextVisible',true);net.advance(600);assert.equal(pct.text,'/ 10%');
  fx.edit('enabled',false);net.advance(600);
  assert.equal(fx.root.BHasClass('HPColorsV3HPPercent'),false);assert.equal(computed(pct,'visibility'),'collapse');assert.ok(!pct.style.washColor);
});

test('ticket 20: rejuvenator tilt keeps its 6 degree default and follows runtime edits',()=>{
  const fx=fixture({prepare:enginePickups});fx.advance(1800);const {rejuv}=fx.parts;
  assert.equal(rejuv.style.transform,'rotateZ(6deg)');
  fx.edit('rejuvTilt',-33);fx.advance(150);assert.equal(rejuv.style.transform,'rotateZ(-33deg)');
  fx.edit('enabled',false);fx.advance(150);assert.equal(rejuv.style.transform,'rotateZ(11deg)','captured native inline restored');
});

// Audit 20 P2/P3: root-local damage and exclusions, full animation shape and frame sizing.
const EXCLUDED_KINDS=['boss_barracks','boss_tier1','boss_tier2','boss_tier3','building','CLASS_DESTROYABLE_BUILDING','barracks','neutral_vault','midboss'];
test('audit 20: damage shake keeps the stock repeat, easing, duration and a full-canvas frame at every strength, root-local or ancestor damage',()=>{
  const fx=fixture();fx.advance(600);
  assert.equal(computed(fx.motion,'width'),'100%');assert.equal(computed(fx.motion,'height'),'100%');
  assert.equal(computed(fx.motion,'overflow'),'noclip');assert.equal(computed(fx.motion,'horizontalAlign'),'center');assert.equal(computed(fx.motion,'verticalAlign'),'top');
  for(const placement of ['ancestor','root']) {
    const carrier=placement==='root'?fx.root:fx.h.root;
    for(let n=1;n<=10;n++) {
      fx.edit('damageShakeStrength',n);fx.advance(150);
      assert.equal(computed(fx.motion,'animationName'),undefined,'no shake before damage');
      carrier.AddClass('active_damage');
      assert.equal(computed(fx.motion,'animationName'),n===3?'active_damage_wiggle':'HPColorsV3Shake'+n,placement+' damage at '+n);
      assert.equal(computed(fx.motion,'animationIterationCount'),'infinite');
      assert.equal(computed(fx.motion,'animationTimingFunction'),'ease-out');
      assert.equal(computed(fx.motion,'animationDuration'),'0.2s');
      carrier.RemoveClass('active_damage');
    }
    fx.edit('damageShakeEnabled',false);fx.advance(150);carrier.AddClass('active_damage');
    assert.equal(computed(fx.motion,'animationName'),'none',placement+' off');
    carrier.RemoveClass('active_damage');fx.edit('damageShakeEnabled',true);fx.edit('damageShakeStrength',3);fx.advance(150);
  }
});
for(const kind of EXCLUDED_KINDS)test(`audit 20: a late ${kind} class stops strength-7 shake immediately on WindowRoot or an ancestor`,()=>{
  const fx=fixture();fx.advance(600);fx.edit('damageShakeStrength',7);fx.advance(150);
  for(const [damageOn,kindOn] of [[fx.h.root,fx.h.root],[fx.root,fx.root],[fx.h.root,fx.root],[fx.root,fx.h.root]]) {
    const where=(damageOn===fx.root?'root':'ancestor')+' damage, '+(kindOn===fx.root?'root':'ancestor')+' '+kind;
    damageOn.AddClass('active_damage');assert.equal(computed(fx.motion,'animationName'),'HPColorsV3Shake7',where+' before the kind arrives');
    kindOn.AddClass(kind);
    assert.equal(computed(fx.motion,'animationName'),'none',where);assert.equal(computed(fx.motion,'preTransformScale2d'),'1',where);
    kindOn.RemoveClass(kind);damageOn.RemoveClass('active_damage');
  }
});

// Ticket 21: text outline widths and name/HP-text alignment (v2 applyTextOutline, applyPlayerName, positionReadout).
const ALIGNS=[['left',1,'right'],['center',0.5,'center'],['right',0,'left']];
function textBars() {
  const net=network(),enemy=fixture({network:net}),ally=fixture({network:net,classes:['player','friend']});
  net.advance(600);enemy.edit('hpTextVisible',true,'ally');net.advance(1600);
  return {net,enemy,ally,bars:[['enemy',enemy],['ally',ally]]};
}
test('ticket 21: every outline width 0–10 on names and HP text, both sides, writes the v2 shadow, glyph room and widened name limit',()=>{
  const {net,enemy,bars}=textBars();
  for(const [side] of bars) enemy.edit('nameColorEnabled',true,side); // keep names owned at width 5 too
  for(let i=0;i<=20;i++) {
    const w=i/2,hpRoom=Math.ceil(w),nameRoom=Math.max(2,Math.ceil(w));
    for(const [side,bar] of bars) {
      enemy.edit('hpTextOutline',w,side);enemy.edit('nameOutline',w,side);net.advance(150);
      const at=side+' width '+w;
      if(w===5) {
        assert.ok(!bar.value.style.textShadow,at+': HP text returns to the stylesheet');assert.ok(!bar.name.style.textShadow,at+': name returns to the stylesheet');
        assert.equal(computed(bar.value,'textShadow'),'0px 0px 0px 5.0 offBlack',at);assert.equal(computed(bar.name,'textShadow'),'0px 0px 0px 4.0 offBlack&ee',at);
      } else {
        assert.equal(bar.value.style.textShadow,'0px 0px 0px '+w+' #10130D',at);assert.equal(bar.name.style.textShadow,'0px 0px 0px '+w+' #10130Dee',at);
      }
      assert.equal(bar.value.style.padding,'0px '+hpRoom+'px',at);
      assert.equal(bar.value.style.marginLeft,-hpRoom+'px',at);assert.equal(bar.value.style.marginRight,-hpRoom+'px',at);
      assert.equal(bar.name.style.padding,'2px '+nameRoom+'px 0px '+nameRoom+'px',at);assert.equal(bar.name.style.maxWidth,170+2*(nameRoom-2)+'px',at);
    }
  }
  const published=()=>latestPublishedConfig(enemy.menu.harness).settings.side;
  enemy.edit('hpTextOutline',12);enemy.edit('nameOutline',-3,'ally');
  assert.equal(published().enemy.hpTextOutline,10);assert.equal(published().ally.nameOutline,0);
  enemy.edit('hpTextOutline',7.3,'ally');assert.equal(published().ally.hpTextOutline,7.5,'0.5 steps like v2');
});
test('ticket 21: name LEFT/CENTER/RIGHT on both sides grows from canvas centre plus offset, with tilt after the translate and the OLD lift',()=>{
  const {net,enemy,ally,bars}=textBars();
  const offsets={enemy:[12,-6],ally:[-20,9]};
  for(const [side] of bars) {enemy.edit('nameOffsetX',offsets[side][0],side);enemy.edit('nameOffsetY',offsets[side][1],side);}
  enemy.edit('nameTilt',15);
  for(const old of [false,true]) {
    if(old) {engineLines(enemy,4246);engineLines(ally,4246);enemy.edit('barStyle','old');}
    for(const [align,q,panelAlign] of ALIGNS) for(const [side,bar] of bars) {
      enemy.edit('nameAlign',align,side);net.advance(150);
      const at=side+' '+align+(old?' OLD':''),config=latestPublishedConfig(enemy.menu.harness).settings.side[side];
      const anchor=Math.min(Math.max(100+offsets[side][0]+(2*q-1)*5,q*50),200-(1-q)*50);
      const lift=old?3*6*config.barHeight/18:0;
      const [x,y]=position(bar.name.style.transform);
      assert.ok(Math.abs(x-(anchor-q*200))<1e-6,at+' x='+x);assert.ok(Math.abs(y-(offsets[side][1]-lift))<1e-6,at+' y='+y);
      assert.match(bar.name.style.transform,/\) rotateZ\(15deg\)$/,at);
      assert.equal(bar.name.style.horizontalAlign,panelAlign,at);assert.equal(bar.name.style.textAlign,panelAlign,at+' text grows the same way');
      assert.equal(computed(bar.name,'textAlign'),panelAlign,at);
    }
  }
  enemy.edit('nameAlign','right');enemy.measure(enemy.name,90,16);enemy.edit('nameOffsetX',200);net.advance(1600);
  assert.equal(position(enemy.name.style.transform)[0],110,'grow-right names clamp their far edge to the canvas');
  enemy.edit('enabled',false);net.advance(150);
  for(const [side,bar] of bars) {
    assert.ok(!bar.name.style.transform,side);assert.equal(computed(bar.name,'transform'),'rotateZ(-4deg)',side);
    assert.equal(computed(bar.name,'horizontalAlign'),'center',side);assert.equal(computed(bar.name,'textAlign'),'center',side);
  }
});
test('ticket 21: HP text LEFT/CENTER/RIGHT on both sides keeps one anchor point under offsets, tilt and pulse offsets; the row aligns natively',()=>{
  const {net,enemy,bars}=textBars();
  const offsets={enemy:[-20,30,20],ally:[15,-10,-45]};
  function sample(bar) {
    const out={};
    for(const [align,q,panelAlign] of ALIGNS) {
      enemy.edit('hpTextAlign',align,bar===enemy?'enemy':'ally');net.advance(150);
      const [x,y]=position(bar.row.style.transform);
      assert.equal(bar.row.style.horizontalAlign,panelAlign,align);
      out[align]={point:x+q*200,y};
    }
    // v2: every mode keeps the text, inside the 4px row padding, at the same point.
    assert.ok(Math.abs(out.center.point-(out.left.point-4))<1e-6,JSON.stringify(out));
    assert.ok(Math.abs(out.right.point-(out.left.point-8))<1e-6,JSON.stringify(out));
    assert.equal(out.left.y,out.center.y);assert.equal(out.left.y,out.right.y);
    return out;
  }
  for(const [side,bar] of bars) {
    const base=sample(bar),config=()=>latestPublishedConfig(enemy.menu.harness).settings.side[side];
    enemy.edit('hpTextOffsetX',offsets[side][0],side);enemy.edit('hpTextOffsetY',offsets[side][1],side);enemy.edit('hpTextTilt',offsets[side][2],side);
    const moved=sample(bar),sx=config().barWidth/79,sy=config().barHeight/18;
    assert.ok(Math.abs(moved.left.point-base.left.point-(offsets[side][0]-(side==='enemy'?18:0))*sx)<1e-6,side+' x offset scales with bar width');
    assert.ok(Math.abs(moved.left.y-base.left.y-(offsets[side][1]-(side==='enemy'?14:0))*sy)<1e-6,side+' y offset scales with bar height');
    assert.equal(bar.value.style.transform,'rotateZ('+offsets[side][2]+'deg)',side+' tilt stays on the label');
    enemy.edit('hpTextOffsetX',334,side);
    for(const [align,q] of ALIGNS) {enemy.edit('hpTextAlign',align,side);net.advance(150);assert.equal(position(bar.row.style.transform)[0],q===1?0:q===0.5?86:172,side+' '+align+' clamps inside the canvas');}
  }
  enemy.edit('hpTextOffsetX',-20);enemy.edit('pulseReadout',true);enemy.edit('pulseReadoutModifiers',true);enemy.edit('pulseReadoutOffsetX',-40);enemy.edit('pulseReadoutOffsetY',-12);
  enemy.setHealth(10);net.advance(150);
  const pulse=sample(enemy),sx=latestPublishedConfig(enemy.menu.harness).settings.side.enemy.barWidth/79;
  enemy.setHealth(60);net.advance(150);
  const calm=sample(enemy);
  assert.ok(Math.abs(pulse.right.point-calm.right.point+20*sx)<1e-6,'pulse HP text uses its own offset with the same alignment');
  enemy.edit('enabled',false);net.advance(150);
  for(const [side,bar] of bars) {assert.ok(bar.value.GetParent()===bar.info,side);assert.ok(!bar.row.style.transform,side);}
});
test('ticket 21: default outlines never own text-shadow; changed widths release to the exact captured inline or stock stylesheet value',()=>{
  const net=network(),captured={value:{textShadow:'1px 2px 3px 4 #ABCDEF'},name:{textShadow:'0px 0px 0px 6 #10130Dee'}};
  const enemy=fixture({network:net,nativeStyles:captured}),ally=fixture({network:net,classes:['player','friend']});
  const writes={};for(const [side,bar] of [['enemy',enemy],['ally',ally]]) writes[side]={value:bar.value.styleWrites.length,name:bar.name.styleWrites.length};
  net.advance(600);enemy.edit('hpTextVisible',true,'ally');net.advance(1500);
  const bars=[['enemy',enemy],['ally',ally]];
  for(const [side,bar] of bars) {
    assert.deepEqual(bar.value.styleWrites.slice(writes[side].value).filter(w=>w.property==='textShadow'),[],side+' HP text at width 5');
    assert.deepEqual(bar.name.styleWrites.slice(writes[side].name).map(w=>w.property),[],side+' name at defaults is never owned (v2 skip)');
  }
  function stock(at) {
    assert.equal(enemy.value.style.textShadow,captured.value.textShadow,at);assert.equal(enemy.name.style.textShadow,captured.name.textShadow,at);
    assert.ok(!ally.value.style.textShadow,at);assert.ok(!ally.name.style.textShadow,at);
    assert.equal(computed(ally.value,'textShadow'),'0px 0px 0px 5.0 offBlack',at);assert.equal(computed(ally.name,'textShadow'),'0px 0px 0px 4.0 offBlack&ee',at);
  }
  stock('defaults');
  const change=width=>{for(const [side] of bars){enemy.edit('hpTextOutline',width,side);enemy.edit('nameOutline',width,side);}net.advance(150);};
  change(7.5);assert.equal(ally.name.style.textShadow,'0px 0px 0px 7.5 #10130Dee');
  change(5);stock('width back to 5');
  for(const [side] of bars) enemy.edit('nameSize',20,side);net.advance(150);stock('name owned by size alone');
  change(0);assert.equal(enemy.value.style.textShadow,'0px 0px 0px 0 #10130D');
  enemy.edit('enabled',false);net.advance(150);stock('master off');
  enemy.api.stop();enemy.api.start();ally.api.stop();ally.api.start();net.advance(600);stock('restart while off');
  enemy.edit('enabled',true);net.advance(150);enemy.edit('hpTextVisible',false);enemy.edit('hpTextVisible',false,'ally');enemy.edit('nameVisible',false);enemy.edit('nameVisible',false,'ally');net.advance(150);
  stock('features off');
});
test('ticket 21: live null clears keep alignment, so released names write the stock centre explicitly (v2 NAME_STOCK_ALIGN)',()=>{
  const sticky=panel=>{
    const store=Object.assign({},panel.style);
    panel.style=new Proxy(store,{set(target,key,value){
      if(value===null&&(key==='horizontalAlign'||key==='textAlign')) return true; // in game the moved alignment stayed
      target[key]=value===null?'':value;return true;
    }});
  };
  const fx=fixture({prepare:parts=>sticky(parts.name)});fx.advance(600);
  for(const release of [()=>fx.edit('nameAlign','center'),()=>fx.edit('enabled',false),()=>fx.edit('nameVisible',false)]) {
    fx.edit('enabled',true);fx.edit('nameVisible',true);fx.edit('nameAlign','left');fx.advance(150);
    assert.equal(fx.name.style.horizontalAlign,'right');
    release();fx.advance(150);
    assert.equal(computed(fx.name,'horizontalAlign'),'center');assert.equal(computed(fx.name,'textAlign'),'center');
  }
});

// Audit 21 P2: live 6779 opacity-0 panels report width 0. Like v2 (applyPlayerName 1980-1991,
// positionReadout 1702-1707) the last laid name/row size holds the clamp; unmeasured panels defer.
test('audit 21: a fading, unlaid or replaced name keeps its last laid clamp and recovers on the next laid sample',()=>{
  const fx=fixture();fx.advance(600);fx.edit('nameAlign','right');fx.edit('nameOffsetX',200);fx.advance(1600);
  assert.equal(position(fx.name.style.transform)[0],150,'laid 50px name clamps its far edge');
  fx.h.root.AddClass('NameFaded');fx.measure(fx.name,0,0);fx.advance(1600);
  assert.equal(position(fx.name.style.transform)[0],150,'a fading name (width 0) keeps the last laid clamp');
  fx.h.root.RemoveClass('NameFaded');fx.measure(fx.name,90,16);fx.advance(1600);
  assert.equal(position(fx.name.style.transform)[0],110,'recovery re-measures');
  const old=fx.name,parent=old.GetParent();old.DeleteAsync(0);
  const fresh=new MockPanel('Label',fx.root,'name');fx.measure(fresh,0,0);fx.advance(1100);fx.advance(1600);
  assert.ok(fresh.GetParent()===parent,'replacement name adopted');
  assert.doesNotMatch(String(fresh.style.transform||''),/translate3d/,'an unmeasured replacement defers placement instead of reusing the old size');
  fx.measure(fresh,40,16);fx.advance(1600);
  assert.equal(position(fresh.style.transform)[0],160,'replacement places from its own measurement');
});
test('audit 21: an unlaid HP row defers placement, keeps its last laid clamp and recovers',()=>{
  const fx=fixture({prepare:parts=>fx0(parts)});
  function fx0(parts){parts.row.actuallayoutwidth=0;parts.row.actuallayoutheight=0;}
  fx.advance(600);fx.advance(1600);
  assert.ok(!fx.row.style.transform,'never-laid row is not placed');
  fx.measure(fx.row,28,23);fx.advance(1600);
  assert.deepEqual(position(fx.row.style.transform),[-33.36,73.4],'first laid sample places the row');
  fx.edit('hpTextAlign','right');fx.edit('hpTextOffsetX',334);fx.advance(1600);
  assert.equal(position(fx.row.style.transform)[0],172);
  fx.measure(fx.row,0,0);fx.advance(150);fx.advance(1600);
  assert.equal(position(fx.row.style.transform)[0],172,'unlaid row keeps the last laid clamp');
  fx.measure(fx.row,40,23);fx.advance(1600);
  assert.equal(position(fx.row.style.transform)[0],160,'recovery re-measures');
});
test('audit 21: a captured inline name max-width is the base the outline room widens, and is restored exactly',()=>{
  const fx=fixture({nativeStyles:{name:{maxWidth:'210px'}}});fx.advance(600);
  fx.edit('nameOutline',10);fx.advance(150);assert.equal(fx.name.style.maxWidth,'226px');
  fx.edit('nameOutline',0);fx.advance(150);assert.equal(fx.name.style.maxWidth,'210px','room never drops below 2px');
  fx.edit('nameOutline',7.5);fx.advance(150);assert.equal(fx.name.style.maxWidth,'222px');
  fx.edit('enabled',false);fx.advance(150);assert.equal(fx.name.style.maxWidth,'210px');
  fx.api.stop();fx.boot.includeScripts();fx.edit('enabled',true);fx.advance(600);
  assert.equal(fx.name.style.maxWidth,'222px','reinclusion keeps the captured base, not its own write');
});
test('audit 21: a pending max-width lease across reinclusion still widens the captured base, never its own write',()=>{
  let reject=false;
  const fx=fixture({nativeStyles:{name:{maxWidth:'210px'}},prepare(parts){
    const store=Object.assign({},parts.name.style);
    parts.name.style=new Proxy(store,{set(target,key,value){
      if(reject&&key==='maxWidth') throw new Error('native setter rejected');
      target[key]=value===null?'':value;return true;
    }});
  }});
  fx.advance(600);fx.edit('nameOutline',7.5);fx.advance(150);assert.equal(fx.name.style.maxWidth,'222px');
  reject=true;fx.api.stop();assert.equal(fx.name.style.maxWidth,'222px','release rejected: the lease stays pending');
  // The re-include stop and the new module's releases keep failing until its config arrives;
  // the new module still releases before it samples, so the base stays the native 210px.
  fx.boot.includeScripts();fx.advance(1200);assert.ok(fx.h.$.HPColorsV3Renderer.status.revision>=0,'config arrived over the pending lease');
  reject=false;fx.advance(600);
  assert.equal(fx.name.style.maxWidth,'222px','the persisted ledger capture (210) stays the base');
  fx.edit('enabled',false);fx.advance(150);assert.equal(fx.name.style.maxWidth,'210px');
});

// Ticket 22: SHOW BOUNDS (v2 showBounds / HPV2CanvasBounds), a session-only view toggle.
function toggleBounds(menu) {
  const toggle=menu.harness.contextPanel.FindChildTraverse('HPColorsShowBoundsToggle');
  assert.ok(toggle,'SHOW BOUNDS toggle in the shipped rail');assert.equal(typeof toggle.events.onactivate,'function');
  toggle.events.onactivate(); return toggle;
}
test('ticket 22: SHOW BOUNDS outlines customized world canvases outside the motion frame; off, master off and closed kinds stay stock',()=>{
  const net=network(),fx=fixture({network:net,classes:['player','enemy','active_damage']}),npc=fixture({network:net,classes:['creature','enemy']});
  const boss=fixture({network:net,classes:['boss_tier1','enemy']});
  net.advance(600);
  const bounds=fx.root.FindChild('HPColorsV3CanvasBounds');
  assert.ok(bounds,'static rim in the shipped overlay');assert.ok(bounds.GetParent()===fx.root,'outside the shaking motion frame');
  assert.equal(computed(bounds,'visibility'),'collapse','hidden by default');assert.equal(fx.root.BHasClass('HPColorsV3Bounds'),false);
  const settingsBefore=JSON.stringify(latestPublishedConfig(fx.menu.harness).settings),revisionBefore=latestPublishedConfig(fx.menu.harness).revision;
  const toggle=toggleBounds(fx.menu);net.advance(150);
  assert.equal(toggle.BHasClass('Checked'),true);
  const wire=latestPublishedConfig(fx.menu.harness);
  assert.equal(wire.showBounds,true);assert.ok(wire.revision>revisionBefore,'monotonic revision');
  assert.equal(JSON.stringify(wire.settings),settingsBefore,'settings untouched');
  assert.equal(fx.menu.harness.contextPanel.FindChildTraverse('HPColorsUndoButton').enabled,false,'no Undo entry');
  assert.equal(fx.root.BHasClass('HPColorsV3Bounds'),true);
  for(const [key,value] of [['visibility','visible'],['width','100%'],['height','100%'],['border','1px solid #5fe69e'],['zIndex','100']])
    assert.equal(computed(bounds,key),value,key);
  assert.equal(computed(fx.motion,'animationName'),'active_damage_wiggle','the frame shakes; the rim does not');
  assert.equal(npc.root.BHasClass('HPColorsV3Bounds'),false,'closed NPC gate keeps the stock canvas');
  assert.equal(computed(npc.root.FindChild('HPColorsV3CanvasBounds'),'visibility'),'collapse');
  npc.edit('objectiveEnabled',true);npc.edit('neutralEnabled',true);net.advance(1200);
  assert.equal(npc.root.BHasClass('HPColorsV3Bounds'),false,'NPC bars are never customized, whatever gate is open');
  assert.equal(boss.root.BHasClass('HPColorsV3Bounds'),true,'an opened gate outlines that kind too');
  fx.edit('enabled',false);net.advance(150);
  assert.equal(fx.root.BHasClass('HPColorsV3Bounds'),false,'master off releases');assert.equal(computed(bounds,'visibility'),'collapse');
  assert.equal(latestPublishedConfig(fx.menu.harness).showBounds,true,'the toggle survives master off');
  fx.edit('enabled',true);net.advance(150);assert.equal(fx.root.BHasClass('HPColorsV3Bounds'),true);
  toggleBounds(fx.menu);net.advance(150);
  assert.equal(toggle.BHasClass('Checked'),false);
  assert.deepEqual(Object.keys(latestPublishedConfig(fx.menu.harness)).sort(),['epoch','magic','revision','settings'],'off sends the plain settings envelope');
  for(const target of [fx,npc,boss]){assert.equal(target.root.BHasClass('HPColorsV3Bounds'),false);assert.equal(computed(target.root.FindChild('HPColorsV3CanvasBounds'),'visibility'),'collapse');}
});
test('ticket 22: SHOW BOUNDS resets with a restarted menu and with a stopped renderer, and is never part of world settings',()=>{
  const net=network(),fx=fixture({network:net});net.advance(600);
  toggleBounds(fx.menu);net.advance(150);assert.equal(fx.root.BHasClass('HPColorsV3Bounds'),true);
  // Validation sees only settings: a showBounds key inside settings is not a setting at all.
  const bogus=JSON.parse(JSON.stringify(latestPublishedConfig(fx.menu.harness).settings));bogus.shared.showBounds=true;
  assert.equal(fx.h.$.HPColorsV3WorldSettings.validate(bogus),true);
  assert.equal(Object.hasOwn(fx.menu.harness.$.HPColorsV3Settings.defaults.shared,'showBounds'),false,'no schema row');
  fx.api.stop();assert.equal(fx.root.BHasClass('HPColorsV3Bounds'),false,'stop releases');
  fx.api.start();net.advance(2000);assert.equal(fx.root.BHasClass('HPColorsV3Bounds'),true,'a restarted world asks again and gets the session state');
  // A new game process means a new menu context with no remembered toggle.
  const old=fx.menu;mountMenu(net);old.harness.scheduler.jobs.length=0;net.advance(1200);
  assert.equal(fx.menu.harness.contextPanel.FindChildTraverse('HPColorsShowBoundsToggle').BHasClass('Checked'),false);
  assert.equal(latestPublishedConfig(fx.menu.harness).showBounds,undefined);
  assert.equal(fx.root.BHasClass('HPColorsV3Bounds'),false,'world follows the new publisher');
});

// Whole-codebase audit 3 (P2): world-side coverage for unit bars under the styling extras.
for (const [name,classes,gate] of [['boss',['boss_tier1','enemy','active_damage'],'objectiveEnabled'],['building',['building','enemy','active_damage'],'objectiveEnabled']])
  test(`audit whole 3: a customized world ${name} bar ignores OLD and HP-text tilt (stock layout), and releases`,()=>{
    const fx=fixture({classes,nativeStyles:{value:{transform:'rotateZ(1deg)'}}});fx.advance(1800);
    engineLines(fx,2350);fx.edit(gate,true);fx.edit('hpTextVisible',true);fx.edit('hpTextTilt',23);fx.edit('barStyle','old');fx.advance(1600);
    assert.equal(fx.root.BHasClass('HPColorsV3Core'),true);assert.equal(fx.root.BHasClass('HPColorsV3Layout'),false);
    assert.equal(fx.root.BHasClass('HPColorsV3BarOld'),false,name+' stock bar');assert.equal(fx.root.BHasClass('HPColorsV3BarPips'),false,name+' no boxes');
    assert.equal(fx.value.style.transform,'rotateZ(1deg)','unit HP text keeps the captured stock tilt');
    fx.edit(gate,false);fx.advance(150);
    assert.equal(fx.root.BHasClass('HPColorsV3Core'),false);assert.equal(fx.value.style.transform,'rotateZ(1deg)');
  });
test('audit whole 3: damage shake off keeps its class with BAR STYLE OLD on a hero bar',()=>{
  const fx=fixture({classes:['player','enemy','active_damage']});fx.advance(600);engineLines(fx,2000);
  fx.edit('damageShakeEnabled',false);fx.edit('barStyle','old');fx.advance(1600);
  assert.equal(fx.root.BHasClass('HPColorsV3BarPips'),true);
  assert.deepEqual(shakeClasses(fx.root),['HPColorsV3ShakeOff']);assert.equal(computed(fx.motion,'animationName'),'none');
  fx.edit('damageShakeEnabled',true);fx.advance(150);assert.deepEqual(shakeClasses(fx.root),[]);
  assert.equal(computed(fx.motion,'animationName'),'active_damage_wiggle');
});

// Live 6782 preview report: the preview must place the HP number and name exactly where a world bar
// with the same settings puts them, on both sides, every alignment and every BAR STYLE, including
// ENEMY -> ALLY -> ENEMY switches with different per-side settings.
const { modelPreviewLayout } = require('./preview-layout');
test('live 6782 parity: preview HP number and name positions equal the world bar on both sides, all aligns, V1/V2/OLD, across side switches',()=>{
  const net=network(),enemy=fixture({network:net,classes:['player','enemy']}),ally=fixture({network:net,classes:['player','friend']});
  const menu=net.menu,find=id=>menu.harness.contextPanel.FindChildTraverse(id);
  modelPreviewLayout({find},1);
  runInVm(find('HPColorsMenuButton').GetAttributeString('onactivate',''),menu.context);
  // The world fixtures measure their text like the preview model (name 56x20, HP row 36x28 canvas px).
  for(const fx of [enemy,ally]){fx.measure(fx.name,56,20);fx.measure(fx.row,36,28);engineLines(fx,1000);}
  net.advance(1800);
  const edit=(key,value,side)=>editMenu(menu,key,value,side);
  for(const side of ['enemy','ally']){edit('hpTextVisible',true,side);edit('nameColorEnabled',true,side);}
  edit('hpTextOffsetX',-7,'enemy');edit('hpTextOffsetY',5,'enemy');edit('nameOffsetX',9,'enemy');edit('nameOffsetY',-4,'enemy');
  edit('hpTextOffsetX',11,'ally');edit('hpTextOffsetY',-3,'ally');edit('nameOffsetX',-13,'ally');edit('nameOffsetY',6,'ally');
  const preview={name:find('HPColorsPreviewName'),row:find('HPColorsPreviewReadoutLine'),value:find('HPColorsPreviewHpText')};
  const showSide=side=>{find(side==='enemy'?'HPColorsPreviewSideOptionEnemy':'HPColorsPreviewSideOptionAlly').events.onactivate();net.advance(1600);};
  const same=(fx,label)=>{
    assert.equal(menu.harness.$.HPColorsV3Preview.inspect().status.indexOf('unavailable'),-1,label+' preview painted');
    for(const key of ['transform','horizontalAlign','textAlign'])assert.equal(preview.name.style[key],fx.name.style[key],label+' name '+key);
    for(const key of ['transform','horizontalAlign'])assert.equal(preview.row.style[key],fx.row.style[key],label+' HP row '+key);
    assert.ok(preview.value.GetParent()===preview.row,label+' HP number adopted into the row');
    assert.ok(/translate3d/.test(fx.row.style.transform||''),label+' world row placed');
  };
  for(const style of ['none','original','old']){
    edit('barStyle',style);
    for(const [enemyAlign,allyAlign] of [['left','right'],['center','left'],['right','center']]){
      edit('nameAlign',enemyAlign,'enemy');edit('hpTextAlign',enemyAlign,'enemy');edit('nameAlign',allyAlign,'ally');edit('hpTextAlign',allyAlign,'ally');
      for(const side of ['enemy','ally','enemy']){showSide(side);same(side==='enemy'?enemy:ally,style+' '+side+' '+(side==='enemy'?enemyAlign:allyAlign));}
    }
  }
  // Master off returns both to the stylesheet alignment without a paint failure.
  edit('enabled',false);net.advance(1600);
  assert.equal(enemy.row.style.horizontalAlign,'right');assert.equal(preview.row.style.horizontalAlign,'right');
  assert.equal(menu.harness.$.HPColorsV3Preview.inspect().status.indexOf('unavailable'),-1);
});

for (const side of ['enemy','ally']) for (const label of ['Critical','Assassinate','Unkillable']) test(`ticket 28: ${side} ${label} label hides alone, follows the bar and releases exactly`,()=>{
  const key=label.toLowerCase(), fx=fixture({classes:['player',side==='enemy'?'enemy':'friend','health_critical','health_assassinate','unkillable'],
    prepare(parts,h){
      h.contextPanel.AddClass('ShowCriticalState');
      if(side==='enemy')Object.assign(h.contextPanel.FindChild(label+'Indicator').style,{visibility:'visible',transform:'rotateZ(9deg)'});
    }});
  fx.advance(1600);
  const panel=fx.root.FindChild(label+'Indicator'), stockParent=panel.GetParent(), stockOrder=stockParent.Children().slice();
  const snapshot=()=>Object.fromEntries(Object.entries(panel.style).filter(([,value])=>value!==''&&value!==null));
  const stockStyles=snapshot(), stockFlash=computed(fx.inner,'animationName'), stockValue=computed(fx.value,'color');
  assert.equal(computed(panel,'visibility'),'visible');
  fx.edit(key+'IndicatorVisible',false);fx.advance();
  assert.equal(computed(panel,'visibility'),'collapse');
  assert.equal(computed(fx.inner,'animationName'),stockFlash,'critical flashing is not a label setting');
  assert.equal(computed(fx.value,'color'),stockValue,'unkillable HP treatment is not a label setting');
  assert.equal(fx.root.BHasClass('ShowCriticalState'),true);
  for(const other of ['Critical','Assassinate','Unkillable'].filter(name=>name!==label))
    assert.equal(computed(fx.root.FindChild(other+'Indicator'),'visibility'),'visible','other labels unchanged');
  fx.edit(key+'IndicatorVisible',true);fx.edit(key+'OffsetX',17);fx.edit(key+'OffsetY',-11);fx.advance();
  const anchor=fx.root.FindChild('HPColorsV3'+label+'Anchor');
  assert.ok(panel.GetParent()===anchor,'only a customized position adopts the native label');
  assert.deepEqual(position(anchor.style.transform),[17,-14.8]);
  assert.equal(computed(panel,'animationName'),label==='Critical'?undefined:'TagGroove1','native tag animation remains on the label');
  fx.edit('barOffsetX',23,side);fx.edit('barOffsetY',19,side);fx.advance();
  assert.deepEqual(position(anchor.style.transform),[40,8],'offset stays attached after bar movement');
  fx.edit('accessoryAnchorEnabled',false);fx.edit('barWidth',158,side);fx.edit('barHeight',36,side);fx.advance();
  assert.deepEqual(position(anchor.style.transform),[40,8],'label pixels do not scale or use the level/ult anchoring toggle');
  fx.edit(key+'OffsetX',0);fx.edit(key+'OffsetY',0);fx.advance();
  assert.ok(panel.GetParent()===stockParent);assert.deepEqual(snapshot(),stockStyles);
  assert.ok(stockParent.Children().every((child,i)=>child===stockOrder[i]),'reset restores native sibling order');
  assert.equal(anchor.style.transform,'');
  fx.edit(key+'OffsetX',-27);fx.edit(key+'IndicatorVisible',false);fx.advance();
  fx.edit('enabled',false);fx.advance(1600);
  assert.ok(panel.GetParent()===stockParent);assert.deepEqual(snapshot(),stockStyles);
  assert.ok(stockParent.Children().filter(child=>stockOrder.includes(child)).every((child,i)=>child===stockOrder[i]),'label order restores while other native parts also return to root');
  assert.equal(computed(panel,'visibility'),'visible');assert.equal(anchor.style.transform,'');
  fx.edit('enabled',true);fx.advance(1600);
  assert.ok(panel.GetParent()===anchor);assert.equal(computed(panel,'visibility'),'collapse');
  assert.deepEqual(position(anchor.style.transform),[-4,19]);
});

test('ticket 28: default label settings add no native label or anchor writes',()=>{
  const fx=fixture();fx.advance(5000);
  for(const label of ['Critical','Assassinate','Unkillable']){
    const panel=fx.root.FindChild(label+'Indicator'), anchor=fx.root.FindChild('HPColorsV3'+label+'Anchor');
    assert.ok(panel);assert.ok(anchor);
    assert.ok(panel.GetParent()===fx.root);
    assert.equal(panel.styleWrites.length,0,label+' stays native');
    assert.equal(anchor.styleWrites.length,0,label+' anchor stays untouched');
  }
  fx.edit('barOffsetX',35);fx.edit('barOffsetY',29);fx.advance(2000);
  for(const label of ['Critical','Assassinate','Unkillable'])
    assert.equal(fx.root.FindChild(label+'Indicator').styleWrites.length,0,'zero label offsets release to stock even on a moved bar');
});

test('ticket 28: toggling labels releases visibility to native state classes, including unkillable HP text',()=>{
  const fx=fixture({prepare(parts,h){h.contextPanel.AddClass('ShowCriticalState');}});
  fx.advance(1600);
  for(const [label,state] of [['Critical','health_critical'],['Assassinate','health_assassinate'],['Unkillable','unkillable']]){
    const panel=fx.root.FindChild(label+'Indicator'),key=label.toLowerCase();
    assert.equal(computed(panel,'visibility'),'collapse');
    fx.edit(key+'IndicatorVisible',false);fx.advance();
    fx.h.root.AddClass(state);
    assert.equal(computed(panel,'visibility'),'collapse');
    if(label==='Unkillable')assert.equal(computed(fx.value,'visibility'),'collapse','native unkillable hides the HP number even in the adopted readout');
    fx.edit(key+'IndicatorVisible',true);fx.advance();
    assert.equal(computed(panel,'visibility'),'visible');
    fx.h.root.RemoveClass(state);
    assert.equal(computed(panel,'visibility'),'collapse','show releases to CSS; it never forces a gameplay status on');
  }
});

test('a replaced StatusEffects row takes the whole-row move on the next pickup pass', () => {
  // Audit 2026-11-02 (GPT-6.1 Sol repro): discovery cached the first row and never adopted a replacement.
  const boot = loadLayout('unit_status_overlay_v2.xml');
  const h = boot.harness, r = h.contextPanel;
  r.type = r.paneltype = 'ClientUIDialogPanel'; r.classes = ['player', 'enemy'];
  const walk = p => { p.actualuiscale_x = p.actualuiscale_y = 1; p.actuallayoutwidth = 69; p.actuallayoutheight = 12; p.actualxoffset = p.actualyoffset = 0; p.Children().forEach(walk); };
  walk(r); r.actuallayoutwidth = 200; r.actuallayoutheight = 210;
  r.FindChildTraverse('unit_healthbar_lagging').style.clip = 'rect(0%, 50%, 100%, 0%)';
  boot.includeScripts();
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '../generated/defaults.json'), 'utf8')); cfg.side.enemy.barOffsetX = 25;
  const send = revision => h.handlerEntries.filter(e => e.channel === 'ClientUI_FireOutput').forEach(e => e.fn(JSON.stringify({ magic: 'HP_COLORS_V3_CONFIG', epoch: 'effects-row', revision, settings: cfg })));
  send(1); h.scheduler.runFor(1500, 10000);
  const before = r.FindChild('StatusEffects');
  assert.equal(before.style.transform, 'translate3d(25px, 0px, 0px)');
  before.DeleteAsync(0);
  const replacement = new MockPanel('Panel', r, 'StatusEffects');
  new MockPanel('Panel', replacement, 'StatusEffectContainer');
  h.scheduler.runFor(3500, 10000);
  assert.equal(replacement.style.transform, 'translate3d(25px, 0px, 0px)');
  cfg.side.enemy.barOffsetX = 40; send(2); h.scheduler.runFor(500, 10000);
  assert.equal(replacement.style.transform, 'translate3d(40px, 0px, 0px)');
});

test('renderer DEFAULTS table equals the schema defaults it stands for', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '../settings/schema.json'), 'utf8'));
  const rows = Object.fromEntries(Object.values(schema).filter(row => row && row.key).map(row => [row.key, row]));
  const isolated = loadLayout('unit_status_overlay_v2.xml', { skipScripts: ['hp_colors_v3_world_boot'] }); isolated.includeScripts();
  const defaults = isolated.harness.$.HPColorsV3Renderer.defaults;
  assert.ok(Object.keys(defaults).length >= 8);
  for (const key of Object.keys(defaults)) {
    assert.ok(rows[key], key + ' has a schema row');
    const want = rows[key].default;
    if (want !== null && typeof want === 'object') for (const side of Object.keys(want)) assert.equal(defaults[key], want[side], key + '.' + side);
    else assert.equal(defaults[key], want, key);
  }
});
