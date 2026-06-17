param(
    [ValidateSet("all", "normal", "scoreboard_only_topbar", "minify_ranks", "minify_ranks_scoreboard_only_topbar")]
    [string]$Variant = "all",

    [switch]$Install,
    [switch]$KeepStaging,

    [string]$AddonsPath = "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons",

    [int]$CompileTimeoutSeconds = 120
)

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
$modSrc = Join-Path $root "showrank"
$buildRoot = Join-Path $root "_showrank_variant_build"
$compiler = Join-Path $root "sr2compiler\New folder.exe"
$compilerPref = Join-Path $root "sr2compiler\pref.json"
$addons = $AddonsPath
$dateTag = Get-Date -Format "yyyyMMdd_HHmmss"
$showrankScriptNames = @(
    "showrank_common.js",
    "showrank_profile.js",
    "showrank_topbar.js",
    "showrank_escape.js"
)
$showrankScriptRelativeRoot = "panorama\scripts"
$showrankCommonScriptRelative = Join-Path $showrankScriptRelativeRoot "showrank_common.js"

$vpkeditcliCandidates = @(
    (Join-Path $root "passive_items_mod\compiler\vpkeditcli.exe"),
    (Join-Path $root "vpk cli\vpkeditcli.exe"),
    (Join-Path $root "passive_items_mod_release\compiler\vpkeditcli.exe")
)
$vpkeditcli = $vpkeditcliCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

$sevenZipCandidates = @(
    "C:\Program Files\7-Zip\7z.exe",
    "C:\Program Files (x86)\7-Zip\7z.exe",
    (Join-Path $root "7z.exe"),
    (Join-Path $root "tools\7z.exe")
)
$sevenZip = $sevenZipCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

$variantSpecs = @(
    @{
        Id = "normal"
        PublishName = "showrank_normal"
        DisplayName = "ShowRank normal"
        InstallVpkName = "pak89_dir.vpk"
        StageName = "src_normal"
        ScoreboardOnlyTopBar = $false
        MinifyRanks = $false
        Description = "Normal ShowRank: top-bar player ranks appear as soon as the mod resolves them."
    },
    @{
        Id = "scoreboard_only_topbar"
        PublishName = "showrank_scoreboard_only_topbar"
        DisplayName = "ShowRank scoreboard-only top-bar"
        InstallVpkName = "pak89_dir.vpk"
        StageName = "src_scoreboard_only"
        ScoreboardOnlyTopBar = $true
        MinifyRanks = $false
        Description = "Scoreboard-only ShowRank: top-bar player ranks stay hidden until Tab/scoreboard is open, matching team average ranks."
    },
    @{
        Id = "minify_ranks"
        PublishName = "showrank_minify_ranks"
        DisplayName = "ShowRank minify ranks"
        InstallVpkName = "pak89_dir.vpk"
        StageName = "src_minify_ranks"
        ScoreboardOnlyTopBar = $false
        MinifyRanks = $true
        Description = "Minify-ranks ShowRank: player rank images use the small Deadlock API image and top-bar ranks stay visible once resolved."
    },
    @{
        Id = "minify_ranks_scoreboard_only_topbar"
        PublishName = "showrank_minify_ranks_scoreboard_only_topbar"
        DisplayName = "ShowRank minify ranks scoreboard-only top-bar"
        InstallVpkName = "pak89_dir.vpk"
        StageName = "src_minify_ranks_scoreboard_only"
        ScoreboardOnlyTopBar = $true
        MinifyRanks = $true
        Description = "Minify-ranks scoreboard-only ShowRank: player rank images use the small Deadlock API image and top-bar ranks stay hidden until Tab/scoreboard is open."
    }
)

function Get-FullPath {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    return [System.IO.Path]::GetFullPath($Path)
}

function Assert-UnderRoot {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$RootPath
    )

    $resolvedPath = Get-FullPath $Path
    $resolvedRoot = (Get-FullPath $RootPath).TrimEnd('\', '/')
    if ($resolvedPath -eq $resolvedRoot) {
        throw "Refusing to operate on the root folder itself: $resolvedPath"
    }
    if (-not $resolvedPath.StartsWith($resolvedRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing to operate outside root. Path=$resolvedPath Root=$resolvedRoot"
    }
}

function Remove-TreeUnderRoot {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        [Parameter(Mandatory = $true)]
        [string]$RootPath
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        return
    }

    Assert-UnderRoot -Path $Path -RootPath $RootPath
    Remove-Item -LiteralPath $Path -Recurse -Force
}

