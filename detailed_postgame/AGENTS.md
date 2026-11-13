# Detailed Post Scoreboard Menu

## Scope and routing

- This lane owns pak11, a standalone post-game stats board on the stock post-game Scoreboard screen: exact stats per player, souls by source, final items, MVP/Key Player slips and the soul lead graph. It is for any player and ships no VData.
- It is a fork of Observer HUD's Night Shift board (`observer_hud/panorama/**/observer_hud/pg_*`, forked 2026-10-29 from commit 5b0c767). User decision 2026-10-29: take the board out as a separate mod. User decision 2026-11-13: the two boards are kept in sync both ways. Observer HUD keeps its own board in pak10; a change to shared board logic goes into both copies, and the later or better version wins.
- Removed from the fork: match cards (team names, logos, organiser), aliases, the hosted store page (`CitadelHTMLPanel`) and the `ClientUI_FireOutput` handoff listener, plus the `oh_state.js` dependency (`parseClock` is inlined). The header shows the stock team names, and each plate shows the Steam name.
- Intentional difference, user decision 2026-11-13: a credit + donate strip (`#NSCredit` in `pg_board.xml`, `.NSCredit*` in the css, `MOD_VERSION` / `CREDIT_TEXT` / `DONATE_URL` / `openDonate` / `creditSet` in `pg_board.js`; each marked STANDALONE ONLY): `DETAILED POSTGAME V<MOD_VERSION> BY HANTURAYA | DONATE` (Ko-fi, `ExternalBrowserGoToURL`) at the bottom centre, under the stock page-nav row. It stays out of Observer HUD, which has its own branding; do not sync it there. Bump `MOD_VERSION` for a release. Only `#NSCreditDonate` is hittable.
- Engine evidence and the board's live history are in `observer_hud/ENGINE.md` (Post-game page) and `observer_hud/LIVE-VERIFIED.md`. They were measured on pak10, not on this pak.

## Source boundaries

- Edit `detailed_postgame/panorama/`, `detailed_postgame/scripts/validate-detailed-postgame.js` and `build_detailed_postgame.ps1`. Never edit `_detailed_postgame_build/`, `dist/detailed_postgame/`, VPKs or archives. Of `observer_hud/`, edit only the board's own `pg_*` files and its validator, to keep the two boards in sync.
- Every pak path is under `detailed_postgame/`, so pak10's files are never mixed in. The only stock override is `post_game/citadel_db_page_post_game_new.xml`: the pinned stock page plus the `pg_loader.vjs_c` include, minus the Play Again flame `src` (the loader sets it with `SetMovie`). The validator checks it against `observer_hud/stock-pin.json`. When that pin moves, port the stock change here by hand.
- Only one pak can own that page. With pak01 (DLF) or pak10 (Observer HUD) also installed, their board shows (the lower pak number wins); `-Install` warns when an installed lower pak ships the page. ShowRank's `citadel_db_post_game_scoreboard_new.xml` does not clash with it.
- A board fix made in either fork is copied to the other in the same change (by hand, no tool does it). Only the team identity code (match cards, logos, organiser, aliases, `oh_state.js`) differs on purpose. Both validators must pass after a sync.

## Commands

```powershell
node detailed_postgame/scripts/validate-detailed-postgame.js
powershell -ExecutionPolicy Bypass -File build_detailed_postgame.ps1            # dist\detailed_postgame + dist\Detailed_Post_Scoreboard_Menu_<yy.MM.dd>.7z
powershell -ExecutionPolicy Bypass -File build_detailed_postgame.ps1 -Install   # also installs pak11 on this PC
```

- The validator runs the board in the same synthetic dashboard VM as Observer HUD's (copied, not shared) and writes `.tmp/detailed-postgame-validate.json`. It proves no rendering or CSS behaviour. `DPS_CHECK=<text>` runs only matching checks.
- The scripts ship unminified (no Closure step), so the validator tests the exact shipped source.

## Runtime rules

- Never write the stock graph tooltip's inline opacity: it beats the stock `.TooltipContainer` / `.TooltipVisible` rules, and the inherited inline `opacity: 1` kept the tooltip drawn after the mouse left the graph (user report 2026-10-29). The scan drops `TooltipVisible` after each synthetic hover and closes the last one with the column's stock `onmouseout`; off the Graphs screen a leftover `TooltipVisible` is removed. Evidence: `.scratch/m1_research/notes.md` (client.dll 6821 static RE, cross-checked with GPT-6 Astra).
- The header `#NSMatch` copies the match id with the stock `CitadelPostGameCopyMatchID()` dispatched from itself (its page callback copies the page's id). If that throws, the laid-out `#NSCopyEntry` TextEntry is the fallback. Live 2026-10-29: the stock route copied `121685912`.
- Never reparent stock scoreboard row children (fatal live). Restyle them in place and create own panels inside the rows through `pg_column.xml`.
- The board wakes on `CitadelMatchDetailsUpdated` and `CitadelPostGameSelectScreenIndex`, plus one check a second that reads only `PageVisible` while hidden (the `board:` budgets).
- Console lines use `[DPS]`. The `[DPS] data` lines are the E2E artifact.
- Live acceptance: launching Deadlock needs the user's consent. Fully restart after replacing pak11, open a match (`citadel_match_details <id>` in VConsole), check the Scoreboard screen and `console.log` for `[DPS]` lines and errors, and record the client build and the pak11 hash.
