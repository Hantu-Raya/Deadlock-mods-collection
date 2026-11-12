'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'tools/generate.js');
const table = JSON.parse(fs.readFileSync(path.join(root, 'settings/schema.json'), 'utf8'));
function run(...args) { return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' }); }
function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv3-generator-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function hashes(dir, prefix = '') {
  const result = {};
  for (const entry of fs.readdirSync(path.join(dir, prefix), { withFileTypes: true })) {
    const rel = path.join(prefix, entry.name);
    if (entry.isDirectory()) Object.assign(result, hashes(dir, rel));
    else result[rel.replace(/\\/g, '/')] = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, rel))).digest('hex');
  }
  return result;
}

test('CLI deterministically generates all outputs, committed --check passes and stale files fail', t => {
  const dir = temporary(t);
  assert.equal(run('--output-root', dir).status, 0);
  const first = hashes(dir);
  assert.equal(Object.keys(first).length, 13);
  assert.equal(run('--output-root', dir).status, 0);
  assert.deepEqual(hashes(dir), first);
  assert.equal(run('--check', '--output-root', dir).status, 0);
  assert.equal(run('--check').status, 0);
  for (const relative of Object.keys(first)) {
    const file = path.join(dir, relative);
    const original = fs.readFileSync(file);
    fs.appendFileSync(file, '\nSTALE\n');
    assert.notEqual(run('--check', '--output-root', dir).status, 0, relative);
    assert.equal(fs.readFileSync(file, 'utf8').endsWith('\nSTALE\n'), true, 'check must not repair files');
    fs.writeFileSync(file, original);
  }
  fs.unlinkSync(path.join(dir, 'generated/ids.json'));
  assert.notEqual(run('--check', '--output-root', dir).status, 0);
  console.log('determinism hashes ' + JSON.stringify(first));
});

// The mutations need a side-aware boolean row; pick it by key so menu order changes (ticket 37) cannot move it.
const pick = rows => rows.find(row => row.key === 'barColorEnabled');
const mutations = {
  'missing column': rows => { delete pick(rows).help; },
  'unknown column': rows => { pick(rows).typo = true; },
  'unknown type': rows => { pick(rows).type = 'slider'; },
  'unknown side': rows => { pick(rows).side = 'enemyish'; },
  'unknown page': rows => { pick(rows).page = 'Misc'; },
  'unknown fold': rows => { pick(rows).level = 'expert'; },
  'invalid unit': rows => { pick(rows).unit = 3; },
  'bad boolean default': rows => { pick(rows).default.enemy = 1; },
  'missing side default': rows => { delete pick(rows).default.ally; },
  'default outside bounds': rows => { Object.assign(pick(rows), { type: 'number', unit: 'px', bounds: [0, 10], step: 1, default: { enemy: 11, ally: 0 } }); },
  'inverted bounds': rows => { Object.assign(pick(rows), { type: 'number', unit: 'px', bounds: [10, 0], step: 1, default: { enemy: 5, ally: 5 } }); },
  'invalid step': rows => { Object.assign(pick(rows), { type: 'number', unit: 'px', bounds: [0, 10], step: 0, default: { enemy: 5, ally: 0 } }); },
  'off step default': rows => { Object.assign(pick(rows), { type: 'number', unit: 'px', bounds: [0, 10], step: 2, default: { enemy: 5, ally: 0 } }); },
  'non-number bounds': rows => { pick(rows).bounds = [0, 1]; },
  'duplicate key': rows => { rows.push({ ...pick(rows) }); },
  'colliding menu ids': rows => { rows.push({ ...pick(rows), key: pick(table).key[0].toUpperCase() + pick(table).key.slice(1), slot: {enemy:10000,ally:10001} }); },
  'unsafe key': rows => { pick(rows).key = '../escape'; },
  'invalid keywords': rows => { pick(rows).keywords = [false]; },
  // Dependent rows (2026-10-28): a requirement must point at a real row, never itself or in a loop, use a real
  // option or a number threshold, and be readable from every side the row has.
  'requires unknown key': rows => { pick(rows).requires = [{ key: 'noSuchSetting' }]; },
  'requires itself': rows => { pick(rows).requires = [{ key: 'barColorEnabled' }]; },
  'requires loop': rows => { pick(rows).requires = [{ key: 'barColorMode', is: ['fixed'] }]; rows.find(r => r.key === 'barColorMode').requires = [{ key: 'barColorEnabled' }]; },
  'requires unknown option': rows => { pick(rows).requires = [{ key: 'barStyle', is: ['neon'] }]; },
  'requires number on a switch': rows => { pick(rows).requires = [{ key: 'nameVisible', above: 0 }]; },
  'requires mode without values': rows => { pick(rows).requires = [{ key: 'barStyle' }]; },
  'requires enemy-only key from both sides': rows => { pick(rows).requires = [{ key: 'killMarkerEnabled' }]; },
  'requires unknown field': rows => { pick(rows).requires = [{ key: 'nameVisible', when: true }]; },
  'requires empty either-of': rows => { pick(rows).requires = [{ any: [] }]; },
};
for (const [name, mutate] of Object.entries(mutations)) {
  test('CLI rejects malformed row: ' + name, t => {
    const dir = temporary(t);
    const rows = structuredClone(table);
    mutate(rows);
    const input = path.join(dir, 'input.json');
    fs.writeFileSync(input, JSON.stringify(rows));
    const output = path.join(dir, 'out');
    const result = run('--settings', input, '--output-root', output);
    assert.notEqual(result.status, 0);
    if (name === 'colliding menu ids') assert.match(result.stderr,/Duplicate key or menu id/);
    if (name.startsWith('requires')) assert.match(result.stderr, /[Rr]equire|either-of/, name + ': ' + result.stderr);
    assert.equal(fs.existsSync(output), false, 'validation precedes all writes');
  });
}