function Get-ShowRankScriptPaths {
    param(
        [Parameter(Mandatory = $true)]
        [string]$StageSrc
    )

    $paths = @()
    foreach ($scriptName in $showrankScriptNames) {
        $paths += Join-Path $StageSrc (Join-Path $showrankScriptRelativeRoot $scriptName)
    }
    return $paths
}

function Get-ShowRankCompiledScriptPaths {
    param(
        [Parameter(Mandatory = $true)]
        [string]$StageCompiled
    )

    $paths = @()
    foreach ($scriptName in $showrankScriptNames) {
        $compiledName = [System.IO.Path]::ChangeExtension($scriptName, ".vjs_c")
        $paths += Join-Path $StageCompiled (Join-Path $showrankScriptRelativeRoot $compiledName)
    }
    return $paths
}

function Test-AllShowRankCompiledScripts {
    param(
        [Parameter(Mandatory = $true)]
        [string]$StageCompiled
    )

    foreach ($compiledPath in (Get-ShowRankCompiledScriptPaths -StageCompiled $StageCompiled)) {
        if (-not (Test-Path -LiteralPath $compiledPath)) {
            return $false
        }
    }
    return $true
}

function Assert-AllShowRankCompiledScripts {
    param(
        [Parameter(Mandatory = $true)]
        [string]$StageCompiled
    )

    foreach ($compiledPath in (Get-ShowRankCompiledScriptPaths -StageCompiled $StageCompiled)) {
        if (-not (Test-Path -LiteralPath $compiledPath)) {
            throw "Compiled ShowRank script not found: $compiledPath"
        }
    }
}

function Get-DotaRoot {
    if (-not (Test-Path -LiteralPath $compilerPref)) {
        return ""
    }

    $raw = Get-Content -LiteralPath $compilerPref -Raw
    try {
        $pref = $raw | ConvertFrom-Json
        return [string]$pref.directory
    } catch {
        if ($raw -match '"directory"\s*:\s*"([^"]+)"') {
            return $matches[1]
        }
        return ""
    }
}

function Apply-ScoreboardOnlyTopBarVariant {
    param(
        [Parameter(Mandatory = $true)]
        [string]$StageSrc
    )

    $topBarXml = Join-Path $StageSrc "panorama\layout\citadel_hud_top_bar.xml"
    $topBarCss = Join-Path $StageSrc "panorama\styles\showrank_top_bar.css"

    if (-not (Test-Path -LiteralPath $topBarXml)) {
        throw "Top-bar XML missing from stage: $topBarXml"
    }
    if (-not (Test-Path -LiteralPath $topBarCss)) {
        throw "Top-bar CSS missing from stage: $topBarCss"
    }

    $xml = Get-Content -LiteralPath $topBarXml -Raw
    if (-not $xml.Contains("ShowRankTopBarScoreboardOnly")) {
        $patchedXml = $xml.Replace(
            '<CitadelHudTopBar hittest="false"',
            '<CitadelHudTopBar class="ShowRankTopBarScoreboardOnly" hittest="false"'
        )
        if ($patchedXml -eq $xml) {
            throw "Could not mark CitadelHudTopBar with ShowRankTopBarScoreboardOnly"
        }
        Set-Content -LiteralPath $topBarXml -Value $patchedXml -NoNewline
    }

    $css = Get-Content -LiteralPath $topBarCss -Raw
    if ($css.Contains("ShowRankTopBarScoreboardOnly")) {
        return
    }

    $scoreboardOnlyCss = @'

.ShowRankTopBarScoreboardOnly .ShowRankTopBarStatusImage.ShowRankTopBarStatusVisible,
.ShowRankTopBarScoreboardOnly .ShowRankTopBarRankImage.ShowRankTopBarRankVisible
{
	visibility: collapse;
	opacity: 0;
}

.ShowRankTopBarScoreboardOnly.wants_scoreboard .ShowRankTopBarRankImage.ShowRankTopBarRankVisible,
.ShowRankTopBarScoreboardOnly.gScoreboardOpen .ShowRankTopBarRankImage.ShowRankTopBarRankVisible
{
	visibility: visible;
	opacity: 1;
}

.ShowRankTopBarScoreboardOnly.wants_scoreboard .ShowRankTopBarStatusImage.ShowRankTopBarStatusVisible,
.ShowRankTopBarScoreboardOnly.gScoreboardOpen .ShowRankTopBarStatusImage.ShowRankTopBarStatusVisible
{
	visibility: visible;
	opacity: 0.75;
}
'@
    Set-Content -LiteralPath $topBarCss -Value ($css.TrimEnd() + "`r`n" + $scoreboardOnlyCss.TrimStart()) -NoNewline
}

