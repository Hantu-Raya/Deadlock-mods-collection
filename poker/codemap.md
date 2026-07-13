# Poker Module Atlas

## Project Responsibility

`poker/` implements a self-contained Texas-hold'em-style Poker minigame inside Deadlock's ESC menu using Source 2 Panorama. The module has no game server; it synchronizes players by sending contract-critical wire commands through stock team/party chat and replaying observed chat rows through a Panorama bridge.

## System Entry Points

- `panorama/layout/hud_escape_menu.xml` — ESC-menu integration point, Poker panel tree, contract-critical IDs, and XML `onactivate` bindings.
- `panorama/layout/chat.xml` — stock chat layout hook that loads the Poker chat bridge.
- `panorama/scripts/poker_escape_menu.js` — primary runtime: UI state, chat sender, command reducer, poker engine, progress/resume protocol, and renderer.
- `panorama/scripts/poker_chat_debug.js` — chat-row polling bridge that extracts sender/channel/content and dispatches `ClientUI_FireOutput` JSON.
- `panorama/styles/poker_escape_menu.css` — Anita-style visual system and class-driven affordances.
- `panorama/images/poker/cards/` — source PNG/VTEX card masks compiled into packed `.vtex_c` textures.
- `scripts/validate-poker.js`, `scripts/validate-ready-state.js`, `scripts/validate-poker-game.js`, `scripts/validate-bluff-deck-game.js` — focused static, bridge, Poker compatibility, and Bluff Deck behavioral validators.
- `../build_poker.ps1` — compile, texture-build, pack, verify, and deploy wrapper for `pak01_dir.vpk`.

## Directory Map

| Directory | Responsibility Summary | Detailed Map |
|---|---|---|
| `panorama/` | Source Panorama UI surface: XML contexts, JS runtime/bridge, CSS presentation, and card assets. | [panorama/codemap.md](panorama/codemap.md) |
| `panorama/layout/` | XML hook points for ESC Poker UI and chat bridge; owns stable panel ID contracts and activation globals. | [panorama/layout/codemap.md](panorama/layout/codemap.md) |
| `panorama/scripts/` | Runtime state machine, chat reducer, poker engine, progress/resume protocol, renderer, and chat-row polling bridge. | [panorama/scripts/codemap.md](panorama/scripts/codemap.md) |
| `panorama/styles/` | Visual system and Source 2 Panorama CSS classes for lobby/table/cards/players/actions/log affordances. | [panorama/styles/codemap.md](panorama/styles/codemap.md) |
| `panorama/images/` | Source image namespace for Poker card textures. | [panorama/images/codemap.md](panorama/images/codemap.md) |
| `panorama/images/poker/` | Poker-specific image namespace and card asset grouping. | [panorama/images/poker/codemap.md](panorama/images/poker/codemap.md) |
| `panorama/images/poker/cards/` | Required 512x512 RGBA PNG masks plus paired `.vtex` descriptors for rank/suit card art. | [panorama/images/poker/cards/codemap.md](panorama/images/poker/cards/codemap.md) |
| `scripts/` | Validator harnesses for Poker static contracts, ready/chat bridge behavior, and VM game/progress/resume behavior. | No codemap generated; validators are intentionally excluded from cartography source tracking. |

## Architecture Summary

### Chat-driven synchronization

Poker uses stock chat as its transport. Menu buttons call exported globals in `poker_escape_menu.js`, which build wire strings and submit them through the stock `#ChatInput`. `poker_chat_debug.js` polls `#ChatMessages`, normalizes sender/channel/content, delays important rows while sender is `<unknown>`, stores history in `GameUI.CustomUIConfig()`, and dispatches bridge payloads via `ClientUI_FireOutput`.

Contract-critical chat phrases include:

```text
[party leader] poker party <partyId> table <poker|bluff-deck> session <token8> ready <token8> member <token8> intent <token8>
[party join|leave] poker party <partyId> session <token8> member <token8> intent <token8>
[table switch] poker party <partyId> from <token8> current-ready <token8> to <poker|bluff-deck> session <token8> next-ready <token8> member <token8> roster <hash8> intent <token8>
[match end] poker party <partyId> table <poker|bluff-deck> session <token8> current-ready <token8> next-ready <token8> member <token8> ... intent <token8>
poker ready <token8> ready <token8> member <token8> intent <token8>
poker start <seed> hand <handNumber> session <token8> ready <token8> next-ready <token8> member <token8> roster <encodedRoster> members <hash8> intent <token8>
poker act <token8> ready <token8> <seed> <handNumber> member <token8> intent <token8> <action>
```

Bluff Deck reserves a strict, isolated prefix under the same party session:

```text
bd1 s <match8> <rosterHash8> session <token8> ready <token8> member <token8> intent <token8>
bd1 p|c|r <match8> <seq> session <token8> ready <token8> member <token8> intent <token8> [maskHex]
```

