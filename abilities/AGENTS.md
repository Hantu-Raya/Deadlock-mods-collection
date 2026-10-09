# Abilities (VData filters)

## Scope

`abilities/` owns the GameBanana mod "Always Show Passive Items and Actives Icons" (mod 601444): Python text transforms over Deadlock's stock `scripts/abilities.vdata` that choose which shop items show in the passive-items area and, in the yesBehaviour variant, add quick-cast unit targeting to selected hero abilities. Output is one compiled `scripts/abilities.vdata_c` per pak; there is no Panorama code here.

Package ownership: the wrapper builds four mutually exclusive variants, each a single `scripts/abilities.vdata_c`:

| Pak | Archive | Input | Transform | Behavior bits |
|-----|---------|-------|-----------|---------------|
| pak02 | `templete_MM_DD.7z` (spelling intentional) | `abilities.vdata` | none | untouched |
| pak03 | `filter_for_passive_and_active_items_yesBehaviour_MM_DD.7z` | `abilities.vdata` | `active.py` | enabled |
| pak04 | `filter_for_passive_items_MM_DD.7z` | `abilities2.vdata` | `passive.py` | untouched |
| pak05 | `filter_for_passive_and_active_items_MM_DD.7z` | `abilities.vdata` | `active_no_behavior.py` | removed |

Any abilities pak03 conflicts with QOLLOCK's pak03 and with every other pak03 addon.

The Custom Passive web builder (`D:/web/custom-passive`, GitHub Pages) depends on this module: its generators read both VData baselines and `active.py`/`passive.py`/`active_no_behavior.py` here, then verify the output against the GameBanana archives. Changing a transform makes the published archives stale until they are rebuilt, re-uploaded and synced (`npm run sync:gamebanana`) there.

## Source ownership

```text
SteamTracking abilities.vdata (pak01_dir/scripts)
  -> strip root _include
  -> abilities.vdata + abilities2.vdata        (identical clean baselines)
  -> apply_healthbar_status_overrides.py       (both inputs, in place)
  -> per pak: active.py | passive.py | active_no_behavior.py | none
  -> sr2compiler -> abilities_compiled/scripts/*.vdata_c
  -> inject_stock_external_refs.py             (stock RERL from citadel/pak01_dir.vpk)
  -> pakXX_dir.vpk -> dated .7z in citadel/addons
```

- `active.py` owns `REMOVE_FLAG_UPGRADES`, `ADD_FLAG_UPGRADES`, `ADD_BEHAVIOR_BITS`, `ADD_BEHAVIOR_BITS_ABILITIES`, record iteration (`iter_record_spans`, `get_record_name`) and `verify_behavior_state`. Other scripts import from it.
- `active_no_behavior.py` is `active.py` with `enable_behavior_bits=False`: it strips the injected bits and unit targeting instead of adding them.
- `passive.py` is the older `}\n`-split transform for the passive-only pak; it never touches behavior bits.
- `apply_healthbar_status_overrides.py` sets overhead status visibility for classified healthbar modifiers and rejects unclassified ones.
- `inject_stock_external_refs.py` copies the stock RERL block into a compiled `vdata_c` and fails if the source icons differ from the installed game.
- `test_active.py` holds the regression tests.

## Build flow

- Run from the repo root: `powershell -ExecutionPolicy Bypass -File build_abilities_paks.ps1`. It resolves `py.exe` and 7-Zip, extracts stock `scripts/abilities.vdata_c` from `citadel/pak01_dir.vpk`, and builds each spec in order.
- `-Only pak03` (any pak names) builds a subset. `-Deploy` also copies each built `pakXX_dir.vpk` into `citadel/addons`, replacing the installed one; without it only archives are written. `-Deploy` refuses to start while Deadlock runs, because the game locks addon paks. `-Only` cannot be combined with `-RefreshFromSteamTracking`.
- `-RefreshFromSteamTracking` fetches upstream `abilities.vdata`, requires exactly one root `_include` block, removes it, and writes the same content to both baselines. Never refresh only one: `abilities.vdata` feeds pak02/03/05 and `abilities2.vdata` feeds pak04. Record the upstream revision in the commit.
- Each spec restores its input from a temp baseline before transforming, so variants never stack. After packing, both inputs are restored to the post-override baseline and stage folders and root VPKs are deleted; the dated `.7z` archives (and deployed paks) are the only durable output.
- `sr2compiler/New folder.exe` may exit nonzero or hang after writing output; the wrapper accepts existing required outputs. `[rerl] N external refs` must appear for every compile (565 on the 10_07 baseline; 561 earlier).

## Transform rules