function Apply-MinifyRanksVariant {
    param(
        [Parameter(Mandatory = $true)]
        [string]$StageSrc
    )

    $scriptPath = Join-Path $StageSrc $showrankCommonScriptRelative

    if (-not (Test-Path -LiteralPath $scriptPath)) {
        throw "ShowRank common script missing from stage: $scriptPath"
    }

    $script = Get-Content -LiteralPath $scriptPath -Raw
    if ($script.Contains('/rank-predict/image?size=small')) {
        return
    }

    $patchedScript = $script.Replace(
        'var RANK_IMAGE_URL_SUFFIX = "/rank-predict/image?format=webp";',
        'var RANK_IMAGE_URL_SUFFIX = "/rank-predict/image?size=small";'
    )
    if ($patchedScript -eq $script) {
        throw "Could not patch RANK_IMAGE_URL_SUFFIX for minify-ranks variant"
    }

    Set-Content -LiteralPath $scriptPath -Value $patchedScript -NoNewline
}

function Assert-LatestTopBarContract {
    param(
        [Parameter(Mandatory = $true)]
        [string]$StageSrc,
        [Parameter(Mandatory = $true)]
        [hashtable]$Spec
    )

    $commonScriptPath = Join-Path $StageSrc $showrankCommonScriptRelative
    $scriptPaths = Get-ShowRankScriptPaths -StageSrc $StageSrc
    $topBarXml = Join-Path $StageSrc "panorama\layout\citadel_hud_top_bar.xml"
    $topBarPlayerXml = Join-Path $StageSrc "panorama\layout\citadel_hud_top_bar_player.xml"
    $topBarCss = Join-Path $StageSrc "panorama\styles\showrank_top_bar.css"
    $requiredPaths = @()
    $requiredPaths += $scriptPaths
    $requiredPaths += @($topBarXml, $topBarPlayerXml, $topBarCss)

    foreach ($requiredPath in $requiredPaths) {
        if (-not (Test-Path -LiteralPath $requiredPath)) {
            throw "Required ShowRank variant source missing: $requiredPath"
        }
    }

    $commonScript = Get-Content -LiteralPath $commonScriptPath -Raw
    $xml = Get-Content -LiteralPath $topBarXml -Raw
    $playerXml = Get-Content -LiteralPath $topBarPlayerXml -Raw
    $css = Get-Content -LiteralPath $topBarCss -Raw

    if ($xml.Contains("Press ESC to populate ranks") -or $xml.Contains("ShowRankTopBarEscapePrompt")) {
        throw "Old top-bar ESC populate banner is present in $($Spec.Id)"
    }
    if (-not $playerXml.Contains('id="ShowRankTopBarStatusImage"')) {
        throw "Top-bar status image missing in $($Spec.Id)"
    }
    if (-not $playerXml.Contains("badge_sm_psd.vtex")) {
        throw "Top-bar rank0 placeholder missing in $($Spec.Id)"
    }
    if (-not $playerXml.Contains("ShowRankTopBarStatusVisible")) {
        throw "Top-bar rank0 placeholder is not visible by default in $($Spec.Id)"
    }
    if (-not $commonScript.Contains("TOPBAR_MISSING_RANK_IMAGE_URL")) {
        throw "Bridge missing rank0 placeholder URL constant in $($Spec.Id)"
    }
    if (-not $commonScript.Contains("spinner_png.vtex")) {
        throw "Bridge missing spinner status URL in $($Spec.Id)"
    }
    if (-not $commonScript.Contains("TOPBAR_LOADING_TIMEOUT_SECONDS = 20.0")) {
        throw "Bridge missing 20-second top-bar spinner timeout in $($Spec.Id)"
    }
    foreach ($requiredFragment in @(
        "function IsTopBarPlayerRoot",
        "function ResolveTopBarPlayerRootFromImage",
        "function ApplyEscapePreloadRow",
        "rowMatches = snapshot.matches || []",
        "uniqueTopbarNameCount += 1"
    )) {
        if (-not $commonScript.Contains($requiredFragment)) {
            throw "Bridge missing recent performance contract '$requiredFragment' in $($Spec.Id)"
        }
    }
    foreach ($scriptSourcePath in $scriptPaths) {
        $scriptName = Split-Path -Leaf $scriptSourcePath
        $scriptSource = Get-Content -LiteralPath $scriptSourcePath -Raw
        if (
            $scriptSource.Contains("ShowRankDebug") -or
            $scriptSource.Contains("SHOWRANK-PERF") -or
            $scriptSource.Contains("SHOWRANK-SEQ") -or
            $scriptSource.Contains("ShowRankPerf") -or
            $scriptSource.Contains("RecordShowRankSequence") -or
            $scriptSource.Contains("PrintShowRankPerf") -or
            $scriptSource.Contains("$.Msg(")
        ) {
            throw "Release variant source contains debug/perf logging in $($Spec.Id): $scriptName"
        }
    }
    if (-not $css.Contains("ShowRankTopBarSpinnerSpin")) {
        throw "Top-bar spinner keyframes missing in $($Spec.Id)"
    }
    if (-not $css.Contains("opacity: 0.75;")) {
        throw "Top-bar status opacity 0.75 missing in $($Spec.Id)"
    }
    if ($Spec.ScoreboardOnlyTopBar) {
        if (-not $xml.Contains("ShowRankTopBarScoreboardOnly")) {
            throw "Scoreboard-only variant did not mark the top-bar root in $($Spec.Id)"
        }
        if (-not $css.Contains(".ShowRankTopBarScoreboardOnly .ShowRankTopBarStatusImage.ShowRankTopBarStatusVisible")) {
            throw "Scoreboard-only variant does not hide rank0/status by default in $($Spec.Id)"
        }
        if (-not $css.Contains(".ShowRankTopBarScoreboardOnly.wants_scoreboard .ShowRankTopBarStatusImage.ShowRankTopBarStatusVisible")) {
            throw "Scoreboard-only variant does not reveal rank0/status while scoreboard is open in $($Spec.Id)"
        }
    }
    if ($Spec.MinifyRanks) {
        if (-not $commonScript.Contains('/rank-predict/image?size=small')) {
            throw "Minify-ranks variant did not switch player rank URLs to size=small in $($Spec.Id)"
        }
    } elseif (-not $commonScript.Contains('/rank-predict/image?format=webp')) {
        throw "Normal-rank variant lost player rank format=webp URL in $($Spec.Id)"
    }
}


