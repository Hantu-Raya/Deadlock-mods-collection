[CmdletBinding()]
param(
    [switch]$SkipDeploy,
    # Leave out the play modes added after Jul 2025 (Ranked, Street Brawl).
    [switch]$Strict
)

# pak04 Old Main Menu: the Jul 2025 (build 5712) Deadlock main menu on the current client.
# Old images and movies the game no longer ships come from assets.json sources (a Jul 2025 depot download
# first); each is CRC/size checked, and a missing image falls back to current art (see RESEARCH.md).
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
. (Join-Path $root 'scripts\source2_package_pipeline.ps1')
$mod = Join-Path $root 'old_main_menu'
$stage = Join-Path $root '_old_main_menu_build'
$source = Join-Path $stage 'old_main_menu'
$compiled = Join-Path $stage 'old_main_menu_compiled'
$out = Join-Path $root 'pak04_dir.vpk'
$addons = 'G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons'
$destination = Join-Path $addons 'pak04_dir.vpk'
$packer = Get-RepoToolPath -ToolName 'vpkeditcli.exe' -Candidates @(
    (Join-Path $root 'vpk cli\vpkeditcli.exe'),
    (Join-Path $root 'passive_items_mod\compiler\vpkeditcli.exe')
)
$viewer = Get-RepoToolPath -ToolName 'Source2Viewer-CLI.exe' -Candidates @(
    (Join-Path $root '.tmp\vrf-cli-19.2\Source2Viewer-CLI.exe'),
    (Join-Path $root '.tmp\source2viewer-cli\Source2Viewer-CLI.exe')
)
$python = (Get-Command py.exe -ErrorAction SilentlyContinue).Source
if (-not $python) { throw 'py.exe (Python launcher) not found' }
$contract = Get-Content -LiteralPath (Join-Path $mod 'assets.json') -Raw | ConvertFrom-Json
$compiledLayouts = @(
    'panorama/layout/dashboard.vxml_c',
    'panorama/layout/citadel_db_page_home.vxml_c',
    'panorama/layout/citadel_db_page_heroes.vxml_c',
    'panorama/layout/citadel_db_page_training.vxml_c',
    'panorama/scripts/old_main_menu.vjs_c',
    'panorama/scripts/citadel_db_page_heroes.vjs_c',
    'panorama/scripts/citadel_db_page_heroes_data.vjs_c',
    'panorama/styles/dashboard.vcss_c',
    'panorama/styles/citadel_db_play_menu.vcss_c',
    'panorama/styles/citadel_db_page_home.vcss_c',
    'panorama/styles/citadel_db_page_heroes.vcss_c',
    'panorama/styles/citadel_hero_card.vcss_c',
    'panorama/styles/citadel_hero_grid.vcss_c',
    'panorama/styles/old_main_menu.vcss_c'
)

function Get-Crc32([string]$Path) {
    $value = & $python -c "import sys,zlib;print('%08x' % zlib.crc32(open(sys.argv[1],'rb').read()))" $Path
    if ($LASTEXITCODE -ne 0) { throw "crc32 failed for $Path" }
    return ([string]$value).Trim()
}

