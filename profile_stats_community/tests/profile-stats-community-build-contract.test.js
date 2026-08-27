'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repositoryDir = path.join(__dirname, '..', '..');
const buildPath = path.join(repositoryDir, 'build_profile_stats_community.ps1');
const build = fs.readFileSync(buildPath, 'utf8');

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

assert.match(build, /\. \(Join-Path \$root 'scripts\\source2_package_pipeline\.ps1'\)/, 'the wrapper sources the shared Source2 pipeline helpers');
assert.match(build, /\$moduleRoot\s*=\s*Join-Path \$root 'profile_stats_community'/, 'the source root is the profile stats community package');
assert.match(build, /\$compositionScript\s*=\s*Join-Path \$root 'scripts\\profile-stats-community-composition\.js'/, 'the shared identity-policy composer is explicit');
assert.match(build, /\$vpkOutput\s*=\s*Join-Path \$root 'pak80_dir\.vpk'/, 'the artifact is the root pak80 VPK');
assert.doesNotMatch(build, /pak(?:0[1-9]|[1-7][0-9]|8[1-9])_dir\.vpk/i, 'the wrapper does not target another pak number');
assert.doesNotMatch(build, /^param\(/m, 'the wrapper has no install, deploy, or path override switches');
assert.doesNotMatch(build, /addons|AddonsPath|Install|Deploy|Get-Process\s+-Name\s+'deadlock'|File::Replace/i, 'the wrapper contains no installed-addon or deployment behavior');

assert.deepStrictEqual(
  assignedStringArray('requiredSourceAssets'),
  [
    'panorama/layout/citadel_db_page_profile.xml',
    'panorama/layout/citadel_ui_context_menu_player.xml',
    'panorama/layout/profile_card.xml',
    'panorama/scripts/profile_stats_community.js',
    'panorama/scripts/profile_stats_community_context_menu.js',
    'panorama/styles/profile_stats_community.css',
  ],
  'the source inventory admits exactly the six authored Panorama sources',
);
assert.deepStrictEqual(
  assignedStringArray('requiredCompiledAssets'),
  [
    'panorama/layout/citadel_db_page_profile.vxml_c',
    'panorama/layout/citadel_ui_context_menu_player.vxml_c',
    'panorama/layout/profile_card.vxml_c',
    'panorama/scripts/profile_stats_community.vjs_c',
    'panorama/scripts/profile_stats_community_context_menu.vjs_c',
    'panorama/styles/profile_stats_community.vcss_c',
  ],
  'the compiled inventory admits exactly the six Source 2 resources',
);
assert.deepStrictEqual(
  assignedStringArray('forbiddenPackedAssets'),
  [
    'panorama/layout/citadel_db_page_profile.xml',
    'panorama/layout/citadel_ui_context_menu_player.xml',
    'panorama/layout/profile_card.xml',
    'panorama/scripts/profile_stats_community.js',
    'panorama/scripts/profile_stats_community_context_menu.js',
    'panorama/styles/profile_stats_community.css',
    'AGENTS.md',
    'README.md',
    'package.json',
    'bridge.html',
    'tests/',
  ],
  'the packed forbidden inventory names raw sources and package/document assets',
);

assert.match(build, /function Assert-ProfileStatsAssetSet/, 'asset validation is local and exact');
assert.match(build, /\[System\.Collections\.Generic\.HashSet\[string\]\]::new\(\[System\.StringComparer\]::Ordinal\)/, 'asset validation uses ordinal paths');
assert.match(build, /if \(-not \$actualSet\.Add\(\$asset\)\) \{/, 'asset validation rejects duplicate paths');
assert.match(build, /\$duplicates\.Count -or \$missing\.Count -or \$unexpected\.Count/, 'asset validation rejects missing and extra paths');
assert.match(build, /function Get-ProfileStatsPackedAssetPaths/, 'packed VPK trees are normalized before exact validation');
assert.match(build, /Assert-PackedVpkAssets -Tree \$packedTree -Required \$requiredCompiledAssets -Forbidden \$forbiddenPackedAssets -Label 'Packed Profile Stats VPK'/, 'the packed tree checks required and forbidden assets through the shared helper');
assert.match(build, /Assert-PathUnderRoot -Path \$path -RootPath \$root/, 'all derived paths are guarded under the repository root');
assert.match(build, /Remove-TreeUnderRoot -Path \$buildRoot -RootPath \$root -ExpectedLeaf '_profile_stats_community_build'/, 'staging cleanup uses the guarded shared helper');
assert.match(build, /function Get-ProfileStatsSha256/, 'the staged runtime can be compared with the readable source before minification');
assert.match(build, /Get-ProfileStatsSha256 -Path \$readableRuntime\) -ne \(Get-ProfileStatsSha256 -Path \$stagedRuntime\)/, 'staging must preserve the readable runtime bytes before Closure');
assert.match(build, /Move-Item -LiteralPath \$minifiedPath -Destination \$StagedSourcePath -Force/, 'only the staged runtime is replaced with Closure output');
assert.match(build, /function Invoke-ProfileStatsClosureMinification/, 'the staged runtime is minified through a dedicated Closure step');
assert.match(build, /\[regex\]::Matches\(\[System\.IO\.File\]::ReadAllText\(\$ReadableSourcePath\)/, 'extern generation reads the editable runtime');
assert.ok(build.includes("'\\.([A-Za-z_$][A-Za-z0-9_$]*)'"), 'all readable dot-properties are extracted for extern generation');
assert.match(build, /\$externs\.Add\('var \$;'\)/, 'Panorama $ is declared as an extern');
assert.match(build, /\$externs\.Add\('function DismissAllContextMenus\(\) \{\}'\)/, 'native context dismissal is declared as an extern');
assert.match(build, /\$externs\.Add\('function DropInputFocus\(\) \{\}'\)/, 'native focus release is declared as an extern');
assert.doesNotMatch(build, /function CitadelShowProfilePageForAccount/, 'event-dispatched profile navigation needs no context-local native extern');
assert.match(build, /Object\.prototype\.\$propertyName;/, 'extracted Panorama properties are emitted as Object.prototype externs');
assert.match(build, /Object\.prototype\['\$dynamicLookupKey'\];/, 'external protocol keys are declared as quoted extern properties');
assert.match(build, /& npx --yes google-closure-compiler --js \$StagedSourcePath --js_output_file \$minifiedPath --externs \$externsPath --compilation_level ADVANCED --language_in ECMASCRIPT5 --language_out ECMASCRIPT5 --warning_level QUIET/, 'Closure uses ADVANCED ES5 compilation on the staged runtime');
assert.doesNotMatch(build, /google-closure-compiler --js \$ReadableSourcePath/, 'Closure never minifies the editable source in place');
assert.match(build, /\$minifiedBytes -lt 512/, 'implausibly small Closure output fails closed');
assert.match(build, /\$minifiedBytes -ge \$readableBytes/, 'Closure output that is not smaller fails closed');
assert.match(build, /& node --check \$minifiedPath/, 'minified output receives a syntax check');
assert.match(build, /\$dynamicLookupKeys = @\(/, 'Closure validation declares the external protocol keys used through bracket lookup');
assert.match(build, /\[regex\]::IsMatch\(\$minifiedSource, \$objectKeyPattern\)/, 'Closure output must preserve every dynamic lookup key');
assert.match(build, /Closure Compiler renamed dynamic lookup key/, 'renamed protocol keys fail the build before packing');
assert.match(build, /\$protocolGroupIds\s*=\s*@\(/, 'Closure validation separately tracks protocol group string values');
assert.match(build, /\$stringValuePattern/, 'Closure validation checks quoted group values');
assert.match(build, /Closure Compiler removed protocol group ID/, 'removed protocol group values fail the build before packing');
assert.match(build, /Move-Item -LiteralPath \$minifiedPath -Destination \$StagedSourcePath -Force/, 'only the staged runtime is replaced with Closure output');
assert.match(build, /foreach \(\$temporaryPath in @\(\$externsPath, \$minifiedPath\)\)[\s\S]*?Remove-Item -LiteralPath \$temporaryPath -Force/s, 'temporary Closure files are deleted');

assert.match(build, /& npm --prefix \$moduleRoot run validate/, 'the package validation command is explicit');
assert.match(build, /Copy-Item -LiteralPath \$sourcePath -Destination \$stagedPath -Force/, 'only inventoried source assets are staged');
assert.match(build, /& node \$compositionScript --profile-stats \$stageSource/, 'the private identity policy is composed into both staged runtimes');
assert.match(build, /Profile Stats Community source composition failed/, 'composition failures stop the package build');
assert.match(build, /Copy-Item -LiteralPath \$stagedRuntime -Destination \$readableRuntime -Force/, 'the composed profile runtime is snapshotted before Closure');
assert.match(build, /Copy-Item -LiteralPath \$stagedContextRuntime -Destination \$readableContextRuntime -Force/, 'the composed context runtime is snapshotted before Closure');
assert.match(build, /Invoke-Source2Compiler -CompilerPath \$compiler -SourceDir \$stageSource -RequiredOutputs \$requiredCompiledOutputs -HiddenWindow/, 'the shared Source2 compiler helper is used for all six outputs');
assert.match(build, /Invoke-VpkPack -VpkEditCli \$vpkEditCli -InputDir \$stageCompiled -OutputPath \$vpkOutput/, 'the shared VPK pack helper creates the root artifact');
assert.match(build, /Get-PackedVpkTree -VpkEditCli \$vpkEditCli -VpkPath \$vpkOutput -Source2ViewerPath \$source2Viewer/, 'the packed output is inspected with the shared tree helper');

const validateIndex = indexOfRequired('& npm --prefix $moduleRoot run validate');
const sourceCheckIndex = indexOfRequired("Assert-ProfileStatsAssetSet -Actual (Get-ProfileStatsAssetPaths -RootPath $moduleRoot)");
const stagedCopyIndex = indexOfRequired('Copy-Item -LiteralPath $sourcePath -Destination $stagedPath -Force');
const compositionIndex = indexOfRequired('& node $compositionScript --profile-stats $stageSource');
const hashIndex = indexOfRequired('Get-ProfileStatsSha256 -Path $readableRuntime');
const closureCallIndex = indexOfRequired('Invoke-ProfileStatsClosureMinification -ReadableSourcePath $readableRuntime -StagedSourcePath $stagedRuntime');
const contextHashIndex = indexOfRequired('Get-ProfileStatsSha256 -Path $readableContextRuntime');
const contextClosureCallIndex = indexOfRequired('Invoke-ProfileStatsClosureMinification -ReadableSourcePath $readableContextRuntime -StagedSourcePath $stagedContextRuntime');
const closureRunIndex = indexOfRequired('& npx --yes google-closure-compiler');
const minifiedSyntaxIndex = indexOfRequired('& node --check $minifiedPath');
const minifiedMoveIndex = indexOfRequired('Move-Item -LiteralPath $minifiedPath -Destination $StagedSourcePath -Force');
const compilerIndex = indexOfRequired('Invoke-Source2Compiler -CompilerPath $compiler -SourceDir $stageSource');
const compiledCheckIndex = indexOfRequired("Assert-ProfileStatsAssetSet -Actual (Get-ProfileStatsAssetPaths -RootPath $stageCompiled)");
const packIndex = indexOfRequired('Invoke-VpkPack -VpkEditCli $vpkEditCli -InputDir $stageCompiled');
const treeIndex = indexOfRequired('Get-PackedVpkTree -VpkEditCli $vpkEditCli -VpkPath $vpkOutput');
const packedCheckIndex = indexOfRequired("Assert-ProfileStatsAssetSet -Actual $packedAssets -ExpectedAssets $requiredCompiledAssets -Label 'Packed Profile Stats VPK'");
const forbiddenCheckIndex = indexOfRequired('Assert-PackedVpkAssets -Tree $packedTree -Required $requiredCompiledAssets -Forbidden $forbiddenPackedAssets');
assert.ok(validateIndex < sourceCheckIndex, 'package validation precedes source inventory validation');
assert.ok(sourceCheckIndex < stagedCopyIndex, 'source inventory validation precedes staging');
assert.ok(stagedCopyIndex < compositionIndex && compositionIndex < hashIndex && hashIndex < closureCallIndex && closureCallIndex < contextHashIndex && contextHashIndex < contextClosureCallIndex && contextClosureCallIndex < compilerIndex, 'source copies, identity composition, both hash checks, and both staged Closure invocations precede Source2 compilation');
assert.ok(closureRunIndex < minifiedSyntaxIndex && minifiedSyntaxIndex < minifiedMoveIndex, 'Closure output is syntax-checked before replacing the staged runtime');
assert.ok(minifiedMoveIndex < compilerIndex, 'minified staged runtime precedes Source2 compilation');
assert.ok(compilerIndex < compiledCheckIndex && compiledCheckIndex < packIndex, 'compiled outputs are checked before packing');
assert.ok(packIndex < treeIndex && treeIndex < packedCheckIndex && packedCheckIndex < forbiddenCheckIndex, 'packing precedes exact packed-tree and forbidden-asset checks');

console.log('profile stats community build contract tests passed');
