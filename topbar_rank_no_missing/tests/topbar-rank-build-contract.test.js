'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ALERT_EDITION = false;
const packageDir = path.join(__dirname, '..');
const repositoryDir = path.join(packageDir, '..');
const builderName = ALERT_EDITION ? 'build_topbar_rank_barebones.ps1' : 'build_topbar_rank_barebones_no_missing.ps1';
const projectName = ALERT_EDITION ? 'topbar_rank' : 'topbar_rank_no_missing';
const artifactName = ALERT_EDITION ? 'topbar_rank_barebones_dir.vpk' : 'topbar_rank_barebones_no_missing_dir.vpk';
const stagingName = ALERT_EDITION ? '_topbar_rank_barebones_build' : '_topbar_rank_barebones_no_missing_build';
const helperPrefix = ALERT_EDITION ? 'TopbarRank' : 'TopbarRankNoMissing';
const buildPath = path.join(repositoryDir, builderName);
const build = fs.readFileSync(buildPath, 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));

const requiredSourceAssets = [
  'panorama/layout/citadel_hud_hero_shop.xml',
  'panorama/layout/citadel_hud_top_bar.xml',
  'panorama/layout/citadel_hud_top_bar_player.xml',
  'panorama/layout/citadel_ui_context_menu_player.xml',
  'panorama/layout/citadel_db_page_profile.xml',
  'panorama/layout/hud_escape_menu.xml',
  'panorama/layout/hud_paused.xml',
  'panorama/layout/players_list_entry.xml',
  'panorama/layout/profile_card.xml',
  'panorama/scripts/recent_purchases_redux.js',
  'panorama/scripts/recent_purchases_redux_data.js',
  'panorama/scripts/rejuvnbufftimer.js',
  'panorama/scripts/showrank_barebones.js',
  'panorama/scripts/unspent.js',
  'panorama/scripts/urntracker.js',
  'panorama/styles/citadel_hud_hero_shop.css',
  'panorama/styles/citadel_hud_top_bar.css',
  'panorama/styles/hero_testing_menu.css',
  'panorama/styles/hud.css',
  'panorama/styles/hud_damage_report.css',
  'panorama/styles/hud_paused.css',
  'panorama/styles/objectives_map.css',
  'panorama/styles/showrank_barebones_topbar.css',
].sort();
const requiredCompiledAssets = requiredSourceAssets.map((asset) => asset
  .replace(/\.xml$/, '.vxml_c')
  .replace(/\.js$/, '.vjs_c')
  .replace(/\.css$/, '.vcss_c'));

function assignedStringArray(name) {
  const assignment = new RegExp(`\\$${name}\\s*=\\s*@\\(([\\s\\S]*?)\\n\\)`).exec(build);
  assert.ok(assignment, `${name} is a literal package inventory`);
  return [...assignment[1].matchAll(/'([^']+)'/g)].map((match) => match[1]).sort();
}

