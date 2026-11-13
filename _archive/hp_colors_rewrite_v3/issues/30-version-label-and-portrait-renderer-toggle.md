# 30: Preview version label (portrait renderer toggle removed)

**What to build:** Keep the preview pane's bottom-right `v3.0.0` release label. Remove the portrait renderer toggle end to end by user decision on 2026-10-17: without the cvar-unhide DLL, none of the tested Panorama routes changes `citadel_portrait_world_renderer_off`.

**Blocked by:** none

**Status:** done. Version label shipped; toggle removed by user decision 2026-10-17. The findings below retain the earlier implementation and live-check history, not the current toggle behavior.

**Runs on:** gpt-6.1-sol (med). **Main:** live check.

## Facts

- `citadel_portrait_world_renderer_off`: client, `release`, engine default `true`, not `archive` (from `citadel/cvarlist.md`). Main's 6785 live check (debug pak `534de460`) confirmed the visible effect: `true` hides the preview hero model; `false` renders it. Main reports the user's `gameinfo.gi` line 590 sets `"false"`, explaining the effective initial value. Restart resets the non-archived value, but gameinfo may set it.
- **GameInterfaceAPI is absent:** Main's live debug check on 6785 found `GameInterfaceAPI=false GetSettingString=false writable=false` on attach and on open, leaving the initial implementation disabled. Main also reports no `GameInterfaceAPI` / `GetSettingString` / `SetSettingString` strings in the inspected Deadlock DLLs. The `anitaui` route was speculative, not evidence of a Deadlock API.
- **Native control is inert here:** stock `popup_settings.xml` uses convar-bound `CitadelSettingsToggle` controls (reference `.scratch/hpv3_live1/stock_preview/popup_settings.xml:214`). Main's second 6785 live check found that the embedded control rendered and flipped visually but neither wrote nor read the convar: VConsole remained `false` after two clicks, and after setting `true` through VConsole and reopening, the control still showed OFF. That Escape-menu embedding was removed.
- **Command event route:** `buff_timer_virgin/panorama/scripts/rejuvnbufftimer.js:2667` uses `$.DispatchEvent("CitadelConCommand", "say_chat_team")`. Main selected the same event for the explicit portrait convar commands. There is no read-back API; a non-throwing dispatch is not proof of the engine's value.
- `"3.0.0"` in the generated contract is the wire/contract version, not a release number. The separate release source is now `settings/record.json` → `release`.

## Decisions (Main, 2026-10-17)

- **Version:** a single release-version source (for example `settings/record.json` `release`, initially `3.0.0`), shown as `v3.0.0` in small muted text at the bottom right of the preview pane. Bumping it touches exactly one place. Debug builds may append ` debug`.
- **Final user decision (2026-10-17):** remove the toggle, its row/help, menu dispatch/state/binding, debug line, styles, generated ids and toggle tests. Without the cvar-unhide DLL nothing tested in Panorama changes this convar; the exact engine gate remains unknown. Keep the release label and its single source unchanged.
- QOLLOCK gets the retained version label through canonical regeneration and recomposition.

## Acceptance

- [x] The version label renders at the bottom right of the preview pane, from one source, in both variants.
- [x] **Toggle removed** by user decision 2026-10-17; no toggle markup, state, dispatch, binding, styles, tests or generated ids remain in either variant.
- [x] Generator `--check`s current, QOLLOCK recomposed, all three suites green (see removal verification below).
- [x] Version label shipped and previously live-verified on 6785. Removal is source/VM-verified only; no build, install or launch was requested.

## Historical implementation (2026-10-17, session-command revision; superseded by removal)

