# Repository Guidelines

## Project Overview

`poker/` implements Poker and Bluff Deck inside Deadlock's ESC menu. It has no game server. Both minigames synchronize through stock team/party chat: one Panorama context submits commands, and a second context observes chat rows and republishes structured events.

Edit source only. Do not hand-edit `poker_compiled/`, staged pak trees, `pak01_dir.vpk`, `.7z` archives, or compiled `.vjs_c`/`.vxml_c`/`.vcss_c`/`.vtex_c` assets.

## Architecture & Data Flow

```text
ESC-menu UI
  -> poker_escape_menu.js submits canonical chat command
  -> stock #ChatInput / party chat
  -> poker_chat_debug.js observes #ChatMessages
  -> ClientUI_FireOutput JSON event
  -> command reducer / PokerEngine / BluffDeckEngine
  -> scheduled render projection
```

- `panorama/layout/hud_escape_menu.xml` defines the picker, Poker surfaces, Bluff Deck surfaces, stable panel IDs, and global `onactivate` handlers.
- `panorama/layout/chat.xml` hooks the stock chat context and loads `poker_chat_debug.js`.
- `panorama/scripts/poker_escape_menu.js` owns UI state, party lifecycle, ready seats, command routing, Poker and Bluff Deck engines, progress/resume transfer, and rendering.
- `panorama/scripts/poker_chat_debug.js` polls stock chat rows, stabilizes sender/channel/content, retains snapshots in `GameUI.CustomUIConfig()`, and dispatches bridge events.
- Chat rows are authoritative. Local button clicks submit intent; reducers apply state only from accepted canonical rows, except documented fire-and-forget local teardown after the bridge accepts an idle-lobby leave.
- Unknown senders never receive authority. Delay authority-bearing rows until sender stabilization or resolve them only from an already-established party/session/progress authority.
- Session IDs, member epochs, ready generations, row sequences, intent nonces, progress IDs/checksums, and game seeds are protocol boundaries. Reject stale or mismatched values.
- `RenderScheduler` coalesces rendering. `$.Schedule` delays are in seconds; recurring work uses generation or token guards.

### Lifecycle invariants

- Never grant party or resume authority to `<unknown>`.
- An unknown non-self join/leave row waits for sender stabilization and dispatches once.
- After a valid leave, a stale row from the old party must not clear or mutate a newly hosted party.
- Closing an idle hosted Poker lobby submits the canonical party leave and clears local idle state immediately. Active-hand departure remains chat-authoritative.
- Leaving an inactive Bluff Deck lobby releases only the matching pending chat intent, returns to the picker, and clears Bluff state/history/ready/resume data. Active Bluff departure stays synchronized through its reducer.
- During an active Poker or Bluff match, BACK may expose the picker, but the other game remains disabled. Returning to the active game preserves all state.
- Switching games after a completed match uses the existing leave/end protocol and warns that the finished table state will be abandoned.
- Hosted progress import must finish sharing its offer and chunks before the resume command. Preserve the known offer sender as transfer authority when later chunk/start rows temporarily expose `<unknown>`.
- Roster starts use the canonical synchronized command and leader authority; do not append an extra sender-derived seed.

## Key Directories

- `panorama/layout/` — XML entry points and stable panel/handler contracts.
- `panorama/scripts/` — production runtime, engines, reducers, chat bridge, and renderers.
- `panorama/styles/` — Panorama presentation and state classes; behavior remains in JS.
- `panorama/images/poker/cards/` — card mask PNG sources and `.vtex` descriptors.
- `panorama/images/poker/chips/` — pot-chip PNG sources and `.vtex` descriptors.
- `scripts/` — VM harness, focused validators, and diagnostic helpers.
- `CONTEXT.md` — protocol, state-machine, build, and manual-QA contracts.
- `codemap.md` and nested `codemap.md` files — navigation maps; read only the map nearest the code being changed.
- `.slim/` — local analysis/tool artifacts, not runtime source.

## Development Commands

Run from the repository root:

```powershell
node poker/scripts/validate-poker.js
node poker/scripts/validate-ready-state.js
node poker/scripts/validate-poker-game.js
node poker/scripts/validate-bluff-deck-game.js
powershell -ExecutionPolicy Bypass -File build_poker.ps1
```

There is no Poker package manifest or lint command. The build wrapper compiles Panorama assets, compiles card/chip textures through Dota's `resourcecompiler.exe`, strips raw PNG/VTEX files from compiled output, packs `pak01_dir.vpk`, verifies required/forbidden assets, and deploys to Deadlock's addons directory.

The compiler wrapper may report a redirected-console `Console.ReadKey` exception after successful compilation. Treat required outputs plus `0 failed` as the success signal; the package and asset assertions must still pass.

## Code Conventions & Common Patterns

