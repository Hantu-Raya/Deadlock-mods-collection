# Repository Guidelines

## Project Overview

Deadlock Mods Collection is a Windows-first Source 2 mod workspace for Deadlock. Most modules are Panorama HUD/UI overrides (`panorama/layout`, `panorama/scripts`, `panorama/styles`) that compile to sibling `*_compiled` folders and package into `pakXX_dir.vpk` files. A smaller part of the repo transforms large VData ability files into packaged variants.

Work in source folders, not compiled outputs. Compile/package only the target mod you changed.

## Architecture & Data Flow

- **Panorama mods**: XML includes compiled `.vjs_c`/`.vcss_c` assets; source is edited as `.js`/`.css`/`.xml`. Runtime code uses Source 2 Panorama globals: `$`, `Game`, `GameUI`, `$.Schedule`, `$.DispatchEvent`, `$.RegisterForUnhandledEvent`, panel traversal, panel attributes, and `GameUI.CustomUIConfig()`.
- **Build flow**: `{mod}/panorama` → optional validator/minifier/staging folder → `sr2compiler/New folder.exe` → `{mod}_compiled` → `vpkeditcli.exe` → `pakXX_dir.vpk` → Deadlock `citadel/addons`.
- **HP Colors full**: `hp_registrar.js` defines schema → `anita_ui_core.js` renders settings and emits updates → `anita_persist_loader.js` replays persisted values → `healthbar_logic.js` paints unit-status overlays.
- **HP Colors minimal**: separate builder preset VPK (`pak96_dir.vpk`) supplies preset snapshots; minimal runtime VPK (`pak97_dir.vpk`) ships only overlay/bootstrap/runtime compatibility assets.
- **Topbar Rank**: layout hooks call guarded wrappers in `topbar_rank_rank_bridge.js`; bridge resolves accounts/rank images/profile/player-list state. `topbar_rank_hud.js` separately manages timers, team networth advantage, and unspent souls.
- **Buff Timer**: one scheduled runtime engine updates Rejuvenator/bridge-buff timers, minimap snapshots, claim UI, pings, and watchdog recovery.
- **3D HUD**: stock binding IDs remain in XML so Source 2 continues feeding health data; custom JS reads those panels and overlays 3D hero/HP visuals.
- **Recent Purchase**: quickbuy layout adds total/per-entry labels; JS polls volatile queue/sell panels, computes effective remaining cost, and writes guarded labels.
- **Abilities**: Python mutates VData text records, compiles `.vdata_c`, stages pak03/pak04/pak05 variants, then archives dated `.7z` deliverables.

## Key Directories

- `topbar_rank/` — rank badges, topbar timers, objective-map/topbar CSS overrides, profile/player-list rank surfaces.
- `hp_colors/` — full Anita UI + HP Colors runtime and schema validators.
- `hp_color_debug/` — debug fork of full HP Colors with behavior parity plus extra tracing.
- `hp_colors_minimal/` — small runtime-only HP Colors VPK; depends on separate web-builder preset VPK.
- `hp_colors_minimal_color_debug/` — minimal runtime color-debug variant.
- `buff_timer_virgin/` — Rejuvenator/bridge-buff timer HUD with minimap/claim/ping support.
- `3d hud/` — static 3D hero scene HUD and custom local-player health overlay.
- `recent_purchase/` — quickbuy queue cost/deficit HUD.
- `abilities/scripts/` — large `abilities.vdata` / `abilities2.vdata` plus Python transforms.
- `passive_items_mod/` — passive item mod layout and build/tool references.
- `test/` and `api_test/` — experimental/reference/diagnostic mods. Use as comparison fixtures, not production modules.
- `scripts/` — cross-module utilities, currently including HP preset-store VPK/XML sync.
- `sr2compiler/` — custom .NET 9 Source 2 compile wrapper and preferences.
- `vpk cli/` and `passive_items_mod/compiler/` — VPK packer locations used by wrappers.
- `fps/` — performance/convar research and ETW wave tooling; require fresh evidence before recommendations.
- `.agents/system-prompts/` — local prompt/reference corpus, not runtime mod code.

Before editing a module, check its local `AGENTS.md` if present; local rules override this file.

## Development Commands

Run from repo root unless noted.

### Generic Panorama compile

```powershell
$repo = "F:\Users\FoxOS_User\Desktop\Deadlock-mods-collection"
& "$repo\sr2compiler\New folder.exe" "$repo\{mod_name}"
```

The compiler may exit nonzero after successful output because of an interactive `ReadKey()` prompt. Treat required compiled files plus `0 failed` as the real signal.

### Main build/package commands

