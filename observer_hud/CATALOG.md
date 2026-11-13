# Catalog: Observer HUD

Every file of the mod, what it does and what loads it. Line counts are from 2026-11-10 (0.3.2, pak10 with 52 assets).
Behaviour is in [SPEC.md](SPEC.md), status and changelog in [MAP.md](MAP.md), rules in [AGENTS.md](AGENTS.md).

## What ships in pak10

16 layouts, 14 scripts, 9 styles, 11 images and 2 VData files. `build_observer_hud.ps1` checks this exact list.

### Layouts that replace a stock file (`panorama/layout/`)

| File | Lines | What it is |
|---|---|---|
| `hud_spectate_bar.xml` | 72 | Stock spectate bar plus the includes that start the mod in the HUD: `oh_state`, `oh_heroes`, `oh_debuff_icons`, `oh_item_icons`, `oh_host`, `oh_menu`, `oh_debuffs`, `oh_buys`, `oh_link`, and `oh_host.css`. |
| `citadel_status_effect.xml` | 30 | Stock status-effect list plus `oh_debuff_world.js` and `oh_status_world.css`. Loads once per healthbar and per HUD status list. |
| `citadel_hud_data_feed_info.xml` | 56 | Stock kill-feed row plus `oh_feed.css`. |
| `citadel_db_page_private_lobby.xml` | 127 | Stock private-lobby page plus `oh_state`, `oh_heroes`, `oh_lobby` and `oh_lobby.css`. |
| `post_game/citadel_db_page_post_game_new.xml` | 97 | Stock post-game page plus `pg_loader.js`. |

### The mod's own layouts (`panorama/layout/observer_hud/`)

| File | Lines | What it is |
|---|---|---|
| `band.xml` | 124 | Header band (Night Desk and the Names strip). Loaded by `oh_host.js` after the stock `#TopBar`. |
| `tournament_bar.xml` | 56 | Team plates, bans, stage, soul graph, objective chips. Loaded by `oh_host.js` into `#TopBar`. |
| `debuffs.xml` | 17 | Status column, one per top-bar card. Loaded by `oh_host.js`; drawn by `oh_debuffs.js`; `#OHBuys` in it holds the purchase notices. |
| `urn.xml` | 10 | Urn carrier mark on a card. Loaded by `oh_host.js`. |
| `editor.xml` | 180 | Setup editor. Loaded by `oh_host.js` into the stock Escape menu; driven by `oh_menu.js`. |
| `debuff_relay.xml` | 6 | Empty panel that carries `oh_debuff_relay.js`. Created by `oh_debuff_world.js` beside each world list. |
| `lobby_setup.xml` | 59 | Setup block on the private-lobby page. Loaded by `oh_lobby.js`. |
| `lobby_share.xml` | 31 | Share and import card, opened from the setup block. Loaded by `oh_lobby.js`. |
| `lobby_alias.xml` | 17 | Alias button in a lobby player slot. Loaded by `oh_lobby.js`. |
| `pg_board.xml` | 109 | Post-game board; includes `oh_state`, `pg_board.js`, `pg_board.css`. Loaded by `pg_loader.js`. |
| `pg_column.xml` | 25 | One player column of the board. Loaded by `pg_board.js`. |

### Scripts (`panorama/scripts/observer_hud/`)

| File | Lines | Runs in | What it is |
|---|---|---|---|
| `oh_state.js` | 524 | HUD, lobby, board | `$.OHState`: the state shape, `normalize`, limits, choice lists, the share code. No engine calls at load. |
| `oh_host.js` | 2521 | HUD | `$.OHHost`, the only owner of the state. The 1 s tick: injects the layouts, draws plates, names, clock, graph, objective cues, series and match end; hands the stock panels back on leave. |
| `oh_menu.js` | 1079 | HUD | The editor (`$.OHMenuAttach`, `$.OHMenuOpen`, `$.OHMenuResetAll`): pages, pickers, the local save through the hosted page. |
| `oh_debuffs.js` | 612 | HUD | Status column: receives snapshots from the world bars and draws up to six statuses per card. |
| `oh_debuff_world.js` | 657 | each status list | World sampler: reads a hero healthbar's statuses and sends a snapshot when they change. Sleeps on non-hero bars and when nobody watches. |
| `oh_debuff_relay.js` | 26 | relay panel | Forwards a snapshot as a `ClientUI_FireOutput` event (a dialog panel does not hear its own). |
| `oh_buys.js` | 347 | HUD | Purchase notices on the buyer's card, read from the stock shop list. |
| `oh_link.js` | 216 | HUD | HUD end of the lobby link (`OHL1:` messages); applies the lobby's edits through `$.OHHost`. |
| `oh_lobby.js` | 951 | lobby page | Lobby setup: teams, bans, aliases, share and import before the match. |
| `pg_loader.js` | 45 | post-game page | Loads the board and puts the Play Again flame back. |
| `pg_board.js` | 1601 | board | Reads the stock post-game page and draws the Night Shift board. |
| `oh_heroes.js` | 48 | HUD, lobby | Generated: hero ids and names for the ban picker. |
| `oh_debuff_icons.js` | 69 | HUD | Generated: ability to icon path. |
| `oh_item_icons.js` | 198 | HUD | Generated: shop item name to icon path. |

