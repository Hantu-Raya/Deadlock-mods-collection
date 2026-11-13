'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { profile, launch, installCefBridge, CURRENT, PREVIOUS, evidenceRoot, transcript } = require('./storage-fixture');
const { loadLayout } = require('./boot-layout');

test('real menu edits persist to v3 keys across disk-backed restarts and rotate previous', t => {
  const baseline = launch(profile()); baseline.run(2000);
  const p = profile({ [CURRENT]: baseline.codec.encodeRecord({settings:baseline.settings(),presets:[]}), 'hantu.hpcolors.v2/state': 'v2-data', 'hantu.hpcolors.v2/state.prev': 'v2-backup', qollock_settings: 'keep' });
  const first = launch(p); first.run(2000); first.edit('#112233');
  assert.equal(first.status(), 'SAVING'); first.run(3000); assert.equal(first.status(), 'Saved');
  const original = p.disk.get(CURRENT);
  const second = launch(p); second.run(2000);
  assert.equal(second.settings().side.enemy.barColorLow, '#112233');
  second.edit('#445566'); second.run(3000);
  assert.equal(p.disk.get(PREVIOUS), original);
  const third = launch(p); third.run(2000); assert.equal(third.settings().side.enemy.barColorLow, '#445566');
  assert.equal(p.disk.get('hantu.hpcolors.v2/state'), 'v2-data'); assert.equal(p.disk.get('qollock_settings'), 'keep');
  assert.equal(p.disk.get('hantu.hpcolors.v2/state.prev'), 'v2-backup');
  for (const fixture of [first, second, third]) assert.ok(fixture.page.requests.filter(r => r.o === 'w').every(r => r.k === CURRENT));
  if (process.env.HPV3_DEBUG === '1') {
    for (const event of ['[HPV3] store read part', '[HPV3] store write part', '[HPV3] save Saved']) {
      assert.ok(first.harness.logs.some(line => line.startsWith(event)), event);
    }
  } else {
    t.diagnostic('debug log assertions not run: HPV3_DEBUG is not 1 (release and staged runs strip the log lines); asserting silence instead');
    assert.deepEqual(first.harness.logs, []);
  }
});

test('write gate waits for successful restore and preserves edits made before load', () => {
  const p = profile(); const f = launch(p, { navLatencySec: 3 });
  f.edit('#010203'); f.run(2000); assert.equal(f.page.writes, 0);
  f.run(5000); assert.equal(f.codec.classifyRecord(p.disk.get(CURRENT)).bundle.settings.side.enemy.barColorLow, '#010203');
});

for (const [label, options] of [
  ['no vkeys', { noVkeys: true }], ['no compare-at-commit', { capabilities: ['vkeys'] }], ['offline', { commit: false }],
  ['wrong protocol', { protocolVersion: 2 }], ['untrusted page', { readyHref: 'https://evil.invalid/' }],
  ['failed reads', { dropTitle: title => title.includes('"o":"r"') }],
]) test(`fails closed with ${label}`, () => {
  const p = profile(); const f = launch(p, options); f.edit('#010203'); f.run(40000);
  assert.equal(f.status(), 'UNAVAILABLE'); assert.equal(f.page.writes, 0);
  if (label === 'no vkeys' || label === 'no compare-at-commit') assert.equal(f.page.reads, 0);
  assert.equal(p.disk.has(CURRENT), false);
});

test('newer current save loads known settings, warns and cannot be overwritten by any edit', () => {
  const p = profile(); const seed = launch(p); seed.run(2000);
  const payload = Buffer.from(JSON.stringify({ v: 2, k: 'bundle', d: [[3, '#123456'], [999, true]], p: [] })).toString('base64url');
  const newer = `HPV2S1.${seed.codec.checksum(payload)}.${payload}`; p.disk.set(CURRENT, newer);
  const f = launch(p); f.run(2000);
  assert.equal(f.settings().side.enemy.barColorLow, '#123456'); assert.equal(f.status(), 'Save from a newer version');
  f.edit('#010203'); f.run(10000); assert.equal(f.page.writes, 0); assert.equal(p.disk.get(CURRENT), newer);
  let response; f.harness.$.HPColorsV3StorageFactory.create({ panel: f.harness.contextPanel.FindChildTraverse('HPColorsV3StorePanel') }).save({settings:f.settings(),presets:[]}, r => { response = r; });
  assert.equal(response.ok, false); assert.equal(response.error, 'not_loaded');
});

test('corrupt current restores previous without rotating corruption over it', () => {
  const p = profile(); const first = launch(p); first.run(2000); first.edit('#ABCDEF'); first.run(3000);
  const good = p.disk.get(CURRENT); p.disk.set(PREVIOUS, good); p.disk.set(CURRENT, 'corrupt');
  const f = launch(p); f.run(2000); assert.equal(f.settings().side.enemy.barColorLow, '#ABCDEF');
  f.edit('#123456'); f.run(3000); assert.equal(p.disk.get(PREVIOUS), good);
});

test('both corrupt records keep write gate closed', () => {
  const p = profile({ [CURRENT]: 'bad', [PREVIOUS]: 'also bad' }); const f = launch(p); f.run(2000);
  f.edit('#010203'); f.run(3000); assert.equal(f.page.writes, 0); assert.match(f.status(), /UNAVAILABLE/);
});

test('lost navigation is retried and blank events do not prove readiness', () => {
  const p = profile(); const f = launch(p, { deadUntilSec: 6, blankAtSec: 1 });
  f.run(12000); f.edit('#654321'); f.run(3000); assert.equal(f.status(), 'Saved'); assert.ok(f.page.urls.length >= 2);
});

test('lost read reply retries once; stale duplicate replies cannot advance chunks', () => {
  let dropped = false;
  const p = profile(); const f = launch(p, { echoLatencySec: null, duplicateReplies: true, dropTitle: title => {
    if (!dropped && title.includes('"o":"r"')) { dropped = true; return true; } return false;
  } });
  f.run(8000); f.edit('#654321'); f.run(3000); assert.equal(f.status(), 'Saved');
  assert.equal(f.codec.classifyRecord(p.disk.get(CURRENT)).bundle.settings.side.enemy.barColorLow, '#654321');
  assert.ok(f.page.reads >= 3, 'current read timeout is retried under a fresh id');
});

test('lost commit acknowledgement retries safely without rotating twice', () => {
  const p = profile(); const seed = launch(p); seed.run(2000); seed.edit('#112233'); seed.run(3000);
  const original = p.disk.get(CURRENT); let dropped = false;
  const f = launch(p, { echoLatencySec: null, dropTitle: title => {
    if (!dropped && title.includes('"d":1')) { dropped = true; return true; } return false;
  } });
  f.run(2000); f.edit('#445566'); f.run(6500); assert.equal(f.status(), 'RETRYING');
  f.run(10000); assert.equal(f.status(), 'Saved'); assert.equal(p.disk.get(PREVIOUS), original);
});

test('quota failures retry finitely and finish unavailable without discarding current', () => {
  const p = profile(); const seed = launch(p); seed.run(2000); seed.edit('#112233'); seed.run(3000);
  const original = p.disk.get(CURRENT); const f = launch(p, { quotaChars: 1 }); f.run(2000); f.edit('#445566'); f.run(40000);
  assert.equal(f.status(), 'UNAVAILABLE'); assert.equal(p.disk.get(CURRENT), original);
  assert.ok(f.page.writes > 1 && f.page.writes <= 4);
});

test('chunked bundles persist all presets; latest edits replace queued writes', () => {
  const p = profile(); const f = launch(p); f.run(2000);
  const controller = f.harness.$.HPColorsV3Persistence.create({
    bridge: f.harness.$.HPColorsV3StorageFactory.create({ panel: f.harness.contextPanel.FindChildTraverse('HPColorsV3StorePanel') }),
    onLoad() {}, onStatus() {},
  });
  controller.start(); f.run(2000);
  const bundle = { settings: f.settings(), presets: Array.from({ length: 64 }, (_, i) => ({ id: String(i), name: 'Preset ' + i + ' 雪'.repeat(20), settings: f.settings() })) };
  controller.change(bundle); f.run(1000);
  bundle.settings = JSON.parse(JSON.stringify(bundle.settings)); bundle.settings.side.enemy.barColorLow = '#001122';
  controller.change(bundle); f.run(10000);
  const loaded = f.codec.classifyRecord(p.disk.get(CURRENT)).bundle;
  assert.equal(loaded.presets.length, 64); assert.equal(loaded.settings.side.enemy.barColorLow, '#001122');
  assert.ok(f.page.requests.some(r => r.o === 'w' && r.n > 1));
});

test('oversize save refuses before writes with a clear player message', () => {
  const p = profile(); const f = launch(p); f.run(2000); let status = '';
  const controller = f.harness.$.HPColorsV3Persistence.create({
    bridge: f.harness.$.HPColorsV3StorageFactory.create({ panel: f.harness.contextPanel.FindChildTraverse('HPColorsV3StorePanel') }),
    onLoad() {}, onStatus(text) { status = text; },
  });
  controller.start(); f.run(2000);
  controller.change({ settings: f.settings(), presets: [{ id: 'big', name: 'x'.repeat(150000), settings: f.settings() }] });
  f.run(10000); assert.match(status, /192,000|fewer/); assert.equal(f.page.writes, 0);
});

test('menu copy/import controls round-trip codes and warn on future settings codes', () => {
  const p = profile(); const f = launch(p); f.run(2000);
  const panel = id => f.harness.contextPanel.FindChildTraverse(id);
  f.edit('#112233'); panel('HPColorsSettingsCopyButton').events.onactivate();
  const code = panel('HPColorsSettingsCodeEntry').text; assert.ok(code.startsWith('HPC3.'));
  f.edit('#AABBCC'); panel('HPColorsSettingsCodeEntry').text = code; panel('HPColorsSettingsImportButton').events.onactivate();
  assert.equal(f.settings().side.enemy.barColorLow, '#112233');
  const payload = Buffer.from(JSON.stringify({ v: 2, k: 'settings', d: [[3, '#010203'], [999, true]] })).toString('base64url');
  panel('HPColorsSettingsCodeEntry').text = `HPC3.${f.codec.checksum(payload)}.${payload}`;
  panel('HPColorsSettingsImportButton').events.onactivate();
  assert.equal(f.settings().side.enemy.barColorLow, '#010203'); assert.match(panel('HPColorsCodeStatus').text, /newer version/);
  panel('HPColorsBundleCopyButton').events.onactivate(); assert.ok(panel('HPColorsBundleCodeEntry').text.startsWith('HPC3.'));
  panel('HPColorsBundleImportButton').events.onactivate(); f.run(5000);
  assert.equal(f.status(), 'Saved');
});

test.after(() => {
  fs.writeFileSync(path.join(evidenceRoot, 'transcript.json'), JSON.stringify(transcript.map(item => ({
    status: item.status(), reads: item.page.reads, writes: item.page.writes, requests: item.page.requests, replies: item.page.replies,
  })), null, 2));
});

test('stale hello ids never open a write gate', () => {
  const p = profile(); const f = launch(p, { mutateReply(message) { if (message.o === 'ready') message.i = 'stale'; } });
  f.edit('#123456'); f.run(40000);
  assert.equal(f.status(), 'UNAVAILABLE'); assert.equal(f.page.reads, 0); assert.equal(f.page.writes, 0);
});

for (const [label, mutate] of [
  ['stale request id', message => { message.i = 'stale'; }],
  ['wrong chunk count', message => { message.n += 1; }],
  ['negative acknowledgement', message => { message.ok = false; }],
]) test(`does not report saved for ${label}`, () => {
  const p = profile(); const f = launch(p, { mutateReply(message) { if (message.o === 'w') mutate(message); } });
  f.run(2000); f.edit('#123456'); f.run(40000);
  assert.equal(f.status(), 'UNAVAILABLE'); assert.ok(f.page.writes > 1 && f.page.writes <= 4);
});

test('newer previous save blocks writes rather than repair a corrupt current', () => {
  const p = profile(); const seed = launch(p); seed.run(2000);
  const payload = Buffer.from(JSON.stringify({ v: seed.harness.$.HPColorsV3Settings.recordVersion+1, k: 'bundle', d: [[3, '#123456']], p: [] })).toString('base64url');
  const newer = `HPV2S1.${seed.codec.checksum(payload)}.${payload}`;
  p.disk.set(CURRENT, 'corrupt'); p.disk.set(PREVIOUS, newer);
  const f = launch(p); f.run(2000); f.edit('#654321'); f.run(5000);
  assert.equal(f.status(), 'Save from a newer version'); assert.equal(f.page.writes, 0);
  assert.equal(p.disk.get(CURRENT), 'corrupt'); assert.equal(p.disk.get(PREVIOUS), newer);
});

