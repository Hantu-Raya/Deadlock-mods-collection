# Poker Context

## Purpose

`poker/` implements a self-contained poker minigame inside the Deadlock ESC menu. It has no server; it synchronizes players through in-game team/party chat messages that are parsed by a companion chat-layout bridge.

The module is Panorama-only plus card texture assets:

- `poker/panorama/layout/hud_escape_menu.xml` - ESC menu hook and poker panel layout.
- `poker/panorama/layout/chat.xml` - stock chat hook that loads the poker chat bridge.
- `poker/panorama/scripts/poker_escape_menu.js` - poker UI, state reducer, game engine, progress/resume flow.
- `poker/panorama/scripts/poker_chat_debug.js` - chat row polling bridge.
- `poker/panorama/styles/poker_escape_menu.css` - ANITA-style panel, table, card, button, log styling.
- `poker/panorama/images/poker/cards/` - 512x512 RGBA card source masks and `.vtex` texture descriptors.
- `poker/scripts/validate-*.js` - focused static and VM validators.

## Architecture & Data Flow

1. Player opens ESC menu and clicks `#PokerMenuButton`.
2. `poker_escape_menu.js` opens `#PokerAnitaPanel`, requests ready/chat snapshots over `ClientUI_FireOutput`, and renders cached state.
3. Buttons send chat wire commands through `sendChatMessage()` by opening team chat (`CitadelConCommand say_chat_team`) and submitting `#ChatInput` with `CitadelChatInputSubmitted`.
4. `poker_chat_debug.js` polls stock `#ChatMessages`, extracts sender/channel/content, delays important rows while sender is `<unknown>`, stores history in `GameUI.CustomUIConfig()`, and dispatches bridge JSON through `ClientUI_FireOutput`.
5. `poker_escape_menu.js` handles `PokerReadySeatsChanged` and `PokerChatMessage`; `processChatRecord()` is the central reducer for party, resume, start, and action commands.
6. `renderGame()` projects state into party controls, ready seats, progress/resume controls, table, announcer, community cards, player rows, action buttons, log, and status.

## State & Wire Protocol

- `PokerPartyState` - authoritative party/table session: `tableGame`, `tableSessionId`, `readyGeneration`, leader, member epochs, and roster order.
- `PokerReadySeats` / `PokerReadyRevision` - per-member ready observations scoped to the current table session and generation.
- `PokerChatMessages` / `PokerChatSequence` - retained stock-chat history and monotonic row sequence.
- `PokerLastReadyEvent`
- `PokerLocalPlayerKey`
- `PokerLocalPlayerName`
- `PokerPendingSelfAction`
- `PokerProgressState`
- `PokerBluffDeckMatchState` - committed Bluff match envelope; pending selection/send state is not persisted.

Bridge event names:

- `ClientUI_FireOutput`
- `PokerReadySeatsChanged`
- `PokerReadySeatsRequest`
- `PokerReadySeatsClearRequest`
- `PokerChatMessage`
- `PokerChatSnapshotRequest`
- `PokerChatSendRequest` / `PokerChatSendStatus` / `PokerChatSendCancelRequest`
- `BluffDeckFastPollRequest`

The table lifecycle is chat-authoritative. The host alone may switch the party table; switching preserves the roster, rotates the table session and ready generation, clears active match/progress state, and opens the target lobby without auto-dealing. A one-seat target lobby is valid, but Bluff Deck starts require 2–4 seats and switching a party larger than four into Bluff Deck is rejected. Retained pre-cutover unscoped lifecycle rows are ignored.

Canonical lifecycle rows are strict, case-insensitive, and carry session/generation/member epoch/intent nonce tokens:

```text
[party leader] poker party <partyId> table <poker|bluff-deck> session <token8> ready <token8> member <token8> intent <token8>
[party join|leave] poker party <partyId> session <token8> member <token8> intent <token8>
[table switch] poker party <partyId> from <token8> current-ready <token8> to <poker|bluff-deck> session <token8> next-ready <token8> member <token8> roster <hash8> intent <token8>
[match end] poker party <partyId> table <poker|bluff-deck> session <token8> current-ready <token8> next-ready <token8> member <token8> ... intent <token8>
poker ready <token8> ready <token8> member <token8> intent <token8>
poker start <seed> hand <number> session <token8> ready <token8> next-ready <token8> member <token8> roster <encodedRoster> members <hash8> intent <token8>
poker act <token8> ready <token8> <seed> <handNumber> member <token8> intent <token8> <action>
```

Bluff Deck uses its own strict action grammar under the same party session:

```text
bd1 s <match8> <rosterHash8> session <token8> ready <token8> member <token8> intent <token8>
bd1 p|c|r <match8> <seq> session <token8> ready <token8> member <token8> intent <token8> [maskHex]
```

Every canonical row is checked against the current party/session/generation, sender member epoch, roster hash, leader/current-seat authority, and next sequence before mutation. Unknown authority rows wait for sender stabilization and never grant authority. Snapshot hydration reconciles retained rows through the same reducer; malformed, stale, duplicate, or pre-cutover unscoped rows fail closed.

Roster encoding uses URI-escaped canonical player-key entries separated by `|`; names are resolved from the authoritative party roster. Malformed decode returns an empty roster.

### Bluff Deck backend (`basic-v1`)

Bluff Deck is a separate 2–4-seat backend beside Poker. `BluffDeckEngine` is pure and deterministic: it uses the fixed 20-rank deck (six Ace, six King, six Queen, two Joker), fixed seat order, deterministic deal/target/risk streams, challenge risk progression, fixed-seat departures, and canonical debug hashes. Its rules and chat protocol remain separate from Poker, while `BluffDeckViewModel` adapts the state to Poker's canonical seat, card, flip, action-row, and log presenters.

`BluffDeckMatchState` stores only committed `{ version, sourceChatSeq, game }` state. Hydration requires a retained matching start row, a retained-chat high-water mark at or beyond `sourceChatSeq`, and engine invariants; otherwise it clears the envelope and reports `MATCH STATE UNAVAILABLE — OBSERVE UNTIL NEXT MATCH`. Selection and send pending state are intentionally nonpersistent.

`BluffDeckFastPollRequest` crosses menu and chat contexts to extend the bridge-local `TableGameFastPollUntil` TTL. Active/open Bluff Deck uses the bridge's existing 100 ms scanner; expiry restores the existing 500 ms cadence. The bridge retains the reliable team-chat lifecycle—open `say_chat_team`, wait, then require a second stable readiness observation—and does not use a cached-panel zero-delay submit path.

`BluffDeckActions` powers the production table interface: the `TABLE GAMES` picker selects Poker or Bluff Deck, and `BluffDeckViewModel` adapts the canonical Bluff game into Poker's shared seat, card-art, flip, action-row, and log presenters. Accepted plays append deterministic `roundPlays`; their anonymous cards accumulate over the centered target, and a committed challenge reveals only the immediately preceding play through the shared Poker flip presenter. Accepted transitions update the canonical twelve-entry `game.log`; the UI projection keeps a separate latest-twelve-turn transcript, renders seats as the only player roster, and places the result/log in the noninteractive archive window. The view model renders `NO TURNS YET` for an empty transcript. The flat main surface emphasizes a compact 400px circular felt with cardinal top/right/bottom/left seats anchored to its edge, centers the reduced five-card hand and gameplay action rail, and keeps BACK/CLOSE plus shared party and leader start/end controls subordinate. History changes only after a stock-chat record passes Bluff authority, legality, and sequence checks. The implementation remains honest-client and makes no secure-dealing claim.

## Game Model

Core constants in `poker_escape_menu.js`:

- `MIN_READY_PLAYERS = 2`
- `STARTING_STACK = 10000`
- `SMALL_BLIND = 100`
- `BIG_BLIND = 200`
- `ACTION_BET_EXTRA = 300`
- `MAX_GAME_LOG_ENTRIES = 6`
- progress prefix `POKERPROG1`

Game rules implemented in source:

- deterministic 52-card deck from a seeded RNG
- ranks `2..A`, suits `S,H,D,C`
- party leader starts synchronized hands after at least two joined party roster members
- blinds scale by hand number: `$100/$200` per hand number
- active player can check/call/fold/bet/raise when legal
- observers and unknown local senders see read-only legal action choices
- flop/turn/river/showdown flow, fold wins, side-pot payout, winner splitting
- hand categories through straight flush/royal flush
- active hand reveals only the local player's hole cards; inactive/showdown reveals cards
- 2-player active hand resets to lobby when either player leaves or restarts
- 3+ player active hand folds the leaving player, announces it, and continues

## Progress and Resume

Progress export only works after a finished inactive hand while at least two players still have chips.

Progress code shape:

```text
POKERPROG1-<8hex checksum>-<encrypted base64url body>
```

Save flow:

- `buildProgressPayload()` validates finished hand and bankroll/dealer state.
- payload is canonicalized for stable checksum.
- bytes are XOR-stream encrypted with `PROGRESS_CODE_SECRET + '|' + checksum`.
- import verifies checksum and canonical payload before updating `PokerProgressState`.

Resume flow:

- each returning player imports the same code
- one saved, funded player sends `[resume leader]`
- saved, funded players send `[resume ready]`
- only the selected resume leader can send `poker resume ...`
- resume start validates id, hand number, leader, roster, funded players, and next dealer rotation
- restarted clients cannot safely rejoin the same active hand without a fresh state snapshot/server; for now they rejoin the next lobby/hand

## UI Panel Contracts

Contract-critical IDs from `hud_escape_menu.xml`:

- party: `PokerPartyControls`, `PokerHostPartyButton`, `PokerJoinPartyButton`, `PokerPartyStatusLabel`
- progress: `PokerProgressControls`, `PokerExportProgressButton`, `PokerImportProgressButton`, `PokerProgressCodeInput`, `PokerProgressCodeLabel`
- resume: `PokerResumeControls`, `PokerResumeLeaderButton`, `PokerResumeReadyButton`, `PokerResumeStatusLabel`, `PokerResumeLeaderList`
- ready/lobby: `PokerReadyCountLabel`, `PokerSeatsList`, `PokerStartButton`, `PokerReadyChatButton`, `PokerStatusLabel`
- table: `PokerTableSurface`, `PokerPhaseLabel`, `PokerPotLabel`, `PokerAnnouncerOverlay`, `PokerAnnouncerTitle`, `PokerAnnouncerBody`, `PokerCommunityCards`, `PokerPlayersList`, `PokerActionButtons`
- end/log: `PokerEndMatchButton`, `PokerGameLog`

Current UI behavior:

- hosting/waiting with no `State.game` hides the table, log, and end-match button
- after a synced hand starts, table/log/end-match controls show
- visible game log/history is capped to six rows
- `END MATCH` clears `State.game`, clears stale log rows, and hides match-only panels again

## Card Asset Pipeline

Source card assets live in `poker/panorama/images/poker/cards/`.

Expected PNGs:

```text
card_face_ace.png
card_face_jack.png
card_face_joker.png
card_face_king.png
card_face_queen.png
card_suit_club.png
card_suit_diamond.png
card_suit_heart.png
card_suit_spade.png
```

Invariants:

- each PNG must be 512x512
- each PNG must be color type 6 / RGBA
- transparent background is required
- visible art is a white alpha mask so CSS `wash-color` can tint black/red suits
- runtime references logical `.vtex` URLs, never `.vtex_c`
- packed VPK must contain compiled `.vtex_c` card textures only, not raw `.png` or `.vtex`

Runtime card rendering:

- `createCardArt()` creates an `Image` panel with class `PokerCardVtexArt`
- black suits use `wash-color: #111315`
- red suits use `.PokerCard.RedSuit .PokerCardVtexArt { wash-color: #b83f47; }`
- card art is displayed as a square to avoid vertical stretching
- do not reintroduce center rank/suit labels (`PokerCardFaceInitial`, `PokerCardFaceSuit`)

## Code Conventions

- Both runtime scripts are strict IIFEs.
- Keep exact global exports consumed by XML: `PokerEscapeMenuToggle`, `PokerEscapeMenuClose`, `PokerEscapeMenuSendReadyChat`, `PokerEscapeMenuStart`, `PokerEscapeMenuEndMatch`, `PokerEscapeMenuHostParty`, `PokerEscapeMenuJoinParty`, `PokerEscapeMenuCopyProgress`, `PokerEscapeMenuImportProgress`, `PokerEscapeMenuResumeLeader`, `PokerEscapeMenuResumeReady`.
- Cache panel refs in `State`; use `isValid`, `setText`, `setPanelClass`, `clearChildren`, and guarded `try/catch` helpers.
- Use `$.Schedule` retry/backoff for chat row stabilization and menu refresh; do not use `setInterval`.
- Do not invent chat event handlers. The chat bridge polls stock `#ChatMessages` and registers only the bridge request handler.
- Keep unknown sender behavior: important action/party/resume rows from `<unknown>` are delayed/retried; resume/party authority must not be granted to unknown senders.
- Keep test hooks under `globalThis.__PokerEscapeMenuTestHooks` and `globalThis.__PokerChatDebugTestHooks`; validators depend on them.

## Development Commands

Run from repo root:

```powershell
node poker/scripts/validate-poker.js
node poker/scripts/validate-ready-state.js
node poker/scripts/validate-poker-game.js
node poker/scripts/validate-bluff-deck-game.js
powershell -ExecutionPolicy Bypass -File build_poker.ps1
```

`build_poker.ps1` flow:

1. compile `poker/` with `sr2compiler/New folder.exe`
2. compile card PNG/VTEX through Dota `resourcecompiler.exe` from `sr2compiler/pref.json`
3. copy only `.vtex_c` card textures into `poker_compiled`
4. remove raw `.png`/`.vtex` from compiled output
5. pack `pak01_dir.vpk`
6. verify required compiled assets and forbidden raw card assets
7. deploy to `G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak01_dir.vpk`

## Testing & QA

Validators:

- `validate-poker.js` - static/layout/CSS/chat/card asset contract, including 512x512 RGBA transparent card images and visible wash-color card art.
- `validate-ready-state.js` - VM bridge/ready-state/chat snapshot behavior across chat and menu contexts.
- `validate-poker-game.js` - VM game engine/progress/resume/UI behavior: party sync, legal actions, side pots, progress codes, resume, table visibility, log cap, end match.
- `validate-bluff-deck-game.js` - deterministic Bluff Deck engine, protocol, persistence, pending-action, bridge, and convergence VM contracts.

What validators do not prove:

- live multiplayer ordering
- real chat target availability
- real sender-name stabilization in Deadlock
- in-game Source 2 rendering fidelity
- VPK deployment unless `build_poker.ps1` is run

Manual smoke checklist after deploy:

1. open ESC menu and verify the table is hidden while hosting/waiting
2. host/join with at least two clients or chat contexts
3. start a synced 2-player hand, have one player leave/restart, and verify both clients return to lobby
4. start a synced 3-player hand, have one player leave/restart, and verify the leaving player folds, is announced, and the hand continues
5. start a synced hand and confirm table/log/end-match controls appear
6. verify card art is square, transparent, and red/black washed correctly
7. verify only local hole cards are visible during active play
8. try legal/illegal action messages and observer read-only controls
9. finish a hand, copy/import progress, select resume leader, ready resume, and start resume
10. check VConsole/Panorama debugger for script/style errors
