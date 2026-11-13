# 52: Status effect icon sizes

**What to build:** A size slider for each of eight stacking status effects that the game shows above a health bar, starting with Haze's Fixation. Moving a slider enlarges only that icon on hero bars. The menu preview adds the edited effect at the right of its status row, next to the ordinary sample debuff and the pickups, so the sizes can be compared.

**Request (tsunamicrazie, 2026-11-07):** "Could you add an option to increase the size of icons for applied effects? For example I'd like to enlarge Haze's passive ability icon so I can see it better"

**Request (user, 2026-11-13):** some people say the Fixation stack is too small; add sizes for the specific effects that are like Fixation (picked from the stock ability data), as a new category with a name and a scale slider each, and show the edited icon in the preview at the right of the existing status effects.

**Project:** normal v3 (`hp_colors_rewrite_v3`); every menu or schema change also reaches QOLLOCK and ShowRank.

**Status:** fourth build, **checked in game** at 170 % (self-test 2026-11-13, build 6861, ShowRank `f07ef53a`): Haze's Fixation icon on a target dummy is a full circle with its stack number, directly above the name. Not checked: sizes above 170 %, the other seven effects, the HUD and top bar rows.

## Decisions

- **Setting:** ICONS page, new card *Status effect sizes*, basic level, shared (both sides). Eight number sliders, 100 to 250 % in steps of 10, default 100 (the game's size). Slots 218 to 225, record v23 (one bump for all eight; `tools/new-setting.js --same-version`).
- **Effects** (pinned `vendor/abilities.vdata`; each modifier has its own `m_strSmallIconCssClass` and `m_eModifierDisplayLocaiton = "MODIFIER_DISPLAY_HEALTHBAR"`, and its ability has per-stack properties or a stacking modifier):

  | Slider | Setting | Icon class | Ability |
  |---|---|---|---|
  | Fixation (Haze) | `statusScaleFixation` | `fixated` | `ability_stacking_damage` |
  | Malice (Lady Geist) | `statusScaleMalice` | `blood_shard` | `ability_blood_shards` |
  | Screwjab Dagger (Vyper) | `statusScaleScrewjab` | `modifier_viper_debuffdagger` | `ability_viper_debuffdagger` |
  | Djinn's Mark (Mirage) | `statusScaleDjinnsMark` | `sand_phantom_passive_victim` | `mirage_sand_phantom` |
  | Serrated Knives (Shiv) | `statusScaleSerratedKnives` | `shiv_dagger` | `citadel_ability_shiv_dagger` |
  | Barrage (Pocket) | `statusScaleBarrage` | `pocket_damage_amp` | `synth_barrage` |
  | Pulse Grenade (Paradox) | `statusScalePulseGrenade` | `chrono_pulse_grenade` | `citadel_ability_chrono_pulse_grenade` |
  | Arctic Beam (Kelvin) | `statusScaleArcticBeam` | `freezing_buildup` | `ability_icebeam` |

- **Left out:** icon classes shared by many effects (`slowed`, `silence_proc`, `bullet_armor_reduction`, `stunned`, `escalating_exposure`, `tether_proc`), because one slider would resize unrelated effects; item buildups (`bleeding_buildup`, `slowed_buildup`, `silence_buildup`) and Infernus's `afterburn_buildup`, which fill a meter rather than count stacks; unreleased heroes' effects. Adding one later is a schema row, a letter in the renderer and preview lists, 15 world rules and two menu rules.
- **How it scales:** the mod ships the game's `citadel_status_effect.xml` with one added include, `hp_colors_v3_status.css` (generated from the pinned stock layout, `tools/lib/stock-layouts.js` `patchStatusEffect`). On hero bars the renderer adds one root class per changed slider (`HPColorsV3Fx<letter><percent>`, letters A to H in the table's order) and `HPColorsV3FxOn` when any is set. The sheet has one `ui-scale` rule per effect and step (120 rules) on the game's icon class, and one rule that makes the row and its container `height: fit-children; min-height: 32px` under `HPColorsV3FxOn`, so the 32 px row grows to its tallest icon instead of clipping it. Nothing native is read or written by script, so a new icon is drawn at its size at once and there is no per-frame cost.
- **Preview:** one sample icon (`HPColorsPreviewFx`) at the end of the status row. The preview script gives it the icon class of the slider that moved last, and a mirror of the 120 rules in `hp_colors_v3_world.css` sizes it; menu CSS supplies each picture and colour from stock `unit_status_icons.css`. It stays until another page is opened. The ordinary sample debuff keeps the game size.
- **NEW tab:** `status-effect-sizes`, release 3.7.0, opens the Fixation row.

## In-game history (2026-11-13, build 6861)

