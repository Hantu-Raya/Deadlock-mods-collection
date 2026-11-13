# Build the editor as tabbed pages in a fixed frame

Decided 2026-10-23 (the editor redesign; user-visible).

The editor is a tab strip (MATCH, TEAMS, PLAYERS, SOUL GRAPH, STYLE, SHARE / SAVE, DEV) over one fixed-height page area of 352 px, so the shell and the tabs never move while a page changes. The redesign was made by the m1 agent; the layout before it is not recorded. Per-game controls sit on MATCH; the destructive RESET TO DEFAULTS and FORGET SAVE moved to SHARE / SAVE, set apart; the hero picker replaces the page area while it is open.

Amended 2026-10-24: RESET left SHARE / SAVE for the header as two-step buttons (RESET ALL and RESET <page>, a second press within 4 s), as Observer HUD does; FORGET SAVE stays on SHARE / SAVE. The purchase notice time sits on DEV.

Cost: every control must fit a page of that height, so a new setting needs a page with room (or a new tab), and the dependent layout ids in `hud_escape_menu.xml`, `dlf_menu.css` and `dlf_menu.js` change together. The page list is `PAGES` in `dlf_menu.js`. Behaviour is in [SPEC.md](../../SPEC.md#esc-menu-editor). Not yet seen live.