function New-ShowRankClosureAdvancedExterns {
    $externPath = Join-Path $buildRoot "showrank_closure_advanced.externs.js"
    $externProperties = @(
        "ActivatedWithMouse",
        "AddClass",
        "ApplyEscapePromptVisualState",
        "BHasClass",
        "ClearPlayerListHover",
        "CountTopBarRankState",
        "CustomUIConfig",
        "DispatchEvent",
        "EscapeAutoPopulateFromRowReady",
        "FindChildTraverse",
        "FindChildrenWithClassTraverse",
        "FindTopBarCandidates",
        "GetAttributeString",
        "GetChild",
        "GetChildCount",
        "GetContextPanel",
        "GetDocumentRoot",
        "GetParent",
        "GetRuntimeIdleLoaded",
        "GetState",
        "GuardShowRankAction",
        "InstallShowRankWrapper",
        "IsPanelValid",
        "IsRuntimeIdleLatched",
        "IsShowRankRuntimeIdleCurrent",
        "IsValid",
        "MarkPlayerListHover",
        "NowMs",
        "ReadRegisteredTopBarCandidate",
        "RegisterTopBarPlayer",
        "RemoveClass",
        "Schedule",
        "ScheduleTopBarReadyCheck",
        "SetAttributeString",
        "SetImage",
        "SetPanelAttribute",
        "SourceHasPrefix",
        "StartShowRankAutoloadIntent",
        "StoreManualTarget",
        "TriggerProfileCard",
        "UpdateTeamAverageRanks",
        "ShowRankTriggerProfileCard",
        "ShowRankOpenStatlocker",
        "ShowRankContextMenuTriggerProfileCard",
        "ShowRankContextMenuOpenStatlocker",
        "ShowRankContextMenuOpenDeadlock",
        "ShowRankTopBarRootLoaded",
        "ShowRankRegisterTopBarPlayer",
        "ShowRankMarkTopBarHover",
        "ShowRankMarkPlayerListHover",
        "ShowRankClearPlayerListHover",
        "ShowRankEscapePreloadFromPlayerList",
        "ShowRankRegisterPlayerListRowReady",
        "account",
        "accountPanel",
        "accountPanelText",
        "accountTreeText",
        "accountVersion",
        "accounts",
        "activeSimOpen",
        "activeSpectator",
        "ambiguous",
        "api",
        "at",
        "candidate",
        "candidates",
        "classAccountTexts",
        "completedSimToken",
        "count",
        "depth",
        "duplicateAccount",
        "duplicates",
        "eventArg",
        "eventName",
        "firstAmbiguousName",
        "firstMissingName",
        "gameTimeSec",
        "hoverToken",
        "id",
        "image",
        "index",
        "knownAccountsByNameNorm",
        "knownOrder",
        "label",
        "loaded",
        "localBadge",
        "manualTargetRows",
        "match",
        "matched",
        "matches",
        "media",
        "method",
        "missing",
        "name",
        "nameNorm",
        "names",
        "norms",
        "now",
        "opacity",
        "panel",
        "paneltype",
        "playerListOnly",
        "playerListOnlyFallback",
        "probedRowOpenKeys",
        "profileQuarantine",
        "profileWatchSeq",
        "rankUrl",
        "raw",
        "reason",
        "result",
        "root",
        "row",
        "rowIndex",
        "rowName",
        "rowNameNorm",
        "rows",
        "scoreboardOpen",
        "seconds",
        "seen",
        "seenAt",
        "sharedStoreTargets",
        "sharedStoreTargetsVersion",
        "side",
        "skipped",
        "source",
        "startedAt",
        "startupRole",
        "state",
        "status",
        "steam64",
        "steamid3",
        "storageSource",
        "style",
        "target",
        "targetKind",
        "targetName",
        "teamSide",
        "text",
        "token",
        "topBarBatchDepth",
        "topBarBatchDirty",
        "topBarBatchRoot",
        "topBarCandidateCache",
        "topBarCandidateCacheDirty",
        "topBarCandidateCacheRoot",
        "topbar",
        "topbarIndex",
        "topbarOnly",
        "topbarUid",
        "uid",
        "uniqueMatchedTopbar",
        "uniqueTopbarNames",
        "until",
        "url",
        "verifiedSimOpen",
        "version",
        "visibility",
        "visible"
    )
    $lines = @(
        "/** @externs */",
        "/** @const */ var `$ = {};",
        "`$.GetContextPanel = function() {};",
        "`$.Schedule = function(delay, callback) {};",
        "`$.DispatchEvent = function(opt_a, opt_b, opt_c, opt_d, opt_e) {};",
        "`$.RegisterEventHandler = function(opt_a, opt_b, opt_c, opt_d, opt_e) {};",
        "`$.RegisterForUnhandledEvent = function(opt_a, opt_b, opt_c, opt_d, opt_e) {};",
        "`$.Msg = function(opt_a, opt_b, opt_c, opt_d, opt_e) {};",
        "/** @const */ var GameUI = {};",
        "GameUI.CustomUIConfig = function() {};",
        "/** @const */ var SteamOverlayAPI = {};",
        "SteamOverlayAPI.OpenURL = function(url) {};",
        "SteamOverlayAPI.OpenExternalBrowserURL = function(url) {};",
        "var CitadelShowProfilePageForAccount = function(account) {};",
        "var CitadelTopDownScoreboardPlayerHovered = function() {};"
    )

    foreach ($propertyName in $externProperties) {
        $lines += "Object.prototype.$propertyName;"
    }
    Set-Content -LiteralPath $externPath -Value ($lines -join "`n") -NoNewline
    return $externPath
}

