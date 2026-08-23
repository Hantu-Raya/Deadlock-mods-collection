# Donation leaderboard research

## Verdict

Deadlock Panorama JavaScript cannot fetch and parse a CSV response. The selected design does not ask it to.

The existing `hp-colors-preset-builder` repository owns one reviewed public CSV. Astro validates that CSV during the Pages build, passes the same rows into the V2 ticker, and pre-renders a dedicated `supporters-strip` page. One same-origin controller restarts the ticker animation. It cannot fetch, store, or transmit data.

Canonical HP Colors Rewrite will load that page through one display-only `CitadelHTMLPanel` in the existing header-rule space. Panorama sees one browser texture and never receives supporter rows. Closing the editor navigates the panel to `about:blank` and collapses it.

This needs no generated leaderboard JavaScript in the VPK. The only Rewrite runtime work is guarded `SetURL()` and `SetIgnoreCursor()` integration in the existing menu script.

The existing builder repository is the correct host. It already owns the public supporter presentation, Astro base path, CI, and GitHub Pages deployment. A second repository would add deployment and cross-origin seams without creating a useful security boundary.

Implementation status is recorded below. The scores in section 4 are the initial selection scores, not current release readiness.

## Implementation checkpoint

As of 2026-08-23, both experimental branches contain the complete implementation:

- Builder commit `3a2b3e4` validates the public CSV, feeds V2 and the static strip from it, and cache-busts the 32-second loop controller.
- GitHub Actions run `32621436227` passed its CI, build, and Pages deployment jobs.
- Rewrite commit `70fbc9d` contains the optional editor-only HTML panel, guarded load and unload behavior, focused tests, and the current timing contract.
- A restarted Deadlock client rendered the live supporter rows without browser chrome. The ticker stayed inside its header slot and did not capture editor input.
- A unique query on each editor open prevented Deadlock from reusing stale page content. The hosted page also versions its loop controller.
- The quiet production build deployed `pak02_dir.vpk` with SHA256 `2D20D0558166AB0844FD1257025BC31FA6BFAE7D745D93868B7BC8A98C2609CC`.
- The deployed browser check measured a 32-second cycle, donor #1 at `x=0`, and a 96-pixel protected reset gap.

No ETW capture was taken for the embedded browser texture. This document makes no CPU or GPU cost claim.

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

The public endpoints are:

```text
https://hantu-raya.github.io/hp-colors-preset-builder/supporters-strip/
https://hantu-raya.github.io/hp-colors-preset-builder/data/supporters.csv
```

Both endpoints return the deployed supporter data. The strip performs no browser-side CSV fetch.

The CSV is the only supporter-data source. Astro parses it during the build. The V2 island receives the validated rows as serialized props, while `supporters-strip.astro` emits the same rows as plain HTML with two identical cycles. A same-origin script only restarts the finished animation.

Pages responses use `Cache-Control: max-age=600`. Rewrite appends a timestamp to each page load, and the page versions its controller URL. Change that controller version whenever its timing changes.

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

## 4. Initial alternatives and scores

These scores record the choice before implementation:

- Design confidence measured how completely the architecture and constraints were understood.
- Runtime readiness measured the evidence available at that point.

| Branch | Design confidence | Runtime readiness | Decision |
|---|---:|---:|---|
| Static Astro HTML/CSS in `CitadelHTMLPanel` | 10/10 | 4/10 | Selected |
| Generated remote PNG/WebP through `Image.SetImage()` | 9/10 | 6/10 | Hard fallback |
| HTML page that fetches CSV in the browser | 8/10 | 3/10 | Rejected |
| Packaged supporter snapshot in the VPK | 10/10 | 8/10 | Rejected for freshness |
| Image-dimension data channel | 10/10 rejection confidence | 1/10 | Rejected |

### Selected: static Astro page

One manual CSV commit feeds both public displays. The deployed strip has no CORS request, runtime parser, third-party script, or generated VPK data file. Its same-origin controller only restarts the one-shot animation because Deadlock stopped the original CSS `infinite` animation at its final keyframe.

The embedded browser texture is the remaining cost. In-game checks proved rendering, input isolation, and unload behavior. They did not measure CPU or GPU cost.

### Fallback: remote PNG or WebP

QOLLOCK proves HTTPS PNG and WebP loads through `Image.SetImage()`, bounded timeout handling, cache guards, cleanup, and CSS motion. This path uses less runtime memory and has stronger Deadlock-family evidence.

It needs a deterministic image generator in the builder repository, makes text inaccessible as text, and adds image-generation and cache-versioning work. Promote it immediately if the HTML probe captures input, shows browser error UI, scales poorly, fails to unload, or leaves measurable work while the editor is closed.

### Rejected branches

A page that fetches CSV in the browser adds a second network request, parser failures, and another cache seam. The selected controller does none of those things.

A packaged snapshot is deterministic and nearly release-ready, but every supporter update requires a VPK rebuild, install, and Deadlock restart.

Image dimensions are suitable for a tiny version signal, not names and totals. Encoding strings would require serialized image requests, polling, timeouts, and an external relay.

## 5. Current runtime contract

- Target canonical `hp_colors_rewrite` first. Do not update `hp_colors_rewrite_qollock` until the canonical branch merges.
- Place the strip in the flexible `HPColorsHeaderRule` space between the title and `LIVE`.
- Keep the existing title, `LIVE`, and `DONATE` controls unchanged.
- Render at most 10 rows with the V2 rank, name, USD total, and gold, silver, and bronze treatment.
- Use a fixed 32-second CSS animation. The same-origin controller may only restart that animation.
- Make the HTML panel display-only. It must not accept hit testing, focus, mouse tracking, popup links, tracking scripts, or third-party assets.
- Load the Pages route once when the editor opens. A timestamp may bypass stale page content. Do not poll or append donor or player identifiers.
- On close, navigate to `about:blank` and collapse the panel.
- If `SetURL` fails synchronously, hide the panel without changing editor behavior. Do not register unsupported HTML completion events or claim a timeout can identify a successful load.
- Never package an offline donor list in the VPK.
- Disclose that opening the strip sends GitHub Pages normal request metadata such as IP address, request time, user agent, and route.
- Treat the Pages deployment as live content authority. Protect deployment access, validate the CSV, and keep the route static.

## 6. Implemented files

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
- `D:\web\hp-colors-preset-builder\src\components\KofiLeaderboardTicker.jsx:3-78`: V2 ticker fed by the shared reviewed CSV.
- `D:\web\hp-colors-preset-builder\README.md:74-83`: manual-update and privacy rules.
- Live `https://hantu-raya.github.io/hp-colors-preset-builder/v2/` and `/supporters-strip/`: deployed from builder commit `3a2b3e4`.
- Live Pages checks on 2026-08-23: the strip and CSV return 200, the page loads `supporters-strip-loop.js?v=32000`, and the controller contains no network or storage calls.

### GitHub documentation

- [Viewing and understanding files](https://docs.github.com/en/repositories/working-with-files/using-files/viewing-and-understanding-files): raw file access.
- [Repository contents API](https://docs.github.com/en/rest/repos/contents): raw media type, refs, expiring download URLs, size limits, and file updates.
- [Scheduled workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule): cron behavior, delays, default-branch rules, and inactivity shutdown.
- [Workflow permissions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#permissions): least-privilege `GITHUB_TOKEN` access.
- [Using secrets in GitHub Actions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets): secret handling and fork restrictions.
- [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages): repository-backed static HTML, CSS, and JavaScript hosting.
