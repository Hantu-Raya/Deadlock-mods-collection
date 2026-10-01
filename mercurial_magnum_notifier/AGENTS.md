# Repository Guidelines

## Project Overview

`mercurial_magnum_notifier` is a Deadlock Panorama HUD override for three item-state indicators beside the gun ammo count:

- Mercurial Magnum proc state and ammo glow
- Split Shot's five-second active window
- Blood Tribute's manual toggle state

Edit source under this directory only. Treat `../mercurial_magnum_notifier_compiled/`, `../standalone_mercurial_magnum_notifier_compiled/`, `../standalone_redesign_mercurial_magnum_notifier_compiled/`, `../pak99_dir/`, `../pak99_dir.vpk`, and dated `.7z` files as generated output.

## Architecture & Data Flow

The runtime flow is:

```text
panorama/layout/ability_hud_elements/element_gun.xml
  -> loads compiled notifier CSS and JavaScript
  -> mercurial_magnum_notifier.js polls stock HUD panels
  -> derived item states toggle CSS classes
  -> mercurial_magnum_notifier.css positions and stacks three images
```

`element_gun.xml` preserves the stock gun HUD and adds three passive, non-hit-testable image panels after `#ammo_panel`. Keep them outside ammo flow so the ammo labels never shift.

`panorama/scripts/mercurial_magnum_notifier.js` is a strict IIFE. It has three indicator trackers (`magnum`, `split`, `blood`) in an `INDICATORS` list, and they share `setActive()`, `renderNotifier()`, `renderAmmoColor()`, and `renderPositions()`. Each tracker keeps its own detector: `updateSplitShot`, `updateBloodTribute`, and `updateMagnum`, which run in that order each tick. Through `$.Schedule`, `update()` uses a 0.5-second discovery cadence until a tracked item is owned, then switches to 0.05-second state polling. It reschedules in a `finally` block, so a throwing panel write cannot end the loop. The script caches valid panel references and bounds item rescans and missing local-panel retries to 0.5 seconds. It writes visual state only on transitions or when it finds a replacement panel.

Detection contracts:

- Mercurial Magnum observes `upgrade_ethereal_bullets`, its `cooling_down` class, and the stock `reloading` class. It reads the cooldown timer text and the radial `cooldown_mask` clip only while the item is cooling down, because reset detection needs two consecutive cooling samples.
- Split Shot observes `upgrade_split_shot`, arms while ready, activates on ready-to-cooldown, and expires after five seconds.
- Blood Tribute caches the inspected `#abilitiesContainer` slots `#abilityButton0` through `#abilityButton3` and each slot's `.ability_name` label. Every 0.5 seconds it identifies the observed `BLOOD TRIBUTE` label text, while the hot loop reads only the matched slot's `toggled_on` class.
- All three indicators are independent. When effects overlap, activation order controls the stack: the first activated indicator stays leftmost and the newest stays nearest to ammo, with uniform 20px spacing.

`../build_mercurial_magnum_notifier.ps1 -Variant standalone|standalone_redesign` owns packaging:

```text
mercurial_magnum_notifier/panorama
  + ../<Variant>/panorama/styles overlaid onto panorama/styles (hash-checked)
  -> ../_<Variant>_mercurial_magnum_notifier_closure/ (temporary; JS replaced by Closure ADVANCED output)
  -> validate-notifier.js re-run against the minified runtime
  -> sr2compiler -> ../<Variant>_mercurial_magnum_notifier_compiled/
  -> ../pak99_dir.vpk (exact 12-asset inventory checked with Source2Viewer-CLI)
  -> backup existing addons/pak99_dir.vpk as .backup_<timestamp>, copy, SHA256-verify
```

The wrapper validates the source first, never minifies the source in place, and removes the temporary stage even when a step fails. `-PakName`, `-AddonsPath`, and `-SkipDeploy` override the defaults. Both variants default to `pak99_dir.vpk`, so deploying one replaces the other.

### Compiled variants

