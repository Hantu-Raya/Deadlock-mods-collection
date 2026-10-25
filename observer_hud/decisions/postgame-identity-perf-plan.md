# Plan: post-game board in Observer HUD, account-keyed names, team names and logos, and a 90% runtime cut

Status: **phase 1 done** (2026-10-25); phases 2-5 are not built. This plan was debated with m2 (Claude Opus 5.5, medium effort) over two rounds, using two read-only scouts and the parent's DLL RE on client 6819. The probe pak ran twice the same day (results under [Probe results](#probe-results-2026-10-25-client-6819)) and was removed afterwards. All of it is in [`.scratch/oh_postgame/`](../../.scratch/oh_postgame/):
- `BRIEF.md`;
- `m2_round1.md`, `round2_from_parent.md`, `m2_round2.md`;
- `scout_perf.md`, `scout_identity.md`;
- RE dumps `f_*.txt`;
- probe logs `probe_run1_console.log`, `probe_run2_console.log`;
- `probe_p8_board.png`;
- the probe v2 page `store_v2/`.

## User request

1. Integrate the post-game stats board (`postgame_stats/`, pak11) into Observer HUD.
2. Custom player names keyed by the Steam account id, as in ShowRank Barebones.
3. Custom team names and team logos on the board.
4. A cut of about 90% in runtime cost, at low latency, with each part working only when it is needed.

## What decides the design (evidence)

