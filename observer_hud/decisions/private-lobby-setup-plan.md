# Private-lobby setup plan

Status: Phase 1, bans, share and reset are built and live-tested as 0.3.0 (pak10 `24687c1c`, 2026-11-03, after the user asked for bans, share, reset and a theme fit; [SPEC.md](../SPEC.md#lobby-setup), [LIVE-VERIFIED.md](../LIVE-VERIFIED.md)). Two deviations from the plan below: persistence did not move (the Escape menu, and with it the save, exists from UI start, live), and the alias button is its own layout (slot stylesheets, live). Debated with GPT-6 Astra (two rounds); the outcome of each disputed point is in [Debate outcome](#debate-outcome). Probes ran live on client 6842 ([ENGINE.md](../ENGINE.md#private-lobby-page)). Static RE of client.dll for the next features: `.scratch/lobby_re/FINDINGS.md` (m4).

## Request

User, 2026-11-03: team names, player aliases, team logos, a team swap "and more", easier to change on the fly, because in a private lobby the Escape menu cannot be opened. Design a setup menu on the private-lobby page.

## What we know

| Fact | Evidence |
|---|---|
| The HUD host (`$.OHHost`, the only state owner) loads at UI start, before any map, and lives for the whole session. So it is running while the lobby page shows. | Live 6812 ([ENGINE.md](../ENGINE.md#host-and-injection) row 1) |
| HUD → dashboard `ClientUI_FireOutput` reaches a dashboard `RegisterForUnhandledEvent` listener. | Live 6819 (match-card handoff, ENGINE.md "Hosted save page") |
| Lobby → HUD on the same channel, answered back in the same frame, before any map. | Live 6842 (P1) |
| A dashboard `CitadelHTMLPanel` loads the hpv2-store page; HUD and dashboard read the same CEF localStorage. | Live 6819 |
| The stock lobby page is `citadel_db_page_private_lobby.xml` (`CitadelPrivateLobbyPage`, `oncancel="CitadelPrivateLobbyLeave( 1 );"`), unchanged in 6842. Two 430 px team columns (`.TeamAmber.TeamCtn` / `#Team1Listing`, `.TeamSapphire.TeamCtn` / `#Team2Listing`) in a fixed 530 px `.TeamContainer` (420 px in Street Brawl), `#VersusText` between them, `.LobbyButtons` (`#SwapTeams`, `#ShuffleTeams`, `#ShuffleLanes`) and `#SpectatorListing` below, `#StartMatch` pinned to the bottom. The team titles read "The Hidden King" / "The Archmother". | Pinned copy and live 6842 |
| A filled slot has `.IsPlayer`; its `CitadelFriend#PlayerID` (and the avatar and name panels under it) exposes `accountid` and `steamid`. An emptied slot keeps the last account. | Live 6842 (P2) |
| `CitadelPartyUpdated` reaches the page on every slot change and swap; `CitadelPartyPrivateLobbyStateChanged` when the lobby is created. No polling is needed for the roster. | Live 6842 (P3) |
| Esc on the lobby page opens the stock "Leave Custom Match" confirm, not an instant leave; there is no Escape menu there. | Live 6842 |
| Whether the Escape menu opens while spectating a live lobby match. | **Unknown**: a lobby does not start with only a spectator and bots ("There are no players in this match"); needs a second human |
| An extra 52 px panel inside a team column cuts the slot list at 1600x900 (listing 378 → 335 px). | Live 6842 (P5) |
| The editor reads and writes `$.OHHost` synchronously: `edit()` clones the state, mutates, calls `setState` (`oh_menu.js:112-116`). Aliases resolve accounts by name (`oh_menu.js:346-366`). Attaching the editor starts the store and hooks match cards (`oh_menu.js:1040-1045`). | Source |
| No mod in this repo overrides the lobby page. | grep, 2026-11-03 |

## Design

### Entry points

1. **Lobby page (new override).** pak10 adds `citadel_db_page_private_lobby.xml`: the stock copy plus one script include and one host panel, pinned in `stock/` and covered by `refresh-stock.py`. This is a fourth Panorama override; AGENTS.md "Source boundaries" and SPEC "Host and injection" must list it.
2. **Escape menu (unchanged)** for edits during a match, where it opens.
3. **In-HUD button: only if probe P0 shows the Escape menu also fails while spectating a live lobby match.** Then a small `SETUP` tab in the spectator controls corner, shown only while the cursor is free, opening the same editor. Never a permanent mark on the broadcast picture.

### Lobby page layout

Nothing stock is moved or covered. Everything sits inside the stock columns or in its own row.

```text
#PlayersPanel
 ┌ .TeamAmber.TeamCtn (430) ──────┐            ┌ .TeamSapphire.TeamCtn (430) ───┐
 │ [◐] NIGHT OWLS · NOW   ●○     ✎ │            │ ✎     ○○   BRS · BRASS SAINTS [◐]│  <- OH team title, in the stock title row
 │ slot: hero | name → "Alias"  ✎  │     VS     │ slot ...                        │  <- alias chip in each filled slot
 │ ...                             │   Bo3 ▾    │                                 │
 └─────────────────────────────────┘            └─────────────────────────────────┘
 [SWAP TEAMS] [SHUFFLE TEAMS] [SHUFFLE LANES]  │  [⇄ SWAP HUD SIDES] [TOURNAMENT SETUP]   HUD linked · saved
 ┌ offer row (only when it applies) ───────────────────────────────────────────────┐
 │ Night Owls are now on Sapphire.  [SWAP HUD SIDES]  [Not now]                     │
 └──────────────────────────────────────────────────────────────────────────────────┘
```

- **Team title** (in the stock `.TeamTitle` row, team colour kept, no added height): logo or monogram (24 px, the HUD's logo rules: one `Image` per URL, shown after `ImageLoaded`, monogram otherwise), team name and tag in place of the stock title text (the stock label is hidden while an OH name is set and comes back when it is cleared), series pips (click a pip to set the score, the format caps it). The pencil opens an edit card over the column (`ignore-parent-flow`, so the slot list never shrinks): name, tag, logo URL, with the same limits and rejection notes as the editor. Reason: a 52 px header under the title cut the fifth slot at 1600x900 (P5).
- **Alias chip** in each `.IsPlayer` slot: `→ Alias` after the stock name, or a faint `+ alias`. Clicking it opens one TextEntry in that column (one at a time). The account comes from the slot's `CitadelFriend#PlayerID.accountid`, read only while the slot has `.IsPlayer` (an emptied slot keeps the last account). Own panels are created inside the slot; stock slot children are never reparented ([ENGINE.md](../ENGINE.md#post-game-page): reparenting C++-cloned children was fatal on the post-game page).
- **Format** (`Bo3 ▾`) under `VS`.
- **Our buttons** sit after the stock `.LobbyButtons`, behind a 1 px divider, in the stock `SecondaryButton` style. The label says what moves: `SWAP HUD SIDES`, tooltip "Moves team names, tags, logos, series and bans to the other side. Players stay where they are." The stock `SWAP TEAMS` moves players; the two must never look like one control.
- **Link status** at the right end of that row, in text, never colour alone: `HUD linked · saved`, `HUD linked · session only`, `HUD not linked`. While not linked every OH control is disabled and says why.
- **TOURNAMENT SETUP** opens the full editor as a modal over the lobby (phase 3).
- Sizes: body text at least 18 px, targets at least 36 px, stock typography and colours (`team1ColorDark` / `team2ColorDark` edges on the headers). Opacity-only transitions. Tab moves through the edit card in reading order; Enter commits a field (as the editor's logo URL does); Esc closes the open edit card or modal and never leaves the lobby (P4 still open). Even if Esc does reach the page, the stock asks to confirm before leaving.

### Data flow

`$.OHHost` stays the only writer. The lobby page holds a mirror and renders only what the host echoes.

- **Messages** (namespaced, validated, length-capped, like `OHM1:` match cards): lobby → HUD `OHL1:{op}`; HUD → lobby `OHL1S:{ver, host, state}` (the host sends it on every change while the lobby has said hello in the last 10 s, and on each hello). `host` is a random id per host lifetime, so replies from an old host after a reconnect are dropped.
- **Field ops** (`set` a path to a value: a team's name, tag, logo URL; series; format; event; stage): applied last writer wins. Safe because one person edits one screen.
- **Compound ops** carry the version they were computed from and are refused when the host has moved on (the lobby refreshes and the operator clicks again): `swap` (an absolute assignment of both team snapshots, so a repeated delivery is a no-op), `import` (share code), `reset`, format plus score. Reason (Astra, round 2): the host also changes state by itself; the match-end screen adds a series win (`oh_host.js` series), and a late duplicate swap must not undo that win.
- **Aliases from the lobby are keyed by account** (new op `alias {account, name, text}`): P2 showed `.IsPlayer` slots carry `accountid`. That skips `pending` entirely: the alias is durable before the match starts. A slot without `.IsPlayer` (empty or bot) gets no chip.
- **Roster reads are event-driven:** the page re-reads the slots on `CitadelPartyUpdated` and when it shows; it never polls (P3).
- **Persistence moves into the host** (a hidden store panel the host creates at boot) instead of starting when the Escape-menu editor attaches. Otherwise a lobby-only session never loads the save. The lobby page never writes the store's setup key; the board's own store panel keeps reading cards only.
- **Never use localStorage as a sync bus** between the two contexts: the save is adopted only by a fresh process before any edit (`oh_menu.js:904-911`), and a second writer would overwrite edits. P1 proved the direct channel, so none is needed. If a later client breaks the channel, the lobby controls go disabled with "HUD not linked".

### Swap and the roster offer

- `SWAP HUD SIDES` swaps name, tag, logo, series and bans as one compound op. Aliases (keyed by account) and match fields stay.
- The stock `SWAP TEAMS` is never hooked: a click is no proof of the resulting roster, and the lobby owner may be someone else.
- **Roster offer** (v1; P2 passed): the lobby compares each side's slot accounts with the last **ended** match card (SPEC "Match cards"). When at least 4 of a side's accounts belong to the team the HUD shows on the other side and at most 2 to its own, and the same holds the other way round, the offer row appears. On click it re-checks the roster signature and the setup version; if either moved, the offer goes. No offer when accounts are missing or ambiguous, and none when the HUD's sides already match the players.

### Scope

- **Phase 1 (v1, inline):** team titles (name, tag, logo, series), format, alias chips (account-keyed), `SWAP HUD SIDES`, roster offer, link status, host-owned persistence.
- **Phase 2 (v1):** `CLEAR BANS` for the next map, share-code import in the lobby.
- **Phase 3:** `TOURNAMENT SETUP` loads the existing `editor.xml` in the lobby through a port seam: the editor talks to a `Port` (`getState`, `apply(ops)`, `version`, `onChange`, `roster`, `accountOf`, `logoState`, `sides`, `card`, `onCard`, `carried`), with a HUD port (direct `$.OHHost`) and a lobby port (mirror, diff ops against the last echoed state, compound ops queued with their base version). Store start and card hooks leave `$.OHMenuAttach`. Logo status in the lobby reports the lobby's own load, labelled as such. One editor codebase; no second tabbed dock.
- **Later:** named team presets, handing the lobby's 12 accounts to the host so cards join before the markers arrive, in-HUD button (only if P0 needs it).

## Probes

Run 2026-11-03 on client 6842 with a temporary probe pak10 (`.scratch/lobby_probe/`, removed afterwards; pak10 was not installed before or after): runs 1-5 windowed with background input, runs 6-8 fullscreen 1920x1080 with foreground input and two bot lobby matches, run 8 with no other VPK installed. Details: [ENGINE.md](../ENGINE.md#private-lobby-page).

| # | Unknown | Result |
|---|---|---|
| P0 | What "cannot open the Escape menu" covers | Lobby screen: confirmed, no Escape menu; Esc asks to leave the lobby. While spectating a live lobby match: **not tested**, a lobby will not start with only a spectator and bots. Needs a second human on a team, or the user's report. As a player in a lobby match the in-game menu opens; its EDIT ROSTER does not lead to the lobby page. |
| P1 | Lobby ↔ HUD channel | **Works** both ways in the same frame: in the lobby, during a lobby match and after leaving it (same page instance). |
| P2 | Slot accounts | **Yes**: `accountid` and `steamid` on `CitadelFriend#PlayerID` and its avatar and name panels; read only from `.IsPlayer` slots (emptied slots keep the old account). Swap moves the account with the player. A second human was not available. |
| P3 | Roster events | `CitadelPartyUpdated` on every slot change, swap and mode change; `CitadelPartyPrivateLobbyStateChanged` on creation and start; `CitadelAssignedGameLobby` / `CitadelGameLobbyUpdated` on start; `CitadelLeftGameLobby` on leave. |
| P4 | Esc and typing on the lobby page | **Esc follows focus**: our focused entry or panel gets its `oncancel` and the lobby stays; with nothing of ours focused, the stock leave confirm opens. So every OH edit card takes focus and closes on its own `oncancel`; no stock `oncancel` change is needed. Typing and Enter work before any match. **After returning from a match no typed character arrived** (Esc did); unknown whether the game or the injected input caused it. |
| P5 | Layout | A 52 px header under the team title cuts the slot list at 1600x900, 1920x1080 and in Street Brawl, so the design puts the team name in the title row and opens edits as a card over the column. |

Still open before release: P0 (spectating a lobby match; needs a second human), and typing after a match with a real keyboard. If text input really dies after a match, the lobby's text fields need a fallback (pasting a share code is also text), and the click-only controls (swap, series pips, format) are unaffected.

## How it can fail

| Failure | Guard | Validator check |
|---|---|---|
| Esc in an edit card leaves the lobby | P4 result; own focus first; the stock confirm is the last guard | VM: cancel with an edit card open closes the card, the leave event is not fired |
| A late or repeated swap reverses a later edit or a match-end win | Compound ops carry a base version; swap is an absolute assignment | VM: duplicate swap after a series change is refused |
| Messages from an old host lifetime applied after a reconnect | `host` id in every echo and op | VM: op with an old host id ignored |
| Forged or oversized `OHL1:` messages from another mod | Prefix, length cap, `$.OHState.normalize` on every value | VM: bad shapes refused whole |
| A guessed account puts an alias on the wrong player | Accounts only from `.IsPlayer` slots; an emptied slot's stale account never read; bots never keyed | VM: an emptied slot with an old account gets no chip |
| The offer is stale when clicked | Re-check roster signature and version on click | VM: roster change between show and click withdraws the offer |
| A lobby-only session never loads the save, or overwrites it | Persistence in the host; lobby never writes the setup key | VM: lobby edit before the save reply wins; save adopted once |
| A stock lobby patch breaks the override | Stock pin plus `REBASE NEEDED`; the override changes only the script include and the host panel (P4: no `oncancel` change needed) | `refresh-stock.py --check` in the build |
| Another mod overrides the lobby page | pak order decides; the HUD keeps working without the lobby page | Release note |
| Hidden lobby page costs time | No polling; `CitadelPartyUpdated` and page show drive every read | `lobby:` budget check (hidden page: 0 writes, under 6 weighted µs/s) |
| Swap label confused with stock Swap Teams | Distinct label, divider, tooltip | — (live screen in P5) |

## Debate outcome

| Point | Astra | Outcome |
|---|---|---|
| Entry point | Lobby override plus the existing Escape entry; in-HUD only if the problem reproduces | Agreed |
| One writer | `$.OHHost` only; no localStorage sync bus; persistence out of editor attachment | Agreed |
| Protocol | Started with epochs, request ids and stale rejection for every op | Field ops last writer wins; base version only for compound ops; host id per lifetime |
| Lobby UI | Started with a 440 px dock with four tabs | Inline controls in the stock columns plus the existing editor through a port (Astra agreed; listed the port's extra methods and the by-name alias seam) |
| Stock Swap Teams | Never hooked | Agreed |
| Roster offer | First "later"; then agreed for v1 as an offer with revalidation, named "swap sides", not "swap names" | v1 (P2 passed live) |

## Open decisions for the user

1. P0: does the Escape menu also fail while you spectate a live lobby match, or only on the lobby screen? (The lobby screen is confirmed; the other case needs a second player to test.)
2. Adding the lobby-page override (a fourth stock layout pak10 replaces). pak10 wins over another mod's lobby page in a higher-numbered pak and loses to one in a lower-numbered pak.
3. The swap label: `SWAP HUD SIDES` (proposed) or another wording.
4. Release: fold into the unreleased 0.2.0, or ship as 0.3.0 after 0.2.0.
