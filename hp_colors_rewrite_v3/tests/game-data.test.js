'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const { spawn, spawnSync } = require('node:child_process');
const vm = require('node:vm');
const { loadLayout } = require('./boot-layout');
const { derive } = require('../tools/game-data');
const root = path.resolve(__dirname, '..');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const pin = () => JSON.parse(fs.readFileSync(path.join(root, 'game-data-pin.json'), 'utf8'));
const generate = (...args) => spawnSync(process.execPath, [path.join(root, 'tools/generate.js'), ...args], { encoding: 'utf8' });
function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv3-data-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}
function copyData(t) {
  const dir = temporary(t);
  fs.copyFileSync(path.join(root, 'game-data-pin.json'), path.join(dir, 'game-data-pin.json'));
  fs.cpSync(path.join(root, 'vendor'), path.join(dir, 'vendor'), { recursive: true });
  return dir;
}
function replacePinned(dir, file, text) {
  fs.writeFileSync(path.join(dir, file), text);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'game-data-pin.json')));
  manifest.files.find(entry => entry.path === file).sha256 = hash(Buffer.from(text));
  fs.writeFileSync(path.join(dir, 'game-data-pin.json'), JSON.stringify(manifest));
}

test('catalog generated from pinned data reaches the real ESC runtime, including prerelease/test heroes', () => {
  const boot = loadLayout('hud_escape_menu.xml');
  boot.includeScripts(); boot.onload();
  const contract = boot.harness.$.HPColorsV3Settings;
  assert.equal(contract.gameDataCommit, pin().commit);
  assert.equal(contract.gameDataClientVersion, pin().clientVersion);
  const catalog = JSON.parse(JSON.stringify(contract.heroes));
  assert.equal(catalog.length, 67);
  assert.deepEqual(catalog, JSON.parse(JSON.stringify(derive(root).catalog)));
  assert.equal(new Set(catalog.map(hero => hero.id)).size, catalog.length);
  assert.equal(new Set(catalog.map(hero => hero.name.toLowerCase())).size, catalog.length);
  assert.equal(catalog.some(hero => hero.key === 'hero_base'), false);
  for (const [key, id, name] of [['hero_baba', 88, 'Baba'], ['hero_deadpack', 78, 'Deadman Danny'],
    ['hero_nurse', 87, 'Nurse Harrow'], ['hero_ratking', 84, 'Rat King'],
    ['hero_chessmaster', 85, 'Solomon'], ['hero_artist', 86, 'Violet']]) {
    const hero = catalog.find(entry => entry.key === key);
    assert.equal(hero.id, id); assert.equal(hero.name, name);
  }
  assert.equal(catalog.find(hero => hero.key === 'hero_genericperson').inDevelopment, true);
  assert.equal(catalog.find(hero => hero.key === 'hero_testhero').id, 83);
  assert.equal(catalog.find(hero => hero.key === 'hero_testhero').name, 'Calico (hero_testhero)');
  console.log('catalog evidence: ' + catalog.length + ' unique heroes loaded in ESC; pinned commit ' + pin().commit);
});

test('pinned hero signature bindings resolve four real ability image paths in the generated runtime catalog', () => {
  const boot = loadLayout('hud_escape_menu.xml'); boot.includeScripts(); boot.onload();
  const hero = boot.harness.$.HPColorsV3Settings.heroes.find(hero => hero.key === 'hero_inferno');
  assert.deepEqual(JSON.parse(JSON.stringify(hero.abilities)), [
    'file://{images}/hud/abilities/inferno_molotov.psd',
    'file://{images}/hud/abilities/inferno_dash.psd',
    'file://{images}/hud/abilities/inferno_deflect.psd',
    'file://{images}/hud/abilities/inferno_bomb.psd',
  ]);
  const artist = boot.harness.$.HPColorsV3Settings.heroes.find(hero => hero.key === 'hero_artist');
  assert.deepEqual(JSON.parse(JSON.stringify(artist.abilities)), [
    'file://{images}/hud/abilities/artist/artist_livingink.psd',
    'file://{images}/hud/abilities/artist/artist_brush.psd',
    'file://{images}/hud/abilities/artist/artist_portrait.psd',
    'file://{images}/hud/abilities/artist/artist_landscape.psd',
  ]);
  assert.equal(artist.inDevelopment, true);
});

