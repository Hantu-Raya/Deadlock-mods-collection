# Inject the HUD from `hud_spectate_bar.xml` instead of overriding the top bar layouts

The mod overrides only the small, script-free stock `hud_spectate_bar.xml` and adds a script to it. That script runs from UI start, survives map changes, and loads the mod's own layouts (`band.xml`, `tournament_bar.xml`, `debuffs.xml`, `editor.xml`) with `BLoadLayout` into panels it creates. The editor opens from a native `#SubOptions` entry.

The alternative was the DLF way: override `citadel_hud_top_bar.xml`, `citadel_hud_top_bar_player.xml` and `hud_escape_menu.xml`. In this repo 17 modules override `hud_escape_menu.xml`, 12 the top bar and 8 the top bar player layout (HP Colors v3 and its variants, ShowRank, Top Bar Plus, QOLLOCK, Poker, DLF). Only one pak wins each file. Injection keeps the mod beside them. The spike passed on 2026-10-22 (client 6812) with pak02, pak03 and pak89 installed.

Consequences:

- Do not add an override of `citadel_hud_top_bar*.xml`, `hud_escape_menu.xml` or `unit_status_overlay_v2.xml`.
- The mod's layouts have names no other mod uses and each brings its own stylesheet (a stylesheet reaches only its own layout's panels). Spectator gating works from the classes on `CitadelHud#Hud`.
- The editor cannot hook the stock `oncancel`, so Esc closes the whole Escape menu. Edits are already applied, so nothing is lost.
- `#TopBar` is rebuilt on every map load, so the host re-injects from a 1 s tick.
- Upkeep after a Deadlock patch is one small stock file; the rest finds stock panels by id.
- It conflicts with DLF and the original Deadlock Observer Mod (both restyle the spectate bar) and, through the VData, with the `abilities/` paks and Custom Passive ([ADR 0002](0002-spectator-vdata-in-one-pak.md)).

Sources: [PLAN.md](../../PLAN.md) "The main choice"; [decisions/spike-injection.md](../../decisions/spike-injection.md); [ENGINE.md](../../ENGINE.md#host-and-injection); [SPEC.md](../../SPEC.md#host-and-injection).
