'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { createPanoramaHarness, createVmContext, runInVm, sourceRoot } = require('./boot-layout');
function boot() {
  const harness = createPanoramaHarness();
  const context = createVmContext(harness);
  for (const file of ['settings', 'codec']) runInVm(fs.readFileSync(path.join(sourceRoot, `panorama/scripts/hp_colors_v3_${file}.js`), 'utf8'), context);
  return { harness, context, codec: harness.$.HPColorsV3Codec, sharing: harness.$.HPColorsV3Sharing,
    settings: JSON.parse(JSON.stringify(harness.$.HPColorsV3Settings.defaults)), contract: harness.$.HPColorsV3Settings };
}
const plain = value => JSON.parse(JSON.stringify(value));
function frame(codec, body, tag = 'HPC3') {
  const payload = Buffer.from(JSON.stringify(body)).toString('base64url');
  return `${tag}.${codec.checksum(payload)}.${payload}`;
}
// Normalize punctuation only for readable slot assertions; compact-wire tests inspect raw JSON below.
function body(code) {
  const record=JSON.parse(Buffer.from(code.split('.')[2], 'base64url').toString());
  const pairs=d=>d.length&&!Array.isArray(d[0])?Array.from({length:d.length/2},(_,i)=>d.slice(i*2,i*2+2)):d;
  record.d=pairs(record.d);for(const preset of record.p||[])preset.d=pairs(preset.d);return record;
}

test('settings and durable records use the same versioned sparse committed slots', () => {
  const { codec, sharing, settings, contract } = boot();
  const explicit=[];
  const empty = sharing.exportSettingsCode(settings);
  assert.equal(empty.ok, true); assert.deepEqual(body(empty.code), { v: contract.recordVersion, k: 'settings', d: explicit });
  settings.side.enemy.barColorLow = '#123456'; settings.side.ally.barColorEnabled = true;
  settings.shared.lowThreshold = 0; settings.shared.highThreshold = 100;
  const code = sharing.exportSettingsCode(settings);
  assert.deepEqual(body(code.code).d, [[1, true], [3, '#123456'], [7, 0], [8, 100], ...explicit]);
  assert.deepEqual(plain(sharing.importSettingsCode(code.code).settings), settings);
  const save = codec.encodeRecord({ settings, presets: [] });
  assert.ok(save.startsWith('HPV2S1.'));
  assert.deepEqual(plain(codec.classifyRecord(save).bundle.settings), settings);
});

test('all shipped settings endpoints fit 4096 chars and round-trip', () => {
  const { sharing, settings, contract } = boot();
  for (const high of [false, true]) {
    for (const row of contract.controls) {
      const values = row.side === 'shared' ? settings.shared : settings.side[row.side];
      values[row.key] = row.type === 'boolean' ? high : row.type === 'color' ? '#FFFFFF' : row.type === 'enum' ? row.options[high ? row.options.length - 1 : 0].value : row.bounds[high ? 1 : 0];
    }
    settings.shared.lowThreshold = high ? 99 : 0; settings.shared.highThreshold = high ? 100 : 1;
    const code = sharing.exportSettingsCode(settings);
    assert.equal(code.ok, true); assert.ok(code.code.length <= 4096);
    assert.deepEqual(plain(sharing.importSettingsCode(code.code).settings), settings);
  }
});

test('bundles preserve unicode names, ids, metadata and settings through code and save', () => {
  const { codec, sharing, settings } = boot();
  const bundle = { settings, presets: [{ id: 'one', name: '雪 🦊', hidden: true, settings }], routing: { default: 'one' } };
  const code = sharing.exportBundleCode(bundle);
  assert.equal(code.ok, true); assert.deepEqual(plain(sharing.importBundleCode(code.code).bundle), bundle);
  assert.deepEqual(plain(codec.classifyRecord(codec.encodeRecord(bundle)).bundle), bundle);
});