test('small portraits are derived from their explicit VData fields', () => {
  const boot = loadLayout('hud_escape_menu.xml'); boot.includeScripts(); boot.onload();
  const heroes = boot.harness.$.HPColorsV3Settings.heroes;
  for (const [key, path] of [['hero_inferno', 'inferno_sm.psd'], ['hero_hornet', 'hornet_sm.png'], ['hero_atlas', 'bull_sm.psd'], ['hero_ghost', 'spectre_sm.psd'], ['hero_artist', 'artist_sm.psd']]) {
    assert.equal(heroes.find(hero => hero.key === key).portrait, 'file://{images}/heroes/' + path);
  }
  // 6807 ships Nurse Harrow's art; the 6790 pin had her record but no portrait or abilities.
  const nurse = heroes.find(hero => hero.key === 'hero_nurse');
  assert.equal(nurse.portrait, 'file://{images}/heroes/nurse_sm.psd');
  assert.deepEqual(JSON.parse(JSON.stringify(nurse.abilities)), [
    'file://{images}/hud/abilities/nurse/leech.psd', 'file://{images}/hud/abilities/nurse/nurse_vapors.psd',
    'file://{images}/hud/abilities/nurse/needle.psd', 'file://{images}/hud/abilities/nurse/medicine_bag.psd',
  ]);
});

// A hero the picker shows (not disabled, needsTesting or limitedTesting) with no portrait or ability
// art means the game-data pin is older than the hero's release (Nurse Harrow at 6790): rebase it.
test('every hero the picker shows has a portrait and four ability images', () => {
  const boot = loadLayout('hud_escape_menu.xml'); boot.includeScripts(); boot.onload();
  const shown = boot.harness.$.HPColorsV3Settings.heroes.filter(hero => !hero.disabled && !hero.needsTesting && !hero.limitedTesting);
  assert.ok(shown.length > 0);
  const incomplete = shown.filter(hero => !hero.portrait || hero.abilities.length !== 4 || hero.abilities.some(image => !image)).map(hero => hero.key);
  assert.equal(incomplete.length, 0, 'rebase the game-data pin; incomplete: ' + incomplete.join(', '));
});

test('missing bound ability records and missing images generate null fallbacks without using nested image fields', t => {
  const dir = copyData(t);
  fs.cpSync(path.join(root, 'panorama'), path.join(dir, 'panorama'), { recursive: true });
  replacePinned(dir, 'vendor/abilities.vdata', '<!-- kv3 encoding:text --> ' +
    '{ generic_data_type="CitadelAbilityVData" ' +
    'ability_incendiary_projectile={ m_strAbilityImage=panorama:"file://{images}/hud/abilities/inferno_molotov.psd" } ' +
    'ability_afterburn={ nested=subclass:{ m_strAbilityImage=panorama:"not-an-ability-image" } } ' +
    'ability_fire_bomb={ m_strAbilityImage=panorama:"" } }');
  const result = generate('--game-data-root', dir, '--output-root', dir);
  assert.equal(result.status, 0, result.stderr);
  const boot = loadLayout('hud_escape_menu.xml', { sourceRoot: dir }); boot.includeScripts(); boot.onload();
  const hero = boot.harness.$.HPColorsV3Settings.heroes.find(hero => hero.key === 'hero_inferno');
  assert.deepEqual(JSON.parse(JSON.stringify(hero.abilities)), [
    'file://{images}/hud/abilities/inferno_molotov.psd', null, null, null,
  ]);
});

test('fresh CLI generation keeps fallback hero names distinct in the real menu VM', t => {
  const dir = temporary(t);
  fs.cpSync(path.join(root, 'panorama'), path.join(dir, 'panorama'), { recursive: true });
  const result = generate('--output-root', dir);
  assert.equal(result.status, 0, result.stderr);
  const boot = loadLayout('hud_escape_menu.xml', { sourceRoot: dir });
  boot.includeScripts(); boot.onload();
  const catalog = boot.harness.$.HPColorsV3Settings.heroes;
  assert.equal(catalog.find(hero => hero.key === 'hero_nano').name, 'Calico');
  assert.equal(catalog.find(hero => hero.key === 'hero_testhero').name, 'Calico (hero_testhero)');
  assert.equal(new Set(catalog.map(hero => hero.name.toLowerCase())).size, catalog.length);
});

