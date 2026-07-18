param(
    [ValidateSet("all", "normal", "scoreboard_only_topbar", "minify_ranks", "minify_ranks_scoreboard_only_topbar")]
    [string[]]$Variant = @("all"),

    [switch]$Install,
    [switch]$KeepStaging,
    [switch]$Diagnostics,
    [switch]$TopbarRank,


    [string]$AddonsPath = "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons",

    [int]$CompileTimeoutSeconds = 120
)

$ErrorActionPreference = 'Stop'

$root = $PSScriptRoot
. (Join-Path $root 'scripts\source2_package_pipeline.ps1')
$modSrc = if ($TopbarRank) { Join-Path $root "topbar_rank" } else { Join-Path $root "showrank" }
$buildRoot = if ($TopbarRank) { Join-Path $root "_topbar_rank_variant_build" } else { Join-Path $root "_showrank_variant_build" }
$topbarCssRelativePath = if ($TopbarRank) { "panorama\styles\topbar_rank_topbar.css" } else { "panorama\styles\showrank_top_bar.css" }
$variantFamilyName = if ($TopbarRank) { "Topbar Rank" } else { "ShowRank" }
$compiler = Join-Path $root "sr2compiler\New folder.exe"
$compilerPref = Join-Path $root "sr2compiler\pref.json"
$addons = $AddonsPath
$dateTag = Get-Date -Format "yyyyMMdd_HHmmss"
$showrankScriptNames = @(
    "showrank_common.js"
)
$topbarRankCompiledScriptNames = @(
    "showrank_common.js",
    "topbar_rank_v40_hud.js",
    "recent_purchases_redux.js",
    "recent_purchases_redux_data.js"
)
$topbarRankCompiledOutputNames = @(
    "showrank_common.vjs_c",
    "topbar_rank_v40_hud.vjs_c",
    "recent_purchases_redux.vjs_c",
    "recent_purchases_redux_data.vjs_c"
)
$showrankScriptRelativeRoot = "panorama\scripts"
$showrankCommonScriptRelative = Join-Path $showrankScriptRelativeRoot "showrank_common.js"
$showrankDiagnosticsTool = Join-Path $modSrc "tools\apply-showrank-diagnostics.js"
$canonicalShowRankCommonScriptPath = Join-Path $root "showrank\panorama\scripts\showrank_common.js"