The repository root has two git-ignored compiled trees. Each tree contains the same notifier on top of a different passive-item look:

| Compiled tree | Passive-icon styling source |
|---|---|
| `../standalone_mercurial_magnum_notifier_compiled/` | `../standalone/` (pak06 passive items) |
| `../standalone_redesign_mercurial_magnum_notifier_compiled/` | `../standalone_redesign/` (pak07 redesign) |

- Only `styles/hud_ability_icon_passive.vcss_c` and `styles/base/hud_ability_icon_passive.vcss_c` differ in content. The redesign adds round grey-backed 45×45 passive slots, clear slot wash colors, an 18px cooldown timer, a `status_border_psd` cooldown mask, and a dimmed cooldown image.
- All other outputs match: notifier JS, `element_gun`, notifier CSS, `hud`, `hud_abilities`, `base/hud`, `base/hud_abilities`, and the three textures. Their byte differences are only the embedded compiler addon path (`_standalone_…_closure` vs `_standalone_redesign_…_closure`).
- This source directory currently matches the **redesign** variant. To rebuild the plain standalone variant, take both `hud_ability_icon_passive.css` files from `../standalone/panorama/styles/`.
- `../build_mercurial_magnum_notifier.ps1` rebuilds either tree; the `standalone` variant's output reproduces the older standalone tree's CSS exactly.

## Key Directories

- `panorama/layout/ability_hud_elements/` — replacement gun HUD layout and compiled-resource includes.
- `panorama/scripts/` — production item discovery, sampled state transitions, and transition-only rendering.
- `panorama/styles/` — notifier positioning plus required HUD/passive-item overrides.
- `panorama/styles/base/` — stock compiled-style imports used by local overrides.
- `panorama/images/mercurial_magnum/` — purple gun PNG and `.vtex` descriptor.
- `panorama/images/split_shot/` — orange Split Shot PNG and `.vtex` descriptor.
- `panorama/images/blood_tribute/` — Blood Tribute PNG and `.vtex` descriptor.
- `scripts/` — dependency-free Node validator and Panorama VM harness.

## Development Commands

Run commands from the repository root:

```powershell
# Fast source and behavior validation
node mercurial_magnum_notifier/scripts/validate-notifier.js

# JavaScript syntax check
node --check mercurial_magnum_notifier/panorama/scripts/mercurial_magnum_notifier.js

# Validate, minify, compile, pack, and deploy addons/pak99_dir.vpk
powershell -ExecutionPolicy Bypass -File build_mercurial_magnum_notifier.ps1 -Variant standalone
powershell -ExecutionPolicy Bypass -File build_mercurial_magnum_notifier.ps1 -Variant standalone_redesign

# Build and pack without touching the game folder
powershell -ExecutionPolicy Bypass -File build_mercurial_magnum_notifier.ps1 -Variant standalone -SkipDeploy
```

There is no module-local package manifest, install command, linter, development server, or coverage command.

## Code Conventions & Common Patterns

- JavaScript uses two-space indentation, a strict IIFE, `UPPER_SNAKE_CASE` constants, camelCase functions, and the three module-level tracker objects. Keep private state statically accessed (no string-keyed dispatch) so Closure ADVANCED renames it safely, and use index loops rather than `for...of` in hot paths.
- Panorama is the runtime dependency. Do not introduce CommonJS/ES modules or browser-only APIs into runtime scripts.
- Runtime dependencies come from Panorama globals; the validator injects mock `$`, `Date`, and panel objects through Node's `vm` instead of using a dependency-injection framework.
- `$.Schedule` durations are seconds. Keep the 0.05-second owned-item hot loop allocation-free; use the 0.5-second discovery cadence while no tracked item is owned and avoid full-tree traversal between bounded rescans.
- Cache panels and item slots; rescan only at bounded intervals or after invalidation.
- Guard volatile Panorama calls with `isValid` and narrow `try/catch`. Readers return `null`, `""`, or `-1` on engine/panel races.
- State setters own visual transitions. Avoid assigning unchanged classes, visibility, opacity, text, or styles each poll.
- Panel IDs and CSS classes are runtime API. Update XML, JavaScript, CSS, and validator assertions together.
- CSS uses tabs, concrete panel IDs, and PascalCase runtime classes such as `MagnumBuffActive`, `NotifierOneOffset`, and `NotifierTwoOffsets`.
- Use Panorama-supported properties: `visibility: collapse`, `overflow: noclip`, `transform`, and `transition-*`. Keep passive images `hittest="false"`.
- Image paths are lowercase snake_case. Each losslessly optimized RGBA PNG has a same-basename `.vtex`; preserve transparent clear color, lossless `BGRA8888` output, `m_mipAlgorithm = None`, and `m_bNoLod = 1`.
- Production runtime must not call `$.Msg` or retain debug state/reason strings. Keep diagnostics in validator failures, not the 20 Hz Panorama loop.

