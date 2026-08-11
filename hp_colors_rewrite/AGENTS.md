# Repository Guidelines

## Project Overview

`hp_colors_rewrite/` is a clean-room Panorama rewrite of HP Colors for Deadlock. Milestone 1 proved local v1 healthbar observation in a real Deadlock session. The current slice adds an obvious stock-derived ESC-menu entry and proves the Ritual Stripe editor lifecycle without adding healthbar settings.

Do not add coloring, resizing, settings state, persistence, presets, classification, or Anita UI until the ESC editor lifecycle passes its own real in-game smoke. `FEATURES.md` lists later compatibility goals; it does not mean they are implemented.

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
unit_status_overlay.xml
  -> healthbar_probe.js
  -> discovers local v1 healthbars
  -> logs changed pip text or width percentage

hud_escape_menu.xml
  -> hp_colors_menu.js + hp_colors_menu.css
  -> adds the explicit HP COLORS row
  -> owns open, close, navigation, and hold-to-peek locally
```

`healthbar_probe.js` owns bounded v1 panel discovery and transition-only telemetry inside each unit-status overlay context. `hp_colors_menu.js` owns only the ESC editor lifecycle. The two paths do not exchange settings or state in the current slice.

Preserve these authority rules:

- A bar belongs to the overlay context that discovered it.
- Replaced panel parts increment the local generation and clear the prior data signature.
- Pip/width telemetry is emitted only when pip text or rounded width percentage changes.
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
- Keep discovery bounded. Current limits are one-second scans, depth 12, and 512 visited panels; do not introduce an unbounded tree walk or faster polling without live evidence.
- Keep mutable ownership local: each probe owns only the bars discovered in its overlay context. Do not introduce shared state unless live evidence proves local ownership insufficient.
- Preserve stock panel IDs, hierarchy, snippets, and bindings. Refresh stock XML from current GameTracking rather than reconstructing or guessing it.
- Work only on the v1 healthbar and its approved ESC editor. Do not introduce additional HUD surfaces.
- Keep debug logging transition-based. Do not log every one-second scan.
- Emit pip/width telemetry only when its signature changes. Do not log unchanged data every scan.
- Prefer the smallest behavior needed for the current milestone. Do not recreate old HP Colors abstractions or add speculative settings infrastructure.
- Make complex behavior emerge from the fewest deep seams possible. Prefer deleting coordination, state, and message paths over making them more elaborate.
- Do not add fallback paths. When a path is broken, remove it and replace it with one proven path; never keep the failed route beside the replacement.
- Solve each requirement where its data already lives. Keep ownership local unless live evidence proves that insufficient.
- Keep hot paths allocation- and write-conscious. Do not scan the full HUD per frame, log unchanged telemetry, repeat unchanged style/attribute writes, or increase polling frequency without live timing evidence.
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

This module intentionally has no automated validator or test framework. Do not recreate the deleted Node validator or adapt tests from old HP Colors lanes. Compilation, VPK asset checks, and matching SHA-256 hashes prove packaging and deployment only; they do not prove Panorama runtime behavior.

Required smoke:

1. Run `build_hp_colors_rewrite.ps1`.
2. Ask the user to restart Deadlock with `-dev -tools`; replacing a VPK while the game is running is not sufficient.
3. Open ESC and require one obvious `HP COLORS` row before the smaller Settings section.
4. Open the editor; exercise every category and contextual tab.
5. Hold Peek and require the editor to disappear while gameplay input remains blocked and real v1 bars remain visible.
6. Release Peek, then require Done and the first Escape to return to the stock ESC menu.
7. Observe v1 healthbars on heroes and creeps, then exit so `console.log` is flushed.
8. Require nonzero menu-ready/open/close logs, nonzero probe-ready/data logs, and no rewrite exceptions.

Never claim in-game verification unless this smoke was performed in a real Deadlock session. Record packaging/deployment success separately from live runtime proof.
