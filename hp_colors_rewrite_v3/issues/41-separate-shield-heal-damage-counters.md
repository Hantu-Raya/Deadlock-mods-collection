# 41: Heal and damage numbers missing with the separate shield bar

**Report** (GameBanana, Commun4, 2026-10-23): "There is tiny bug if you use separete shield bar heal and dmg doesnt show near hp bar. With merged all good."

**Status:** Plan A implemented in 3.3.2 (2026-10-24), VM-verified and built for all six variants; not uploaded and not checked in game (see the [MAP changelog](../MAP.md#changelog) for builds, archives and the bench). The cause below is inferred from the stylesheets and the lane's inline writes; the in-game check under "Still open" settles it.

## Which numbers
The stock `hud_health_container.xml` (6805, unchanged in the latest extracted copy) puts the recent heal and damage numbers inside `#HealthRegenAndTotal`, next to the HP number:
- `#RecentHealContainer.recentHealCounters` with `+{i:healCounterTotal}` rows;
- `#RecentDamageContainer.recentDamageCounters` with `{i:damageCounterTotal}` rows.

The pending damage/heal bars inside the health bar are a different feature. The report says "near hp bar", which fits the counters. If the reporter means the in-bar flashes instead, this ticket does not apply; see "Still open".

## Cause (inferred)
*Your shield bar: Separate (old)* writes the pre-6711 layout of `#HealthRegenAndTotal` inline (`LEGACY_LAYOUT` in `hp_colors_v3_menu.js`): width 115px, right-aligned, margin-top 5px, margin-right 10px. It does not restore the pre-6711 positions of the two counter containers, which live in the same box:

| Rule | Pre-6711 (6710) | 6711–6805 | Under Separate |
|---|---|---|---|
| `#HealthRegenAndTotal` | 115px, right, margins 5/10px | 250px, center | 115px, right (inline) |
| `#RecentHealContainer` | margin-left 35px, margin-top 30px | margin-left **165px**, margin-top 50px | 165px / 50px (sheet) |
| `.recentDamageCounters` | margin-left 35px, margin-top 160px | margin-left **160px**, margin-top 165px | 160px / 165px (sheet) |

6711 widened the box to 250px and moved both counters 125–130px further right to follow it. Separate shrinks the box back to 115px but keeps the 6711 margins, so each counter's left edge starts 45–50px past the box's right edge. Taking W as the width of `#HealthBarContent`, the counters' left edge moves from about W/2 + 40px (Merged) to W + 40px (Separate): out of the HUD area beside the bar. Panorama either lays them out at zero width or draws them off to the right; either way they no longer show next to the bar. Merged writes nothing, so the stock 250px box keeps them in place, which matches "With merged all good".

Same result on QOLLOCK's default healthbar (type 0): its sheet imports the stock base, and its own `.recentHealCounters { margin-left: 35px }` loses to the base's `#RecentHealContainer` id rule. QOLLOCK themes 1–4 skip `LEGACY_LAYOUT` ([ticket 40](40-qollock-separate-shield.md)), so they should not be affected. Minecraft runs nothing.

Why the suite missed it: the VM mock in `tests/legacy-shield.test.js` has no counter panels, and the VM does not model layout.

## Evidence
- Stylesheets: `.scratch/shieldbar/pre_hud_health_container.css` (6710), `cur_hud_health_container.css` (6805; `.scratch/oh_matchend/st/` is byte-identical, md5 `02d7ac8e`), QOLLOCK 4.0.5 `.scratch/qolshield/panorama/styles/` (base `8e2d890c`, themes `ff3e3bd2`).
- Stylesheet audit (judge over every rule, 2026-10-24): 405 rules from the three sheets plus QOLLOCK's base sheet; 33 `@keyframes`/empty bodies were filtered out first, none failed, none were truncated. Asked which rules, together with Separate's inline writes, could push a counter out of the 115px box. Top hits read and confirmed: stock `.recentDamageCounters` (margin-left 160px) and `#RecentHealContainer` (165px), plus the QOLLOCK theme counter rules, which Separate does not touch under a theme. The judge's coarse role label over-assigned "ancestor overridden" to unrelated rules, so only the break question and a manual read were used. No rule other than the two counter margins and the box's width/alignment moves the counters.

## Plan A: restore the pre-6711 counter positions with the box (recommended)
Same approach as the rest of `LEGACY_LAYOUT`: the old look as a whole, inline, skipped under QOLLOCK themes.
1. **Test first (red):** add `#RecentHealContainer` and `#RecentDamageContainer` (classes as stock) to the VM HUD mock. New cases in `tests/legacy-shield.test.js`:
   - Separate on a stock HUD writes heal `marginLeft 35px, marginTop 30px` and damage `marginLeft 35px, marginTop 160px`;
   - Merged writes nothing to them;
   - a QOLLOCK theme writes nothing to them; QOLLOCK type 0 gets the old positions;
   - release (Merged, HP Colors off, a later context's pending release) clears both through `margin`;
   - a HUD without the counters still attaches (they are optional).
2. **Lookup:** in `legacyPanels`, find both containers by id under `regen` as optional entries, like `techBox`, so a HUD without them never disables the lane.
3. **Layout:** add both to `LEGACY_LAYOUT` with the 6710 values above, and add `["healCounters", "margin"]`, `["damageCounters", "margin"]` to `LEGACY_OWNED`. Margins clear through the base `margin` (longhands throw when cleared alone, live 6779/6782). No `horizontalAlign` write is needed; both sheets use `left`.
4. **Themed attach:** the existing `hpc3_legacy_shield = "2"` path already skips every `LEGACY_LAYOUT` entry, so the theme keeps its own counter positions.
5. **Cost:** two lookups and four style writes per attach; nothing per frame. Re-run the shield bench to confirm the per-frame counts are unchanged.
6. **Docs and release:** ticket 38's old-layout list gains the counter values; MAP changelog; `settings/record.json` release 3.3.2 (fix); rebuild all six variants (normal, QOLLOCK, ShowRank; release and debug) through the wrappers with `-SkipDeploy`.

## Considered
- **B: keep the counters at their 6711 screen position** by offsetting their margins by the box's move. The offset depends on the width of `#HealthBarContent`, which is set by the HUD, so it needs a layout read on each HUD change and still breaks at other resolutions or HUD scales. Rejected.
- **C: keep the 250px box and move only the HP and shield numbers** to the old spot. It changes the old look that ticket 38 restored, needs the same width-dependent offsets, and touches more panels. Rejected.

## Still open
- **Live confirmation of the cause.** Before or with the fix, a debug-build check with a shield up: heal and damage counters visible next to the HP number in Separate, matching Merged's timing and colours, on the stock HUD and on QOLLOCK type 0. Optional temporary probe: log `actualxoffset`/`actuallayoutwidth` of both containers in Separate vs Merged. Launching Deadlock needs the user's go-ahead.
- **Which numbers the reporter means.** If they mean the in-bar heal/damage flashes (`#pending_incoming_damage`/`#pending_incoming_heal`), ask for a screenshot; that would be a separate cause in the max-rescale path.