test('CLI rejects invalid JSON, an empty/non-array table and unknown flags', t => {
  const dir = temporary(t);
  const file = path.join(dir, 'bad.json');
  for (const value of ['{', '[]', '{}']) {
    fs.writeFileSync(file, value);
    assert.notEqual(run('--settings', file, '--output-root', path.join(dir, 'out')).status, 0);
  }
  assert.notEqual(run('--bogus').status, 0);
});

const semanticMutations={
 // A row nothing requires (a required switch turned color fails the requirement check first).
 'type':rows=>Object.assign(rows.find(x=>x.key==='barColorTeamHigh'),{type:'color',default:{enemy:'#112233',ally:'#445566'}}),
 'default':rows=>{pick(rows).default.enemy=!pick(rows).default.enemy;},
 'bounds':rows=>{rows.find(x=>x.key==='barWidth').bounds[1]+=1;},
 'options':rows=>{rows.find(x=>x.key==='hpTextAlign').options.pop();},
 'added slot':rows=>rows.push({...pick(rows),key:'newFlag',slot:{enemy:10000,ally:10001}})
};
for(const [name,mutate] of Object.entries(semanticMutations))test('version guard rejects semantic '+name+' change before writing or --check',t=>{
 const dir=temporary(t),rows=structuredClone(table);mutate(rows);const input=path.join(dir,'schema.json'),out=path.join(dir,'out');fs.writeFileSync(input,JSON.stringify(rows));
 for(const extra of [[],['--check']]){const result=run('--settings',input,'--output-root',out,...extra);assert.notEqual(result.status,0);assert.match(result.stderr,/recordVersion.*defaultChanges/);assert.equal(fs.existsSync(out),false);}
});
test('version/defaultChanges come from data and explicit bump covers changed slots',t=>{
 const dir=temporary(t),rows=structuredClone(table);pick(rows).default.enemy=!pick(rows).default.enemy;const input=path.join(dir,'schema.json'),metadata=path.join(dir,'record.json'),out=path.join(dir,'out');fs.writeFileSync(input,JSON.stringify(rows));const baseline=JSON.parse(fs.readFileSync(path.join(root,'settings/record.json'),'utf8')),version=baseline.recordVersion+1;fs.writeFileSync(metadata,JSON.stringify({...baseline,recordVersion:version,defaultChanges:[...baseline.defaultChanges,{version,slots:[pick(rows).slot.enemy]}]}));const result=run('--settings',input,'--record-contract',metadata,'--output-root',out);assert.equal(result.status,0,result.stderr);const vm=require('node:vm'),scope={$:{}};vm.runInNewContext(fs.readFileSync(path.join(out,'panorama/scripts/hp_colors_v3_settings.js'),'utf8'),scope);assert.equal(scope.$.HPColorsV3Settings.recordVersion,version);assert.equal(scope.$.HPColorsV3Settings.defaultChanges.at(-1).slots[0],pick(rows).slot.enemy);assert.equal(run('--settings',input,'--record-contract',metadata,'--output-root',out,'--check').status,0);
});