test('newer codes and saves load known slots, skip unknown slots and flag version', () => {
  const { codec, sharing, contract } = boot();
  const future = { v: contract.recordVersion+1, k: 'settings', d: [[3, '#010203'], [999, { future: true }]] };
  const result = sharing.importSettingsCode(frame(codec, future));
  assert.equal(result.ok, true); assert.equal(result.newer, true);
  assert.match(result.message, /newer version/i); assert.equal(result.settings.side.enemy.barColorLow, '#010203');
  const saved = codec.classifyRecord(frame(codec, { ...future, k: 'bundle', p: [] }, 'HPV2S1'));
  assert.equal(saved.kind, 'newer'); assert.equal(saved.bundle.settings.side.enemy.barColorLow, '#010203');
});

for (const [label, patch] of [
  ['duplicate slots', { d: [[3, '#010203'], [3, '#123456']] }],
  ['negative slot', { d: [[-1, true]] }],
  ['invalid known value', { d: [[3, 'red']] }],
  ['invalid thresholds', { d: [[7, 90], [8, 20]] }],
  ['fractional version', { v: 1.5 }],
  ['wrong kind', { k: 'bundle', p: [] }],
]) test(`invalid settings code refuses ${label}`, () => {
  const { codec, sharing } = boot();
  assert.equal(sharing.importSettingsCode(frame(codec, { v: 1, k: 'settings', d: [], ...patch })).ok, false);
});

test('corrupt framing, checksum and UTF-8 are refused', () => {
  const { codec, sharing, settings } = boot();
  const good = sharing.exportSettingsCode(settings).code;
  // Junk after a complete code is chat wrapping and is ignored; "!" inside the payload is corruption.
  for (const code of [good.slice(0, -3) + '!' + good.slice(-3), good.replace('HPC3', 'HPCR2'), good.replace(/\.[0-9a-f]{8}\./, '.00000000.'), `HPC3.${codec.checksum('_w')}._w`]) assert.equal(sharing.importSettingsCode(code).ok, false);
  assert.equal(sharing.importSettingsCode(good + '!').ok, true);
});

test('upgrade hook applies ordered absent-slot old defaults before validation', () => {
  const { codec, settings } = boot();
  const upgraded = codec.upgrade({ v: 1, k: 'settings', d: [] }, 3, {
    2: record => { record.d.push([3, '#101010']); return record; },
    3: record => { record.d.push([7, 0]); return record; },
  });
  assert.equal(upgraded.v, 3); assert.deepEqual(plain(upgraded.d), [[3, '#101010'], [7, 0]]);
  assert.equal(codec.classifyRecord(codec.encodeRecord({ settings, presets: [] })).kind, 'valid');
  assert.throws(() => codec.upgrade({ v: 1, d: [] }, 2, {}), /upgrade/i);
});

test('bundle and preset caps fail visibly rather than truncate', () => {
  const { sharing, settings } = boot();
  const big = { settings, presets: Array.from({ length: 128 }, (_, i) => ({ id: String(i), name: 'x'.repeat(300), settings })) };
  const result = sharing.exportBundleCode(big);
  assert.equal(result.ok, false); assert.match(result.message, /32,768|fewer/i);
  big.presets.push({ id: '129', name: 'one more', settings });
  const many = sharing.exportBundleCode(big);
  assert.equal(many.ok, false); assert.match(many.message, /128/);
});

test('future durable formats remain protected even when their body is not understood', () => {
  const { codec, contract } = boot(), futureVersion=contract.recordVersion+1;
  for (const record of [{ v: futureVersion, k: 'future-kind' }, { v: futureVersion, k: 'bundle', d: [[3, 'new-color-format']], p: [] }]) {
    assert.equal(codec.classifyRecord(frame(codec, record, 'HPV2S1')).kind, 'newer');
  }
});

