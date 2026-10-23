# Observer HUD

## Scope and routing

- This lane owns the pak10 observer HUD for community tournaments: two top bar looks (Base Game+ Names, Night Desk), an Escape-menu editor, objective cues and the ability status column. It is for observer PCs only: the pak ships modified ability and modifier VData.
- Read [CONTEXT.md](CONTEXT.md) for terms, [SPEC.md](SPEC.md) for behavior, [MAP.md](MAP.md) for status, remaining checks and the changelog. Decisions live in [docs/adr/](docs/adr/); engine evidence in [ENGINE.md](ENGINE.md); native acceptance in [LIVE-VERIFIED.md](LIVE-VERIFIED.md).
- [README.md](README.md) is the human-facing page, [PLAN.md](PLAN.md) the design history and failure list, [decisions/](decisions/) the spike, objective timer and design notes. Mockups (`designs/`, `tools/`) and the throwaway spike (`spike/`) are not shipped.
- The status column shares `dlf/spectator-status.json` and `dlf/scripts/spectator_status.py` with DLF. Read `dlf/AGENTS.md` runtime rules before changing the sampler or the column.

## Source boundaries

- Edit `observer_hud/panorama/`, `scripts/validate-observer-hud.js`, `scripts/refresh-stock.py` and `build_observer_hud.ps1`. Never edit `_observer_hud_build/`, `dist/observer_hud/`, VPKs or archives.
- Generated: `panorama/scripts/observer_hud/oh_heroes.js`, `oh_debuff_icons.js` and `oh_item_icons.js` (`py observer_hud/scripts/refresh-stock.py`). `stock/*.xml` and `stock-pin.json` are verbatim pinned GameTracking inputs. When the script reports `REBASE NEEDED` for an override, port the stock change by hand, then run it with `--accept`.
- pak10 overrides only `hud_spectate_bar.xml`, `citadel_status_effect.xml` and the two VData files `scripts/abilities.vdata_c` and `modifiers.vdata_c`. Everything else is loaded by the host with `BLoadLayout` into panels it creates (`OHBandHost`, `OHBar`, `OHDebuffsHost`, `OHMenuHost`); purchase notices read the stock shop list without overriding the shop layout. Do not override `citadel_hud_top_bar*.xml`, `hud_escape_menu.xml` or `unit_status_overlay_v2.xml` ([ADR 0001](docs/adr/0001-inject-from-hud-spectate-bar.md)); that keeps the mod beside HP Colors, ShowRank, QOLLOCK and Top Bar Plus.
- The pak slot is pak10 (other slots in use: 01-08, 80, 81, 86, 89, 96-99; PLAN.md). Check for collisions before installing next to another mod.
- The VData is rebuilt from the installed game on every build. Rebuild and re-release after every Deadlock patch; a renamed ability fails the build. pak10 loses those two files to any lower-numbered pak that also ships them ([ADR 0002](docs/adr/0002-spectator-vdata-in-one-pak.md)).

## Commands

```powershell
node observer_hud/scripts/validate-observer-hud.js
powershell -ExecutionPolicy Bypass -File build_observer_hud.ps1            # dist\observer_hud + dist\Observer_HUD_<yy.MM.dd>.7z
powershell -ExecutionPolicy Bypass -File build_observer_hud.ps1 -Install   # also installs pak10 on this PC
py observer_hud/scripts/refresh-stock.py                                   # --check / --accept
```

- `build_observer_hud.ps1 -GamePak <pak01_dir.vpk>` picks the game pak the VData baseline comes from (default: the installed game). The compiler step has a 300 s timeout and the build checks the required outputs.