test('slot-addition history cannot relabel an existing slot and overwrite deliberate older defaults',t=>{
 const dir=temporary(t),baseline=JSON.parse(fs.readFileSync(path.join(root,'settings/record.json'),'utf8'));
 const metadata=path.join(dir,'record.json'),out=path.join(dir,'out'),version=baseline.recordVersion+1;
 fs.writeFileSync(metadata,JSON.stringify({...baseline,recordVersion:version,slotAdditions:[...baseline.slotAdditions,{version,slots:[pick(table).slot.enemy]}]}));
 const result=run('--record-contract',metadata,'--output-root',out);
 assert.notEqual(result.status,0);assert.equal(fs.existsSync(out),false);
});

// Ticket 35: appending an enum option widens what a slot accepts without changing its default, so it needs a
// record-version bump (older readers see the new value as newer and skip it) but no forever-explicit defaultChanges.
test('an appended enum option needs a recordVersion bump but not defaultChanges',t=>{
 const dir=temporary(t),rows=structuredClone(table),baseline=JSON.parse(fs.readFileSync(path.join(root,'settings/record.json'),'utf8'));
 rows.find(x=>x.key==='hpTextAlign').options.push({value:'wide',label:'Wide'});
 const input=path.join(dir,'schema.json'),metadata=path.join(dir,'record.json');fs.writeFileSync(input,JSON.stringify(rows));
 fs.writeFileSync(metadata,JSON.stringify(baseline));
 const same=run('--settings',input,'--record-contract',metadata,'--output-root',path.join(dir,'same'));
 assert.notEqual(same.status,0);assert.match(same.stderr,/recordVersion.*defaultChanges/);
 const version=baseline.recordVersion+1;
 fs.writeFileSync(metadata,JSON.stringify({...baseline,recordVersion:version}));
 const unstepped=run('--settings',input,'--record-contract',metadata,'--output-root',path.join(dir,'unstepped'));
 assert.notEqual(unstepped.status,0,'a bump without an entry would leave older records without an upgrade step');
 assert.match(unstepped.stderr,/needs a slotAdditions or defaultChanges entry/);
 fs.writeFileSync(metadata,JSON.stringify({...baseline,recordVersion:version,slotAdditions:[...baseline.slotAdditions,{version,slots:[]}]}));
 const bumped=run('--settings',input,'--record-contract',metadata,'--output-root',path.join(dir,'bumped'));
 assert.equal(bumped.status,0,bumped.stderr);
 rows.find(x=>x.key==='hpTextAlign').options.splice(0,1);fs.writeFileSync(input,JSON.stringify(rows));
 const reordered=run('--settings',input,'--record-contract',metadata,'--output-root',path.join(dir,'reordered'));
 assert.notEqual(reordered.status,0,'removing an option still needs defaultChanges');
});