- Match records by exact name (`get_record_name(block) in ...`), never substring: `citadel_ability_lash` must not hit `citadel_ability_lash_ultimate` or a nested `reference = "citadel_ability_lash"`.
- The scripts are text transforms. Do not introduce a full KV3 parser. They mutate their input when no output path is given; use the wrapper or a copy.
- Transforms must be idempotent: a second run changes nothing.
- Forcing `..._UNIT` plus `USE_INSTANT_CAST_UNIT_TARGET_UI` onto an ability whose stock targeting is `..._SELF`, `..._NONE` or absent makes the game refuse the cast unless an enemy is in range. List such abilities in `NO_TARGET_ABILITIES`, which adds `CITADEL_ABILITY_BEHAVIOR_NO_TARGET` (the pairing stock unit-targeted cone abilities such as `ability_unicorn_radiantblast` use). Only list abilities whose stock bits lack `NO_TARGET`, because the no-behavior variant strips it; `test_no_target_list_matches_stock_baseline` enforces this. Stock-`UNIT` abilities (`citadel_ability_lash`, `ability_werewolf_frenzy`) stay off it.
- The ability VData schema (`DumpSource2/schemas/client/CitadelAbilityVData.h`) says `m_eAbilityTargetingShape` drives generic targeting only for `CITADEL_ABILITY_TARGETING_SHAPE_CONE`; other shapes are preview-only. In `client.dll` 6762, `GetTargetingLocation` (vtable +0x890) is the shared base implementation for every listed class, so location comes from data. `CONE_TARGETING_ABILITIES` switches the top-level shape to cone and reuses the stock `m_flTargetingConeAngle`/`HalfWidth`; `test_cone_list_is_listed_and_has_stock_cone_angle` requires those stock values.
- The unit-target UI is an ability HUD element (`ability_hud_element_unit_target` in `client.dll`); stock `m_bForceHideHUDPanel = true` hides the whole ability HUD panel. `SHOW_HUD_PANEL_ABILITIES` sets it to false.
- Cone targeting appears to search only within `AbilityCastRange` (the Billy and Silver abilities confirmed to show the UI all have a nonzero range), so a stock range of `0` likely finds no target. `CAST_RANGE_SOURCES` copies another property's value into it when the stock range is `0` (Tail Whack: `SlashRadius`, 10m). The range may then also appear on the ability card. `citadel_ability_healing_slash` also has stock range `0` and was not reported either way.
- History (2026-10-08): Billy's tether showed the UI only after the cone change; Silver's Boot Kick (`kickflip`) also needed its HUD panel unhidden; Tail Whack (`cripplingslash`) needed a cast range. Go For The Throat (`frenzy`) and Mauling Leap use the same recipe. In-game confirmation for Tail Whack's range fix is pending.
- Check stock values before changing a list: read the record from a clean baseline (`iter_record_spans` + `get_record_name`), not from a transformed file.
- `verify_behavior_state` requires every listed ability to exist; a rename upstream fails the build instead of silently dropping the edit.
- Healthbar status overrides: new modifiers with `MODIFIER_DISPLAY_HEALTHBAR` must be classified in `apply_healthbar_status_overrides.py`; explicit stock policies are preserved.

## Source and generated files

Edit only `abilities/scripts/*.py`, the `.bat` wrappers, and `build_abilities_paks.ps1`. The two `.vdata` files are generated baselines: change them only through `-RefreshFromSteamTracking` (and the override step the wrapper runs). Do not hand-edit `abilities_compiled/`, `pak0X_dir/` stages, VPKs, or archives. Files are ~7 MB; process them with scripts, not editors.

## Verification

Run from `abilities/scripts/`:

```powershell
py -m unittest test_active
```

Then build: the full flow for a release, or `-Only pak03 -Deploy` to test one variant in game. The wrapper verifies behavior state for pak03/05 and RERL injection for every pak.

To check a built pak without the game, decompile it: `.tmp/source2viewer-cli/Source2Viewer-CLI.exe -i <pak> --vpk_filepath scripts/abilities.vdata_c -o <dir> -d`, then read the targeted records' `m_eAbilityTargetingLocation` and `m_AbilityBehaviorsBits`. Compare the deployed pak's SHA-256 with the `.7z` member.

### Release checklist

- **Rebuild all four variants** with the full flow; never upload an `-Only` subset alongside stale archives from another day.
- **Upload all dated archives** to GameBanana mod 601444, then sync Custom Passive (`npm run sync:gamebanana`, then `npm run check` with the archives in `citadel/addons`) and push it. Its Pages deploy is manual-only.
- **Baselines must match the installed game.** An RERL injection failure saying icons differ means the baseline is stale: rerun with `-RefreshFromSteamTracking`. A stale baseline also desyncs client ability data from the server.
- **Data tests are not gameplay evidence.** Casting behavior, icons and hitch changes need an in-game check; say which variant was tested.
