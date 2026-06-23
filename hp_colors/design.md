# HP Colors Design

This document captures the intended UX, visual language, runtime presentation, and safe-change rules for `hp_colors/`.

## Product intent

HP Colors is a Deadlock Panorama mod for readable health-state decisions during play. The settings UI lets players tune enemy, ally, pulse, HP-number, level-number, and kill-marker behavior, then export or import restart-safe preset codes/VPK workflows.

The design goal is not decoration. It is fast scanning:

- Health state must read before exact numbers.
- Controls must be grouped by gameplay task, not implementation detail.
- Runtime overlays must not block input or add visible layout churn.
- Visual accents are scarce: green means active/configurable, amber means external/support/preset action, red means danger/destructive/kill threshold.

## Source map

| File | Design responsibility |
|---|---|
| `panorama/layout/base_hud.xml` | Loads Anita UI styles/scripts and creates `AnitaUI_Anchor` above the HUD. |
| `panorama/layout/unit_status_overlay.xml` | Defines the healthbar, counter, level, and kill-zone marker panels used by runtime styling. |
| `panorama/layout/hud_escape_menu.xml` | Stock escape menu context; currently not the visual owner for HP Colors settings. |
| `panorama/styles/anita_ui.css` | Full Anita settings window styling: navigation, settings controls, preset builder, color picker, import popup, donation CTA. |
| `panorama/styles/unit_status.css` | In-world healthbar, HP counter, level tier, pulse, and kill-marker styling. |
| `panorama/scripts/anita_ui_core.js` | Defines the HP Colors settings schema, registers the mod, builds the settings UI, category tree, controls, preset builder, import/color popups, donation CTA, reset/copy flows, persistence, and bootstrap/preset publishing. |
| `panorama/scripts/healthbar_logic.js` | Applies settings to runtime panels with cached refs, skip-write caches, adaptive loops, and bootstrap replay. |
| `scripts/validate-schema.js` | Audits schema/default/alias/UI drift and must be updated when design markers intentionally change. |

## Visual language

### Palette

Use the existing dark, low-noise shell with a single primary accent.

| Role | Color / treatment | Use |
|---|---|---|
| Window base | `#111315`, radial dark green-black gradient | Main Anita window. |
| Primary accent | `#66cc99` | Active category, selected controls, headings, focus borders. |
| Body text | `#e5ebeb`, `#f0f2f2` | Labels and high-priority copy. |
| Muted text | `#7d8688`, `#97a0a2`, `#667072` | Hints, descriptions, secondary state. |
| Amber accent | `#f0d38a`, `#ffd978`, amber borders | Donation/support and preset workflow affordances only. |
| Danger | `#d85a5a`, `#ff8a8a`, `#FF2222` | Close/delete/kill marker/low-health danger. |

Avoid neon glows and large saturated surfaces. Existing glow is allowed only where it communicates focus or health urgency; new UI controls should prefer 1px borders, brightness shifts, and small transform feedback.

### Typography

Panorama font availability is constrained, so keep the current sans stack and communicate hierarchy through size, weight, and letter spacing.

- Main module title: uppercase, 20px, bold, 1.5px tracking.
- Category labels: uppercase, 18-20px, bold, 1px tracking.
- Setting labels: 15px, medium, 0.5px tracking.
- Button labels: uppercase, 9-13px, bold/black.
- Runtime HP number: very large, bold, white/wash-colored, hard shadow for readability.

No emoji. Use Panorama image assets, simple text labels, or small panels.

### Shape and spacing

- Window radius: 8px.
- Control radius: 3-5px.
- Popup radius: 8-12px depending on surface size.
- Structural dividers: 1px low-opacity borders.
- Rows breathe vertically; do not pack setting rows tighter than the current 14px rhythm unless a panel height constraint forces it.
- Prefer `flow-children` layouts over absolute positioning. Use `ignore-parent-flow` only for true overlays/popups/markers.

## Settings window anatomy

`AnitaRenderer.renderModSettings()` builds this structure:

1. `ModContainer`
2. `ModHeaderRow`
   - `SectionHeader`
   - HP Colors-only `AnitaDonateBtn`
3. `SectionHeaderLine`
4. Optional `ModDescription`
5. Optional `AnitaPresetNotice`
6. `AnitaSettingsShell`
   - Left `AnitaTreePanel`
   - Right `AnitaDetailPanel`

### Header and donation CTA

The donation button is a compact secondary CTA in the header row, not an overlay.

Rules:

- Keep it above the divider line by leaving it inside `ModHeaderRow`.
- Do not restore `ignore-parent-flow` on `.AnitaDonateBtn`.
- Keep amber styling subdued: border and brightness, not heavy glow.
- Icon source is the logical asset path: `s2r://materials/particle/ui/ui_icon_soul.vtex`.
- Label remains short: `Donate`.

Current specs:

- Button: `118px x 28px`, 4px radius, right-aligned, vertical-center.
- Icon: `16px x 16px`, washed amber, `background-texture-size: 18px 18px`.
- Hover: darker amber-tinted fill, amber border, slight brightness increase, soul wiggle.

### Left navigation

The left tree is a task index:

- Main categories are wide, uppercase blocks.
- Active main category uses solid `#66cc99` with dark text.
- Active subcategory uses a left green rail and slightly brighter text.
- Counts sit on the right and show visible settings per subcategory.
- Presets are visually separated with top border spacing and green label emphasis.

Keep category names aligned with `anita_ui_core.js` `HPSettingsContract.SETTINGS`:

- `GENERAL|Core Behavior`
- `HEALTH BARS|Enemy Colors`
- `VISUAL EFFECTS|Low HP Pulse`
- `HEALTH BARS|Number Overlay`
- `HEALTH BARS|Ally Colors`
- `VISUAL EFFECTS|Kill Marker`
- Preset Builder category injected by the Anita UI core for HP Colors.

### Detail panel

The right panel always shows:

- Uppercase page title.
- Header actions `PAGE` and `ALL` for HP Colors reset behavior.
- A small hint line.
- Scrollable settings list or preset builder content.

`PAGE` resets only visible settings for the active page. `ALL` resets HP settings while preserving saved presets.

### Setting controls

Use existing control types from `AnitaComponents`:

- `toggle`: checkbox + row hit area.
- `slider`: horizontal slider with value readout.
- `cycler`: segmented control for discrete modes.
- `stepper`: plus/minus numeric entry.
- `positionpicker`: X/Y slider group.
- `colorpicker`: preview swatch + popup palette.
- `button`: action row.

Conditional rows use `visibleWhen` from schema and are refreshed by dependency indexes in `AnitaRenderer.ensureConfigIndexes()`.

Do not add controls outside the schema for persisted settings. If a visible setting is persisted, update schema/defaults/aliases together.

## Preset builder design

The preset builder is a compact workflow surface, not a generic card grid.

Primary regions:

- Intro block with `Preset VPK workflow` kicker.
- Title row: hero-detection mode, `OPEN`, `COPY ALL`, `IMPORT`.
- Meta row: list title, selected-preset status, fallback URL.
- Save-current row with preset name input.
- Preset rows with hero scope, priority, copy, rename, and delete affordances.

Rules:

- Keep rows shallow and scan-friendly.
- Use amber for hero override/manual state.
- Use green for valid preset actions and selected rows.
- Use red only for destructive delete affordances.
- Hero picker menus must render through popup host, not clipped inside the settings panel.

- Hero-scope policy lives in `HPPresetHeroSelection`; Panorama row rendering
  remains the adapter that calls it. Keep preset selection, priority, and
  selected/off/all semantics behind that seam instead of re-spreading them
  through row rendering code.
## Popups

### Color picker

The color picker is a separate popup hosted by `AnitaUI_PopupHost` when available.

Design rules:

- Never parent the popup directly to `AnitaWindow`; clipping and offset bugs return.
- Position from the preview anchor before making it interactive.
- Keep cursor truth in logical color-box coordinates.
- Hue/saturation/value controls must remain readable at `300px` popup width.

### Import popup

The import popup is centered, dark, and utilitarian:

- Title: `Import Code`.
- Hint explains accepted input.
- Text entry uses the same dark field language as settings inputs.
- Apply button is green-tinted and compact.
- Close action is small and red only on hover.

## Runtime healthbar design

Runtime visuals live in `unit_status_overlay.xml`, `unit_status.css`, and `healthbar_logic.js`.

### Color semantics

Defaults:

- Low enemy HP: `#E16161`.
- Mid enemy HP: `#FF7B00`.
- High enemy HP: `#00FF00` unless team-color high HP is enabled.
- Team high colors: `#FFC961` for team 1, `#6485FC` for team 2.
- Neutral units: `#5BEFB5`.
- Friend base color in CSS: `#FFEFD7`.

Modes:

- Fixed mode steps from low to mid to high colors.
- Gradient mode interpolates low-to-mid-to-high using clamped thresholds.
- Text color can mirror bar color or use custom low/mid/high text colors.
- Ult icon color follows bar color unless custom ult color mode is selected.

