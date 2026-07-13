# poker/panorama/scripts/

## Responsibility

Panorama runtime scripts for the ESC-menu Poker module. This directory owns the live client state machine, chat-backed synchronization protocol, game engine, UI rendering, storage bridge contracts, and test-hook surfaces for validators.

- `poker_escape_menu.js` is the primary module: it binds layout globals/buttons, sends stock-chat wire commands, reduces bridge chat/ready events into `State`, runs poker hand logic, imports/exports progress codes, and renders the ANITA poker panel.
- `poker_chat_debug.js` is the stock chat bridge: it polls Deadlock chat rows from `#ChatMessages`, extracts sender/channel/content, delays authority-bearing rows with unresolved `<unknown>` senders, records shared history in `GameUI.CustomUIConfig()`, and emits JSON bridge events back to `poker_escape_menu.js`.

## Design/Patterns

### Runtime shape

Both files are strict IIFEs and use guarded Panorama APIs (`$.DispatchEvent`, `$.Schedule`, `GameUI.CustomUIConfig`, `$.GetContextPanel`, panel `FindChildTraverse`). They avoid server APIs; chat is the transport.

### Shared bridge contract

Both scripts duplicate the same `BridgeContract` constants and must stay aligned:

- Event bus: `ClientUI_FireOutput`.
- Ready events: `PokerReadySeatsChanged`, `PokerReadySeatsRequest`, `PokerReadySeatsClearRequest`.
- Chat events: `PokerChatMessage`, `PokerChatSnapshotRequest`, `PokerChatSendRequest`.
- Bluff bridge events: `BluffDeckFastPollRequest`, `BluffDeckSendStatus`, `BluffDeckSendCancelRequest`.
- Shared `GameUI.CustomUIConfig()` keys: `PokerReadySeats`, `PokerReadyRevision`, `PokerChatMessages`, `PokerChatSequence`, `PokerLastReadyEvent`, `PokerLocalPlayerKey`, `PokerLocalPlayerName`, `PokerPendingSelfAction`, `PokerPartyState`, `PokerProgressState`, `BluffDeckMatchState`, `TableGameFastPollUntil`.

### `poker_escape_menu.js` module boundaries

- `State` is the singleton view-model/cache for panel refs, readiness, sync state, current game, party, resume/progress state, render caches, local identity, bankrolls, and pending imports.
- `CommandReducer` is the reducer facade: `decodePokerCommand()` classifies chat records, `applyPokerCommand()` mutates state, and `applyChatPayload()` replays bridge snapshots by monotonically increasing `seq`.
- `StartSync` coordinates open/boot snapshot requests: `requestFreshState()` emits ready/chat snapshot requests, `noteBridgeEvent()` marks snapshots received, and `afterSnapshotApplied()` rerenders.
- `PokerButtonState` is the button-policy layer. It centralizes gate decisions for start/resume/host/join/progress/action affordances, including hosted imported resume mode (`isHostedImportedResumeState()`, `getHostedResumeStartGate()`) versus legacy `[resume leader]`/`[resume ready]` ceremony.
- `ProgressResume` wraps progress payload validation, code encode/decode, import, resume command builders, and resume start application.
- `PokerEngine` wraps deterministic hand creation, legal action checks, action application, betting-round advancement, side-pot building, showdown, and hand comparison.
- `PendingSelfAction` records locally-clicked action commands in `PokerPendingSelfAction` to resolve self chat rows whose sender is still `<unknown>`.
- `LateJoinQueue` computes members who joined a party mid-match and applies buy-ins to the next hand.
- `CardPresenter` creates/updates card panels and card image URLs under `s2r://panorama/images/poker/cards/*.vtex`.
- `TableRenderer` groups render entry points for validators: `renderGame`, `renderCommunity`, `renderPlayers`, `renderTableSeats`, `renderActions`, `renderLog`.
- `Affordance` applies `PokerHidden`, `Eligible`, `Disabled`, and `ReadOnly` classes plus `hittest` state.