test('future body changes cannot fall back to an older previous save and overwrite', () => {
  const p = profile(); const seed = launch(p); seed.run(2000); seed.edit('#123456'); seed.run(3000);
  p.disk.set(PREVIOUS, p.disk.get(CURRENT));
  const payload = Buffer.from(JSON.stringify({ v: seed.harness.$.HPColorsV3Settings.recordVersion+1, k: 'future-format' })).toString('base64url');
  const newer = `HPV2S1.${seed.codec.checksum(payload)}.${payload}`; p.disk.set(CURRENT, newer);
  const f = launch(p); f.run(2000); f.edit('#654321'); f.run(5000);
  assert.equal(f.status(), 'Save from a newer version'); assert.equal(f.page.writes, 0); assert.equal(p.disk.get(CURRENT), newer);
});

test('edits during hydration retain saved settings that were not edited', () => {
  const p = profile(); const seed = launch(p); seed.run(2000);
  const saved = JSON.parse(JSON.stringify(seed.settings())); saved.shared.lowThreshold = 10;
  p.disk.set(CURRENT, seed.codec.encodeRecord({ settings: saved, presets: [{id:'keep',name:'Keep',settings:saved}] }));
  const f = launch(p, { navLatencySec: 3 }); f.edit('#654321'); f.run(7000);
  const bundle = f.codec.classifyRecord(p.disk.get(CURRENT)).bundle;
  assert.equal(bundle.settings.shared.lowThreshold, 10); assert.equal(bundle.settings.side.enemy.barColorLow, '#654321');
  assert.equal(bundle.presets.length, 1);
});

test('corrupt imported codes do not mutate published settings; a bundle in the settings box only adds presets', () => {
  const p = profile(); const f = launch(p); f.run(2000);
  const panel = id => f.harness.contextPanel.FindChildTraverse(id); f.edit('#123456');
  panel('HPColorsPresetSaveButton').events.onactivate(); panel('HPColorsBundleCopyButton').events.onactivate();
  const before = JSON.stringify(f.settings()), presets = f.harness.$.HPColorsV3Store.getBundle().presets.length;
  panel('HPColorsSettingsCodeEntry').text = 'HPC3.bad.bad'; panel('HPColorsSettingsImportButton').events.onactivate();
  assert.equal(JSON.stringify(f.settings()), before); assert.ok(panel('HPColorsCodeStatus').text);
  panel('HPColorsSettingsCodeEntry').text = panel('HPColorsBundleCodeEntry').text; panel('HPColorsSettingsImportButton').events.onactivate();
  assert.equal(JSON.stringify(f.settings()), before, 'a bundle never changes the current look');
  assert.equal(f.harness.$.HPColorsV3Store.getBundle().presets.length, presets * 2);
  assert.match(panel('HPColorsCodeStatus').text, /^Presets imported/);
});

// User report 2026-10-17: this settings code pasted into PRESET / BUNDLE CODE was refused with
// "Use the matching settings or bundle paste box for this code."
const USER_SETTINGS_CODE = 'HPC3.1c943aec.eyJ2IjoxMywiayI6InNldHRpbmdzIiwiZCI6WzYsdHJ1ZSw0OSwiY3VzdG9tIiw1NSwiI0ZGRkZGRiIsNjksdHJ1ZSw3MSwiI0ZGRkZGRiIsMTA0LHRydWUsMTA1LCIjRjVGRjAwIiwxNjAsZmFsc2UsMTY3LGZhbHNlLDE3MCxmYWxzZSwxNzMsZmFsc2VdfQ';
test('a settings code pasted into the bundle box applies, saves and undoes; REPLACE ALL explains it needs a bundle', () => {
  const p = profile(); const f = launch(p); f.run(2000);
  const panel = id => f.harness.contextPanel.FindChildTraverse(id);
  const before = JSON.stringify(f.settings()), presets = JSON.stringify(f.harness.$.HPColorsV3Store.getBundle().presets);
  assert.equal(f.settings().shared.damageShakeEnabled, true);
  panel('HPColorsBundleCodeEntry').text = USER_SETTINGS_CODE;
  panel('HPColorsBundleReplaceButton').events.onactivate();
  assert.equal(panel('HPColorsBundleReplaceDialog').BHasClass('Open'), false);
  assert.match(panel('HPColorsCodeStatus').text, /settings code.*IMPORT/);
  assert.equal(JSON.stringify(f.settings()), before);
  panel('HPColorsBundleImportButton').events.onactivate();
  assert.equal(panel('HPColorsCodeStatus').text, 'Settings code imported.');
  assert.equal(f.settings().shared.damageShakeEnabled, false);
  assert.equal(JSON.stringify(f.harness.$.HPColorsV3Store.getBundle().presets), presets, 'no preset is added');
  panel('HPColorsUndoButton').events.onactivate();
  assert.equal(JSON.stringify(f.settings()), before);
  // A broken settings code reports why it cannot be read, not the other box's kind mismatch.
  panel('HPColorsBundleCodeEntry').text = USER_SETTINGS_CODE.replace('1c943aec', '00000000');
  panel('HPColorsBundleImportButton').events.onactivate();
  assert.equal(JSON.stringify(f.settings()), before);
  assert.doesNotMatch(panel('HPColorsCodeStatus').text, /matching settings or bundle/);
  assert.ok(panel('HPColorsCodeStatus').BHasClass('ToneError'));
  panel('HPColorsBundleCodeEntry').text = USER_SETTINGS_CODE; panel('HPColorsBundleImportButton').events.onactivate();
  f.run(5000); assert.equal(f.status(), 'Saved');
  const restarted = launch(p); restarted.run(2000);
  assert.equal(restarted.settings().shared.damageShakeEnabled, false, 'the imported settings survive a restart');
});

// Codes copied from chat or web pages arrive with labels, Discord backticks, quotes, trailing punctuation,
// line breaks or zero-width characters. Every v3 and v2 code family imports from either box; the checksum
// (HPC3) or JSON (v2) still refuses a code that is actually damaged.
const HPCR2_CODE = 'HPCR2{"v":[[39,false]],"c":{},"hpv2":{"v":1,"values":[[74,"old"],[75,true]],"conditions":{}}}';
const HPCRP1_CODE = 'HPCRP1{"records":[{"id":"user_0001","kind":"user","name":"Bar style","mode":"all","heroes":[],"values":[[39,false]],"conditions":null,"hpv2":{"v":1,"values":[[74,"old"],[75,true]],"conditions":{}}}]}';
const PASTE_WRAPS = {
  label: c => 'code: ' + c, backticks: c => '`' + c + '`', codeblock: c => '```\n' + c + '\n```', quotes: c => '"' + c + '"',
  period: c => c + '.', wrapped: c => c.slice(0, 40) + '\n' + c.slice(40), zeroWidth: c => c.slice(0, 40) + '\u200b' + c.slice(40),
};
for (const [name, code, damaged] of [
  ['HPC3 settings', USER_SETTINGS_CODE, USER_SETTINGS_CODE.slice(0, 60) + (USER_SETTINGS_CODE[60] === 'A' ? 'B' : 'A') + USER_SETTINGS_CODE.slice(61)],
  ['HPCR2 settings', HPCR2_CODE, HPCR2_CODE.slice(0, -1)],
  ['HPCRP1 bundle', HPCRP1_CODE, HPCRP1_CODE.slice(0, -1)],
]) test(name + ' code wrapped by chat imports from either box; a damaged one is refused', () => {
  const p = profile(); const f = launch(p); f.run(2000);
  const panel = id => f.harness.contextPanel.FindChildTraverse(id), store = f.harness.$.HPColorsV3Store;
  const paste = (box, text) => { panel('HPColors' + box + 'CodeEntry').text = text; panel('HPColors' + box + 'ImportButton').events.onactivate(); };
  const look = () => JSON.stringify(f.settings()), count = () => store.getBundle().presets.length;
  const before = look(), bundle = name.endsWith('bundle');
  paste(bundle ? 'Bundle' : 'Settings', code);
  const expected = look(), added = count();
  if (bundle) assert.ok(added > 0); else { assert.notEqual(expected, before); panel('HPColorsUndoButton').events.onactivate(); }
  for (const [wrap, fn] of Object.entries(PASTE_WRAPS)) for (const box of ['Settings', 'Bundle']) {
    const presets = count();
    paste(box, fn(code));
    assert.ok(!panel('HPColorsCodeStatus').BHasClass('ToneError'), wrap + ' in ' + box + ': ' + panel('HPColorsCodeStatus').text);
    if (bundle) { assert.equal(count(), presets + added, wrap + ' in ' + box); assert.equal(look(), before); }
    else { assert.equal(look(), expected, wrap + ' in ' + box); panel('HPColorsUndoButton').events.onactivate(); assert.equal(look(), before); }
  }
  for (const box of ['Settings', 'Bundle']) {
    const presets = count();
    paste(box, damaged);
    assert.ok(panel('HPColorsCodeStatus').BHasClass('ToneError'), 'damaged code in ' + box);
    assert.equal(look(), before); assert.equal(count(), presets);
  }
});

test('disposed controllers cancel pending saves', () => {
  const p = profile(); const f = launch(p); f.run(2000);
  const controller = f.harness.$.HPColorsV3Persistence.create({
    panel: f.harness.contextPanel.FindChildTraverse('HPColorsV3StorePanel'), onLoad() {}, onStatus() {},
  });
  controller.start(); f.run(2000);
  controller.change({settings:f.settings(),presets:[]}); controller.dispose(); f.run(10000);
  assert.equal(f.page.writes, 0);
});

test('explicit bundle replacement preserves metadata and routing across subsequent menu edits and restart', () => {
  const p = profile(); const f = launch(p); f.run(2000);
  const bundle = { settings:f.settings(), presets:[{id:'one',name:'雪',hidden:true,settings:f.settings()}], routing:{default:'one'} };
  f.harness.$.HPColorsV3Store.replaceBundle(bundle);
  f.edit('#010203'); f.run(3000);
  const restored = launch(p); restored.run(2000); restored.edit('#040506'); restored.run(3000);
  const saved = restored.codec.classifyRecord(p.disk.get(CURRENT)).bundle;
  assert.equal(saved.presets[0].name,'雪'); assert.equal(saved.presets[0].hidden,true); assert.equal(saved.routing.default,'one');
});

test('reverting an early edit to defaults still overrides that saved setting', () => {
  const p = profile(); const seed = launch(p); seed.run(2000); seed.edit('#112233'); seed.run(3000);
  const f = launch(p, {navLatencySec:3});
  f.edit('#445566'); f.edit('#FD4949'); f.run(7000);
  assert.equal(f.codec.classifyRecord(p.disk.get(CURRENT)).bundle.settings.side.enemy.barColorLow,'#FD4949');
});

for (const kind of ['Settings', 'Bundle']) test(`a ${kind.toLowerCase()} code pasted before hydration uses its safe scope`, () => {
  const p = profile(); const seed = launch(p); seed.run(2000);
  const settings = JSON.parse(JSON.stringify(seed.settings())); settings.shared.lowThreshold=10;
  p.disk.set(CURRENT, seed.codec.encodeRecord({settings,presets:[{id:'old',name:'Old',settings}],routing:{default:'old'}}));
  const defaults = JSON.parse(JSON.stringify(seed.harness.$.HPColorsV3Settings.defaults));
  const code = kind === 'Settings' ? seed.harness.$.HPColorsV3Sharing.exportSettingsCode(defaults).code :
    seed.harness.$.HPColorsV3Sharing.exportBundleCode({settings:defaults,presets:[{id:'new',name:'New',settings:defaults}],routing:{default:'new'}}).code;
  const f = launch(p,{navLatencySec:3});
  f.harness.contextPanel.FindChildTraverse('HPColors'+kind+'CodeEntry').text=code;
  f.harness.contextPanel.FindChildTraverse('HPColors'+kind+'ImportButton').events.onactivate();
  f.run(7000);
  const bundle=f.codec.classifyRecord(p.disk.get(CURRENT)).bundle;
  assert.equal(bundle.settings.shared.lowThreshold,kind==='Settings'?25:10);
  assert.equal(bundle.presets[0].id,'old');
  assert.equal(bundle.routing.default,'old');
});

test('oversize bundle copy shows its refusal in the real menu without replacing the entry', () => {
  const p=profile(); const seed=launch(p); seed.run(2000);
  const bundle={settings:seed.settings(),presets:Array.from({length:128},(_,i)=>({id:String(i),name:'x'.repeat(300),settings:seed.settings()}))};
  p.disk.set(CURRENT,seed.codec.encodeRecord(bundle));
  const f=launch(p); f.run(4000);
  const entry=f.harness.contextPanel.FindChildTraverse('HPColorsBundleCodeEntry'); entry.text='keep existing text';
  f.harness.contextPanel.FindChildTraverse('HPColorsBundleCopyButton').events.onactivate();
  assert.equal(entry.text,'keep existing text'); assert.match(f.harness.contextPanel.FindChildTraverse('HPColorsCodeStatus').text,/32,768|fewer/);
});

function paste(fixture,kind,code) {
  const root=fixture.harness.contextPanel;
  root.FindChildTraverse('HPColors'+kind+'CodeEntry').text=code;
  root.FindChildTraverse('HPColors'+kind+'ImportButton').events.onactivate();
}

