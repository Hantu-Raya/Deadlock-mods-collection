# Plan: the post-game scoreboard in DLF (pak01)

Status: implemented 2026-10-26 (validator 128 checks, pak01 `e8feea06`); installed and seen live the same day on match 121685912 (board, handoff names, E2E PASS). Logos, aliases, the entrance and hover are still to be seen (LIVE-VERIFIED.md).

## Goal

When a game is finished, DLF's post-game Scoreboard screen becomes Observer HUD's board, with only what the board itself needs:

- the header: team names, result, net worth, kills, game time and match id;
- 12 player columns: exact stats with the best value marked, the MVP / Key Player slips, souls by source and final items;
- the soul lead line with the lane objectives;
- the entrance that never pops, the item-hover fix and the torn header.

Not included: Observer HUD's match cards, the store v2 page, team suggestions and the 2-day memory.

## How

- **Code:** ported into `dlf/` (DLF's convention: Observer HUD features are ported, as with the purchase notices and the urn icon). Files:
  - `post_game/citadel_db_page_post_game_new.xml` (the pinned stock page plus the loader);
  - `dlf_pg_loader.js`, `dlf_pg_board.js`, `dlf_pg_board.css`, `dlf/pg_board.xml`, `dlf/pg_column.xml`;
  - the five torn masks under `images/dlf/`.
  The source commit is recorded, so later board fixes can be ported from Observer HUD.
- **Header names:** from the DLF setup in the same session. The DLF HUD (`dlf_menu.js`, which owns the match state) sends the team names, logos and player aliases (already by Steam account) to the board every 5 s on `ClientUI_FireOutput` (`DLFM1:`). Amber is post-game Team 1. Without a handoff (game restarted, or a match opened with no DLF setup), the header shows the stock team names and the plates show the account names. There is no store read, so the `/dlf/` page does not change.
- **Removed from the port:** the match-card code, the hidden store panel, `oh_state.js` (the board needs only a clock parser and the logo URL helpers, which `dlf_state.js` already has).

## Steps

1. **Port the board:** copy the board, strip the match cards and store, read the identity from the `DLFM1:` handoff, and use `$.DLFState` helpers (`logoSources`, `cleanUrl`, `valid`). Console prefix `[NS]` (kept from Observer HUD so `verify-postgame-live.js` reads the `data` lines unchanged).
2. **HUD side:** `dlf_menu.js` sends `DLFM1:{ names, logos, aliases }` every 5 s while the HUD runs. Only cleaned values are sent; logo URLs are never logged.
3. **Build:** `build_dlf.ps1`:
   - pin the stock post-game page in `dlf/stock-pin.json` and track it in `refresh-stock.py`;
   - add the layouts, scripts, CSS and five masks to `$assets` and the exact pak01 inventory;
   - add `$closureScripts` entries and output contracts for the loader and the board.
4. **Validator:** port Observer HUD's board world and the checks that apply into `validate-dlf.js`:
   - builds once per match, rebuilds for the next match on reused rows;
   - cheap while hidden;
   - the scan with a totals row a few souls off, the tooltip never drawn while it runs;
   - the lead line; item hover; the entrance with no flash; a reload keeps one loop.
   DLF-specific checks:
   - the handoff names the header, Amber is Team 1;
   - aliases by account on the plates;
   - forged or oversized handoffs change nothing;
   - no handoff gives the stock names.
   New budget rows for the board, shown and hidden.
5. **Docs:**
   - SPEC: a "Post-game board" section.
   - design.md: the source map.
   - AGENTS: the board files and the prefix.
   - An ADR: the board in pak01, ported from Observer HUD.
   - MAP changelog and LIVE-VERIFIED rows.
6. **Live (with your go-ahead):** `build_dlf.ps1 -Deploy`, then `citadel_match_details 121685912`. `observer_hud/scripts/verify-postgame-live.js <metadata> - pak01` must PASS. Screenshots of the header with DLF team names and logos, the aliases, the entrance and item hover. Record the client build and the pak01 hash.
7. **Release:** the DLF 7z as usual. With both Observer HUD (pak10) and DLF (pak01) installed, pak01's page wins; the two are already documented as not used together.

## Risks

- The page override and paths must match Observer HUD's exactly for its live-proven behaviour (tooltips, reused rows, hover, entrance) to carry over; the DLF live E2E re-proves it.
- The handoff reaches the post-game page only in the same game session, as Observer HUD's did live; after a restart the header falls back to the stock names.
