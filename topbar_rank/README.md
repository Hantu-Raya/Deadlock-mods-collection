# TopBar Rank Barebones — Alert edition

This is the alert edition of the V40D TopBarPlus clean cutover. It retains the supplied V40D TopBarPlus module and merges the ShowRank Barebones rank surfaces into it; it is not the former combined V40 HUD and does not load a canonical ShowRank bridge.

## Source and architecture

The source tree checks in the 16 TopBarPlus base assets derived from the supplied `G:\v40d_top_bar_plus.zip`. Its archive witnesses are:

- ZIP SHA-256: `9610965fc621c7d2f8fa5054c79c1d31f32ef30bb93dfd2ea2475598ba6bd608`
- VPK SHA-256: `986d28a49f06919d84a090e9921929075fb2b9c5a445df58de13b1e06921d10d`

This source tree packages 23 assets: all V40D assets; the profile-card, dashboard-profile, context-menu, Escape-menu, and player-list rank layouts; one ES5 Barebones runtime; and one Barebones style. The topbar-root and topbar-player layouts are merged replacements within that set, not added overlays. Native `GameTime` and every TopBarPlus script include remain intact.

The runtime and stylesheet are source templates. They contain one identity-policy seam and one Stats vs Community composition seam; source tests and the builder resolve those seams from `scripts/viewed-profile-identity-policy.js` and `profile_stats_community/` through `scripts/profile-stats-community-composition.js`. No generated comparison implementation is copied into this edition.

The composed Barebones runtime owns current `/rank/image?` badge and team-average APIs, viewed-profile identity witnesses, duplicate-name/account safety, unified roster reads, bounded Escape probing, centralized Escape readiness, six/twelve verified-account caching, native Escape behavior, and ranks on profile, context menu, topbar, team average, and player list. It remains separate from standalone `showrank_barebones`, which is a different mod and release path.

## Alert-only behavior

This edition also keeps the early-lane alert features: missing labels, portrait darkening, bounded native-clock polling, the notification root, and hero-icon announcements. Those features are intentionally absent from `../topbar_rank_no_missing`.

## Build and install

From the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File .\build_topbar_rank_barebones.ps1
```

The builder first runs the focused source contracts, copies only the edition inventory into staging, composes the current runtime and style with `--host-root`, then compiles and validates the staged outputs. Use `-KeepStaging` to retain the composed sources. Use `-Install` only to place the result at:

```text
G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak89_dir.vpk
```

The build artifact is `topbar_rank_barebones_dir.vpk`. The alert and no-missing editions both target `pak89_dir.vpk`; they are mutually exclusive, so install only one at a time.

## Validation boundary

Source and build validation can verify source contracts, composition, staged content, and the artifact. They are not live in-game proof. Verify rank rendering, viewed-profile links, Stats vs Community, Escape behavior, TopBarPlus UI, and alert behavior in Deadlock after installation.
