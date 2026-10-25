# Store v2 on its own path, and match cards keyed by accounts

Team names and logos for the post-game board need data that outlives a spectated match, and that the dashboard (a separate Panorama context) can reach. The plan ([decisions/postgame-identity-perf-plan.md](../../decisions/postgame-identity-perf-plan.md) decisions 4-5, probes P3 and P7) settled the shape; this ADR records the choices made when it was built (2026-10-25).

**Decisions**

1. **A new page at `/oh/v2/`, not a changed `/oh/`.** The released 0.1.0 pak speaks `OHS1:` to `https://hantu-raya.github.io/hpv2-store/oh/` and reads `hantu.observer_hud.v1/state`. That page stays byte for byte. The v2 page (source `D:/hpv2-store/oh/v2/index.html`) shares the origin, so it can read v1's key once to migrate (`r` returns it with `f: 1`; the next save writes the v2 key), and it never writes it. Keys: `hantu.observer_hud.v2/state` (the setup record, same `OHS1.<fnv1a32>.<{s:1,state}>` format, cap 8192) and `hantu.observer_hud.v2/matches`.
2. **Replies stay under the game's 4096-character `HTMLTitle` cut (P7).** The state is read in pieces (`r` with `s` = offset, each reply sized to fit), which also fixes the v1 bug that a record over about 4000 characters saved but never read back. A card is asked for by its accounts (`q`), never by reading the whole key.
3. **The match card.** `{ a, b, t, r, w, id, at }`: the accounts of each side, the two team snapshots (name, tag, logo URL), the organiser, the winner, an optional match id, a time. The HUD writes it once both sides have at least 5 known accounts (again when the account set grows) and again at match end. A match is found by sharing at least 10 of its 12 accounts; the side comes from the players, not the card's order. A card written for an exact match id wins over an id-less one.
4. **Compact storage with a cap.** `matches` holds deduped teams `T` and matches `m` referencing them by index (about 180 characters a match). The cap is 32768 characters: the oldest cards go first, and teams no card uses are not stored. The upsert (`u`) reads, merges and writes inside one request, so two writers cannot lose each other's card.
5. **Same-process handoff first.** The HUD sends the latest card as `OHM1:<json>` on `ClientUI_FireOutput` (P3) every 5 s while it has one. The board loads only when the post-game page first shows, so it cannot rely on a single message. The store is the second source: the dashboard makes its hidden `CitadelHTMLPanel` only when the page shows and no handed card fits, asks once, and goes back to `about:blank`. The header renders the stock names first and swaps when a card lands.
6. **Everything on the channel is untrusted.** Both sides run the same `cleanCard` (`$.OHState`): bad shapes, sizes over 2400 characters, repeated or invalid accounts and wrong team entries refuse the whole card; names that are too long and URLs that are not plain http(s) become empty, so the stock text and wordmark stay. The page cleans again on upsert.
7. **Untouched sample names are never written.** A team still named by the sample (`Night Owls` / `NOW`, `Brass Saints` / `BRS`, the sample organiser) with no logo is left out of a card, so an observer who never set a team up does not rename every board.

**Consequences**

- Both pages must stay published while 0.1.0 is in use. Removing `/oh/` breaks the released pak.
- A custom logo uses its own class and replaces the wordmark only after `ImageLoaded`; a failed one is deleted and the wordmark stays. Logo URLs are never logged.
- An offline store costs the HUD a few retried requests per card (then nothing) and the board at most a few hellos per match; the handoff still works.
- Publishing the page, and the probe path used to test it first (`oh/v2-test/`, own `v2test` keys, removed afterwards), needed the user's approval (given 2026-10-25).

Sources: [SPEC.md](../../SPEC.md#local-save), [SPEC.md](../../SPEC.md#match-cards); [ENGINE.md](../../ENGINE.md#post-game-page); `observer_hud/panorama/scripts/observer_hud/oh_menu.js`, `pg_board.js`, `oh_state.js`.
