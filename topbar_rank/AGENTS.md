# Repository Guidelines

## Project Overview

`topbar_rank/` combines the canonical ShowRank rank UI with a custom v40 Top Bar Plus Panorama module. It displays predicted ranks on topbar players, profile cards, context menus, Escape → Players rows, and team-average slots, while retaining powerup/Rejuvenator timers, team advantage, Rift/Urn state, spent souls, objective-map positioning, and Recent Purchase overlays.

Keep changes local to `topbar_rank/` unless the task explicitly requires root build tooling or shared fixtures. Work in source files under `topbar_rank/panorama/**`, not `topbar_rank_compiled/`.

## Non-negotiable Integration Boundary

- `panorama/scripts/showrank_common.js` is an exact source copy of `../showrank/panorama/scripts/showrank_common.js`. Do not rewrite, rename, namespace, optimize, minify, or selectively port this checked-in source; the builder may Closure-minify only its staged copy after byte-equality validation.
- Never restore `topbar_rank_rank_bridge.js` or `$.TopbarRank*` rank wrappers. Rank-facing XML and CSS adapt the v40 UI to the unchanged `ShowRank*` API.
- If ShowRank changes, update the canonical file under `showrank/`, run its tests, then copy it byte-for-byte into `topbar_rank`. The Topbar validator compares the two files as buffers and must fail on any difference.
- Keep compatibility work outside the copied bridge: XML owns includes/hooks/IDs, CSS owns ShowRank-compatible selectors, and `validate-topbar-rank.js` owns integration assertions.
- `topbar_rank_v40_hud.js`, Recent Purchase scripts, and v40 XML/CSS remain Topbar-owned. Do not move v40 timers, objectives, purchases, or spent-souls behavior into ShowRank.
- `v40c_top_bar_plus.zip` is the supplied baseline, not proof of the latest upstream release. The current HUD is a local combined rewrite with newer Rift/Urn handling; do not call it byte-identical to v40c or “latest official” without external evidence.

## Architecture & Data Flow

- **Rank bridge flow**: every rank-facing XML loads `showrank_common.vjs_c` exactly once and uses only the `ShowRank*` wrappers allowed for that layout role. The bridge remains owned and tested by `showrank/`.
- **HUD flow**: topbar root/player XML also loads `topbar_rank_v40_hud.vjs_c`; the runtime self-detects root vs player context and updates timers, team advantage, Rift/Urn state, hideout/street-brawl visibility, and per-player spent souls.
- **Recent Purchase flow**: hero-shop layout loads `recent_purchases_redux_data.vjs_c` then `recent_purchases_redux.vjs_c`; runtime filters rows, applies icons, overlays hero-local quick purchases, and resets stale state in hideout/lobby.
- **Shared rank state**: the unchanged ShowRank bridge owns its document-root, panel, and shared-cache contracts. Topbar code must not create a second cache, wrapper namespace, or cross-context bridge.
- **Escape automation**: preserve ShowRank’s bounded stable-roster, duplicate-name, account-witness, passive-topbar, retry, and runtime-idle behavior. Preserve native `CitadelResumePlaying()`.
- **Render contract**: ShowRank JS sets image URLs/attributes/classes. Topbar CSS supplies compatible `ShowRank*` selectors alongside v40-only styling.
- **External assets**: rank images use `https://api.deadlock-api.com/v1/players/{account}/rank-predict/image?format=webp`; team averages use `/v1/players/rank-predict/image?account_ids=...&format=webp`; StatLocker links use `https://statlocker.gg/profile/{account}/matches`.
- **Current v40 visual contract**: `#RejuvHUD` and `#BuffHUD` stay around the center clock. `#UrnTracker` keeps separate networth/objective cards. Current Rift/Urn classes and marker-driven state are intentional local behavior.

## Key Directories

- `panorama/layout/` — hook surfaces for topbar root, per-player topbar, profile card, context menu, Escape menu, and player-list rows.
- `panorama/scripts/` — unchanged `showrank_common.js`, Topbar-owned `topbar_rank_v40_hud.js`, and Recent Purchase runtime/data.
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

### Build Topbar Rank with the variant builder