$vpkeditcli = Get-RepoToolPath -ToolName 'vpkeditcli.exe' -Candidates @(
    (Join-Path $root "passive_items_mod\compiler\vpkeditcli.exe"),
    (Join-Path $root "vpk cli\vpkeditcli.exe"),
    (Join-Path $root "passive_items_mod_release\compiler\vpkeditcli.exe")
)
$sevenZip = Get-RepoToolPath -ToolName '7z.exe' -Candidates @(
    "C:\Program Files\7-Zip\7z.exe",
    "C:\Program Files (x86)\7-Zip\7z.exe",
    (Join-Path $root "7z.exe"),
    (Join-Path $root "tools\7z.exe")
)

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
$topbarRankVariantSpecs = @(
    @{
        Id = "normal"
        PublishName = "topbar_rank_normal"
        DisplayName = "Topbar Rank normal"
        InstallVpkName = "pak89_dir.vpk"
        StageName = "src_normal"
        ScoreboardOnlyTopBar = $false
        MinifyRanks = $false
        Description = "Normal Topbar Rank: the combined top-bar HUD, recent-purchases, and ShowRank assets."
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

function Get-ClosureScriptPaths {
    param(
        [Parameter(Mandatory = $true)]
        [string]$StageSrc
    )

    $paths = @()
    $scriptNames = if ($TopbarRank) { $topbarRankCompiledScriptNames } else { $showrankScriptNames }
    foreach ($scriptName in $scriptNames) {
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
    if ($TopbarRank) {
        foreach ($compiledName in $topbarRankCompiledOutputNames) {
            $paths += Join-Path $StageCompiled (Join-Path $showrankScriptRelativeRoot $compiledName)
        }
    } else {
        foreach ($scriptName in $showrankScriptNames) {
            $compiledName = [System.IO.Path]::ChangeExtension($scriptName, ".vjs_c")
            $paths += Join-Path $StageCompiled (Join-Path $showrankScriptRelativeRoot $compiledName)
        }
    }
    return $paths
}

function Assert-TopbarRankCanonicalCommonScript {
    param(
        [Parameter(Mandatory = $true)]
        [string]$StageSrc
    )

    $stagedPath = Join-Path $StageSrc $showrankCommonScriptRelative
    if (-not (Test-Path -LiteralPath $canonicalShowRankCommonScriptPath)) {
        throw "Canonical ShowRank common script not found: $canonicalShowRankCommonScriptPath"
    }
    if (-not (Test-Path -LiteralPath $stagedPath)) {
        throw "Topbar Rank staged common script not found: $stagedPath"
    }

    $canonicalBytes = [System.IO.File]::ReadAllBytes($canonicalShowRankCommonScriptPath)
    $stagedBytes = [System.IO.File]::ReadAllBytes($stagedPath)
    if ($canonicalBytes.Length -ne $stagedBytes.Length) {
        throw "Topbar Rank staged showrank_common.js differs from the canonical ShowRank script"
    }
    for ($index = 0; $index -lt $canonicalBytes.Length; $index++) {
        if ($canonicalBytes[$index] -ne $stagedBytes[$index]) {
            throw "Topbar Rank staged showrank_common.js differs from the canonical ShowRank script"
        }
    }
}

function Assert-TopbarRankCompiledOutputs {
    param(
        [Parameter(Mandatory = $true)]
        [string]$StageCompiled
    )

    foreach ($compiledPath in (Get-ShowRankCompiledScriptPaths -StageCompiled $StageCompiled)) {
        if (-not (Test-Path -LiteralPath $compiledPath)) {
            throw "Compiled Topbar Rank script not found: $compiledPath"
        }
    }
    $obsoleteBridgePath = Join-Path $StageCompiled (Join-Path $showrankScriptRelativeRoot "topbar_rank_rank_bridge.vjs_c")
    if (Test-Path -LiteralPath $obsoleteBridgePath) {
        throw "Obsolete Topbar Rank bridge must not be present before packing: $obsoleteBridgePath"
    }
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

function Assert-ShowRankReleaseCleanContent {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Content,
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    foreach ($fragment in @(
        "SHOWRANK_VERBOSE_LOGS",
        "SHOWRANK_USAGE_TRACE_LOGS",
        "SHOWRANK_DEBUG_ONLY_EVENTS",
        "$.ShowRankVerboseLogs",
        "$.ShowRankUsageTraceLogs",
        "TraceVerbose",
        "LogVerbose",
        "FlushVerbose",
        "MaybeDumpDiagnosticTree",
        "diagnostic_tree_node",
        "profile_tooltip_debug",
        "optimization_marker",
        "SHOWRANK_ALWAYS_LOG_EVENTS",
        "DEBUG_PREFIX",
        "showrank_startup_logged_",
        "showrank_team_average_log_sig_",
        "showrank_prompt_state_log_sig",
        "LogProfileAccountMissing",
        "ProfileNamesForLog",
        "RankUrlAccount",
        "LogTeamAverageState",
        "LogTopBarWait",
        "LogStartupMarkers",
        "ShowRankDiag",
        "SHOWRANK_DIAG_BUILD",
        "showrank_diag_",
        "TraceDiag"
    )) {
        if ($Content.Contains($fragment)) {
            throw "Release ShowRank script contains diagnostic/debug fragment '$fragment': $Name"
        }
    }

    foreach ($pattern in @(
        '\bShouldLog\s*\(',
        '\bfunction\s+Log\s*\(',
        '\bLog\s*\(\s*["'']',
        'WebMediaDemoBridge',
        'RegisterForUnhandledEvent',
        'DispatchEvent\(\s*["'']ShowRank',
        'RunScriptInPanelContext',
        '\bfetch\s*\(',
        '\bXMLHttpRequest\b',
        '\bAsyncWebRequest\b',
        '\bsetInterval\s*\(',
        '\.src\s*=',
        '\bImage\.src\b',
        '\bSetPanelEvent\b',
        '\$\.Msg\s*\(',
        '\bconsole\.(?:log|warn|error|info|debug)\s*\('
    )) {
        if ($Content -match $pattern) {
            throw "Release ShowRank script contains forbidden diagnostic/debug pattern '$pattern': $Name"
        }
    }
}

function Assert-ShowRankReleaseCleanScripts {
    param(
        [Parameter(Mandatory = $true)]
        [string]$StageSrc
    )

    foreach ($scriptSourcePath in (Get-ShowRankScriptPaths -StageSrc $StageSrc)) {
        $scriptName = Split-Path -Leaf $scriptSourcePath
        $scriptSource = Get-Content -LiteralPath $scriptSourcePath -Raw
        Assert-ShowRankReleaseCleanContent -Content $scriptSource -Name $scriptName
    }
}

function Assert-ShowRankReleaseCleanCompiledScripts {
    param(
        [Parameter(Mandatory = $true)]
        [string]$StageCompiled
    )

    foreach ($scriptName in $showrankScriptNames) {
        $compiledName = [System.IO.Path]::ChangeExtension($scriptName, ".vjs_c")
        $compiledPath = Join-Path $StageCompiled (Join-Path $showrankScriptRelativeRoot $compiledName)
        $compiledName = Split-Path -Leaf $compiledPath
        $compiledSource = Get-Content -LiteralPath $compiledPath -Raw
        Assert-ShowRankReleaseCleanContent -Content $compiledSource -Name $compiledName
    }
}

function Apply-ShowRankDiagnosticsPatch {
    param(
        [Parameter(Mandatory = $true)]
        [string]$StageSrc,
        [Parameter(Mandatory = $true)]
        [hashtable]$Spec
    )

    $scriptPath = Join-Path $StageSrc $showrankCommonScriptRelative
    if (-not (Test-Path -LiteralPath $scriptPath)) {
        throw "ShowRank common script missing from stage: $scriptPath"
    }
    if (-not (Test-Path -LiteralPath $showrankDiagnosticsTool)) {
        throw "ShowRank diagnostics injector missing: $showrankDiagnosticsTool"
    }
    $manifestPath = "$scriptPath.diagnostics.json"

    Write-Host "[diagnostics] $($Spec.Id) D0" -ForegroundColor Yellow
    & node $showrankDiagnosticsTool $scriptPath --tag "D0" --manifest $manifestPath
    if ($LASTEXITCODE -ne 0) {
        throw "ShowRank diagnostics injector failed for $($Spec.Id) with exit code $LASTEXITCODE"
    }
    if (-not (Test-Path -LiteralPath $manifestPath)) {
        throw "ShowRank diagnostics manifest missing for $($Spec.Id): $manifestPath"
    }

    $script = Get-Content -LiteralPath $scriptPath -Raw
    if (-not $script.Contains("SHOWRANK_DIAG_BUILD") -or -not $script.Contains("ShowRankDiag") -or -not ($script -match '\$\.Msg\s*\(')) {
        throw "ShowRank diagnostics patch did not add the expected debug hooks to $($Spec.Id)"
    }
}

function Assert-LatestTopBarContract {
    param(
        [Parameter(Mandatory = $true)]
        [string]$StageSrc,
        [Parameter(Mandatory = $true)]
        [hashtable]$Spec,
        [bool]$AllowDiagnostics = $false
    )

    $commonScriptPath = Join-Path $StageSrc $showrankCommonScriptRelative
    $scriptPaths = Get-ShowRankScriptPaths -StageSrc $StageSrc
    $topBarXml = Join-Path $StageSrc "panorama\layout\citadel_hud_top_bar.xml"
    $topBarCss = Join-Path $StageSrc $topbarCssRelativePath
    $topBarPlayerXml = Join-Path $StageSrc "panorama\layout\citadel_hud_top_bar_player.xml"
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
    if (-not $playerXml.Contains('id="ShowRankTopBarStatusImage"') -or -not $playerXml.Contains("ShowRankTopBarStatusVisible")) {
        throw "Top-bar status placeholder is missing from $($Spec.Id)"
    }
    if (-not $playerXml.Contains("badge_sm_psd.vtex")) {
        throw "Top-bar rank0 placeholder is missing from $($Spec.Id)"
    }
    if (-not $commonScript.Contains("TOPBAR_MISSING_RANK_IMAGE_URL") -or -not $commonScript.Contains("spinner_png.vtex") -or -not $commonScript.Contains("showrank_status_")) {
        throw "Top-bar status flow is missing from $($Spec.Id)"
    }
    foreach ($requiredFragment in @(
        "function IsTopBarPlayerRoot",
        "function ResolveTopBarPlayerRootFromImage",
        "function ApplyEscapePreloadRow",
        "rowMatches = snapshot.matches || []",
        "function ReadTopBarCandidateSnapshot"
    )) {
        if (-not $commonScript.Contains($requiredFragment)) {
            throw "Bridge missing recent performance contract '$requiredFragment' in $($Spec.Id)"
        }
    }
    if (-not $AllowDiagnostics) {
        Assert-ShowRankReleaseCleanScripts -StageSrc $StageSrc
    }
    if ($Spec.ScoreboardOnlyTopBar) {
        if (-not $xml.Contains("ShowRankTopBarScoreboardOnly")) {
            throw "Scoreboard-only variant did not mark the top-bar root in $($Spec.Id)"
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
        "CreatePanel",
        "CustomUIConfig",
        "DispatchEvent",
        "EscapeAutoPopulateFromRowReady",
        "FindChildTraverse",
        "FindChildrenWithClassTraverse",
        "FindTopBarCandidates",
        "FrameTime",
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
        "ShowRankContextMenuOpenStatlocker",
        "ShowRankContextMenuOpenDeadlock",
        "ShowRankMarkTopBarHover",
        "ShowRankMarkPlayerListHover",
        "ShowRankClearPlayerListHover",
        "ShowRankEscapePreloadFromPlayerList",
        "ShowRankRegisterPlayerListRowReady",
        "account",
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
        "/** @const */ var Game = {};",
        "Game.GetMapInfo = function() {};",
        "Game.GetDOTATime = function() {};",
        "Game.GetGameTime = function() {};",
        "Game.Time = 0;",
        "Game.GameTime = 0;",
        "var MOD_ICONS = {};",
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
    if ($source.Length -lt 128) {
        throw "Closure ADVANCED produced suspiciously small output: $ScriptName"
    }

    $requiredFragments = @()
    if ($ScriptName -eq "showrank_common.js") {
        $requiredFragments = @(
            "__ShowRankWebMediaBridgeClean",
            "ShowRankTriggerProfileCard",
            "ShowRankOpenStatlocker",
            "ShowRankContextMenuOpenStatlocker",
            "ShowRankContextMenuOpenDeadlock",
            "ShowRankMarkTopBarHover",
            "ShowRankMarkPlayerListHover",
            "ShowRankClearPlayerListHover",
            "ShowRankEscapePreloadFromPlayerList",
            "ShowRankRegisterPlayerListRowReady"
        )
    } elseif ($ScriptName -eq "topbar_rank_v40_hud.js") {
        $requiredFragments = @("__TopbarRankV40HudRootGeneration", "__TopbarRankV40HudPlayerGeneration", "SpentSoulDisplay")
    } elseif ($ScriptName -eq "recent_purchases_redux.js") {
        $requiredFragments = @("RecentPurchasesContainer", "__TopbarRankRecentPurchaseName", "MOD_ICONS")
    } elseif ($ScriptName -eq "recent_purchases_redux_data.js") {
        $requiredFragments = @("MOD_ICONS")
    } else {
        throw "Closure ADVANCED output guard has no contract for script: $ScriptName"
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

    $scriptPaths = Get-ClosureScriptPaths -StageSrc $StageSrc
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
        $closureInputPath = $scriptPath
        if ($scriptName -eq "recent_purchases_redux_data.js") {
            $closureInputPath = Join-Path $buildRoot ("$($Spec.Id)_recent_purchases_redux_data.closure-input.js")
            $dataSource = Get-Content -LiteralPath $scriptPath -Raw
            $closureDataSource = $dataSource -replace '(?m)^\s*const MOD_ICONS\s*=', 'this["MOD_ICONS"] ='
            if ($closureDataSource -eq $dataSource) {
                throw "Could not preserve MOD_ICONS global in Closure input: $scriptPath"
            }
            Set-Content -LiteralPath $closureInputPath -Value $closureDataSource -NoNewline
        }

        $closureArgs = @(
            '--yes'
            'google-closure-compiler'
            '--externs'
            $externsPath
            '--js'
            $closureInputPath
            '--compilation_level'
            'ADVANCED'
            '--js_output_file'
            $minifiedPath
        )

        $closureExitCode = $null
        try {
            & npx @closureArgs
            $closureExitCode = $LASTEXITCODE
        } finally {
            if ($closureInputPath -ne $scriptPath -and (Test-Path -LiteralPath $closureInputPath)) {
                Remove-Item -LiteralPath $closureInputPath -Force
            }
        }
        if ($closureExitCode -ne 0) {
            throw "google-closure-compiler ADVANCED failed for $($Spec.Id) $scriptName with exit code $closureExitCode"
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
        throw "$variantFamilyName source folder not found: $modSrc"
    }

    New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null
    $stageSrc = Join-Path $buildRoot $Spec.StageName
    $stageCompiled = "$stageSrc`_compiled"

    Remove-TreeUnderRoot -Path $stageSrc -RootPath $buildRoot
    Remove-TreeUnderRoot -Path $stageCompiled -RootPath $buildRoot

    Write-Host "[stage] $($Spec.Id)" -ForegroundColor Cyan
    New-Item -ItemType Directory -Path $stageSrc -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $modSrc "panorama") -Destination $stageSrc -Recurse -Force

    if ($TopbarRank) {
        Assert-TopbarRankCanonicalCommonScript -StageSrc $stageSrc
    } else {
        if ($Spec.ScoreboardOnlyTopBar) {
            Apply-ScoreboardOnlyTopBarVariant -StageSrc $stageSrc
        }
        if ($Spec.MinifyRanks) {
            Apply-MinifyRanksVariant -StageSrc $stageSrc
        }
        if ($Diagnostics) {
            Apply-ShowRankDiagnosticsPatch -StageSrc $stageSrc -Spec $Spec
        }
    }

    Assert-LatestTopBarContract -StageSrc $stageSrc -Spec $Spec -AllowDiagnostics:$Diagnostics

    Invoke-ShowRankClosureMinifier -StageSrc $stageSrc -Spec $Spec
    if (-not $Diagnostics) {
        Assert-ShowRankReleaseCleanScripts -StageSrc $stageSrc
    }

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

    if (-not $KeepStaging -and -not $Diagnostics) {
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

    $packStage = Join-Path $buildRoot ("pack_" + $Spec.Id)
    $vpkOut = Join-Path $packStage $Spec.InstallVpkName
    Remove-TreeUnderRoot -Path $packStage -RootPath $buildRoot
    New-Item -ItemType Directory -Path $packStage -Force | Out-Null
    Write-Host "[pack] $($Spec.Id) -> $($Spec.InstallVpkName)" -ForegroundColor Cyan
    Invoke-VpkPack -VpkEditCli $vpkeditcli -InputDir $StageCompiled -OutputPath $vpkOut

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

Do not install both $variantFamilyName variants at the same time. They use the same pak slot intentionally so switching variants is a direct hot swap.
"@
    Set-Content -LiteralPath (Join-Path $archiveStage "README.txt") -Value $readme.Trim() -NoNewline

    if (Test-Path -LiteralPath $archivePath) {
        Remove-Item -LiteralPath $archivePath -Force
    }

    Write-Host "[7z] $(Split-Path -Leaf $archivePath) -> $addons" -ForegroundColor Cyan
    Compress-Vpk7Zip -SevenZip $sevenZip -InputPath $archiveStage -ArchivePath $archivePath -ExpectedLeaf $Spec.InstallVpkName
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

$requestedVariants = @($Variant)
if ($requestedVariants.Count -eq 0) {
    $requestedVariants = @("all")
}
if ($requestedVariants -contains "all" -and $requestedVariants.Count -gt 1) {
    throw "Use -Variant all by itself, or pass one or more explicit variant ids."
}

$buildsAllVariants = ($requestedVariants.Count -eq 1 -and $requestedVariants[0] -eq "all")
if ($Install -and ($buildsAllVariants -or $requestedVariants.Count -ne 1)) {
    throw "Use a single explicit -Variant with -Install. Installing multiple variants would only leave the last copied variant active."
}
if ($Diagnostics -and ($buildsAllVariants -or $requestedVariants.Count -ne 1)) {
    throw "Use a single explicit -Variant with -Diagnostics. Diagnostic builds are temporary and must not publish multiple release variants."
}
if ($TopbarRank -and ($requestedVariants.Count -ne 1 -or $requestedVariants[0] -ne "normal")) {
    throw "Topbar Rank mode supports exactly -Variant normal."
}
if ($TopbarRank -and $Diagnostics) {
    throw "Topbar Rank mode does not support -Diagnostics."
}

$selectedSpecs = if ($buildsAllVariants) {
    $variantSpecs
} else {
    $variantSpecs | Where-Object { $requestedVariants -contains $_.Id }
}
if ($TopbarRank) {
    $selectedSpecs = $topbarRankVariantSpecs
}


$results = @()
foreach ($spec in $selectedSpecs) {
    $stage = New-VariantStage -Spec $spec
    Invoke-ShowRankCompiler -StageSrc $stage.Source -StageCompiled $stage.Compiled -Spec $spec
    if ($TopbarRank) {
        Assert-TopbarRankCompiledOutputs -StageCompiled $stage.Compiled
    }
    if (-not $Diagnostics) {
        Assert-ShowRankReleaseCleanCompiledScripts -StageCompiled $stage.Compiled
    }
    $vpkPath = Pack-VariantVpk -StageCompiled $stage.Compiled -Spec $spec
    if ($Diagnostics) {
        $diagnosticArchiveStage = Join-Path $buildRoot ("archive_" + $spec.Id)
        Remove-TreeUnderRoot -Path $diagnosticArchiveStage -RootPath $buildRoot
        Write-Host "[diagnostics] archive skipped; VPK remains in the retained build stage" -ForegroundColor Yellow
        $archivePath = "<diagnostic build; archive skipped>"
    } else {
        $archivePath = Compress-Variant7Zip -VpkPath $vpkPath -Spec $spec
    }
    if ($Install) {
        Install-VariantVpk -VpkPath $vpkPath -Spec $spec
    }
    $results += [pscustomobject]@{
        Variant = $spec.Id
        Vpk = $vpkPath
        Archive = $archivePath
    }
}

if (-not $KeepStaging -and -not $Diagnostics) {
    Remove-TreeUnderRoot -Path $buildRoot -RootPath $root
}

Write-Host "`n$variantFamilyName variants built:" -ForegroundColor Green
$results | Format-Table -AutoSize
