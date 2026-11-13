'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { OUTPUTS } = require('../tools/generate');
const { checkStylesheets } = require('../tools/lib/stylesheets');
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
  assert.deepEqual(Object.keys(first).sort(), Object.keys(OUTPUTS).sort());
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
  fs.unlinkSync(path.join(dir, 'generated/menu-rows.xml'));
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
  // The generated stock sheet is checked from its generated text (the table's stockSheet output), not from the folder.
  assert.throws(() => checkStylesheets(dir, { stock: { 'unit_status_v2.css': '.UnitHealthbarContainer\n{\n\topacity-mask: url("s2r://m.vsvg");\n}\n' } }),
    /unit_status_v2\.css.*opacity-mask/);
  assert.equal(checkStylesheets(dir, { stock: { 'unit_status_v2.css': '.UnitHealthbarContainer\n{\n\theight: 18px;\n}\n' } }).files, 2);
  result = run('--check', '--styles-root', dir);
  assert.equal(result.status, 0, result.stderr);
  result = run('--check'); assert.equal(result.status, 0, result.stderr);
});
test('CSS contract: the folder and the layouts agree on the shipped sheets', t => {
  const dir = temporary(t);
  fs.writeFileSync(path.join(dir, 'a.css'), '.A { opacity: 1; }\n');
  const stock = { 'unit_status_v2.css': '.B { opacity: 1; }\n' };
  assert.equal(checkStylesheets(dir, { stock, shipped: ['a', 'unit_status_v2'] }).files, 2);
  assert.throws(() => checkStylesheets(dir, { stock, shipped: ['unit_status_v2'] }), /no layout includes: a\.css/);
  assert.throws(() => checkStylesheets(dir, { stock, shipped: ['a', 'b', 'unit_status_v2'] }), /included by a layout but missing.*b\.css/);
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

// A6: the ES5 `validationSource` shipped in both settings scripts and schema.js's default checks are two
// copies of one rule; every candidate value must get the same verdict from both.
test('validationSource accepts and refuses exactly the values schema.js accepts as defaults', () => {
  const { validate } = require('../tools/lib/schema');
  const { validationSource } = require('../tools/lib/settings-scripts');
  const validateValue = new Function('fields', validationSource + '\nreturn validateValue;')([]);
  const schemaAccepts = (row, value) => {
    const clone = { ...row, default: row.side === 'side-aware' ? { enemy: value, ally: value } : value };
    delete clone.requires;
    try { validate([clone]); return true; } catch (error) { return false; }
  };
  let checked = 0;
  for (const row of table) {
    const side = row.side === 'side-aware' ? 'enemy' : row.side;
    const field = { key: row.key, side, type: row.type, bounds: row.bounds, step: row.step, ...(row.options ? { options: row.options.map(({ value }) => ({ value })) } : {}) };
    const first = row.side === 'side-aware' ? row.default.enemy : row.default;
    const candidates = [first, null, undefined, 5, '5', 'nope', true, NaN];
    if (row.type === 'color') candidates.push('#12345', '#GGGGGG', '#abcdef', '#ABCDEF', 'abc');
    if (row.type === 'enum') candidates.push(...row.options.map(option => option.value));
    if (row.type === 'number') {
      const [low, high] = row.bounds;
      candidates.push(low, high, low - row.step, high + row.step, low + row.step / 2, low + row.step, Infinity);
    }
    for (const value of candidates) {
      assert.equal(validateValue(field, value), schemaAccepts(row, value), row.key + ' ' + JSON.stringify(value));
      checked++;
    }
  }
  assert.ok(checked > table.length * 8);
});

// The world script validates only the fields that differ from the last accepted message and reads its rows from a
// flat table. Every verdict must equal the full object-row validator (validationSource) on every message of long
// random sequences: edits, corruptions, missing/extra keys, reused mutated objects, section loss, thresholds.
test('world settings validator (flat table, incremental) agrees with the full validator on random message sequences', () => {
  const vm = require('node:vm');
  const { validationSource } = require('../tools/lib/settings-scripts');
  const loadContract = file => { const $ = {}; vm.runInNewContext(fs.readFileSync(path.join(root, 'panorama/scripts', file), 'utf8'), { $ }); return $; };
  const contract = loadContract('hp_colors_v3_settings.js').HPColorsV3Settings;
  const worldSource = fs.readFileSync(path.join(root, 'panorama/scripts/hp_colors_v3_world_settings.js'), 'utf8');
  const worldOf = () => { const $ = {}; new Function('$', worldSource)($); return $.HPColorsV3WorldSettings; };
  const fields = contract.controls.map(c => ({ key: c.key, side: c.side, type: c.type, bounds: c.bounds, step: c.step, ...(c.options ? { options: c.options.map(({ value }) => ({ value })) } : {}) }));
  const full = new Function('fields', validationSource + '\nreturn validate;')(fields);
  const defaults = contract.defaults, controls = contract.controls;
  let seed = 20240607;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const pick = list => list[Math.floor(rnd() * list.length)];
  const junk = [undefined, null, NaN, Infinity, -0, '', 'x', '#12345', '#ABCDEF', 0, 1, -1, 1e9, 0.5, '5', true, false, {}, [1], 'a|b', 5n, 0n, Symbol('s'), { valueOf() { throw new Error('valueOf'); } }];
  const dc = x => Array.isArray(x) ? x.map(dc) : x && Object.getPrototypeOf(x)?.constructor?.name === 'Object' ? Object.fromEntries(Reflect.ownKeys(x).map(k => [k, dc(x[k])])) : x;
  const areaOf = (s, side) => side === 'shared' ? s.shared : s.side[side];
  assert.equal(worldOf().validate(dc(defaults)), true);
  assert.equal(full(dc(defaults)), true);
  let accepted = 0, refused = 0, world = worldOf(), reused = dc(defaults);
  for (let n = 0; n < 6000; n++) {
    if (n % 400 === 0) world = worldOf();
    let msg = rnd() < 0.5 ? dc(defaults) : reused;
    for (let edits = Math.floor(rnd() * 4); edits > 0; edits--) {
      const c = pick(controls), side = c.side === 'shared' ? 'shared' : pick(['enemy', 'ally']), r = rnd();
      let area; try { area = areaOf(msg, side); } catch (e) { area = null; }
      if (!area || typeof area !== 'object') { msg = dc(defaults); area = areaOf(msg, side); }
      if (r < 0.35) {
        if (c.type === 'boolean') area[c.key] = !area[c.key];
        else if (c.type === 'enum') area[c.key] = pick(c.options).value;
        else if (c.type === 'color') area[c.key] = '#' + Math.floor(rnd() * 0xffffff).toString(16).padStart(6, '0');
        else area[c.key] = c.bounds[0] + Math.floor(rnd() * (Math.round((c.bounds[1] - c.bounds[0]) / c.step) + 1)) * c.step;
      } else if (r < 0.7) area[c.key] = pick(junk);
      else if (r < 0.8) delete area[c.key];
      else if (r < 0.85) area['extra' + Math.floor(rnd() * 5)] = pick(junk);
      else if (r < 0.9) { if (c.bounds) area[c.key] = c.bounds[0] + c.step * (rnd() * 3 - 1); }
      else if (r < 0.93) { if (!msg.side) msg.side = dc(defaults.side); const s = pick(['shared', 'enemy', 'ally']); if (s === 'shared') msg.shared = pick([undefined, null, dc(defaults.shared)]); else msg.side[s] = pick([undefined, null, dc(defaults.side[s])]); }
      else if (r < 0.96) { if (!msg.shared) msg.shared = dc(defaults.shared); msg.shared.lowThreshold = Math.floor(rnd() * 100); msg.shared.highThreshold = 1 + Math.floor(rnd() * 100); }
      else msg = dc(defaults);
    }
    const expected = full(dc(msg));
    assert.equal(world.validate(msg), expected, 'message ' + n);
    expected ? accepted++ : refused++;
    if (msg !== reused && rnd() < 0.3) reused = dc(msg);
  }
  assert.ok(accepted > 300 && refused > 300, 'the sequence exercises both verdicts: ' + accepted + '/' + refused);
  // Single-field corruption of every row, on a warm validator that just accepted the defaults.
  for (const c of controls) for (const side of c.side === 'shared' ? ['shared'] : ['enemy', 'ally']) for (const value of junk) {
    const msg = dc(defaults); areaOf(msg, side)[c.key] = value;
    const warm = worldOf(); warm.validate(dc(defaults));
    assert.equal(warm.validate(msg), full(dc(msg)), side + '.' + c.key + '=' + String(value));
  }
  // Enums with no options or an empty option value cannot be encoded (they would accept the empty string).
  const { worldRows } = require('../tools/lib/settings-scripts');
  const base = { key: 'k', side: 'shared', type: 'enum', bounds: null, step: null };
  assert.throws(() => worldRows([{ ...base, options: [] }]), /no options/);
  assert.throws(() => worldRows([{ ...base }]), /no options/);
  assert.throws(() => worldRows([{ ...base, options: [{ value: '' }] }]), /non-empty/);
  // The published members stay.
  const published = worldOf();
  assert.deepEqual(Object.keys(published).sort(), ['validate', 'validateValue', 'version']);
});

// A6: values the generator prints into the menu that the menu script also owns.
test('generated menu text agrees with the menu script (news days, credits, colorblind types)', () => {
  const { profile, launch } = require('./storage-fixture');
  const xml = fs.readFileSync(path.join(root, 'generated/menu-rows.xml'), 'utf8');
  const { PAGES } = require('../tools/lib/menu-markup');
  // The menu script's expiry is pinned by tests/news.test.js (ticket 36: items leave 30 days after their date).
  assert.match(PAGES.find(page => page.name === 'New').description, /after 30 days/);
  const f = launch(profile()); f.run(2000);
  const find = id => { const panel = f.harness.contextPanel.FindChildTraverse(id); assert.ok(panel, id); return panel; };
  const credited = [...xml.matchAll(/id="HPColorsCredits(\w+)Portrait"/g)].map(match => match[1]);
  assert.ok(credited.length > 0, 'the generated credits dialog names its contributors');
  find('HPColorsPreviewCreditsButton').events.onactivate();
  for (const name of credited) assert.ok(find('HPColorsCredits' + name + 'Portrait').src, name + ' portrait is filled by the menu script');
  const types = [...xml.matchAll(/id="HPColorsColorblind(\w+)Toggle"/g)].map(match => match[1]);
  assert.ok(types.length > 0, 'the generated colorblind rows exist');
  for (const type of types) {
    const toggle = find('HPColorsColorblind' + type + 'Toggle');
    toggle.events.onactivate();
    assert.equal(toggle.BHasClass('Checked'), true, type + ' switch is bound by the menu script');
    assert.ok(f.harness.dispatches.some(args => args[0] === 'CitadelConCommand' && args[1] === 'r_colorblindsim_fullscreen_weight_' + type.toLowerCase() + ' 1'), type + ' sends its game command');
  }
});

test('PAGES is the one page table: schema rows, NEW targets and the empty-page label read it', () => {
  const { PAGES } = require('../tools/lib/menu-markup');
  assert.deepEqual([...new Set(table.map(row => row.page))].filter(name => !PAGES.some(page => page.name === name && page.hasRows)), []);
  assert.deepEqual(PAGES.filter(page => page.newsTarget).map(page => page.name), ['Bar', 'HP Text', 'Name', 'Indicators', 'Icons', 'Units', 'Colorblind']);
  assert.ok(PAGES.every(page => !page.placeholder || page.hasRows));
});

test('the world overlay and the menu preview come from one part table and the renderer reads the same ids', () => {
  const { OVERLAY_PARTS } = require('../tools/lib/stock-layouts');
  const { loadLayout, sourceRoot } = require('./boot-layout');
  const ids = file => new Set([...fs.readFileSync(path.join(sourceRoot, 'panorama/layout', file), 'utf8').matchAll(/ id="([^"]+)"/g)].map(match => match[1]));
  const world = ids('unit_status_overlay_v2.xml'), preview = ids('hud_escape_menu.xml');
  const flat = nodes => nodes.flatMap(node => [node, ...flat(node.children || [])]);
  const expected = [
    ...OVERLAY_PARTS.pipLayers.map(name => ['Pip' + name, 'Pip' + name]),
    ...OVERLAY_PARTS.statusLabels.map(name => [name + 'Anchor', name + 'Anchor']),
    ...flat([...OVERLAY_PARTS.readout, ...OVERLAY_PARTS.bounty]).filter(node => !node.idless).map(node => [node.key, node.preview || node.key]),
  ];
  for (const [key, previewKey] of expected) {
    assert.ok(world.has('HPColorsV3' + key), 'overlay has HPColorsV3' + key);
    assert.ok(preview.has('HPColorsPreview' + previewKey), 'preview has HPColorsPreview' + previewKey);
  }
  // Nothing of those families exists in one layout only.
  const family = /^(Pip|.*Anchor$|Readout|Bounty|HPPercent|HpPercent)/;
  const only = (set, prefix) => [...set].filter(item => item.startsWith(prefix)).map(item => item.slice(prefix.length)).filter(name => family.test(name)).sort();
  const worldNames = new Set(expected.map(pair => pair[0])), previewNames = new Set([...expected.map(pair => pair[1]), ...flat(OVERLAY_PARTS.bounty).map(node => node.key)]);
  assert.deepEqual(only(world, 'HPColorsV3').filter(name => !worldNames.has(name) && !/^(Level|CanvasBounds|MotionFrame|PipGrid|BarOutline|KillMarker|PulseOverlay|RejuvenatorAnchor|.*Indicator)$/.test(name)), []);
  assert.deepEqual(only(preview, 'HPColorsPreview').filter(name => !previewNames.has(name) && !/^(RejuvenatorAnchor|PipGrid)$/.test(name)), []);
  // The renderer's published part table agrees: every owned part it finds by these ids is in the world layout and has a preview mirror.
  const boot = loadLayout('hud_escape_menu.xml');
  boot.includeScripts();
  const parts = boot.harness.$.HPColorsV3Renderer.parts;
  const worldKeys = new Set(expected.map(pair => pair[0]));
  const owned = parts.filter(def => def.owned && worldKeys.has(def.id.replace(/^HPColorsV3/, '')));
  assert.ok(owned.length >= OVERLAY_PARTS.pipLayers.length + OVERLAY_PARTS.statusLabels.length + 3, 'renderer parts cover the table');
  for (const def of owned) {
    assert.ok(world.has(def.id), def.key + ' id in the overlay layout');
    if (def.preview) assert.ok(preview.has(def.id.replace(/^HPColorsV3/, 'HPColorsPreview')) || /Readout$/.test(def.id) || /ReadoutRow$/.test(def.id), def.key + ' has a preview id');
  }
  for (const name of OVERLAY_PARTS.pipLayers) assert.ok(parts.some(def => def.id === 'HPColorsV3Pip' + name), 'renderer has pip ' + name);
  for (const name of OVERLAY_PARTS.statusLabels) assert.ok(parts.some(def => def.id === 'HPColorsV3' + name + 'Anchor'), 'renderer has ' + name + ' anchor');
  for (const key of ['BountyAnchor', 'Bounty', 'BountyValue']) assert.ok(parts.some(def => def.id === 'HPColorsV3' + key), 'renderer has ' + key);
});