```powershell
powershell -ExecutionPolicy Bypass -File build_hp_colors.ps1
node hp_colors_minimal\scripts\validate-minimal.js
powershell -ExecutionPolicy Bypass -File build_hp_colors_minimal.ps1
powershell -ExecutionPolicy Bypass -File build_hp_color_debug.ps1
powershell -ExecutionPolicy Bypass -File build_hp_colors_minimal_color_debug.ps1
powershell -ExecutionPolicy Bypass -File build_hp_colors_paks.ps1 -Variant all
powershell -ExecutionPolicy Bypass -File build_abilities_paks.ps1
powershell -ExecutionPolicy Bypass -File build_buff_timer_virgin.ps1
powershell -ExecutionPolicy Bypass -File build_hud_3d_heroes.ps1
powershell -ExecutionPolicy Bypass -File build_recent_purchase.ps1
powershell -ExecutionPolicy Bypass -File build_showrank_variants.ps1 -Variant all
```

### Focused validators

```powershell
node hp_colors\scripts\validate-schema.js
node hp_colors\scripts\validate-hero-selector.js
node hp_colors\scripts\validate-runtime-replay.js
node hp_color_debug\scripts\validate-schema.js
node hp_color_debug\scripts\validate-hero-selector.js
node hp_color_debug\scripts\validate-runtime-replay.js
node hp_colors_minimal\scripts\validate-minimal.js
node --test hp_colors_minimal\scripts\validate-minimal.test.js
node hp_colors_minimal_color_debug\scripts\validate-minimal.js
node --test hp_colors_minimal_color_debug\scripts\validate-minimal.test.js
node topbar_rank\scripts\validate-topbar-rank.js
```

### Ability transforms

```powershell
cd abilities\scripts
py passive.py abilities2.vdata
py active.py abilities.vdata
py active_no_behavior.py abilities.vdata
```

Prefer `build_abilities_paks.ps1` for packaged deliverables; use `build_abilities_paks.ps1 -RefreshFromSteamTracking` when pulling fresh SteamTracking ability data so both `abilities.vdata` and `abilities2.vdata` are refreshed together. Direct Python scripts may mutate input files when no output path is supplied.

## Code Conventions & Common Patterns

- JS files use IIFEs and strict mode:
  ```js
  (() => {
    "use strict";
  })();
  ```
- Indentation is 2 spaces in JS guidance; keep local file style when editing.
- Constants: `UPPER_SNAKE_CASE`; state/local variables: `camelCase`; cached/internal state may use `_prefix`.
- Group panel references in a `UI` object or equivalent root-state object.
- Always guard panel access: `if (!panel?.IsValid?.()) return;` or local equivalent.
- Cache panel refs during boot/init. Do not call `FindChildTraverse` or tree scans inside hot scheduled loops unless no safer path exists.
- Guard DOM writes: update text/classes/styles only when the value changed.
- Prefer adaptive `$.Schedule` polling/backoff over fixed high-frequency loops.
- Wrap volatile engine calls (`Game.*`, `$.*`, panel APIs racing layout load) in `try/catch` or guarded helpers.
- CSS uses `visibility: collapse` for hidden Panorama panels and `overflow: noclip` for glows/overlays.
- Use `pre-transform-scale2d`, not `scale3d`; avoid `clip-path`; use `style.clip` if clipping is needed.
- Use `s2r://` compiled asset includes in XML/CSS.
- Set `hittest="false"` on passive overlays so gameplay input is not captured.
- Preserve stock Source 2 binding IDs/classes in XML when the engine feeds values into them.
- For large VData, use streaming/text replacement patterns; do not introduce full parsers for the huge ability files.

## Key Classes and Functions

### `topbar_rank/`

- `TopbarRankTopBarRootLoaded()` — installs topbar rank bridge behavior for the root topbar layout.
- `TopbarRankRegisterTopBarPlayer()` — registers one topbar player panel for account/rank matching.
- `TopbarRankTriggerProfileCard()` — reads profile-card context and requests rank/profile updates.
- `TopbarRankEscapePreloadFromPlayerList()` — preloads rank evidence from Escape players-list rows.
- `TopbarRankRegisterPlayerListRowReady()` — marks player-list rows ready for rank image population.
- `TopbarRankHudRootLoaded()` — initializes timer/networth HUD state.
- `RootTick()` — scheduled topbar HUD loop for game time, powerup, Rejuvenator, buff, hideout/street-brawl visibility, and networth advantage.
- `TopbarRankHudPlayerLoaded()` — initializes per-player unspent-souls tracking.
- `CountSpentSouls()` — sums purchased item tier costs from current `PlayerModsContainer` panels.
- `topbar_rank/scripts/validate-topbar-rank.js` helpers (`assert`, `count`) — enforce source/layout/CSS/rank API invariants.