- **Version unchanged:** `settings/record.json` → `release: "3.0.0"` remains the single source. Generation emits `HPColorsPreviewVersion` as `v3.0.0`; its small muted bottom-right CSS, original preview padding and release/debug presence are unchanged.
- **Custom control:** `tools/menu-layout.js` emits `HPColorsPortraitRendererToggle` with the same `HPC3ToggleOff` / `HPC3ToggleOn` handles as SHOW BOUNDS and the v3 boolean rows. `HPColorsPreviewPortraitLabel` says **Hero portrait renderer off**. The help names `citadel_portrait_world_renderer_off`, states **Game value unknown until set here** initially, and explains the restart reset / gameinfo override.
- **Dispatch and rollback:** `hp_colors_v3_menu.js` binds only the click to `CitadelConCommand`, using the exact constant convar plus `1` or `0`. The first click requests `1`; later clicks invert HP Colors' own last value. A single-line `// HPV3_DEBUG` diagnostic logs every attempted dispatch. Only after dispatch returns is the shared `$.HPColorsV3PortraitRendererOff` boolean updated and the control painted. A throw leaves that static and Checked state unchanged and prefixes the note with **Command failed**.
- **Honest session state:** attach/open only paint the shared static; they never read the engine or dispatch. Undefined static means unknown, not an assumed default. A known value is labelled **Last set here: ON/OFF**, not confirmed current engine state. Reopen and same-context script reinclusion retain it; a fresh session starts unknown. Closed/retired handlers cannot dispatch. Console/gameinfo/external changes cannot be read and must not be inferred.
- **Removed obsolete routes:** no `GameInterfaceAPI` route or native `CitadelSettingsToggle` remains. `hp_colors_v3_preview.js` is unchanged. QOLLOCK consumes the regenerated pane and the same menu script. The four ids are `HPColorsPreviewVersion`, `HPColorsPortraitRendererToggle`, `HPColorsPreviewPortraitLabel` and `HPColorsPreviewPortraitHelp`.
- **Storage/style invariants:** no schema slot, record-version/default change, save, preset, publication or Undo state is added. Literal pre-ticket settings/bundle/save fixtures retain byte-identical conditions, preset data and routing metadata even after two successful toggle commands. Control styles reuse the existing opacity-only handles and add no motion/shadow; inherited ticket-27 exceptions are unchanged.

### Regression tests

`tests/preview-chrome.test.js` contains ten observable VM cases:

- `release label is muted and anchored at the preview bottom right`
- `custom portrait toggle starts unknown and dispatches the exact commands both ways`
- `boot, open, reopen and page changes never dispatch a portrait command`
- `last set value survives reopen and script reinclusion but not a fresh session`
- `a thrown dispatch keeps the previous unknown / true / false state and shows an error`
- `closed and retired portrait handlers cannot dispatch commands`
- `changing the release source alone updates the generated pane, not wire versions or slots`
- `preview chrome preserves pre-ticket settings, bundle and save bytes`

QOLLOCK has `ticket 30 preview chrome (model / pinned): session portrait commands and reopen state survive composition`. The command-state cases failed against the inert native-control implementation before the custom markup/handlers were added. Both focused variants then passed after regeneration/recomposition. MockPanels are compared by identity only.

The tests prove event payloads and menu state, not execution by the engine. Main's two earlier live checks rejected the speculative API and the native embedding; this session-command revision has not been built, installed or launched by this agent and still needs Main's live command verification.

### Verification of session-command revision

Canonical generation and QOLLOCK recomposition ran in that order. The complete final gate ran directly in a shell:

| Command | Result |
| --- | --- |
| `node --test hp_colors_rewrite_v3/tests/*.test.js` | **1240/1240**, no failures/skips |
| `node --test hp_colors_rewrite_v3_qollock/tests/*.test.js` | **26/26**, including model and pinned runtimes; no failures/skips |
| `node --test scripts/validate-hp-colors-rewrite-v2-storage.test.js` | **48/48**, no failures/skips |
| `node hp_colors_rewrite_v3/tools/generate.js --check` | 12 outputs current; 3 stylesheets / 758 rules, at most 10 selectors per rule |
| `node hp_colors_rewrite_v3_qollock/tools/qollock.js --check` | 2 outputs current |

Schema, generated defaults and generated slots retain their pre-ticket SHA-256 hashes; the record version remains 13. Both layouts contain each of the four new ids exactly once and no inert native convar binding. These results supersede the earlier API/native-binding gates. No build, install or launch was performed for this revision.

## Live check (Main, 2026-10-17, 6785)