test('offline CLI generates pinned stock text with only compiled imports and the exact global baseline suffix', t => {
  const dir = temporary(t);
  const guard = path.join(dir, 'deny-network.cjs');
  fs.writeFileSync(guard, 'const deny = () => { throw new Error("Unexpected network access"); }; global.fetch = deny; require("node:net").connect = deny; require("node:http").request = deny; require("node:https").request = deny;');
  const result = spawnSync(process.execPath, ['--require', guard, path.join(root, 'tools/generate.js'), '--output-root', dir], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const original = fs.readFileSync(path.join(root, 'vendor/unit_status_v2.css'), 'utf8').replace(/\r\n/g, '\n');
  // v2 rectangular baseline: the three stock masks and nine container backers are deleted, and the six
  // relation rules they leave empty are dropped (live 6782: an appended opacity-mask: none does not cancel).
  const mask = '\topacity-mask: url("s2r://panorama/images/hud/healthbar/healthbar_backer_horiz_mask_flipped.vsvg");\n';
  let expected = original.replace(/(@import url\("s2r:\/\/panorama\/styles\/[^"\n]+)\.vcss("\);)/g, '$1.vcss_c$2');
  expected = expected.split(mask).join('').replace('\tbackground-color: rgb(67, 12, 12);\n', '');
  for (const [selector, body] of [['.team1', 'team1ColorDark;'], ['.team2', 'team2ColorDark;'], ['.friend', 'offBlack;\n\tbackground-color: rgb(4, 37, 23);'],
    ['.team_neutral', 'offBlack;'], ['.enemy', '#2f0404;\n\tbackground-color: offBlack;'], ['.enemy.health_critical .ShowCriticalState', 'rgb(47, 4, 4);']]) {
    const rule = '\n' + selector + ' .UnitHealthbarContainer\n{\n\tbackground-color: ' + body + '\n}\n';
    assert.equal(expected.split(rule).length, 2, selector); expected = expected.replace(rule, '');
  }
  assert.equal(fs.readFileSync(path.join(dir, 'panorama/styles/unit_status_v2.css'), 'utf8'), expected);
  assert.equal(generate('--check', '--output-root', dir).status, 0);
});

test('CLI rejects every vendored pin mismatch before writing output and never repairs it', t => {
  const dir = copyData(t);
  for (const entry of pin().files) {
    const file = path.join(dir, entry.path);
    const original = fs.readFileSync(file);
    fs.appendFileSync(file, '\nPIN MISMATCH\n');
    const result = generate('--game-data-root', dir, '--output-root', path.join(dir, 'out'));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Game-data pin mismatch/);
    assert.ok(result.stderr.includes(entry.path));
    assert.ok(result.stderr.includes(entry.sha256));
    assert.equal(fs.existsSync(path.join(dir, 'out')), false);
    assert.equal(fs.readFileSync(file, 'utf8').endsWith('\nPIN MISMATCH\n'), true);
    fs.writeFileSync(file, original);
  }
});

test('CLI fails closed for missing vendor files and invalid pin metadata', t => {
  const dir = copyData(t);
  const file = path.join(dir, 'vendor/heroes.vdata');
  fs.unlinkSync(file);
  let result = generate('--game-data-root', dir, '--output-root', path.join(dir, 'out'));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Missing vendored game-data file: vendor\/heroes.vdata/);
  assert.equal(fs.existsSync(path.join(dir, 'out')), false);
  const manifest = pin();
  manifest.commit = 'master';
  fs.writeFileSync(path.join(dir, 'game-data-pin.json'), JSON.stringify(manifest));
  result = generate('--game-data-root', dir, '--output-root', path.join(dir, 'out'));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid game-data pin manifest/);
});

