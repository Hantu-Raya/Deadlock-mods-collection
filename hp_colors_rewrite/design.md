# HP Colors Rewrite — ESC Editor Design

## Purpose

Add an obvious, Deadlock-native ESC-menu entry for configuring the v1 healthbar. The editor changes visible healthbars live, persists only real setting changes, and performs no continuous synchronization.

This design covers the v1 editor only. It excludes presets, import/export, Anita UI compatibility, and v2 healthbars.

## Entry point

Add `HP COLORS` as the final large primary row immediately before the smaller stock Settings section.

- Preserve the stock ESC row geometry, skew, speckle, spacing, and hover behavior.
- Use an explicit uppercase label rather than an icon-only affordance.
- Add a restrained brand-green edge and wash plus a small enemy/soul color swatch.
- Show a shortcut hint only when the runtime resolves a real binding. Never hardcode a key.
- Do not add a badge, attention pulse, or second entry point.

## Visual direction: Ritual Stripe

The editor extends the stock ESC menu’s dark paper-and-metal language.

- Responsive centered shell, designed around `1120 × 760`.
- Approximately 230px left category rail.
- Header with `HP COLORS`, the current category, live-save status, Undo, Peek, and Done.
- Contextual subcategory tabs above one scrollable settings surface.
- No embedded or simulated healthbar preview.
- Restrained transform/opacity transitions only; no frame-driven animation.

### Typography

- `VALVEPulp`: title and major headings.
- `VALVEOracle`: navigation, values, status, and utility text.
- Retail Demo/Noto Sans: setting names and helper text.
- `Reaver`: optional single decorative accent, never body copy.

### Palette

- Off-black: `#10130D`
- Off-white: `#FFEFD7`
- Active green: `#5FE69E`
- Enemy: `#FF410D`
- Threshold gold: `#FFED79`
- Ally/healing soul: `#70F8C1`

Color must never be the only state indicator.

## Information architecture

### Overview

#### Status

- Master customization switch.
- The switch bypasses custom rendering without deleting configured values.
- Enemy, ally, readout, and effects summaries link to their owning categories.
- A quiet `No visible healthbars` status appears when no applicable v1 bars exist; controls remain editable.

#### Layout

- Bar width.
- Bar height.
- Bar position.
- Sliders include bounded numeric fields.

### Enemy

#### Bar

- Enable coloring.
- Show or hide the bar without stopping width updates.
- Fixed or gradient mode.
- Low, mid, and high colors.
- Low and high thresholds.
- Optional high-HP team color.
- Building and boss exclusions.

#### Feedback

- Healing color.
- Damage-delta color.

#### Shields & Icons

- Bullet-shield color.
- Ultimate-icon behavior and color.

### Ally

#### Bar

- Enable ally customization.
- Low, mid, and high colors.

#### Feedback

- Healing color.
- Damage-delta color.

#### Shields

- Bullet-shield color.

### Readout

#### HP Number

- Visibility.
- Current/max, percentage, and current-only formats.
- Size.
- Bar-derived or custom colors.

#### Level & Pips

- Level visibility.
- Pip visibility.
- Precise-pip behavior.

#### Placement

- Number position and offsets.

### Effects

#### Enemy Pulse

- Threshold, speed, intensity, and color mode.
- Optional bar hiding.
- Optional HP-number pulse.

#### Ally Pulse

- Threshold, speed, intensity, and color.

#### Kill Marker

- Enable, threshold, width, and color.

## Control behavior

- Put essential controls first.
- Put nonessential controls in one expandable `Advanced` section per tab.
- Keep disabled essential controls visible but dimmed.
- Collapse disabled advanced dependencies.
- Pair sliders with bounded numeric fields.
- Open color swatches into a hue/value popover with hex input, Deadlock semantic swatches, and recent colors.
- Keep opacity separate and expose it only where the runtime supports it.
- Show short helper text inline; reserve tooltips for detailed caveats.

## Saving and recovery

Changes autosave. `DONE` and Escape close the editor and return to the stock ESC menu.

- Toggles and discrete selections commit immediately when their value changes.
- Slider and color drags update live but create one persistence and undo operation per completed gesture.
- Undo keeps a bounded in-memory history for the current editor session and clears on close.
- Reset Section restores shipped defaults after confirmation; the reset itself can be undone.
- Closing never rolls settings back.

## Live inspection

Real in-game healthbars are the only preview authority.

### Hold-to-Peek

- A visible press-and-hold `PEEK` control fades or collapses the editor shell.
- A keyboard hint and binding work only when a real binding is resolved.
- A capture surface preserves release detection while the shell is hidden.
- Gameplay input remains blocked during Peek.
- Releasing Peek restores the editor.

`Test Pulse` temporarily triggers the chosen pulse on currently visible applicable bars, restores normal threshold behavior afterward, and never persists test state.

Runtime verification must prove that v1 bars remain visible while the custom editor owns the ESC surface. If they do not, fix the editor’s visibility ownership; do not add a simulated preview fallback.

## Runtime state flow

Use one authoritative current settings snapshot.

1. A healthbar applies the current snapshot once when discovered or replaced.
2. Opening the editor reads the snapshot once and renders its controls.
3. A changed control updates the authoritative snapshot and only the affected healthbar property.
4. Existing bars receive only the changed setting.
5. Slider and color interactions coalesce persistence at gesture completion.
6. Closing the editor stops all editor work while applied bars retain their appearance.

Do not add polling, heartbeats, mouseover resynchronization, bulk refreshes, duplicate stores, or fallback transports.

## First implementation slice

The first slice proves the editor seam without implementing healthbar coloring:

1. Add the stock-derived `hud_escape_menu.xml` override.
2. Add the visible `HP COLORS` entry.
3. Add the Ritual Stripe shell, category rail, tabs, Peek, and Done controls.
4. Open and close the shell through one guarded local runtime path.
5. Do not render setting or Undo controls until they have real state transitions to own.

Only after that smoke should settings state and v1 healthbar rendering be added incrementally.