- `BluffDeckEngine` is the pure deterministic `basic-v1` sibling reducer. It owns fixed seats, the 20-rank deck, risk/elimination, canonical debug hashes, invariant validation, and text projection; it never reads Panorama state.
- `BluffDeckCommandReducer` owns strict `bd1` decode/build/apply semantics. Prefix routing occurs before loose Poker decoding; committed state is restored only after retained start/high-water evidence and invariants.
- `BluffDeckActions` owns nonpersistent local selection and identity-bearing pending play/challenge requests. These requests bypass Poker's 800 ms click throttle without changing its timestamp, then wait for bridge status and chat echo.
- `State.bluffDeck` is separate from `State.game`; `getActiveTableGameType()` prevents Poker and Bluff Deck from running together. `TableGamePicker` selects the existing Poker surface or the Bluff two-window composition. `BluffDeckViewModel` is a pure projection adapter over engine/party state; its turn header projects the remembered local player as `YOU` while retaining remote player names. `BluffDeckRenderer` applies semantic announcement/control classes, renders seats as the only roster, and projects the latest twelve committed turns into the noninteractive archive ledger without exposing opponent ranks.

### `poker_chat_debug.js` module boundaries

- `ChatBridgeIntake` groups the bridge scanner: `readRecord`, `shouldDelayUnknownSender`, `consumeRow`, and `scan`.
- Ready detection is intentionally broad for lobby seating (`ready`, `ready up`, `poker ready`, `join poker`, `[party leader]`, `[party join]`) but excludes `not ready`/`unready`.
- Important command rows (`party`, `resume`, `progress`, `poker start`, actions) are detected by normalized text so the bridge can decide whether an unknown sender is safe to delay.
- Chat history is capped to 120 entries; ready seats are sorted by `readyAt` and written with `PokerReadyRevision` increments.

- `bd1 s`/`e` and scoped Bluff party leave rows retain raw unknown senders and wait for stabilization. `bd1 p`/`c` rows dispatch once with raw unknown identity so the menu can apply exact pending/current-seat guards.
- The FIFO sender normalizes entries to `{ message, requestId }`, reports submitted/failed/cancelled only for request-bearing Bluff entries, and can remove the exact unsent entry. It retains the open → wait → second stable readiness requirement.
- `BluffDeckFastPollRequest` updates only the bridge context's `TableGameFastPollUntil`; the existing sole scanner uses 100 ms while that TTL is live and 500 ms after expiry.

## Data & Control Flow

### Boot/open/snapshot flow

1. XML/layout calls exported globals from `poker_escape_menu.js` or bound button handlers after `boot()` caches panel IDs.
2. `boot()` loads `PokerPartyState` via `getPartyState()` and `PokerProgressState` via `getResumeState()`, registers `ClientUI_FireOutput`, requests fresh ready/chat snapshots, updates seats, renders, and starts a scheduled refresh loop.
3. Opening the panel through `setOpen(true)` calls `StartSync.openMenu()`, which dispatches `PokerReadySeatsRequest`/`PokerChatSnapshotRequest` and schedules follow-up renders.
4. `poker_chat_debug.js` handles those request events in `handleClientOutput()` by dispatching snapshots from `PokerReadySeats` and `PokerChatMessages`.
5. `poker_escape_menu.js` receives bridge JSON in `handleBridgeEvent()`: ready payloads update `PokerReadySeats`; chat payloads enter `CommandReducer.applyPayload()`.

### Chat bridge flow (`poker_chat_debug.js`)

1. `scanChatMessages()` resolves `#Chat`/`#ChatMessages` and schedules itself at `0.1s` for fast activity or `0.5s` otherwise. A snapshot request performs a one-shot visible-row scan before dispatching retained history.
2. For each unconsumed row, `readChatMessage()` extracts `#MessageSource`, `#MessageContents`, `.SenderName`, `.ChannelName`, content text, and `.IsSelf`.
3. `getChatRowDecision()` delays authority-bearing unknown-sender rows while allowing ordinary chat and non-authority action rows to proceed under their bounded policy. Unknown rows never create party authority.
4. Consumed rows are marked with `__pokerDebugLogged`, appended to `PokerChatMessages` with an incremented `PokerChatSequence`, dispatched as `PokerChatMessage`, and extend Bluff fast-poll TTL when applicable. Ready-seat state is reduced by the menu, not by the bridge.

### Bluff Deck flow

1. The known party leader emits canonical `bd1 s <match8> <rosterHash8> session ...` for the ordered party roster. Each reducer validates the same session/generation/member/roster metadata before creating the deterministic game.
2. The current seat emits canonical `bd1 p`, `bd1 c`, or `bd1 r` with the exact next sequence. Challenge and trigger results are reducer-owned; no follow-up gameplay command is required.
3. A seated active departure is handled through the shared canonical party leave/lifecycle reducer, which advances Bluff state without splicing fixed seats.
4. A leader ends the match through the shared table lifecycle; committed terminal history persists, but selection and pending sends do not.
5. Menu-open active games refresh the bridge TTL; no zero-delay cached chat-panel submission is permitted.