The three generated files come from `scripts/refresh-stock.py`; do not edit them. The other eleven go through Closure in the build.

### Styles (`panorama/styles/observer_hud/`)

| File | Lines | What it is |
|---|---|---|
| `oh_host.css` | 29 | Hides and moves stock HUD parts while spectating. |
| `oh_band.css` | 925 | Header band, both looks. |
| `oh_bar.css` | 410 | Tournament bar: plates, bans, graph, objective chips. |
| `oh_debuffs.css` | 667 | Status column, urn mark and purchase notice. |
| `oh_status_world.css` | 15 | Hides the stun icon on hero world healthbars. |
| `oh_feed.css` | 11 | Kill-feed flame position. |
| `oh_editor.css` | 1017 | Setup editor. |
| `oh_lobby.css` | 754 | Lobby setup. |
| `pg_board.css` | 1362 | Post-game board. |

### Images and VData

- `panorama/images/observer_hud/buy_frame{2,3}_{l,m,r}.png`: purchase notice frame, from `scripts/make-notice-frame.py`.
- `panorama/images/observer_hud/torn_{head_l,head_r,graph,track,award}.png`: the board's torn-paper masks, from `scripts/make-torn-masks.py`.
- `scripts/abilities.vdata_c`, `scripts/modifiers.vdata_c`: built from the installed game on every build (ADR 0002). Not in the repo.

## What does not ship

| Path | What it is |
|---|---|
| `scripts/validate-observer-hud.js` | The validator: 6812 lines, 113 checks; runs the scripts in a fake Panorama on the pinned stock layouts. |
| `scripts/verify-postgame-live.js` | Compares the board's read of a real match with its metadata; writes `live/<id>-pak10-verify.json`. |
| `scripts/refresh-stock.py` | Refreshes `stock/`, `stock-pin.json` and the three generated scripts from GameTracking. |
| `scripts/apply-org.py`, `scripts/make-org-art.py` | Apply an organisation variant in the build; make its art. |
| `scripts/make-notice-frame.py`, `scripts/make-torn-masks.py` | Make the shipped images. |
| `stock/`, `stock-pin.json` | 13 pinned stock layouts the validator boots, and their hashes. |
| `orgs/` | Organisation variants (`notlynx`); built with `-Org <org>`. `source/` is git-ignored. |
| `live/` | Board verification results and the longest share code. |
| `shots/` | In-game screens (git-ignored). |
| `docs/adr/` | Ten decision records, 0001 to 0010. |
| `decisions/` | Design scoring, plans and the 2026-11-10 audit. |
| `designs/`, `tools/` | Design mockups and their asset and screenshot tools. |
| `promo/` | GameBanana page, gif and video sources. |
| `spike/` | The first injection spike. Kept for reference; nothing uses it. |
| `../build_observer_hud.ps1` | The build: validator on source, Closure, validator on the output, compile, pack, inventory check. |

## Cleanup pass, 2026-11-10

Looked for unused functions, variables, exports, CSS classes, keyframes, images, commented-out code, leftover debug
output and stray whitespace (TypeScript's unused-symbol check plus cross-file searches).

- Removed: the `OHCurve` class the host set on both team plates (no style rule read it) and its two validator lines; the unstyled `OHArchClipLeft` and `OHScoreL` classes in `band.xml`; four runs of doubled blank lines.
- Kept on purpose: `OHSelected` (no style; the validator reads it), `$.OHHost.graphPins` (validator only), the two `.NSColumn` and `.NSOrg` rule pairs in `pg_board.css` (layout and motion sections), every `$.Msg` line (all tagged `[OH...]`, all state changes or failures).
- Nothing else was unused: no dead function, variable, keyframe or image; no commented-out code.
- The validator's output was identical before and after.