test('CLI parses top-level KV3 identities only and rejects malformed data, duplicate ids and missing names', t => {
  const dir = copyData(t);
  const output = path.join(dir, 'out');
  const header = '<!-- kv3 encoding:text -->\n';
  const body = '{ generic_data_type="CitadelHeroData_t" hero_baba={ _class="CitadelHeroData_t" m_HeroID=88 m_bDisabled=false m_bInDevelopment=true m_bNeedsTesting=true m_bLimitedTesting=false nested={ hero_fake={ _class="CitadelHeroData_t" m_HeroID=999 } } reference=resource_name:"hero_fake" } }';
  replacePinned(dir, 'vendor/heroes.vdata', header + body);
  let result = generate('--game-data-root', dir, '--output-root', output);
  assert.equal(result.status, 0, result.stderr);
  const scope = { $: {} };
  vm.runInNewContext(fs.readFileSync(path.join(output, 'panorama/scripts/hp_colors_v3_settings.js'), 'utf8'), scope);
  const catalog = JSON.parse(JSON.stringify(scope.$.HPColorsV3Settings.heroes));
  assert.deepEqual(catalog.map(hero => hero.key), ['hero_baba']);
  assert.equal(catalog[0].inDevelopment, true);
  for (const [text, message] of [[header + body.slice(0, -1), /KV3/],
    [header + body.replace('reference=', 'm_HeroID=89 reference='), /Duplicate/],
    [header + body.slice(0, -1) + ' hero_nurse={ _class="CitadelHeroData_t" m_HeroID=88 } }', /Duplicate hero id/],
    [header + body.replace('hero_baba=', 'hero_no_localization='), /Missing hero name/]]) {
    replacePinned(dir, 'vendor/heroes.vdata', text);
    result = generate('--game-data-root', dir, '--output-root', path.join(dir, 'bad'));
    assert.equal(result.status, 1, text);
    assert.match(result.stderr, message);
    assert.equal(fs.existsSync(path.join(dir, 'bad')), false);
  }
});

test('CLI rejects missing or ambiguous stock-layout patch anchors before writing any generated output', t => {
  const dir = copyData(t);
  for (const [file, anchors] of [
    ['vendor/hud_escape_menu.xml', ['citadel_base_styles.vcss', 'hud_escape_menu.vcss', '</styles>',
      '<CitadelHudEscapeMenu oncancel="CitadelResumePlaying()">', '<Panel id="EscapeBackground" onactivate="CitadelResumePlaying()" />',
      'id="EscapeButton" action="MenuBack" onactivate="CitadelResumePlaying()"', '<Panel class="SettingsRow">', '</CitadelHudEscapeMenu>']],
    ['vendor/unit_status_overlay_v2.xml', ['unit_status_v2.vcss', '</styles>']],
    ['vendor/citadel_hud_top_bar.xml', ['citadel_base_styles.vcss', 'hud_common.vcss', 'citadel_hud_top_bar.vcss', 'unit_status_icons.vcss', '</styles>', '<CitadelHudTopBar hittest="false">']],
    ['vendor/citadel_status_effect.xml', ['citadel_base_styles.vcss', 'unit_status_icons.vcss', 'citadel_status_effect.vcss', '</styles>']],
  ]) {
    const original = fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
    for (const anchor of anchors) {
      for (const text of [original.replace(anchor, 'MISSING_ANCHOR'), original + anchor]) {
        replacePinned(dir, file, text);
        const result = generate('--game-data-root', dir, '--output-root', path.join(dir, 'bad'));
        assert.equal(result.status, 1, file + ' ' + anchor);
        assert.match(result.stderr, /Stock layout patch anchor/);
        assert.equal(fs.existsSync(path.join(dir, 'bad')), false);
      }
    }
    replacePinned(dir, file, original);
  }
});

