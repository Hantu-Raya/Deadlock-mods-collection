# Profile Stats Community

## Authority

The stock base is SteamTracking/GameTracking-Deadlock commit `c34d25e806a6410f00037d34782d45fe2b9f550f`, specifically `game/citadel/pak01_dir/panorama/layout/citadel_db_page_profile.xml` and `panorama/styles/citadel_db_page_profile.css`. Refresh the layout from that commit before changing it. Keep the stock root, async bindings, snippets, IDs, and hierarchy; the only authored includes are `profile_stats_community.vcss_c` and `profile_stats_community.vjs_c` after the compiled stock style includes.

## Runtime seam

The stock page remains the owner of profile loading, match history, hero rows, and navigation. The module keeps `#HeroList` stock-owned (its direct children are native hero rows), adds an ignored-flow `Stats vs Community` sibling in `#StatsContent` pinned over the list top, and gives `#HeroList` local top spacing so native rows begin below it. It then toggles the visible contents of `#StatsBlock` between stock `#StatsTitle`/`#StatsLeft`/`#StatsRight` and the local comparison panel. It uses direct known-panel references. A bounded direct-child check (maximum 64 children) may notice a focused/selected stock hero row; there is no dashboard scan.

Identity is viewed-profile-only: `#ProfileStatsCommunityAccount` is the required `{i:r:account_id}` witness. Root `accountid`/`steamid` can corroborate it; missing or mismatched evidence fails closed. The local player is never an identity source. Every request, schedule, HTML callback, profile change, filter change, Retry action, and page-leave path is generation-checked. The custom panel has no Back control. A different stock hero selection or profile restores the stock panels, while stock page cancel restores them and navigates. Closing or invalidating a request sends the hidden `CitadelHTMLPanel` to `about:blank`.

Production logging is disabled. The single 0.5-second watcher exists only while the custom comparison view is open; stock mode and disabled mode have no recurring callbacks. Closing the view cancels the watcher and sends both hidden `CitadelHTMLPanel` instances to `about:blank`.
## Bridge contract

The bridge URL is `https://hantu-raya.github.io/deadlock-stats-bridge/bridge.html?account_id=<id>&matches=<50|100|150>&mode=<ranked|standard>&request=<nonce>`. `standard` is the UI/product name for the API's `unranked` match mode. Only the proven `HTMLTitle` and `HTMLURLChanged` events are registered, each behind `try/catch`; the panel is noninteractive. Titles are hostile input: cap at 2048 code units, require the `DLSTATS2:` prefix, validate exact `v`, `kind`, `request`, `account`, `matches`, `mode`, `sample`, `generated`, group order, metric IDs, types, and finite values, and ignore duplicate deliveries/restored normal titles. A success payload has six groups in order: `combat` (`kd`, `kda`), `kills` (`average_kills`, `average_assists`), `survival` (`average_deaths`, `damage_taken_per_minute`), `damage` (`player_damage_per_minute`, `accuracy`, `critical_hit_rate`), `economy` (`net_worth_per_minute`, `boss_damage_per_minute`), and `sustain` (`healing_per_minute`). Errors use only the bridge allowlist `invalid_query`, `network_error`, `upstream_error`, `rate_limit`, `empty_sample`, `invalid_payload`, `payload_too_large`, `internal_error`, with optional bounded status/retry data. Cache only a validated same-account, same-limit, same-mode result for ten minutes; never render cross-account, cross-filter, or stale data.

## Development and packaging

### Closure boundary

Treat API metric IDs and error codes as external protocol keys. Any object read with `map[externalKey]` must declare those keys as quoted literals so Closure `ADVANCED` cannot rename them. Source-level VM tests are insufficient proof because they run before Closure. The wrapper must reject minified output that does not retain every dynamic key, and package verification must inspect the compiled VJS when renderer behavior differs from source tests. An Accuracy-only table is the known signature: Closure previously renamed every metric-map key except `accuracy`, so the other labels kept their XML dash placeholders. Start diagnosis at the compiled map rather than the API payload, panel references, or an assumed panel-ID limit.

Run the module wrapper from the repository root:

```powershell
powershell -ExecutionPolicy Bypass -File build_profile_stats_community.ps1
```

It compiles and packs only the three required assets into root `pak80_dir.vpk`. `pak80` is a standalone addon slot: do not merge this module into another VPK, inspect or replace another addon, or put raw source, tests, package metadata, AGENTS, bridge files, or generated output in the package. The module runtime has no dependencies; `npm test` and `npm run validate` are focused local checks only.

## Required user smoke

After a fresh game restart, open a viewed profile and confirm the native `Stats vs Community` row is pinned over the top of `#HeroList` while native hero rows remain its only direct children, the hidden witness selects the viewed account, and no local-player data appears. Open it and verify loading, valid six-group rendering with both averages, sample/generated labels, null values, explicit API/transport/empty/rate-limit/invalid-payload messages, and Retry. Switch between Ranked and Standard and select 50, 100, and 150 matches; each combination must start a new request, show the active mode/count, and never display data from the prior filter. Confirm there is no custom Back control. Change profiles and select a stock hero while the panel is open; require stale callbacks and old data to disappear, stock panels/styles to return, and the bridge to unload to `about:blank`. Repeat with a second account to prove the ten-minute cache never crosses accounts or filter combinations. Packaging proof is separate from this in-game proof.
