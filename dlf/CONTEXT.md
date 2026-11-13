# DLF observer HUD language

The vocabulary of the DLF broadcast banner, the editor, the debuff column and the spectator VData.

## Match and banner

**DLF**: The league this pak serves. The pak is installed on the observer's PC only.

**Observer**: The person spectating and broadcasting. Not a player; the pak is not for playing matches.

**Match state**: The one record of everything the editor edits and the banner shows: season, match, series format, both teams, banner style, DEV settings, soul graph settings and account aliases. It is normalized field by field against the defaults in `match.json`.

**Banner**: The 1920x100 art above the top bar with its text, bans and logos. Its geometry is in [design.md](design.md#banner).

**Season / Match**: The numbers in `SEASON n` and `MATCH #n` (0-9999).

**Series format**: The free text under the score, such as `Best of 1`.

**Team**: The absolute Amber (`TeamFriendly`, the Hidden King) or Sapphire (`TeamEnemy`, the Archmother) team. Names, scores, logos and emblems follow the team.
_Avoid_: Side.

**Side**: Left or right of the screen. The stock CSS puts `.friend`/`.team1` left and `.enemy`/`.team2` right; DLF never keys anything on it.

**Ban**: One of the three hero portraits per team shown over the banner's red boxes (two until 2026-10-28).

**Emblem**: A team's default faction logo from the PSD. A **web logo** (a URL the editor holds) replaces it once the image loads; a failed load keeps the emblem. The DLF logo is part of the art between the scores.

**Band**: A fixed text area of the banner art. A label is sized to fit its band by whole font sizes, not by the engine's shrink.

**Style section**: One group of banner text with its own font, size, offsets and spacing: event (season/match), team names, player names, scores, series format.

**Card**: A stock top-bar player card (88 px). The banner places each player name under its own card, and the debuff column and ult counter hang off the card.

**Roster**: The live game names per team slot, read from the cards by the banner.

**Game name**: The name the game shows for a player. Never renamed on the top bar.

**Alias**: A banner name typed in the editor (up to 16 characters). An **account alias** belongs to a Steam account and follows the player to any slot; a **session alias** is for a player without an account (a bot) and belongs to a slot for the session.

**Account**: A player's Steam account id, learned when the editor opens by briefly opening profile cards.

## Editor and save

**Editor**: The DLF BROADCAST panel in the Escape menu: tabs MATCH, TEAMS, PLAYERS, SOUL GRAPH, STYLE, SHARE / SAVE, DEV over a fixed page area.

**Page**: One tab's content. The hero picker temporarily replaces the page area.

**Store page**: The hosted `https://hantu-raya.github.io/hpv2-store/dlf/` page behind the hidden `#DLFStore` panel, which holds this PC's one save record.

**Save record**: `DLFS1.<fnv1a32>.<json>`, one key `hantu.dlf.v1/match`. **Blocked** means the stored record is damaged or newer, so only RESET overwrites it; **unavailable** means the page is unreachable and the session works without saving.

**Share code**: `DLFC1.<fnv1a>.<base64url JSON>`, a copy of the save plus this session's names, for another PC.

**Forget**: Delete this PC's save with op `d`, leaving the defaults.

**Reset**: Replace the settings with the defaults (it also clears a blocked store).

## Top bar

**Pickup ring**: HPv2's top-bar buff ring on a card, composed into DLF at build time under `DLF_` message names.

**Ult counter**: The seconds shown under a card's ultimate icon, copied from the game's `ult_cooldown`.

**Debuff column**: Up to six icon slots under each card (four until 2026-10-24). A **slot** shows one status of one listed ability.

**Applying team**: The team that caused a debuff. A debuff takes its colour; a listed buff takes the hero's own.

**Status**: One panel in a unit's world healthbar status list (`status_<id>`). A **stun** is a status with the `stunned` class; it is its own item, apart from the ability's other effects.

**Key**: The status panel id minus `status_`, up to the first `/`. It names the ability.

**Countdown**: The seconds on a slot, predicted from three samples of the native radial and shown only when the full turn is at most the ability's `maxSeconds`; it reads one second longer than the predicted end.

**Pulse / hit**: For a spec ability with `pulse: true` (Celeste's Shining Wonder), a **hit** is a status panel appearing or its radial restarting; each hit pulses the slot once.

**World bar / hero bar**: A unit's world healthbar context. A hero bar has `CLASS_PLAYER` on its world panel (or on the dialog) and is scanned; other bars only re-check their class, every 2 s at most.

**Purchase notice**: An item card on the buyer's top-bar card, from the stock shop list (`dlf_buys.js`, Observer HUD's rewrite of bytenode's recent-purchase feature).

**Sampler**: `dlf_debuff_world.js`, which reads a hero bar's statuses on the DEV poll interval and publishes a snapshot.

**Snapshot**: The message `DLF_DEBUFF_SNAPSHOT { source, instance, seq, at, name, items }` that a hero bar sends to the top bar through a **relay** (a sibling layout, never the bar's own panel).

**STATUS LOG**: The DEV diagnostic that prints statuses and the snapshot path to the console.

## Soul graph

**Soul lead**: Amber's souls minus Sapphire's, read from the stock top-bar soul plates.

**Sample / mark / pin**: A **sample** is one reading per 5 s of game time. A **mark** is a multiple of the interval (1, 2, 3, 5 or 10 min). The **pin** for a mark is the first sample within 20 s after it. The graph is the run of consecutive pinned marks ending at the latest.

**Preview**: The 8 s display after any graph setting changes, with sample data labelled PREVIEW before there are two pins.

## Spectator VData

**Spectator VData**: `abilities.vdata_c` and `modifiers.vdata_c`, rebuilt from the installed game with `spectator-status.json` so world healthbars list the modifiers the column draws.

**Spec**: `spectator-status.json`: the listed abilities (and `maxSeconds`, `buff`, `stun`, `minStacks`, `ignoreClasses`), `genericModifiers`, `classSwaps` and `unnamed`. It is the allow-list for the column and is shared with Observer HUD.

**Unnamed modifier**: A listed modifier with no English name. It is also set to `DISPLAY_HUD_NONE` so the watched hero's own HUD does not print its token.

**Class swap**: Replacing a modifier's client class in the VData, used for Bebop's hook target.

## Build

**Stage**: The `_dlf_build/` copy of the source where generated scripts are written and Closure runs.

**Closure output contract**: The per-script list in `Get-HpColorsRewriteClosureContract` of runtime names that must survive minification (for example `DLFSoulGraphStop`, `DLF_DEBUFF_SNAPSHOT`); the output must also be smaller than its source.

**Release 7z**: `dist/DLF_Observer_Mod_<yy.MM.dd>.7z` with root `game\`: pak01 and three loose fonts.
