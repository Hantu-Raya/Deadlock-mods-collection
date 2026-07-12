# Repository Guidelines

## Project Overview

Deadlock Mods Collection is a Windows-first workspace for Source 2/Deadlock mods. Most active modules override Panorama HUD/UI assets; the abilities lane transforms large KV3/VData files. Source is compiled, packed into `pak*_dir.vpk`, and optionally deployed to Deadlock's `citadel/addons` directory.

Work in source directories only. Treat `*_compiled/`, Closure staging directories, pak staging trees, VPKs, `.7z` archives, and generated diagnostics as build output unless a task explicitly targets them.

## Architecture & Data Flow

### Panorama modules

The common flow is:

```text
panorama/{layout,scripts,styles,images}
  -> sr2compiler / resourcecompiler
  -> <module>_compiled
  -> vpkeditcli
  -> pakXX_dir.vpk
  -> Deadlock citadel/addons
```

- XML layouts are module entry points and the import seam: they include compiled `s2r://...vjs_c`/`vcss_c` assets and expose engine-fed panel IDs.
- Runtime JavaScript uses strict IIFEs and Source 2 globals (`$`, panels, `GameUI`, `Game`). There is no normal JS module graph.
- Cross-context communication uses `GameUI.CustomUIConfig()`, root/panel attributes, `ClientUI_FireOutput` JSON events, static stores, and observed stock chat rows.
- Runtime state lives in singleton `State`/`UI` objects. Renderers project state into panels; reducers or command handlers own transitions.
- `$.Schedule` drives polling, retries, and backoff in **seconds**. Long-lived loops use generation/token checks so stale callbacks stop safely.
- Engine APIs and panels race load order. Cache panel references, validate them before use, and guard volatile calls with `try/catch`.

Important lanes:

- **Poker/Bluff Deck**: `poker_escape_menu.js` owns deterministic engines, party/ready/progress/resume state, reducers, and rendering. `poker_chat_debug.js` polls stock `#ChatMessages` and bridges sender-stabilized rows. Chat is the synchronization authority; never replace it with an assumed network API or grant authority to `<unknown>`.
- **HP Colors full**: `anita_ui_core.js` owns ANITA UI, presets, persistence, and publishing; `healthbar_logic.js` consumes settings and paints stock unit-status overlays.
- **HP Colors minimal**: a runtime-only pak consumes a separate builder preset-store VPK through the static request/snapshot bridge. Do not add full-lane UI, persistence, convars, or runtime preset-store rescans.
- **Topbar Rank/ShowRank**: layouts load `showrank_common.js` plus the combined topbar runtime. Guarded global wrappers bridge profile, player-list, topbar, and Escape contexts.
- **Topbar Status Buffs**: a healthbar publisher writes compact status snapshots; a topbar consumer renders them. It conflicts with other pak89 variants.
- **Abilities**: Python performs streaming/text-span transforms over huge VData inputs. Do not introduce a full parser; transforms may mutate inputs and wrappers restore baselines.

## Key Directories

- `poker/` — chat-authoritative Poker and Bluff Deck ESC-menu minigames; see `poker/AGENTS.md`, `poker/CONTEXT.md`, and `poker/codemap.md` first.
- `hp_colors/` — full ANITA UI and HP Colors runtime.
- `hp_colors_minimal/` — minimal pak97 runtime paired with a separate pak96 builder preset.
- `hp_color_debug/`, `hp_colors_minimal*_debug/` — diagnostic variants; follow their local contracts instead of copying them into production lanes.
- `topbar_rank/`, `showrank/` — rank surfaces, topbar HUD, profile/player-list hooks, and build variants. Current combined code uses `showrank_common.js`; legacy `topbar_rank_rank_bridge.js` references are stale.
- `topbar_status_buffs/` — healthbar-to-topbar status-effect bridge.
- `buff_timer_virgin/`, `recent_purchase/`, `3d hud/` — independent Panorama HUD/shop overrides.
- `abilities/scripts/` — mutable VData baselines and Python text transforms.
- `scripts/` — shared packaging helpers, HP codecs/contracts, VM adapters, and preset-store utilities.
- `sr2compiler/` — shipped Source 2 compiler wrapper, .NET runtime config, and Dota Workshop Tools preference.
- `vpk cli/` — repository-local VPK pack/list tooling candidate.
- `docs/` — workspace structure and API research. Use `docs/WORKSPACE_STRUCTURE.md` for source/archive layout.
- `test/`, `api_test/` — mixed fixtures, manual diagnostics, experiments, and a few buildable probes such as `test/qollite`; inspect the local wrapper before classifying a subtree.
- `_archive/` and generated siblings — historical or generated material, not default edit targets.