test('changed-default slots are explicit forever, including preset diffs, without an old baseline', () => {
  const newer = boot(), old = boot();
  newer.contract.recordVersion = old.contract.recordVersion+1;
  newer.contract.defaultChanges = [{ version: newer.contract.recordVersion, slots: [3] }];
  newer.contract.defaults.side.enemy.barColorLow = '#112233';
  const settings = plain(newer.contract.defaults);
  const code = newer.sharing.exportSettingsCode(settings);
  assert.deepEqual(body(code.code).d, [[3, '#112233']]);
  const imported = old.sharing.importSettingsCode(code.code);
  assert.equal(imported.settings.side.enemy.barColorLow, '#112233');
  assert.match(imported.message, /settings may differ/);
  const saved = newer.codec.encodeRecord({ settings, presets: [{ id:'one',name:'One',settings }] });
  const decoded = body(saved);
  assert.deepEqual(decoded.d, [[3, '#112233']]); assert.deepEqual(decoded.p[0].d, [[3, '#112233']]);
  newer.contract.recordVersion++;
  assert.deepEqual(body(newer.sharing.exportSettingsCode(settings).code).d, [[3, '#112233']]);
});

test('newer settings reject only incompatible known values, keeping other valid settings and presets', () => {
  const {codec,sharing} = boot();
  const record={v:2,k:'bundle',d:[[2,'future mode'],[3,'#112233'],[7,90],[8,20]],p:[{id:'one',name:'One',d:[[2,'future mode'],[3,'#445566']]}]};
  const saved=codec.classifyRecord(frame(codec,record,'HPV2S1'));
  assert.equal(saved.kind,'newer'); assert.equal(saved.bundle.settings.side.enemy.barColorLow,'#112233');
  assert.equal(saved.bundle.settings.side.enemy.barColorMode,'gradient');
  assert.equal(saved.bundle.presets[0].settings.side.enemy.barColorLow,'#445566');
  assert.ok(saved.bundle.settings.shared.lowThreshold<saved.bundle.settings.shared.highThreshold);
  const imported=sharing.importSettingsCode(frame(codec,{v:2,k:'settings',d:[[2,'future mode'],[3,'#112233']]}));
  assert.equal(imported.ok,true); assert.equal(imported.settings.side.enemy.barColorLow,'#112233');
  assert.match(imported.message,/settings may differ/);
});

test('damaged encodings and non-string imports return player-facing messages', () => {
  const {codec,sharing} = boot();
  const invalidUtf8=`HPC3.${codec.checksum('_w')}._w`;
  const empty=`HPC3.${codec.checksum('')}.`;
  for(const code of [null,{},invalidUtf8,empty]) {
    const result=sharing.importSettingsCode(code);
    assert.equal(result.ok,false); assert.match(result.message,/code/i);
    assert.doesNotMatch(result.message,/URI malformed|Unexpected|JSON|TypeError|too large/i);
  }
});

test('lone surrogate names round-trip even with a pre-well-formed JSON engine', () => {
  const {context,sharing,settings}=boot();
  context.JSON={...JSON, stringify(value) { return JSON.stringify(value).replace(/\\ud800/g,'\ud800'); }, parse:JSON.parse};
  const bundle={settings,presets:[{id:'one',name:'Left \ud800 right',settings}]};
  const result=sharing.exportBundleCode(bundle);
  assert.equal(result.ok,true); assert.equal(sharing.importBundleCode(result.code).bundle.presets[0].name,bundle.presets[0].name);
});