### HP number

The HP counter is a large, high-contrast overlay on `hp_counter_anchor`.

Rules:

- Keep `white-space: nowrap` and `overflow: noclip` for large numbers.
- Position through transform on the anchor; do not layout-shift the healthbar.
- Pulse text uses separate size/position settings only when low-HP pulse text is active.
- Hidden counter must use `visibility: collapse` on the label, not panel deletion.

Formats:

- `HP`
- `%`
- `Current HP`

### Level number

Enemy level display uses `level_number_visible` on the enemy wrapper and tier classes:

- Tier 2: level >= 11, yellow border.
- Tier 3: level >= 19, orange border.
- Tier 4: level >= 27, red border.
- Tier 5: level >= 35, dark red border.

The level loop backs off when unchanged. Keep level detection text-only and avoid expensive tree scans in hot paths.

### Low-HP pulse

Pulse is CSS-driven through `.low_hp_pulsing` and intensity classes:

- `pulse_subtle`
- default medium
- `pulse_intense`

Runtime only updates animation duration and class membership. Do not add JavaScript frame animation for bar pulse. Pulse text brightness is the exception because the counter is a separate label and only runs when `hp_pulse_text_enabled` is true.

### Kill marker

`#hp_kill_zone_marker` is a thin absolute marker over the healthbar.

Rules:

- Hidden by default.
- Only visible when enabled, bar background is visible, and parent width is known.
- Position clamps inside the bar width.
- Width and color come from `hp_kill_zone_width` and `hp_kill_zone_color`.

## Runtime performance rules

This module is loaded into many unit-status contexts. Design changes must preserve these runtime invariants:

- Do not call `FindChildTraverse` inside steady hot paths unless protected by cache/TTL behavior.
- Cache panel refs with `tryCache()` and invalidate when panels become invalid or are replaced.
- Skip redundant style writes with last-value caches (`lCol`, `lUlt`, `lTxt`, `lBgVis`, `lBgOp`, etc.).
- Keep hidden healthbar backgrounds `visibility: visible` with opacity `0.01`; collapsing the background can stall width updates.
- Animate only `brightness`, `opacity`, `wash-color`, and transforms unless there is no alternative.
- Use adaptive polling/backoff for stable bars, neutral/non-enemy exits, missing parent widths, and unchanged ally bars.
- Treat bootstrap/replay as first-paint-critical. Do not show default green high-HP enemy bars before stored settings have had a chance to apply.

## Persistence and schema design

Persistence uses compact non-default payloads:

- Namespace: `hp_colors`.
- Key: `anita_v1_hp_colors`.
- Stored shape: `{ v, c: 1, values: { alias: value } }`.
- Encoded with URL-safe base64.
- Mirrored to root/Hud attributes and `GameUI.CustomUIConfig()` shared snapshot paths.

When adding, removing, or renaming a persisted setting, update all of these
contract adapters together:

- `anita_ui_core.js` `HPSettingsContract.SETTINGS`, `HPSettingsContract.ALIASES`, defaults, and preset support.
- `healthbar_logic.js` `DEFAULTS` and runtime handling.
- `scripts/validate-schema.js` audit expectations.

Then run:

```powershell
powershell -ExecutionPolicy Bypass -File build_hp_colors.ps1
```

## UI change checklist

Before shipping a visual change:

1. Confirm the element belongs in normal flow or is a true overlay.
2. Keep accents semantically consistent: green active, amber support/preset/external, red destructive/danger.
3. Check scroll/clipping: popups need popup host; healthbar glow/marker needs `overflow: noclip`.
4. Avoid new broad shadows or glows in the settings UI.
5. Prefer compact labels and existing control classes.
6. Update schema audit markers if a marker-protected design intentionally changes.
7. Build with `build_hp_colors.ps1` and verify audits pass.
8. In Deadlock tools mode, check: window open/close, category switching, color picker position, preset builder row actions, donation button icon, and one runtime healthbar scenario.

## Current design decision log

- Donation CTA sits in `ModHeaderRow`, above `SectionHeaderLine`, because absolute overlay positioning caused visual overlap.
- Soul icon uses `s2r://materials/particle/ui/ui_icon_soul.vtex`; CSS should not reference the compiled `_c` suffix.
- Donation hover uses subdued amber border/brightness rather than a heavy glow to fit the minimalist dark-control language.
- Healthbar background hiding uses opacity, not collapsed visibility, to preserve runtime width updates.
- Pulse remains CSS keyframe-driven for GPU-friendly animation.
