# 41: Heal and damage numbers missing with the separate shield bar

**Report** (GameBanana, Commun4, 2026-10-23): "There is tiny bug if you use separete shield bar heal and dmg doesnt show near hp bar. With merged all good."

**Status:** done in 3.3.2. Accepted live by the user (2026-10-25, client 6819, ShowRank release `05115240`, screenshot in the sandbox as Rat King): with Separate (old), shield 600 and a barrier 175 up, the heal counter "+143" shows at its September spot above the shield and barrier numbers, next to the HP number 612 / 1168 ("I think this is fine"). Damage at its spot and two or more heal rows were not in the shot.

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

## Follow-up: heal beside the damage while a shield shows (user 2026-10-24; withdrawn 2026-10-25)
Heal at its 6710 spot (35px/30px) sits above the shield number, so more than one heal row can run into the "600" and the HP number. The user wanted heal kept and asked: heal at the top, but while the shield is in, under current/max right beside the damage, back up once the shield is gone.
- **Trigger:** the shield number shows (`shieldActive` on `#hud_health_bars`, also with an empty shield showing "0") or the Rat King barrier number shows (`ratKingArmorActive`; its number sits in the same spot). Read in the 50 ms sample, written only on change; a theme writes nothing (as before).
- **Spot:** heal `margin-left 105px, margin-top 160px` (the damage row's top), right of the damage column at 35px. Back up: `35px / 30px`.
- **Clipped live (client 6819, user screenshot 2026-10-25, ShowRank `4600d2d8`):** beside the damage only a sliver of the heal icon showed at the box's right edge. Taken first for the container's default `squish` (10px of the 115px box left; `#RecentHealContainer` has no overflow rule), so `overflow: noclip` went on the heal container and the `margin-right -105px` went away (`103d3a59`).
- **Clipped again with `noclip` (user screenshot 2026-10-25, ShowRank `103d3a59`):** cut at the same place. So the cut comes from an ancestor: the 115px box sits 10px from the right edge of the health area (`margin-right 10px`), and anything drawn past that edge is cut above `#HealthBarContent`. No spot right of the damage column (35px plus its rows) fits inside the box. Not probed (`actualxoffset`/`actuallayoutwidth`), inferred from the two screenshots.
- **Reset (user 2026-10-25, "reset back to default so I can see the problem", chose the old September spot):** heal stays at 6701/6710's `35px / 30px` with a shield or barrier up too; no move, no `overflow` write. The runtime equals the first 3.3.2 build (`7e2fefa`) apart from a comment. Values re-checked against GameTracking 6701 (2026-09-25, the last build before 6711): heal 35px/30px flowing down, damage 35px/160px, shield number 63px down on the right (60px wide, margin-right 23px), current/max 100px down, no overflow rule on either counter. In that old layout two or more heal rows also reach the shield number.
- **Why JS, not CSS:** the lane has no stylesheet in the HUD (it writes inline only; QOLLOCK's pak03 replaces the stock sheets) and inline margins beat any sheet rule, so a `.shieldActive` rule could not move the heal while the inline 6710 spot is set. The trigger is the game's own class, so it needs no extra reads.
- **Tests now:** "with a shield or barrier up, heal stays at the September spot" (shield, empty shield, barrier, gone; heal only ever gets the two 6710 margins) and the QOLLOCK default/theme and release cases with a shield up; red before the reset.
- **Settled:** the user accepted the September spot live (see Status); no spot beside the damage is planned.

## QOLLOCK double check (2026-10-25)
Question: on a QOLLOCK HUD (4.0.5, `.scratch/qolshield/`), can the September-spot writes (heal 35px/30px, damage 35px/160px in the 115px box) hide, clip or push the counters out, as the 6711 offsets did?
- **CSS (jevify):** QOLLOCK's five health sheets, 646 top-level rules. Pre-filtered: 15 at-rules, 30 Minecraft-only (lane off). 601 judged (0 failed, 0 truncated): 341 unrelated, 177 theme-only, 21 same as Merged, 62 hides/clips. The bool "Separate-only break" over-flagged (351 ≥ 0.3), so the flagged set was narrowed deterministically to rules that can apply without a listed theme class and touch the counters or an ancestor: 41, all read; no unflagged rule touches them. Findings: QOLLOCK's copy of the stock sheet keeps the 6711 counter margins (beaten by the inline writes); QOLLOCK's own `.recentHealCounters { margin-left: 35px; margin-top: 30px }` matches the September spot; its unscoped `#HealthRegenAndTotal { overflow: squish; flow-children: none }` and `#RecentHealContainer, .recentDamageCounters { width: fit-children }` (`styles/hud_health_container.css:4-15`) leave each counter the 80px right of 35px before squeezing. That equals the September game (6701: no overflow rule on the 115px box, default squish). The `.healthHealCounter`/`.healthDamageCounter` rules match no panel.
- **XML/JS (m1, Grok 4.7, `agent://QollockCounterScout`; key claims re-read):** QOLLOCK's layout moves `#HealthRegenAndTotal` out of `#HealthBarContent` to a sibling under `.HealthContainerRoot` (100%/100%) with the same five children; the lane's lookups traverse, so they still find it. Healthbar types 0-5; type 0 sets none of the theme classes. `accent` (`variants/accent.js`) is a colour option on any type, not a type: it washes `#health_bar_frame` and `.healthBacker` and sets no class. `colored_healthbar_active` (colour warnings, type 0 only) and `combat_indicator_*` (on the box) restyle no counter. No QOLLOCK JS writes style, visibility, parent or children on the counters.
- **Result:** on QOLLOCK type 0 (with or without accent, colour warnings or the combat indicator) the counters keep the September spot inside the box; no hide or off-edge cut. Residual: a counter wider than 80px (icon, padding and a 5-digit value) would be squeezed, as in the September game. Themes 1-4 keep their own counter positions (no layout writes); Minecraft is untouched. Not checked live (needs QOLLOCK's pak03 installed with the QOLLOCK edition).

## Considered
- **B: keep the counters at their 6711 screen position** by offsetting their margins by the box's move. The offset depends on the width of `#HealthBarContent`, which is set by the HUD, so it needs a layout read on each HUD change and still breaks at other resolutions or HUD scales. Rejected.
- **C: keep the 250px box and move only the HP and shield numbers** to the old spot. It changes the old look that ticket 38 restored, needs the same width-dependent offsets, and touches more panels. Rejected.

## Still open
- **Live, partly done:** heal at its spot with a shield and barrier up on the stock HUD (ShowRank build) was seen and accepted (2026-10-25). Not seen: the damage counter in game, two or more heal rows, and QOLLOCK type 0 live (VM and source checks only, see "QOLLOCK double check").
- **Which numbers the reporter means.** If they mean the in-bar heal/damage flashes (`#pending_incoming_damage`/`#pending_incoming_heal`), ask for a screenshot; that would be a separate cause in the max-rescale path.