## Development Commands

There is no root package manifest or repo-wide command. Run the focused validator and wrapper for the module being changed.

```powershell
# Shared packaging helper self-test
powershell -ExecutionPolicy Bypass -File scripts\validate-source2-package-pipeline.ps1

# Poker / Bluff Deck
node poker/scripts/validate-poker.js
node poker/scripts/validate-ready-state.js
node poker/scripts/validate-poker-game.js
node poker/scripts/validate-bluff-deck-game.js
powershell -ExecutionPolicy Bypass -File build_poker.ps1

# Full HP Colors
node hp_colors/scripts/validate-schema.js
node hp_colors/scripts/validate-hero-selector.js
node hp_colors/scripts/validate-runtime-replay.js
powershell -ExecutionPolicy Bypass -File build_hp_colors.ps1

# Minimal HP Colors
node hp_colors_minimal/scripts/validate-minimal.js
node --test hp_colors_minimal/scripts/validate-minimal.test.js
powershell -ExecutionPolicy Bypass -File build_hp_colors_minimal.ps1

# Topbar Rank / ShowRank
npm --prefix showrank test
powershell -ExecutionPolicy Bypass -File build_showrank_variants.ps1 -Variant all

# Other production wrappers
powershell -ExecutionPolicy Bypass -File build_topbar_status_buffs.ps1
powershell -ExecutionPolicy Bypass -File build_buff_timer_virgin.ps1
powershell -ExecutionPolicy Bypass -File build_recent_purchase.ps1
powershell -ExecutionPolicy Bypass -File build_hud_3d_heroes.ps1
powershell -ExecutionPolicy Bypass -File build_abilities_paks.ps1
```

Use `build_abilities_paks.ps1 -RefreshFromSteamTracking` only when intentionally refreshing upstream baselines. Prefer module wrappers over direct compiler/packer calls: wrappers encode staging, Closure transforms, required/forbidden asset checks, safe cleanup, archives, and deployment.

Multiple builds reuse pak slots, notably pak89, pak97, and pak98. Treat those outputs as mutually exclusive unless a wrapper explicitly combines them.

## Code Conventions & Common Patterns

- Follow the nearest module's `AGENTS.md`/`CONTEXT.md` and existing local style; do not create a second convention.
- Panorama JS usually uses two-space indentation, `UPPER_SNAKE_CASE` constants, and `camelCase` state/functions inside a strict IIFE:

  ```js
  (() => {
    "use strict";
  })();
  ```

- XML IDs are semantic/Pascal-style and act as runtime API. Keep XML IDs, JS lookup tables/global handlers, CSS classes, and validators synchronized.
- Cache panels at boot or first discovery. Avoid repeated full-tree scans in hot scheduled loops.
- Guard writes with change detection or render caches; do not repeatedly assign unchanged text, classes, attributes, or styles.
- Use `visibility: collapse` to hide Panorama panels, `overflow: noclip` for overlays/glows, and `hittest="false"` for passive surfaces. Prefer supported Source 2 CSS such as `pre-transform-scale2d`; avoid browser-only CSS assumptions.
- Preserve stock binding IDs/classes when the engine populates them.
- Treat identity, session IDs, revisions, epochs, generations, and nonces as authority boundaries. Reject stale or mismatched state instead of guessing.
- Error handling differs by boundary: runtime panel/engine races are guarded and often logged; build scripts fail hard on missing inputs, unsafe paths, absent outputs, or VPK asset-contract violations.
- Source asset references use `.vtex`; packed VPKs contain `.vtex_c`.