function Resolve-Sources([string[]]$Patterns) {
    foreach ($pattern in $Patterns) {
        $parent = Split-Path $pattern -Parent
        $leaf = Split-Path $pattern -Leaf
        if ($pattern -match '\*') {
            # newest depot download first
            $base = $pattern.Substring(0, $pattern.IndexOf('*'))
            $dirs = @(Get-ChildItem -Path (Split-Path $base -Parent) -Directory -Filter ((Split-Path $base -Leaf) + '*') -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending)
            $rest = $pattern.Substring($pattern.IndexOf('*') + 1).TrimStart('\')
            foreach ($dir in $dirs) { $candidate = Join-Path $dir.FullName $rest; if (Test-Path -LiteralPath $candidate) { $candidate } }
        } elseif (Test-Path -LiteralPath $pattern) { $pattern }
    }
}

foreach ($script in Get-ChildItem -LiteralPath (Join-Path $mod 'panorama\scripts') -Filter '*.js') {
    & node --check $script.FullName
    if ($LASTEXITCODE -ne 0) { throw "$($script.Name) syntax check failed" }
}
& node (Join-Path $mod 'scripts\validate-old-main-menu.js')
if ($LASTEXITCODE -ne 0) { throw 'old_main_menu validation failed' }

Remove-TreeUnderRoot -Path $stage -RootPath $root -ExpectedLeaf '_old_main_menu_build'
try {
    New-Item -ItemType Directory -Path $source -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $mod 'panorama') -Destination $source -Recurse
    $playXml = Join-Path $source 'panorama\layout\dashboard.xml'
    if ($Strict) {
        $text = [IO.File]::ReadAllText($playXml)
        $stripped = [regex]::Replace($text, '(?s)\s*<!--OMM-CURRENT-MODES-BEGIN.*?OMM-CURRENT-MODES-END-->', '')
        if ($stripped -eq $text) { throw 'Strict: current-modes block not found' }
        [IO.File]::WriteAllText($playXml, $stripped)
    }

    # Old images: extract from the first source that has the exact Jul 2025 bytes.
    $oldFiles = Join-Path $stage 'old_files'
    $imageSources = @(Resolve-Sources @($contract.imageSources))
    $report = @()
    foreach ($image in $contract.images) {
        $found = $null
        foreach ($vpk in $imageSources) {
            $target = Join-Path $oldFiles ($image.path -replace '/', '\')
            New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force | Out-Null
            $ErrorActionPreference = 'Continue'   # a miss is expected: vpkeditcli reports it on stderr
            & $packer $vpk -e $image.path -o $target --no-progress 2>&1 | Out-Null
            $ErrorActionPreference = 'Stop'
            if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $target)) { continue }
            if ((Get-Item -LiteralPath $target).Length -eq $image.size -and (Get-Crc32 $target) -eq $image.crc32) { $found = $vpk; break }
            Remove-Item -LiteralPath $target -Force
        }
        if ($found) {
            $report += "  old   $($image.path) <- $found"
            continue
        }
        if (-not $image.fallback) { throw "Required Jul 2025 asset not found in any source: $($image.path)" }
        $oldUrl = 's2r://' + ($image.path -replace '_c$', '')
        if ($image.fallback -like 'hide:*') {
            $selector = $image.fallback.Substring(5)
            Add-Content -LiteralPath (Join-Path $source 'panorama\styles\citadel_db_page_home.css') -Value "`n$selector`n{`n`tvisibility: collapse;`n}"
            $report += "  HIDE  $selector (missing $($image.path))"
        } else {
            $hits = 0
            foreach ($css in Get-ChildItem -LiteralPath (Join-Path $source 'panorama\styles') -Filter '*.css') {
                $text = [IO.File]::ReadAllText($css.FullName)
                if ($text.Contains($oldUrl)) { $hits++; [IO.File]::WriteAllText($css.FullName, $text.Replace($oldUrl, 's2r://' + $image.fallback)) }
            }
            if (-not $hits) { throw "Fallback: no stylesheet references $oldUrl" }
            $report += "  NOW   $($image.path) -> $($image.fallback) (Jul 2025 file not found)"
        }
    }

    # Old movies: a depot download is authoritative; the install copy must match the recorded hash.
    $videoSources = @(Resolve-Sources @($contract.videoSources))
    foreach ($video in $contract.videos) {
        $found = $null
        foreach ($dir in $videoSources) {
            $candidate = Join-Path $dir ($video.path -replace '/', '\')
            if (-not (Test-Path -LiteralPath $candidate)) { continue }
            $isDepot = $dir -like 'E:\jundeadlock\depot_*'
            if ($isDepot -or (Get-FileHash -LiteralPath $candidate -Algorithm SHA1).Hash -eq $video.sha1) { $found = $candidate; break }
        }
        if (-not $found) { throw "Main-menu movie not found with the expected hash: $($video.path)" }
        $target = Join-Path $oldFiles ($video.path -replace '/', '\')
        New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force | Out-Null
        Copy-Item -LiteralPath $found -Destination $target
        $report += "  movie $($video.path) <- $found"
    }

    $required = @($compiledLayouts | ForEach-Object { Join-Path $compiled $_ })
    Invoke-Source2Compiler -CompilerPath (Join-Path $root 'sr2compiler\New folder.exe') -SourceDir $source -RequiredOutputs $required
    Copy-Item -Path (Join-Path $oldFiles '*') -Destination $compiled -Recurse -Force
    Invoke-VpkPack -VpkEditCli $packer -InputDir $compiled -OutputPath $out
    $tree = Get-PackedVpkTree -VpkEditCli $packer -VpkPath $out -Source2ViewerPath $viewer

    $expected = @($compiledLayouts) + @(Get-ChildItem -LiteralPath $oldFiles -Recurse -File | ForEach-Object {
        $_.FullName.Substring($oldFiles.Length + 1) -replace '\\', '/'
    })
    $inventory = @($tree | ForEach-Object { $l = ([string]$_).Trim(); if ($l) { ($l -split '\s+', 2)[0] } } | Select-Object -Unique)
    $difference = @(Compare-Object -ReferenceObject ($expected | Sort-Object) -DifferenceObject ($inventory | Sort-Object))
    if ($difference.Count) { throw "pak04 inventory mismatch: $($difference | Out-String)" }
    $report | Write-Host
    $tree | Write-Host
} finally {
    Remove-TreeUnderRoot -Path $stage -RootPath $root -ExpectedLeaf '_old_main_menu_build'
}

$hash = (Get-FileHash -LiteralPath $out -Algorithm MD5).Hash.ToLowerInvariant()
Write-Host "Built $out ($([math]::Round((Get-Item $out).Length / 1MB, 2)) MB, md5 $hash)$(if ($Strict) { ' [strict]' })"

if (-not $SkipDeploy) {
    if (Get-Process -Name deadlock -ErrorAction SilentlyContinue) { throw 'Deadlock is running; close it before deploying pak04.' }
    if (-not (Test-Path -LiteralPath $addons)) { throw 'Deadlock addons folder missing' }
    if (Test-Path -LiteralPath $destination) {
        $old = (Get-FileHash -LiteralPath $destination -Algorithm MD5).Hash.ToLowerInvariant()
        if ($old -ne $hash) {
            $disabled = Join-Path (Split-Path $addons -Parent) 'addons_disabled'
            New-Item -ItemType Directory -Path $disabled -Force | Out-Null
            $backup = Join-Path $disabled "pak04.before-old-main-menu-$($old.Substring(0, 8))_dir.vpk"
            if (-not (Test-Path -LiteralPath $backup)) { Copy-Item -LiteralPath $destination -Destination $backup }
            Write-Host "Backed up the installed pak04 -> $backup"
        }
    }
    Copy-Item -LiteralPath $out -Destination $destination -Force
    if ((Get-FileHash -LiteralPath $destination -Algorithm MD5).Hash.ToLowerInvariant() -ne $hash) { throw 'Deployed pak04 hash mismatch' }
    Write-Host "Deployed -> $destination"
}