test('refused bundle then settings import before hydration retains saved presets',()=>{
  const p=profile();const seed=launch(p);seed.run(2000);
  p.disk.set(CURRENT,seed.codec.encodeRecord({settings:seed.settings(),presets:[{id:'old',name:'Old',settings:seed.settings()}]}));
  const f=launch(p,{navLatencySec:3});
  const bundle={settings:f.settings(),presets:[{id:'new',name:'New',settings:f.settings()}],routing:{default:'new'}};
  paste(f,'Bundle',f.harness.$.HPColorsV3Sharing.exportBundleCode(bundle).code);
  const settings=JSON.parse(JSON.stringify(f.settings()));settings.side.enemy.barColorLow='#010203';
  paste(f,'Settings',f.harness.$.HPColorsV3Sharing.exportSettingsCode(settings).code);
  f.run(8000);
  const saved=f.codec.classifyRecord(p.disk.get(CURRENT)).bundle;
  assert.equal(saved.presets[0].id,'old');assert.ok(!saved.routing);assert.equal(saved.settings.side.enemy.barColorLow,'#010203');
});

for(const phase of ['debounce','in-flight','retry']) test(`new menu root retains pending state during ${phase}`,()=>{
  const p=profile();const f=launch(p,{replyLatencySec:phase==='in-flight'?0.3:0.05,echoLatencySec:null});
  f.run(3000);
  const bundle={settings:JSON.parse(JSON.stringify(f.settings())),presets:Array.from({length:40},(_,i)=>({id:String(i),name:'Preset '+'雪'.repeat(30),settings:f.settings()})),routing:{default:'0'}};
  bundle.settings.side.enemy.barColorLow='#123456';
  if(phase==='retry') f.page.options.dropTitle=title=>title.includes('"o":"w"');
  f.harness.$.HPColorsV3Store.replaceBundle(bundle);
  f.run(phase==='debounce'?200:phase==='in-flight'?900:6000);
  if(phase==='retry') assert.equal(f.status(),'RETRYING');
  const next=f.reload();f.run(15000);
  const saved=f.codec.classifyRecord(p.disk.get(CURRENT)).bundle;
  assert.equal(saved.settings.side.enemy.barColorLow,'#123456');assert.equal(saved.presets.length,40);assert.equal(saved.routing.default,'0');
  assert.equal(f.settings().side.enemy.barColorLow,'#123456');assert.equal(f.status(),'Saved');
  assert.ok(next.writes>0);
});

test('root handoff before hydration retains saved library after refused replacement and settings import',()=>{
  const p=profile();const seed=launch(p);seed.run(2000);
  p.disk.set(CURRENT,seed.codec.encodeRecord({settings:seed.settings(),presets:[{id:'old',name:'Old',settings:seed.settings()}]}));
  const f=launch(p,{navLatencySec:3});
  const bundle={settings:f.settings(),presets:[{id:'new',name:'New',settings:f.settings()}],routing:{default:'new'}};
  paste(f,'Bundle',f.harness.$.HPColorsV3Sharing.exportBundleCode(bundle).code);
  paste(f,'Settings',f.harness.$.HPColorsV3Sharing.exportSettingsCode(f.settings()).code);
  f.run(200);f.reload();f.run(8000);
  const saved=f.codec.classifyRecord(p.disk.get(CURRENT)).bundle;
  assert.equal(saved.presets[0].id,'old');assert.ok(!saved.routing);
});

test('boot is LOADING until safe restore completes',()=>{
  const f=launch(profile(),{navLatencySec:3});
  assert.equal(f.status(),'LOADING');f.run(2000);assert.equal(f.status(),'LOADING');f.run(2000);assert.equal(f.status(),'Saved');
});

test('both unreadable records require explicit confirmation before recovery write',()=>{
  const p=profile({[CURRENT]:'bad',[PREVIOUS]:'also bad'});const f=launch(p);f.run(2000);f.edit('#123456');
  assert.equal(f.harness.$.HPColorsV3Store.resetUnreadableSave(false),false);f.run(2000);assert.equal(f.page.writes,0);
  const root=f.harness.contextPanel;
  root.FindChildTraverse('HPColorsResetSaveButton').events.onactivate();
  assert.equal(f.page.writes,0);
  root.FindChildTraverse('HPColorsResetSaveConfirmButton').events.onactivate();f.run(5000);
  assert.equal(f.status(),'Saved');assert.equal(f.codec.classifyRecord(p.disk.get(CURRENT)).bundle.settings.side.enemy.barColorLow,'#123456');
  assert.equal(p.disk.get(PREVIOUS),'also bad');assert.ok(f.page.requests.filter(r=>r.o==='w').every(r=>r.k===CURRENT));
});

test('confirmed recovery rechecks the disk and cannot overwrite a newer save',()=>{
  const p=profile({[CURRENT]:'bad',[PREVIOUS]:'also bad'});const f=launch(p);f.run(2000);
  const payload=Buffer.from(JSON.stringify({v:f.harness.$.HPColorsV3Settings.recordVersion+1,k:'bundle',d:[[3,'#123456']],p:[]})).toString('base64url');
  const newer=`HPV2S1.${f.codec.checksum(payload)}.${payload}`;p.disk.set(CURRENT,newer);
  f.harness.$.HPColorsV3Store.resetUnreadableSave(true);f.run(5000);
  assert.equal(f.page.writes,0);assert.equal(p.disk.get(CURRENT),newer);assert.equal(f.status(),'Save from a newer version');
});

test('transient failure re-probes after cooldown and saves later edits without accepting old replies',()=>{
  const p=profile();const f=launch(p,{echoLatencySec:null,dropTitle:title=>title.includes('"o":"w"')});
  f.run(2000);f.edit('#112233');f.run(40000);assert.equal(f.status(),'UNAVAILABLE');
  f.page.options.dropTitle=null;f.edit('#445566');f.run(8000);
  assert.equal(f.status(),'Saved');assert.equal(f.codec.classifyRecord(p.disk.get(CURRENT)).bundle.settings.side.enemy.barColorLow,'#445566');
  const hellos=f.page.requests.filter(r=>r.o==='hello');assert.ok(new Set(hellos.map(r=>r.i)).size>=2);
});

test('a missing-vkeys page can recover on a later edit but never wrote before reprobe',()=>{
  const p=profile();const f=launch(p,{noVkeys:true});f.run(2000);assert.equal(f.status(),'UNAVAILABLE');assert.equal(f.page.writes,0);
  f.page.options.noVkeys=false;f.run(10000);f.edit('#123456');f.run(8000);
  assert.equal(f.status(),'Saved');assert.equal(f.codec.classifyRecord(p.disk.get(CURRENT)).bundle.settings.side.enemy.barColorLow,'#123456');
});

test('invalid encode leaves the previous pending valid bundle intact',()=>{
  const p=profile();const f=launch(p);f.run(2000);let status='';
  const controller=f.harness.$.HPColorsV3Persistence.create({panel:f.harness.contextPanel.FindChildTraverse('HPColorsV3StorePanel'),onLoad(){},onStatus(text){status=text;}});
  controller.start();f.run(2000);
  const valid={settings:JSON.parse(JSON.stringify(f.settings())),presets:[]};valid.settings.side.enemy.barColorLow='#123456';
  controller.change(valid);controller.change({settings:valid.settings,presets:[{id:'bad',settings:valid.settings}]},'bundle');
  assert.match(status,/preset|names|settings/i);f.run(3000);
  assert.equal(f.codec.classifyRecord(p.disk.get(CURRENT)).bundle.settings.side.enemy.barColorLow,'#123456');
});

test('latest edit really supersedes a multi-chunk in-flight write at realistic latency',()=>{
  const p=profile();const f=launch(p,{replyLatencySec:0.3,echoLatencySec:null});f.run(3000);
  const bundle={settings:JSON.parse(JSON.stringify(f.settings())),presets:Array.from({length:40},(_,i)=>({id:String(i),name:'雪'.repeat(30),settings:f.settings()}))};
  bundle.settings.side.enemy.barColorLow='#112233';f.harness.$.HPColorsV3Store.replaceBundle(bundle);f.run(900);
  assert.equal(p.disk.has(CURRENT),false,'first write is still in flight');
  f.edit('#445566');f.run(15000);
  assert.equal(f.codec.classifyRecord(p.disk.get(CURRENT)).bundle.settings.side.enemy.barColorLow,'#445566');
  assert.equal(f.codec.classifyRecord(p.disk.get(PREVIOUS)).bundle.settings.side.enemy.barColorLow,'#112233');
});

test('page reload mid-write loses staging then retries the complete bundle',()=>{
  const p=profile();const f=launch(p,{replyLatencySec:0.3,echoLatencySec:null});f.run(3000);
  const bundle={settings:f.settings(),presets:Array.from({length:40},(_,i)=>({id:String(i),name:'雪'.repeat(30),settings:f.settings()}))};
  paste(f,'Bundle',f.harness.$.HPColorsV3Sharing.exportBundleCode(bundle).code);f.run(600);f.page.reloadPage();f.run(18000);
  assert.equal(f.status(),'Saved');assert.equal(f.codec.classifyRecord(p.disk.get(CURRENT)).bundle.presets.length,40);
  assert.ok(f.page.replies.some(reply=>String(reply.e).includes('missing_chunk')));
});

test('lost acknowledgement followed by a different edit preserves a valid backup',()=>{
  const p=profile();const seed=launch(p);seed.run(2000);seed.edit('#010203');seed.run(3000);const original=p.disk.get(CURRENT);
  let dropped=false;const f=launch(p,{echoLatencySec:null,dropTitle:title=>{if(!dropped&&title.includes('"d":1')){dropped=true;return true;}return false;}});
  f.run(2000);f.edit('#112233');f.run(1000);f.edit('#445566');f.run(15000);
  assert.equal(f.status(),'Saved');assert.equal(f.codec.classifyRecord(p.disk.get(CURRENT)).bundle.settings.side.enemy.barColorLow,'#445566');
  assert.equal(p.disk.get(PREVIOUS),original);
});

test('preset menu operations persist names/order/default visibility across real-page restarts and bundle-only import', () => {
  const p = profile();
  const first = launch(p); first.run(2000);
  const root = first.harness.contextPanel;
  const find = id => { const panel = root.FindChildTraverse(id); assert.ok(panel, id); return panel; };
  const activate = id => find(id).events.onactivate();
  const presets = require('./preset-controls').presetControls(find, activate);
  const save = name => { find('HPColorsPresetNameEntry').text = name; activate('HPColorsPresetSaveButton'); };
  save('First'); first.edit('#112233'); save('Second');
  presets.select(0).text = '  Renamed  '; activate('HPColorsPresetSelectedRenameButton');
  presets.preset(0, 'Down');
  activate('HPColorsPresetRestoreButton');
  presets.select('baked_default').text = 'Stock look'; activate('HPColorsPresetSelectedRenameButton');
  presets.preset('baked_default', 'Delete');
  activate('HPColorsBundleCopyButton');
  const bundleCode = find('HPColorsBundleCodeEntry').text;
  const copied = first.harness.$.HPColorsV3Sharing.importBundleCode(bundleCode);
  assert.equal(copied.ok, true);
  assert.deepEqual(Array.from(copied.bundle.presets, preset => preset.name), ['Second', 'Renamed']);
  assert.equal(copied.bundle.bakedPresetNameOverrides.baked_default, 'Stock look');
  assert.deepEqual(Array.from(copied.bundle.hiddenBakedPresetIds), ['baked_default']);
  first.run(5000); assert.equal(first.status(), 'Saved');
  const saved = first.codec.classifyRecord(p.disk.get(CURRENT)).bundle;
  assert.deepEqual(Array.from(saved.presets, preset => preset.name), ['Second', 'Renamed']);
  const second = launch(p); second.run(2000);
  const nextRoot = second.harness.contextPanel;
  const labels = nextRoot.FindChildTraverse('HPColorsPresetList').FindChildrenWithClassTraverse('HPC3PresetTileName');
  assert.deepEqual(labels.map(label => label.text), ['Stock look', 'Second', 'Renamed']);
  assert.equal(nextRoot.FindChildTraverse('HPColorsPresetDefault').BHasClass('HPC3Hidden'), true);
  assert.equal(nextRoot.FindChildTraverse('HPColorsPresetDefaultNameLabel').text, 'Stock look');
  const replacement = second.harness.$.HPColorsV3Store.getBundle();
  replacement.presets[0].name = 'Imported without changing settings';
  const importCode = second.harness.$.HPColorsV3Sharing.exportBundleCode(replacement);
  assert.equal(importCode.ok, true);
  paste(second, 'Bundle', importCode.code); second.run(5000);
  assert.deepEqual(Array.from(second.codec.classifyRecord(p.disk.get(CURRENT)).bundle.presets,preset=>preset.name),['Second','Renamed','Imported without changing settings','Renamed']);
  const third = launch(p); third.run(2000);
  assert.equal(third.harness.contextPanel.FindChildTraverse('HPColorsPresetList').FindChildrenWithClassTraverse('HPC3PresetTileName')[3].text, 'Imported without changing settings');
});

