# Detailed Post Scoreboard Menu

## Scope and routing

- This lane owns pak11, a standalone post-game stats board on the stock post-game Scoreboard screen: exact stats per player, souls by source, final items, MVP/Key Player slips and the soul lead graph. It is for any player and ships no VData.
- It is a fork of Observer HUD's Night Shift board (`observer_hud/panorama/**/observer_hud/pg_*`, forked 2026-10-29 from commit 5b0c767). User decision 2026-10-29: take the board out as a separate mod and never touch `observer_hud/` for it. Observer HUD keeps its own board in pak10.
- Removed from the fork: match cards (team names, logos, organiser), aliases, the hosted store page (`CitadelHTMLPanel`) and the `ClientUI_FireOutput` handoff listener, plus the `oh_state.js` dependency (`parseClock` is inlined). The header shows the stock team names, and each plate shows the Steam name.
- Engine evidence and the board's live history are in `observer_hud/ENGINE.md` (Post-game page) and `observer_hud/LIVE-VERIFIED.md`. They were measured on pak10, not on this pak.

## Source boundaries

- Edit `detailed_postgame/panorama/`, `detailed_postgame/scripts/validate-detailed-postgame.js` and `build_detailed_postgame.ps1`. Never edit `_detailed_postgame_build/`, `dist/detailed_postgame/`, VPKs or archives, and never edit `observer_hud/` for this lane.
- Every pak path is under `detailed_postgame/`, so pak10's files are never mixed in. The only stock override is `post_game/citadel_db_page_post_game_new.xml`: the pinned stock page plus the `pg_loader.vjs_c` include, minus the Play Again flame `src` (the loader sets it with `SetMovie`). The validator checks it against `observer_hud/stock-pin.json`. When that pin moves, port the stock change here by hand.
- Only one pak can own that page. With pak01 (DLF) or pak10 (Observer HUD) also installed, their board shows (the lower pak number wins); `-Install` warns when an installed lower pak ships the page. ShowRank's `citadel_db_post_game_scoreboard_new.xml` does not clash with it.
- Fixing a board bug in Observer HUD does not reach this fork: port it by hand.

## Commands

```powershell
node detailed_postgame/scripts/validate-detailed-postgame.js
powershell -ExecutionPolicy Bypass -File build_detailed_postgame.ps1            # dist\detailed_postgame + dist\Detailed_Post_Scoreboard_Menu_<yy.MM.dd>.7z
powershell -ExecutionPolicy Bypass -File build_detailed_postgame.ps1 -Install   # also installs pak11 on this PC
```

- The validator runs the board in the same synthetic dashboard VM as Observer HUD's (copied, not shared) and writes `.tmp/detailed-postgame-validate.json`. It proves no rendering or CSS behaviour. `DPS_CHECK=<text>` runs only matching checks.
- The scripts ship unminified (no Closure step), so the validator tests the exact shipped source.

## Runtime rules

- Never reparent stock scoreboard row children (fatal live). Restyle them in place and create own panels inside the rows through `pg_column.xml`.
- The board wakes on `CitadelMatchDetailsUpdated` and `CitadelPostGameSelectScreenIndex`, plus one check a second that reads only `PageVisible` while hidden (the `board:` budgets).
- Console lines use `[DPS]`. The `[DPS] data` lines are the E2E artifact.
- Live acceptance: launching Deadlock needs the user's consent. Fully restart after replacing pak11, open a match (`citadel_match_details <id>` in VConsole), check the Scoreboard screen and `console.log` for `[DPS]` lines and errors, and record the client build and the pak11 hash.