// Ticket 36: a removed setting's slots are listed in record.json retiredSlots. Those may leave the schema;
// their numbers never come back, the list never shrinks, and every other slot still cannot be removed.
test('retired slots may leave the schema but are never reused or un-retired; other removals still fail',t=>{
 const dir=temporary(t),baseline=JSON.parse(fs.readFileSync(path.join(root,'settings/record.json'),'utf8'));
 assert.deepEqual(baseline.retiredSlots,[193,194,152,153,198]);
 assert.equal(table.some(row=>row.key==='staminaLowEmpty'),false);
 const input=path.join(dir,'schema.json'),metadata=path.join(dir,'record.json'),version=baseline.recordVersion+1;
 const reuse=structuredClone(table);reuse.push({...table.find(row=>row.key==='staminaLowColor'),key:'reusedFlag',slot:{enemy:193,ally:10001}});
 fs.writeFileSync(input,JSON.stringify(reuse));
 fs.writeFileSync(metadata,JSON.stringify({...baseline,recordVersion:version,slotAdditions:[...baseline.slotAdditions,{version,slots:[193,10001]}]}));
 let result=run('--settings',input,'--record-contract',metadata,'--output-root',path.join(dir,'reuse'));
 assert.notEqual(result.status,0);assert.match(result.stderr,/retired slot 193/);
 fs.writeFileSync(input,JSON.stringify(table));
 fs.writeFileSync(metadata,JSON.stringify({...baseline,retiredSlots:[193]}));
 result=run('--settings',input,'--record-contract',metadata,'--output-root',path.join(dir,'shrunk'));
 assert.notEqual(result.status,0);assert.match(result.stderr,/retiredSlots cannot shrink/);
 fs.writeFileSync(input,JSON.stringify(table.filter(row=>row.key!=='staminaLowColor')));
 fs.writeFileSync(metadata,JSON.stringify(baseline));
 result=run('--settings',input,'--record-contract',metadata,'--output-root',path.join(dir,'removed'));
 assert.notEqual(result.status,0);assert.match(result.stderr,/cannot be removed/);
 fs.writeFileSync(metadata,JSON.stringify({...baseline,retiredSlots:[193,194,'x']}));
 fs.writeFileSync(input,JSON.stringify(table));
 result=run('--settings',input,'--record-contract',metadata,'--output-root',path.join(dir,'invalid'));
 assert.notEqual(result.status,0);assert.match(result.stderr,/retiredSlots/);
});

// Live 6782: a 37-selector / 2.9 KB selector list compiled but failed to parse at runtime and
// aborted the Escape-menu load. The pre-build --check enforces <= 10 selectors and <= 1,024
// characters per rule on every packed stylesheet (an asset contract, like the VPK assertions).
test('CSS contract: --check fails closed on a 37-selector rule and passes the shipped stylesheets', t => {
  const dir = temporary(t);
  const wide = Array.from({ length: 37 }, (_, i) => '.WindowRoot.HPColorsV3Core.boss_tier' + i + ' #HPColorsV3MotionFrame').join(',\n');
  fs.writeFileSync(path.join(dir, 'bad.css'), '/* fixture */\n@define x: #fff;\n' + wide + '\n{\n\tanimation-name: none;\n}\n');
  let result = run('--check', '--styles-root', dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /bad\.css.*37 selectors/);
  const long = '.' + 'A'.repeat(1030) + ' #x';
  fs.writeFileSync(path.join(dir, 'bad.css'), long + ' { opacity: 1; }\n');
  result = run('--check', '--styles-root', dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /bad\.css.*characters/);
  fs.writeFileSync(path.join(dir, 'bad.css'), Array.from({ length: 10 }, (_, i) => '#a' + i).join(', ') + ' { opacity: 1; }\n@keyframes \'k\' { 0% { opacity: 0; } 100% { opacity: 1; } }\n');
  result = run('--check', '--styles-root', dir);
  assert.equal(result.status, 0, result.stderr);
  result = run('--check');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /stylesheets: \d+ files, \d+ rules, max \d+ selectors/);
});

