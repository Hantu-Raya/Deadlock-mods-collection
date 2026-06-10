# Repository Guidelines

## Project Overview

`topbar_rank/` is the Topbar Rank Panorama module for Deadlock. It adds predicted rank images to topbar players, profile cards, context menus, Escape → Players rows, and team-average slots. It also owns topbar-only helper UI for powerup/Rejuvenator timers, networth advantage, objective-map positioning, and unspent souls.

Keep changes local to `topbar_rank/` unless the task explicitly requires root build tooling or shared fixtures. Work in source files under `topbar_rank/panorama/**`, not `topbar_rank_compiled/`.

## Architecture & Data Flow

- **Rank bridge flow**: XML layouts load `topbar_rank_rank_bridge.vjs_c` → onload/hover/activate hooks call `$.TopbarRank*` wrappers → the bridge verifies the current layout context → reads profile/account/name evidence → normalizes AccountID/SteamID3/Steam64 → builds Deadlock API rank image URLs → writes images/classes/attrs back to topbar, profile-card, context-menu, player-list, and team-average surfaces.
- **HUD flow**: topbar root/player XML also loads `topbar_rank_hud.vjs_c`. This runtime is separate from rank resolution and updates timers, networth advantage, hideout/street-brawl visibility, and per-player unspent souls.
- **Shared state**: bridge caches live on document-root attributes, panel attributes, `panel.__TopbarRank*` properties, `GameUI.CustomUIConfig()`, `globalThis`, and `$` when available. Cache/version changes use `BRIDGE_VERSION` and `CACHE_VERSION`.
- **Escape automation**: Escape → Players first preloads cached ranks, then carefully opens verified rows/profile cards when needed. It requires a stable roster, unique normalized names, valid topbar candidates, and enough loaded ranks (`REQUIRED_LOADED = 11`) before latching idle.
- **Render contract**: JS sets image URLs/attributes and toggles classes. CSS owns visibility, opacity, sizing, warnings, spinner animation, and scoreboard/detail sizing.
- **External assets**: rank images use `https://api.deadlock-api.com/v1/players/{account}/rank-predict/image?format=webp`; team averages use `/v1/players/rank-predict/image?account_ids=...&format=webp`; StatLocker links use `https://statlocker.gg/profile/{account}/matches`.

## Key Directories

- `panorama/layout/` — hook surfaces for topbar root, per-player topbar, profile card, context menu, Escape menu, and player-list rows.
- `panorama/scripts/` — `topbar_rank_rank_bridge.js` for rank/account automation and `topbar_rank_hud.js` for timer/networth/unspent HUD logic.
- `panorama/styles/` — module CSS for topbar, profile card, player list, objectives map, plus retained base CSS under `topbar_rank_base/`.
- `scripts/` — source validator, currently `validate-topbar-rank.js`.
- `../test/topbar/` — reference fixture only. Use for visual/behavior parity checks; never import or reference it from shipped `topbar_rank` files.

## Development Commands

Run from repo root.

### Source invariant validator

```powershell
node topbar_rank\scripts\validate-topbar-rank.js
```

Expected success:

```text
OK: topbar_rank source invariants passed
```

### Compile Topbar Rank

`topbar_rank` has no dedicated build wrapper. Compile with the generic Source 2 wrapper:

```powershell
$repo = "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection"
& "$repo\sr2compiler\New folder.exe" "$repo\topbar_rank"
```

The compiler can exit nonzero after successful output because it waits on `Console.ReadKey()`. Treat `OK: ... compiled, 0 failed` plus required files in `topbar_rank_compiled/` as the real signal.

### Pack and deploy current compiled output

```powershell
$repo = "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection"
$vpkTool = Join-Path $repo "vpk cli\vpkeditcli.exe"
$vpkOut = Join-Path $repo "pak89_dir.vpk"
$vpkDest = "G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak89_dir.vpk"
& $vpkTool (Join-Path $repo "topbar_rank_compiled") -o $vpkOut -s --no-progress
Copy-Item -LiteralPath $vpkOut -Destination $vpkDest -Force
```

`build_showrank_variants.ps1` targets legacy `showrank/`, not this module. Do not use it as a Topbar Rank builder unless it has been adapted.

## Code Conventions & Common Patterns