function Assert-ShowRankClosureAdvancedOutput {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ScriptPath,
        [Parameter(Mandatory = $true)]
        [string]$ScriptName
    )

    $source = Get-Content -LiteralPath $ScriptPath -Raw
    $requiredFragments = @("__ShowRankWebMediaBridgeClean")
    if ($source.Length -lt 128) {
        throw "Closure ADVANCED produced suspiciously small ShowRank output: $ScriptName"
    }
    if ($ScriptName -eq "showrank_common.js") {
        $requiredFragments += @(
            "InstallShowRankWrapper",
            "GuardShowRankAction",
            "ShowRankTriggerProfileCard",
            "ShowRankEscapePreloadFromPlayerList"
        )
    } elseif ($ScriptName -eq "showrank_profile.js") {
        $requiredFragments += @(
            "ShowRankTriggerProfileCard",
            "ShowRankContextMenuTriggerProfileCard",
            "ShowRankContextMenuOpenDeadlock"
        )
    } elseif ($ScriptName -eq "showrank_topbar.js") {
        $requiredFragments += @(
            "ShowRankRegisterTopBarPlayer",
            "ShowRankTopBarRootLoaded",
            "ShowRankMarkTopBarHover"
        )
    } elseif ($ScriptName -eq "showrank_escape.js") {
        $requiredFragments += @(
            "ShowRankEscapePreloadFromPlayerList",
            "ShowRankRegisterPlayerListRowReady",
            "ShowRankMarkPlayerListHover"
        )
    }
    foreach ($fragment in $requiredFragments) {
        if (-not $source.Contains($fragment)) {
            throw "Closure ADVANCED output for $ScriptName is missing required runtime fragment: $fragment"
        }
    }
}

