# Repository Guidelines

## Project Overview

`hp_colors_rewrite/` is a clean-room Panorama rewrite of HP Colors for Deadlock. Milestone 1 proved local v1 observation, and the user confirmed the ESC editor, cached renderer, three-slider palette, reversible visibility, feedback controls, fixed/gradient low-mid-high colors, team-high color, independent exclusions, bar position, and ultimate-icon coloring in game.

Do not add durable persistence, presets, pulse, kill-marker, or Anita compatibility until the next focused slice requires them. `FEATURES.md` lists later compatibility goals; it does not mean they are implemented.

Source-of-truth order:

1. Current user requirements and root `../AGENTS.md`.
2. Current stock layouts in `SteamTracking/GameTracking-Deadlock`.
3. `FEATURES.md` for milestone scope and observable behavior.
4. `design.md` for the approved ESC editor interaction and visual contract.
5. Module XML/JS/CSS for runtime behavior.
6. `../build_hp_colors_rewrite.ps1` for packaging and deployment.

## Questions are read-only

- A question is a request for an answer, not for changes. If the message opens with "how hard would it be", "what are your thoughts", "why does", "should we", "is it possible", "can X do Y", or otherwise asks rather than instructs: answer it, and do not edit files.
- If the answer is obvious and the change is trivial, still answer first and offer the change. Ask before making it.

## Architecture & Data Flow

```text
hud_escape_menu.xml
  -> hp_colors_menu.js + hp_colors_menu.css
  -> owns the session snapshot and functional controls
  -> publishes versioned base-to-overlay config changes

unit_status_overlay.xml
  -> healthbar_probe.js
  -> caches the latest snapshot per overlay context
  -> discovers, classifies, and styles local v1 bars
  -> logs transition-only telemetry
```

`hp_colors_menu.js` owns one session-scoped settings snapshot. It retains the snapshot on its absolute root and publishes it through `ClientUI_FireOutput`. The root attribute is only a same-tree cache: live logs showed zero root bootstraps in unit-status contexts. While customization is enabled, the owner replays the unchanged cached snapshot at 1-second hot, 3-second warm, then 8-second idle intervals so late contexts receive it. `healthbar_probe.js` keeps one local snapshot and ignores identical replays before parsing or rendering. There is no overlay-to-menu request path, full-tree refresh, or second settings authority.

Preserve these authority rules:

- A bar belongs to the overlay context that discovered it.
- Replaced panel parts increment the local generation, clear render caches, and reapply the cached snapshot.
- `team_neutral` wins classification before `enemy` or `friend`; `team1`/`team2` never imply relation. Building and boss flags are classified independently from relation, and unknown teams retain the configured high color.
- The custom renderer writes fill/healing/delta and ultimate-icon `washColor`, bullet-shield `backgroundColor`, plus container opacity/width/height/transform. It never writes engine-owned fill, feedback, shield widths, icon image, or icon visibility. Bypass and exclusions clear relation-owned inline colors so stock CSS resumes.
- Hidden enemy and ally bar containers remain rendered at `opacity: 0.01` so the engine continues updating their widths; showing them writes `opacity: 1`. Never use `visibility: collapse` or zero opacity for this control.
- The owned HP counter may translate beyond the 120px stock health container. A `399px` in-flow `hp_counter_top_extent` before `InfoHealthContainer` enlarges `UnitStatus` above the stock bar; `hp_counter_anchor` remains an ignored-flow `160%` × `1140px` canvas centered on the established healthbar origin. Placement limits are ±405px horizontally, −365px upward, and 270px downward. The counter remains white and receives dynamic text tint through `washColor`; never replace this with dynamic `color`, which renders darker than the bar and legacy wash-color path. `WindowRoot`, `UnitStatus`, `InfoHealthContainer`, and `hp_counter_anchor` must retain `overflow: noclip`. Do not replace the in-flow extent with ignored-flow anchor height: ignored-flow geometry does not enlarge the world-panel render surface.
- Pip/width, role, and config diagnostics remain transition-only.
- Removed bars are deleted from the local registry.