- Use Panorama-compatible JS: IIFE, `"use strict"`, `var`, small helpers, and defensive `try/catch` around `Game`, `$`, `GameUI`, panel APIs, and overlay launches.
- Global wrappers are `$.TopbarRank*`. They must stay context-gated by `DetectTopbarRankContextRole()`; unrelated contexts should have wrappers cleared/undefined.
- CSS classes and XML IDs are the public API. Keep `TopbarRank*` names stable unless XML, JS, CSS, and validator assertions are updated together.
- Store cross-context facts in panel attributes and mirrored `panel.__TopbarRank*` properties. Do not rely on one panel context existing everywhere.
- Cache panel lookups with helpers such as `FindChildCached`; avoid `FindChildTraverse`/full tree scans in hover/tick paths unless cache invalidation requires it.
- Guard DOM writes: check current text/classes/attributes/image state before writing.
- Use `$.Schedule` for paced retries and lifecycle waits; do not add `setInterval`, `fetch`, `XMLHttpRequest`, `AsyncWebRequest`, direct `.src =`, or `RunScriptInPanelContext` to the bridge.
- Rank assignment must be identity-safe: normalize account IDs, verify SteamID3/Steam64 evidence when present, reject duplicate account assignment, and clear stale state on account/name/cache-version mismatch.
- Preserve hideout/lobby class variants: `connectedToHideout`, `connectedtoHideout`, `connectedtohideout`, `connectedToHideOut`, `InHideout`, `inHideoutIntro`.
- Street Brawl hides custom timer/unspent UI and collapses the objective map. Test normal and street-brawl states after visibility changes.
- Keep timer constants intentional: powerup cycle `300`, Rejuvenator buff `240`, phase durations `[0, 413, 353, 293]`, warning thresholds `20` and `10` seconds.
- Unspent souls = raw gold (`TopbarRankGoldRaw` / `SoulsValue`) minus visible tier costs under `PlayerModsContainer`: `800`, `1600`, `3200`, `6400`.
- CSS imports base files first, then overrides. `topbar_rank_topbar.css` owns Topbar Rank topbar styling; `objectives_map.css` is the only objective-map override owner.
- Avoid broad formatting churn in `topbar_rank_topbar.css`; it intentionally contains a large diff-selector section before TopbarRank-only selectors.

## Key Classes and Functions

### `panorama/scripts/topbar_rank_rank_bridge.js`

- `DetectTopbarRankContextRole()` — identifies which layout context is running and gates exported wrappers.
- `NormalizeAccountId()` — sanitizes AccountID strings/numbers into the supported `100000..4294967295` range.
- `VerifyAccountIdentity()` — checks AccountID against SteamID3/Steam64 evidence when available.
- `BuildRankImageUrl()` / `BuildTeamAverageImageUrl()` — construct Deadlock API image URLs for one account or six-account team averages.
- `StoreAccountCache()` / `LookupCacheByNameNorm()` — store and retrieve normalized name/account evidence across contexts.
- `ReadProfile()` — extracts account/name/rank evidence from profile-card panels.
- `TriggerProfileCard()` / `ApplyProfile()` — drive profile-card parsing and apply discovered rank/account state.
- `RegisterTopBarPlayer()` — records one topbar player panel as a candidate for rank matching.
- `FindTopBarCandidates()` — scans/caches valid topbar rank targets and rejects stale/invalid candidates.
- `ApplyTopBarImage()` — sets rank image URL, visibility classes, and identity attributes on a topbar player.
- `BuildEscapeRoster()` — matches Escape player-list rows to topbar candidates by unique normalized names.
- `EscapePreloadFromCache()` / `EscapeAutoPopulate()` — populate player-list/topbar rank images from cache or controlled profile opens.
- `UpdateTeamAverageRanks()` — displays friendly/enemy team average rank images only when each side has six unique accounts.
- `TopbarRankTopBarRootLoaded()` — initializes bridge state for the topbar root.
- `TopbarRankRegisterTopBarPlayer()` — public wrapper called by each topbar player layout.
- `TopbarRankTriggerProfileCard()` — public wrapper for profile-card parsing/update.
- `TopbarRankEscapePreloadFromPlayerList()` — public wrapper that starts Escape roster preload/autoload.
- `TopbarRankRegisterPlayerListRowReady()` — public wrapper that marks one player-list row ready for rank display.

### `panorama/scripts/topbar_rank_hud.js`

- `TopbarRankHudRootLoaded()` — builds root HUD state and starts root ticking.
- `BuildRootState()` — caches root timer, objective, score, and advantage panels.
- `RootTick()` — 1s loop for powerup timer, Rejuvenator phase/buff state, team advantage, hideout/street-brawl visibility, and match reset detection.
- `ReadGameSeconds()` — reads game time from engine APIs or visible clock labels.
- `UpdateRejuv()` — tracks Rejuvenator spawn/cooldown/buff phases from charge signatures and game time.
- `UpdateAdvantage()` — computes friendly-vs-enemy networth advantage percentage and applies good/bad/neutral classes.
- `TopbarRankHudPlayerLoaded()` — builds per-player HUD state and starts unspent-souls ticking.
- `PlayerTick()` — 0.5s loop that reads raw gold, subtracts spent souls, and updates the unspent row.
- `CountSpentSouls()` — sums purchased item tier costs from current `PlayerModsContainer` class markers.

