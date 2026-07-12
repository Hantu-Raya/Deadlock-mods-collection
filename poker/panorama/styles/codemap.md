# panorama/styles/

## Responsibility
`poker/panorama/styles/` defines the runtime visual contract for the ESC-menu Poker Panorama module. Its only stylesheet, `poker_escape_menu.css`, skins the Poker entry button, the floating lobby/table/players/history/actions windows, the Anita-inspired typography/buttons, the table felt, community/hole cards, table-edge seats, player roster, legal action buttons, and game log rows consumed by `poker/panorama/layout/hud_escape_menu.xml` and `poker/panorama/scripts/poker_escape_menu.js`.

The stylesheet is presentation-only: it does not own poker state, chat transport, visibility decisions, or game rules. Those decisions are projected by `poker_escape_menu.js` through panel classes such as `PokerMenuVisible`, `Open`, `PokerHidden`, `Eligible`, `Disabled`, `ReadOnly`, `Current`, `Folded`, `Eliminated`, `RedSuit`, and `BlackSuit`.

## Design/Patterns

### Visual system
- **Anita-style debug panel language:** dark green/black floating windows, soft radial gradients, thin low-alpha borders, mint green primary accents (`#66cc99` / `#a6ffc9`), muted grey support text (`#7d8688`), cream card faces (`#e8eee9`), red suit accent (`#b83f47`), and gold table/pot announcer accent (`#f0d78a`).
- **Floating window composition:** `.PokerFloatingWindow` is the shared base for `#PokerLobbyWindow`, `#PokerTableWindow`, `#PokerPlayersWindow`, `#PokerHistoryWindow`, and `#PokerActionsWindow`. Each window uses absolute-ish Panorama alignment/margins rather than normal document flow:
  - `.PokerLobbyWindow`: 56% width, left/top at `margin-left: 25%`, `margin-top: 4%`.
  - `.PokerTableWindow`: 56% width, below lobby at `margin-top: 26%`, with zero padding for the felt surface.
  - `.PokerPlayersWindow`: right side, 16% width, `margin-top: 7%`.
  - `.PokerHistoryWindow`: right side, 16% width, `margin-top: 62%`.
  - `.PokerActionsWindow`: bottom center action strip, 56% width, `margin-top: 80%`.
- **Typography hierarchy:** `.PokerAnitaEyebrow`, `.PokerAnitaTitle`, `.PokerWindowTitleSmall`, `.PokerSectionLabel`, `.PokerSideSectionLabel`, `.PokerPhaseLabel`, and button labels all use uppercase + letter spacing for system/debug tone. Player and seat names are bold high-contrast labels; metadata is smaller uppercase grey or mint.
- **Button affordance classes:** `.PokerPrimaryButton`, `.PokerSecondaryButton`, `.PokerStartButton`, `.PokerActionButton`, and `.PokerIconButton` share short `transition-duration: 0.12s` hover transforms using Source 2 `pre-transform-scale2d`. Runtime state is class-driven: `.Eligible` turns `#PokerStartButton` green and lit; `.Disabled` dims with brightness/saturation/opacity; `.ReadOnly` dims action buttons without making them look broken; `.Danger` only changes fold hover color when actionable.
- **State-as-class styling:** the script applies classes instead of replacing styles. Important class meanings:
  - `.PokerHidden`: `visibility: collapse` for runtime-hidden panels.
  - `.PokerMenuVisible` on the root and `.Open` on floating windows make windows visible, opaque, and scaled to 1.
  - `.Current`, `.Folded`, `.Eliminated` are shared by `.PokerPlayerRow` and `.PokerTableSeat` to highlight current actor, dim folded players, and desaturate eliminated players.
  - `.RedSuit` / `.BlackSuit` tint card labels and `.PokerCardVtexArt` wash colors.