- The validator boots the host in the pinned stock `hud.xml` with the stock top bar, team and player layouts and the stock Escape menu (once more with HP Colors v3's), drives the editor, runs the world sampler in stock overlay contexts, and checks the steady-state budgets. It writes `.tmp/observer-hud-validate.json`. It proves no rendering or CSS behaviour.
- `OH_CHECK=<text>` runs only matching checks. `OH_RUNTIME_ROOT=<staged panorama>` runs the VM scenarios on the Closure output (the build does this). `OH_STORE_PAGE=<path>` overrides the hosted save page source.
- The build runs the validator twice (source, then Closure output), packs, checks the exact pak inventory and re-verifies the packed VData. `-Install` backs up the old pak10 and checks the hash.

## Runtime and test rules

- State: `$.OHHost` is the only owner. The editor changes it through `setState`; readers use `getState()`, compare `version()` or `onChange`. Every value goes through `$.OHState.normalize`; too-long text is rejected, never cut.
- Re-inject from the 1 s host tick (`#TopBar`, cards and the Escape menu are rebuilt); outside spectating the tick only checks the HUD classes, and the stock panels are given back once per leave. Write styles, texts, classes and hero ids only on change, cache before panel. Steady state: zero writes. Budgets (synthetic native calls per second, `validate-observer-hud.js`): 1130 spectating, 1465 with every card counting down, 15 after spectating, 12 never spectated. Raise only after re-measuring.
- Aliases leave the band only while spectating: world healthbar `#name` (through `OH_DEBUFF_CONFIG`, real name from the bound `#OHRealName`) and the stock far-away markers (`#unit_indicators_v2`). Never leave an alias behind: a stock label that was written gets its own text back (`{s:name}` or the marker's real name).
- Cards: the host owns the card registry (`$.OHHost.cards()`, `[]` while not spectating; `cardsVersion()` moves on any change). The status column reads it and never walks the top bar; the team mapping is one table, `$.OHState.TEAM_PANELS`. Stock team panels and `#PlayersContainer` are cached in `UI.stock` (cleared on a new `#TopBar`).
- Closure ADVANCED keeps a property name only when it is written as `key:` or `.key` somewhere. Export cross-file APIs with explicit keys, never shorthand. Each runtime script needs an output contract in `scripts/hp-colors-rewrite-closure.ps1`. The generated data tables are not minified.
- CSS: keep selectors short in `oh_status_world.css` (a long one failed the whole healthbar layout in DLF). Band labels use `width: fit-children` plus ellipsis and a host `max-width`, never `text-overflow: shrink`. Write the blur out (`world-blur: gaussian(2,2,2)`) where `citadel_base_styles` is not loaded. Details and evidence: [ENGINE.md](ENGINE.md#panorama-styling-behaviour).
- Logos: one `Image` per URL, shown only after its own `ImageLoaded`; URLs pass `$.OHState.cleanUrl`. A failed or replaced image is deleted and the monogram stays.
- Toggle collapsed panels with `visible` / `collapse`, not `null` (live 2026-10-22, editor entry). Own panels hidden while a stock panel is missing use the `OHGone` class; the validator fails any check in which a panel's inline visibility goes `collapse` then null.
- Prefix console output with `[OH]`, `[OH-MENU]` or `[OH-DB]`. Never log logo URLs.
- Keep `RULES` in `oh_debuff_world.js` equal to `dlf/spectator-status.json`; the validator compares them. Each new feature adds a validator check for its failure mode ([PLAN.md](PLAN.md) "How it can fail").

## Storage and hosted page

- Follow the [local save contract](SPEC.md#local-save): hidden `CitadelHTMLPanel#OHStore`, fragment in and `HTMLTitle` out, reply prefix `OHS1:`, key `hantu.observer_hud.v1/state`, record `OHS1.<fnv1a32>.<{s:1,state}>`, cap `m` 8192. Never touch the HP Colors, Buff Timer or DLF keys.
- The hosted source is `D:/hpv2-store/oh/index.html` (repo `Hantu-Raya/hpv2-store`), outside pak10. Never push, publish or upload the GameBanana page or the release archive without explicit user approval; the validator's fake CEF panel does not prove served bytes.
- The public version is `VERSION` in `oh_menu.js` (0.1.0). Record each release in the [MAP changelog](MAP.md#changelog).

## Debug and live acceptance

- Only the user or an agent with current user consent may launch Deadlock or install a pak for testing. The test source is demo 121685912 (`playdemo 121685912`, then `demo_gototick 70000`); the HUD carries `.spec_mode.replay_playback.TeamSpectator`.
- Fully restart Deadlock after a pak10 replacement. Record the client build and the installed pak10 hash with every live result, and add it to [LIVE-VERIFIED.md](LIVE-VERIFIED.md) without promoting VM or build evidence to live evidence.
- Check actual behavior in the game and `console.log` for `[OH` lines and errors; retain representative screens in `shots/live/`. A temporary probe pak is removed afterwards and the release rebuilt, as in [decisions/objective-timers.md](decisions/objective-timers.md).