test('preset saving waits for hydration and refuses a near-full durable store atomically with a visible message', () => {
  const p = profile(); const seed = launch(p); seed.run(2000);
  const bundle = { settings: seed.settings(), presets: [], retained: '' };
  let low = 0, high = 192000;
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2); bundle.retained = 'x'.repeat(middle);
    let size = Infinity;
    try { size = seed.codec.encodeRecord(bundle).length; } catch (error) { /* Codec may enforce the cap itself. */ }
    if (size <= 191960) low = middle; else high = middle;
  }
  bundle.retained = 'x'.repeat(low);
  const original = seed.codec.encodeRecord(bundle); p.disk.set(CURRENT, original);
  const f = launch(p, { navLatencySec: 3 });
  const root = f.harness.contextPanel;
  const save = root.FindChildTraverse('HPColorsPresetSaveButton');
  save.events.onactivate();
  assert.match(root.FindChildTraverse('HPColorsPresetStatus').text, /load/i);
  assert.equal(f.page.writes, 0);
  f.run(12000); // Read >60 chunks after the delayed navigation, then test the save boundary.
  assert.equal(f.harness.$.HPColorsV3Store.isHydrated(), true);
  save.events.onactivate();
  assert.match(root.FindChildTraverse('HPColorsPresetStatus').text, /192,000/);
  assert.equal(f.harness.$.HPColorsV3Store.getBundle().presets.length, 0);
  f.run(5000);
  assert.equal(f.page.writes, 0); assert.equal(p.disk.get(CURRENT), original);
});

test('readonly future save rejects preset mutation atomically, leaving library and disk untouched',()=>{
  const p=profile();const seed=launch(p);seed.run(2000);
  const payload=Buffer.from(JSON.stringify({v:seed.harness.$.HPColorsV3Settings.recordVersion+1,k:'bundle',d:[],p:[{id:'future',name:'Future',d:[]}]})).toString('base64url');
  const original=`HPV2S1.${seed.codec.checksum(payload)}.${payload}`;p.disk.set(CURRENT,original);
  const f=launch(p);f.run(2000);const store=f.harness.$.HPColorsV3Store;
  const before=JSON.stringify(store.getBundle()),bundle=store.getBundle();bundle.presets=[];
  assert.equal(store.isHydrated(),true);
  assert.equal(store.canEditPresets(),false);
  assert.throws(()=>store.replaceBundle(bundle),/newer version/i);
  assert.equal(JSON.stringify(store.getBundle()),before);f.run(5000);assert.equal(f.page.writes,0);assert.equal(p.disk.get(CURRENT),original);
});

for(const count of [1,2]) test(`real-menu ${count===1?'single-preset':'bundle'} import never stores a user baked_default id`,()=>{
  const p=profile();const f=launch(p);f.run(2000);
  const presets=[{id:'baked_default',name:'Named copied default',settings:f.settings()}];
  if(count===2) presets.push({id:'other',name:'Other',settings:f.settings()});
  paste(f,'Bundle',f.harness.$.HPColorsV3Sharing.exportBundleCode({settings:f.settings(),presets}).code);
  f.run(3000);
  const saved=f.codec.classifyRecord(p.disk.get(CURRENT)).bundle;
  assert.equal(saved.presets.length,count);assert.equal(saved.presets[0].name,'Named copied default');
  assert.ok(saved.presets.every(item=>item.id!=='baked_default'));
  const restarted=launch(p);restarted.run(2000);
  const loaded=restarted.harness.$.HPColorsV3Store.getBundle();
  assert.equal(loaded.presets[0].id,saved.presets[0].id);assert.equal(loaded.presets[0].name,saved.presets[0].name);
});

test('canonicalized reserved ids are not rotated back into durable previous user records',()=>{
  const p=profile();const seed=launch(p);seed.run(2000);
  const previous=seed.codec.encodeRecord({settings:seed.settings(),presets:[]});p.disk.set(PREVIOUS,previous);
  const payload=Buffer.from(JSON.stringify({v:1,k:'bundle',d:[],p:[{id:'baked_default',name:'Copied',d:[]}]})).toString('base64url');
  p.disk.set(CURRENT,`HPV2S1.${seed.codec.checksum(payload)}.${payload}`);
  const f=launch(p);f.run(2000);f.edit('#123456');f.run(3000);
  assert.ok(f.codec.classifyRecord(p.disk.get(CURRENT)).bundle.presets.every(item=>item.id!=='baked_default'));
  assert.equal(p.disk.get(PREVIOUS),previous);
});

// Audit F1/F2 (audit-full-astra-2026-10-15): reincluding the storage script must retire and hand off
// the previous store; the page must refuse to replace a current record that changed since load.
const enemyLow = (f, record) => f.codec.classifyRecord(record).bundle.settings.side.enemy.barColorLow;
function bigBundle(f, color) {
  const settings = JSON.parse(JSON.stringify(f.settings())); settings.side.enemy.barColorLow = color;
  return { settings, presets: Array.from({ length: 40 }, (_, i) => ({ id: String(i), name: '雪'.repeat(30), settings: f.settings() })) };
}
function futureRecord(f, from) {
  const parts = (from || f.codec.encodeRecord({ settings: f.settings(), presets: [] })).split('.');
  const wire = JSON.parse(Buffer.from(parts[2], 'base64url').toString());
  wire.v = 999; wire.b = { futureOnly: 'DO NOT LOSE' };
  parts[2] = Buffer.from(JSON.stringify(wire)).toString('base64url'); parts[1] = f.codec.checksum(parts[2]);
  const record = parts.join('.'); assert.equal(f.codec.classifyRecord(record).kind, 'newer'); return record;
}
// Requests sent after `mark` belong to the replacement store: no message id, logical id or id prefix
// may repeat one used before, so stale page snapshots and echoed replies cannot match new work.
function assertFreshIds(f, mark) {
  const before = f.page.requests.slice(0, mark), after = f.page.requests.slice(mark);
  const ids = f.page.requests.map(r => r.i); assert.equal(new Set(ids).size, ids.length, 'message ids are unique');
  const prefix = id => id.slice(0, id.lastIndexOf('-') + 1);
  const oldPrefixes = new Set(before.map(r => prefix(r.i))), oldLogical = new Set(before.map(r => r.r).filter(Boolean));
  assert.ok(after.length > 0, 'replacement store talked to the page');
  for (const r of after) {
    assert.equal(oldPrefixes.has(prefix(r.i)), false, `retired bridge sent ${r.i} after reinclusion`);
    if (r.r) assert.equal(oldLogical.has(r.r), false, `logical id ${r.r} reused across store incarnations`);
  }
}

test('audit F1: whole-layout reinclusion with a save debounce outstanding hands off the draft and retires the old writer', () => {
  const p = profile(); const f = launch(p); f.run(2000); f.edit('#112233'); f.run(1000);
  assert.equal(f.status(), 'Saved');
  f.edit('#445566'); const mark = f.page.requests.length;
  f.includeScripts(); f.onload(); f.run(300);
  assert.equal(f.settings().side.enemy.barColorLow, '#445566', 'unsaved draft survives reinclusion');
  f.run(10000);
  assert.equal(f.status(), 'Saved'); assert.equal(enemyLow(f, p.disk.get(CURRENT)), '#445566');
  f.edit('#778899'); f.run(10000);
  assert.equal(f.status(), 'Saved'); assert.equal(enemyLow(f, p.disk.get(CURRENT)), '#778899');
  assert.equal(f.settings().side.enemy.barColorLow, '#778899');
  assertFreshIds(f, mark);
});

test('audit F1: reinclusion with a multi-chunk write and its replies outstanding hands off the bundle', () => {
  const p = profile(); const f = launch(p, { replyLatencySec: 0.3 }); f.run(3000);
  f.harness.$.HPColorsV3Store.replaceBundle(bigBundle(f, '#112233')); f.run(900);
  assert.equal(p.disk.has(CURRENT), false, 'first write is still in flight');
  assert.ok(f.page.requests.some(r => r.o === 'w' && r.n > 1), 'a chunked write is outstanding');
  const mark = f.page.requests.length;
  f.includeScripts(); f.onload(); f.run(20000);
  assert.equal(f.status(), 'Saved');
  const saved = f.codec.classifyRecord(p.disk.get(CURRENT)).bundle;
  assert.equal(saved.presets.length, 40); assert.equal(saved.settings.side.enemy.barColorLow, '#112233');
  assert.equal(f.settings().side.enemy.barColorLow, '#112233');
  assert.equal(f.harness.$.HPColorsV3Store.getBundle().presets.length, 40, 'bundle metadata handed off');
  assertFreshIds(f, mark);
});

test('audit F1: reinclusion with the hydration read reply outstanding keeps pre-hydration edits sparse', () => {
  const p = profile(); const seed = launch(p); seed.run(2000);
  const stored = JSON.parse(JSON.stringify(seed.settings())); stored.side.ally.barColorLow = '#0A0B0C';
  p.disk.set(CURRENT, seed.codec.encodeRecord({ settings: stored, presets: [] }));
  // Hello is answered at 1.1 s; the read reply is produced then but its title lands at 1.4 s.
  const f = launch(p, { replyLatencySec: 0.3 }); f.run(1200);
  assert.ok(f.page.requests.some(r => r.o === 'r'), 'read sent');
  assert.equal(f.harness.$.HPColorsV3Store.isHydrated(), false, 'read reply outstanding');
  f.edit('#445566'); const mark = f.page.requests.length;
  f.includeScripts(); f.onload(); f.run(10000);
  assert.equal(f.status(), 'Saved');
  const saved = f.codec.classifyRecord(p.disk.get(CURRENT)).bundle.settings;
  assert.equal(saved.side.enemy.barColorLow, '#445566'); assert.equal(saved.side.ally.barColorLow, '#0A0B0C');
  assert.equal(f.settings().side.ally.barColorLow, '#0A0B0C');
  assertFreshIds(f, mark);
});

test('audit F2: a newer record written after hydration is refused at commit, reloaded read-only and kept', () => {
  const p = profile(); const f = launch(p); f.run(2000); f.edit('#112233'); f.run(1000);
  const future = futureRecord(f, p.disk.get(CURRENT)); p.disk.set(CURRENT, future);
  f.edit('#445566'); f.run(10000);
  assert.equal(p.disk.get(CURRENT), future, 'newer record never overwritten');
  assert.ok(f.page.replies.some(r => r.o === 'w' && /conflict/.test(String(r.e))), 'the page refused the stale commit');
  assert.equal(f.status(), 'Save from a newer version');
  f.edit('#778899'); f.run(10000);
  assert.equal(p.disk.get(CURRENT), future); assert.equal(f.status(), 'Save from a newer version');
});

test('audit F2: a same-version change between load and commit is reloaded and only this session\'s edits reapplied', () => {
  const p = profile(); const f = launch(p); f.run(2000); f.edit('#112233'); f.run(1000);
  const other = f.codec.classifyRecord(p.disk.get(CURRENT)).bundle; other.settings.side.ally.barColorLow = '#0A0B0C';
  p.disk.set(CURRENT, f.codec.encodeRecord(other));
  f.edit('#445566'); f.run(10000);
  const saved = f.codec.classifyRecord(p.disk.get(CURRENT)).bundle.settings;
  assert.equal(saved.side.enemy.barColorLow, '#445566'); assert.equal(saved.side.ally.barColorLow, '#0A0B0C', 'other writer kept');
  assert.equal(f.settings().side.ally.barColorLow, '#0A0B0C', 'menu shows the reloaded record');
  assert.match(f.status(), /^Saved; .*elsewhere/);
});

test('audit F2: a newer record written during a multi-chunk write is refused at the final chunk', () => {
  const p = profile(); const f = launch(p, { replyLatencySec: 0.3, echoLatencySec: null }); f.run(3000);
  f.harness.$.HPColorsV3Store.replaceBundle(bigBundle(f, '#112233')); f.run(900);
  assert.equal(p.disk.has(CURRENT), false, 'write still in flight');
  assert.ok(f.page.requests.some(r => r.o === 'w' && r.n > 1));
  const future = futureRecord(f); p.disk.set(CURRENT, future); f.run(20000);
  assert.equal(p.disk.get(CURRENT), future); assert.equal(p.disk.has(PREVIOUS), false);
  assert.ok(f.page.replies.some(r => r.o === 'w' && /conflict/.test(String(r.e))));
  assert.equal(f.status(), 'Save from a newer version');
});

test('audit F1: reincluding only the storage script resumes on the live menu with fresh ids', () => {
  const { runInVm, sourceRoot } = require('./boot-layout');
  const p = profile(); const f = launch(p); f.run(2000); f.edit('#112233'); f.run(1000);
  f.edit('#445566'); const mark = f.page.requests.length;
  runInVm(fs.readFileSync(path.join(sourceRoot, 'panorama/scripts/hp_colors_v3_storage.js'), 'utf8'), f.context, 'hp_colors_v3_storage.js');
  f.run(10000);
  assert.equal(f.status(), 'Saved'); assert.equal(enemyLow(f, p.disk.get(CURRENT)), '#445566', 'outstanding draft saved once');
  f.edit('#778899'); f.run(10000);
  assert.equal(f.status(), 'Saved'); assert.equal(enemyLow(f, p.disk.get(CURRENT)), '#778899', 'later edits reach the new store');
  assertFreshIds(f, mark);
});