Use the adapted root builder. Topbar mode supports only the normal variant, rejects diagnostics and ShowRank stage patches, verifies the staged common source byte-for-byte, then Closure ADVANCED-minifies all four staged scripts with shared externs and output guards.

```powershell
$repo = "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection"
& "$repo\build_showrank_variants.ps1" -TopbarRank -Variant normal -KeepStaging
```

Expected outputs:

```text
_topbar_rank_variant_build\pack_normal\pak89_dir.vpk
G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\topbar_rank_normal_YYYYMMDD_HHMMSS.7z
```

Add `-Install` only when the user explicitly asks to replace the active Deadlock addon. Do not use `-Diagnostics`, scoreboard-only, or minify-ranks variants with `-TopbarRank`.

The compiler wrapper may be stopped after all required outputs appear. Treat the builder’s compiled-output assertions and VPK/archive verification as the signal, not the wrapper’s shutdown code.

### Fast syntax checks

```powershell
node --check topbar_rank\panorama\scripts\showrank_common.js
node --check topbar_rank\panorama\scripts\topbar_rank_v40_hud.js
node --check topbar_rank\panorama\scripts\recent_purchases_redux.js
node --check topbar_rank\scripts\validate-topbar-rank.js
```

### Fallow audit

```powershell
npx --yes fallow --root topbar_rank --format json --quiet --explain
```

Fallow currently sees Panorama XML/CSS/script entry files as unused because Source 2 loads them by compiled `s2r://` includes, not JS imports. Verify a finding against layout/style includes before deleting anything.


## Code Conventions & Common Patterns

- Never edit `topbar_rank/panorama/scripts/showrank_common.js` directly. Byte equality with the canonical ShowRank source is a release contract.
- Rank-facing global wrappers are `$.ShowRank*`, installed and role-gated by the unchanged bridge. Do not introduce `$.TopbarRank*` rank wrappers.
- Use the live `showrank/panorama/layout/*.xml` role contracts when adapting rank IDs, classes, and callbacks into the richer v40 layouts.
- Topbar CSS may alias both v40-owned `TopbarRank*` presentation classes and bridge-owned `ShowRank*` classes. JS-facing IDs/classes must match ShowRank exactly.
- Do not add cross-context caches, custom unhandled events, `RunScriptInPanelContext`, browser networking APIs, direct `.src =`, or unbounded polling.
- Preserve ShowRank identity safety: account IDs are authoritative; duplicate names stay ambiguous; stale/split identity is rejected; passive topbar readiness must not trigger probing or spinners.
- Preserve hideout/lobby class variants: `connectedToHideout`, `connectedtoHideout`, `connectedtohideout`, `connectedToHideOut`, `InHideout`, `inHideoutIntro`.
- Street Brawl hides custom timer/spent UI and collapses the objective map; `.LiveGame .ObjectiveCtn` remains visible in normal games.
- Current HUD constants are local source truth: Rejuvenator duration `180`, bridge/powerup cycle `300`, phase durations `[0, 413, 353, 293]`, plus the current Rift/Urn constants in `topbar_rank_v40_hud.js`. Do not replace them with remembered v40c values.
- The player row currently displays purchased-tier spend under the `Spent:` label. Do not silently restore the older “unspent souls” calculation.
- Recent Purchase uses `MAIN_POLL_INTERVAL = 0.1`, `HIDEOUT_POLL_INTERVAL = 1.0`, `QUICK_MAX_ENTRIES = 3`, and `QUICK_DISPLAY_DURATION = 10.0`; do not add scans inside its hot loops.
- CSS imports base files first, then overrides. `topbar_rank_topbar.css` owns topbar/v40/ShowRank compatibility; `objectives_map.css` owns objective-map overrides; `citadel_hud_hero_shop.css` owns Recent Purchase styling.
- Avoid broad formatting churn in `topbar_rank_topbar.css`.
- Do not reintroduce obsolete split scripts: `topbar_rank_rank_bridge.js`, `topbar_rank_hud.js`, `rejuvnbufftimer.js`, `urntracker.js`, or `unspent.js`.

## Rank Bridge Contract

### `panorama/scripts/showrank_common.js`

