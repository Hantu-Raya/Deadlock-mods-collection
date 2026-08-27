# Topbar Rank Barebones

## Product boundary

`topbar_rank/` is the alert edition of the V40D Top Bar Plus and ShowRank Barebones integration. `../topbar_rank_no_missing/` is the same rank product without missing-enemy alerts. Both produce mutually exclusive `pak89_dir.vpk` replacements.

This lane does not use `showrank_common.js`, `topbar_rank_rank_bridge.js`, or `topbar_rank_v40_hud.js`. The canonical `showrank/` runtime is a separate product. Rank behavior here comes from `panorama/scripts/showrank_barebones.js`.

Work in authored source and builders. Treat `*_compiled/`, `_topbar_rank_barebones*_build/`, VPKs, archives, and installed addons as generated output.

## Source ownership

The Barebones runtime and stylesheet are host templates. They each contain exact composition seams:

- `VIEWED_PROFILE_IDENTITY_POLICY`
- `PROFILE_STATS_COMMUNITY_RUNTIME`
- `PROFILE_STATS_COMMUNITY_STYLES`

`scripts/profile-stats-community-composition.js` resolves those seams from the canonical viewed-profile policy and Profile Stats Community sources. Builders compose into staging before Closure and Source 2 compilation. Keep the checked-in host templates unexpanded.

Use `composeBarebonesSources(repositoryRoot, hostRoot)` in Node tests. Builders use:

```powershell
node scripts\profile-stats-community-composition.js --host-root <edition-root> <staged-source-root>
```

The alert and no-missing hosts share rank, identity, roster, profile, and Escape behavior. Alert-only code remains in `topbar_rank`; no-missing source must contain none of its panels, styles, constants, state, clock polling, or announcements.

## Runtime contract

- Rank images use `https://api.deadlock-api.com/v1/players/{account}/rank/image?format=webp`.
- Team averages use `/v1/players/rank/image?account_ids=...&format=webp`.
- Direct account evidence is authoritative. Names never create account identity.
- Duplicate or stale roster evidence fails closed.
- One roster read model owns Escape probing and cache replay.
- Passive topbar work never starts probing or a spinner.
- Escape intent and readiness use the centralized bounded decision path.
- Profile card, dashboard profile page, context menu, topbar slots, team averages, and Players rows all use the same Barebones runtime.
- Stats vs Community uses the viewed-profile identity policy and canonical Profile Stats Community implementation.

The alert edition watches native enemy `HealthVisible` transitions during the first eight minutes. It may show `MISSING`, darken the portrait, and emit one shared `ENEMY MISSING` hero-icon announcement. This is unrelated to missing rank or API data. Dead and disconnected players do not trigger it. `topbar_rank_no_missing` removes this behavior entirely.

## Top Bar Plus boundary

Preserve the supplied V40D Top Bar Plus assets and includes:

- `rejuvnbufftimer.js`
- `urntracker.js`
- `unspent.js`
- Recent Purchase runtime and data
- native topbar, paused HUD, damage report, objective map, and hero-shop styles

The root and player layouts are merged replacements. Keep native `GameTime`, team containers, objective/timer panels, `unspent.vjs_c`, hidden hero-name evidence, and stock bindings intact.

Each Topbar edition packages exactly 23 resources: 9 layouts, 6 scripts, and 8 styles. The browser merger and dedicated builders use the same inventory.

## Commands

Run from the collection root:

```powershell
npm --prefix topbar_rank run validate
npm --prefix topbar_rank_no_missing run validate
powershell -NoProfile -ExecutionPolicy Bypass -File build_topbar_rank_barebones.ps1 -KeepStaging
powershell -NoProfile -ExecutionPolicy Bypass -File build_topbar_rank_barebones_no_missing.ps1 -KeepStaging
```

Expected artifacts:

```text
topbar_rank_barebones_dir.vpk
topbar_rank_barebones_no_missing_dir.vpk
```

Use `-Install` only when the user explicitly asks. The builder refuses installation while Deadlock is running and targets only `citadel/addons/pak89_dir.vpk`.

## Change rules

- Keep Panorama JavaScript ES5-compatible.
- Use `Image.SetImage`; never assign `Image.src`.
- Preserve native inline handlers when adding rank callbacks.
- Keep scheduled work bounded and token-guarded.
- Do not add browser networking APIs, unbounded polling, debug logging, cross-context bridges, or a second identity/cache implementation.
- Keep the 23-file source and packed inventories exact.
- Update both editions for shared rank/profile changes. Update only alert for missing-enemy behavior.
- Update root builders, package scripts, contract tests, and the browser merger when edition source paths or public contracts change.

## Verification

For source changes, run both edition validators. For deployable changes, build both VPKs and require the builder's composed-source checks, Closure guards, compiled inventory checks, and packed-tree verification.

Builds and VM tests do not prove live Panorama behavior. In game, check profile rank and Stats vs Community, Player Profile and StatLocker actions, topbar/team averages, duplicate-name handling, Escape open/close and retry behavior, lobby/new-match cleanup, Top Bar Plus timers/objectives/purchases, and alert behavior before eight minutes. Restart Deadlock after replacing the installed VPK.
