# HP Colors Rewrite

## Goal

Rebuild HP Colors behind small, independently verifiable seams. Milestone 1 proved that each v1 healthbar can be discovered and observed inside its unit-status overlay context. Milestone 2 proves the stock ESC entry and editor lifecycle before settings state is introduced.

The layout overrides are based on current stock files in `SteamDatabase/GameTracking-Deadlock/game/citadel/pak01_dir/panorama/layout`. The rewrite changes them only by adding its script/style includes and owned panels.

## Features that the rewrite must preserve

### Enemy healthbars

- Enable or disable enemy coloring.
- Show or visually hide the bar without breaking width updates.
- Fixed and gradient low/mid/high colors.
- Configurable low/high thresholds.
- Optional team color at high HP.
- Optional building and boss exclusion.
- Bar position and width controls.
- Healing, damage-delta, bullet-shield, and ult-icon colors.
- Neutral units must never enter the enemy-coloring path.

### Ally healthbars

- Optional ally coloring.
- Low/mid/high, healing, damage-delta, and bullet-shield colors.
- Optional ally low-HP pulse with threshold, speed, intensity, and color.

### HP readout

- Show or hide the HP number.
- Current/max HP, percentage, and current-only formats.
- Size and position controls.
- Bar-derived or custom low/mid/high text colors.
- Show or hide health pips.
- Optional precise-pip calculation and its convar-copy instructions.
- Show or hide enemy levels and preserve level-tier styling.

### Low-HP pulse and kill marker

- Enemy pulse threshold, speed, intensity, fixed/gradient color, bar hiding, and pulsing HP number.
- Configurable kill-marker threshold, width, and color.
- Pulse remains CSS-driven rather than JavaScript frame animation.

### Anita UI and presets

- Settings categories, conditional rows, tooltips, color picker, position picker, page reset, reset-all, import, and donation link.
- Baked and user presets, rename/delete/reorder, individual copy, bundle copy, and import.
- Hero scopes: off, all, and selected heroes.
- Automatic hero detection, manual override, global fallback, and match/lobby reset behavior.
- Per-setting signature-tier conditions for four ability slots.
- Version-99 compact storage, existing aliases, legacy import aliases, preset token formats, and bridge message compatibility.

## Milestone 1: healthbar observation

Implemented source files:

- `panorama/layout/unit_status_overlay.xml` preserves the stock v1 healthbar layout and loads the probe.
- `panorama/scripts/healthbar_probe.js` discovers and observes the v1 healthbar inside its overlay context.

### Data path

Each probe reads its local healthbar panels directly. It writes one transition-only line when the displayed pip text or calculated fill percentage changes:

`[HP Colors Rewrite] data id=... generation=N pip="..." fill=N parent=N width_percent=N`

Each probe owns its local data. Replacement panels increment the local generation and reset the data signature.

### Verified in-game

The 2026-08-11 Deadlock session produced 16 probe-ready lines and 21 direct data lines. All parsed widths had positive parents and percentages from 0–100; no probe exceptions were present.

## Milestone 2: ESC editor lifecycle

Implemented source files:

- `panorama/layout/hud_escape_menu.xml` preserves the stock ESC layout and adds the explicit `HP COLORS` row plus editor panels.
- `panorama/scripts/hp_colors_menu.js` owns open, close, category/tab navigation, and hold-to-peek.
- `panorama/styles/hp_colors_menu.css` owns the Ritual Stripe presentation.

The current editor intentionally renders no setting controls. It must first prove entry visibility, navigation, Peek behavior, stock ESC restoration, and real healthbar visibility in Deadlock.

### In-game smoke test

1. Run `powershell -ExecutionPolicy Bypass -File build_hp_colors_rewrite.ps1`.
2. Restart Deadlock with `-dev -tools`.
3. Open ESC and confirm the accented `HP COLORS` row is obvious and sits before the smaller Settings section.
4. Open the editor and exercise every category and contextual tab.
5. Hold Peek; require the editor to disappear, gameplay input to remain blocked, and real v1 healthbars to remain visible.
6. Release Peek; require the editor to return.
7. Require Done and the first Escape to return to the stock ESC menu.
8. Exit and require menu-ready/open/close logs with no rewrite exceptions.

## Not implemented yet

Coloring, sizing, settings state, persistence, presets, classification, and healthbar rendering remain unimplemented until the Milestone 2 editor smoke passes.