- The checked-in source file must remain byte-identical to `../showrank/panorama/scripts/showrank_common.js`; minification belongs only in builder/web payload staging.
- Topbar Rank does not own its internal functions. Do not copy selected functions into another bridge or rename `ShowRank*` symbols.
- XML-facing wrappers remain those defined by ShowRank: profile trigger/link, context-menu links, topbar hover, Escape preload, and player-row readiness/hover actions.
- Preserve ShowRank tests as the behavioral authority for account normalization, profile mismatch handling, topbar evidence, duplicate assignment, team averages, Escape automation, and second-match recovery.
- The Topbar validator must check byte equality, required includes/wrappers/classes, forbidden obsolete bridge files, and v40 compatibility surfaces.

### `panorama/scripts/topbar_rank_v40_hud.js`

- `Boot()` detects root/player layout context and starts only that context’s bounded loop.
- Root state owns powerup/Rejuvenator timing, team advantage, Rift/Urn objective presentation, hideout/street-brawl visibility, and match reset handling.
- Player state owns the `SpentSoulDisplay` update from visible purchased-tier classes.
- Keep this runtime independent from ShowRank rank/account caches and wrappers.
- This file is a local combined rewrite, not an untouched extraction of `rejuvnbufftimer.vjs_c`, `urntracker.vjs_c`, or `unspent.vjs_c`.

### `panorama/scripts/recent_purchases_redux.js`

- `MainPoll()` — 0.1s guarded loop for recent-purchase icon fixes, filter state, container cap, quick overlays, hero-map rebuilds, and seen-key pruning.
- `CreateFilterCheckboxes()` / `ApplyFilters()` — create tier/team filter toggles and hide purchase rows without deleting source rows.
- `BuildHeroNameMap()` — maps hidden topbar hero labels to player panels for hero-local quick purchase overlays.
- `UpdateQuickPurchases()` — detects new purchase rows after initialization and creates quick overlay entries.
- `ResolveOverlaps()` — keeps simultaneous quick overlay cards from overlapping by applying per-panel top margins.
- `HideoutPoll()` / `ClearContainer()` — clear stale recent-purchase and quick-overlay state on hideout/lobby transitions.

### `panorama/styles/topbar_rank_topbar.css`

- Center timers keep `#RejuvHUD` at `x: -65px` and `#BuffHUD` at `x: 65px` with transparent borders.
- Buff warnings use `#BuffHUD.buffWarningYellow #BuffTimeHUD` and `#BuffHUD.buffWarningRed #BuffTimeHUD`; do not add equivalent Rejuv glow selectors.
- `#UrnTracker` is a 200px transparent container. `.UrnTrackerCard` is 100px wide; `#UrnNetworthCard` aligns left and receives good/bad/neutral classes, `#UrnHudCard` aligns right and stays neutral.
- `objectives_map.css` keeps `.LiveGame .ObjectiveCtn`, `.LiveGame.ObjectiveCtn`, and `#ObjectivesMap .ObjectiveCtn` visible so normal objective cards do not collapse.

### `scripts/validate-topbar-rank.js`

- `assert()` / `count()` — small invariant helpers.
- Validator body — enforces required files, bridge constants/wrappers, forbidden legacy/test tokens, forbidden bridge APIs, HUD constants, layout includes/hooks, CSS timer/objective/urn invariants, Recent Purchase runtime invariants, Escape CSS isolation, and deleted obsolete file absence.

## Important Files