test('audit F2: a confirmed reset is cancelled when the save is repaired between load and commit', () => {
  const p = profile({ [CURRENT]: 'bad', [PREVIOUS]: 'also bad' }); const f = launch(p); f.run(2000);
  f.edit('#123456'); f.harness.$.HPColorsV3Store.resetUnreadableSave(true); f.run(350);
  assert.equal(f.page.writes, 0, 'reset write not yet sent');
  const repaired = f.codec.encodeRecord({ settings: f.settings(), presets: [{ id: 'theirs', name: 'Theirs', settings: f.settings() }] });
  p.disk.set(CURRENT, repaired); f.run(10000);
  assert.equal(p.disk.get(CURRENT), repaired, 'repaired record never replaced by the stale reset');
  assert.ok(f.page.replies.some(r => r.o === 'w' && /conflict/.test(String(r.e))));
  assert.equal(f.status(), 'Saved data changed; reset cancelled');
});

test('audit F2: our own unacknowledged commit is not reported as a change saved elsewhere', () => {
  const p = profile(); const seed = launch(p); seed.run(2000); seed.edit('#010203'); seed.run(3000);
  let dropped = false;
  const f = launch(p, { echoLatencySec: null, dropTitle: title => {
    if (!dropped && title.includes('"d":1')) { dropped = true; return true; } return false;
  } });
  f.run(2000); f.edit('#112233'); f.run(1000); f.edit('#445566'); f.run(15000);
  assert.ok(f.page.replies.some(r => r.o === 'w' && /conflict/.test(String(r.e))), 'the stale expectation was refused');
  assert.equal(f.status(), 'Saved'); assert.equal(enemyLow(f, p.disk.get(CURRENT)), '#445566');
});

// Fix audit m3: these use the actual menu/layout, storage script and pinned page.
const copy = value => JSON.parse(JSON.stringify(value));
const savedBundle = (f, p) => f.codec.classifyRecord(p.disk.get(CURRENT)).bundle;
// An ally setting the player can always edit (ally bar colors grey out while Player bar colors is off).
// An ally row that is usable with the default ally settings (ally colors are off, so the ally feedback colors
// are greyed since 2026-11-02).
function editAlly(f, width) {
  const row = f.harness.$.HPColorsV3Settings.controls.find(c => c.key === 'barWidth' && c.side === 'ally');
  const entry = f.harness.contextPanel.FindChildTraverse(row.entryId);
  entry.text = String(width); entry.events.ontextentrysubmit();
}
function addPreset(bundle, id) { bundle.presets.push({ id, name: id, settings: copy(bundle.settings) }); return bundle; }
function assertDraftConflict(f, p, remoteBytes, draft, overlaps) {
  const store = f.harness.$.HPColorsV3Store;
  assert.equal(p.disk.get(CURRENT), remoteBytes, 'overlap keeps the remote bytes intact');
  assert.deepEqual(store.getBundle(), draft, 'overlap keeps the complete unsaved local draft');
  assert.deepEqual(copy(store.decodeBundleCode(store.exportBundleCode(f.settings()))), draft, 'conflict draft is exportable');
  assert.match(f.status(), /^CONFLICT:.*local draft not saved.*export your draft/);
  for (const overlap of overlaps) assert.ok(f.status().includes(overlap), 'status names ' + overlap);
  const writes = f.page.writes; f.run(180000);
  assert.equal(f.page.writes, writes, 'overlap never retries automatically');
  assert.equal(p.disk.get(CURRENT), remoteBytes);
}

test('audit M1: hydration establishes the baseline; never-local slots do not overwrite another writer', () => {
  const p = profile(), seed = launch(p); seed.run(2000); seed.edit('#123456'); seed.run(1000);
  const f = launch(p); f.run(2000);
  const remote = savedBundle(f, p); remote.settings.side.enemy.barColorLow = '#654321';
  p.disk.set(CURRENT, f.codec.encodeRecord(remote)); editAlly(f, 90); f.run(5000);
  assert.equal(savedBundle(f, p).settings.side.enemy.barColorLow, '#654321');
  assert.equal(savedBundle(f, p).settings.side.ally.barWidth, 90);
});
test('audit M1: acknowledged edits are not reapplied on a later conflict', () => {
  const p = profile(), a = launch(p); a.run(2000); a.edit('#112233'); a.run(1000);
  const b = launch(p); b.run(2000); b.edit('#445566'); b.run(1000);
  editAlly(a, 90); a.run(5000);
  assert.equal(savedBundle(a, p).settings.side.enemy.barColorLow, '#445566');
});
test('audit M1: an acknowledged preset operation does not leave bundle scope sticky', () => {
  const p = profile(), f = launch(p); f.run(2000);
  f.harness.$.HPColorsV3Store.replaceBundle(addPreset(f.harness.$.HPColorsV3Store.getBundle(), 'mine')); f.run(1000);
  const remote = addPreset(savedBundle(f, p), 'theirs'); remote.settings.side.ally.barColorLow = '#AABBCC';
  p.disk.set(CURRENT, f.codec.encodeRecord(remote)); f.edit('#112233'); f.run(5000);
  assert.deepEqual(savedBundle(f, p).presets.map(p => p.id), ['mine', 'theirs']);
  assert.equal(savedBundle(f, p).settings.side.ally.barColorLow, '#AABBCC');
});
test('audit M1: acknowledgement clears only work sent, retaining same-slot edits made in flight', () => {
  const p = profile(), f = launch(p, { replyLatencySec: 0.3, echoLatencySec: null }); f.run(3000);
  f.edit('#112233'); f.run(600); f.edit('#445566'); f.run(300);
  const remote = savedBundle(f, p); remote.settings.side.ally.barColorLow = '#AABBCC';
  p.disk.set(CURRENT, f.codec.encodeRecord(remote)); f.run(7000);
  assert.equal(savedBundle(f, p).settings.side.enemy.barColorLow, '#445566');
  assert.equal(savedBundle(f, p).settings.side.ally.barColorLow, '#AABBCC');
});
test('audit M2: reinclusion during a conflict read preserves the actual delta and foreign settings', () => {
  const p = profile(), f = launch(p, { replyLatencySec: 0.3, echoLatencySec: null }); f.run(3000);
  f.edit('#112233'); f.run(1000);
  const remote = savedBundle(f, p); remote.settings.side.ally.barColorLow = '#AABBCC';
  p.disk.set(CURRENT, f.codec.encodeRecord(remote)); f.edit('#778899'); f.run(850);
  assert.equal(f.status(), 'LOADING'); f.includeScripts(); f.onload(); f.run(10000);
  assert.equal(savedBundle(f, p).settings.side.enemy.barColorLow, '#778899');
  assert.equal(savedBundle(f, p).settings.side.ally.barColorLow, '#AABBCC');
});
test('audit M2: confirmed reset is cancelled by a repaired record across reinclusion', () => {
  const p = profile({ [CURRENT]: 'bad', [PREVIOUS]: 'also bad' }), f = launch(p); f.run(2000);
  f.edit('#112233'); f.harness.$.HPColorsV3Store.resetUnreadableSave(true); f.run(350);
  const repaired = f.codec.encodeRecord(addPreset({ settings: f.settings(), presets: [] }, 'theirs'));
  p.disk.set(CURRENT, repaired); f.includeScripts(); f.onload(); f.run(10000);
  assert.equal(p.disk.get(CURRENT), repaired); assert.equal(f.status(), 'Saved data changed; reset cancelled');
});
test('audit M2: bridge renewal after UNAVAILABLE reconciles outstanding edits with the new record', () => {
  const p = profile(), f = launch(p, { quotaChars: 0, echoLatencySec: null }); f.run(2000);
  f.edit('#112233'); f.run(40000); assert.equal(f.status(), 'UNAVAILABLE');
  const remote = { settings: copy(f.settings()), presets: [] }; remote.settings.side.ally.barColorLow = '#AABBCC';
  p.disk.set(CURRENT, f.codec.encodeRecord(remote)); f.page.options.quotaChars = Infinity;
  f.edit('#778899'); f.run(12000);
  assert.equal(savedBundle(f, p).settings.side.enemy.barColorLow, '#778899');
  assert.equal(savedBundle(f, p).settings.side.ally.barColorLow, '#AABBCC');
});
test('audit M3: outstanding preset edits merge stable identities rather than replacing the library', () => {
  const p = profile(), f = launch(p); f.run(2000); f.edit('#112233'); f.run(1000);
  f.harness.$.HPColorsV3Store.replaceBundle(addPreset(f.harness.$.HPColorsV3Store.getBundle(), 'mine'));
  const remote = addPreset(savedBundle(f, p), 'theirs'); remote.settings.side.ally.barColorLow = '#AABBCC';
  p.disk.set(CURRENT, f.codec.encodeRecord(remote)); f.run(6000);
  assert.deepEqual(savedBundle(f, p).presets.map(p => p.id).sort(), ['mine', 'theirs']);
  assert.equal(savedBundle(f, p).settings.side.ally.barColorLow, '#AABBCC');
});
test('audit M3: concurrent changes to one preset keep remote bytes and the exportable local draft', () => {
  const p = profile(), f = launch(p); f.run(2000);
  f.harness.$.HPColorsV3Store.replaceBundle(addPreset(f.harness.$.HPColorsV3Store.getBundle(), 'same')); f.run(1000);
  const local = f.harness.$.HPColorsV3Store.getBundle(); local.presets[0].name = 'Local';
  f.harness.$.HPColorsV3Store.replaceBundle(local);
  const remote = savedBundle(f, p); remote.presets[0].name = 'Remote'; p.disk.set(CURRENT, f.codec.encodeRecord(remote));
  f.run(6000); assert.equal(savedBundle(f, p).presets[0].name, 'Remote');
  assertDraftConflict(f, p, f.codec.encodeRecord(remote), local, ['preset same']);
});
test('audit M3: settings imports merge changed slots without silently reverting concurrent settings', () => {
  const p = profile(), f = launch(p); f.run(2000); f.edit('#112233'); f.run(1000);
  const imported = copy(f.settings()); imported.side.enemy.barColorLow = '#778899';
  paste(f, 'Settings', f.harness.$.HPColorsV3Sharing.exportSettingsCode(imported).code);
  const remote = savedBundle(f, p); remote.settings.side.ally.barColorLow = '#AABBCC';
  p.disk.set(CURRENT, f.codec.encodeRecord(remote)); f.run(6000);
  assert.equal(savedBundle(f, p).settings.side.enemy.barColorLow, '#778899');
  assert.equal(savedBundle(f, p).settings.side.ally.barColorLow, '#AABBCC');
});
test('audit M5: an UNAVAILABLE draft retries automatically when cas becomes available without another edit', () => {
  const p = profile(), f = launch(p, { capabilities: ['vkeys'] }); f.run(2000);
  f.edit('#112233'); f.run(2000); assert.equal(f.page.reads, 0); assert.equal(f.page.writes, 0);
  f.page.options.capabilities = ['vkeys', 'cas']; f.run(75000);
  assert.equal(f.status(), 'Saved'); assert.equal(savedBundle(f, p).settings.side.enemy.barColorLow, '#112233');
});

test('audit M2: unchanged corrupt bytes retain confirmed reset authority across handoff', () => {
  const p = profile({ [CURRENT]: 'bad', [PREVIOUS]: 'also bad' }), f = launch(p); f.run(2000);
  f.edit('#112233'); f.harness.$.HPColorsV3Store.resetUnreadableSave(true); f.run(350);
  f.includeScripts(); f.onload(); f.run(10000);
  assert.equal(f.status(), 'Saved'); assert.equal(savedBundle(f, p).settings.side.enemy.barColorLow, '#112233');
});

test('audit M3: preset rename and order survive handoff while preserving remote-only presets', () => {
  const p = profile(), f = launch(p); f.run(2000);
  const bundle = addPreset(addPreset({ settings: f.settings(), presets: [] }, 'first'), 'second');
  f.harness.$.HPColorsV3Store.replaceBundle(bundle); f.run(1000);
  const local = f.harness.$.HPColorsV3Store.getBundle(); local.presets.reverse(); local.presets[0].name = 'Renamed';
  f.harness.$.HPColorsV3Store.replaceBundle(local);
  const remote = addPreset(savedBundle(f, p), 'theirs'); p.disk.set(CURRENT, f.codec.encodeRecord(remote));
  f.includeScripts(); f.onload(); f.run(6000);
  assert.deepEqual(savedBundle(f, p).presets.map(p => p.id), ['second', 'first', 'theirs']);
  assert.equal(savedBundle(f, p).presets[0].name, 'Renamed');
});