async function driftFixture(t, mode) {
  const manifest = pin();
  const head = '1234567890abcdef1234567890abcdef12345678';
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push(req.url);
    if (req.url === '/commits/HEAD') return res.end(JSON.stringify({ sha: head }));
    if (req.url === '/raw/' + head + '/game/citadel/steam.inf') {
      return res.end('ClientVersion=' + manifest.clientVersion + '\n');
    }
    const entry = manifest.files.find(file => req.url === '/raw/' + head + '/' + file.upstream);
    if (!entry || mode === 'unavailable') { res.statusCode = 404; return res.end('missing'); }
    const bytes = Buffer.from(fs.readFileSync(path.join(root, entry.path), 'latin1').replace(/\r\n/g, '\n'), 'latin1');
    const changed = mode === 'drift' && entry.path.endsWith('unit_status_v2.css') ||
      mode === 'topbar-drift' && entry.path.endsWith('citadel_hud_top_bar.xml') ||
      mode === 'ability-drift' && entry.path.endsWith('abilities.vdata');
    res.end(changed ? Buffer.concat([bytes, Buffer.from('\nchanged')]) : bytes);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const before = manifest.files.map(file => hash(fs.readFileSync(path.join(root, file.path))));
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'tools/game-data.js'), '--check-upstream',
      '--upstream-base', 'http://127.0.0.1:' + server.address().port]);
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject); child.on('close', status => resolve({ status, stdout, stderr }));
  });
  assert.deepEqual(manifest.files.map(file => hash(fs.readFileSync(path.join(root, file.path)))), before);
  assert.equal(requests.filter(url => url === '/commits/HEAD').length, 1);
  assert.ok(requests.slice(1).every(url => url.startsWith('/raw/' + head + '/')));
  return result;
}
for (const mode of ['same', 'drift', 'topbar-drift', 'ability-drift', 'unavailable']) {
  test('explicit CLI upstream check reports ' + mode + ' without changing the pin', async t => {
    const result = await driftFixture(t, mode);
    assert.equal(result.status, mode === 'same' ? 0 : 1, result.stderr);
    assert.match(result.stdout, /1234567890abcdef1234567890abcdef12345678/);
    assert.match(result.stdout, new RegExp('upstream ClientVersion=' + pin().clientVersion));
    if (mode === 'same') assert.match(result.stdout, /No upstream drift/);
    if (mode === 'drift') {
      assert.match(result.stderr, /Upstream game-data drift/);
      assert.match(result.stdout, /DRIFT.*unit_status_v2.css/);
      assert.match(result.stdout, /expected=[0-9a-f]{64} actual=[0-9a-f]{64}/);
    }
    if (mode === 'topbar-drift') {
      assert.match(result.stderr, /Upstream game-data drift/);
      assert.match(result.stdout, /DRIFT.*citadel_hud_top_bar.xml/);
    }
    if (mode === 'ability-drift') {
      assert.match(result.stderr, /Upstream game-data drift/);
      assert.match(result.stdout, /DRIFT.*abilities.vdata/);
    }
    if (mode === 'unavailable') assert.match(result.stderr, /HTTP 404/);
    console.log('drift CLI evidence (' + mode + '): exit=' + result.status + '\n' + result.stdout + result.stderr);
  });
}

test('installed-version CLI accepts matching/missing installs and fails closed unless mismatch is explicitly allowed', t => {
  const dir = temporary(t);
  const file = path.join(dir, 'steam.inf');
  const cli = (...args) => spawnSync(process.execPath, [path.join(root, 'tools/game-data.js'), '--check-installed', file, ...args], { encoding: 'utf8' });
  assert.equal(cli().status, 0, 'missing install supports offline builds');
  fs.writeFileSync(file, 'ClientVersion=' + pin().clientVersion + '\n');
  assert.equal(cli().status, 0);
  fs.writeFileSync(file, 'ClientVersion=' + (pin().clientVersion + 1) + '\n');
  const mismatch = cli();
  assert.equal(mismatch.status, 1);
  assert.match(mismatch.stderr, /Installed game ClientVersion mismatch/);
  assert.ok(mismatch.stderr.includes('pinned=' + pin().clientVersion));
  assert.match(mismatch.stderr, /--allow-pin-mismatch/);
  const allowed = cli('--allow-pin-mismatch');
  assert.equal(allowed.status, 0);
  assert.match(allowed.stderr, /WARNING.*ClientVersion mismatch/);
  fs.writeFileSync(file, 'ClientVersion=invalid\n');
  assert.equal(cli('--allow-pin-mismatch').status, 1, 'override cannot hide malformed metadata');
});

test('pinned topbar generation boots the independent HUD timer from reviewed game data',()=>{
  assert.ok(pin().files.some(entry=>entry.path==='vendor/citadel_hud_top_bar.xml'),'topbar must be vendored and hashed');
  const top=loadLayout('citadel_hud_top_bar.xml');
  top.includeScripts();
  assert.ok(top.harness.$.HPColorsV3Timers);
  assert.equal(top.harness.contextPanel.BHasClass('HPColorsV3TimersTopBar'),true);
  assert.equal(top.harness.handlerEntries.filter(entry=>entry.channel==='ClientUI_FireOutput').length,1);
});
