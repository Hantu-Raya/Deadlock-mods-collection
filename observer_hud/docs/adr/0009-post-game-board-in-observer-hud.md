# The post-game board ships only in pak10

The Night Shift post-game board (formerly `postgame_stats/`, pak11) lives in Observer HUD as `panorama/**/observer_hud/pg_*` plus an override of the stock post-game page, `post_game/citadel_db_page_post_game_new.xml`. pak10 ships it with the HUD. There is no standalone pak11: the user wants one observer mod with the board merged in (2026-10-25). The plan's first draft of two outputs was dropped, and `build_postgame_stats.ps1` and `postgame_stats/` were removed.

This amends the override rule of [ADR 0001](0001-inject-from-hud-spectate-bar.md). The board cannot be injected from the HUD, because the post-game page runs in the dashboard, a separate Panorama context with its own root (`CitadelDashboardRoot`). The only way in is a script include in the page layout. The override is the pinned stock page (GameTracking, `stock-pin.json`) with two changes:

1. the `pg_loader.js` include;
2. the Play Again flame video's `src` is removed. The compiler rejects `file://{resources}/videos/...`, so the loader sets it again with `SetMovie`.

The validator checks that the override equals the pin plus those two changes, and `refresh-stock.py` reports `REBASE NEEDED` when the stock page moves.

Consequences:

- The board needs pak10, which ships spectator VData and is meant for observer PCs ([ADR 0002](0002-spectator-vdata-in-one-pak.md)).
- Do not override other post-game layouts. ShowRank overrides `post_game/citadel_db_post_game_scoreboard_new.xml`, the scoreboard rows inside this page, so the two do not clash on a file. The first live run (2026-10-25) had ShowRank Barebones installed.
- Only one pak can own the page. A mod that also overrides `citadel_db_page_post_game_new.xml` conflicts with pak10. The old pak11 must be removed when pak10 is installed.
- The board wakes on `CitadelMatchDetailsUpdated` (unhandled) and `CitadelPostGameSelectScreenIndex` (a page event). It also runs one check a second, which reads only `PageVisible` while the page is hidden. Live, reopening a match that was already loaded brought no event (budgets in the validator).

Sources: [decisions/postgame-identity-perf-plan.md](../../decisions/postgame-identity-perf-plan.md) decisions 1 and 6, probe P4; [ENGINE.md](../../ENGINE.md#post-game-page); [SPEC.md](../../SPEC.md#post-game-board).