### Major class groups
- **Entry/open state:** `.PokerMenuButton`, `.PokerMenuButton.Active`, `.PokerAnitaPanel`, `.PokerMenuVisible ...`, `.Open`.
- **Window shells/header:** `.PokerFloatingWindow`, `.PokerLobbyWindow`, `.PokerTableWindow`, `.PokerPlayersWindow`, `.PokerHistoryWindow`, `.PokerActionsWindow`, `.PokerFloatingHeader`, `.PokerTableTitleBlock`, `.PokerAnitaHeader`, `.PokerIconButton`.
- **Lobby controls:** `.PokerLobbyBar`, `.PokerPartyControls`, `.PokerProgressControls`, `.PokerResumeControls`, `.PokerPartyButton`, `.PokerReadyTopButton`, `.PokerPartyStatusLabel`, `.PokerProgressCodeInput`, `.PokerProgressCodeLabel`, `.PokerStatusLabel`.
- **Ready/resume lists:** `.PokerReadySummary`, `.PokerSeatsList`, `.PokerSeatRow`, `.PokerSeatRow.Empty`, `.PokerSeatNumber`, `.PokerSeatName`, `.PokerSeatMeta`.
- **Table:** `.PokerTableSurface`, `.PokerTableHeader`, `.PokerPhaseLabel`, `.PokerPotLabel`, `.PokerAnnouncerOverlay`, `.PokerAnnouncerTitle`, `.PokerAnnouncerBody`, `.PokerTableFelt`, `.PokerCommunityCards`, `.PokerTableSeats`.
- **Table-edge seats:** `.PokerTableSeat`, `.PokerTableSeatCards`, `.PokerTableSeatMetaRow`, `.PokerTableSeatAvatar`, `.PokerTableSeatText`, `.PokerTableSeatName`, `.PokerTableSeatStack`, `.PokerTableSeatState`, `.PokerTableOverflow`, and position classes `.SeatTopLeft`, `.SeatTopRight`, `.SeatRight`, `.SeatBottomRight`, `.SeatBottomLeft`, `.SeatLeft`, `.SeatBottom`.
- **Cards:** `.PokerCard`, `.PokerCard.Small`, `.PokerCardRank`, `.PokerCardSuit`, `.PokerCardArt`, `.PokerCardArt.Hidden`, `.PokerCardVtexArt`, `.RedSuit`, `.BlackSuit`.
- **Player side list:** `.PokerPlayersList`, `.PokerPlayerRow`, `.PokerPlayerInfo`, `.PokerPlayerName`, `.PokerPlayerStack`, `.PokerHoleCards`, `.PokerPlayerState`, `.PokerPlayerWindowControls`.
- **Actions/history:** `.PokerActionButtons`, `.PokerActionButton`, `.PokerActionButtonLabel`, `.PokerActionHint`, `.PokerGameLog`, `.PokerLogLine`.

### Hidden/disabled patterns
- Static XML starts the main root `#PokerAnitaPanel` with `PokerHidden`; individual match-only regions such as `#PokerPlayersList`, `#PokerTableSeats`, `#PokerActionButtons`, and `#PokerEndMatchButton` also start hidden in `hud_escape_menu.xml`.
- `poker_escape_menu.js` centralizes visual state through `setPanelClass()` and the affordance helpers around `applyHiddenAffordance()` / `applyButtonAffordance()`. These helpers toggle `.PokerHidden`, `.Eligible`, `.Disabled`, and `.ReadOnly`, and also adjust `panel.hittest` so visual disabled/read-only state matches click behavior.
- `.PokerHidden` uses `visibility: collapse`, not opacity-only hiding. `.PokerFloatingWindow` starts with `visibility: collapse; opacity: 0; pre-transform-scale2d: 0.96`; `.PokerMenuVisible #Poker...Window` and `....Window.Open` restore visibility/opacity/scale.
- Disabled buttons rely on `brightness`, `saturation`, and `opacity`. Hover selectors for disabled/read-only states reset background and scale so a disabled control does not animate like an enabled one.
- Lobby metadata is intentionally compacted: within `.PokerLobbyWindow`, `.PokerAnitaEyebrow`, `.PokerPartyStatusLabel`, `.PokerProgressCodeLabel`, `.PokerResumeStatusLabel`, and `.PokerResumeLeaderList` are collapsed to `height: 0px` and `visibility: collapse`; the visible lobby surface emphasizes the button row and progress input.

### Table/card/player/action/log styling
- `#PokerTableSurface` is a mint-bordered dark panel; `#PokerTableFelt` is an oval radial-gradient green felt with `overflow: noclip` so table seats can hang off the edge.
- `#PokerCommunityCards` is centered with `ignore-parent-flow: true`, `align: center center`, `width: fit-children`, and `flow-children: right`; script renders cards there from game community state.
- `#PokerTableSeats` is an overlay plane (`ignore-parent-flow: true; width/height: 100%`). Script positions up to six table seats by applying one of the `.Seat*` classes from `TABLE_SEAT_LAYOUTS`; overflow becomes `.PokerTableOverflow` text.
- Cards are panel-composed, not CSS sprites. `createCard()` emits `.PokerCard` or `.PokerCard Small` with `.PokerCardRank`, `.PokerCardSuit`, and `.PokerCardArt > Image.PokerCardVtexArt`. The image path is `s2r://panorama/images/poker/cards/<card_face_*|card_suit_* .vtex>`. Suit color is applied via `.RedSuit` / `.BlackSuit`; VTEX mask color uses `wash-color`, and hidden/back cards use `.PokerCardArt.Hidden` with low opacity.
- The right-side full player list and table-edge mini seats share game-state classes. `.Current` adds mint border/glow, `.Folded` lowers brightness, and `.Eliminated` desaturates/dims. Side rows use `.PokerHoleCards` and `.PokerPlayerState`; table seats use avatar initials plus compact stack/state labels.
- Action buttons are regenerated every render from legal-action choices. `.PokerActionButtons` wraps right with `flow-children: right-wrap`; `.PokerActionButton.Danger` marks fold; `.ReadOnly` is used for visible non-interactive legal choices when the local client is not the actor.
- `#PokerGameLog` is a compact dark history box; `.PokerLogLine` rows are created/reused by the renderer and hidden when no game is active.