### Party/start/table flow

1. `TableLifecycle.request({ type: "host" })` creates a canonical party/table session, member epoch, and ready generation, then queues the leader row.
2. `TableLifecycle.request({ type: "join" })` queues a session-scoped join row after requesting fresh state; both paths reconcile through retained stock chat.
3. `TableLifecycle.apply()` validates party/session/generation/member authority and updates the authoritative party projection. Stale, duplicate, malformed, and pre-cutover unscoped rows fail closed.
4. The leader's start request requires every current roster member to be ready for the current generation, then emits canonical `poker start ... session ... ready ... next-ready ... roster ... members ...`.
5. `TableLifecycle.request({ type: "switch" })` is host-only, preserves the roster, rotates session/generation, clears active match/progress state, and opens the target lobby without auto-dealing. Bluff targets reject parties over four.
6. `TableLifecycle.request({ type: "end" | "leave" })` queues a scoped canonical lifecycle row; local state changes only after the authoritative chat row is consumed.

### Game/action flow

1. `createGameFromReady()` creates deterministic deck state from `buildDeck(seed)`/`seededRandom(hashString(seed))`, selects dealer/blinds, deals two cards, posts blinds, sets `phase: "preflop"`, and logs/announces the first actor.
2. UI action buttons call `sendAction()`, which verifies local identity/current actor/legal command, records `PendingSelfAction`, and sends chat text (`check`, `call`, `fold`, `bet $N`, `raise $N`).
3. Reducer action handling resolves self/unknown senders where safe, finds the game player, validates turn/legal amount, then `applyLegalAction()` mutates bets/stacks/fold state.
4. `completeActionAdvance()` awards fold wins, advances streets when `hasBettingRoundSettled()`, or moves `currentIndex`; `showdown()` builds side pots and splits winners; `finishHand()` marks the game inactive/finished, persists bankrolls, applies late joiners, clears pending action, and rerenders.
5. `TableLifecycle.request({ type: "end" })` emits a session/generation-scoped canonical `[match end]` row; the reducer clears only the active table match/progress state after authority validation and preserves the party lobby.
6. `TableLifecycle.request({ type: "leave" })` emits a scoped canonical leave row; reducer application updates roster/table state only after the observed row, preserving chat authority and snapshot recovery.

### Progress/resume flow

1. Export is available after a finished inactive hand with at least two funded players. `buildProgressPayload()` captures `lastHandNumber`, `nextHandNumber`, `dealerKey`, roster, bankrolls, and `savedAt`.
2. `buildProgressSaveCode()` canonicalizes payload, computes checksum/id (`r<hash>`), XOR-stream encrypts JSON with `PROGRESS_CODE_SECRET + '|' + checksum`, and emits `POKERPROG1-<8hex>-<base64url>`.
3. Manual import uses `PokerEscapeMenuImportProgress`/`importProgressCodeFromInput()`, which calls `importProgressSaveCode()`, stores `State.resume`, writes `PokerProgressState`, and if hosted leader conditions pass calls `shareImportedProgressFromHostedLeader()`.
4. Progress sharing uses existing chat: `shareProgressCode()` sends one `[progress offer] poker progress <id> <checksum> <count>` plus `[progress chunk] poker progress <id> <checksum> <index>/<count> <chunk>` messages of `PROGRESS_SHARE_CHUNK_SIZE` characters, with throttling bypass through `sendBackgroundChatMessage()` and `progressShare.readyAt` to guard start timing.
5. Received progress share messages are ignored when `record.isSelf`. Other clients assemble chunks in `State.progressTransfers`, verify checksum/code/id in `importSharedProgressCode()`, import through `importProgressSaveCode()` (not the manual import handler), and bind hosted authority with `bindHostedSharedProgressAuthority()`.
6. Legacy resume outside hosted-party mode uses `[resume leader] poker resume <id>` and `[resume ready] poker resume <id>`; `recordResumeLeader()` requires a saved funded sender and makes the leader count ready, while `recordResumeReady()` records saved funded players.
7. Hosted imported resume mode suppresses legacy resume ceremony controls. `getHostedResumeStartGate()` gives only the hosted leader a visible/enabled `NEXT SYNCED HAND` once party roster and shared-progress timing are valid; members wait for the leader.
8. Resume start wire command is the compact `poker resume <id> hand <nextHandNumber> leader <leaderKey> seed <seed>`. `applyResumeStartCommand()` verifies matching imported progress, hosted leader authority, sender identity, optional legacy roster validity, next dealer, then `applyResumeProgressForStart()` seeds bankroll/player state and `createGameFromReady()` starts the saved next hand.
9. Invariant: hosted resume preserves the real transport `party.id` when prior party leader matches the resume leader; fallback to `resume.id` is only for legacy no-party resume starts.

