# Spike: injection from `hud_spectate_bar.xml` (PLAN.md phase 1)

Date: 2026-10-22. Client 6812. Spike source: `spike/` (built with `spike/build_spike.ps1`, installed as pak10, removed afterwards with `-Remove`). Installed alongside pak02 (HP Colors, overrides `hud_escape_menu.xml` and `citadel_hud_top_bar.xml`), pak03 (QOLLOCK) and pak89 (ShowRank, overrides the top bar, player card and Escape menu). Spectator view came from `playcast` on a live Steam TV broadcast. Screens are in `spike/shots/`, and the `[OH-SPIKE]` lines in `citadel/console.log` are quoted below.

## Result: injection works (approach B stays)

| Check | Result | Evidence |
|---|---|---|
| Host script runs | yes. It loads at UI start (main menu), before any map, and keeps running across map changes (one instance, `g1`, the whole session). | `host script loaded` 06:23:19; ancestry `CitadelHudSpectateBar#spectate_bar > Panel#spectate_container > Panel#gameplay_hud > Panel# > CitadelHud#Hud > Panel#CitadelHudRoot` |
| Layout loaded into `#TopBar` | renders, and its own stylesheet applies | `bar injected into CitadelHudTopBar#TopBar`; screens |
| Re-injection | `#TopBar` is rebuilt on every map load (practice map, hideout, broadcast). The host re-injected each time; the web logo `ImageLoaded` fired once per map. | log 06:23:20, 06:23:57, 06:24:20 |
| Spectator gating in CSS | `.spec_mode` and `.TeamSpectator` sit on `CitadelHud#Hud` while spectating; a selector in the injected layout's stylesheet matched them (`GATE: SPECTATOR CSS OK` shown only then). | ancestry log 06:24:19; `1920x1080-spectating.png` |
| Label per card | 12 of 12 cards got one. `text="{s:player_name}"` resolved to each card's player name with no script, stayed while a player was dead (respawn number over the portrait), and the script could replace it. | `aliases {"cards":12,"labels":12}`; `1920x1080-typed-text-on-bar.png` |
| Layout loaded into `#EscapeMenu` | the button showed in the Escape menu with pak02/pak89 Escape menus installed; `SetPanelEvent("onactivate")` from the host reached the host script; the `TextEntry` took a click and typing, and the host read `.text` | `editor opened`, `typed RzR Cup`, `editor closed`; `1920x1080-esc-editor.png` |
| Cross-context text | typed text showed under the clock and on the first card within 1 s | `1920x1080-typed-text-on-bar.png` |
| Web logo | `Image.SetImage(https URL)` loaded (`ImageLoaded`) | log |
| Ban portrait | `CitadelHeroImage.SetHeroID(1)` drew the hero | screens |
| The created panel takes the layout root's classes | yes (`BHasClass("OHSpikeMenu")` true) | log 06:23:19 |

## Findings the build must follow

- **`#TopBar` is `width: fit-children`** (1400 px, from its widest stock child) and clips children outside its bounds. With the injected bar set to the HUD width (from `CitadelHudRoot`), `#TopBar` grew to the full screen (`x 0, w 1920`), and the stock teams did not move (`TeamFriendly x 330`, `TeamEnemy x 1062`, as before). The bar sets its width from script, because the HUD width depends on the aspect ratio.
- **Spectator geometry, 1920x1080:** the `#TopBar` top is at y 8 in spectating (stock `margin-top: 8px`); the teams span 330-858 and 1062-1590; the clock is `GameTime` at 920,22 (80x20). The free space at the outer ends is 0-330 and 1590-1920.
- **At 1728x1080 (16:10):** the teams start at 234 and end at 1494, which leaves 234 px on each side. A 213 px plate fit, but it touched the stock top-left mute indicator. Full design 11 plates need the shrink rules (PLAN failure 5).
- **Stock "SPECTATING" block** (`#spectate_target`) sits at the top right in this build (x 1700, y 20, 220x106), so it is under the right plate, not the left as the plan assumed. The host stylesheet moved it to y 138 with `margin-top: 130px` under the spectator classes.
- **`TextEntry` placeholder:** it stayed drawn under the typed text, because the injected layout does not include the stock base styles that hide it. The editor layout must include `citadel_base_styles.vcss` (or style the placeholder itself).
- **Escape-menu clicks** at the menu's top centre reach the injected button. The editor needs the backdrop rule from DLF (a `Button` as the first child) so that clicks around it do not reach the stock menu.

