# Donation leaderboard research

## Verdict

Deadlock Panorama JavaScript cannot fetch and parse a CSV response. The selected design does not ask it to.

The existing `hp-colors-preset-builder` repository will own one reviewed public CSV. Astro will validate that CSV during the Pages build, pass the same rows into the current V2 ticker, and pre-render a dedicated `supporters-strip` page as static HTML and CSS. The page will contain no client JavaScript and will make no CSV request.

Canonical HP Colors Rewrite will load that page through one display-only `CitadelHTMLPanel` in the existing header-rule space. Panorama sees one browser texture and never receives supporter rows. Closing the editor navigates the panel to `about:blank` and collapses it.

This needs no generated leaderboard JavaScript in the VPK. The only Rewrite runtime work is guarded `SetURL()` and `SetIgnoreCursor()` integration in the existing menu script.

The existing builder repository is the correct host. It already owns the public supporter presentation, Astro base path, CI, and GitHub Pages deployment. A second repository would add deployment and cross-origin seams without creating a useful security boundary.

The design-confidence score is 10/10. Runtime readiness is 4/10 because the route, CSV, and VPK integration do not exist yet, and no restarted Deadlock client has loaded the page. Research cannot replace that live proof.

This note changes no runtime files, build scripts, compiled output, VPKs, or deployment.

## Implementation checkpoint

As of 2026-08-23, the experimental branches satisfy checklist items 1 through 5:

- Builder commit `e854ab5` validates the public CSV, feeds V2 and the static strip from it, and deploys both live endpoints.
- GitHub Actions run `32611602279` passed its CI, build, and Pages deployment jobs.
- Rewrite commit `83cd6ed` adds the optional editor-only HTML panel, guarded load and unload behavior, focused tests, and the updated design contract.
- The canonical Rewrite build deployed `pak02_dir.vpk` with SHA256 `73B591F879165C8BFC7ED2DC116D5AC0A885D0BBB8DDE63C2A3F5463BB66871B`.

Runtime readiness is now 5/10. Checklist items 6 through 10 still require a restarted Deadlock client, interaction checks at every supported UI scale, failure testing, and closed-editor ETW evidence. Do not merge the runtime branch before those checks pass.

## 1. Panorama networking and local assets

### Verified Deadlock evidence

The June inventory remains useful, but Deadlock has updated the DLLs since that report. The current files inspected on 2026-08-23 are:

- `panorama.dll` SHA256 `294D17D96A79E7CFEC1740DD1DFF1823B1747281FC7D5D2C0C8C66B0C4C836AC`
- `panoramauiclient.dll` SHA256 `97F313F3D0C470741182E1D9E51DB0DC8442D9E79BE423CD4343A6C7B244BCE3`

The current `panorama.dll` still contains `ERROR: AsyncWebRequest has been removed.` It exposes no verified `fetch` or `XMLHttpRequest` replacement.

The control-specific paths are different:

- `panorama.dll` function `sub_1800D99B0` recognizes `http://` and `https://` URLs. `sub_1800D9810` accepts PNG, JPG, GIF, WebP, and TGA image types. `sub_18013E030` sends accepted URLs through the image manager.
- `panoramauiclient.dll` function `sub_18010F700` registers `SetURL` and `SetIgnoreCursor` for the HTML control. `sub_18010D550` passes a nonempty URL to the Steam HTML interface and stores it. The binary also registers `HTMLContentLoaded`, `HTMLLoadPage`, `HTMLFinishRequest`, JavaScript alert events, and security-status events.
- Stock Deadlock layout `game/citadel/pak01_dir/panorama/layout/popups/popup_news_post.xml` uses `CitadelHTMLPanel` for `NewsPostWebFrame`. This proves that the control is part of the retail UI.

These controls can fetch and render remote content. They do not give Panorama JavaScript the HTTP response body. `SetURL` can display a web page, and `SetImage` can display an image. Neither method lets `hp_colors_menu.js` parse raw CSV text into Panorama labels.

### Valve references and access note