function Invoke-ShowRankClosureMinifier {
    param(
        [Parameter(Mandatory = $true)]
        [string]$StageSrc,
        [Parameter(Mandatory = $true)]
        [hashtable]$Spec
    )

    $scriptPaths = Get-ShowRankScriptPaths -StageSrc $StageSrc
    $externsPath = New-ShowRankClosureAdvancedExterns

    Write-Host "[minify:closure-advanced] $($Spec.Id)" -ForegroundColor Cyan
    foreach ($scriptPath in $scriptPaths) {
        $scriptName = Split-Path -Leaf $scriptPath
        $minifiedPath = Join-Path $buildRoot ("$($Spec.Id)_" + [System.IO.Path]::GetFileNameWithoutExtension($scriptName) + ".closure-advanced.js")

        if (-not (Test-Path -LiteralPath $scriptPath)) {
            throw "ShowRank script missing from stage: $scriptPath"
        }
        if (Test-Path -LiteralPath $minifiedPath) {
            Remove-Item -LiteralPath $minifiedPath -Force
        }

        $beforeSize = (Get-Item -LiteralPath $scriptPath).Length
        $closureArgs = @(
            '--yes'
            'google-closure-compiler'
            '--externs'
            $externsPath
            '--js'
            $scriptPath
            '--compilation_level'
            'ADVANCED'
            '--js_output_file'
            $minifiedPath
        )

        & npx @closureArgs
        if ($LASTEXITCODE -ne 0) {
            throw "google-closure-compiler ADVANCED failed for $($Spec.Id) $scriptName with exit code $LASTEXITCODE"
        }
        if (-not (Test-Path -LiteralPath $minifiedPath)) {
            throw "Closure ADVANCED ShowRank script not created: $minifiedPath"
        }
        Assert-ShowRankClosureAdvancedOutput -ScriptPath $minifiedPath -ScriptName $scriptName

        Move-Item -LiteralPath $minifiedPath -Destination $scriptPath -Force
        $afterSize = (Get-Item -LiteralPath $scriptPath).Length
        Write-Host ("  {0}: {1:n1} KB -> {2:n1} KB" -f $scriptName, ($beforeSize / 1KB), ($afterSize / 1KB)) -ForegroundColor Green
    }
    Remove-Item -LiteralPath $externsPath -Force
}

function New-VariantStage {
    param(
        [Parameter(Mandatory = $true)]
        [hashtable]$Spec
    )

    if (-not (Test-Path -LiteralPath $modSrc)) {
        throw "ShowRank source folder not found: $modSrc"
    }

    New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null
    $stageSrc = Join-Path $buildRoot $Spec.StageName
    $stageCompiled = "$stageSrc`_compiled"

    Remove-TreeUnderRoot -Path $stageSrc -RootPath $buildRoot
    Remove-TreeUnderRoot -Path $stageCompiled -RootPath $buildRoot

    Write-Host "[stage] $($Spec.Id)" -ForegroundColor Cyan
    New-Item -ItemType Directory -Path $stageSrc -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $modSrc "panorama") -Destination $stageSrc -Recurse -Force

    if ($Spec.ScoreboardOnlyTopBar) {
        Apply-ScoreboardOnlyTopBarVariant -StageSrc $stageSrc
    }
    if ($Spec.MinifyRanks) {
        Apply-MinifyRanksVariant -StageSrc $stageSrc
    }

    Assert-LatestTopBarContract -StageSrc $stageSrc -Spec $Spec

    Invoke-ShowRankClosureMinifier -StageSrc $stageSrc -Spec $Spec

    return @{
        Source = $stageSrc
        Compiled = $stageCompiled
    }
}

