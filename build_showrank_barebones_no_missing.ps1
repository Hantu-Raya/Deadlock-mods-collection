param(
    [switch]$Install,
    [switch]$Archive,
    [switch]$KeepStaging,
    [string]$AddonsPath = "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons"
)

# The no-missing edition shares the barebones build; only the source tree and VPK name differ.
$ErrorActionPreference = 'Stop'
& (Join-Path $PSScriptRoot 'build_showrank_barebones.ps1') -NoMissing -Install:$Install -Archive:$Archive -KeepStaging:$KeepStaging -AddonsPath $AddonsPath
