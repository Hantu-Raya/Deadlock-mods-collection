# ShowRank Barebones

`showrank_barebones` is the full barebones ShowRank edition. It adds predicted-rank images to profile cards, dashboard profile pages, player context menus, top-bar slots, team averages, and the Escape player list. It also provides the early-lane `MISSING` portrait indicator and the shared enemy-missing hero-icon announcement.

The dashboard profile page also includes `Stats vs Community` for the viewed account. The player context menu keeps StatLocker and account-copy actions, and adds `Player Profile` through the same selected-account checks. These features ship in the ShowRank package. No separate Profile Stats VPK is required.

## Source ownership

The comparison implementation lives in `profile_stats_community/panorama/scripts/profile_stats_community.js` and `profile_stats_community/panorama/styles/profile_stats_community.css`. Its private viewed-profile identity policy lives in `scripts/viewed-profile-identity-policy.js`. The barebones runtime and stylesheet contain host placeholders. `scripts/profile-stats-community-composition.js` resolves them in tests and in the staged build. Do not copy the canonical implementation back into the barebones files.


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