test('wire-size upper bound covers worst textual value per shipped slot, not only numeric endpoints', () => {
  const {contract,sharing,settings}=boot();
  const valueText = row => {
    if(row.type==='number') {
      const digits=(String(row.step).split('.')[1]||'').length;
      let longest='';
      for(let i=0;i<=Math.floor((row.bounds[1]-row.bounds[0])/row.step+1e-8);i++) {
        const text=JSON.stringify(Number((row.bounds[0]+i*row.step).toFixed(digits)));
        if(Buffer.byteLength(text)>Buffer.byteLength(longest)) longest=text;
      }
      return longest;
    }
    return row.type==='boolean' ? 'false' : row.type==='color' ? '"#FFFFFF"' :
      row.options.map(option=>JSON.stringify(option.value)).sort((a,b)=>Buffer.byteLength(b)-Buffer.byteLength(a))[0];
  };
  const entries=contract.slots.map(slot=>{
    const row=contract.controls.find(control=>control.side===slot.side&&control.key===slot.setting);
    return slot.slot+','+valueText(row);
  });
  const wire='{"v":'+contract.recordVersion+',"k":"settings","d":['+entries.join(',')+']}';
  const upper=14+Math.ceil(Buffer.byteLength(wire)/3)*4;
  assert.ok(upper<=4096, 'worst-case shipped settings code bound: '+upper);
  console.log('v'+contract.recordVersion+' worst-case settings bound '+upper+' chars; margin '+(4096-upper));
  const row={key:'decimalProbe',side:'shared',type:'number',bounds:[-100,100],step:0.1};
  contract.controls.push(row); contract.slots.push({slot:999,setting:row.key,side:'shared',type:'number'});
  contract.defaults.shared.decimalProbe=0;
  settings.shared.decimalProbe=-100; const endpoint=sharing.exportSettingsCode(settings).code;
  settings.shared.decimalProbe=-99.9; const middle=sharing.exportSettingsCode(settings).code;
  assert.ok(middle.length>endpoint.length);
  assert.equal(sharing.importSettingsCode(middle).settings.shared.decimalProbe,-99.9);
});

for(const count of [1,2]) test(`reserved baked_default id becomes a fresh user id on ${count===1?'single-preset':'bundle'} import`,()=>{
  const {codec,sharing,settings}=boot();
  const presets=[{id:'baked_default',name:'Named baked copy',settings}];
  if(count===2) presets.push({id:'existing',name:'Existing user preset',settings});
  const exported=sharing.exportBundleCode({settings,presets});
  assert.equal(exported.ok,true);
  const first=sharing.importBundleCode(exported.code),second=sharing.importBundleCode(exported.code);
  assert.equal(first.ok,true);assert.equal(second.ok,true);
  assert.notEqual(first.bundle.presets[0].id,'baked_default');
  assert.notEqual(first.bundle.presets[0].id,second.bundle.presets[0].id);
  assert.equal(first.bundle.presets[0].name,'Named baked copy');
  if(count===2) assert.equal(first.bundle.presets[1].id,'existing');
  assert.ok(first.bundle.presets.every(preset=>preset.id!=='baked_default'));
  assert.ok(codec.classifyRecord(codec.encodeRecord(first.bundle)).bundle.presets.every(preset=>preset.id!=='baked_default'));
  assert.throws(()=>codec.encodeRecord({settings,presets}),/reserved/i);
});

test('fresh imported default ids cannot collide with another incoming user record',()=>{
  const {sharing,settings}=boot();
  const first=sharing.importBundleCode(sharing.exportBundleCode({settings,presets:[{id:'baked_default',name:'Copy',settings}]}).code);
  const existing=first.bundle.presets[0];
  const result=sharing.importBundleCode(sharing.exportBundleCode({settings,presets:[{id:'baked_default',name:'Copy again',settings},existing]}).code);
  assert.equal(result.ok,true);assert.notEqual(result.bundle.presets[0].id,existing.id);assert.equal(result.bundle.presets[1].id,existing.id);
});