test('audit M3: settings import before hydration visibly names its full saved-settings replacement scope', () => {
  const p = profile(), seed = launch(p); seed.run(2000);
  const remote = { settings: copy(seed.settings()), presets: [] }; remote.settings.side.ally.barColorLow = '#AABBCC';
  p.disk.set(CURRENT, seed.codec.encodeRecord(remote));
  const f = launch(p, { navLatencySec: 3 });
  paste(f, 'Settings', f.harness.$.HPColorsV3Sharing.exportSettingsCode(f.settings()).code); f.run(8000);
  assert.equal(savedBundle(f, p).settings.side.ally.barColorLow, f.harness.$.HPColorsV3Settings.defaults.side.ally.barColorLow);
  assert.match(f.status(), /settings import replaced all saved settings/i);
});

for (const laterEdit of ['rename', 'delete']) {
  for (const recovery of ['reinclusion', 'lost acknowledgement', 'acknowledged reply']) {
    test(`audit R2-1: ${laterEdit} after an own unacknowledged preset commit survives ${recovery}`, () => {
      const p = profile(), f = launch(p, { replyLatencySec: 0.3, echoLatencySec: null }); f.run(3000);
      const store = () => f.harness.$.HPColorsV3Store;
      store().replaceBundle(addPreset(store().getBundle(), 'p0')); f.run(3000);
      const original = p.disk.get(CURRENT);
      let dropped = false;
      if (recovery === 'lost acknowledgement') f.page.options.dropTitle = title => {
        if (!dropped && title.includes('"d":1')) { dropped = true; return true; }
        return false;
      };
      const first = store().getBundle(); first.presets[0].name = 'First'; first.v2pending = { first: true };
      store().replaceBundle(first); f.run(600);
      const firstCommit = p.disk.get(CURRENT);
      assert.equal(savedBundle(f, p).presets[0].name, 'First', 'commit landed before its acknowledgement');
      assert.equal(f.status(), 'SAVING');
      const later = store().getBundle();
      if (laterEdit === 'rename') later.presets[0].name = 'Second'; else later.presets = [];
      later.v2pending = { second: true };
      store().replaceBundle(later); f.edit('#445566');
      if (recovery === 'reinclusion') { f.includeScripts(); f.onload(); }
      f.run(15000);
      const expectedNames = laterEdit === 'rename' ? ['Second'] : [];
      assert.deepEqual(savedBundle(f, p).presets.map(p => p.name), expectedNames);
      assert.deepEqual(store().getBundle().presets.map(p => p.name), expectedNames);
      assert.deepEqual(savedBundle(f, p).v2pending, { second: true });
      assert.deepEqual(store().getBundle().v2pending, { second: true });
      assert.equal(savedBundle(f, p).settings.side.enemy.barColorLow, '#445566');
      assert.equal(f.settings().side.enemy.barColorLow, '#445566', 'later scalar edit is not acknowledged early');
      assert.equal(f.status(), 'Saved', 'own commit is neither a remote change nor a preset conflict');
      assert.equal(p.disk.get(PREVIOUS), recovery === 'acknowledged reply' ? firstCommit : original,
        'only acknowledged commits become eligible for the next backup rotation');
    });
  }
}

for (const localOperation of ['add', 'reorder']) {
  test(`audit R2-2: local ${localOperation} merges with independent remote ${localOperation === 'add' ? 'reorder' : 'addition'} without a lost-work warning`, () => {
    const p = profile(), f = launch(p); f.run(2000);
    const store = () => f.harness.$.HPColorsV3Store;
    store().replaceBundle(addPreset(addPreset(store().getBundle(), 'p0'), 'p1')); f.run(1000);
    const local = store().getBundle(), remote = savedBundle(f, p);
    if (localOperation === 'add') { addPreset(local, 'local'); remote.presets.reverse(); }
    else { local.presets.reverse(); addPreset(remote, 'remote'); }
    store().replaceBundle(local); p.disk.set(CURRENT, f.codec.encodeRecord(remote)); f.run(8000);
    const expectedIds = ['p1', 'p0', localOperation === 'add' ? 'local' : 'remote'];
    assert.deepEqual(savedBundle(f, p).presets.map(p => p.id), expectedIds);
    assert.deepEqual(store().getBundle().presets.map(p => p.id), expectedIds);
    assert.equal(f.status(), 'Saved; merged a change saved elsewhere');
  });
}

test('audit R2-2: competing relative preset reorders preserve both versions without writing', () => {
  const p = profile(), f = launch(p); f.run(2000);
  const store = () => f.harness.$.HPColorsV3Store;
  store().replaceBundle(addPreset(addPreset(addPreset(store().getBundle(), 'p0'), 'p1'), 'p2')); f.run(1000);
  const local = store().getBundle(), remote = savedBundle(f, p);
  local.presets = [local.presets[1], local.presets[0], local.presets[2]];
  remote.presets.reverse();
  store().replaceBundle(local); p.disk.set(CURRENT, f.codec.encodeRecord(remote)); f.run(8000);
  assert.deepEqual(savedBundle(f, p).presets.map(p => p.id), ['p2', 'p1', 'p0']);
  assertDraftConflict(f, p, f.codec.encodeRecord(remote), local, ['preset order']);
});

test('audit R2-2: a rejected deletion does not reorder the retained remote preset', () => {
  const p = profile(), f = launch(p); f.run(2000);
  const store = () => f.harness.$.HPColorsV3Store;
  store().replaceBundle(addPreset(addPreset(addPreset(store().getBundle(), 'p0'), 'p1'), 'p2')); f.run(1000);
  const local = store().getBundle(), remote = savedBundle(f, p);
  local.presets.shift(); remote.presets[0].name = 'Remote';
  store().replaceBundle(local); p.disk.set(CURRENT, f.codec.encodeRecord(remote)); f.run(8000);
  assert.deepEqual(savedBundle(f, p).presets.map(p => p.id), ['p0', 'p1', 'p2']);
  assert.equal(savedBundle(f, p).presets[0].name, 'Remote');
  assertDraftConflict(f, p, f.codec.encodeRecord(remote), local, ['preset p0']);
});

test('audit R2-1: handoff during a replacement chunk retains the earlier lost-ack commit identity', () => {
  const p = profile(), f = launch(p, { replyLatencySec: 0.3, echoLatencySec: null }); f.run(3000);
  const store = () => f.harness.$.HPColorsV3Store;
  store().replaceBundle(addPreset(store().getBundle(), 'p0')); f.run(3000);
  let dropped = false;
  f.page.options.dropTitle = title => {
    if (!dropped && title.includes('"d":1')) { dropped = true; return true; }
    return false;
  };
  const first = store().getBundle(); first.presets[0].name = 'First';
  store().replaceBundle(first); f.run(600);
  const later = store().getBundle(); later.presets[0].name = 'Second';
  for (let i = 0; i < 40; i++) {
    addPreset(later, 'additional-' + i); later.presets[i + 1].name += ' 雪'.repeat(20);
  }
  store().replaceBundle(later); f.run(5300);
  assert.ok(f.page.requests.some(r => r.o === 'w' && r.n > 1), 'replacement chunk is outstanding');
  assert.equal(savedBundle(f, p).presets[0].name, 'First', 'earlier own commit is still current');
  f.includeScripts(); f.onload(); f.run(20000);
  assert.equal(savedBundle(f, p).presets[0].name, 'Second');
  assert.equal(savedBundle(f, p).presets.length, 41);
  assert.equal(store().getBundle().presets[0].name, 'Second');
  assert.equal(f.status(), 'Saved');
});

for (const laterEdit of ['rename', 'delete', 'preset settings']) {
  test(`audit R2-1: later ${laterEdit} stays exportable when a foreign addition obscures own identity before the handoff read`, () => {
    const p = profile(), f = launch(p, { replyLatencySec: 0.3, echoLatencySec: null }); f.run(3000);
    const store = () => f.harness.$.HPColorsV3Store;
    const seed = addPreset(store().getBundle(), 'p0'); seed.presets[0].name = 'Original';
    store().replaceBundle(seed); f.run(3000);
    const first = store().getBundle(); first.presets[0].name = 'First'; first.v2pending = { first: true };
    store().replaceBundle(first); f.run(600);
    assert.equal(savedBundle(f, p).presets[0].name, 'First');
    const later = store().getBundle(); later.v2pending = { second: true };
    if (laterEdit === 'rename') later.presets[0].name = 'Second';
    else if (laterEdit === 'delete') later.presets = [];
    else later.presets[0].settings.side.enemy.barColorLow = '#123456';
    store().replaceBundle(later); f.edit('#445566'); const draft = store().getBundle();
    f.includeScripts(); f.onload();
    const remote = addPreset(savedBundle(f, p), 'remote');
    remote.settings.side.ally.barColorLow = '#AABBCC';
    p.disk.set(CURRENT, f.codec.encodeRecord(remote)); f.run(10000);
    assertDraftConflict(f, p, f.codec.encodeRecord(remote), draft, ['preset p0', 'metadata v2pending']);
  });
}

function advanceUntil(f, predicate, message) {
  for (let i = 0; i < 400 && !predicate(); i++) f.run(25);
  assert.ok(predicate(), message);
}

for (const acknowledgements of ['delivered', 'lost']) {
  for (const inclusions of [0, 1, 2]) {
    for (const boundary of ['own reply', 'conflict reply', 'conflict read reply', 'reconciled read']) {
      test(`audit R3: ${acknowledgements} own ack; ${inclusions} reinclusions at ${boundary}`, () => {
        const p = profile(), f = launch(p, { replyLatencySec: 0.3, echoLatencySec: null }); f.run(3000);
        const store = () => f.harness.$.HPColorsV3Store;
        const seed = addPreset(store().getBundle(), 'p0'); seed.presets[0].name = 'Original';
        store().replaceBundle(seed); f.run(3000);
        let dropped = false;
        if (acknowledgements === 'lost') f.page.options.dropTitle = title => {
          if (!dropped && title.includes('"d":1')) { dropped = true; return true; }
          return false;
        };
        const first = store().getBundle(); first.presets[0].name = 'First'; first.v2pending = { first: true };
        store().replaceBundle(first); f.run(600);
        assert.equal(savedBundle(f, p).presets[0].name, 'First');
        const later = store().getBundle(); later.presets[0].name = 'Second'; later.v2pending = { second: true };
        store().replaceBundle(later); f.edit('#445566');
        const draft = store().getBundle();
        const reads = f.page.requests.filter(r => r.o === 'r').length;
        const remote = addPreset(savedBundle(f, p), 'remote');
        remote.settings.side.ally.barColorLow = '#AABBCC';
        p.disk.set(CURRENT, f.codec.encodeRecord(remote));
        if (boundary !== 'own reply') advanceUntil(f,
          () => f.page.replies.some(r => r.o === 'w' && /conflict/.test(String(r.e))), 'conflict reply outstanding');
        if (boundary === 'conflict read reply' || boundary === 'reconciled read') advanceUntil(f,
          () => f.page.requests.filter(r => r.o === 'r').length > reads, 'conflict read reply outstanding');
        if (boundary === 'reconciled read') advanceUntil(f,
          () => store().getBundle().presets.some(p => p.id === 'remote') || /^CONFLICT:/.test(f.status()), 'foreign read reconciled or refused');
        for (let i = 0; i < inclusions; i++) {
          if (i) f.run(350); // The replacement hello has replied; its read reply is still outstanding.
          f.includeScripts(); f.onload();
        }
        f.run(20000);
        if (acknowledgements === 'lost' || (inclusions > 0 && boundary === 'own reply')) {
          assertDraftConflict(f, p, f.codec.encodeRecord(remote), draft, ['preset p0', 'metadata v2pending']);
          return;
        }
        assert.deepEqual(savedBundle(f, p).presets.map(p => p.name), ['Second', 'remote']);
        assert.deepEqual(store().getBundle().presets.map(p => p.name), ['Second', 'remote']);
        assert.deepEqual(savedBundle(f, p).v2pending, { second: true });
        assert.deepEqual(store().getBundle().v2pending, { second: true });
        assert.equal(savedBundle(f, p).settings.side.enemy.barColorLow, '#445566');
        assert.equal(savedBundle(f, p).settings.side.ally.barColorLow, '#AABBCC');
        assert.equal(f.status(), 'Saved; merged a change saved elsewhere');
        const writes = f.page.writes; f.run(180000);
        assert.equal(f.page.writes, writes, 'settled interleaving does not restart obsolete work');
      });
    }
  }
}