### Source 2 / Panorama CSS constraints
- Uses Source 2 Panorama-specific layout primitives: `flow-children`, `fill-parent-flow(...)`, `fit-children`, `ignore-parent-flow`, `align`, `horizontal-align`, `vertical-align`, `overflow: squish scroll`, `overflow: noclip`, `visibility: collapse`, `pre-transform-scale2d`, `wash-color`, and `gradient(...)` backgrounds.
- Window and seat positioning is margin/alignment based because standard browser CSS layout features are not assumed available in Panorama.
- Scrollable lists use `overflow: squish scroll`; fixed-height/`max-height` bounds are required for player, seat, body, and log panels.
- Image tinting depends on mask-style VTEX card art plus `wash-color`; do not replace with browser CSS filters or raw PNG references.
- Runtime classes must remain simple class names compatible with `Panel.SetHasClass`; avoid selector patterns that require DOM APIs unavailable in Panorama.

## Data & Control Flow
1. `hud_escape_menu.xml` declares Poker panels and assigns stable IDs/classes: `#PokerLobbyWindow`, `#PokerTableWindow`, `#PokerPlayersWindow`, `#PokerHistoryWindow`, `#PokerActionsWindow`, `#PokerPartyControls`, `#PokerProgressControls`, `#PokerResumeControls`, `#PokerStartButton`, `#PokerTableSurface`, `#PokerCommunityCards`, `#PokerTableSeats`, `#PokerPlayersList`, `#PokerActionButtons`, and `#PokerGameLog`.
2. `poker_escape_menu.js` caches those IDs in `IDS`, creates runtime child panels via `createPanel()` / `createLabel()`, and mutates class state via `setPanelClass()`.
3. Opening/closing the Poker menu toggles `PokerMenuVisible` on the root, `Open` on floating windows, and `Active` on `.PokerMenuButton`; CSS performs visibility/opacity/scale transitions.
4. `renderGame()` drives all styled regions: pot/phase labels, announcer, community cards, full player rows, table-edge seats, action buttons, log, progress controls, and start-button affordance.
5. `updateMatchPanels()` hides or shows match-only pieces by toggling `.PokerHidden` on `#PokerTableSeats` and `#PokerGameLog`, and by applying button affordances to `#PokerEndMatchButton` and `#PokerLeaveLobbyButton`.
6. `renderPlayers()` creates `.PokerPlayerRow` children under `#PokerPlayersList` and updates `.Current` / `.Folded` / `.Eliminated` based on game state.
7. `renderTableSeats()` creates `.PokerTableSeat` children under `#PokerTableSeats`, assigns one `.Seat*` position class, and applies the same current/folded/eliminated state classes.
8. `CardPresenter.render()` / `CardPresenter.update()` create or refresh `.PokerCard` panels and `.PokerCardVtexArt` images; CSS handles size, suit tint, rank/suit overlay, and hidden-card treatment.
9. `renderActions()` clears and rebuilds `.PokerActionButton` children from legal choices; affordance classes determine clickable, disabled, or read-only presentation.
10. `renderLog()` creates/reuses `.PokerLogLine` labels inside `#PokerGameLog` and hides the log container when no game exists.

## Integration Points
- **Layout consumer:** `poker/panorama/layout/hud_escape_menu.xml` is the static owner of IDs and base classes consumed by this stylesheet. Changing class names here requires synchronized XML and script updates.
- **Script consumer:** `poker/panorama/scripts/poker_escape_menu.js` owns all runtime class toggles and generated class names. Contract-critical constants include `CLASSES.visible = "PokerMenuVisible"`, `open = "Open"`, `active = "Active"`, `eligible = "Eligible"`, `disabled = "Disabled"`, `readOnly = "ReadOnly"`, `hidden = "PokerHidden"`, `current = "Current"`, `folded = "Folded"`, `eliminated = "Eliminated"`, `red = "RedSuit"`, and `black = "BlackSuit"`.
- **Card assets:** `.PokerCardVtexArt` expects `poker/panorama/images/poker/cards/*.vtex` referenced through `s2r://panorama/images/poker/cards/`; CSS `wash-color` assumes white alpha-mask card art.
- **Validators:** `poker/scripts/validate-poker.js` checks CSS/layout/card contracts, including card art visibility and `wash-color`; `poker/scripts/validate-poker-game.js` relies on hidden/disabled/eligible class behavior through VM panel affordance assertions.
- **Chat/state path:** Styling has no direct chat integration, but all visible state flows from the chat-driven reducer in `poker_escape_menu.js`: party/resume/progress/action chat records update state, `renderGame()` projects state into classes/text, then this stylesheet renders the visual result.
- **Non-goal boundary:** Do not place behavior, chat command semantics, game rules, or generated compiled/VPK output assumptions in this directory. Keep `poker_escape_menu.css` aligned with Panorama-supported CSS primitives and the exact class/ID contracts above.