### Rendering flow and layout globals

- `renderGame()` is the only high-level projection step. It caches panels, updates pot/phase, Poker match visibility, announcer, community cards, player list, compact table seats, action buttons, log, progress/resume controls, and start/party buttons. When Bluff Deck is selected it builds `BluffDeckViewModel` and sends it to `BluffDeckRenderer`, which projects the dominant flat circular table with centered actions and the noninteractive latest-twelve-turn archive ledger.

Important layout IDs cached in `IDS` and consumed by renderers/buttons:

- Root/open: `PokerMenuButton`, `PokerAnitaPanel`, `PokerTableWindow`, `PokerLobbyWindow`, `PokerPlayersWindow`, `PokerHistoryWindow`, `PokerActionsWindow`, `PokerCloseButton`, `BluffDeckWindow`, `BluffDeckHistoryWindow`, `BluffDeckAnnouncementOverlay`, `BluffDeckCardTable`, `BluffDeckTableSeats`, `BluffDeckCardSlots`, `BluffDeckActionControls`, `BluffDeckLifecycleControls`, `BluffDeckLog`.
- Party/lobby: `PokerPartyControls`, `PokerHostPartyButton`, `PokerJoinPartyButton`, `PokerPartyStatusLabel`, `PokerReadyCountLabel`, `PokerSeatsList`, `PokerReadyChatButton`, `PokerStartButton`, `PokerStartButtonLabel`, `PokerLeaveLobbyButton`.
- Progress/resume: `PokerProgressControls`, `PokerExportProgressButton`, `PokerImportProgressButton`, `PokerProgressCodeInput`, `PokerProgressCodeLabel`, `PokerResumeControls`, `PokerResumeLeaderButton`, `PokerResumeReadyButton`, `PokerResumeStatusLabel`, `PokerResumeLeaderList`.
- Table/action/log: `PokerTableSurface`, `PokerPhaseLabel`, `PokerPotLabel`, `PokerAnnouncerOverlay`, `PokerAnnouncerTitle`, `PokerAnnouncerBody`, `PokerCommunityCards`, full list `PokerPlayersList`, compact edge seats `PokerTableSeats`, `PokerActionButtons`, `PokerEndMatchButton`, `PokerGameLog`.
- Stock chat integration: `Chat`, `ChatControls`, `ChatInput`, `ChatTargetLabel`.

Renderer invariants:

- `PokerPlayersList` is the full roster/player list; `PokerTableSeats` is the compact table-edge projection capped by `TABLE_EDGE_SEAT_LIMIT` with overflow label.
- Cards render rank/suit text plus `PokerCardVtexArt` image panels from logical `.vtex` assets; active hands reveal only local hole cards, inactive/showdown/resume roster views reveal as allowed by `shouldRevealPlayerCards()`. Bluff reuses retained target/slot art panels and must clear both the shared `PokerHidden` class and the card-local `Hidden` class when a rank becomes valid.
- `renderProgressControls()` applies progress/resume button state and always rerenders `PokerResumeLeaderList` when imported progress exists.

## Integration Points

### Global exports consumed by XML/layout

`poker_escape_menu.js` exports these on both `globalThis` and the context panel:

- `PokerEscapeMenuToggle`, `PokerEscapeMenuClose`
- `PokerEscapeMenuSendReadyChat`, `PokerEscapeMenuStart`, `PokerEscapeMenuEndMatch`, `PokerEscapeMenuLeaveLobby`
- `PokerEscapeMenuHostParty`, `PokerEscapeMenuJoinParty`
- `PokerEscapeMenuCopyProgress`, `PokerEscapeMenuImportProgress`
- `PokerEscapeMenuResumeLeader`, `PokerEscapeMenuResumeReady`