for (const inclusions of [0, 1, 2]) {
  test(`audit R3: a genuinely different remote preset/metadata edit preserves both versions with ${inclusions} reinclusions`, () => {
    const p = profile(), f = launch(p, { replyLatencySec: 0.3, echoLatencySec: null }); f.run(3000);
    const store = () => f.harness.$.HPColorsV3Store;
    store().replaceBundle(addPreset(store().getBundle(), 'p0')); f.run(3000);
    const first = store().getBundle(); first.presets[0].name = 'First'; first.v2pending = { first: true };
    store().replaceBundle(first); f.run(600);
    const later = store().getBundle(); later.presets[0].name = 'Second'; later.v2pending = { second: true };
    store().replaceBundle(later);
    const remote = addPreset(savedBundle(f, p), 'remote'); remote.presets[0].name = 'Third'; remote.v2pending = { third: true };
    p.disk.set(CURRENT, f.codec.encodeRecord(remote));
    for (let i = 0; i < inclusions; i++) { if (i) f.run(350); f.includeScripts(); f.onload(); }
    f.run(20000);
    assert.deepEqual(savedBundle(f, p).presets.map(p => p.name), ['Third', 'remote']);
    assert.deepEqual(savedBundle(f, p).v2pending, { third: true });
    assertDraftConflict(f, p, f.codec.encodeRecord(remote), later, ['preset p0', 'metadata v2pending']);
  });

  test(`audit R3: later reorder after an unacknowledged reorder survives foreign addition and ${inclusions} reinclusions`, () => {
    const p = profile(), f = launch(p, { replyLatencySec: 0.3, echoLatencySec: null }); f.run(3000);
    const store = () => f.harness.$.HPColorsV3Store;
    store().replaceBundle(addPreset(addPreset(addPreset(store().getBundle(), 'p0'), 'p1'), 'p2')); f.run(3000);
    const first = store().getBundle(); first.presets.reverse();
    store().replaceBundle(first); f.run(600);
    const later = store().getBundle(); later.presets = [later.presets[1], later.presets[0], later.presets[2]];
    store().replaceBundle(later);
    const remote = addPreset(savedBundle(f, p), 'remote'); p.disk.set(CURRENT, f.codec.encodeRecord(remote));
    for (let i = 0; i < inclusions; i++) { if (i) f.run(350); f.includeScripts(); f.onload(); }
    f.run(20000);
    if (inclusions > 0) {
      assertDraftConflict(f, p, f.codec.encodeRecord(remote), later, ['preset order']);
      return;
    }
    assert.deepEqual(savedBundle(f, p).presets.map(p => p.id), ['p1', 'p2', 'p0', 'remote']);
    assert.equal(f.status(), 'Saved; merged a change saved elsewhere');
  });
}

for (const inclusions of [0, 1, 2]) {
  for (const undo of ['rename and metadata', 'addition', 'order']) {
    test(`audit R3: undo ${undo} after an unacknowledged commit survives foreign addition and ${inclusions} reinclusions`, () => {
      const p = profile(), f = launch(p, { replyLatencySec: 0.3, echoLatencySec: null }); f.run(3000);
      const store = () => f.harness.$.HPColorsV3Store;
      const seed = addPreset(addPreset(addPreset(store().getBundle(), 'p0'), 'p1'), 'p2');
      store().replaceBundle(seed); f.run(3000);
      const original = store().getBundle(), first = copy(original);
      if (undo === 'rename and metadata') { first.presets[0].name = 'First'; first.v2pending = { first: true }; }
      else if (undo === 'addition') addPreset(first, 'temporary');
      else first.presets.reverse();
      store().replaceBundle(first); f.run(600);
      store().replaceBundle(original);
      const remote = addPreset(savedBundle(f, p), 'remote'); p.disk.set(CURRENT, f.codec.encodeRecord(remote));
      for (let i = 0; i < inclusions; i++) { if (i) f.run(350); f.includeScripts(); f.onload(); }
      f.run(20000);
      if (inclusions > 0) {
        assertDraftConflict(f, p, f.codec.encodeRecord(remote), original,
          [undo === 'order' ? 'preset order' : undo === 'addition' ? 'preset temporary' : 'preset p0']);
        return;
      }
      assert.deepEqual(savedBundle(f, p).presets.map(p => p.id), ['p0', 'p1', 'p2', 'remote']);
      assert.equal(savedBundle(f, p).presets[0].name, 'p0');
      assert.equal(Object.hasOwn(savedBundle(f, p), 'v2pending'), false);
      assert.deepEqual(store().getBundle().presets.map(p => p.id), ['p0', 'p1', 'p2', 'remote']);
      assert.equal(f.status(), 'Saved; merged a change saved elsewhere');
    });
  }
}

for (const inclusions of [0, 1, 2]) {
  for (const readRace of ['stale current', 'backup']) {
    test(`audit R3: ${readRace} reply with a lost own acknowledgement and ${inclusions} reinclusions`, () => {
      const p = profile(), f = launch(p, { replyLatencySec: 0.3, echoLatencySec: null }); f.run(3000);
      const store = () => f.harness.$.HPColorsV3Store;
      store().replaceBundle(addPreset(store().getBundle(), 'p0')); f.run(3000);
      let dropped = false;
      f.page.options.dropTitle = title => {
        if (!dropped && title.includes('"d":1')) { dropped = true; return true; }
        return false;
      };
      const first = store().getBundle(); first.presets[0].name = 'First'; first.v2pending = { first: true };
      store().replaceBundle(first); f.run(600);
      const later = store().getBundle(); later.presets[0].name = 'Second'; later.v2pending = { second: true };
      store().replaceBundle(later);
      const remote = addPreset(savedBundle(f, p), 'remote'), reads = f.page.requests.filter(r => r.o === 'r').length;
      p.disk.set(CURRENT, readRace === 'backup' ? 'damaged' : f.codec.encodeRecord(remote));
      if (readRace === 'backup') p.disk.set(PREVIOUS, f.codec.encodeRecord(remote));
      advanceUntil(f, () => f.page.requests.filter(r => r.o === 'r').length > reads &&
        (readRace !== 'backup' || f.page.requests.at(-1).k === PREVIOUS), 'target read snapshot produced; reply outstanding');
      if (readRace === 'stale current') {
        addPreset(remote, 'late'); p.disk.set(CURRENT, f.codec.encodeRecord(remote));
      }
      const remoteBytes = p.disk.get(CURRENT);
      for (let i = 0; i < inclusions; i++) { if (i) f.run(350); f.includeScripts(); f.onload(); }
      f.run(20000);
      assertDraftConflict(f, p, remoteBytes, later, ['preset p0', 'metadata v2pending']);
    });
  }

  test(`audit R3: overlapping merge stays refused through ${inclusions} reinclusions and capacity-only draft repair`, () => {
    const p = profile(), f = launch(p, { replyLatencySec: 0.3, echoLatencySec: null }); f.run(3000);
    const store = () => f.harness.$.HPColorsV3Store;
    const seed = store().getBundle();
    for (let i = 0; i < 127; i++) addPreset(seed, 'p' + i);
    store().replaceBundle(seed); f.run(5000);
    const first = store().getBundle(); first.presets[0].name = 'First'; first.v2pending = { first: true };
    store().replaceBundle(first);
    advanceUntil(f, () => savedBundle(f, p).presets[0].name === 'First', 'chunked own commit landed');
    const later = addPreset(store().getBundle(), 'local'); later.presets[0].name = 'Second'; later.v2pending = { second: true };
    store().replaceBundle(later); f.includeScripts(); f.onload();
    const remote = addPreset(savedBundle(f, p), 'remote'), remoteBytes = f.codec.encodeRecord(remote);
    p.disk.set(CURRENT, remoteBytes);
    advanceUntil(f, () => /^CONFLICT:/.test(f.status()), 'overlap refused before capacity handling');
    assert.equal(p.disk.get(CURRENT), remoteBytes, 'refusal never overwrites either durable record');
    for (let i = 0; i < inclusions; i++) { f.includeScripts(); f.onload(); f.run(2000); }
    const repaired = store().getBundle(); repaired.presets = repaired.presets.filter(p => p.id !== 'local');
    store().replaceBundle(repaired); f.run(20000);
    assertDraftConflict(f, p, remoteBytes, repaired, ['preset p0', 'metadata v2pending']);
  });
}

for (const inclusions of [0, 1, 2]) {
  test(`audit R3: failed reads preserve the own delta through UNAVAILABLE renewal and ${inclusions} reinclusions`, () => {
    const p = profile(), f = launch(p, { replyLatencySec: 0.3, echoLatencySec: null }); f.run(3000);
    const store = () => f.harness.$.HPColorsV3Store;
    store().replaceBundle(addPreset(store().getBundle(), 'p0')); f.run(3000);
    let dropped = false, dropReads = true;
    f.page.options.dropTitle = title => {
      if (dropReads && title.includes('"o":"r"')) return true;
      if (!dropped && title.includes('"d":1')) { dropped = true; return true; }
      return false;
    };
    const first = store().getBundle(); first.presets[0].name = 'First'; first.v2pending = { first: true };
    store().replaceBundle(first); f.run(600);
    const later = store().getBundle(); later.presets[0].name = 'Second'; later.v2pending = { second: true };
    store().replaceBundle(later);
    const remote = addPreset(savedBundle(f, p), 'remote'); p.disk.set(CURRENT, f.codec.encodeRecord(remote));
    for (let i = 0; i < inclusions; i++) { if (i) f.run(350); f.includeScripts(); f.onload(); }
    f.run(40000); assert.equal(f.status(), 'UNAVAILABLE');
    dropReads = false; f.run(75000);
    assertDraftConflict(f, p, f.codec.encodeRecord(remote), later, ['preset p0', 'metadata v2pending']);
  });

  test(`audit R3: a newer record still closes the write gate across ${inclusions} own-commit reinclusions`, () => {
    const p = profile(), f = launch(p, { replyLatencySec: 0.3, echoLatencySec: null }); f.run(3000);
    const store = () => f.harness.$.HPColorsV3Store;
    store().replaceBundle(addPreset(store().getBundle(), 'p0')); f.run(3000);
    const first = store().getBundle(); first.presets[0].name = 'First';
    store().replaceBundle(first); f.run(600);
    const later = store().getBundle(); later.presets[0].name = 'Second'; store().replaceBundle(later);
    const future = futureRecord(f, p.disk.get(CURRENT)); p.disk.set(CURRENT, future);
    const previous = p.disk.get(PREVIOUS);
    for (let i = 0; i < inclusions; i++) { if (i) f.run(350); f.includeScripts(); f.onload(); }
    f.run(20000);
    assert.equal(p.disk.get(CURRENT), future); assert.equal(p.disk.get(PREVIOUS), previous);
    assert.equal(f.status(), 'Save from a newer version');
    const writes = f.page.writes; f.edit('#445566'); f.run(180000);
    assert.equal(f.page.writes, writes); assert.equal(p.disk.get(CURRENT), future);
  });
}

for (const operation of ['rename', 'delete', 'metadata', 'order']) {
  test(`audit R4-1: incomplete ${operation} candidate cannot authorize overwriting a second writer`, () => {
    const p = profile(), a = launch(p, { replyLatencySec: 0.3, echoLatencySec: null }); a.run(3000);
    const store = () => a.harness.$.HPColorsV3Store;
    const seed = addPreset(addPreset(addPreset(store().getBundle(), 'p0'), 'p1'), 'p2');
    store().replaceBundle(seed); a.run(3000);
    const b = launch(p); b.run(2000);
    const original = p.disk.get(CURRENT), first = store().getBundle();
    if (operation === 'rename') first.presets[0].name = 'First';
    else if (operation === 'delete') first.presets.shift();
    else if (operation === 'metadata') first.v2pending = { first: true };
    else first.presets.reverse();
    for (let i = 0; i < 40; i++) {
      addPreset(first, 'extra' + i); first.presets.at(-1).name += ' 雪'.repeat(20);
    }
    store().replaceBundle(first); a.run(600);
    assert.equal(p.disk.get(CURRENT), original, 'candidate never committed');
    assert.ok(a.page.requests.some(r => r.o === 'w' && r.p === 0 && r.n > 1));
    const later = store().getBundle();
    if (operation === 'rename') later.presets[0].name = 'Second';
    else if (operation === 'delete') later.presets.unshift(copy(seed.presets[0]));
    else if (operation === 'metadata') later.v2pending = { second: true };
    else [later.presets[0], later.presets[1]] = [later.presets[1], later.presets[0]];
    store().replaceBundle(later); a.includeScripts(); a.onload();
    const remote = b.harness.$.HPColorsV3Store.getBundle();
    if (operation === 'rename') remote.presets[0].name = 'First';
    else if (operation === 'delete') remote.presets.shift();
    else if (operation === 'metadata') remote.v2pending = { first: true };
    else remote.presets.reverse();
    addPreset(remote, 'remote'); b.harness.$.HPColorsV3Store.replaceBundle(remote); b.run(2000);
    assert.equal(b.status(), 'Saved');
    const remoteBytes = p.disk.get(CURRENT); a.run(20000);
    assert.equal(p.disk.get(CURRENT), remoteBytes, 'overlap never writes over the remote record');
    assert.deepEqual(store().getBundle(), later, 'entire local draft stays available');
    const exported = store().decodeBundleCode(store().exportBundleCode(a.settings()));
    assert.deepEqual(copy(exported), later, 'unsaved draft remains exportable');
    assert.match(a.status(), /CONFLICT.*local draft not saved/i);
    assert.match(a.status(), operation === 'metadata' ? /metadata v2pending/ : operation === 'order' ? /preset order/ : /preset p0/);
    const writes = a.page.writes; a.run(180000);
    assert.equal(a.page.writes, writes, 'overlap has no automatic retry');
    assert.equal(p.disk.get(CURRENT), remoteBytes);
  });
}