function Invoke-ShowRankResourceCompiler {
    param(
        [Parameter(Mandatory = $true)]
        [string]$StageSrc,
        [Parameter(Mandatory = $true)]
        [string]$StageCompiled,
        [Parameter(Mandatory = $true)]
        [hashtable]$Spec
    )

    $dotaRoot = Get-DotaRoot
    if (-not $dotaRoot) {
        throw "sr2compiler pref.json does not define a Dota install directory for resourcecompiler fallback"
    }

    $addonName = Split-Path -Leaf $StageSrc
    $resourceCompiler = Join-Path $dotaRoot "game\bin\win64\resourcecompiler.exe"
    $gamePath = Join-Path $dotaRoot "game\dota"
    $dotaContentRoot = Join-Path $dotaRoot "content\dota_addons"
    $dotaGameAddonRoot = Join-Path $dotaRoot "game\dota_addons"
    $dotaContentSrc = Join-Path $dotaContentRoot $addonName
    $dotaAddonOut = Join-Path $dotaGameAddonRoot $addonName

    if (-not (Test-Path -LiteralPath $resourceCompiler)) {
        throw "resourcecompiler.exe not found: $resourceCompiler"
    }
    if (-not (Test-Path -LiteralPath $gamePath)) {
        throw "Dota game path not found: $gamePath"
    }
    if (-not (Test-Path -LiteralPath $dotaContentRoot)) {
        throw "Dota content addon root not found: $dotaContentRoot"
    }
    if (-not (Test-Path -LiteralPath $dotaGameAddonRoot)) {
        throw "Dota game addon root not found: $dotaGameAddonRoot"
    }

    Remove-TreeUnderRoot -Path $dotaContentSrc -RootPath $dotaContentRoot
    Remove-TreeUnderRoot -Path $dotaAddonOut -RootPath $dotaGameAddonRoot
    Remove-TreeUnderRoot -Path $StageCompiled -RootPath $buildRoot
    Copy-Item -LiteralPath $StageSrc -Destination $dotaContentSrc -Recurse -Force

    $fileList = Join-Path $buildRoot "$($Spec.Id)_resourcecompiler_filelist.txt"
    Get-ChildItem -LiteralPath (Join-Path $dotaContentSrc "panorama") -Recurse -File |
        Where-Object { $_.Extension -in @(".xml", ".css", ".js") } |
        Sort-Object FullName |
        ForEach-Object { $_.FullName } |
        Set-Content -LiteralPath $fileList

    Write-Host "  [fallback] resourcecompiler filelist" -ForegroundColor Yellow
    & $resourceCompiler -filelist $fileList -game $gamePath -f -nop4
    if ($LASTEXITCODE -ne 0) {
        throw "resourcecompiler failed for $($Spec.Id) with exit code $LASTEXITCODE"
    }

    Assert-AllShowRankCompiledScripts -StageCompiled $dotaAddonOut

    Copy-Item -LiteralPath $dotaAddonOut -Destination $StageCompiled -Recurse -Force

    if (-not $KeepStaging) {
        Remove-TreeUnderRoot -Path $dotaContentSrc -RootPath $dotaContentRoot
        Remove-TreeUnderRoot -Path $dotaAddonOut -RootPath $dotaGameAddonRoot
    }
}

function Invoke-ShowRankCompiler {
    param(
        [Parameter(Mandatory = $true)]
        [string]$StageSrc,
        [Parameter(Mandatory = $true)]
        [string]$StageCompiled,
        [Parameter(Mandatory = $true)]
        [hashtable]$Spec
    )

    if (-not (Test-Path -LiteralPath $compiler)) {
        throw "sr2compiler wrapper not found: $compiler"
    }

    Remove-TreeUnderRoot -Path $StageCompiled -RootPath $buildRoot

    Write-Host "[compile] $($Spec.Id)" -ForegroundColor Cyan
    $proc = Start-Process -FilePath $compiler -ArgumentList "`"$StageSrc`"" -PassThru -WindowStyle Hidden
    $deadline = (Get-Date).AddSeconds($CompileTimeoutSeconds)
    while (-not $proc.HasExited -and (Get-Date) -lt $deadline) {
        Start-Sleep -Milliseconds 500
        if (Test-AllShowRankCompiledScripts -StageCompiled $StageCompiled) {
            Start-Sleep -Seconds 2
            if (-not $proc.HasExited) {
                Write-Host "  [warn] compiler produced all ShowRank script outputs but did not exit; stopping wrapper" -ForegroundColor Yellow
                Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
                $proc.WaitForExit()
            }
            break
        }
    }
    if (-not $proc.HasExited) {
        Write-Host "  [warn] compiler timed out; stopping wrapper" -ForegroundColor Yellow
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        $proc.WaitForExit()
    }

    $expectedScriptsReady = Test-AllShowRankCompiledScripts -StageCompiled $StageCompiled
    if ($proc.ExitCode -ne 0 -and -not $expectedScriptsReady) {
        Write-Host "  [warn] wrapper failed with exit code $($proc.ExitCode); trying direct resourcecompiler" -ForegroundColor Yellow
        Invoke-ShowRankResourceCompiler -StageSrc $StageSrc -StageCompiled $StageCompiled -Spec $Spec
    }

    Assert-AllShowRankCompiledScripts -StageCompiled $StageCompiled
}

function Pack-VariantVpk {
    param(
        [Parameter(Mandatory = $true)]
        [string]$StageCompiled,
        [Parameter(Mandatory = $true)]
        [hashtable]$Spec
    )

    if (-not $vpkeditcli -or -not (Test-Path -LiteralPath $vpkeditcli)) {
        throw "vpkeditcli.exe was not found in passive_items_mod\compiler, vpk cli, or passive_items_mod_release\compiler"
    }

    $packStage = Join-Path $buildRoot ("pack_" + $Spec.Id)
    $vpkOut = Join-Path $packStage $Spec.InstallVpkName
    Remove-TreeUnderRoot -Path $packStage -RootPath $buildRoot
    New-Item -ItemType Directory -Path $packStage -Force | Out-Null
    if (Test-Path -LiteralPath $vpkOut) {
        Remove-Item -LiteralPath $vpkOut -Force
    }

    Write-Host "[pack] $($Spec.Id) -> $($Spec.InstallVpkName)" -ForegroundColor Cyan
    $pack = Start-Process -FilePath $vpkeditcli -ArgumentList "`"$StageCompiled`" -o `"$vpkOut`" -s --no-progress" -PassThru -Wait -NoNewWindow
    if ($pack.ExitCode -ne 0) {
        throw "vpkeditcli failed for $($Spec.Id) with exit code $($pack.ExitCode)"
    }
    if (-not (Test-Path -LiteralPath $vpkOut)) {
        throw "VPK not created: $vpkOut"
    }

    return $vpkOut
}