### `scripts/validate-topbar-rank.js`

- `assert()` / `count()` — small invariant helpers.
- Validator body — enforces required files, bridge constants/wrappers, forbidden legacy/test tokens, forbidden bridge APIs, HUD constants, layout includes/hooks, CSS timer/objective invariants, Escape CSS isolation, and deleted base CSS absence.

## Important Files

- `panorama/layout/citadel_hud_top_bar.xml` — root topbar hook; includes bridge + HUD scripts, team-average layer, objective map, timer cluster, rejuv buff panel, and advantage label.
- `panorama/layout/citadel_hud_top_bar_player.xml` — per-player hook; rank/status images, raw gold label, unspent row, hover handlers, and stock player containers.
- `panorama/layout/profile_card.xml` — profile-card account/rank/link surface.
- `panorama/layout/citadel_ui_context_menu_player.xml` — context-menu StatLocker/Deadlock profile buttons.
- `panorama/layout/hud_escape_menu.xml` — Escape preload/autoload entry; must not import full topbar CSS.
- `panorama/layout/players_list_entry.xml` — Escape row rank image and readiness hooks.
- `panorama/scripts/topbar_rank_rank_bridge.js` — main rank/account/profile/player-list automation.
- `panorama/scripts/topbar_rank_hud.js` — timers, networth advantage, hideout/street-brawl UI, unspent souls.
- `panorama/styles/topbar_rank_topbar.css` — topbar visuals, rank/status images, team average, timers, advantage, unspent row.
- `panorama/styles/objectives_map.css` — objective-map override and z-index owner.
- `panorama/styles/topbar_rank_base/citadel_hud_top_bar.css` — retained Valve/reconstructed base topbar CSS.
- `panorama/styles/topbar_rank_base/objectives_map.css` — retained base objective-map CSS.
- `scripts/validate-topbar-rank.js` — fast source invariant gate.
- `../test/topbar/` — legacy/reference topbar timer/unspent/urn fixture. Do not reference from shipped Topbar Rank files.

## Runtime/Tooling Preferences

- Runtime is Source 2 Panorama, not browser JS. Prefer conservative ES syntax already used in the files.
- Node is used only for the validator.
- Compiler: `sr2compiler/New folder.exe` with Dota Workshop Tools configured by `sr2compiler/pref.json`.
- Pack slot: `pak89_dir.vpk` when deploying this mod manually.
- VPK packer: usually `vpk cli/vpkeditcli.exe`; some root scripts look first in `passive_items_mod/compiler/`.
- Deadlock addons path used by local wrappers: `G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons`.
- Fallow config currently has no topbar-specific ignore/dynamic-load rules.
- Do not edit `topbar_rank_compiled/` or packed VPK contents directly; regenerate from source.

## Testing & QA

- Run `node topbar_rank\scripts\validate-topbar-rank.js` after any `topbar_rank/panorama/**` or validator change.
- Compile after `.js`, `.css`, or `.xml` edits and confirm `0 failed` plus expected compiled assets under `topbar_rank_compiled/panorama/**`.
- Pack/deploy `pak89_dir.vpk` for deployable changes and confirm the file exists both in repo root and the Deadlock addons directory.
- The validator is static/string-based. It does not prove in-game CSS rendering, API image availability, overlay link behavior, real profile-card timing, or Panorama scheduler behavior.
- Manual in-game smoke for rank changes:
  1. Launch Deadlock with `-dev -tools`.
  2. Run `panorama_reload_layout`.
  3. Open/hover profile cards or Escape → Players.
  4. Confirm topbar ranks, player-list ranks, profile-card ranks, context-menu links, and team-average images.
- Manual in-game smoke for HUD changes: verify powerup timer, Rejuvenator phases/buff timer, warning colors, objective-map visibility, networth advantage, unspent souls, hideout/lobby reset, spectator/scoreboard/detail sizing, and Street Brawl hiding.
- Test duplicate/ambiguous names, missing account IDs, partial 12-player rosters, fewer than six team accounts, stale cached ranks, missing rank images, and profile-card mismatch quarantine.
- Keep `test/topbar` as a comparison fixture only. The validator intentionally rejects `test/topbar`, `showrank/tests`, and legacy `ShowRank*` tokens in shipped Topbar Rank files.
