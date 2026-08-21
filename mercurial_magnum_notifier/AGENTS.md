# Repository Guidelines

## Project Overview

`mercurial_magnum_notifier` is a Deadlock Panorama HUD override for three item-state indicators beside the gun ammo count:

- Mercurial Magnum proc state and ammo glow
- Split Shot's five-second active window
- Blood Tribute's manual toggle state

Edit source under this directory only. Treat `../mercurial_magnum_notifier_compiled/`, `../pak99_dir/`, `../pak99_dir.vpk`, and dated `.7z` files as generated output.

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

`panorama/scripts/mercurial_magnum_notifier.js` is a strict IIFE with one cached `state` object. Through `$.Schedule`, `update()` uses a 0.5-second discovery cadence until a tracked item is owned, then switches to 0.05-second state polling. It caches valid panel references, bounds item rescans to 0.5 seconds, and writes visual state only on transitions or panel replacement.

Detection contracts:

- Mercurial Magnum observes `upgrade_ethereal_bullets`, cooldown text/radial state, ammo, and the stock `reloading` class.
- Split Shot observes `upgrade_split_shot`, arms while ready, activates on ready-to-cooldown, and expires after five seconds.
- Blood Tribute caches the inspected `#abilitiesContainer` slots `#abilityButton0` through `#abilityButton3` and each slot's `.ability_name` label. Every 0.5 seconds it identifies the observed `BLOOD TRIBUTE` label text, while the hot loop reads only the matched slot's `toggled_on` class.
- All three indicators are independent. When effects overlap, activation order controls the stack: the first activated indicator stays leftmost and the newest stays nearest to ammo, with uniform 20px spacing.

The packaging flow is:

```text
mercurial_magnum_notifier/
  -> guarded temporary Closure ADVANCED source
  -> mercurial_magnum_notifier_compiled/
  -> pak99_dir/
  -> pak99_dir.vpk
  -> mercurial_magnum_notifier_MM_dd.7z
```

The root build wrapper validates readable source, minifies staged Panorama JavaScript with Closure ADVANCED, compiles the temporary source, excludes build-only validator output, packs the VPK, and writes the archive to the configured Deadlock addons directory. It does not install the loose `pak99_dir.vpk` as the active mod.

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

# Validate, compile, stage, pack, and archive
powershell -ExecutionPolicy Bypass -File build_standalone_paks.ps1 `
  -Variant mercurial_magnum_notifier

# Preserve pak99_dir/ and pak99_dir.vpk for inspection or manual deployment
powershell -ExecutionPolicy Bypass -File build_standalone_paks.ps1 `
  -Variant mercurial_magnum_notifier -KeepStaging
```

There is no module-local package manifest, install command, linter, development server, or coverage command.

## Code Conventions & Common Patterns

- JavaScript uses two-space indentation, a strict IIFE, `UPPER_SNAKE_CASE` constants, camelCase functions, and one singleton `state` object.
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
- `../build_standalone_paks.ps1` — authoritative production wrapper; validates source, runs Closure ADVANCED on a guarded temporary copy, compiles, excludes build-only scripts, and packages `-Variant mercurial_magnum_notifier` as `pak99_dir.vpk`.

## Runtime/Tooling Preferences

- Target: Deadlock's Source 2 Panorama runtime on Windows.
- Validation: Node using built-in `assert`, `fs`, `path`, and `vm`; no npm dependencies or package manager.
- Build: Windows PowerShell, `../sr2compiler/New folder.exe`, repository-local `vpkeditcli.exe`, and 7-Zip.
- Default addons path: `G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons`; override with `-AddonsPath` when needed.
- Source extensions compile as `.css -> .vcss_c`, `.xml -> .vxml_c`, `.js -> .vjs_c`, and `.vtex -> .vtex_c`.
- The compiler may be stopped after expected outputs appear and may exit nonzero afterward; the wrapper treats complete expected output as success.
- Pak slot `pak99` may conflict with another mod using the same slot. Do not assume simultaneous compatibility.

## Testing & QA

`scripts/validate-notifier.js` combines:

- static PNG, `.vtex`, XML, and CSS assertions;
- a deterministic `MockPanel` tree and mocked Panorama scheduler;
- Magnum proc/reload/reset regressions;
- Split Shot activation, expiry, and overlap regressions;
- Blood Tribute toggle, removal, four-slot movement, and stacking regressions;
- production-runtime assertions that reject diagnostic logging;

For source changes, run the validator first. For deployable JS/XML/CSS/image changes, also run the root build wrapper and inspect the packed VPK for required compiled assets and forbidden raw `.js`, `.css`, `.xml`, `.png`, or `.vtex` files. The wrapper checks expected compiled outputs but does not validate the final member set.

The VM harness does not prove the live Panorama hierarchy, actual timer cadence, texture appearance, or in-game positioning. After replacing the active VPK, start or restart Deadlock and perform an in-game smoke test covering ownership discovery, each activation/deactivation path, all three simultaneous indicators, ammo stability, and all four Blood Tribute slots.
