# DLF observer HUD

## Scope and routing

- `dlf/` owns the pak01 spectator HUD for the DLF league: the Deadlock Observer Mod rebased on current stock, the broadcast banner and its ESC-menu editor, the top-bar soul lead graph, HPv2's top-bar pickup rings (composed at build time), ultimate cooldown counters, the top-bar debuff column, per-player purchase notices (Observer HUD's rewrite, `dlf_buys.js`; the recent-purchase feature was originally made by bytenode), the minimal pause box (`dlf_pause.js`), the post-game board (Observer HUD's Night Shift board, ported: `dlf_pg_*`, [ADR 0009](docs/adr/0009-post-game-board-ported-from-observer-hud.md)), and a spectator `abilities.vdata_c` + `modifiers.vdata_c`.
- It is installed on the observer PC only and does not need HPv2's pak02. pak01 is also written by other wrappers in this repo (Poker); treat the outputs as mutually exclusive. pak01 outranks the `abilities/` paks (pak02-05) and Observer HUD's pak10, so with DLF installed their item filters and spectator VData do not apply on that PC. DLF no longer overrides the shop layout (2026-10-24); it still overrides the shop stylesheet to hide the shop's own recent-purchases panel.
- Read [CONTEXT.md](CONTEXT.md) for terms, [SPEC.md](SPEC.md) for behavior, [MAP.md](MAP.md) for status and the changelog, [design.md](design.md) for the source map, the banner, card and graph geometry and the VData and pickup build contract, [ENGINE.md](ENGINE.md) for engine evidence and [LIVE-VERIFIED.md](LIVE-VERIFIED.md) before any live claim. Decisions live in [docs/adr/](docs/adr/). Source and `build_dlf.ps1` win over every document; if they disagree, fix the document.
- Observer HUD (`observer_hud/`) shares `spectator-status.json` and `scripts/spectator_status.py`. A change to the spec changes both packs.

## Source boundaries

- Edit `dlf/` source, `build_dlf.ps1`, `match.json`, `spectator-status.json` and the page under `D:/hpv2-store/dlf/`.
- Generated at stage time, never copied into `dlf/panorama`: `dlf_match.js` (from `match.json`, `scripts/write-match.js`), and `pickup_timers.js`, `pickup_bridge.js`, `pickup_config.js` (`scripts/compose-pickups.js` from HPv2). When HPv2's pickup sources change, review the diff, run `node dlf/scripts/compose-pickups.js --pin`, rerun the validator.
- Generated but committed: `dlf_heroes.js`, `dlf_debuff_icons.js`, `dlf_status_css.js` and the `MOD_ICONS` block of `qollock/ql_recent_purchases_data.js`. `py dlf/scripts/refresh-stock.py` regenerates them, refreshes `styles/base/*.css`, re-pins `stock-pin.json`. On `REBASE NEEDED`, diff the pinned and current GameTracking file, port the change by hand into the stock-based layout or CSS, then run `refresh-stock.py --accept`.
- `styles/base/*.css` are verbatim stock; never edit them. `scripts/qollock/*` and `scripts/observer/*` come from the decompiled observer mod; `observer_core.js` adds a SoulsValue fallback because stock 6757+ binds top-bar gold as `{s:gold}`. The QOLLOCK timers (`ql_feat_urntimer.js`, `ql_feat_rejuvtimers.js`) keep their panels but take their data from Observer HUD's live evidence (rift only from its 20 s warning, [ADR 0008](docs/adr/0008-no-rift-estimate.md); bridge UP until taken; mid-boss from the stock label). Observer HUD (`observer_hud/`) is where these mechanisms were proven; port fixes from it rather than from QOLLOCK.
- Never edit `_dlf_build/`, `dist/`, VPKs or release archives. The spectator VData is rebuilt from the installed game on every build: rebuild and reinstall after every Deadlock patch; a renamed ability or modifier fails the build.
- `scripts/export-banner-art.py` re-exports the banner art from the PSD (`G:\NEW HUD 3 ban.psd` since 2026-10-28; `G:\NEW HUD(1).psd` before); ordinary work does not touch it. After a re-export run `py dlf/scripts/make-two-ban-banner.py` (the two-ban art, `dlf_banner_2ban.png`). The validator's "banner art" checks fail when the ban portraits or team-name bands in `dlf_banner.css` do not match the exported art, or when the two-ban art differs from it anywhere but the inner boxes.

## Commands

```powershell
node dlf/scripts/validate-dlf.js
node dlf/scripts/compose-pickups.js --pin
py dlf/scripts/refresh-stock.py
powershell -ExecutionPolicy Bypass -File build_dlf.ps1                      # dist\dlf + dist\DLF_Observer_Mod_<yy.MM.dd>.7z
powershell -ExecutionPolicy Bypass -File build_dlf.ps1 -MatchFile my.json   # another match
powershell -ExecutionPolicy Bypass -File build_dlf.ps1 -Deploy              # also install pak01 and the fonts on this PC
```

- The validator boots the real layouts and scripts in the Panorama VM (banner, composed pickup runtime, debuff sampler, soul graph, the ESC menu against the real `/dlf/` page behind a fake CEF panel) and writes `.tmp/dlf-validate.json`. `DLF_CHECK=<text>` runs only matching checks (for example `steady-state`); `DLF_SOURCE_ROOT=<copy of dlf>` runs them against another tree (old-vs-new budgets); `DLF_RUNTIME_ROOT=<staged panorama dir>` runs every VM scenario on the built scripts; `DLF_STORE_PAGE` points at another page file. It proves no rendering, CSS behavior or engine timing.
- The build validates the spec against the installed game's VData (with `--localization`), runs Closure ADVANCED, reruns the validator on the minified stage, compiles, checks the exact pak01 inventory, re-verifies the packed VData and writes the release 7z (root `game\`: pak01 and three fonts, no `gameinfo.gi`, [ADR 0006](docs/adr/0006-release-archive-without-gameinfo.md)). `-Deploy` copies pak01 into `citadel/addons` and the fonts into `citadel/panorama/fonts` and checks the hash; it never touches `gameinfo.gi`.
- Builds can hang or return -1: run them through bash, not the Python kernel, and check the outputs.
- When a build misbehaves, read `citadel/console.log` for `[Panorama] ***** Parsing error` and `FATAL ERROR` first.

## Runtime and test rules

- All state goes through `$.DLFState.normalize`, which falls back field by field to the `match.json` defaults; `write-match.js` is the strict build-time check of the same schema. Every HUD-root attribute goes through `$.DLFState.hudAttrs(context)` (`read`, `changed`, `write`): the single reader, one cached root and last raw value per attribute. Do not add another root walk or JSON-attribute parser. `$.DLFState.valid` is the shared `IsValid` guard.
- Write on change: banner, ult counter, soul graph and debuff slots write text, styles, images and classes only when the value changes; steady state writes nothing (validator-checked). Never script opacity for the debuff fade; it is a CSS keyframe animation.
- One loop and one listener per context. A reload stops the previous instance (`context.DLFBannerStop`, `DLFDebuffsStop`, `DLFDebuffStop`, `DLFSoulGraphStop`, `DLFNamesStop`). `pickup_host.js` owns the world context's single `ClientUI_FireOutput` listener. Player aliases outside the banner travel by in-game name on `dlf_aliases` (written by the banner only); a stock label that shows an alias is unbound, so the in-game name always comes from a hidden label of ours bound to the same variable.
- Budgets (validator, synthetic native-call counts per second, not FPS; re-measure before raising a ceiling):

  | Check | Now | Ceiling | Note |
  |---|---|---|---|
  | banner, steady state | 76.6 | 80 | one `steady-state` check, no text or style writes |
  | debuff column + twelve world bars | 1207.5 | 1250 | 0.25 s default poll; the stun class is read once per panel; six slots per card (2026-10-24); the first slot of each card is validity-checked every tick (hero swap rebuilds) |
  | soul graph while shown | 26.4 | 40 | its own check, "soul graph: ... stays cheap" (looks for `#UrnSpawnTimer` while QOLLOCK has not made it) |
  | purchase notices, idle | 5.0 | 6 | its own check, "purchase notices: ..." (the QOLLOCK copy walked the whole list every 0.2 s); includes the empty kill feed's 1 s look (2026-10-24) |
  | post-game board shown | 9.0 | 12 | "board: cheap while ..." (one 1 s check reading the first row's bound label; 2026-10-26) |
  | post-game board hidden | 6.0 | 8 | same check; a hidden page reads only `PageVisible` |

- Post-game board: ported from `observer_hud/panorama/scripts/observer_hud/pg_board.js` (port board fixes from there). Never reparent stock scoreboard row children (fatal live). Its header names come only from the `DLFM1:` handoff that `dlf_menu.js` sends; keep the handoff to the normalized fields the board shows.
- Objective timers live in QOLLOCK's decompiled `ql_feat_rejuvtimers.js` / `ql_feat_urntimer.js` (not minified). Their show windows come from `state.cues` through `QOL.dlfCues` (`observer_core.js`, one reader of `dlf_match_state`, read once per game second); a hidden timer gets `.DLFCueHidden` or `visible = false`, never a style clear. The defaults must keep the bridge, mid-boss and rift timers always on. AUTO SERIES lives in `dlf_menu.js` (the menu owns the match state).

- The validator models the live visibility quirk (observer_hud/ENGINE.md, client 6813) in every check: a panel whose inline `visibility` goes `collapse` then null fails it, because live it stays hidden. Write `visible` / `collapse`, or toggle a class.
- Relays: world to HUD messages leave through a sibling relay, never from the `ClientUIDialogPanel` itself. A bar with no debuff never creates a relay. Message names carry the `DLF_` prefix so an installed HPv2 pak02 can neither feed nor configure DLF. Hero bars do one `Children()` read per sample (the validator counts them).
- The spec is the allow-list: `RULES` in `dlf_debuff_world.js` and the stun-hiding CSS must equal `spectator-status.json` (the validator compares them). A new listed modifier with no English name goes in `unnamed`; the build fails otherwise.
- CSS: keep selectors short. A 17-`:not(#id)` selector crashed the game at start ([ENGINE.md](ENGINE.md#world-status-panels)). World healthbars never show stun icons; that rule lives only in `dlf_status_world.css`, which only `citadel_status_effect.xml` may include. Only `.DLFPlayerName` uses `white-space: nowrap`. Never rename the top-bar `.AlwaysPlayerName` labels; debuff matching reads them. `#DLFMenuBackdrop` (a Button) stays the first child of `#DLFMenuRoot`.
- Closure ADVANCED (ES2020 out, `scripts/hp-colors-rewrite-closure.ps1`, pinned `google-closure-compiler@20261011.0.0`; npm's 20261020 fails to install): property names survive only when the source writes `key:` or `.key`, so exported APIs use explicit `foo: foo` keys, never shorthand. A new runtime script needs an entry in `$closureScripts` and an output contract (the runtime names its minified output must still contain) in `Get-HpColorsRewriteClosureContract`; data tables read as `var DLF_*` globals stay unminified.
- Console prefixes: `[DLF]`, `[DLF-DB]` (debuffs, STATUS LOG), `[DLF-MENU]`, `[DLF-GRAPH]`, `[DLF-ULT]`, `[DLF-PU]`, `[DLF-BUY]` (purchase notices: `match id|name|none` once per path), `[DLF-NAMES]` (aliases on markers and kill feed), `[NS]` (the post-game board, kept as Observer HUD's so `observer_hud/scripts/verify-postgame-live.js` reads its `[NS] data` lines). Logo URLs are never logged. STATUS LOG is diagnostics; leave it OFF for broadcasts.
- Tests reuse the real scripts and layouts; assert shown effects, not source text. Each new feature adds a validator check for its failure mode.

## Storage and hosted page

- Saving follows the `/dlf/` page contract in [SPEC.md](SPEC.md#save-and-share) and [ADR 0001](docs/adr/0001-save-through-hpv2-store-dlf-page.md): hidden `CitadelHTMLPanel#DLFStore`, one key `hantu.dlf.v1/match`, version 1, reply prefix `DLFS1:`. The page must never touch the HP Colors or Buff Timer keys. A format change bumps `VERSION` in the page and `STORE_VERSION` in `dlf_menu.js` together; additive ops (like `d`) do not.
- Pushing the page publishes it (Pages cache up to 10 minutes) and needs the user's go-ahead. Check the live page with `curl -s https://hantu-raya.github.io/hpv2-store/dlf/ | diff --strip-trailing-cr - D:/hpv2-store/dlf/index.html`.

## Debug and live acceptance

- Never launch Deadlock, deploy pak01 or run a live probe without the user's go-ahead. Restart the game after every pak or font replacement. pak01 conflicts with the other pak01 outputs (DLF, Poker); check what is installed first.
- Record the client version and the installed pak01 hash with every live observation, and update [LIVE-VERIFIED.md](LIVE-VERIFIED.md); do not promote VM or build evidence to live evidence. The installed pak01 and its hash are recorded in [MAP.md](MAP.md#status).
- To see which modifier an ability really applies, use `cl_modifier_dump <entity index>`. Never `cl_modifier_dump_visible` (it crashes the client). The smoke scenarios and open live checks are in [LIVE-VERIFIED.md](LIVE-VERIFIED.md#not-yet-live-verified).
- Read the game's `console.log` for `Parsing error`, `FATAL` and `Uncaught` after any CSS or layout change.
