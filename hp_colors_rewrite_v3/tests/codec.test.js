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
  // A pasted code drops bundle metadata nothing reads, such as the old routing field (save-security audit
  // 2026-11-02); the player's own save keeps it.
  const { routing, ...shared } = bundle;
  assert.equal(code.ok, true); assert.deepEqual(plain(sharing.importBundleCode(code.code).bundle), shared);
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
  // The old routing field is dropped from a pasted code (nothing reads it, 2026-11-02); an own save keeps it.
  assert.equal(imported.bundle.presets[0].hidden,true);assert.equal(imported.bundle.routing,undefined);
  const saved=codec.classifyRecord(frame(codec,record,'HPV2S1'));
  assert.equal(saved.kind,'valid');assert.equal(saved.bundle.routing.default,'old');
});

test('record v14: a v13 enemy-stamina code keeps its enemy values, allies and team colors take defaults, and team modes round-trip',()=>{
  const {codec,sharing,contract,settings}=boot();
  assert.equal(contract.recordVersion,23,'status effect sizes added slots 218-225');
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

// 2026-10-29 (user): Customize NPCs (152/153) was removed and the unreleased Neutral camp look (198, saved by a local
// 3.5.0 test build) replaced by the neutral HP number settings. Retired slots are skipped on read and never written.
test('record v17: NPC switches and slot 198 are retired, and the neutral HP number settings round-trip',()=>{
  const {codec,sharing,settings,contract}=boot();
  assert.equal(contract.slots.some(slot=>[152,153,198].includes(slot.slot)),false);
  const imported=sharing.importSettingsCode(frame(codec,{v:16,k:'settings',d:[152,true,153,true,156,true,157,'#123456']}));
  assert.equal(imported.ok,true,imported.message);assert.equal(imported.newer,false,'a retired slot is not newer data');
  assert.deepEqual([imported.settings.shared.neutralEnabled,imported.settings.shared.neutralColor,imported.settings.shared.neutralHpTextMode],[true,'#123456','default']);
  assert.equal(Object.hasOwn(imported.settings.side.enemy,'npcEnabled'),false);
  const test=sharing.importSettingsCode(frame(codec,{v:17,k:'settings',d:[198,'color']}));
  assert.equal(test.ok,true,test.message);assert.equal(test.newer,false,'the test build value is dropped');
  Object.assign(settings.shared,{neutralHpTextMode:'always',neutralHpPositionEnabled:true,neutralHpOffsetX:12,neutralHpOffsetY:-7,neutralHpTilt:10});
  const code=sharing.exportSettingsCode(settings);assert.equal(code.ok,true);
  assert.deepEqual(plain(body(code.code).d).map(pair=>pair[1]),['always',true,12,-7,10]);
  assert.deepEqual(plain(sharing.importSettingsCode(code.code).settings),settings);
});

// 2026-10-29 (user): objectives get the neutral HP number options (record v18, slots 204-208). A v17 record
// (saved by 3.5.0 test builds) takes their defaults; the new slots are written only when changed and round-trip.
test('record v18: objective HP number settings default on v17 records and round-trip',()=>{
  const {codec,sharing,settings,contract}=boot();
  assert.deepEqual(plain(contract.slots.filter(slot=>slot.slot>=204&&slot.slot<=208).map(slot=>[slot.slot,slot.key])),
    [[204,'objectiveHpTextMode'],[205,'objectiveHpPositionEnabled'],[206,'objectiveHpOffsetX'],[207,'objectiveHpOffsetY'],[208,'objectiveHpTilt']]);
  const old=sharing.importSettingsCode(frame(codec,{v:17,k:'settings',d:[154,true,199,'always']}));
  assert.equal(old.ok,true,old.message);assert.equal(old.newer,false);
  const {shared}=old.settings;
  assert.deepEqual([old.settings.side.enemy.objectiveEnabled,shared.neutralHpTextMode,shared.objectiveHpTextMode,shared.objectiveHpPositionEnabled,shared.objectiveHpOffsetX,shared.objectiveHpOffsetY,shared.objectiveHpTilt],
    [true,'always','default',false,0,0,-3]);
  Object.assign(settings.shared,{objectiveHpTextMode:'always',objectiveHpPositionEnabled:true,objectiveHpOffsetX:-200,objectiveHpOffsetY:210,objectiveHpTilt:-360});
  const code=sharing.exportSettingsCode(settings);assert.equal(code.ok,true);
  assert.deepEqual(plain(body(code.code).d),[[204,'always'],[205,true],[206,-200],[207,210],[208,-360]]);
  assert.deepEqual(plain(sharing.importSettingsCode(code.code).settings),settings);
});

// Ticket 50: kill bounty (record v19, slots 209-211). A v18 record takes the defaults (off, no offsets);
// the new slots are written only when changed and round-trip.
test('record v19: kill bounty settings default on v18 records and round-trip',()=>{
  const {codec,sharing,settings,contract}=boot();
  assert.deepEqual(plain(contract.slots.filter(slot=>slot.slot>=209&&slot.slot<=211).map(slot=>[slot.slot,slot.key])),
    [[209,'killBountyEnabled'],[210,'killBountyOffsetX'],[211,'killBountyOffsetY']]);
  const old=sharing.importSettingsCode(frame(codec,{v:18,k:'settings',d:[204,'always']}));
  assert.equal(old.ok,true,old.message);assert.equal(old.newer,false);
  assert.deepEqual([old.settings.shared.objectiveHpTextMode,old.settings.shared.killBountyEnabled,old.settings.shared.killBountyOffsetX,old.settings.shared.killBountyOffsetY],['always',false,0,0]);
  Object.assign(settings.shared,{killBountyEnabled:true,killBountyOffsetX:-200,killBountyOffsetY:210});
  const code=sharing.exportSettingsCode(settings);assert.equal(code.ok,true);
  assert.deepEqual(plain(body(code.code).d),[[209,true],[210,-200],[211,210]]);
  assert.deepEqual(plain(sharing.importSettingsCode(code.code).settings),settings);
});

// Discord request (ccrom, 2026-11-01): deferred damage color (record v20, slots 212 enemy / 213 ally). A v19 record
// takes the stock orange on both sides; the new slots are written only when changed, per side, and round-trip.
test('record v20: deferred damage colors default on v19 records and round-trip per side',()=>{
  const {codec,sharing,settings,contract}=boot();
  assert.deepEqual(plain(contract.slots.filter(slot=>slot.slot>=212&&slot.slot<=213).map(slot=>[slot.slot,slot.key])),
    [[212,'enemyBarDeferredColor'],[213,'allyBarDeferredColor']]);
  const old=sharing.importSettingsCode(frame(codec,{v:19,k:'settings',d:[209,true]}));
  assert.equal(old.ok,true,old.message);assert.equal(old.newer,false);
  assert.deepEqual([old.settings.shared.killBountyEnabled,old.settings.side.enemy.barDeferredColor,old.settings.side.ally.barDeferredColor],[true,'#E87F3D','#E87F3D']);
  settings.side.ally.barDeferredColor='#FFFFFF';
  const code=sharing.exportSettingsCode(settings);assert.equal(code.ok,true);
  assert.deepEqual(plain(body(code.code).d),[[213,'#FFFFFF']],'only the changed side is written');
  assert.deepEqual(plain(sharing.importSettingsCode(code.code).settings),settings);
});

// yesdaddy, 2026-11-02: kill bounty size and tilt (record v21, slots 214-215). A v20 record keeps the stock-look
// pill (17 px, no tilt); the new slots are written only when changed and round-trip.
test('record v21: kill bounty size and tilt default on v20 records and round-trip',()=>{
  const {codec,sharing,settings,contract}=boot();
  assert.deepEqual(plain(contract.slots.filter(slot=>slot.slot>=214&&slot.slot<=215).map(slot=>[slot.slot,slot.key])),
    [[214,'killBountySize'],[215,'killBountyTilt']]);
  const old=sharing.importSettingsCode(frame(codec,{v:20,k:'settings',d:[209,true,213,'#FFFFFF']}));
  assert.equal(old.ok,true,old.message);assert.equal(old.newer,false);
  assert.deepEqual([old.settings.shared.killBountyEnabled,old.settings.side.ally.barDeferredColor,old.settings.shared.killBountySize,old.settings.shared.killBountyTilt],
    [true,'#FFFFFF',17,0]);
  Object.assign(settings.shared,{killBountySize:34,killBountyTilt:-360});
  const code=sharing.exportSettingsCode(settings);assert.equal(code.ok,true);
  assert.deepEqual(plain(body(code.code).d),[[214,34],[215,-360]]);
  assert.deepEqual(plain(sharing.importSettingsCode(code.code).settings),settings);
});

// Ticket 51 (FireworkPolymer, Discord 2026-11-09): HP number format (record v22, slots 216 enemy / 217 ally).
// A v21 record keeps the number only on both sides; the new slots are written only when changed, per side.
test('record v22: HP number format defaults to Number on v21 records and round-trips per side',()=>{
  const {codec,sharing,settings,contract}=boot();
  assert.deepEqual(plain(contract.slots.filter(slot=>slot.slot===216||slot.slot===217).map(slot=>[slot.slot,slot.key])),
    [[216,'enemyHpTextFormat'],[217,'allyHpTextFormat']]);
  const old=sharing.importSettingsCode(frame(codec,{v:21,k:'settings',d:[214,34]}));
  assert.equal(old.ok,true,old.message);assert.equal(old.newer,false);
  assert.deepEqual([old.settings.shared.killBountySize,old.settings.side.enemy.hpTextFormat,old.settings.side.ally.hpTextFormat],[34,'number','number']);
  settings.side.enemy.hpTextFormat='both';settings.side.ally.hpTextFormat='percent';
  const code=sharing.exportSettingsCode(settings);assert.equal(code.ok,true);
  assert.deepEqual(plain(body(code.code).d),[[216,'both'],[217,'percent']]);
  assert.deepEqual(plain(sharing.importSettingsCode(code.code).settings),settings);
});

// Ticket 52 (tsunamicrazie, 2026-11-07): status effect icon sizes (record v23, shared slots 218-225).
// A v22 record keeps every icon at the game size; a slot is written only when its slider left 100%.
test('record v23: status effect sizes default to 100% on v22 records and round-trip one slot per changed effect',()=>{
  const {codec,sharing,settings,contract}=boot();
  assert.deepEqual(plain(contract.slots.filter(slot=>slot.slot>=218).map(slot=>[slot.slot,slot.key])),
    [[218,'statusScaleFixation'],[219,'statusScaleMalice'],[220,'statusScaleScrewjab'],[221,'statusScaleDjinnsMark'],
      [222,'statusScaleSerratedKnives'],[223,'statusScaleBarrage'],[224,'statusScalePulseGrenade'],[225,'statusScaleArcticBeam']]);
  const old=sharing.importSettingsCode(frame(codec,{v:22,k:'settings',d:[216,'both']}));
  assert.equal(old.ok,true,old.message);assert.equal(old.newer,false);
  assert.deepEqual([old.settings.side.enemy.hpTextFormat,old.settings.shared.statusScaleFixation,old.settings.shared.statusScaleArcticBeam],['both',100,100]);
  settings.shared.statusScaleFixation=150;settings.shared.statusScaleArcticBeam=250;
  const code=sharing.exportSettingsCode(settings);assert.equal(code.ok,true);
  assert.deepEqual(plain(body(code.code).d),[[218,150],[225,250]]);
  assert.deepEqual(plain(sharing.importSettingsCode(code.code).settings),settings);
  const outside=sharing.importSettingsCode(frame(codec,{v:23,k:'settings',d:[218,260]}));
  assert.notEqual(outside.ok&&outside.settings.shared.statusScaleFixation,260,'a size past the slider is not accepted');
});

// Ticket 36: "Low color on empty charges" (slots 193/194) was removed after a debug build saved slot 193 in
// the live backup record. Retired slots are skipped on read (not newer, not refused) and never written.
test('ticket 36: retired slots 193/194 are dropped from saved v14 records, conditions included, and never written',()=>{
  const {codec,sharing,contract}=boot();
  assert.deepEqual(Array.from(contract.retiredSlots),[193,194,152,153,198]);
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

// Save-security audit 2026-11-02 (F3, Claude + Claude Fable 5.1): a bundle code pasted from another player could carry
// 20,000-character or empty preset names and hidden preset fields, which then lived on in the save and in the victim's
// own later exports. Ways this can fail: a too-long, empty or blank name gets in; the 48-character limit is off by one
// (rename and v2 both allow exactly 1-48); hidden fields survive the import or the re-export; a known field (rules)
// is dropped; or the player's own save, which may already hold such a preset, stops loading.
test('pasted bundle codes keep only real preset fields and names of 1-48 characters; own saves still load', () => {
  const { codec, sharing, settings, contract } = boot();
  const code = presets => frame(codec, { v: contract.recordVersion, k: 'bundle', d: [], p: presets });
  for (const name of ['N'.repeat(49), 'N'.repeat(20000), '', '   ']) {
    const result = sharing.importBundleCode(code([{ id: 'p', name, d: [] }]));
    assert.equal(result.ok, false, JSON.stringify(name.slice(0, 8)) + ' x' + name.length);
    assert.match(result.message, /preset names/);
  }
  const rules = { [contract.slots.find(slot => slot.setting === 'barColorLow' && slot.side === 'enemy').slot]: { slot: 1, minTier: 2, value: '#123456' } };
  const junk = { id: 'p', name: 'N'.repeat(48), d: [3, '#654321'], c: [], tracker: 'x'.repeat(2000), nested: [1, [2, [3]]], constructor: { x: 1 } };
  const withRules = sharing.exportBundleCode({ settings, presets: [{ id: 'r', name: 'Rules', settings, rules }] });
  const ruled = sharing.importBundleCode(withRules.code).bundle.presets[0];
  assert.deepEqual(plain(ruled.rules), rules, 'ability conditions are a real preset field');
  const imported = sharing.importBundleCode(code([junk]));
  assert.equal(imported.ok, true, imported.message);
  assert.deepEqual(Object.keys(imported.bundle.presets[0]).sort(), ['id', 'name', 'settings']);
  assert.equal(imported.bundle.presets[0].settings.side.enemy.barColorLow, '#654321');
  const again = sharing.importBundleCode(sharing.exportBundleCode(imported.bundle).code).bundle.presets[0];
  assert.deepEqual(Object.keys(again).sort(), ['id', 'name', 'settings'], 'nothing hidden spreads through a re-export');
  const old = codec.classifyRecord(codec.encodeRecord({ settings, presets: [{ id: 'p', name: 'N'.repeat(20000), tracker: 1, settings }] }));
  assert.equal(old.kind, 'valid', 'a save that already holds such a preset still loads');
  assert.equal(old.bundle.presets[0].name.length, 20000);
});

// Round 2 (Fable red-team): the old fields kept for migration must not become a new hiding place. Ways this can fail:
// a non-boolean hidden flag or junk bundle metadata (including REPLACE ALL's top-level fields) survives; a real
// field (hero routing, the baked default's name and hidden state, the next preset number) is lost; a padded name
// is stored untrimmed (rename trims).
test('pasted bundle codes keep only real bundle metadata with checked shapes, and trimmed names', () => {
  const { codec, sharing, settings, contract } = boot();
  const hero = contract.heroes[0].key;
  const b = { heroPresets: { [hero]: 'p' }, heroDefault: 'p', sourcePresetId: 'p', sourceWasMapped: true,
    hiddenBakedPresetIds: ['baked_default', 'x'.repeat(5000)], bakedPresetNameOverrides: { baked_default: 'Mine', junk: 'x'.repeat(5000) },
    nextUserPresetNumber: 7, routing: { default: 'p' }, tracker: 'x'.repeat(5000) };
  const code = frame(codec, { v: contract.recordVersion, k: 'bundle', d: [], p: [{ id: 'p', name: '  Padded  ', d: [], hidden: 'x'.repeat(5000) }], b });
  const result = sharing.importBundleCode(code);
  assert.equal(result.ok, true, result.message);
  const bundle = plain(result.bundle);
  assert.deepEqual(Object.keys(bundle).sort(), ['bakedPresetNameOverrides', 'heroDefault', 'heroPresets', 'hiddenBakedPresetIds',
    'nextUserPresetNumber', 'presets', 'settings', 'sourcePresetId', 'sourceWasMapped']);
  assert.deepEqual([bundle.heroPresets, bundle.heroDefault, bundle.sourcePresetId, bundle.sourceWasMapped], [{ [hero]: 'p' }, 'p', 'p', true]);
  assert.deepEqual(bundle.hiddenBakedPresetIds, ['baked_default']);
  assert.deepEqual(bundle.bakedPresetNameOverrides, { baked_default: 'Mine' });
  assert.equal(bundle.nextUserPresetNumber, 7);
  assert.deepEqual(bundle.presets[0], { id: 'p', name: 'Padded', settings }, 'a non-boolean hidden is dropped and the name trimmed');
  const bad = sharing.importBundleCode(frame(codec, { v: contract.recordVersion, k: 'bundle', d: [], p: [{ id: 'p', name: 'P', d: [], hidden: true }],
    b: { hiddenBakedPresetIds: 'x', bakedPresetNameOverrides: { baked_default: 'N'.repeat(49) }, nextUserPresetNumber: 1.5 } }));
  assert.equal(bad.ok, true, bad.message);
  assert.deepEqual(Object.keys(plain(bad.bundle)).sort(), ['presets', 'settings'], 'malformed baked fields are dropped, not trusted');
  assert.equal(bad.bundle.presets[0].hidden, true, 'a boolean hidden flag is kept');
});


test('RECORD publishes the frozen record limits and valuesOf picks the slot store', () => {
  const { codec, settings, contract } = boot();
  assert.ok(Object.isFrozen(codec.RECORD) && Object.isFrozen(codec.RECORD.slotRange) && Object.isFrozen(codec.RECORD.tierRange));
  assert.deepEqual(plain(codec.RECORD), { maxChars: 192000, settingsCodeChars: 4096, bundleCodeChars: 32768, maxPresets: 128, nameMax: 48,
    slotRange: [1, 4], tierRange: [1, 3], reservedPresetId: 'baked_default', compactFromVersion: 6 });
  for (const slot of contract.slots) assert.equal(codec.valuesOf(settings, slot), slot.side === 'shared' ? settings.shared : settings.side[slot.side]);
});
