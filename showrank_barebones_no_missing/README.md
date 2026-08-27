# ShowRank Barebones — No Missing Alerts

`showrank_barebones_no_missing` is the rank-only edition. It adds rank images to profile cards, the dashboard profile page, player context menus, top-bar slots, team averages, and the Escape player list. It also provides `Stats vs Community` for the viewed account. It contains no missing-lane indicator, clock polling, portrait darkening, or enemy-missing announcement.

## Source ownership

The comparison implementation lives in `profile_stats_community/panorama/scripts/profile_stats_community.js` and `profile_stats_community/panorama/styles/profile_stats_community.css`. Its viewed-profile identity policy lives in `scripts/viewed-profile-identity-policy.js`. The runtime and stylesheet in this package retain composition placeholders; tests and the staged build resolve them through `scripts/profile-stats-community-composition.js` with this package as the host root. Do not copy the canonical implementation into the source templates.

The host owns one top-bar evidence snapshot and one match-centric roster model per Escape or cache-replay pass. It owns duplicate hero/account rejection, direct witness assignment, cache validation, team-average inputs, stale classification, and the shared Escape readiness decision. Escape callers do not maintain parallel row, top-bar, count, or account-map representations. Passive top-bar evidence never creates an account ID.

## Build

From the collection root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\build_showrank_barebones_no_missing.ps1 -KeepStaging
```

Add `-Install` to replace the active `citadel/addons/pak89_dir.vpk` after validation and packaging. Deadlock must be closed during installation.

The build artifact is `showrank_barebones_no_missing_dir.vpk`.

The builder stages only this package's authored assets, composes the readable runtime and stylesheet, runs Closure Compiler ADVANCED on the staged runtime, then compiles and validates the Source 2 outputs. `-KeepStaging` retains the composed readable runtime and staged build source.

## Validation

```powershell
npm --prefix .\showrank_barebones_no_missing run validate
```

## Editions

| Project | Missing-lane UI | Build artifact |
| --- | --- | --- |
| `showrank_barebones` | `MISSING` portrait indicator and hero-icon announcement | `showrank_barebones_dir.vpk` |
| `showrank_barebones_no_missing` | None | `showrank_barebones_no_missing_dir.vpk` |

Both editions override the same Panorama resources and install as `pak89_dir.vpk`; install only one at a time.