### Panorama/Deadlock events

- Sends chat by dispatching `CitadelConCommand` with `say_chat_team`, setting `#ChatInput.text`, dispatching `CitadelChatInputSubmitted`, then blurring/focusing away with `CitadelChatInputBlur`/`DropInputFocus`.
- Copies progress with `CopyStringToClipboard` / `CopyStringToClipboard` async variants.
- Uses only `ClientUI_FireOutput` for internal bridge JSON; no direct client-to-client API exists.
- `poker_chat_debug.js` registers `ClientUI_FireOutput` only to service snapshot/clear requests, then polls stock `#ChatMessages` instead of registering extra chat handlers.

### Wire commands and invariants

Contract-critical lifecycle chat phrases currently parsed/emitted:

```text
[party leader] poker party <partyId> table <poker|bluff-deck> session <token8> ready <token8> member <token8> intent <token8>
[party join|leave] poker party <partyId> session <token8> member <token8> intent <token8>
[table switch] poker party <partyId> from <token8> current-ready <token8> to <poker|bluff-deck> session <token8> next-ready <token8> member <token8> roster <hash8> intent <token8>
[match end] poker party <partyId> table <poker|bluff-deck> session <token8> current-ready <token8> next-ready <token8> member <token8> ... intent <token8>
poker ready <token8> ready <token8> member <token8> intent <token8>
poker start <seed> hand <handNumber> session <token8> ready <token8> next-ready <token8> member <token8> roster <encodedRoster> members <hash8> intent <token8>
poker act <token8> ready <token8> <seed> <handNumber> member <token8> intent <token8> <action>
bd1 s|p|c|r ... session <token8> ready <token8> member <token8> intent <token8>
```

Progress/resume rows retain their existing `[progress offer]`, `[progress chunk]`, `[resume leader]`, `[resume ready]`, and hosted `poker resume` contracts.

Important invariants:

- Party/table/resume authority must not be granted to unresolved `<unknown>` senders; the bridge delays important rows and reducers reject unsafe unknown authority.
- Session, ready generation, member epoch, roster hash, leader/current-seat, intent nonce, and next-sequence checks all fail closed before state mutation.
- Table switching is host-only, preserves the roster, rotates session/generation, clears active table/progress state, and opens a clean target lobby; parties over four cannot switch into Bluff Deck.
- Progress share self-echoes (`record.isSelf`) are consumed but not imported.
- Shared progress import must go through `importSharedProgressCode()` -> `importProgressSaveCode()` and must not call `importProgressCodeFromInput()`, preventing rebroadcast loops.
- Bluff Deck retained-history hydration never reconstructs concealed state from a partial history. This is an honest-client backend and makes no secure-dealing claim.

### Test hooks

Validators depend on stable hooks:

- `globalThis.__PokerEscapeMenuTestHooks`: exposes existing Poker helpers plus `BluffDeckEngine`, `BluffDeckCommandReducer`, `BluffDeckActions`, `BluffDeckViewModel`, `BluffDeckRenderer`, copied Bluff state, and raw `state`.
- `globalThis.__PokerChatDebugTestHooks`: exposes chat classifiers, ready-seat mutation, snapshot request handler, chat append/read/delay/scan helpers, `localPlayerKeys`, and `BridgeContract`/`ChatBridgeIntake` modules.

### External files in this module

- Layout sources: `poker/panorama/layout/hud_escape_menu.xml` defines the ESC Poker panel IDs consumed by `poker_escape_menu.js`; `poker/panorama/layout/chat.xml` loads `poker_chat_debug.js` into the stock chat context.
- Styles: `poker/panorama/styles/poker_escape_menu.css` defines the classes toggled here (`PokerHidden`, `Open`, `Active`, `Eligible`, `Disabled`, `ReadOnly`, card suit/current/folded/eliminated classes, table seat position classes).
- Assets: `poker/panorama/images/poker/cards/*.vtex` logical paths are referenced at runtime; compiled `.vtex_c` assets are produced by the build pipeline, not referenced directly.
- Validators: `poker/scripts/validate-poker.js`, `poker/scripts/validate-ready-state.js`, `poker/scripts/validate-poker-game.js`, and `poker/scripts/validate-bluff-deck-game.js` load the test hooks and enforce static/VM contracts.