test('record v1 upgrades existing settings and presets to indicator defaults without losing metadata',()=>{
  const {codec,sharing}=boot();
  const record={v:1,k:'bundle',d:[[3,'#112233']],p:[{id:'old',name:'Old',hidden:true,d:[[3,'#445566']]}],b:{routing:{default:'old'}}};
  const imported=sharing.importBundleCode(frame(codec,record));
  assert.equal(imported.ok,true);
  assert.equal(imported.bundle.settings.side.enemy.barColorLow,'#112233');
  assert.equal(imported.bundle.settings.side.enemy.lineColorEnabled,true);
  assert.equal(imported.bundle.settings.side.enemy.killMarkerEnabled,false);
  assert.equal(imported.bundle.presets[0].settings.side.enemy.barColorLow,'#445566');
  assert.equal(imported.bundle.presets[0].settings.side.ally.lineOpacity,100);
  assert.equal(imported.bundle.presets[0].hidden,true);assert.equal(imported.bundle.routing.default,'old');
});

test('record v14: a v13 enemy-stamina code keeps its enemy values, allies and team colors take defaults, and team modes round-trip',()=>{
  const {codec,sharing,contract,settings}=boot();
  assert.equal(contract.recordVersion,16,'name color source added slots 196/197');
  const imported=sharing.importSettingsCode(frame(codec,{v:13,k:'settings',d:[104,true,105,'#123456',110,'circle']}));
  assert.equal(imported.ok,true,imported.message);assert.equal(imported.newer,false);
  const {enemy,ally}=imported.settings.side;
  assert.deepEqual([enemy.staminaColorEnabled,enemy.staminaColor,enemy.staminaShape],[true,'#123456','circle']);
  assert.deepEqual([ally.staminaColorEnabled,ally.staminaColor,ally.staminaShape,ally.staminaLowThreshold,ally.staminaLowColor],[false,'#FD4949','arrow',0,'#FFE55B']);
  assert.deepEqual([enemy.staminaColorMode,enemy.hpTextTeamHigh,imported.settings.shared.teamAmberColor,imported.settings.shared.teamSapphireColor],['custom',false,'#E7B659','#5B79E6']);
  settings.side.enemy.hpTextColorMode='team';settings.side.ally.staminaColorMode='team';settings.side.ally.staminaLowThreshold=10;settings.shared.teamSapphireColor='#010203';
  const code=sharing.exportSettingsCode(settings);assert.equal(code.ok,true);
  assert.deepEqual(plain(sharing.importSettingsCode(code.code).settings),settings);
  assert.deepEqual(body(sharing.exportSettingsCode(boot().settings).code).d,[],'an option addition is not a default change: defaults stay implicit');
});

test('record v16: a v15 code keeps its own name color, and the name color source round-trips per side',()=>{
  const {codec,sharing,settings}=boot();
  const imported=sharing.importSettingsCode(frame(codec,{v:15,k:'settings',d:[69,true,71,'#123456']}));
  assert.equal(imported.ok,true,imported.message);assert.equal(imported.newer,false);
  const {enemy,ally}=imported.settings.side;
  assert.deepEqual([enemy.nameColorEnabled,enemy.nameColor,enemy.nameColorMode,ally.nameColorMode],[true,'#123456','custom','custom']);
  settings.side.ally.nameColorMode='team';
  const code=sharing.exportSettingsCode(settings);assert.equal(code.ok,true);
  assert.deepEqual(plain(body(code.code).d),[[197,'team']],'only the changed side is written');
  assert.deepEqual(plain(sharing.importSettingsCode(code.code).settings),settings);
});