- Use a strict IIFE, two-space indentation, `UPPER_SNAKE_CASE` constants, and `camelCase` functions/state.
- Keep XML IDs, the JS `IDS` table, exported global handlers, CSS state classes, and validator fixtures synchronized.
- Cache panels in `State`; guard invalid/racing panels before engine calls.
- Use `try/catch` around volatile Panorama, panel, and chat operations. Fail closed at protocol/authority boundaries.
- Send canonical commands through the existing chat bridge. Do not invent direct networking, unsupported chat event handlers, or local authority shortcuts.
- Keep reducers deterministic: decode, validate authority/session/sequence, apply one transition, then render the projection.
- Guard panel writes with render caches. Avoid full-tree scans and unchanged text/class/style assignments in scheduled loops.
- Use `visibility: collapse`, `overflow: noclip`, `hittest="false"` on passive overlays, and Source 2-supported CSS such as `pre-transform-scale2d`.
- Runtime references card/chip `.vtex` paths; packed output contains `.vtex_c`.

### Poker action controls

- `PokerActionButtons` is the active-game action surface.
- A raise-facing turn exposes exactly `CALL`, `RAISE`, and `FOLD`. Do not add fixed-amount duplicate buttons.
- Manual amount entry and a real horizontal `Slider` sit beside the single `BET`/`RAISE` button.
- Range: legal minimum target through current street bet plus the actor's remaining stack.
- Reject and visibly mark illegal amounts. Guard programmatic slider updates from `onvaluechanged` feedback loops.
- Opening actions encode `bet $amount`; raise-facing actions encode `raise $amount`. Never send placeholder commands such as `custom-raise`.

### Table rendering

- Render one `PokerTableTurnArrow` under `State.tableSeats`; place it from the active seat's existing `positionClass`.
- Reset arrow render caches when seat children or order change.
- Keep the arrow static. Do not add JS animation loops or per-seat arrows.
- Pot-winner feedback is render state (`PotWinner`), not a timer loop. Cover fold, showdown, split-pot, and side-pot awards; clear it for new/imported hands.

## Important Files

- `panorama/scripts/poker_escape_menu.js` — primary runtime and protocol consumer.
- `panorama/scripts/poker_chat_debug.js` — stock-chat transport bridge.
- `panorama/layout/hud_escape_menu.xml` — ESC-menu integration and UI contract.
- `panorama/layout/chat.xml` — stock-chat hook.
- `panorama/styles/poker_escape_menu.css` — picker, lobby, table, action, history, and Bluff Deck styling.
- `scripts/poker-panorama-vm.js` — mock Panorama runtime used by focused validators.
- `scripts/validate-poker.js` — static source/layout/style/asset contracts and runtime budget.
- `scripts/validate-ready-state.js` — party, ready-seat, chat-bridge, unknown-sender, and lifecycle behavior.
- `scripts/validate-poker-game.js` — Poker engine, action controls, progress/resume, and rendering behavior.
- `scripts/validate-bluff-deck-game.js` — Bluff Deck engine, lifecycle, and compatibility behavior.
- `../build_poker.ps1` — compile, texture, package, asset-verification, and deployment contract.

## Runtime/Tooling Preferences

- Target Source 2 Panorama, not browser JavaScript. Do not assume DOM APIs, `fetch`, WebSockets, `setInterval`, or Dota gameplay APIs exist.
- Runtime imports come from XML `s2r://` includes; production JS has no Node dependency.
- Development uses Node validators, Windows PowerShell, .NET 9, Dota Workshop Tools/resourcecompiler, the repository compiler wrapper, and VPK tooling.
- Stock chat is the only cross-client transport. `GameUI.CustomUIConfig()` and `ClientUI_FireOutput` bridge independent Panorama contexts on one client.
- Fast chat polling is temporary and bounded; normal polling backs off. Preserve one-shot visible-row scans before serving chat snapshots.
- Keep the default VM clock non-incrementing. Use `options.nowStep` only for fixtures that explicitly test time progression.

## Testing & QA

All four validators are required after Poker JS/XML/CSS/protocol changes. They test static contracts and behavior in a synthetic Panorama VM; they do not prove live sender stabilization, multiplayer ordering, rendering, or deployment.

Tests should assert observable contracts:

- authority and privacy boundaries;
- stale session/generation/sequence rejection;
- canonical command encoding and one-time dispatch;
- active/completed/idle lifecycle transitions;
- legal action boundaries and custom-amount UI;
- deterministic Poker/Bluff outcomes;
- progress chunk ordering, checksum/import, hosted authority, and resume replay;
- render state, button availability, and runtime-budget limits.

After validators pass, run `build_poker.ps1` once and perform the relevant in-game smoke:

1. restart Deadlock with the deployed pak;
2. open the ESC-menu picker and exercise the changed surface;
3. for chat/protocol changes, test with two clients and inspect both console logs;
4. verify sender stabilization, canonical chat rows, and synchronized state;
5. test BACK/return, leave, rehost, completed-match switching, and resume paths affected by the change;
6. inspect VConsole/Panorama debugger for script, layout, or style errors.

Do not claim live synchronization or visual correctness from VM validators alone.