for (const inclusions of [0, 1, 2]) {
  test(`audit R5: disjoint capacity refusal and repair survive ${inclusions} reinclusions`, () => {
    const p = profile(), f = launch(p); f.run(2000);
    const store = () => f.harness.$.HPColorsV3Store, seed = store().getBundle();
    for (let i = 0; i < 127; i++) addPreset(seed, 'p' + i);
    store().replaceBundle(seed); f.run(3000);
    const local = addPreset(store().getBundle(), 'local'), remote = addPreset(savedBundle(f, p), 'remote');
    store().replaceBundle(local);
    const remoteBytes = f.codec.encodeRecord(remote); p.disk.set(CURRENT, remoteBytes);
    f.run(5000); assert.match(f.status(), /preset limits; export your draft/);
    for (let i = 0; i < inclusions; i++) { f.includeScripts(); f.onload(); f.run(2000); }
    assert.equal(p.disk.get(CURRENT), remoteBytes); assert.deepEqual(store().getBundle(), local);
    assert.deepEqual(copy(store().decodeBundleCode(store().exportBundleCode(f.settings()))), local);
    const writes = f.page.writes; f.run(180000); assert.equal(f.page.writes, writes);
    const repaired = store().getBundle(); repaired.presets = repaired.presets.filter(p => p.id !== 'local');
    store().replaceBundle(repaired); f.run(5000);
    assert.equal(savedBundle(f, p).presets.length, 128);
    assert.ok(savedBundle(f, p).presets.some(p => p.id === 'remote'));
    assert.equal(f.status(), 'Saved; merged a change saved elsewhere');
  });
}

test('audit R5: matching foreign values are still overlaps, and the status lists every overlapping entity', () => {
  const p = profile(), f = launch(p); f.run(2000);
  const store = () => f.harness.$.HPColorsV3Store;
  store().replaceBundle(addPreset(addPreset(addPreset(store().getBundle(), 'p0'), 'p1'), 'p2')); f.run(1000);
  const local = store().getBundle(); local.presets[0].name = 'Same'; local.v2pending = { same: true }; local.presets.reverse();
  store().replaceBundle(local); f.edit('#445566'); const draft = store().getBundle();
  const remote = addPreset(copy(draft), 'remote'); remote.settings.side.enemy.barColorLow = '#123456';
  const remoteBytes = f.codec.encodeRecord(remote); p.disk.set(CURRENT, remoteBytes); f.run(5000);
  assertDraftConflict(f, p, remoteBytes, draft, ['preset p0', 'metadata v2pending', 'preset order']);
});

function recoveryDraft(presetCount, remoteExtras) {
  const p = profile(), a = launch(p); a.run(2000);
  const find = (f, id) => f.harness.contextPanel.FindChildTraverse(id);
  const click = (f, id) => find(f, id).events.onactivate();
  if (presetCount) {
    find(a, 'HPColorsPresetNameEntry').text = 'Original';
    click(a, 'HPColorsPresetSaveButton'); a.run(2000);
  }
  const b = launch(p); b.run(2000);
  click(a, 'HPColorsPresetDefault'); find(a, 'HPColorsPresetSelectedNameEntry').text = 'Local Default';
  click(a, 'HPColorsPresetSelectedRenameButton'); a.edit('#112233');
  click(b, 'HPColorsPresetDefault'); find(b, 'HPColorsPresetSelectedNameEntry').text = 'Remote Default';
  click(b, 'HPColorsPresetSelectedRenameButton');
  if (remoteExtras) {
    find(b, 'HPColorsPresetNameEntry').text = 'Remote addition';
    click(b, 'HPColorsPresetSaveButton');
  }
  b.run(2000); const remoteBytes = p.disk.get(CURRENT); a.run(8000);
  assert.match(a.status(), /^CONFLICT:.*metadata bakedPresetNameOverrides/);
  assert.equal(p.disk.get(CURRENT), remoteBytes);
  const draft = a.harness.$.HPColorsV3Store.getBundle();
  click(a, 'HPColorsBundleCopyButton');
  const code = find(a, 'HPColorsBundleCodeEntry').text;
  assert.equal(draft.settings.side.enemy.barColorLow, '#112233');
  assert.equal(draft.bakedPresetNameOverrides.baked_default, 'Local Default');
  return { p, a, b, find, click, code, draft };
}

for (const presetCount of [0, 1]) {
  for (const remoteExtras of [0, 1]) {
    test(`audit R5-1: conflict draft with ${presetCount} presets round-trips through confirmed menu recovery over ${remoteExtras} remote additions`, () => {
      const { p, a, find, click, code, draft } = recoveryDraft(presetCount, remoteExtras);
      const fresh = launch(p); fresh.run(2000);
      const before = p.disk.get(CURRENT), writes = fresh.page.writes;
      const current = fresh.harness.$.HPColorsV3Store.getBundle();
      paste(fresh, 'Bundle', code); fresh.run(5000);
      const message = find(fresh, 'HPColorsCodeStatus').text;
      if (!presetCount) {
        assert.doesNotMatch(message, /imported/i, 'empty append must not claim a successful import');
        assert.match(message, /REPLACE ALL.*active settings.*metadata/i);
        assert.equal(fresh.page.writes, writes); assert.equal(p.disk.get(CURRENT), before);
      } else {
        assert.match(message, /presets imported.*settings and metadata unchanged.*REPLACE ALL/i);
        const appended = savedBundle(fresh, p);
        assert.equal(appended.presets.length, current.presets.length + 1);
        for (const preset of current.presets) assert.ok(appended.presets.some(p => p.id === preset.id), 'ordinary import preserves saved identities');
        assert.deepEqual(appended.settings, current.settings);
        assert.deepEqual(appended.bakedPresetNameOverrides, current.bakedPresetNameOverrides);
      }
      assert.match(a.status(), /Bundle COPY.*REPLACE ALL/, 'conflict names the usable export/restore controls');
      const beforeRestore = p.disk.get(CURRENT), restoreWrites = fresh.page.writes;
      click(fresh, 'HPColorsBundleReplaceButton');
      assert.ok(find(fresh, 'HPColorsBundleReplaceDialog').BHasClass('Open'));
      assert.match(find(fresh, 'HPColorsBundleReplaceMessage').text, /active settings.*metadata.*overwrites.*saved presets.*another window/i);
      fresh.run(1000); assert.equal(p.disk.get(CURRENT), beforeRestore, 'opening confirmation never restores');
      click(fresh, 'HPColorsBundleReplaceCancelButton'); fresh.run(1000);
      assert.equal(p.disk.get(CURRENT), beforeRestore); assert.equal(fresh.page.writes, restoreWrites, 'Cancel never writes');
      click(fresh, 'HPColorsBundleReplaceButton'); click(fresh, 'HPColorsBundleReplaceConfirmButton');
      assert.equal(p.disk.get(CURRENT), beforeRestore, 'confirmed restore still uses the save debounce/bridge');
      fresh.run(5000); assert.equal(fresh.status(), 'Saved');
      assert.deepEqual(copy(savedBundle(fresh, p)), copy(draft), 'settings, metadata, stable preset identities and order all restore');
      assert.equal(p.disk.get(PREVIOUS), beforeRestore, 'confirmed replacement rotates the prior complete record');
      const restarted = launch(p); restarted.run(2000);
      assert.deepEqual(copy(restarted.harness.$.HPColorsV3Store.getBundle()), copy(draft));
      assert.equal(find(restarted, 'HPColorsPresetDefaultNameLabel').text, 'Local Default');
      assert.equal(restarted.settings().side.enemy.barColorLow, '#112233');
    });
  }
}

for (const competingChange of ['metadata', 'addition']) {
  test(`audit R5-1: confirmed recovery still compares at commit against a later remote ${competingChange}`, () => {
    const { p, b, find, click, code, draft } = recoveryDraft(0, 1);
    const fresh = launch(p); fresh.run(2000);
    find(fresh, 'HPColorsBundleCodeEntry').text = code;
    click(fresh, 'HPColorsBundleReplaceButton');
    assert.ok(find(fresh, 'HPColorsBundleReplaceDialog').BHasClass('Open'));
    if (competingChange === 'metadata') {
      click(b, 'HPColorsPresetDefault'); find(b, 'HPColorsPresetSelectedNameEntry').text = 'Third Default';
      click(b, 'HPColorsPresetSelectedRenameButton');
      find(b, 'HPColorsPresetNameEntry').text = 'Late addition';
      click(b, 'HPColorsPresetSaveButton');
    } else {
      // Append a preset without also changing the automatic-name metadata: this race is disjoint.
      const late = b.harness.$.HPColorsV3Sharing.exportBundleCode({
        settings: b.settings(), presets: [{ id: 'late', name: 'Late addition', settings: b.settings() }],
      });
      paste(b, 'Bundle', late.code);
    }
    b.run(2000);
    const remoteBytes = p.disk.get(CURRENT);
    click(fresh, 'HPColorsBundleReplaceConfirmButton');
    const recoveredDraft = fresh.harness.$.HPColorsV3Store.getBundle();
    assert.deepEqual(copy(recoveredDraft), copy(draft));
    fresh.run(8000);
    assert.ok(fresh.page.replies.some(r => r.o === 'w' && /conflict/.test(String(r.e))), 'page refused the stale expected record');
    if (competingChange === 'metadata') {
      assertDraftConflict(fresh, p, remoteBytes, recoveredDraft, ['metadata bakedPresetNameOverrides']);
    } else {
      const restored = savedBundle(fresh, p);
      assert.equal(restored.settings.side.enemy.barColorLow, '#112233');
      assert.equal(restored.bakedPresetNameOverrides.baked_default, 'Local Default');
      assert.deepEqual(restored.presets.map(p => p.name), ['Late addition'], 'confirmation never silently removes a newly observed remote-only preset');
      assert.equal(fresh.status(), 'Saved; merged a change saved elsewhere');
    }
  });
}

test('audit R5-1: a metadata/settings-only conflict export restores through the confirmed controls into an empty profile', () => {
  const { find, click, code, draft } = recoveryDraft(0, 0), p = profile(), fresh = launch(p); fresh.run(2000);
  paste(fresh, 'Bundle', code); fresh.run(1000);
  assert.equal(p.disk.has(CURRENT), false);
  assert.doesNotMatch(find(fresh, 'HPColorsCodeStatus').text, /imported/i);
  click(fresh, 'HPColorsBundleReplaceButton'); click(fresh, 'HPColorsBundleReplaceConfirmButton'); fresh.run(5000);
  assert.equal(fresh.status(), 'Saved'); assert.deepEqual(copy(savedBundle(fresh, p)), copy(draft));
  const restarted = launch(p); restarted.run(2000);
  assert.deepEqual(copy(restarted.harness.$.HPColorsV3Store.getBundle()), copy(draft));
});

test('a changed settings-code IMPORT commits once', () => {
  // Audit 2026-11-02 (GPT-6.1 Sol repro): the store applied and committed the import, then the menu committed
  // the identical state a second time. An equal import still commits once inside the store (audit M3 above).
  const f = launch(profile()); f.run(4000);
  const h = f.harness, real = h.$.HPColorsV3Store, next = copy(real.getBundle().settings);
  next.side.enemy.barColorLow = '#123456';
  const code = h.$.HPColorsV3Sharing.exportSettingsCode(next).code, commits = [];
  h.$.HPColorsV3Store = { ...real, commit(config) { commits.push(JSON.stringify(config.settings)); return real.commit(config); } };
  h.contextPanel.FindChildTraverse('HPColorsSettingsCodeEntry').text = code;
  h.contextPanel.FindChildTraverse('HPColorsSettingsImportButton').events.onactivate();
  assert.equal(commits.length, 1);
  assert.equal(real.getBundle().settings.side.enemy.barColorLow, '#123456');
});

test('a settings import a retired menu refuses commits nothing, not even its conditions', () => {
  // Audit 2026-11-02 round 3 (GPT-6.1 Sol repro): the store's equal-import commit must not persist what the menu refused.
  let api;
  const p = profile(), f = launch(p, { boot() {
    const b = loadLayout('hud_escape_menu.xml'), include = b.includeScripts;
    b.includeScripts = () => { include(); const store = b.harness.$.HPColorsV3Store; b.harness.$.HPColorsV3Store = { ...store, attach(value) { api = value; return store.attach(value); } }; };
    return b;
  } });
  f.run(4000);
  const h = f.harness, store = h.$.HPColorsV3Store, settings = api.getSettings();
  const cell = h.$.HPColorsV3Settings.slots.find(s => s.setting === 'barColorLow' && s.side === 'enemy').slot;
  const rules = { [cell]: { slot: 1, minTier: 1, value: '#123456' } };
  const code = h.$.HPColorsV3Sharing.exportSettingsCode(settings, rules).code;
  h.$.HPColorsMenuPublisher.retire();
  store.importSettingsCode(code); f.run(2000);
  assert.equal(store.getBundle().rules, undefined, 'the refused conditions are not committed');
  const saved = p.disk.get(CURRENT);
  assert.ok(!saved || !(f.codec.classifyRecord(saved).bundle || {}).rules, 'nor saved');
});