assert.match(build, /param\(\s*\[switch\]\$Install,\s*\[switch\]\$KeepStaging,\s*\[string\]\$AddonsPath/s, 'dedicated builder supports explicit install and staging controls');
assert.match(build, new RegExp(`\\$projectRoot\\s*=\\s*Join-Path \\$root '${projectName}'`), 'dedicated builder targets only its edition source tree');
assert.match(build, new RegExp(`\\$buildRoot\\s*=\\s*Join-Path \\$root '${stagingName}'`), 'dedicated builder uses an isolated staging root');
assert.match(build, new RegExp(`\\$vpkOutput\\s*=\\s*Join-Path \\$root '${artifactName.replace('.', '\\.')}'`), 'dedicated builder emits its isolated artifact name');
assert.deepStrictEqual(assignedStringArray('requiredSourceAssets'), requiredSourceAssets, 'source compilation admits exactly the twenty-three edition assets');
assert.deepStrictEqual(assignedStringArray('requiredCompiledAssets'), requiredCompiledAssets, 'compiled package admits exactly the twenty-three expected Source 2 assets');
assert.match(build, new RegExp(`Assert-${helperPrefix}AssetSet -Actual \\(Get-${helperPrefix}AssetPaths -RootPath \\$projectRoot\\) -ExpectedAssets \\$requiredSourceAssets`), 'builder rejects an incomplete or extra source tree');
assert.match(build, new RegExp(`Assert-${helperPrefix}AssetSet -Actual \\(Get-${helperPrefix}AssetPaths -RootPath \\$stageCompiled\\) -ExpectedAssets \\$requiredCompiledAssets`), 'builder rejects an incomplete compiler result');
assert.match(build, new RegExp(`Get-${helperPrefix}PackedAssetPaths`), 'builder validates the packed VPK tree');
assert.match(build, /Join-Path \$AddonsPath 'pak89_dir\.vpk'/, 'optional installation targets only the mutually exclusive pak89 destination');
assert.match(build, /Get-Process -Name 'deadlock'/, 'optional installation refuses a running game');
assert.doesNotMatch(build, /showrank_common|topbar_rank_v40_hud|validate-topbar-rank|qollock|showrank_probe/i, 'builder has no old ShowRank bridge, combined HUD, validator, or probe dependency');
assert.match(build, /\$compositionScript\s*=\s*Join-Path \$root 'scripts\\profile-stats-community-composition\.js'/, 'builder resolves the shared profile composition helper');
assert.match(build, /npm --prefix \$projectRoot run validate/, 'builder validates the source package before staging');
assert.match(build, /node \$compositionScript '--host-root' \$projectRoot \$stageSource/, 'staged source composes the current no-missing runtime and style templates');
assert.match(build, /Composed Topbar Rank source/, 'builder validates the composed source inventory');
assert.match(build, new RegExp(`function Invoke-${helperPrefix}ClosureMinification`), 'builder owns an edition-scoped Closure helper');
assert.match(build, /& npx --yes google-closure-compiler --js \$StagedSourcePath --js_output_file \$minifiedPath --externs \$externsPath --compilation_level ADVANCED --language_in ECMASCRIPT5 --language_out ECMASCRIPT5 --warning_level QUIET/, 'builder Closure-minifies the composed runtime with ADVANCED ES5 settings');
assert.match(build, /\$minifiedBytes -lt 512/, 'implausibly small Closure output fails closed');
assert.match(build, /\$minifiedBytes -ge \$readableBytes/, 'Closure output that is not smaller fails closed');
assert.match(build, /& node --check \$minifiedPath/, 'Closure output receives a syntax check');
assert.match(build, /\$readableRuntime = Join-Path \$buildRoot '[^']+\.readable\.js'/, 'builder retains the composed readable runtime outside staged assets');
assert.match(build, /\$stagedRuntime = Join-Path \$stageSource 'panorama\\scripts\\showrank_barebones\.js'/, 'builder targets only the staged Barebones runtime');
assert.match(build, /Invoke-[A-Za-z]+ClosureMinification -ReadableSourcePath \$readableRuntime -StagedSourcePath \$stagedRuntime/, 'builder minifies before Source 2 compilation');
assert.match(build, /\$env:SHOWRANK_BAREBONES_RUNTIME = \$stagedRuntime[\s\S]*?showrank-barebones-runtime\.test\.js[\s\S]*?profile-stats-community-runtime\.test\.js/, 'both runtime adapters execute the minified staged source');
for (const fragment of [
  'ShowRankBarebonesRefresh',
  'ShowRankBarebonesOpenStatlocker',
  'ShowRankBarebonesOpenPlayerProfile',
  'ShowRankBarebonesCopyAccount',
  'ShowRankBarebonesEscapeOpen',
  'ShowRankBarebonesEscapeOut',
]) assert.ok(build.includes(`'${fragment}'`), `Closure output must retain ${fragment}`);
if (ALERT_EDITION) {
  assert.ok(build.includes("'ShowRankBarebonesMissingWindowExpired'"), 'alert Closure output retains the missing-window class');
} else {
  assert.doesNotMatch(build, /ShowRankBarebonesMissingWindowExpired/, 'no-missing Closure guards contain no alert-only fragment');
}

if (ALERT_EDITION) {
  assert.doesNotMatch(build, /topbar_rank_no_missing|topbar_rank_barebones_no_missing_dir/i, 'alert builder has no rank-only project or artifact reference');
} else {
  assert.doesNotMatch(build, /topbar_rank_barebones_dir\.vpk|_topbar_rank_barebones_build/i, 'rank-only builder has no alert artifact or staging reference');
}

assert.strictEqual(
  packageJson.scripts.test,
  'node tests/showrank-barebones-runtime.test.js && node tests/profile-stats-community-runtime.test.js && node tests/topbar-rank-contract.test.js && node tests/topbar-rank-build-contract.test.js',
  'npm test runs runtime identity/cache contracts before integration and build contracts',
);
assert.strictEqual(
  packageJson.scripts.validate,
  'npm test && node --check panorama/scripts/showrank_barebones.js',
  'npm run validate uses only Node and syntax-checks the local runtime',
);

console.log(ALERT_EDITION ? 'no-missing TopBarPlus build contract tests passed' : 'rank-only TopBarPlus build contract tests passed');