### `hp_colors/` and variants

- `hp_registrar.js: buildConfig()` — clones HP Colors setting schema into Anita config.
- `hp_registrar.js: register()` — registers schema via direct `AnitaUI.Register` and event handshake.
- `anita_ui_core.js: emitUpdate()` / `emitBulkUpdate()` — publish settings changes to runtime overlays.
- `anita_ui_core.js: selectBakedPresetForHero()` — chooses hero-scoped or global baked preset.
- `anita_ui_core.js: applyHpColorsBakedPresetOnce()` — applies selected baked preset only once per relevant context.
- `anita_ui_core.js: publishHpPresetSnapshot()` — broadcasts compact preset payloads for runtimes.
- `anita_persist_loader.js` bootstrap handlers — sanitize persisted compact payloads and replay defaults/stored values.
- `healthbar_logic.js: tryCache()` — finds and caches unit-status panel refs safely.
- `healthbar_logic.js: handleRuntimeEventPayload()` / `handleBulkRuntimeUpdate()` / `handleSingleRuntimeUpdate()` — ingest Anita updates.
- `healthbar_logic.js: applyCurrentSettings()` — paints current unit-status visuals from coerced config.
- `healthbar_logic.js: startEnemyLoop()` / `startAllyLoop()` / `startLevelLoop()` — scheduled overlay loops with guarded writes.
- `healthbar_logic.js: startPulse()` / `clearPulse()` — low-HP pulse lifecycle.
- Validator `MockPanel` classes — Node VM stand-ins for Panorama panels; track traversal, attributes, classes, and style writes.

### `hp_colors_minimal/`

- `anita_ui_core.js: buildHeroTables()` — builds hero alias lookup tables.
- `detectLocalHero()` — probes local hero identity from available UI signals.
- `selectPresetForHero()` — picks hero-specific preset first, then global fallback.
- `readPresetEntries()` / `readPresetValues()` — extracts baked preset data from preset-store panels/raw payloads.
- `publishPreset()` / `publishUntilReady()` — sends `HP_COLORS_PRESET_SNAPSHOT` until runtime is ready.
- `startBoundedHeroPresetProbe()` — bounded 10s hero-detection/preset-publish probe.
- `validate-minimal.js: getValidationReport()` — enforces minimal shipped file set and forbidden full-UI/persistence terms.

### `buff_timer_virgin/`

- `boot()` — resolves HUD refs and starts timer runtime.
- `loop()` — main scheduled engine for rejuv/buff/claim/minimap/ping state.
- `reset()` / `startRun()` — reset and phase-start helpers.
- `collectMinimapSnapshot()` — caches minimap/player markers for later checks.
- `computeNearestForTargets()` — finds nearest relevant targets without repeated full scans.
- `updateNeutralPhase()` — handles neutral objective timing state.
- `startBuff()` / `endBuff()` — bridge buff lifecycle.
- `showClaimIndicator()` — displays claim/contest UI.
- `handleRejuvPingActivate()` / `handleBuffPingActivate()` — sends team-chat timer pings.
- `fmt()` / `fmtCompact()` — timer formatting helpers.

### `3d hud/`

- `buildTables()` — constructs hero alias/scene lookup tables.
- `detectHero()` and probe helpers — determine local hero from runtime UI signals.
- `evaluateLobbyStatus()` — controls lobby/match scene visibility.
- `resolveHealthPanels()` — caches stock health binding panels.
- `readHealthState()` — reads current/max/deferred/damage/heal values.
- `writeHealthLabels()` — writes custom HP text.
- `writeHealthClips()` — updates clipped custom HP layers.
- `heldDamageClip()` / `resolveDeferredDamageClip()` / `resolveHealClip()` — compute visual clip regions.
- `healthLoop()` — scheduled local-player health overlay update.

### `recent_purchase/`

- `canon()` — canonicalizes item names for matching.
- `parseCost()` — parses soul costs from panel text.
- `formatSouls()` — displays compact soul values.
- `getItems()` / `getSellCredit()` — reads quickbuy and queued sell state.
- `compute()` — calculates effective remaining costs after recipe deductions and sell credit.
- `applyLabels()` — writes total/per-entry labels with guards.
- `sendQuickbuyChatMessage()` / `trySubmitTeamChat()` / `isTeamChatReady()` — opens/verifies/submits team-chat need messages.
- `tick()` — 50ms quickbuy polling loop.

### `abilities/scripts/`

