# Next AI Prompt - hp_colors Color Picker (Deadlock / Panorama)

## What you are working on

`hp_colors` is a Deadlock game mod that colors enemy healthbars. It has an in-game settings UI (Anita-UI) with a color picker popup for each color setting. The popup has:

- A **240x240 2D color box** (rainbow hue across X, white-to-transparent saturation fade across Y) with a draggable circular cursor node
- A **Hue slider** (Panorama `Slider`, 0-359 deg)
- A **Saturation slider** (Panorama `Slider`, 0-100%)

**The sliders work correctly.** Moving them updates the selected color and repositions the cursor node on the 2D box. This is the current fallback interaction model.

**The 2D box does not work** - clicking or dragging inside it does nothing. Read below for why.

---

## The hard constraint

`GameUI` is **completely undefined** in the `base_hud.xml` Panorama context where this UI runs. This means:

- `GameUI.SetMouseCallback` - unavailable
- `GameUI.GetCursorPosition` / `GameUI.IsMouseDown` - unavailable
- `Panel.GetCursorPosition()` - returns `null` or does not exist (confirmed via in-game diagnostic log)

Every code path that touches `GameUI` or `GetCursorPosition` is dead in this context. Do not attempt to fix by adding more `GameUI` calls.

---

## Current state of the box (what the code actually does)

The `onmouseactivate` handler on `colorBoxPanel` (the invisible hit-test layer over the box) has an **early return** in the no-GameUI branch. It only logs a diagnostic line and exits - it never starts a drag or reads position. This is intentional: all previous attempts to read cursor position in this event failed.

```js
colorBoxPanel.SetPanelEvent("onmouseactivate", function () {
  if (!hasGameUI) {
    // diagnostic log only - no color change
    $.Msg("[Anita-UI][PickerDiag] box click gcp=... piw=... w=... h=...");
    return;
  }
  beginColorDrag("box", true);
});
```

The cursor node (`colorBoxCursor`, a `Button` inside `colorBoxFrame`) has `SetDraggable(true)` called and `DragStart` / `DragEnd` event handlers registered. In `DragEnd`, `syncFromCursorPanelPosition` reads the cursor node's **actual pixel position** within `colorBoxFrame` after Panorama drops it, then converts that position to hue/saturation. This path does not need any cursor API - it just reads `panel.actuallayoutx` / `actuallayouty` after drop.

The problem: **it is unknown whether Panorama native drag actually moves the cursor node** in this game context. The `DragStart`/`DragEnd` path has been wired but never confirmed working because the box click itself is blocked.

---

## The task

Make the 2D color box interactive. The desired behavior:

1. **Click anywhere in the box** -> cursor node moves to that point, color updates live
2. **Drag inside the box** -> cursor node follows the pointer, color updates live
3. **Cursor node stays within the 240x240 frame** at all times

### What to try first - native Panorama drag

The cursor node already has `SetDraggable(true)` and `DragStart`/`DragEnd` handlers. If Panorama native drag moves the node:

- `DragEnd` reads `droppedPanel.actuallayoutx` / `actuallayouty` (relative to `colorBoxFrame`) and calls `syncFromCursorPanelPosition(true)` - this already works if the layout values are correct after drop
- The key question: does `actuallayoutx` / `actuallayouty` on `droppedPanel` reflect the drop position, or does it reflect the panel's original position?

Check `syncFromCursorPanelPosition` (around line 1326) and `getPanelBounds` - note that `getPanelBounds` uses `panel.actuallayoutwidth` for size. If `colorBoxPanel.actuallayoutwidth` is 0 (it has inline `width: "100%"`), the relative position calculation will divide by wrong numbers. Use `colorBoxFrame.actuallayoutwidth` (which has explicit `240px` CSS) for the box dimensions - this fix was already applied in `updateBoxCursorVisual` and should be applied to `syncFromCursorPanelPosition` as well.

### Alternative - synthesize position from mouse events without cursor API

Panorama fires `onmousemove` on panels when the pointer is over them. Even without `GetCursorPosition()`, you may be able to accumulate relative movement from repeated `onmousemove` events:

- On mouse-down (`onmouseactivate`), record "drag started at unknown absolute position"
- On each `onmousemove`, increment a delta counter and update cursor position relatively
- This is imprecise but may be better than nothing

### Alternative - use two 1D sliders only, remove the 2D box

If the box cannot be made interactive, the fallback is to hide the 2D box entirely and rely on the two sliders. The cursor node visual is already correctly updated by the sliders (fixed in the previous session). Remove the box or mark it clearly as decorative.

---

## Key files

| File | What to read |
|---|---|
| `hp_colors/panorama/scripts/anita_ui_core.js` | Entire `createColorPicker` closure (~line 970-1860). Key functions: `updateBoxCursorVisual` (1304), `syncFromCursorPanelPosition` (1326), `getPanelBounds` (1180), `beginColorDrag` / `endColorDrag`, `openPalette` (1570) |
| `hp_colors/panorama/styles/anita_ui.css` | `.AnitaColorBoxFrame` (240x240px), `.AnitaColorBoxCursor` (18x18px), `.AnitaColorBox`, `.AnitaHueSliderContainer`, `.AnitaSatSliderContainer` |
| `hp_colors/CLAUDE.md` | Full architecture, persistence model, known limitations, fixed bugs table |

---

## Build and deploy

```powershell
powershell -ExecutionPolicy Bypass -File build_hp_colors.ps1
```

Compiles, packs VPK, deploys to `G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak96_dir.vpk`. Then launch Deadlock and test in-game. Log file: `G:\SteamLibrary\steamapps\common\Deadlock\game\bin\win64\W.log`.

---

## Diagnostic log line to watch for

When the user clicks the 2D box, this line appears in `W.log`:

```
[Anita-UI][PickerDiag] box click gcp=<type> val=<value> piw=<type> val=<value> w=<width> h=<height>
```

- `gcp` = result of `typeof colorBoxPanel.GetCursorPosition` and its return value
- `piw` = result of `typeof colorBoxPanel.GetPositionWithinWindow` and its return value
- `w` / `h` = `colorBoxPanel.actuallayoutwidth` / `actuallayoutheight`

If `w` and `h` are non-zero in this log line, position detection may be possible. If `piw` returns a non-null value, `GetPositionWithinWindow()` may give the panel's top-left corner in window space, which combined with an `onmousemove` delta could synthesize a click position.

---

## What has already been tried and failed

| Attempt | What was tried | Why it failed |
|---|---|---|
| 1 | `GetCursorPosition()` in event handlers | Returns null / method doesn't exist in this context |
| 2 | `GameUI.SetMouseCallback` | `GameUI` is undefined |
| 3 | Idle-tick polling to detect drag stop | Killed drag after ~160ms before any movement registered |
| 4 | `Panel.GetCursorPosition()` in `onmousemove` | Same as attempt 1 - null |

Do not retry any of the above.

---

## Variables already declared in scope (do not re-declare)

Inside `createColorPicker`: `colorBoxFrame`, `colorBoxPanel`, `colorBoxCursor`, `colorPickerSyncing`, `colorDragging`, `hasGameUI`, `pickerHueSlider`, `pickerSatSlider`, `pickerSatTrack`, `pickerHueValue`, `pickerSatValue`.

`colorPickerSyncing` is used as a re-entrancy guard during programmatic slider value updates in `syncColorVisuals`. Do not repurpose it for drag state.
