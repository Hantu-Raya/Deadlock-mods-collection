# 40: Separate shield bar on a QOLLOCK HUD

**Report** (GameBanana, draIsoM, 2026-10-22): "the separate shield bar doesn't work with the qol version of the mod."

**Status:** plan only. An implementation of the plan below was made on 2026-10-22, then reverted at the user's request, so the source stays at 3.3.0. Nothing is implemented.

## Why it does not work
`syncLegacy` in `hp_colors_v3_menu.js` gives up for good on any health container that has `#currentHealthOverHearts` ([ticket 38](38-old-shield-bar.md), "On a QOLLOCK HUD the feature does nothing"). QOLLOCK's pak03 `hud_health_container.xml` always contains that label: it belongs to the Minecraft hearts panel, which ships with every QOLLOCK healthbar type. So on the QOLLOCK build, *Your shield bar: Separate (old)* never attaches.

That guard assumed QOLLOCK draws its own health HUD. The pinned pak03 (QOLLOCK 4.0.5, 13 Oct; decompiled with Source2Viewer 19.2 into `.scratch/qolshield/`) says otherwise:
- `hud_health.xml` keeps every bar the lane reads: `#health_bar`, both pending bars, `#shield_bar_2`, `#ratking_armor_bar`, `#healthLines` and `#shield_bar` with its native parts.
- `hud_health_container.xml` keeps `#HealthRegenAndTotal`, `.shieldNumbersContainer`, `#BulletShieldNumbers`, `#TechShieldNumbers`, `.healthContainer` and its `currentHealthLabel`/`totalHealthLabel`.
- `styles/hud_health.css` and `hud_health_container.css` import the stock base sheets. QOLLOCK's healthbar type 0 (the default) adds no theme class (`core/ql_hud.js` 1043-1047, 1199-1207), so it is the stock 6805 HUD that the lane already handles.
- Types 1-5 add one root class each: `minimalist_healthbar_active`, `fg_healthbar_active`, `klutz_healthbar_active`, `budhud_healthbar_active` and `minecraft_healthbar_active`. Those themes move `#HealthRegenAndTotal`, `.healthContainer` and `.shieldNumbersContainer`, and restyle `#shield_bar`. Writing the pre-6711 positions inline over them would break the theme.
- No QOLLOCK script writes the bar `max` or `lowervalue`. `ql_color_warnings` and the Minecraft variant read the first `currentHealthLabel` under `#HealthRegenAndTotal`. That is still the game's label, because the owned label is inserted after it.

## Plan A: script-only (recommended)
1. Drop the QOLLOCK bail. Look up `#currentHealthOverHearts` once per container.
2. On a QOLLOCK HUD with one of the five theme classes, skip the pre-6711 layout writes (`LEGACY_LAYOUT`: positions, the shield-number visibility and the green). The theme keeps its own layout and look. The fill correction, owned HP number, ticks, shield-bar visibility, hidden cyan and barrier all still run.
3. Run the theme check on the existing 1 s HUD watch, which costs five class reads a second on QOLLOCK only. If the theme changes, release and re-attach.
4. A themed attach marks the container `hpc3_legacy_shield = "2"`. Release then skips the layout entries, so it never writes the stock `horizontalAlign: center` over a theme.

## Limits
- Switching from type 0 to a theme while Separate is on leaves `#HealthRegenAndTotal` at `horizontalAlign: center` until the HUD is rebuilt. This alias cannot be cleared on its own (live 6779/6782, ticket 38). Minimalist, FG and Budhud use center anyway. Klutz collapses the panel. Minecraft (left) shows its heal and damage counters shifted until the next map load.
- Under a theme, the owned Rat King barrier bar keeps the pre-6711 inline position, and the theme's own shield-bar colour stays (for example cyan in Minimalist and Klutz).
- Under Minecraft the bars are drawn at opacity 0.0001. The lane still runs, but you cannot see it.

## Plan B: override QOLLOCK's health layout from pak02 (considered)
Lower-numbered paks win, and the QOLLOCK build already ships pak02 copies of QOLLOCK's `hud_escape_menu.xml` and `citadel_hud_top_bar.xml` (vendored, pinned and composed by `tools/qollock.js`). A third override, `hud_health_container.xml` without the hearts marker or the Minecraft panel, would also make the guard pass. It is not recommended:
- **It does not remove the conflict.** The marker is only what our check looks for. The real clash is QOLLOCK's five healthbar themes restyling the same panels through `hud_health.css` and `hud_health_container.css`. To make our old layout win, pak02 would also have to replace those two sheets, which deletes QOLLOCK's healthbar themes. That is why ticket 38 chose inline styles.
- **It breaks QOLLOCK features.** The Minecraft healthbar (type 5) uses `#currentHealthOverHearts` for its HP numbers (`variants/mc.js`), and its hearts live in the panel that would be removed.
- **It adds upkeep.** It would be one more vendored file to re-pin on every QOLLOCK update, and our copy would hide any layout change QOLLOCK makes later.
- **It still needs Plan A's code change.** The guard has to go either way, so Plan B is Plan A plus a forked QOLLOCK layout.

A narrower variant would be a pak02 override that only renames the marker id. It needs the same vendoring, breaks the Minecraft numbers the same way, and still leaves the theme clash.

## Tests and checks (when implemented)
- VM, in `tests/legacy-shield.test.js`: replace the "QOLLOCK falls back" assertion with two tests, red first. A default QOLLOCK HUD gets the full old look. A themed one keeps its layout, is still corrected, and gets the layout back when the theme is turned off.
- Bump `release` to 3.3.1, regenerate, and rebuild all six builds.
- Check in game on the QOLLOCK debug build: a shield on QOLLOCK's default healthbar, then on a theme such as Minimalist, then a theme switch while Separate is on.