// Ticket 36: "Low color on empty charges" (slots 193/194) was removed after a debug build saved slot 193 in
// the live backup record. Retired slots are skipped on read (not newer, not refused) and never written.
test('ticket 36: retired slots 193/194 are dropped from saved v14 records, conditions included, and never written',()=>{
  const {codec,sharing,contract}=boot();
  assert.deepEqual(Array.from(contract.retiredSlots),[193,194]);
  assert.equal(contract.slots.some(slot=>slot.slot===193||slot.slot===194),false);
  const imported=sharing.importSettingsCode(frame(codec,{v:14,k:'settings',d:[189,1,191,'#D80000',193,false,194,true],c:[193,1,1,true,189,2,2,3]}));
  assert.equal(imported.ok,true,imported.message);assert.equal(imported.newer,false,'a retired slot is not newer data');
  assert.equal(imported.settings.side.enemy.staminaLowThreshold,1);assert.equal(imported.settings.side.enemy.staminaLowColor,'#D80000');
  assert.equal(Object.hasOwn(imported.settings.side.enemy,'staminaLowEmpty'),false);
  assert.deepEqual(Object.keys(plain(imported.rules)),['189'],'a condition on a retired slot is dropped');
  const bundle=sharing.importBundleCode(frame(codec,{v:14,k:'bundle',d:[193,false],p:[{id:'kept',name:'Kept',d:[194,false,191,'#00FF00']}]}));
  assert.equal(bundle.ok,true,bundle.message);assert.equal(bundle.newer,false);
  assert.equal(bundle.bundle.presets[0].settings.side.enemy.staminaLowColor,'#00FF00');
  assert.deepEqual(body(sharing.exportSettingsCode(imported.settings).code).d,[[189,1],[191,'#D80000']]);
});

test('v6 settings/bundles compact slot/value punctuation and accept old pair diffs without losing values',()=>{
  const {contract,sharing,settings,codec}=boot();settings.shared.pickupSize=64;settings.shared.rejuvSize=48;
  const exported=sharing.exportSettingsCode(settings);assert.equal(exported.ok,true);
  const wire=JSON.parse(Buffer.from(exported.code.split('.')[2],'base64url').toString());
  assert.deepEqual(wire.d,[139,64,146,48]);
  assert.deepEqual(plain(sharing.importSettingsCode(exported.code).settings),settings);
  const old=frame(codec,{v:5,k:'settings',d:[[3,'#123456']]});assert.equal(sharing.importSettingsCode(old).settings.side.enemy.barColorLow,'#123456');
  const bundle=sharing.exportBundleCode({settings,presets:[{id:'one',name:'Compact',settings}]});
  const raw=JSON.parse(Buffer.from(bundle.code.split('.')[2],'base64url').toString());assert.deepEqual(raw.p[0].d,wire.d);
  assert.deepEqual(plain(sharing.importBundleCode(bundle.code).bundle.presets[0].settings),settings);
  for(const d of [[139],[139,64,146],[139,64,139,32],[139,false],[139,[[1,2]]]]) {
    const bad=sharing.importSettingsCode(frame(codec,{v:6,k:'settings',d}));assert.equal(bad.ok,false);
  }
});

test('VM code exports canonicalize step-grid floating-point noise in settings and preset saves',()=>{
  const {codec,sharing,settings}=boot();
  settings.side.enemy.killMarkerWidth=0.1*3;
  settings.shared.pickupOffsetX=17.000000000000004;
  const exported=sharing.exportSettingsCode(settings);
  assert.equal(exported.ok,true);
  const saved=codec.encodeRecord({settings,presets:[{id:'one',name:'One',settings}]});
  const imported=sharing.importSettingsCode(exported.code).settings;
  assert.equal(imported.side.enemy.killMarkerWidth,0.3);
  assert.equal(imported.shared.pickupOffsetX,17);
  const restored=codec.classifyRecord(saved).bundle;
  assert.equal(restored.presets[0].settings.side.enemy.killMarkerWidth,0.3);
  assert.equal(restored.presets[0].settings.shared.pickupOffsetX,17);
  assert.equal(body(exported.code).d.some(([slot])=>slot===93),false,'default-width noise does not take a slot');
});

test('snapped threshold collisions fail export atomically instead of producing an unreadable code',()=>{
  const {codec,sharing,settings}=boot();
  settings.shared.lowThreshold=64.999999999999;settings.shared.highThreshold=65;
  const exported=sharing.exportSettingsCode(settings);
  assert.equal(exported.ok,false);
  assert.throws(()=>codec.encodeRecord({settings,presets:[]}),/Invalid settings/);
  assert.equal(settings.shared.lowThreshold,64.999999999999,'validation never mutates the caller');
});
