'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const packageDir = path.join(__dirname, '..');
const repositoryDir = path.join(packageDir, '..');
const buildPath = path.join(repositoryDir, 'build_showrank_barebones.ps1');
const build = fs.readFileSync(buildPath, 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
const runtimeTest = fs.readFileSync(path.join(packageDir, 'tests', 'showrank-barebones-runtime.test.js'), 'utf8');
const profileRuntimeTest = fs.readFileSync(path.join(packageDir, 'tests', 'profile-stats-community-runtime.test.js'), 'utf8');
const profileRuntimeOracle = fs.readFileSync(path.join(repositoryDir, 'scripts', 'profile-stats-community-runtime-oracle.js'), 'utf8');
const compositionPath = path.join(repositoryDir, 'scripts', 'profile-stats-community-composition.js');
const compositionSource = fs.readFileSync(compositionPath, 'utf8');
const composition = require(compositionPath);
const runtimeTemplate = fs.readFileSync(path.join(packageDir, 'panorama', 'scripts', 'showrank_barebones.js'), 'utf8');
const styleTemplate = fs.readFileSync(path.join(packageDir, 'panorama', 'styles', 'showrank_barebones_topbar.css'), 'utf8');
const composedSources = composition.composeBarebonesSources(repositoryDir);


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

assert.match(build, /param\(\s*\[switch\]\$Install,\s*\[switch\]\$KeepStaging,\s*\[string\]\$AddonsPath\s*=\s*"G:\\SteamLibrary\\steamapps\\common\\Deadlock\\game\\citadel\\addons"\s*\)/s, 'the dedicated build supports only explicit install, staging, and addons-path modes');
assert.match(build, /\$barebonesRoot\s*=\s*Join-Path \$root 'showrank_barebones'/, 'the source root is the barebones package');
assert.match(build, /\$vpkOutput\s*=\s*Join-Path \$root 'showrank_barebones_dir\.vpk'/, 'the artifact has its dedicated name');
assert.match(build, /\$compositionScript\s*=\s*Join-Path \$root 'scripts\\profile-stats-community-composition\.js'/, 'the build uses the shared canonical composition module');
assert.doesNotMatch(build, /qollock|showrank_probe|showrank_variants|showrank_common|showrank[\\/]panorama/i, 'the build has no QOLLOCK, active ShowRank, or probe source dependency');
assert.doesNotMatch(build, /\$Diagnostics|diagnostic|apply-missing-diagnostics/i, 'the release build contains no stage-only missing diagnostic infrastructure');

assert.deepStrictEqual(
  assignedStringArray('requiredSourceAssets'),
  [
    'panorama/layout/profile_card.xml',
    'panorama/layout/citadel_db_page_profile.xml',
    'panorama/layout/citadel_ui_context_menu_player.xml',
    'panorama/layout/citadel_hud_top_bar.xml',
    'panorama/layout/citadel_hud_top_bar_player.xml',
    'panorama/layout/hud_escape_menu.xml',
    'panorama/layout/players_list_entry.xml',
    'panorama/scripts/showrank_barebones.js',
    'panorama/styles/showrank_barebones_topbar.css',
  ],
  'the source inventory admits exactly the nine barebones assets',
);
assert.deepStrictEqual(
  assignedStringArray('requiredCompiledAssets'),
  [
    'panorama/layout/profile_card.vxml_c',
    'panorama/layout/citadel_db_page_profile.vxml_c',
    'panorama/layout/citadel_ui_context_menu_player.vxml_c',
    'panorama/layout/citadel_hud_top_bar.vxml_c',
    'panorama/layout/citadel_hud_top_bar_player.vxml_c',
    'panorama/layout/hud_escape_menu.vxml_c',
    'panorama/layout/players_list_entry.vxml_c',
    'panorama/scripts/showrank_barebones.vjs_c',
    'panorama/styles/showrank_barebones_topbar.vcss_c',
  ],
  'the compiled inventory admits exactly the nine expected Source 2 assets',
);
assert.match(build, /Assert-BarebonesAssetSet -Actual \(Get-BarebonesAssetPaths -RootPath \$barebonesRoot\) -ExpectedAssets \$requiredSourceAssets -Label 'Barebones source package'/, 'the full source inventory is rejected unless exact');
assert.match(build, /Assert-BarebonesAssetSet -Actual \(Get-BarebonesAssetPaths -RootPath \$stageSource\) -ExpectedAssets \$requiredSourceAssets -Label 'Composed barebones source'/, 'composed staging is rejected unless exact');

assert.match(build, /\[System\.Collections\.Generic\.HashSet\[string\]\]::new\(\[System\.StringComparer\]::Ordinal\)/, 'asset validation uses ordinal paths');
assert.match(build, /if \(-not \$actualSet\.Add\(\$asset\)\) \{ \$duplicates\.Add\(\$asset\) \}/, 'asset validation rejects duplicate paths');
assert.match(build, /\$missing\.Count -or \$unexpected\.Count/, 'asset validation rejects missing and extra paths');
assert.match(build, /Get-BarebonesPackedAssetPaths/, 'packed VPK trees are normalized before validation');
assert.match(build, /function Invoke-BarebonesClosureMinification/, 'the staged runtime is minified through a dedicated Closure step');
assert.match(build, /& npx --yes google-closure-compiler --js \$StagedSourcePath --js_output_file \$minifiedPath --externs \$externsPath --compilation_level ADVANCED --language_in ECMASCRIPT5 --language_out ECMASCRIPT5 --warning_level QUIET/, 'Closure uses ADVANCED ES5 compilation with quiet warnings on the staged source');
assert.doesNotMatch(build, /google-closure-compiler --js \$ReadableSourcePath/, 'Closure never minifies the editable source');
assert.match(build, /\[regex\]::Matches\(\[System\.IO\.File\]::ReadAllText\(\$ReadableSourcePath\)/, 'extern generation reads the readable source');
assert.ok(build.includes("'\\.([A-Za-z_$][A-Za-z0-9_$]*)'"), 'all readable dot-properties are extracted for extern generation');
assert.match(build, /\$externs\.Add\('var \$;'\)/, 'Panorama $ is declared as an extern');
assert.match(build, /\$externs\.Add\('function DismissAllContextMenus\(\) \{\}'\)/, 'native context dismissal is declared as an extern');
assert.match(build, /\$externs\.Add\('function DropInputFocus\(\) \{\}'\)/, 'native focus release is declared as an extern');
assert.match(build, /\$externs\.Add\("Object\.prototype\.\$propertyName;"\)/, 'extracted Panorama properties are emitted as Object.prototype externs');
assert.match(build, /Object\.prototype\['\$dynamicLookupKey'\];/, 'external profile protocol keys are emitted as quoted extern properties');
assert.match(build, /\$dynamicLookupKeys\s*=\s*@\(/, 'the merged Closure step declares profile protocol keys');
assert.match(build, /Closure Compiler renamed dynamic lookup key/, 'renamed profile protocol keys fail the build');
assert.match(build, /\$protocolGroupIds\s*=\s*@\(/, 'the merged Closure step separately tracks profile group IDs');
assert.match(build, /\$stringValuePattern/, 'the merged Closure step checks quoted profile group values');
assert.match(build, /Closure Compiler removed protocol group ID/, 'removed profile group values fail the build');
assert.match(build, /\$externsPath = Join-Path \$TemporaryRoot 'showrank_barebones\.externs\.js'/, 'externs are generated outside the staged asset tree');
assert.match(build, /\$minifiedPath = Join-Path \$TemporaryRoot 'showrank_barebones\.min\.js'/, 'Closure output is generated outside the staged asset tree');
assert.match(build, /if \(-not \(Test-Path -LiteralPath \$minifiedPath\)\)/, 'missing Closure output fails closed');
assert.match(build, /\$minifiedBytes -lt 512/, 'implausibly small Closure output fails closed');
assert.match(build, /\$minifiedBytes -ge \$readableBytes/, 'Closure output that is not smaller fails closed');
assert.match(build, /& node --check \$minifiedPath/, 'minified output receives a syntax check');
for (const fragment of [
  'ShowRankBarebonesRefresh',
  'ShowRankBarebonesOpenStatlocker',
  'ShowRankBarebonesOpenPlayerProfile',
  'ShowRankBarebonesCopyAccount',
  'ShowRankBarebonesEscapeOpen',
  'ShowRankBarebonesEscapeOut',
  'ShowRankBarebonesMissingWindowExpired',
]) {
  assert.ok(build.includes(`'${fragment}'`), `Closure output must retain ${fragment}`);
}
assert.match(build, /Move-Item -LiteralPath \$minifiedPath -Destination \$StagedSourcePath -Force/, 'only the staged runtime is replaced with Closure output');
assert.match(build, /foreach \(\$temporaryPath in @\(\$externsPath, \$minifiedPath\)\)[\s\S]*?Remove-Item -LiteralPath \$temporaryPath -Force/s, 'temporary extern and output files are deleted');
assert.match(runtimeTest, /const runtimePath = process\.env\.SHOWRANK_BAREBONES_RUNTIME;/, 'runtime tests accept an explicit staged-runtime source');
assert.match(runtimeTest, /composition\.composeBarebonesSources\(repositoryDir\)\.runtime/, 'readable runtime behavior uses canonical composition');
assert.match(profileRuntimeTest, /var runtimePath = process\.env\.SHOWRANK_BAREBONES_RUNTIME;/, 'profile runtime tests accept the same staged-runtime source');
assert.match(profileRuntimeTest, /runtimeAdapter\.source = composition\.composeBarebonesSources\(repositoryDir\)\.runtime/, 'the readable profile adapter uses canonical composition');
assert.match(profileRuntimeTest, /contextPanelType:\s*"CitadelProfilePage"/, 'the merged profile adapter enters through the production profile-page role');
assert.doesNotMatch(profileRuntimeTest, /PROFILE_STATS_COMMUNITY_MODULE_(?:START|END)/, 'profile runtime behavior never depends on copied-module markers');
assert.match(profileRuntimeOracle, /runtimeAdapter\.source === undefined \? fs\.readFileSync\(sourcePath, "utf8"\) : runtimeAdapter\.source/, 'the shared oracle executes a complete path or composed source adapter');
assert.strictEqual([...profileRuntimeOracle.matchAll(/\btest\("/g)].length, 21, 'the shared oracle owns exactly the twenty-one profile scenarios');
assert.strictEqual(runtimeTemplate.split(composition.RUNTIME_PLACEHOLDER).length - 1, 1, 'the runtime template has one comparison placeholder');
assert.strictEqual(runtimeTemplate.split(composition.IDENTITY_POLICY_PLACEHOLDER).length - 1, 1, 'the runtime template has one identity-policy placeholder');
assert.strictEqual(styleTemplate.split(composition.STYLE_PLACEHOLDER).length - 1, 1, 'the style template has one composition placeholder');
assert.doesNotMatch(composedSources.runtime, /PROFILE_STATS_COMMUNITY_RUNTIME:|VIEWED_PROFILE_IDENTITY_POLICY:/, 'readable runtime composition resolves both placeholders');
assert.doesNotMatch(composedSources.style, /PROFILE_STATS_COMMUNITY_STYLES:/, 'readable style composition resolves its placeholder');
assert.strictEqual((composedSources.runtime.match(/var viewedProfileIdentityPolicy/g) || []).length, 1, 'barebones composition emits one private identity-policy instance');
assert.throws(() => composition.composeText('missing', 'fragment', 'TOKEN', 'test'), /exactly once/, 'missing placeholders fail closed');
assert.throws(() => composition.composeText('TOKEN TOKEN', 'fragment', 'TOKEN', 'test'), /exactly once/, 'duplicate placeholders fail closed');
assert.match(compositionSource, /fs\.writeFileSync\(runtimeOutput, composition\.runtime, 'utf8'\)/, 'the CLI writes composed runtime text as UTF-8');
assert.match(compositionSource, /fs\.writeFileSync\(contextRuntimeOutput, composition\.contextRuntime, 'utf8'\)/, 'the CLI writes the standalone composed context runtime as UTF-8');
assert.match(compositionSource, /fs\.writeFileSync\(styleOutput, composition\.style, 'utf8'\)/, 'the CLI writes composed style text as UTF-8');

const validateIndex = indexOfRequired('& npm --prefix $barebonesRoot run validate');
const stagedCopyIndex = indexOfRequired('Copy-Item -LiteralPath $sourcePath -Destination $stagedPath -Force');
const compositionIndex = indexOfRequired('& node $compositionScript $stageSource');
const readableCopyIndex = indexOfRequired('Copy-Item -LiteralPath $stagedRuntime -Destination $readableRuntime -Force');
const closureRunIndex = indexOfRequired('& npx --yes google-closure-compiler');
const minifiedSyntaxIndex = indexOfRequired('& node --check $minifiedPath');
const minifiedMoveIndex = indexOfRequired('Move-Item -LiteralPath $minifiedPath -Destination $StagedSourcePath -Force');
const minifyCallIndex = indexOfRequired('Invoke-BarebonesClosureMinification -ReadableSourcePath $readableRuntime -StagedSourcePath $stagedRuntime');
const runtimeSmokeIndex = indexOfRequired("& node (Join-Path $barebonesRoot 'tests\\showrank-barebones-runtime.test.js')");
const profileRuntimeSmokeIndex = indexOfRequired("& node (Join-Path $barebonesRoot 'tests\\profile-stats-community-runtime.test.js')");
const compilerIndex = indexOfRequired('Invoke-Source2Compiler -CompilerPath $compiler -SourceDir $stageSource');
const packIndex = indexOfRequired('Invoke-VpkPack -VpkEditCli $vpkEditCli -InputDir $stageCompiled');
assert.ok(validateIndex < stagedCopyIndex, 'readable canonical composition validation precedes staging');
assert.ok(stagedCopyIndex < compositionIndex && compositionIndex < readableCopyIndex && readableCopyIndex < minifyCallIndex, 'canonical sources compose and are snapshotted before Closure');
assert.ok(closureRunIndex < minifiedSyntaxIndex && minifiedSyntaxIndex < minifiedMoveIndex, 'Closure output is syntax-checked before replacing the staged runtime');
assert.ok(minifyCallIndex < runtimeSmokeIndex, 'the composed staged runtime is minified before its VM smoke tests');
assert.ok(runtimeSmokeIndex < profileRuntimeSmokeIndex && profileRuntimeSmokeIndex < compilerIndex, 'both minified runtime smoke tests precede Source2 compilation');
assert.ok(compilerIndex < packIndex, 'Source2 compilation precedes strict packing');

assert.match(build, /Invoke-Source2Compiler[\s\S]*?Assert-BarebonesAssetSet -Actual \(Get-BarebonesAssetPaths -RootPath \$stageCompiled\) -ExpectedAssets \$requiredCompiledAssets -Label 'Compiled barebones output'/, 'compiler output is strictly checked');
assert.match(build, /Invoke-VpkPack[\s\S]*?Assert-BarebonesAssetSet -Actual \(Get-BarebonesPackedAssetPaths -Tree \$packedTree\) -ExpectedAssets \$requiredCompiledAssets -Label 'Packed barebones VPK'/, 'packed artifact is strictly checked');
assert.doesNotMatch(build, /Compress-Vpk7Zip|\b7z(?:\.exe)?\b/i, 'the dedicated pipeline creates no archive');

assert.match(build, /function Assert-DeadlockClosed/, 'installation checks that Deadlock is closed');
assert.match(build, /Get-Process -Name 'deadlock'/, 'installation detects the Deadlock process');
assert.strictEqual((build.match(/Assert-DeadlockClosed/g) || []).length, 3, 'installation rechecks Deadlock immediately before replacing pak89');
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
  'node tests/showrank-barebones-runtime.test.js && node tests/profile-stats-community-runtime.test.js && node tests/showrank-barebones-contract.test.js && node tests/showrank-barebones-build-contract.test.js',
  'npm test runs ShowRank behavior, profile comparison behavior, XML, then build contracts',
);

assert.strictEqual(
  packageJson.scripts.validate,
  'npm test && node --check panorama/scripts/showrank_barebones.js',
  'npm validation runs the package contract suite and checks the sole runtime syntax',
);

console.log('showrank barebones build contract tests passed');