function Compress-Variant7Zip {
    param(
        [Parameter(Mandatory = $true)]
        [string]$VpkPath,
        [Parameter(Mandatory = $true)]
        [hashtable]$Spec
    )

    if (-not $sevenZip -or -not (Test-Path -LiteralPath $sevenZip)) {
        throw "7z.exe was not found. Install 7-Zip or place 7z.exe under the repo root/tools."
    }
    if (-not (Test-Path -LiteralPath $addons)) {
        throw "Deadlock addons folder not found: $addons"
    }

    $archiveStage = Join-Path $buildRoot ("archive_" + $Spec.Id)
    $archivePath = Join-Path $addons ("$($Spec.PublishName)_$dateTag.7z")
    Remove-TreeUnderRoot -Path $archiveStage -RootPath $buildRoot
    New-Item -ItemType Directory -Path $archiveStage -Force | Out-Null

    Copy-Item -LiteralPath $VpkPath -Destination (Join-Path $archiveStage $Spec.InstallVpkName) -Force
    $readme = @"
$($Spec.DisplayName)

$($Spec.Description)

Install:
Copy $($Spec.InstallVpkName) into:
$addons

Do not install both ShowRank variants at the same time. They use the same pak slot intentionally so switching variants is a direct hot swap.
"@
    Set-Content -LiteralPath (Join-Path $archiveStage "README.txt") -Value $readme.Trim() -NoNewline

    if (Test-Path -LiteralPath $archivePath) {
        Remove-Item -LiteralPath $archivePath -Force
    }

    Write-Host "[7z] $(Split-Path -Leaf $archivePath) -> $addons" -ForegroundColor Cyan
    Push-Location -LiteralPath $archiveStage
    try {
        & $sevenZip a -t7z $archivePath ".\*" -mx=9 -bso0 -bsp0
        if ($LASTEXITCODE -ne 0) {
            throw "7z failed for $($Spec.Id) with exit code $LASTEXITCODE"
        }
    } finally {
        Pop-Location
    }
    if (-not (Test-Path -LiteralPath $archivePath)) {
        throw "7z archive not created: $archivePath"
    }

    return $archivePath
}

function Install-VariantVpk {
    param(
        [Parameter(Mandatory = $true)]
        [string]$VpkPath,
        [Parameter(Mandatory = $true)]
        [hashtable]$Spec
    )

    if (-not (Test-Path -LiteralPath $addons)) {
        throw "Deadlock addons folder not found: $addons"
    }

    $dest = Join-Path $addons $Spec.InstallVpkName
    Write-Host "[install] $($Spec.Id) -> $dest" -ForegroundColor Cyan
    Copy-Item -LiteralPath $VpkPath -Destination $dest -Force
}

if ($Install -and $Variant -eq "all") {
    throw "Use a single -Variant with -Install. Installing all variants would only leave the last copied variant active."
}

$selectedSpecs = if ($Variant -eq "all") {
    $variantSpecs
} else {
    $variantSpecs | Where-Object { $_.Id -eq $Variant }
}

$results = @()
foreach ($spec in $selectedSpecs) {
    $stage = New-VariantStage -Spec $spec
    Invoke-ShowRankCompiler -StageSrc $stage.Source -StageCompiled $stage.Compiled -Spec $spec
    $vpkPath = Pack-VariantVpk -StageCompiled $stage.Compiled -Spec $spec
    $archivePath = Compress-Variant7Zip -VpkPath $vpkPath -Spec $spec
    if ($Install) {
        Install-VariantVpk -VpkPath $vpkPath -Spec $spec
    }
    $results += [pscustomobject]@{
        Variant = $spec.Id
        Vpk = $vpkPath
        Archive = $archivePath
    }
}

if (-not $KeepStaging) {
    Remove-TreeUnderRoot -Path $buildRoot -RootPath $root
}

Write-Host "`nShowRank variants built:" -ForegroundColor Green
$results | Format-Table -AutoSize