## Key Directories

- `panorama/layout/` — stock-derived v1 unit-status and ESC-menu overrides with only rewrite includes and panels added.
- `panorama/scripts/` — the local healthbar probe and ESC editor lifecycle runtime.
- `panorama/styles/` — the Ritual Stripe editor and entry styling.
- `../hp_colors_rewrite_compiled/` — generated `.vxml_c`/`.vjs_c`/`.vcss_c` output. Never edit it.
- `../scripts/` — shared Source 2 packaging helpers used by the root build wrapper.

Do not copy implementation from `../hp_colors/` or its validators. This rewrite intentionally starts from small seams rather than the old runtime.

## Development Commands

Build, pack, back up the existing addon, deploy, and verify the deployment hash:

```powershell
powershell -ExecutionPolicy Bypass -File build_hp_colors_rewrite.ps1
```

The wrapper creates root `pak01_dir.vpk` and deploys it to:

```text
G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak01_dir.vpk
```

There is no lint command, package-manager command, local run command, or automated test command for this module. Runtime verification happens in Deadlock.

`pak01_dir.vpk` conflicts with other pak01 producers such as Poker and Qollite. The rewrite wrapper creates a timestamped backup before replacing the addon, but running another pak01 wrapper will still replace this mod.

## Code Conventions & Common Patterns

- Panorama JavaScript uses a strict IIFE, two-space indentation, `var`, `camelCase` functions/state, and `UPPER_SNAKE_CASE` protocol/timing constants.
- Use the Source 2 `$` global directly; there is no module loader, dependency injection container, Node runtime, or browser DOM. `GameUI` is not defined in unit-status script contexts—never depend on it.
- Use `$.Schedule` in seconds. Long-lived callbacks must stop when their context panel becomes invalid.
- Guard volatile panel methods with validity checks and narrow `try/catch`; a racing or replaced Panorama panel is normal runtime behavior.
- Keep discovery bounded at one-second scans, depth 12, and 512 visited panels. Gradient painting may read only cached fill/parent/shield widths at 0.15-second active, 0.25-second recent, and 1.5-second idle intervals; never move tree discovery or logging into that paint tick.
- Keep mutable ownership local: each probe owns only the bars discovered in its overlay context. Do not introduce shared state unless live evidence proves local ownership insufficient.
- Preserve stock panel IDs, hierarchy, snippets, and bindings. Refresh stock XML from current GameTracking rather than reconstructing or guessing it.
- Work only on the v1 healthbar and its approved ESC editor. Do not introduce additional HUD surfaces.
- Keep debug logging transition-based. Do not log every one-second scan.
- Emit pip/width telemetry only when its signature changes. Do not log unchanged data every scan.
- Prefer the smallest behavior needed for the current milestone. Do not recreate old HP Colors abstractions or add speculative settings infrastructure.
- Make complex behavior emerge from the fewest deep seams possible. Prefer deleting coordination, state, and message paths over making them more elaborate.
- Do not add fallback paths. When a path is broken, remove it and replace it with one proven path; never keep the failed route beside the replacement.
- Solve each requirement where its data already lives. Keep ownership local unless live evidence proves that insufficient.
- Keep hot paths allocation- and write-conscious. Do not scan the full HUD per frame, log unchanged telemetry, or repeat unchanged style/attribute writes. The gradient tick must return before color computation when floored shield-aware health percentage is unchanged.
- Color swatches open one shared HSL picker with three native horizontal Panorama `Slider` controls: Hue `0–359`, Saturation `0–100`, and Lumen `0–100`. All three update the authoritative snapshot live and add one Undo entry per completed gesture. Do not add custom pointer fields, mouse bridges, drag proxies, generic panel mouse routing, or coordinate polling.
- Delete experiments and instrumentation that no longer prove current behavior. Debug code must remain bounded, transition-based, and useful to the in-game smoke.

