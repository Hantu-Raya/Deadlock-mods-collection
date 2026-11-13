# Port Observer HUD's post-game board; names from the DLF setup

Decided 2026-10-26 (the user: "I only want the scoreboard when the game is finished and the necessary stuff on it").

pak01 overrides `post_game/citadel_db_page_post_game_new.xml` and ships Observer HUD's Night Shift board as a port (`dlf_pg_loader.js`, `dlf_pg_board.js`, `dlf_pg_board.css`, `dlf/dlf_pg_board.xml`, `dlf/dlf_pg_column.xml`, five torn masks), as DLF already does with Observer HUD's purchase notices and urn icon. Board fixes are ported from `observer_hud/` (`pg_board.js`), whose live evidence (`observer_hud/ENGINE.md` "Post-game page") the port relies on.

The header and the player names come from the DLF setup: the HUD's editor (`dlf_menu.js`) hands team names, logos, season, match and aliases by account to the post-game page every 5 s on `ClientUI_FireOutput` (`DLFM1:`). Without a handoff (the game was restarted, or no DLF setup) the board shows the stock team names and the account names.

Not ported: Observer HUD's match cards, store v2 page, team suggestions and 2-day memory. Cost: a match opened after the setup moved on shows the current teams, and after a restart the header has the stock names. A shared board core composed at build time was the alternative; it was set aside for the smaller port.