1. **Rules in the health bar sheet: no effect.** With Fixation and Djinn's Mark at 170 %, both icons stayed at the game size (ShowRank release `86ffb023`). The status row is a `CitadelStatusEffect` panel with its own layout, `citadel_status_effect.xml`, and a panel takes rules only from the sheets its own layout includes. The rules were in `hp_colors_v3_world.css`, which only the health bar layout includes.
2. **Rules in a sheet added to the shipped status layout: icon grows, but cut.** ShowRank release `21f6f0a0` shipped `citadel_status_effect.xml` with one more include. The Djinn's Mark icon and its stack number grew, which confirms the cause above, that the game puts the effect's class on the icon panel, and that `ui-scale` applies there. The icon was drawn as a wide ellipse: the row is 32 px tall at the top of the bar canvas and clips its icons (a 30 px icon at 170 % is 51 px), and nothing is drawn above the canvas top.
3. **Inline styles from the renderer: rejected before an in-game check.** ShowRank release `9dbf3515` dropped the shipped layout; the renderer scanned the row every 500 ms and wrote `ui-scale` on the icon and a height on the row. The user rejected it because a new icon shows at the game size and then jumps.
4. **Current: shipped layout again, with the row fitting its icons in CSS.** Same route as 2, plus the `fit-children` row rule. Stock does the same for the HUD's own row (`#HealthBarContent CitadelStatusEffect { height: fit-children }`).

## Known limits

- **Checked in game only at 170 % with Fixation.** At larger sizes the icon grows down over the name and then the bar (see the next point). The canvas cannot be made taller: a test pak with a taller, raised root moved the bar up and lost the status row (`ENGINE.md`).
- **An enlarged icon pushes the row down.** The row cannot go above the top of the bar canvas, so it grows downward: while an enlarged icon is shown, all icons in that row sit lower, towards the name, and at large sizes the enlarged icon may cover the name. Icons return to their place when it ends.
- **One more stock file.** `vendor/citadel_status_effect.xml` (identical at pin 6828 and installed 6861 apart from the decompiler's header line) must be re-checked on game updates and conflicts with any other mod that replaces that layout. The sheet is loaded by every status row (HUD, top bar), but every rule needs a root class only hero bars get.
- Screwjab Dagger and Barrage have no stock CSS rule for their class; the game draws them with the ability picture. If the game does not add the class without a rule, those two sliders do nothing.
- The Fixation class is also used by a disabled item (`upgrade_nearby_enemy_boost`).
- Hero bars only. Trooper, objective and neutral bars keep the game size.
- The local player's own status effects by the HUD health bar are a different layout and are not changed.

## Data flow and performance

- **World:** no new reads or writes per paint. The class list is rebuilt only when the settings object changes; counted per-bar ceilings are unchanged in all 73 scenarios (`tools/budgets.js --compare`).
- **Menu (limits raised on purpose, measured):** bootChrome validity calls 268 to 274 (card, sample, NEW item); syncAll 964 to 997 for eight more rows (limit 970 to 1000); preview parent reads 1974 to 2014 from one more looked-up part at attach (limit 2000 to 2020). Preview validity calls 9561 to 9661 (limit 11000).
- **Save size:** eight more slots per v2 scope copy lower the largest synthetic all-keys-changed v2 save that converts under the 192,000 cap from 23 to 22 scopes.

## Acceptance

- [x] `tests/status-effect-sizes.test.js`: the eight classes exist on health-bar modifiers in the pinned data; a slider scales only its icon, releases its old step, and is released by 100 % and by the master toggle; every effect and step has a rule; the preview sample follows the last slider, uses the world size and leaves on page change. `tests/codec.test.js` "record v23".
- [x] Counted per-bar ceilings hold (`tools/budgets.js --compare`): no change. Menu limits above.
- [x] Generators current; QOLLOCK and ShowRank layouts recomposed (`tools/doctor.js`), `tools/engine-facts.js --check` clean, `tools/test.js --all` green.
- [x] Normal v3 release build (`node hp_colors_rewrite_v3/tools/build.js --project v3 --skip-deploy`).
- [x] QOLLOCK variant release build (`node hp_colors_rewrite_v3/tools/build.js --project qollock --skip-deploy`).
- [x] ShowRank variant release build (`node hp_colors_rewrite_v3/tools/build.js --project showrank --skip-deploy`).
- [ ] In game: against a Haze, set Fixation to 200 % and check the icon and its number grow, the other icons keep their size, nothing is cut off, and the row does not cover the name. Repeat for one effect without a stock rule (Screwjab Dagger or Barrage). Console check for `Parsing error`, `FATAL` and `Uncaught` (`tools/logscan.js` exits 0; installed pak hash recorded).