## Important Files

- `README.md` — human-facing mod overview and loading guidance; wrappers and module docs are more authoritative for development.
- `docs/WORKSPACE_STRUCTURE.md` — source, generated-output, and archive layout.
- `CONTEXT-MAP.md` — index of available domain context documents.
- `scripts/source2_package_pipeline.ps1` — root-bounded cleanup, compiler handling, VPK packing/listing/assertions, and 7-Zip helpers.
- `scripts/hp-colors-validator-contract.js` — current shared HP schema/runtime validation contract; avoid duplicating setting counts in this guide.
- `scripts/hp-colors-panorama-test-adapter.js` — reusable Panorama VM/panel/scheduler harness.
- `scripts/hp-colors-preset-codec.js` — Node-side HP preset codec and compatibility logic.
- `sr2compiler/pref.json` — Dota Workshop Tools install preference.
- `sr2compiler/New folder.runtimeconfig.json` — compiler wrapper .NET runtime requirement.
- `build_*.ps1` — authoritative module-specific compile/package/deploy workflows.
- `abilities/scripts/abilities.vdata`, `abilities/scripts/abilities2.vdata` — large mutable ability inputs used by the main abilities build.

## Runtime/Tooling Preferences

- The automated workflow is Windows PowerShell-first. Paths commonly target Deadlock under `G:\SteamLibrary\steamapps\common\Deadlock` and Dota Workshop Tools under `E:\SteamLibrary\steamapps\common\dota 2 beta`; build parameters/config are authoritative when local installs differ.
- Required tooling varies by wrapper: Node, PowerShell, .NET 9, Dota 2 Workshop Tools/resourcecompiler, `vpkeditcli.exe`, 7-Zip, and the Python launcher for abilities.
- There is no root package manager. Node validators run directly. Closure builds invoke `npx --yes google-closure-compiler`; do not assume dependencies are pinned locally.
- `sr2compiler/New folder.exe` may exit nonzero after successful redirected execution because its final `Console.ReadKey` cannot read stdin. Required compiled outputs plus the compiler's `0 failed` summary are the success signal.
- `scripts/source2_package_pipeline.ps1` may choose among configured VPK-tool candidates; do not hardcode a different tool path when the wrapper already resolves one.
- Never hand-edit compiled assets, VPKs, staging directories, or archives. Build wrappers may delete/recreate them.

## Testing & QA

- Most checks are direct Node scripts using `assert`, VM mocks, or Node's built-in `node:test`; there is no root Jest/Vitest setup and no repo-wide coverage target.
- Shared Node tests include `scripts/hp-colors-*.test.js`. ShowRank's local `package.json` provides its own chained `npm test`; this does not apply to the repository root.
- Static validators prove source/layout/style/token/asset contracts. VM validators prove behavior only inside synthetic Panorama mocks.
- After changing deployable JS/XML/CSS/images/VTex:
  1. run every focused validator for that module;
  2. run the module build wrapper;
  3. confirm required compiled/VPK assets and forbidden raw assets;
  4. perform an in-game Panorama smoke test for rendering, timing, chat, or cross-client behavior.
- Poker changes require all four Poker/Bluff validators and `build_poker.ps1`; multiplayer/chat authority still requires a real multi-client smoke where relevant.
- HP Colors changes should pair schema checks with hero/runtime replay checks. Minimal lanes also run their `node --test` suites.
- FPS/convar recommendations require fresh ETW/PerfView evidence; do not rely on old traces.
- Keep tests deterministic, isolated, and full-suite safe. Test observable transitions, authority boundaries, precedence, invalid/stale input, and real error paths—not source-text implementation details.