- **Accounts on the post-game page:** `CitadelUserName#PlayerName.accountid` is readable on every row. All 12 ids were non-empty live on 2026-10-25 (`ns_board.js:192-193`). That is the post-game page's key.
- **No account binding in the HUD except the markers:** the top bar, tab scoreboard, kill feed and spectate bar carry only `{s:player_name}` (DLF, live 2026-10-16; `scout_identity.md`). The far-away markers are the only HUD panels with a `CitadelUserName` (`stock/hud_unit_indicators_v2.xml:11`), one `PlayerEntry` per player. **Resolved** (RE + P1): their `accountid` reads in spectator mode; see [Probe results](#probe-results-2026-10-25-client-6819).
- **Fallback for accounts:** DLF's PLAYERS-tab probe opens each unknown row's profile card and reads `{i:r:account_id}` (`dlf/docs/adr/0007-...`). It costs a tab switch and flashing cards, and its fast 0.03 s variant is not live-verified.
- **No native custom team names** (DLL RE): `citadel_team_name` in client.dll is a rich-text tag that renders `#Citadel_TeamN_Name` (fn `0x181b70430`, next to `citadel_persona` and `citadel_hero_name`). The match-end `team_name` follows the local player. deadlock-api has no team or lobby names. Team names and logos must come from the organiser.
- **Already in Observer HUD state:** team names, tags, logo URLs and the organiser (`SPEC.md` State). They are saved through the published `/oh/` store page: one key, 8192 characters (`D:/hpv2-store/oh/index.html:13,15`).
- **Where the cost is:** 83% of the 1155 calls/s while spectating is the world sampler, `oh_debuff_world.js` at 959/s: about 779/s for 12 hero bars at 4 Hz and about 180/s for 60 non-hero bars at 0.5 Hz. No stock layout has a JS event for statuses, shop rows or kill rows, so the world loop stays a poll that must get cheap. The board also polls every 0.15 s for the whole session (`ns_board.js:792-795`; about 140/s while visible, about 40/s hidden), outside every budget.

## Decisions

1. **One source lane, two outputs.**
   - The board's sources move into `observer_hud/panorama/**/pg_*`. pak10 includes the board, and `build_postgame_stats.ps1` keeps building a standalone pak11 from the same files.
   - Reason: pak10 ships spectator VData and is for observer PCs only, but every player can use the board. If both paks are installed, pak10 wins with identical files.
   - pak11 must work without the store; with no match card it shows stock names.
   - An ADR amends the override rule (`AGENTS.md:14`) for `post_game/citadel_db_page_post_game_new.xml`. ShowRank overrides `citadel_db_post_game_scoreboard_new.xml`, a different file, so they do not clash. The stock page is pinned in `observer_hud/stock/`.
2. **Identity in the HUD** (revised after P1).
   - **Accounts per side, no join needed:** each marker entry gives an account plus its side class (`team_1` = Amber, `team_2` = Sapphire). That is all a match card needs.
   - Read every entry, collapsed ones included, at most once a second while some account is still unknown, then stop. An entry starts at 0 and gets its account the first time the marker is set; it never switched accounts in either run.
   - The followed player in first person can stay 0. The post-game rows supply all 12 ids, so the ≥10 of 12 match still holds.
   - **Account to card (only needed for aliases)**, in order:
     1. The marker's name label equals the card's name.
     2. Elimination within a side: one unresolved card and one unresolved account.
     3. The DLF PLAYERS probe behind a "Learn accounts" button on the editor's PLAYERS page, on demand only.
   - Hero id cannot join them: `CitadelHeroImage` exposes no hero property to JS (P1b; the card's `CitadelHeroBadge` does).
   - Live, the marker label shows the Steam persona, not the card's in-game name. On demo 121685912 that was "Player 11", "candyland" and so on, so step 1 never matched there.
   - Bots read 0 and keep name-keyed session aliases.
3. **Aliases v2.**
   - `players: { "<account>": { a: alias, n: lastSeenName } }`, at most 24 entries.
   - The renderers stay name-matched: on each roster change the host derives `name -> alias`, so the world bars, markers and kill feed code do not change.
   - v1 name keys go into `legacy` and show as one-click "bind to <account>" chips; nothing is re-keyed silently.
   - A *pending* alias is one typed this session before its account was known. It binds automatically only on the same map load (host map generation).
4. **Team names and logos on the board.**
   - **Match card**, written by the HUD and keyed by the 12 account ids, with each side known by its ids. It is written once both sides are known and again at match end, and holds the team snapshot as it was, so a Bo3 keeps each map's names.
   - Lookup order:
     1. the card that matches at least 10 of the 12 ids;
     2. the learned registry (strict: at least 4 members, against at most 2 for the runner-up), offered as a suggestion only;
     3. stock names and patron wordmarks.
   - Custom logos get a class without `wash-color` or the speckle mask and replace the wordmark on `ImageLoaded`. On failure the wordmark stays.
   - **Inline editing on the board** is built last. Clicking a team name lets you edit the name, tag and logo URL. It writes a card for that match's accounts, carrying `match_id`, so a match nobody spectated (a recap made later) can be named. The header needs a deliberate hit target, because the board is `hittest="false"` today.
   - **Learned registry**: `team -> 12 most recent accounts`, learned from cards at match end. It never learns the sample default names (`SPEC.md:60`). In the HUD editor it only suggests ("use Night Owls?") and never applies silently.
5. **Store v2.**
   - A new `/oh/` page version with two keys: `state` and `matches`.
   - `matches` holds deduped teams (`t:[{n,g,l}]`) and matches (`m:[{a:[ids],b:[ids],t:[i,j],w,d,at,id}]`), about 160 characters per match. It has a 32 KB cap: the oldest matches are evicted first, then teams no match uses.
   - An upsert operation (`o:"u"`) merges one card inside the page, because the HUD and the dashboard each hold their own copy.
   - The v1 page stays for released paks. P7 showed the dashboard panel loads only https pages, so the v2 page is tested on an https probe path on hpv2-store first. **Testing and publishing both need the user's approval.**
   - The dashboard creates its hidden `CitadelHTMLPanel` only when the post-game page shows, reads once, then goes to `about:blank`. The header renders stock names first and swaps when the reply lands.
   - **Confirmed by P3:** the HUD's `ClientUI_FireOutput` reaches the post-game page in the same process. A match spectated in this session hands its card to the board directly, without the store. The store is needed only for older matches and after a restart.
6. **Performance: a weighted cut of 85-90%, without losing latency.**
   - **World sampler, hero bars** (signature confirmed by P5):
     - The 4 Hz poll reads the child count plus the first and last child identity, about 1 µs, and does the full read only on a change.
     - Every stun arrived as a new panel (25 of 25; never `stunned` on an existing panel), and no reorder, id change or visibility flip was seen.
     - Missed by the signature: stack changes (45) and radial jumps on a refresh (22). So stacks are read at 4 Hz only for `minStacks` rules, and radials at 4 Hz only for listed statuses on screen (`style.clip` read ≈ 0.65 µs).
     - No extrapolation: 32 of 56 status lifetimes were more than 5° off a straight line, up to 48° on Lash's ultimate.
   - **World sampler, non-hero bars:** stop after classifying them; recheck at 8 s or on a host wake.
   - **World sampler, gating:** no world work while the column is off or nobody is spectating. Today the column-off path still does `heroDialog` and `realName` (`oh_debuff_world.js:371`).
   - **Host:**
     - `place()` returns at once when its inputs are unchanged (`oh_host.js:692`).
     - No `IsValid` on panels just returned by `Children()` / `GetParent()`, or on our own panels.
     - Names and markers update only while aliases exist, at 4 s while stable; the kill feed's 0.25 s watch stays.
     - The config push runs on change plus a hello from each new bar.
     - The ult read drops to 1 Hz with extrapolation.
     - If P6 finds a spectate signal, the idle tick waits on it.
   - **Board:** driven by events (`CitadelMatchDetailsUpdated`, focus) with a 1 s check floor (about 11/s). It stops while the page is not shown, if there is a cheap signal for that. It scans once per match key.
   - **Feature off = zero operations**, for every feature.
   - **An honest metric:** `Children()` counts as 1+n and traversals count per node, and the 216/s subtree visits and the 491/s excluded counter hits are folded into the total. Each operation is weighted by its live per-call cost from P0. The weighted sum is budgeted, and raw calls are reported beside it.
   - **Live measurement:** a dev-only `[OH-PERF]` JS ms/min counter plus an A/B/B/A run of old against new pak10 on demo 121685912. VProfLite and the per-thread CPU sampler are optional.
   - **Targets:** about 115-130 weighted calls/s while spectating (from 1155), at most 150 while counting down (from 1497), at most 2 after spectating, at most 1 when never spectated, and 0 for a hidden board.
   - **Latency floors** (validator checks):

     | What | Floor |
     |---|---|
     | Status onset and refresh pulse | 0.25 s or less |
     | Seconds shown | within ±0.25 s |
     | Purchase notice | 0.5 s or less |
     | Cue | 1 s or less |
     | Kill-feed alias | 0.25 s or less |
     | Ult | 0.5 s or less |

## Probe results (2026-10-25, client 6819)

All runs were on demo 121685912 at `demo_gototick 70000`, then `citadel_match_details 121880956`. The probe pak10 (HUD and world contexts) and probe pak11 (dashboard) were removed afterwards.
- pak11 is back at `9A6058A0`.
- pak10 is not installed, as before the probe. The clean pak10 is built in `dist/`.

| # | Result | Decision |
|---|---|---|
| RE | The marker entry function (client fn `0x181c73ef0`) casts `PlayerName` to `CitadelUserName` and calls the same setter `0x181e329b0(panel, account, hero)` as the post-game populate (`0x181b63a90`). A non-zero account becomes a CSteamID via vtable `+0x2a8`; 0 takes the bot path (`+0x2a0`). The account comes from the player controller (`0x18170e530`). The marker hero is set through `0x181de8730`. | The markers carry real accounts. |
| P1 | 12 entries; 11 non-zero, unique, matching the match metadata exactly and in the server's player order. The 12th stayed 0: the player the camera followed. Side classes `team_1` / `team_2` matched the metadata teams. Labels show Steam personas ("Player N" placeholders and current names), not the cards' in-game names. | Markers are the passive account source. |
| P2 | Entries go from 0 to an account once, when first set; no entry changed between two accounts. | Cache per entry. |
| P1b | `CitadelHeroImage` JS keys are the generic panel set: no `heroid` / `heroID` / `heroname`. | No hero join. The host's existing marker fallback by `heroid` (`oh_host.js` markers) never matches live; fix it or drop it in phase 3. |
| P0 | ns per call (HUD, 20k loops): `IsValid` 50, `GetChildCount` 200, `.text` / `.visible` / `.id` / `actualuiscale_x` 200-250, `GetParent` 300-350, `GetChild` 350, `BHasClass` 350-450, `style.clip` read 600-650, `GetPositionWithinWindow` 800-1000, `$.Schedule` enqueue 1000, style write 1150, text write 750, `Children()` 42 kids 5.7-6.5 µs (≈ 140 ns per child), `FindChildTraverse` miss ≈ 10 ns per node (9594 nodes, 88-98 µs). | These are the weights for the metric. |
| P5 | See decision 6: stuns always come as new panels; the signature misses only stacks and refresh jumps; radials are not linear. | Signature poll plus per-rule reads. |
| P6 | None of `CitadelSpectatorTeamColorsChanged`, `CitadelSpectateMatchUpdate`, `CitadelCancelSpectate` or the camera events fired on entering or leaving the demo. The `.spec_mode` class flip was seen by the 1 s tick. | Keep one class read per second while idle (≈ 0.4 µs/s). |
| P4 | `CitadelMatchDetailsUpdated` arrives as an unhandled event with the match id 0.5 s after `citadel_match_details`. `CitadelPostGameSelectScreenIndex` reaches the page with the screen index (3 = Scoreboard). | The board becomes event-driven: build on the match event, replay the intro on screen index 3, plus a slow safety check. |
| P3 | The HUD's `ClientUI_FireOutput` reached the dashboard every 5 s, also after leaving the demo. Tops: `CitadelHudRoot` vs `CitadelDashboardRoot`. No `GameUI` in either context, so no root attribute or `CustomUIConfig` path. | Session handoff by event. |
| P7 | The dashboard `CitadelHTMLPanel` answers only https pages: `https://hantu-raya.github.io/hpv2-store/oh/` answered (hello 194 ms), while `http://localhost`, `http://127.0.0.1`, `file://` and `data:` never answered (the server saw no page request). With the user's approval, a temporary https page `oh/v2-probe/` with its own `v2probe` keys was published (hpv2-store `7238625`), tested, and removed (`d80c02a`; log `probe_run3_p7_console.log`). Results: first hello 554 ms, a second panel 126 ms, each op 3-16 ms. **HTMLTitle is cut at 4096 characters**: a 4000-character value read back intact (title 4081), 8000 and more arrived as a 4096-character title. An in-page upsert merged two writers in parallel (both cards kept), and a card with the same 12 accounts replaced the older one. | Store v2 never sends a reply longer than 4096 characters. The board asks the page for one card by its 12 accounts (`o:"q"`, a small reply) instead of reading the whole key; any whole-key read is paged. Writes stay one card per upsert. **Existing v1 bug:** the `/oh/` page advertises `m` 8192, so a saved state longer than about 4000 characters (logo URLs plus many aliases) saves but cannot be read back. Fix it in phase 4: lower the cap to fit the reply, or page the reads. |
| P8 | On the board, a PNG and an animated GIF loaded in 0.36-0.53 s from https (wikimedia) and from http 127.0.0.1. Both GIFs animated (frames differed 0.4 s apart; `probe_p8_board.png`). | Custom logos work on the board, GIF included; `Image` loading is not restricted like the HTML panel. |

**Honest cost picture (P0 × validator counts):** today's spectating mix is 1155 calls/s, worth about 0.4 ms of native call time per second. That breaks down as:

| Calls | Count / s | Time / s |
|---|---:|---:|
| Class reads | 257 | ≈ 115 µs |
| Schedules | 88 | ≈ 88 µs |
| `Children()` | 53 | ≈ 80 µs |
| Text reads | 150 | ≈ 38 µs |
| Parent reads | 87 | ≈ 30 µs |
| Style reads | 48 | ≈ 31 µs |
| `IsValid` | 447 | ≈ 22 µs |

That is about 0.04% of one core before JS execution and GC, which were not measured. The 90% cut is reachable on the weighted metric. Its live gain will not show in FPS; it removes work rather than frame time. The live A/B/B/A therefore measures JS ms/min (a dev `[OH-PERF]` counter), not FPS.

## Build phases (each one commit, suites and rebuild first)

1. **Performance, no feature change.** **Done 2026-10-25** (MAP changelog). It delivered the weighted metric, the P5 signature poll, sleeping world bars while not spectating, idle bars on a 4 s cap after a 30 s wake window with a respawn wake, and column off = 0. The `place()` skip and `IsValid` trim were dropped: they could not be made safe, and the poll dominated anyway.
   - *Acceptance as planned:* weighted budget down 85-90%, the VM latency checks above, and a live A/B/B/A run showing less JS time.
   - *Result:*
     - Playing with pak10 installed: −99 % (310.5 → 4.3 us/s).
     - Spectating: −40 % (361 → 216.2); counting down −43 % (483.8 → 274.3); −51 % with the DEV poll at 0.5 s.
     - The latency check `column: latency floors` is green, and a mutation of each new path failed it.
     - The 85-90 % target was not met at a 0.25 s onset, because 12 hero bars × 4 polls/s of `$.Schedule` (≈ 1 µs each) are the floor. That floor is about 0.2 ms/s in total.
     - The live run used counters, not an A/B: the totals, about 0.2-0.4 ms/s, sit far below the game's CPU noise, so an FPS or CPU A/B cannot resolve them.
2. **Merge with two outputs.** `pg_*` sources, ADR, Closure contracts (`accountid`, `heroid`, `heroimagestyle`, `PostGameGraphTooltip`, `DispatchPanelEvent`, `CitadelMatchDetailsUpdated`), the stock pin, and the event-driven board.
   - *Acceptance:* `verify-live.js` passes on 121917141 and 121880956 from both the pak10 and pak11 builds with ShowRank installed, and the board costs 11/s or less.
3. **Identity and aliases v2.** Marker accounts per side (passive), the name-then-elimination join, the PLAYERS button, pending aliases, chips, migration, and the dead marker `heroid` fallback removed.
   - *Acceptance:* VM checks for duplicate names, bots, persona labels that match no card, and map changes; aliases by account seen live.
4. **Session handoff, then store v2 and match cards.**
   - The HUD sends the match card to the board through `ClientUI_FireOutput` (P3).
   - The store v2 page is tested on an https probe path first (needs approval), then published with approval, for old matches and restarts.
   - The header swaps when a card arrives.
   - *Acceptance:* VM checks for an offline store, a late reply and two writers; live, a spectated match shows its team names and logos on the board, in the same session and after a restart.
5. **Learned registry and inline editing on the board.**
   - *Acceptance:* an old match edited on the board keeps its names after a restart.

## Other opportunities found (not scheduled)

- `citadel_show_account_ids` (client convar) shows account ids on player tooltips. It could be an operator aid in the docs, not a script source.
- `citadel_spec_lock_to_accountid` (hidden) proves that the engine maps accounts to players in spectator mode. A future RE pass could look for a script-visible path.
- deadlock-api `/v1/matches/active` gives `account_id` and team per player for live matches. That could give rosters before the match is spectated, but the 6/h `live/url` limit and network dependence make it a later option.
- The post-game team screen also has a `CitadelUserName` per player; its getter is unread live.

## Risks

- **Resolved:** the HUD account source. Markers give 11-12 accounts with sides, with no clicks.
- **New:** the account-to-card join for aliases has no hero key. On demos the persona labels match no card, so aliases there need elimination or the PLAYERS probe. Live, how often a persona equals the in-game name is not measured; it is the next live-match check.
- **Resolved:** stuns come as new panels, so the signature keeps a 0.25 s onset.
- **Store v2:** it needs an https host, so testing it and publishing it both need the user's approval. Without it, match cards still reach the board in the same session (P3); the board shows stock names after a restart or for older matches.
- Opening an old match that nobody spectated has no card until someone edits it on the board (phase 5).
