# Profile Stats Community

## Authority

The stock base is SteamTracking/GameTracking-Deadlock commit `c34d25e806a6410f00037d34782d45fe2b9f550f`, specifically `game/citadel/pak01_dir/panorama/layout/citadel_db_page_profile.xml`, `panorama/layout/citadel_ui_context_menu_player.xml`, `panorama/layout/profile_card.xml`, and `panorama/styles/citadel_db_page_profile.css`. Refresh stock layouts from that commit before changing them. Keep stock roots, async bindings, snippets, IDs, and hierarchy. The profile page adds only `profile_stats_community.vcss_c` and `profile_stats_community.vjs_c` after the compiled stock style includes. The context menu loads `profile_stats_community_context_menu.vjs_c`; the player card adds only the hidden selected-account witness.

## Runtime seam

The stock page owns profile loading, match history, hero rows, and navigation. The module keeps `#HeroList` stock-owned, adds an ignored-flow `Stats vs Community` sibling in `#StatsContent`, and gives `#HeroList` local top spacing so native rows begin below it. The comparison panel overlays `#StatsBlock` without changing stock visibility. Its fixed, non-scrolling grid is two columns by three rows: Performance|Scoreboard, Accuracy & KD|Damage, Economy|Healing. Every metric row has player, community, and percentile cells. `AVG` / `PERCENTILE` changes display only, defaults to `PERCENTILE`, and never requests data.

Identity is viewed-profile-only and comes from the private policy in `scripts/viewed-profile-identity-policy.js`, composed into both runtimes before Closure. `#ProfileStatsCommunityAccount` is the required `{i:r:account_id}` witness; root `accountid`/`steamid` may corroborate it. All present witnesses must normalize to the same unsigned 32-bit Steam AccountID; malformed or conflicting evidence fails closed. Names and local-player state are display-only or out of scope. The StatLocker link rereads the witness at activation.

The player context menu has one static `Player Profile` row after the stock-owned `#MenuOptionsPanel`. Its runtime rereads the selected card witness and dispatches `CitadelShowProfilePageForAccount`; it does not poll, schedule, fall back to the local player, or open an external URL. The card keeps engine-owned `#ShowcaseItems` and `#StatItems`; the stylesheet only restores `#CardMain` for populated cards.

Production logging is disabled. The comparison runtime has one 0.5-second watcher only while its view is open; stock and disabled states have no recurring callbacks. The stock XML owns `oncancel="CitadelNavigateBack();"`; runtime code never replaces it. Restoration cancels the watcher and unloads both hidden `CitadelHTMLPanel` instances to `about:blank`. Active five-second windows keep one pending watcher and stay within the established bounded panel-read budgets.

## Bridge contract

The bridge URL is `https://hantu-raya.github.io/deadlock-stats-bridge/bridge.html?account_id=<id>&matches=<50|100|150>&mode=<ranked|standard>&protocol=4&request=<nonce>`. `standard` is the UI name for the API's `unranked` mode. Register only the proven `HTMLTitle` and `HTMLURLChanged` events, each behind `try/catch`; the panel is noninteractive. Titles are hostile input: cap at 2048 code units, require `DLSTATS2:`, validate the exact envelope and finite values, and ignore duplicates and restored normal titles.

Protocol v4 success payloads keep the existing envelope and contain six ordered groups. Each group has exact keys `id` and `metrics`; each metric is the exact four-item tuple `[id, player, community, percentile]` with nullable finite player/community values and a percentile from 0 through 100. The ordered groups are `performance` (`kda`, `kills_plus_assists`, `player_damage_per_health`), `scoreboard` (`average_kills`, `average_deaths`, `average_assists`), `accuracy_kd` (`accuracy`, `critical_hit_rate`, `kd`), `damage` (`player_damage_per_minute`, `damage_taken_per_minute`, `objective_damage_per_minute`), `economy` (`net_worth_per_minute`, `average_last_hits`, `average_denies`), and `healing` (`self_healing_per_minute`, `player_healing_per_minute`, `heal_prevented`). Damage-taken percentile is raw and displayed `HIGHER`/`LOWER`; average deaths is lower-is-better in bridge analysis. Protocol v2 and v3 payloads remain unchanged elsewhere.

## Development and packaging

`panorama/scripts/profile_stats_community.js` and `panorama/styles/profile_stats_community.css` are canonical comparison sources. `scripts/viewed-profile-identity-policy.js` is the canonical identity policy. `showrank_barebones` composes these sources through `scripts/profile-stats-community-composition.js`; edit canonical files, not placeholders. The profile module is dependency-free at runtime. Run focused source checks with `npm test`, `npm run lint`, and `npm run validate`; lint uses the module-pinned Oxlint 1.79.0 config and `eslint/complexity` modified variant max 20.

Treat API metric IDs, group IDs, modes, and error codes as external protocol keys. Keep dynamic lookup keys quoted so Closure `ADVANCED` cannot rename them. The five profile build wrappers must retain every key in their Closure allowlists and reject minified output that renames one. Package only the six required compiled assets into root `pak80_dir.vpk`; never include source, tests, metadata, AGENTS, bridge files, or generated output.

## Required user smoke

Open another player's context menu and confirm `Player Profile` opens that player's in-game profile database page, then confirm stock actions and the profile card still work.

After a fresh game restart, open a viewed profile and confirm the pinned `Stats vs Community` row leaves native hero rows as `#HeroList`'s only direct children, the hidden witness selects the viewed account, and no local-player data appears. Open it and verify the viewed name, both player headings, and StatLocker account. Confirm the fixed two-column by three-row grid shows all six groups and 18 metrics without scrollbar, clipping, or overlap; Damage contains player damage, damage taken, and objective damage; Economy contains net worth, last hits, and denies; Healing contains self healing, player healing, and heal prevented. Confirm `PERCENTILE` is selected initially, AVG/PERCENTILE makes no request, damage taken uses raw HIGHER/LOWER and is excluded from its group average, and other badges use TOP/BOTTOM.