// Live 6782: `opacity-mask: none` does not cancel an earlier mask, so the stock slanted mask stayed
// on V1/OLD bars. Packed sheets never rely on it, and the generated stock sheet has no mask at all.
test('CSS contract: --check rejects opacity-mask: none anywhere and any mask in the generated stock sheet', t => {
  const dir = temporary(t);
  fs.writeFileSync(path.join(dir, 'world.css'), '.WindowRoot.X #UnitHealthbar\n{\n\topacity-mask: none;\n}\n');
  let result = run('--check', '--styles-root', dir);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /world\.css.*opacity-mask: none/);
  fs.writeFileSync(path.join(dir, 'world.css'), '.WindowRoot.X #UnitHealthbar { opacity-mask: url("s2r://m.vsvg"); }\n');
  fs.writeFileSync(path.join(dir, 'unit_status_v2.css'), '.UnitHealthbarContainer\n{\n\topacity-mask: url("s2r://m.vsvg");\n}\n');
  result = run('--check', '--styles-root', dir);
  assert.notEqual(result.status, 0); assert.match(result.stderr, /unit_status_v2\.css.*opacity-mask/);
  fs.writeFileSync(path.join(dir, 'unit_status_v2.css'), '.UnitHealthbarContainer\n{\n\theight: 18px;\n}\n');
  result = run('--check', '--styles-root', dir);
  assert.equal(result.status, 0, result.stderr);
  result = run('--check'); assert.equal(result.status, 0, result.stderr);
});
test('generated stock sheet deletes the three masks and nine container backers like v2, dropping emptied rules', () => {
  const sheet = fs.readFileSync(path.join(root, 'panorama/styles/unit_status_v2.css'), 'utf8');
  const vendor = fs.readFileSync(path.join(root, 'vendor/unit_status_v2.css'), 'utf8');
  assert.equal((vendor.match(/opacity-mask/g) || []).length, 3, 'pinned input has the three stock masks');
  assert.equal(/opacity-mask/.test(sheet), false);
  for (const selector of ['.team1 .UnitHealthbarContainer', '.team2 .UnitHealthbarContainer', '.friend .UnitHealthbarContainer',
    '.team_neutral .UnitHealthbarContainer', '.enemy .UnitHealthbarContainer', '.enemy.health_critical .ShowCriticalState .UnitHealthbarContainer'])
    assert.equal(sheet.split('\n').includes(selector), false, selector + ' emptied and dropped');
  const base = /\n\.UnitHealthbarContainer\n\{([^}]*)\}/.exec(sheet)[1];
  assert.equal(/background-color/.test(base), false); assert.match(base, /height: 18px;/);
  assert.match(sheet, /#UnitHealthbarInner\n\{[^}]*background-color: black;/, 'inner black backing stays');
  assert.equal(/V3 shipped baseline/.test(sheet), false, 'no appended override suffix');
});

test('CSS contract: owned color declarations reject unresolved stock macros, including shadows and gradients', t => {
  const dir = temporary(t), file = path.join(dir, 'hp_colors_v3_menu.css');
  for (const declaration of ['wash-color: offBlack', 'text-shadow: 0px 0px 5.0 colorEnemy',
    'border: 2px solid brandGreen&66', 'color: #10130D; wash-color: brandGreen',
    'background-color: gradient(linear, 0% 0%, 100% 0%, from(#10130D), to(offWhite))']) {
    fs.writeFileSync(file, '.HPC3Fixture { ' + declaration + '; }\n');
    const result = run('--check', '--styles-root', dir);
    assert.notEqual(result.status, 0, declaration);
    assert.match(result.stderr, /hp_colors_v3_menu\.css.*unresolved colou?r macro/i);
  }
  fs.writeFileSync(file, '.HPC3Fixture { wash-color: #10130D; color: white; text-shadow: 0px 0px 5.0 #FF410D; background-color: gradient(linear, 0% 0%, 100% 0%, from(#10130D), to(rgba(0, 0, 0, 0.5))); }\n');
  const result = run('--check', '--styles-root', dir);
  assert.equal(result.status, 0, result.stderr);
});

test('compact settings contract parses identically to the former pretty-printed payload',()=>{
 const {menuParts}=require('../tools/generate'),vm=require('node:vm'),file='panorama/scripts/hp_colors_v3_settings.js';
 const compact=menuParts().files[file],stringify=JSON.stringify;let pretty;
 try{
  JSON.stringify=function(value,replacer,space){
   return stringify(value,replacer,value&&value.magic==='HP_COLORS_V3_CONFIG'&&value.controls?2:space);
  };
  pretty=menuParts().files[file];
 }finally{JSON.stringify=stringify;}
 const parse=source=>{const scope={$:{}};vm.runInNewContext(source,scope);return JSON.parse(stringify(scope.$.HPColorsV3Settings));};
 assert.deepEqual(parse(compact),parse(pretty));
 assert.ok(Buffer.byteLength(compact)<Buffer.byteLength(pretty),'compact emitter removes only insignificant JSON whitespace');
});
