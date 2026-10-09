'use strict';

// Failure modes: stock drift, non-player overrides, palette drift, broad motion,
// extra packaged assets, or an implicit deployment replacing the installed pak02.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8').replace(/\r\n/g, '\n');
const css = read('hp_colors_rewrite_v2_lite/panorama/styles/unit_status_v2.css');
const marker = '/* HP Colors Rewrite v2 Lite: static hero palette. */';
const split = css.indexOf(marker);
const base = css.slice(0, split);
const additions = css.slice(split);
const context = { $: {} };
vm.runInNewContext(read('hp_colors_rewrite_v2/panorama/scripts/hp_colors_v2_contract.js'), context);
const defaults = context.$.HPColorsV2ContractFactory.create().defaults;
const rules = [...additions.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap(([, selectors, body]) =>
  selectors.trim().split(',').map(selector => ({ selector: selector.trim(), body })));
function property(selector, name) {
  const rule = rules.find(rule => rule.selector === selector && rule.body.includes(`${name}:`));
  assert.ok(rule, `Missing selector ${selector}`);
  const match = rule.body.match(new RegExp(`${name}:\\s*([^;]+);`));
  assert.ok(match, `Missing ${name} in ${selector}`);
  return match[1].trim();
}
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.relative(root, path.join(dir, entry.name)).replace(/\\/g, '/')]);
}

test('lite starts with the unmodified 2026-10-01 stock stylesheet', () => {
  assert.ok(split > 0);
  assert.equal(crypto.createHash('sha256').update(base).digest('hex'),
    '2ad486626ff2c357be4515761d5fc82e50ef77e6a05444e4f34ee1aad7ded41f');
  assert.match(base, /#UnitStatus\s*\{[^}]*width: 100px;[^}]*height: 40px;/);
  assert.match(base, /\.active_damage #UnitStatus\s*\{[^}]*animation-name: active_damage_wiggle;/);
  assert.doesNotMatch(additions, /animation-|@keyframes|transform|width:|height:/);
});

test('static hero palette uses shipped defaults without overriding non-player surfaces', () => {
  for (const rule of rules) assert.match(rule.selector, /^\.player\.(enemy|friend)(\.health_critical)? /);
  for (const [selector, key] of [
    ['.player.enemy #unit_healthbar_lagging', 'enemyHigh'],
    ['.player.enemy.health_critical #unit_healthbar_lagging', 'enemyLow'],
    ['.player.friend #unit_healthbar_lagging', 'allyHigh'],
    ['.player.friend.health_critical #unit_healthbar_lagging', 'allyLow'],
    ['.player.enemy #unit_healthbar_healing', 'enemyHealing'],
    ['.player.enemy #unit_healthbar_delta', 'enemyDelta'],
    ['.player.enemy #UnitHealthbarLines .line_large', 'enemyPipColor'],
    ['.player.enemy #UnitHealthbarLines .line_small', 'enemyPipColor'],
    ['.player.enemy #unit_ult_ready_icon', 'enemyHigh'],
    ['.player.enemy.health_critical #unit_ult_ready_icon', 'enemyLow'],
    ['.player.enemy #UnitHealthbarValue', 'enemyHigh'],
    ['.player.enemy.health_critical #UnitHealthbarValue', 'enemyLow'],
  ]) assert.equal(property(selector, 'wash-color').toUpperCase(), defaults[key]);
  assert.equal(property('.player.enemy #unit_healthbar_bullet_shield', 'background-color'), defaults.enemyBulletShield);
  assert.equal(property('.player.enemy #UnitHealthbarValue', 'font-family'), 'VALVEOracle, Reaver, sans-serif');
  for (const key of ['npcEnemyEnabled', 'npcAllyEnabled', 'npcNeutralEnabled', 'buildingEnemyEnabled', 'buildingAllyEnabled']) assert.equal(defaults[key], false);
  assert.equal(defaults.enemyPipColorEnabled, true);
  assert.equal(defaults.allyEnabled, false); // Ally colors match stock; no ally feedback customization.
});

test('source and build enforce exactly one compiled CSS asset and opt-in deployment', () => {
  assert.deepEqual(files(path.join(root, 'hp_colors_rewrite_v2_lite/panorama')), [
    'hp_colors_rewrite_v2_lite/panorama/styles/unit_status_v2.css',
  ]);
  const build = read('build_hp_colors_rewrite_v2_lite.ps1');
  assert.match(build, /\[switch\]\$Deploy/);
  assert.doesNotMatch(build, /stock_20261001|SkipDeploy|Closure/);
  assert.match(build, /\$expectedPackedAssets = @\('panorama\/styles\/unit_status_v2\.vcss_c'\)/);
  assert.match(build, /Copy-Item -LiteralPath \$cssSource -Destination \$stageCss/);
  assert.match(build, /Invoke-Source2Compiler/);
  assert.match(build, /Compare-Object/);
  assert.match(build, /Assert-PackedVpkAssets[^\n]*-Required \$expectedPackedAssets -Forbidden/);
  assert.match(build, /'panorama\/layout', 'panorama\/scripts'/);
  assert.match(build, /hp_colors_rewrite_v2_lite_pak02_dir\.vpk/);
  assert.match(build, /if \(-not \$Deploy\) \{[^}]*return/s);
  assert.ok(build.indexOf('if (-not $Deploy)') < build.indexOf('Copy-Item -LiteralPath $vpkOut -Destination $vpkDest'));
  assert.match(build, /\$vpkDest = [^\n]*addons\\pak02_dir\.vpk'/);
  assert.match(build, /backup_/);
  assert.match(build, /Get-FileHash/);
});