- The first native `CitadelSettingsToggle` attempt rendered but was inert in the Escape menu: clicks never changed the convar, and a console change never showed on it. `GameInterfaceAPI` does not exist in Deadlock (no DLL contains the string). Both approaches were dropped for the `CitadelConCommand` toggle.
- Final build: `v3.0.0` shows at the bottom right of the preview pane. The toggle starts as "Game value unknown until set here". Clicks set the convar `true` and then `false`, confirmed through VConsole on both the debug (`0c7ac494` md5) and release (`ed782eeb` sha) builds. With `true`, the preview hero model is not drawn; with `false`, it is. No Parsing error/FATAL/Uncaught.
- The user's `gameinfo.gi` line 590 sets the convar to `"false"`, so it starts false here even though the engine default is `true`.
- The QOLLOCK release (`f4019614`) gets the same pane through recomposition and VM tests; it was not launched.
- Evidence: `.scratch/hpv3_live_1017/t30_menu_version.png`, `t30_toggle_live.png`, `t30_release_menu.png`.

## Without the cvar-unhide DLL (Main, 2026-10-17)

The user reported that the toggle does nothing once `addons/bin/win64/server.dll` (the cvar-unhide proxy) is removed. Confirmed live on 6785:

- Without the DLL, `citadel_portrait_world_renderer_off` is a hidden developer convar. VConsole reads and writes both log `Unknown command: citadel_portrait_world_renderer_off`, and so does our `CitadelConCommand` dispatch. The earlier live pass only worked because the DLL was installed.
- I also tried the FOV Slider mod's approach (`G:/deadlock-fov-slider-v100.zip`, decompiled to `.scratch/fov_slider/out`). That mod creates a native `CitadelSettingsSlider` with `convar: "r_aspectratio"` and `updateonvaluechange: "true"`, sets its inner `Slider` value and dispatches `SliderValueChanged`. It works because `r_aspectratio` is an ordinary convar. Running the same steps against this convar (temporary debug probe, since removed): the slider read 0 while gameinfo had set it to 1, and writing 0 left the preview model hidden. So the native control cannot reach a hidden convar either. `Game` is undefined in the Escape context, so `Game.GetConvarFloat` is also unavailable.
- What does work without the DLL is `gameinfo.gi` `ConVars`: the user set line 590 to `"1"` on 2026-10-17, and the preview model is hidden from launch.
- The toggle as shipped claimed "Last set here: ON/OFF" even when the game ignored the command, and there is no read API to detect that. The user decided to remove it on 2026-10-17.

**Correction (user, then Main live, 2026-10-17):** `r_aspectratio` is also a development-only convar, so "hidden" alone is not the difference. Without the DLL, retested in the Escape menu:

- **FOV Slider route on `r_aspectratio`: works.** A native `CitadelSettingsSlider` (`updateonvaluechange`) plus a write to its inner `Slider` and `SliderValueChanged` visibly widened the world view, and writing again restored it (`.scratch/hpv3_live_1017/probe2_aspect.png`). The slider read position 0 while gameinfo held 2.15, so it doesn't read the live value back.
- **Same route on `citadel_portrait_world_renderer_off`: no effect.** Writing 1 and then 0 on the inner slider (logged `after=1`, `after=0`) left the preview model hidden, also after closing and reopening the menu (`probe3*.png`).
- **A native `CitadelSettingsToggle`/`CitadelSettingsCheckbox` bound to it: no effect.** The toggle showed OFF while gameinfo held 1, and clicking it on and off with menu reopens never brought the model back (`probe4_toggle.png`).
- Inference, untested: the settings controls write some dev-only convars (an engine/render convar) but not this client convar. The exact gate is unknown. All probes were removed; `PROBE` grep is 0 and the generator is current.

## Removal verification (2026-10-17)

- Removed the toggle row, label/help, handler/binding, shared session state, command dispatch/debug line, CSS and generated ids. Canonical outputs were regenerated before QOLLOCK recomposition.
- Kept `settings/record.json` `release: "3.0.0"`, the version label styling and both canonical version-label tests. QOLLOCK's model/pinned cases now check only the retained release label.
- All three suites ran directly in a shell with the TAP reporter: canonical **1232/1232** (eight toggle-specific tests removed from 1240), QOLLOCK **26/26** (version-label cases retained), v2 storage **48/48**. Zero failures, skips or cancellations.
- `generate.js --check`: **12 outputs current**, 3 stylesheets / 756 rules, max 10 selectors. `qollock.js --check`: **2 outputs current**.
- Requested `Portrait|CitadelConCommand` grep finds only existing hero-picker `HPC3HeroPortrait` styling/creation and the stock `unstick` command in both Escape layouts; no toggle remnants. These unrelated controls remain intact.
- No builds, installs or launches. Earlier live findings above remain historical evidence, not a live check of this removal.