- `panorama/layout/citadel_hud_top_bar.xml` — root topbar hook; includes bridge + combined v40 HUD scripts, team-average layer, objective map, timer cluster, Rejuvenator/buff panel, and split urn/networth cards.
- `panorama/layout/citadel_hud_top_bar_player.xml` — per-player hook; rank/status images, raw gold label, unspent row, hover handlers, and stock player containers.
- `panorama/layout/profile_card.xml` — profile-card account/rank/link surface.
- `panorama/layout/citadel_ui_context_menu_player.xml` — context-menu StatLocker/Deadlock profile buttons.
- `panorama/layout/hud_escape_menu.xml` — Escape preload/autoload entry; must not import full topbar CSS.
- `panorama/layout/players_list_entry.xml` — Escape row rank image and readiness hooks.
- `panorama/scripts/showrank_common.js` — byte-identical canonical ShowRank rank/account/profile/player-list automation.
- `panorama/scripts/topbar_rank_v40_hud.js` — combined timers, team advantage, Rift/Urn state, hideout/street-brawl UI, and spent-souls runtime.
- `panorama/scripts/recent_purchases_redux_data.js` — generated/static recent-purchase icon data consumed by the runtime.
- `panorama/scripts/recent_purchases_redux.js` — recent-purchase filtering and quick hero overlay runtime.
- `panorama/styles/topbar_rank_topbar.css` — topbar visuals, ShowRank compatibility, team averages, center timers, objective cards, and spent row.
- `panorama/styles/objectives_map.css` — objective-map visibility/z-index override and `.LiveGame .ObjectiveCtn` protection.
- `panorama/styles/topbar_rank_base/citadel_hud_top_bar.css` — retained Valve/reconstructed base topbar CSS.
- `panorama/styles/topbar_rank_base/objectives_map.css` — retained base objective-map CSS.
- `panorama/styles/citadel_hud_hero_shop.css` — hero-shop base plus Recent Purchase filter/quick overlay styling.
- `scripts/validate-topbar-rank.js` — fast source invariant gate.
- `../test/topbar/` — legacy/reference topbar timer/unspent/urn fixture. Do not reference from shipped Topbar Rank files.

## Runtime/Tooling Preferences

- Runtime is Source 2 Panorama, not browser JS. Preserve conservative syntax in Topbar-owned scripts; do not reformat the copied ShowRank bridge.
- Node runs validators and ShowRank contract/runtime tests.
- Primary builder: `build_showrank_variants.ps1 -TopbarRank -Variant normal`.
- Retained build VPK: `_topbar_rank_variant_build\pack_normal\pak89_dir.vpk`.
- Published archive: `topbar_rank_normal_<timestamp>.7z` directly under the Deadlock addons folder.
- Pack slot: `pak89_dir.vpk`. Do not install it unless explicitly requested.
- The Topbar builder stages only `panorama/`, verifies canonical ShowRank before Closure ADVANCED-minifying all four scripts, requires all four compiled outputs, and rejects obsolete `topbar_rank_rank_bridge.vjs_c`.
- Do not edit `topbar_rank_compiled/`, retained builder staging, archives, or VPK contents directly; regenerate them from source.
- Fallow may report Panorama XML/CSS/scripts as unused because Source 2 loads `s2r://` includes. Verify against layout/style includes before deletion.

## Testing & QA

- Run `node topbar_rank\scripts\validate-topbar-rank.js` after any Topbar Panorama or validator change. It verifies canonical ShowRank byte equality and v40 integration contracts.
- Run focused ShowRank contracts when the canonical bridge or rank-facing XML/CSS changes:

```powershell
node showrank\tests\showrank_context_contract.test.js
node showrank\tests\showrank_player_list_rank.test.js
node showrank\tests\showrank_release_debug_contract.test.js
npm --prefix showrank run test:runtime
```

- Run `node showrank\tests\showrank_variant_builder_contract.test.js` after builder changes.
- Build through `-TopbarRank -Variant normal -KeepStaging`, inspect the VPK tree, and confirm it contains `showrank_common.vjs_c`, `topbar_rank_v40_hud.vjs_c`, and both Recent Purchase scripts, with no obsolete Topbar bridge.
- The validator/compiler do not prove in-game CSS, API images, overlay links, profile timing, scheduler behavior, or second-match recovery.
- Manual rank smoke: profile image/account, context links, topbar bindings, Escape preload/retry, duplicate names, team averages, lobby/new-match clearing, and native Escape close.
- Manual HUD smoke: powerup/Rejuvenator timers, Rift/Urn states, team advantage, spent souls, hideout/lobby reset, scoreboard/detail sizing, objective-map visibility, and Street Brawl hiding.
- Manual Recent Purchase smoke: filters, icon fixes, quick overlays, overlap stacking, and hideout cleanup.
- Keep `../test/topbar/` as a comparison fixture only. Never ship references to it.