- `active.py: iter_record_spans()` — walks VData record blocks without loading a full parser.
- `active.py: add_passive_item_flag()` — toggles passive-area flags and optional active behavior/targeting mutations.
- `active.py: append_behavior_bits()` / `remove_behavior_bits()` — edits `m_AbilityBehaviorsBits` idempotently.
- `active.py: set_targeting_location()` / `remove_targeting_location()` — manages `m_eAbilityTargetingLocation`.
- `active.py: verify_behavior_state()` / `find_behavior_state_issues()` — validates active yes/no-behavior expectations.
- `passive.py: add_passive_item_flag()` — simpler passive upgrade allow/deny transform for `abilities2.vdata`.
- `active_no_behavior.py` — calls `active.add_passive_item_flag(..., enable_behavior_bits=False)`.

### Build and utility scripts

- `scripts/sync_hp_preset_store.js: readVpk()` — parses single-file VPK v2 tree/data.
- `readSource2DataBlock()` — locates Source 2 `DATA` blocks.
- `extractPanoramaLayoutSource()` — decodes compiled layout XML from `.vxml_c`.
- `extractPresetStore()` / `injectPresetStore()` — copies `HPColorsPresetStore` into full HP Colors `base_hud.xml`.
- PowerShell helpers commonly named `Require-Path`, `Assert-UnderRoot`, `Remove-TreeUnderRoot`, `Invoke-*Compiler`, `Stage-*`, `Compress-*` — validate paths, clean staging, compile, pack, and archive safely.

## Important Files

- `README.md` — human project overview and mod-loading guidance.
- `CLAUDE.md` and module `AGENTS.md` / `CLAUDE.md` / `design.md` files — module invariants and assistant workflow rules.
- `.fallowrc.json` — Fallow static-analysis config and dynamic entry settings.
- `sr2compiler/pref.json` — Dota Workshop Tools location used by the compile wrapper.
- `sr2compiler/New folder.runtimeconfig.json` — .NET 9 runtime constraint for compile wrapper.
- `build_*.ps1` — module-specific build/package/deploy contracts.
- `hp_colors/scripts/validate-*.js`, `hp_colors_minimal/scripts/validate-*`, `topbar_rank/scripts/validate-topbar-rank.js` — source invariant gates.
- `abilities/scripts/abilities.vdata`, `abilities/scripts/abilities2.vdata` — huge mutable VData inputs.
- `test/topbar/` — legacy/reconstructed topbar reference; useful for visual parity, not production code.

## Runtime/Tooling Preferences

- OS/path assumptions are Windows-specific. Many scripts target `G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons`.
- Use PowerShell wrappers for build/deploy work; they encode required output and forbidden asset checks.
- Node is used directly for validators. There is no root package manifest or repo-wide npm script set.
- `npx --yes terser` is used by build wrappers for staged JS minification.
- Python launcher `py` is used for abilities transforms.
- Source 2 compile requires `sr2compiler/New folder.exe` and Dota 2 Workshop Tools configured by `sr2compiler/pref.json`.
- VPK packaging uses `vpkeditcli.exe`, usually from `passive_items_mod/compiler/`, `vpk cli/`, or release fallback paths.
- 7-Zip is used for dated deploy archives.
- Do not edit or validate compiled folders as source. Regenerate them from source.

## Testing & QA

- No repo-wide lint/test command is defined. Use focused validators and module build wrappers.
- Always run the validator for the module you changed when one exists.
- After `.js`, `.css`, or `.xml` edits, compile the target mod and confirm the expected compiled `.vjs_c`, `.vcss_c`, or `.vxml_c` exists.
- For deployable changes, pack the target VPK and confirm it exists both in the repo and Deadlock addons path.
- Validators are mostly static/VM checks; they do not prove in-game rendering, panel lifecycle, API image loading, or Source 2 timing.
- Manual runtime smoke for Panorama changes:
  1. Launch Deadlock with `-dev -tools`.
  2. Open Panorama debugger (`F7`) or VConsole (`F8`).
  3. Run `panorama_reload_layout`.
  4. Check for script/style errors and verify changed panels visually.
- For HP Colors, verify first paint, hero detection, preset replay, late panel creation, no VConsole errors, and no build-only validator assets in VPKs.
- For Topbar Rank, verify rank images, Escape → Players rank evidence, objective map visibility, timer alignment, and hideout/street-brawl hiding.
- For abilities, verify behavior-bit state after transforms and inspect the staged pak variant, not only Python stdout.
- For FPS/convar work, rely on ETW wave traces and clean-window P99/P95/max frame data; do not recommend old rejected convars without newer evidence.