## Not tested

- `panorama_reload_layout` is hidden on retail and needs `cvar_unhide` (not installed; it carries VAC risk). The generation token that stops a second host instance is therefore unproven live. Map changes, which rebuild `#TopBar`, were tested.
- The Esc key with the editor open: the background key press was refused, and foreground control was denied. The menu was opened and closed with the console command `escape`.
- Replays and demo files (`.replay_playback`); 4:3 and 21:9.
- Card rebuilds within a match (hero swap): none happened during the run.

## Spike 1b: world-side host in `citadel_status_effect.xml` (same day)

The spike pak added one script include to the stock `citadel_status_effect.xml`, and one sibling relay layout. It ran on a live broadcast (match 121917673) and on **demo 121685912**, which plays on client 6812 (`playdemo 121685912`, then `demo_gototick 70000`). The demo is now the repeatable test source. Its HUD carries `.spec_mode.replay_playback.TeamSpectator`.

| Check | Result | Evidence |
|---|---|---|
| Once per healthbar | yes. One instance per world healthbar (`CitadelStatusEffect#StatusEffects > ClientUIDialogPanel#client_ui_panel > Panel#panorama_world_panel_N`), plus two in the HUD's own status lists (`gameplay_hud_alive`, `StatsAndModsContainer`), which the script skips by their `CitadelHudRoot` top | `[OH-SPIKE-W]` lines |
| Telling hero bars apart | yes, with a delay. At layout load the class is not set yet. `CLASS_PLAYER` appears on an ancestor later (v1 found it is the world panel `Panel#panorama_world_panel_N` above the `ClientUIDialogPanel`, not the dialog itself): on the 1st-6th check of a 0.5 s doubling backoff. The world panels are also **recycled** between units: `panorama_world_panel_22` was sampled as a non-hero bar, then became a hero bar. | `hero bar after N checks`; 16 hero bars over the runs |
| Relay to the HUD | yes. Each hero bar's sibling relay `ClientUI_FireOutput` reached the HUD host's `RegisterForUnhandledEvent` listener (8 bars, 16+ messages per run) | `world {"msgs":16,"bars":8,...}` |
| Status panel ids | readable, for example `status_ability_ratking_ratnibble`, `status_upgrade_mystic_reverb` | `sample` field |
| `GameUI.CustomUIConfig()` | not available in these contexts (`sharedCfg=false`), so there are no cross-context counters from world bars | log |
| Errors | none (`tick error`, `relay error` and `relay layout failed`: 0) | console.log |

Rules for the port:
- **Detection:** never decide at boot. Re-check the class with a capped backoff, and re-check a hero bar's class on every sample: panels are recycled, and a recycled bar must stop publishing (and send one clearing message). DLF's `heroUnit()` already re-validates `CLASS_PLAYER` each sample.
- **Backoff cap:** a hero was first seen up to 6 checks (about 15 s) late. Cap the non-hero backoff low enough that a new hero bar starts within about 2 s. Measure the cost of the ~100 recycled world panels in the validator budget.
- **Stuns:** none were seen during the runs: stock VData hides them, and the spike pak had no VData. The spectator VData is what makes them visible, so stuns are proven in phase 3 with the real pak.

## v1 live run (same day)

The built pak10 ran on demo 121685912 at 1920x1080 and 1728x1080 (`shots/live/`). One fix came out of it: the world sampler first looked for `CLASS_PLAYER` on the overlay's `ClientUIDialogPanel` and found no hero bars; a diagnostic build showed `dialog=false root=true` on every hero bar, so the class sits on the world panel above it. The sampler now accepts either, and the validator has a bar with the class on the world panel. With that, hero bars sent snapshots and the column drew them (Nurse Harrow's fear with a countdown, Dynamo's vacuum, Abrams' leap and the Hyperline as stuns). The plates moved from 56 to 72 px off the screen edge, clear of the stock mute icon.