Canonical first-party references are [Valve Developer Community: Panorama](https://developer.valvesoftware.com/wiki/Panorama), [Dota 2 Panorama JavaScript API](https://developer.valvesoftware.com/wiki/Dota_2_Workshop_Tools/Panorama/Javascript/API), [API2](https://developer.valvesoftware.com/wiki/Dota_2_Workshop_Tools/Panorama/Javascript/API2), and [SteamVR Panorama JavaScript API](https://developer.valvesoftware.com/wiki/SteamVR/Environments/Panorama_Javascript_API). Direct retrieval was blocked by Valve Developer Community's Anubis challenge during this research, so no Deadlock networking claim above relies on an inaccessible wiki paragraph. The local binary evidence is the verified source for the removed `AsyncWebRequest` behavior. Keep those Valve pages beside future API work and re-check them manually when Valve exposes a new runtime API.

### Verified local/static-resource pattern

Rewrite layouts already use compiled, package-local `s2r://` resources:

```xml
<!-- hp_colors_rewrite/panorama/layout/hud_escape_menu.xml -->
<include src="s2r://panorama/styles/citadel_base_styles.vcss_c" />
<include src="s2r://panorama/styles/hud_escape_menu.vcss_c" />
<include src="s2r://panorama/styles/hp_colors_menu.vcss_c" />
<include src="s2r://panorama/scripts/hp_colors_contract.vjs_c" />
<include src="s2r://panorama/scripts/hp_colors_state.vjs_c" />
<include src="s2r://panorama/scripts/hp_colors_menu.vjs_c" />
```

`unit_status_overlay.xml` uses the same compiled include pattern. `build_hp_colors_rewrite.ps1:21-37,70-118` compiles two layouts, four Rewrite scripts, and two styles, packs the compiled assets, and forbids raw source/documentation from the VPK. This is local repository evidence, not an external API claim.

The original packaged-script plan remains the most deterministic option, but it is no longer the only one. A remote HTML panel or image panel can keep the leaderboard current without rebuilding the VPK.

`hud_escape_menu.xml:92-103` already has the editor title, flexible `HPColorsHeaderRule`, `LIVE`, and `DONATE`. A compact clipped ticker can use that existing header space while the editor is open; it must not create a new HUD surface. `design.md:23-26` requires restrained transform/opacity transitions and forbids frame-driven animation. A continuous CSS marquee therefore needs an explicit design-contract amendment and real in-game proof, not an assumption.

### QOLLOCK precedents

QOLLOCK already uses remote GitHub and web image loads in Panorama:

- `G:\QOLLOCK\panorama\scripts\ql_update_checker.js:1-3,12,101-149` loads a cache-busted PNG from `raw.githubusercontent.com`. It reads `actuallayoutwidth` and `actuallayoutheight` to classify the response. The probe stays visible and nonzero because Panorama skips culled or fully transparent remote images.
- `G:\QOLLOCK\panorama\scripts\ql_core.js:14228-14269` creates image panels and sends HTTPS URLs through `wsrv.nl`.
- QOLLOCK's ShowRank bridge sends `https://api.deadlock-api.com/...webp` URLs to `Image.SetImage()` and caches the applied URL on each panel to avoid repeat writes.
- `G:\QOLLOCK\panorama\styles\base\citadel_hud_hero_shop.css:1028-1046` has a stock-derived infinite linear `translate3d` animation. This is enough to justify a small CSS ticker probe.
- QOLLOCK has no `HTML`, `CitadelHTMLPanel`, `SetURL`, or Carousel implementation to copy. The HTML route comes from the current Deadlock binaries and stock news popup, not QOLLOCK.

The image path is proven in shipped QOLLOCK source. The HTML path has stronger native support than the first pass found, but HP Colors still needs a real in-game probe before treating it as usable.

## 2. GitHub Pages host

The existing builder deploys at:

```text
https://hantu-raya.github.io/hp-colors-preset-builder/
```

`astro.config.mjs` sets that site and `/hp-colors-preset-builder/` base. `.github/workflows/deploy.yml` runs CI, builds Astro, uploads `dist`, and deploys Pages from `master`.

The future public endpoints are:

```text
https://hantu-raya.github.io/hp-colors-preset-builder/supporters-strip/
https://hantu-raya.github.io/hp-colors-preset-builder/data/supporters.csv
```

Both endpoints currently return 404. The deployed `/v2/` route returns 200 and contains the existing static supporter ticker.

The CSV is the only supporter-data source. Astro parses it during the build. The V2 island receives the validated rows as serialized props, while `supporters-strip.astro` emits the same rows as plain HTML with two identical sequences and a CSS keyframe. The strip performs no browser-side CSV fetch.

Live Pages responses currently return `Cache-Control: max-age=600`. Requests with unique query values returned the same cached object and ETag, so a nonce is not a reliable bypass. The accepted freshness contract is: after a successful Pages deployment, the installed mod may show the prior strip for up to ten minutes.

The public CSV remains permanently visible in Git history and as a static Pages asset. This is accepted only for approved rank, alias, and total fields.

## 3. Public CSV contract

The committed file has one exact header:

```csv
rank,display_name,total_usd
```

Rules:

- `rank` is a unique contiguous integer from 1 through at most 10.
- `display_name` is an approved public alias with bounded length.
- `total_usd` is a nonnegative decimal amount approved for public display.
- Totals must be in descending order. Equal totals keep explicit rank order.
- Duplicate display names are allowed. This preserves separate anonymous rows such as `Ko-fi Supporter`.
- The parser rejects extra columns, missing fields, line breaks, markup, control characters, email-like values, malformed money, noncontiguous ranks, unsorted totals, more than 10 rows, and oversized input.
- Money validation uses decimal text or integer cents, not binary floating-point aggregation.

The original Ko-fi export must never enter the public repository, Pages output, VPK, cache key, URL, artifact, or log. No email address, transaction ID, payment state, private note, location, raw timestamp, or hidden identifier is permitted.

Invalid CSV fails the builder CI and Pages deployment. The previous valid deployment remains live. The job must not skip bad rows or publish an empty replacement.

## 4. Researched branches and scores

The scores answer different questions:

- Design confidence measures how completely the architecture, constraints, evidence, and fallback are understood.
- Runtime readiness measures whether the branch is safe to ship today.

| Branch | Design confidence | Runtime readiness | Decision |
|---|---:|---:|---|
| Static Astro HTML/CSS in `CitadelHTMLPanel` | 10/10 | 4/10 | Selected |
| Generated remote PNG/WebP through `Image.SetImage()` | 9/10 | 6/10 | Hard fallback |
| HTML page that fetches CSV in the browser | 8/10 | 3/10 | Rejected |
| Packaged supporter snapshot in the VPK | 10/10 | 8/10 | Rejected for freshness |
| Image-dimension data channel | 10/10 rejection confidence | 1/10 | Rejected |

### Selected: static Astro page

This branch matches the chosen update model. One manual CSV commit feeds both public surfaces. The deployed strip uses no client JavaScript, CORS, runtime parser, third-party script, or generated VPK data file.

Its cost is the embedded browser texture. Current binaries register the HTML URL and cursor APIs, and stock Deadlock uses `CitadelHTMLPanel`, but HP Colors has not proved focus behavior, scaling, animation, memory, GPU cost, or cleanup.

### Fallback: remote PNG or WebP

QOLLOCK proves HTTPS PNG and WebP loads through `Image.SetImage()`, bounded timeout handling, cache guards, cleanup, and CSS motion. This path uses less runtime memory and has stronger Deadlock-family evidence.

It needs a deterministic image generator in the builder repository, makes text inaccessible as text, and adds image-generation and cache-versioning work. Promote it immediately if the HTML probe captures input, shows browser error UI, scales poorly, fails to unload, or leaves measurable work while the editor is closed.

### Rejected branches

A browser-fetching HTML page adds page JavaScript, a second network request, parser failures, and another cache seam without improving the accepted deployment-plus-ten-minute freshness contract.

A packaged snapshot is deterministic and nearly release-ready, but every supporter update requires a VPK rebuild, install, and Deadlock restart.

Image dimensions are suitable for a tiny version signal, not names and totals. Encoding strings would require serialized image requests, polling, timeouts, and an external relay.

## 5. Locked runtime contract

- Target canonical `hp_colors_rewrite` first. Do not update `hp_colors_rewrite_qollock` before the probe passes.
- Place the strip in the flexible `HPColorsHeaderRule` space between the title and `LIVE`.
- Keep the existing title, `LIVE`, and `DONATE` controls unchanged.
- Render at most 10 rows with the V2 rank, name, USD total, and gold, silver, and bronze treatment.
- Use a fixed CSS animation duration. Do not add ResizeObserver or other page JavaScript.
- Make the HTML panel display-only: no hit testing, focus, mouse tracking, popup links, tracking scripts, or third-party assets.
- Load the fixed Pages URL when the editor opens. Do not poll or append donor/player identifiers.
- On close, navigate to `about:blank`, collapse the panel, and cancel any pending timeout token.
- Use a bounded load timeout. Failure hides the panel and restores the plain header rule without changing editor behavior.
- Never show browser error UI or an offline donor list.
- Disclose that opening the strip sends GitHub Pages normal request metadata such as IP address, request time, user agent, and route.
- Treat the Pages deployment as live content authority. Protect deployment access, validate the CSV, and keep the route static and dependency-free.

## 6. Future implementation map

Builder repository:

- `public/data/supporters.csv`
- `src/supportersData.js`
- `src/pages/supporters-strip.astro`
- `src/styles/supporters-strip.css`
- `src/pages/v2.astro`
- `src/components/PresetBuilderV2Island.jsx`
- `src/components/KofiLeaderboardTicker.jsx`
- focused parser, source-contract, route, and browser tests

Canonical Rewrite:

- `panorama/layout/hud_escape_menu.xml`
- `panorama/styles/hp_colors_menu.css`
- `panorama/scripts/hp_colors_menu.js`
- existing Rewrite validators and build wrapper

The builder route must be deployed before the VPK probe. QOLLOCK compatibility comes only after canonical proof through its refresh/generation path.

## 7. Evidence needed for 10/10 runtime readiness

1. Builder parser tests reject every forbidden schema and privacy case.
2. V2 and the static strip render identical rows from the same CSV.
3. The builder build succeeds, Pages deploys, and both future endpoints return 200.
4. The strip document contains no client script or third-party request.
5. The canonical Rewrite validators and build wrapper pass.
6. Deadlock is restarted after VPK replacement.
7. The strip loads and scrolls at every supported UI scale without browser chrome, clipping, shimmer, or unreadable text.
8. The panel never receives focus, mouse, keyboard, or Escape input.
9. Closing the editor unloads and collapses the panel. Closed-editor ETW evidence shows no retained polling or measurable frame-time regression.
10. Offline, timeout, and HTTP failure hide the strip and preserve the normal header.

Any failure in items 7 through 10 promotes the remote-image branch. Until this checklist passes, only the design-confidence score is 10/10.

## Sources

### Valve and local runtime evidence

- [Steam HTML Surface](https://partner.steamgames.com/doc/features/html_surface): Valve documents the embedded CEF and HTML5 browser surface.
- [ISteamHTMLSurface](https://partner.steamgames.com/doc/api/ISteamHTMLSurface): Valve documents `LoadURL`, request callbacks, page completion, painting, scrolling, and JavaScript execution.
- [Valve Developer Community Panorama](https://developer.valvesoftware.com/wiki/Panorama): canonical Panorama reference. Direct retrieval hit Valve's Anubis challenge during this research.
- Current `panorama.dll`, SHA256 `294D17D96A79E7CFEC1740DD1DFF1823B1747281FC7D5D2C0C8C66B0C4C836AC`: `sub_1800D99B0`, `sub_1800D9810`, and `sub_18013E030` provide current HTTP, HTTPS, and remote-image evidence.
- Current `panoramauiclient.dll`, SHA256 `97F313F3D0C470741182E1D9E51DB0DC8442D9E79BE423CD4343A6C7B244BCE3`: `sub_18010F700` and `sub_18010D550` register and implement the HTML URL setter.
- [Stock `popup_news_post.xml`](https://github.com/SteamDatabase/GameTracking-Deadlock/blob/master/game/citadel/pak01_dir/panorama/layout/popups/popup_news_post.xml): current retail layout using `CitadelHTMLPanel`.
- `docs/2026-06-01-panorama-js-api-inventory.md:14-20,44-61,97,104-122`: earlier binary inventory with the removed `AsyncWebRequest` error and control APIs.
- `hp_colors_rewrite/panorama/layout/hud_escape_menu.xml:92-103`: current HP Colors header and external donation action.
- `hp_colors_rewrite/design.md:23-26` and `hp_colors_rewrite/AGENTS.md:121`: editor animation and no-new-HUD rules.
- `G:\QOLLOCK\panorama\scripts\ql_update_checker.js:1-3,12,101-149`: raw GitHub PNG loading, cache busting, dimension reading, timeout, and cleanup.
- `G:\QOLLOCK\panorama\scripts\ql_core.js:14228-14269`: remote images loaded through `wsrv.nl`.
- `G:\QOLLOCK\panorama\styles\base\citadel_hud_hero_shop.css:1028-1046`: infinite linear `translate3d` keyframe.
- `G:\QOLLOCK\.github\workflows\sync-translations.yml:17-75`: scheduled and manual private-to-public publishing pattern.
- `D:\web\hp-colors-preset-builder\astro.config.mjs:4-7`: current Pages site and base path.
- `D:\web\hp-colors-preset-builder\.github\workflows\deploy.yml:5-64`: current CI-gated Astro and Pages deployment.
- `D:\web\hp-colors-preset-builder\src\components\KofiLeaderboardTicker.jsx:3-79`: current seven-row data, duplicated sequences, measured duration, accessibility label, and leaderboard link.
- `D:\web\hp-colors-preset-builder\README.md:74-83`: current manual-update and privacy rules.
- Live `https://hantu-raya.github.io/hp-colors-preset-builder/v2/`: deployed static ticker at commit `eca99394dbac`.
- Live Pages response checks on 2026-08-23: `max-age=600`; unique query variants returned the same ETag and cache hit. The future strip and CSV routes returned 404.

### GitHub documentation

- [Viewing and understanding files](https://docs.github.com/en/repositories/working-with-files/using-files/viewing-and-understanding-files): raw file access.
- [Repository contents API](https://docs.github.com/en/rest/repos/contents): raw media type, refs, expiring download URLs, size limits, and file updates.
- [Scheduled workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule): cron behavior, delays, default-branch rules, and inactivity shutdown.
- [Workflow permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions): least-privilege `GITHUB_TOKEN` access.
- [Using secrets in GitHub Actions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets): secret handling and fork restrictions.
- [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages): repository-backed static HTML, CSS, and JavaScript hosting.
