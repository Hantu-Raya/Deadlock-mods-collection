'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const packageDir = path.join(__dirname, '..');
const repositoryDir = path.join(packageDir, '..');
const buildPath = path.join(repositoryDir, 'build_showrank_barebones.ps1');
const build = fs.readFileSync(buildPath, 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));

function assignedStringArray(name) {
  const assignment = new RegExp(`\\$${name}\\s*=\\s*@\\(([\\s\\S]*?)\\n\\)`).exec(build);
  assert.ok(assignment, `${name} is declared as a literal asset inventory`);
  return [...assignment[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

function indexOfRequired(fragment) {
  const index = build.indexOf(fragment);
  assert.notStrictEqual(index, -1, `build script contains ${fragment}`);
  return index;
}

assert.match(build, /param\(\s*\[switch\]\$Install,\s*\[switch\]\$KeepStaging,/s, 'the dedicated build supports -Install and -KeepStaging');
assert.match(build, /\$barebonesRoot\s*=\s*Join-Path \$root 'showrank_barebones'/, 'the source root is the barebones package');
assert.match(build, /\$vpkOutput\s*=\s*Join-Path \$root 'showrank_barebones_dir\.vpk'/, 'the artifact has its dedicated name');
assert.doesNotMatch(build, /qollock|showrank_probe|showrank_variants|showrank_common|showrank[\\/]panorama/i, 'the build has no QOLLOCK, active ShowRank, or probe source dependency');

assert.deepStrictEqual(
  assignedStringArray('requiredSourceAssets'),
  [
    'panorama/layout/profile_card.xml',
    'panorama/layout/citadel_hud_top_bar_player.xml',
    'panorama/layout/hud_escape_menu.xml',
    'panorama/layout/players_list_entry.xml',
    'panorama/scripts/showrank_barebones.js',
    'panorama/styles/showrank_barebones_topbar.css',
  ],
  'the source inventory admits exactly the six barebones assets',
);
assert.deepStrictEqual(
  assignedStringArray('requiredCompiledAssets'),
  [
    'panorama/layout/profile_card.vxml_c',
    'panorama/layout/citadel_hud_top_bar_player.vxml_c',
    'panorama/layout/hud_escape_menu.vxml_c',
    'panorama/layout/players_list_entry.vxml_c',
    'panorama/scripts/showrank_barebones.vjs_c',
    'panorama/styles/showrank_barebones_topbar.vcss_c',
  ],
  'the compiled inventory admits exactly the six expected Source 2 assets',
);
assert.match(build, /Assert-BarebonesAssetSet -Actual \(Get-BarebonesAssetPaths -RootPath \$barebonesRoot\) -ExpectedAssets \$requiredSourceAssets -Label 'Barebones source package'/, 'the full source inventory is rejected unless exact');
assert.match(build, /Assert-BarebonesAssetSet -Actual \(Get-BarebonesAssetPaths -RootPath \$stageSource\) -ExpectedAssets \$requiredSourceAssets -Label 'Staged barebones source'/, 'staging is rejected unless exact');

assert.match(build, /\[System\.Collections\.Generic\.HashSet\[string\]\]::new\(\[System\.StringComparer\]::Ordinal\)/, 'asset validation uses ordinal paths');
assert.match(build, /if \(-not \$actualSet\.Add\(\$asset\)\) \{ \$duplicates\.Add\(\$asset\) \}/, 'asset validation rejects duplicate paths');
assert.match(build, /\$missing\.Count -or \$unexpected\.Count/, 'asset validation rejects missing and extra paths');
assert.match(build, /Get-BarebonesPackedAssetPaths/, 'packed VPK trees are normalized before validation');
assert.match(build, /Invoke-Source2Compiler[\s\S]*?Assert-BarebonesAssetSet -Actual \(Get-BarebonesAssetPaths -RootPath \$stageCompiled\) -ExpectedAssets \$requiredCompiledAssets -Label 'Compiled barebones output'/, 'compiler output is strictly checked');
assert.match(build, /Invoke-VpkPack[\s\S]*?Assert-BarebonesAssetSet -Actual \(Get-BarebonesPackedAssetPaths -Tree \$packedTree\) -ExpectedAssets \$requiredCompiledAssets -Label 'Packed barebones VPK'/, 'packed artifact is strictly checked');
assert.doesNotMatch(build, /Compress-Vpk7Zip|\b7z(?:\.exe)?\b/i, 'the dedicated pipeline creates no archive');

assert.match(build, /function Assert-DeadlockClosed/, 'installation checks that Deadlock is closed');
assert.match(build, /Get-Process -Name 'deadlock'/, 'installation detects the Deadlock process');
assert.match(build, /\$destination\s*=\s*Join-Path \$AddonsPath 'pak89_dir\.vpk'/, 'installation targets the requested pak');
assert.match(build, /\$temporary\s*=\s*Join-Path \$AddonsPath 'pak89_dir\.showrank-barebones\.tmp\.vpk'/, 'installation uses a named temporary artifact');
assert.match(build, /\$replaceBackup\s*=\s*Join-Path \$AddonsPath 'pak89_dir\.showrank-barebones\.replace-backup\.tmp\.vpk'/, 'replacement uses a named recoverable backup');
assert.match(build, /Copy-Item -LiteralPath \$SourceVpk -Destination \$temporary -Force/, 'installation copies to a temporary artifact first');
assert.match(build, /\$sourceHash\.Equals\(\$temporaryHash, \[System\.StringComparison\]::OrdinalIgnoreCase\)/, 'temporary installation hash must match the built artifact');
assert.match(build, /Get-PackedVpkTree -VpkEditCli \$vpkEditCli -VpkPath \$temporary -Source2ViewerPath \$source2Viewer/, 'temporary installation tree is inspected');
assert.match(build, /Assert-BarebonesAssetSet -Actual \(Get-BarebonesPackedAssetPaths -Tree \$temporaryTree\) -ExpectedAssets \$requiredCompiledAssets -Label 'Temporary barebones VPK'/, 'temporary installation tree is strictly checked');

const replaceIndex = indexOfRequired('[System.IO.File]::Replace($temporary, $destination, $replaceBackup, $true)');
const removeBackupIndex = indexOfRequired('Remove-Item -LiteralPath $replaceBackup -Force');
assert.ok(removeBackupIndex > replaceIndex, 'the transient replacement backup is removed only after a successful atomic replace');
assert.match(build, /function Remove-BarebonesInstallTemporary[\s\S]*?Assert-PathUnderRoot -Path \$Path -RootPath \$AddonsRoot[\s\S]*?pak89_dir\.showrank-barebones\.tmp\.vpk/s, 'temporary cleanup is path-guarded');
assert.match(build, /catch \{\s*Remove-BarebonesInstallTemporary -Path \$temporary -AddonsRoot \$AddonsPath\s*throw/s, 'failed installation removes only its guarded temporary artifact and preserves the replacement backup');
assert.match(build, /if \(-not \$KeepStaging\) \{\s*Remove-TreeUnderRoot -Path \$buildRoot -RootPath \$root -ExpectedLeaf '_showrank_barebones_build'/s, '-KeepStaging controls guarded staging cleanup');

assert.strictEqual(
  packageJson.scripts.test,
  'node tests/showrank-barebones-runtime.test.js && node tests/showrank-barebones-contract.test.js && node tests/showrank-barebones-build-contract.test.js',
  'npm test runs runtime, XML, then build-contract tests in that order',
);

console.log('showrank barebones build contract tests passed');