The menu routes canonical lifecycle and every `bd1 ` row through authoritative reducers before legacy Poker decoding. Session, generation, member epoch, roster, leader/current-seat, and next-sequence guards fail closed. Unknown authority rows wait for sender stabilization and never grant authority. Snapshot replay uses the same reducer; retained pre-cutover unscoped rows are ignored.

### Runtime state and rendering

`poker_escape_menu.js` is a strict-IIFE deep module. Its singleton `State` stores panel refs, party state, ready seats, game state, progress/resume state, render caches, local identity, and pending self action. `CommandReducer` classifies and applies chat records; `PokerEngine` creates deterministic hands and applies legal actions; `PokerButtonState` centralizes all affordance decisions; `TableRenderer` projects state into panels.

`renderGame()` is the high-level projection step: it updates pot/phase, match visibility, announcer, community cards, player list, compact table seats, action buttons, log, progress/resume controls, and party/start buttons. CSS only interprets classes and panel structure; behavior remains in JS.

### Bluff Deck backend

`BluffDeckEngine` is a sibling pure `basic-v1` deterministic reducer for two to four fixed seats. `BluffDeckCommandReducer` owns its strict wire protocol; `BluffDeckActions` owns local selection and request identity. `State.bluffDeck` holds committed game state separately from `State.game`, so the two table games are mutually exclusive.

Committed games persist as `{ version, sourceChatSeq, game }` in `BluffDeckMatchState`. Hydration is accepted only after invariants plus retained matching start/high-water chat evidence; otherwise it fails closed. The ESC menu opens a two-row `TABLE GAMES` picker. Bluff Deck projects through a pure `BluffDeckViewModel` into exactly two windows: the dominant occult table (felt, seats-as-roster, cards, action rail, and lifecycle footer) and a noninteractive archive ledger showing the latest twelve committed turns. The renderer uses keyed log/played-card rows, preserves local card masking, and maps pending/challenge/turn/result states into semantic classes. It keeps the engine's protocol/history semantics separate from the presentation ledger and makes no secure-dealing claim.

The bridge receives `BluffDeckFastPollRequest` and keeps its own `TableGameFastPollUntil` TTL, making the existing scanner run at 100 ms for active Bluff activity and return to 500 ms on expiry. It keeps the proven open/wait/stable-readiness send lifecycle; no zero-delay cached-panel submit is allowed.

### Progress and resume

Progress export is available after a finished inactive hand with at least two funded players. Save codes use the `POKERPROG1-<checksum>-<encrypted body>` shape. Manual imports can use the legacy standalone resume ceremony outside hosted-party mode. Hosted imports share the progress code through `[progress offer]`/`[progress chunk]`, receivers import chunks without rebroadcasting, and only the hosted progress authority can start the compact `poker resume ... leader <leaderKey> seed <seed>` flow.

### Assets and packaging

Card art is rendered from logical `s2r://panorama/images/poker/cards/*.vtex` URLs. Source PNGs are 512x512 RGBA transparent white masks with paired `.vtex` descriptors. `build_poker.ps1` compiles those descriptors into `.vtex_c`, strips raw sources from compiled output, packs `pak01_dir.vpk`, verifies required assets, and deploys to Deadlock addons.

## Development and Verification

Run focused validators from the repository root:

```powershell
node poker/scripts/validate-poker.js
node poker/scripts/validate-ready-state.js
node poker/scripts/validate-poker-game.js
node poker/scripts/validate-bluff-deck-game.js
powershell -ExecutionPolicy Bypass -File build_poker.ps1
```

Validator scope:

- `validate-poker.js` — static XML/CSS/chat/card and runtime-topology contract.
- `validate-ready-state.js` — chat bridge, ready-state snapshots, delayed unknown-sender behavior, and Bluff bridge queue/poll contracts.
- `validate-poker-game.js` — Poker engine/progress/resume/UI behavior plus shared Poker/Bluff compatibility boundaries.
- `validate-bluff-deck-game.js` — deterministic Bluff Deck rules, protocol, committed hydration, actions, bridge timing, and convergence.

Validators do not prove live multiplayer timing, real chat target availability, in-game rendering fidelity, or deploy success unless the build wrapper is run.

## Invariants

- Work in source files only. Do not hand-edit `poker_compiled/`, staged pak folders, VPKs, archives, or `.vtex_c` outputs.
- Preserve chat-driven architecture; do not invent unsupported chat event handlers or direct client-to-client APIs.
- Keep unknown-sender handling strict: party/resume authority cannot be granted to `<unknown>` senders.
- Keep XML IDs, JS `IDS`, CSS classes, and validators synchronized.
- Runtime source references `.vtex`; packed output contains `.vtex_c`.
- Keep `PokerPlayersList` as the full player list and `PokerTableSeats` as the compact table-edge projection.
- After JS/CSS/XML/asset edits, run the focused Poker validators and `build_poker.ps1` before deploy claims.