## Important Files

- `panorama/layout/ability_hud_elements/element_gun.xml` — module entry point, stock gun hierarchy, and three notifier panels.
- `panorama/scripts/mercurial_magnum_notifier.js` — complete runtime controller and state machine.
- `panorama/styles/mercurial_magnum_notifier.css` — 18px icons, fixed stack translations, transitions, and Magnum ammo glow.
- `panorama/styles/hud.css` — HUD override and passive-item bar placement.
- `panorama/styles/hud_abilities.css` — ability/passive-item container behavior.
- `panorama/styles/hud_ability_icon_passive.css` — passive item icon, cooldown, and readiness styling.
- `scripts/validate-notifier.js` — static asset/layout contracts and deterministic VM behavior tests.
- `../build_mercurial_magnum_notifier.ps1` — authoritative variant build/pack/deploy wrapper.

## Runtime/Tooling Preferences

- Target: Deadlock's Source 2 Panorama runtime on Windows.
- Validation: Node using built-in `assert`, `fs`, `path`, and `vm`; no npm dependencies or package manager.
- Build: Windows PowerShell, `npx google-closure-compiler`, `../sr2compiler/New folder.exe`, repository-local `vpkeditcli.exe`, and `.tmp` Source2Viewer-CLI.
- Default addons path: `G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons`.
- Source extensions compile as `.css -> .vcss_c`, `.xml -> .vxml_c`, `.js -> .vjs_c`, and `.vtex -> .vtex_c`.
- The compiler may be stopped after expected outputs appear and may exit nonzero afterward; treat complete expected output plus the `0 failed` summary as success.
- Both variants deploy to `pak99` by default and may conflict with other mods on that slot; the passive-items `standalone`/`standalone_redesign` paks (`pak06`/`pak07`) restyle the same passive icons. Do not assume simultaneous compatibility.

## Testing & QA

`scripts/validate-notifier.js` combines:

- static PNG, `.vtex`, XML, and CSS assertions;
- a deterministic `MockPanel` tree and mocked Panorama scheduler;
- Magnum proc/reload/reset regressions;
- Split Shot activation, expiry, and overlap regressions;
- Blood Tribute toggle, removal, four-slot movement, and stacking regressions;
- missing-ammo-label retry bounding/recovery and loop survival after a throwing panel write;
- production-runtime assertions that reject diagnostic logging.

`NOTIFIER_RUNTIME_PATH=<file>` points the validator at another runtime, such as Closure ADVANCED output, to check the minified build.

For source changes, run the validator first. For deployable JS/XML/CSS/image changes, also run `../build_mercurial_magnum_notifier.ps1`; it re-validates the minified runtime and fails on any missing or extra packed asset.

The VM harness does not prove the live Panorama hierarchy, actual timer cadence, texture appearance, or in-game positioning. After replacing the active VPK, start or restart Deadlock and perform an in-game smoke test covering ownership discovery, each activation/deactivation path, all three simultaneous indicators, ammo stability, and all four Blood Tribute slots.
