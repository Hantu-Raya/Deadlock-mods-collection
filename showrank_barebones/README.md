# ShowRank Barebones

`showrank_barebones` is the full barebones ShowRank edition. It adds predicted-rank images to profile cards, dashboard profile pages, player context menus, top-bar slots, team averages, and the Escape player list. It also provides the early-lane `MISSING` portrait indicator and the shared enemy-missing hero-icon announcement.

The dashboard profile page also includes `Stats vs Community` for the viewed account. The player context menu keeps StatLocker and account-copy actions, and adds `Player Profile` through the same selected-account checks. These features ship in the ShowRank package. No separate Profile Stats VPK is required.

## Party stacks

After the Escape scan has verified all twelve accounts and both team sides, a hidden HTML panel loads `party.html` from the `deadlock-stats-bridge` GitHub Pages site. The page reads Steam friend lists from deadlock-api and groups players who are friends on the same team. Each group member's Players row gets a stack of stock `icon_player` icons, one per group member, to the left of the rank badge. Each group gets its own color: yellow, blue, red, green, purple, then orange.

This is a heuristic. Steam friends matched onto the same team by chance look like a party, and players with private friend lists on both sides are missed. No stack means "not detected", not "solo". Results stay cached for the rest of the match; hideout clears them. HP Colors v2's composed Escape menu has no party bridge, so stacks don't appear there.

## Rank History

The dashboard profile page has a `Rank History` tab next to `Match History` and `Showcase`. It draws the viewed player's ranked badge after each match, oldest to newest, with tier badges, tier lines and dates. `Group by` averages 1, 5, 10 or 25 games per point. The chart comes from the `rank-history.html` page on the `deadlock-stats-bridge` GitHub Pages site, which reads deadlock-api match history.

Opening a profile keeps the stock match history. When match history fails to load, Rank History opens on its own in that space instead of the "FAILED TO LOAD MATCH HISTORY" text.

When the profile's all-time stats load with no games played (for example a private profile), `VS COMMUNITY` opens on its own. It opens once per visit, so picking a hero or All Heroes returns to the stock stats.

## Playstyle radar

Below the player's name and avatar, a hexagon radar compares the viewed player with the community over the last 30 days of ranked and standard matches. Each axis is where the player's average sits among community values (50 = typical): Damage Dealer (damage per minute), Farming (net worth per minute), Tank (damage taken per minute, which also rises when feeding), Support (healing per minute), Pusher (objective damage per minute) and Early Impact (net worth and kills + assists at 10:00). The highest axis is highlighted. It describes activity, not skill.

## Scoreboard profile links

On the post-game and match-details scoreboard, clicking a player's name opens that player's profile. Hovering the name underlines it. Bots have no link. The account comes from the scoreboard's own name panel at click time, so a row reused for another match opens the right player.

## Source ownership

The comparison implementation lives in `profile_stats_community/panorama/scripts/profile_stats_community.js` and `profile_stats_community/panorama/styles/profile_stats_community.css`. Its private viewed-profile identity policy lives in `scripts/viewed-profile-identity-policy.js`. The barebones runtime and stylesheet contain host placeholders. `scripts/profile-stats-community-composition.js` resolves them in tests and in the staged build. Do not copy the canonical implementation back into the barebones files.

The barebones host owns one private top-bar evidence snapshot and one match-centric roster read model per Escape or cache-replay pass. The model exposes probe records, row-to-topbar matches, and readiness facts. It owns hero coverage, duplicate hero/account rejection, Direct witness assignment, cache validation, team-average inputs, and stale classification. Escape callers no longer maintain parallel row, topbar, count, target, or account-map representations.

Panorama traversal and writes remain in the adapter code. A complete twelve-player pass scans each roster class once, reads each row hero once while building the model and once during atomic freshness validation, then allows one bounded replacement read if the panels changed. This reduced the measured complete-pass row reads from 156 to 24 and total text reads from 228 to 96 without changing the 14-callback schedule. Cache replay remains one topbar scan, no row scan, and no callbacks. Passive top-bar evidence never creates an account ID; only a Direct profile witness or the previously verified pure `{ hero, account }` cache can fill a match.

The host also owns one private ES5 Escape readiness module. Its single `classifyEscapeReadiness(input)` interface consumes explicit source, lifecycle, and roster-readiness facts and returns a closed preload, probe, replay, retry, finish, or stop decision. Passive top-bar evaluations remain blocked; initial open and close/reopen retry remain Explicit Escape intent. Barebones has no top-bar spinner/status surface, so every readiness decision forbids spinner writes. Panorama scans, schedules, Players-tab and row dispatches, rank and average writes, and native context cleanup remain in adapters.

## Credit and version

The bottom-right corner of the dashboard profile page shows `ShowRank v<version> · made by hanturaya`. Clicking `hanturaya` opens https://x.com/hanturaya. The version is `package.json`'s `version`; when releasing, bump it and the credit label in `citadel_db_page_profile.xml` together. The runtime test fails if they differ.

## Build

From the collection root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\build_showrank_barebones.ps1 -KeepStaging
```

Add `-Install` to replace the active `citadel/addons/pak89_dir.vpk` after validating and packaging the project. Deadlock must be closed during installation.

The build artifact is `showrank_barebones_dir.vpk`.

The builder composes the readable canonical comparison sources into the staged runtime and stylesheet, then runs Closure Compiler ADVANCED before Source 2 compilation. `-KeepStaging` retains the composed readable runtime and the minified staged source for inspection.

## Validation

```powershell
npm --prefix .\showrank_barebones run validate
```

## Editions

| Project | Missing-lane UI | Build artifact |
| --- | --- | --- |
| `showrank_barebones` | `MISSING` portrait indicator and hero-icon announcement | `showrank_barebones_dir.vpk` |
| `showrank_barebones_no_missing` | None | `showrank_barebones_no_missing_dir.vpk` |

The editions override the same Panorama resources and install as `pak89_dir.vpk`. Install only one edition at a time.

The no-missing tree is generated from this module: `node scripts/showrank-barebones-editions.js` (from the collection root) removes the regions marked `[no-missing: cut begin]` ... `[no-missing: cut end]`. Build it with `build_showrank_barebones_no_missing.ps1`.
