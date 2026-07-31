'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const panorama = path.join(root, 'panorama');
const scriptRoot = path.join(panorama, 'scripts');
const layoutRoot = path.join(panorama, 'layout');
const styleRoot = path.join(panorama, 'styles');
const stockRoot = path.join(root, 'stock');

function filesUnder(directory, predicate = () => true) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...filesUnder(entryPath, predicate));
    else if (predicate(entryPath)) files.push(entryPath);
  }
  return files;
}

function read(file) {
  return fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
}

function relative(file) {
  return path.relative(root, file).replaceAll('\\', '/');
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function manifestEntries(name) {
  const parsed = JSON.parse(read(path.join(stockRoot, name)));
  return Array.isArray(parsed) ? parsed : parsed.files;
}

function manifestSource(entry) {
  return entry.sourcePath || entry.source;
}

function assertPinnedManifest(name, expectedSources) {
  const entries = manifestEntries(name);
  const seen = new Set();
  for (const entry of entries) {
    const source = manifestSource(entry);
    assert.ok(source, `${name} entry must identify its source`);
    assert.ok(!seen.has(source), `${name} duplicates ${source}`);
    seen.add(source);
    assert.ok(['valve-stock-pinned', 'qol-lite-original'].includes(entry.origin), `${source} has invalid origin`);
    if (entry.origin === 'valve-stock-pinned') {
      assert.match(entry.sha256, /^[a-f0-9]{64}$/, `${source} must pin a SHA-256`);
      const stockFile = path.join(stockRoot, path.relative('panorama', source));
      assert.ok(fs.existsSync(stockFile), `missing pinned stock file ${relative(stockFile)}`);
      assert.equal(sha256(stockFile), entry.sha256, `pinned stock hash changed for ${source}`);
    } else {
      assert.equal(entry.sha256, null, `${source} is original and must not claim an upstream hash`);
    }
  }
  assert.deepEqual([...seen].sort(), [...expectedSources].sort(), `${name} coverage differs from authored sources`);
}

const provenance = JSON.parse(read(path.join(root, 'provenance.json')));
assert.equal(provenance.stock.repository, 'SteamTracking/GameTracking-Deadlock');
assert.equal(provenance.stock.commit, '3573cbb746581eccc7752fc2e00c21d4447d72bb');
assert.equal(provenance.stock.build, 6655);
assert.deepEqual(provenance.allowedOrigins, ['valve-stock-pinned', 'qol-lite-original']);

const scripts = filesUnder(scriptRoot, (file) => file.endsWith('.js'));
assert.equal(scripts.length, 32, 'unexpected runtime script count');
for (const file of scripts) {
  assert.match(path.basename(file), /^qollite_[a-z0-9_]+\.js$/, `runtime lacks QOL Lite identity: ${relative(file)}`);
  assert.ok(fs.statSync(file).size > 0, `empty runtime: ${relative(file)}`);
}

const layouts = filesUnder(layoutRoot, (file) => file.endsWith('.xml'));
const authoredStyles = filesUnder(styleRoot, (file) => {
  if (!file.endsWith('.css')) return false;
  const rel = relative(file);
  return !rel.startsWith('panorama/styles/base/') && !rel.startsWith('panorama/styles/topbar_rank_base/');
});
assertPinnedManifest('layout-manifest.json', layouts.map(relative));
assertPinnedManifest('styles-manifest.json', authoredStyles.map(relative));

const sourceTextFiles = [
  ...scripts,
  ...layouts,
  ...authoredStyles
];
const forbiddenLegacyNames = [
  'bettermap_', 'topbar_rank_v40_hud', 'showrank_common', 'asap_settings',
  'ql_hero_testing', 'popup_search', 'profile_statlocker', 'recent_purchases_redux',
  'hud_quickbuy_total_summary', 'purchase_filters.js', 'quick_purchases.js',
  'reset_purchases.js', 'rejuvnbufftimer.js', 'urntracker.js', 'unspent.js',
  'clear_mod_icons.js', 'qollite_passive_disabled_dir.vpk'
];
for (const file of sourceTextFiles) {
  const text = read(file);
  assert.doesNotMatch(text, /qollock|pak47_dir\.vpk/i, `forbidden provenance marker in ${relative(file)}`);
  for (const oldName of forbiddenLegacyNames) {
    assert.ok(!text.includes(oldName), `${relative(file)} retains legacy runtime reference ${oldName}`);
  }
}

const buildText = read(path.join(root, '..', 'build_qollite_v2_2.ps1'));
assert.ok(!buildText.includes('qollite_passive_disabled_dir.vpk'), 'build must not extract an opaque baseline VPK');
assert.match(buildText, /Forbidden @\([\s\S]*'qollock'/, 'build must reject QOLLOCK-named package assets');

for (const layout of layouts) {
  const text = read(layout);
  for (const match of text.matchAll(/panorama\/scripts\/([a-z0-9_]+)(?:\.vjs_c|\.js)/gi)) {
    if (!match[1].startsWith('qollite_')) continue;
    const script = path.join(scriptRoot, `${match[1]}.js`);
    assert.ok(fs.existsSync(script), `${relative(layout)} includes missing ${match[1]}`);
  }
}

function assertOrderedIncludes(layoutName, expected) {
  const text = read(path.join(layoutRoot, layoutName));
  let prior = -1;
  for (const scriptName of expected) {
    const candidates = [
      text.indexOf(`panorama/scripts/${scriptName}.vjs_c`),
      text.indexOf(`panorama/scripts/${scriptName}.js`)
    ].filter((index) => index >= 0);
    const index = candidates.length ? Math.min(...candidates) : -1;
    assert.ok(index > prior, `${layoutName} must include ${scriptName} in dependency order`);
    prior = index;
  }
}

assertOrderedIncludes('hud.xml', [
  'qollite_map_log', 'qollite_map_poi_data', 'qollite_map_urn_data', 'qollite_map_state',
  'qollite_map_settings', 'qollite_map_size', 'qollite_map_position', 'qollite_map_poi',
  'qollite_map_umm_adapter', 'qollite_map_minimal', 'qollite_map_urn',
  'qollite_map_bootstrap', 'qollite_passive'
]);
assertOrderedIncludes('base_hud_and_db_overlay.xml', [
  'qollite_notifications_log', 'qollite_notifications_config', 'qollite_notifications_strings',
  'qollite_notifications_event_schedule', 'qollite_notifications_clock',
  'qollite_notifications_scheduler', 'qollite_notifications_manager',
  'qollite_notifications_umm_adapter', 'qollite_notifications_bootstrap'
]);
assert.match(
  read(path.join(layoutRoot, 'base_hud_and_db_overlay.xml')),
  /id="NotificationRoot"/,
  'notification overlay must expose #NotificationRoot'
);
assertOrderedIncludes('citadel_hud_top_bar.xml', [
  'qollite_topbar', 'qollite_showrank', 'qollite_notifications_clock_bridge',
  'qollite_notifications_urn_detector'
]);
assertOrderedIncludes('citadel_hud_hero_shop.xml', [
  'qollite_recent_purchase_icons', 'qollite_recent_purchases'
]);
assertOrderedIncludes('hud_quickbuy.xml', ['qollite_quickbuy']);

const mapState = read(path.join(scriptRoot, 'qollite_map_state.js'));
assert.match(mapState, /mapOpacity:\s*0\.95/);
assert.match(mapState, /minimalMapOpacity:\s*0\.9/);
assert.match(mapState, /minimalMap:\s*false/);
assert.match(mapState, /ultLargeMapEnabled:\s*true/);
for (const mapScript of scripts.filter((file) => path.basename(file).startsWith('qollite_map_'))) {
  assert.doesNotMatch(read(mapScript), /map_render\s*\.\s*style\s*\.\s*opacity/i, 'map render opacity belongs to CSS/UMM state');
}

const stableUmmIds = new Map([
  ['qollite_map_umm_adapter.js', 'bettermap'],
  ['qollite_notifications_umm_adapter.js', 'eventnotifier'],
  ['qollite_passive.js', 'always_show_passives'],
  ['qollite_recent_purchases.js', 'recent_purchases'],
  ['qollite_quickbuy.js', 'enhanced_quickbuy']
]);
for (const [file, id] of stableUmmIds) {
  const text = read(path.join(scriptRoot, file));
  assert.ok(text.includes(`"${id}"`) || text.includes(`'${id}'`), `${file} lost stable UMM id ${id}`);
  assert.match(text, /ClientUI_FireOutput/, `${file} lost optional UMM channel`);
}

assert.doesNotMatch(read(path.join(panorama, 'styles', 'hud_minimap.css')), /qollock/i);
assert.ok(!filesUnder(root).some((file) => /qollock|pak47/i.test(relative(file))), 'forbidden named input remains in source');

console.log(`validate-source: ok (${scripts.length} runtimes, ${layouts.length} XML, ${authoredStyles.length} CSS)`);