## Important Files

- `FEATURES.md` — milestone contract, future feature inventory, telemetry format, and smoke steps.
- `design.md` — approved ESC editor information architecture, interactions, visuals, and state-flow constraints.
- `panorama/layout/unit_status_overlay.xml` — classic stock overlay plus probe include.
- `panorama/layout/hud_escape_menu.xml` — current stock ESC layout plus the HP Colors entry and editor shell.
- `panorama/scripts/healthbar_probe.js` — local discovery and telemetry entry point.
- `panorama/scripts/hp_colors_menu.js` — local ESC editor lifecycle and navigation.
- `panorama/styles/hp_colors_menu.css` — Ritual Stripe entry and editor styling.
- `../scripts/source2_package_pipeline.ps1` — safe cleanup, compiler, VPK pack/list, and asset-contract helpers.
- `../sr2compiler/pref.json` — Dota Workshop Tools location used by the compiler wrapper.

## Runtime/Tooling Preferences

- Windows PowerShell is the supported build shell.
- Use the repository wrapper, not direct compiler or packer commands.
- Required tools: `sr2compiler/New folder.exe`, .NET 9 runtime support, Dota Workshop Tools/resourcecompiler, and a repository `vpkeditcli.exe` candidate.
- No npm/Bun/Node package manifest belongs to this module. Do not introduce a package manager.
- The compiler may hang or exit nonzero after producing every required output because of its final redirected `Console.ReadKey`. Required outputs are the success signal; missing output is fatal.
- Never hand-edit `hp_colors_rewrite_compiled/`, root `pak01_dir.vpk`, deployed VPKs, or timestamped backups.
- The build must retain exactly the two layouts, two scripts, and one stylesheet required by the current slice and reject raw source or documentation inside the VPK.
- Never launch, restart, stop, or otherwise control Deadlock. Only the user runs the game and performs interactive smoke steps. After the user exits, inspect `console.log` for evidence.

## Testing & QA
Focused regression tests are `../scripts/validate-hp-colors-rewrite-picker.test.js`, `../scripts/validate-hp-colors-rewrite-visibility.test.js`, `../scripts/validate-hp-colors-rewrite-healthbar-controls.test.js`, and `../scripts/validate-hp-colors-rewrite-readout.test.js`. They cover the native palette, reversible non-culling visibility, team-high colors, exclusions, position, ultimate icons, HP readout formats/placement/colors, live publishing, replacement replay, and Undo. Compilation, VPK asset checks, and matching SHA-256 hashes prove packaging and deployment only; they do not prove Panorama runtime behavior.

Required smoke:

1. Run `build_hp_colors_rewrite.ps1`.
2. Ask the user to restart Deadlock with `-dev -tools`; replacing a VPK while the game is running is not sufficient.
3. Open `HP COLORS`; toggle the master switch and require enemy bars to change immediately.
4. Exercise fixed/gradient enemy colors, thresholds, visibility, width, height, healing, damage-delta, and bullet-shield colors.
5. Enable ally customization and require only friend bar, healing, damage-delta, and bullet-shield colors to change.
6. Require neutral units and unclassified bars to remain stock.
7. Spawn or reveal late bars and require them to receive the current snapshot without reopening the editor.
8. Open color swatches across enemy and ally pages; drag hue, saturation, and Lumen to require live canonical hex and bar updates, then require one Undo to restore the pre-drag color.
9. Exercise Reset Section, Peek, Done, and Escape, including Escape dismissing the palette before closing the editor.
10. Exercise HP readout visibility, current/max, percentage, and current-only formats; size and positive/negative offsets; bar-derived and custom fixed/gradient colors; exclusions; and late/replaced bars.
11. Exit so `console.log` flushes; require config/role transitions, probe data, and no rewrite exceptions.

Never claim in-game verification unless this smoke was performed in a real Deadlock session. Record packaging/deployment success separately from live runtime proof.
