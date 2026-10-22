# Game data sources

Type: wayfinder:research (AFK)
Status: Closed
Blocked by: none

## Question

Where can the build read the stock unit-status stylesheet and the hero catalog so game updates fail the build instead of drifting?

## Notes

Check SteamTracking paths used by the v2 CSS rebase (`hp_colors_rewrite_v2/design.md:5`) and the abilities refresh (`build_abilities_paks.ps1 -RefreshFromSteamTracking`).

## Resolution

Use commit-pinned SteamTracking `game/citadel/pak01_dir/panorama/styles/unit_status_v2.css` for the reviewed CSS stock baseline and `game/citadel/pak01_dir/scripts/heroes.vdata` for the generated hero-key catalog. `build_abilities_paks.ps1` already demonstrates fetching the same host via `Invoke-WebRequest`, but its abilities-specific `_include` stripping must not be reused. Installed `pak01_dir.vpk` lists only compiled `.vcss_c` and `.vdata_c` counterparts. Fail on baseline/patch or hero-key snapshot drift; check current upstream separately because pinning alone cannot detect a game update. Paths, working commands, evidence and limitations: `hp_colors_rewrite_v3/research/09-game-data-sources.md`.

Rechecked 2026-10-14: GitHub/raw links, localization paths, local source references, byte counts/hashes and installed VPK entries are verified in the research file's `## Verification` section. Its original Bash/`rg` filter fails here because `rg` is unavailable; the documented PowerShell `Select-String` replacement and direct VPK listing succeed. Complete localization coverage, installed/upstream equivalence and the proposed drift guard implementation remain unverified.
