# 33: Update notice

**What to build:** When the Escape-menu editor opens, check whether a newer HP Colors v3 release exists and, if so, show a warning that this version is out of date. The latest version comes from the hpv2-store GitHub Pages repository. Requested by the user on 2026-10-17.

**Dependencies:** the hosted page change (`latest` capability and `latest.json`) must be published before any player sees a notice. Publishing needs the user's approval.

**Status:** implemented, VM-verified and published (2026-10-18). The hpv2-store page and `latest.json` are live at commit `38c7a62`; both 3.1.0 release paks are built. No install or live check yet.

**Design:** Main drafted it, GPT-6 Astra critiqued it in two rounds, and Main refined it (2026-10-17).

## Decisions

- **Version:** `settings/record.json` `release` stays the single source. The generated contract now carries it as `release`, separate from the wire `version` (`3.0.0`). The check never parses the label text.
- **Semver:** a fixes-only release bumps the patch number and any user-visible feature bumps the minor. This release adds the notice, so it is **3.1.0**.
- **Where the latest version lives:** `latest.json` in the hpv2-store repository (`{"hpv3": "3.1.0"}`), next to the page the menu already loads.
- **Transport, which Astra changed:** an unsolicited title message from the page could overwrite a pending read or write reply before Panorama reads it. That ordering is not proven safe, so the page never writes the title on its own. Instead:
  - The page fetches `./latest.json?n=<time>` with `cache: "no-store"` when it loads. It does not change its own address, so the bridge's exact-URL trust check is unaffected.
  - The menu sends an `lv` request through the existing one-at-a-time queue, and the page answers at once from the copy it holds: `{l: "X.Y.Z" | null, s: "pending" | "done"}`.
  - The page refetches at most every 10 minutes (every minute after a failure), but only when asked, so a release published mid-session and recovery from a failed first fetch are both covered.
- **Compatibility:** the page lists `latest` in its ready capabilities. The v3 bridge sends `lv` only when `latest` is listed, so an old cached page gives no notice and saving is unchanged. v2 and 3.0.x paks never send `lv`; the page adds no other messages.
- **When it shows:** 0.5 s after the editor opens, and only while no dialog, picker, condition editor or slider drag is active. It retries every second until that is true, and asks again up to five times while the page is still fetching. Closing the editor or retiring the script cancels it and closes the notice.
- **How often:** once per game session for each version, held in the context static `$.HPColorsV3UpdateNotified`. Nothing is persisted, so there is no new storage key and no settings or Undo change.
- **Dialog:** a separate `HPColorsUpdateDialog` that reuses the shared dialog chrome. It does not reuse the CREDITS open path, which closes pickers and ends gestures. CLOSE, ESC (handled first) and the backdrop dismiss it. DOWNLOAD (added 2026-10-18 at the user's request) opens the GameBanana page `latest.json` lists for this build; without a valid link the text points players to the mod page instead.
- **Download links live in `latest.json`, not the pak:** the notice only shows once a newer release exists, so a link built into a pak would always name an older file. `latest.json` carries `download.hpv3.normal` and `download.hpv3.qollock`; update them with the version on each release. The page passes only `https://gamebanana.com/` links (`d` in the `lv` reply), and the menu checks them again before `ExternalBrowserGoToURL`, since Panorama is the trust boundary. The menu picks `qollock` when the composed menu has QOLLOCK's pinned `QOLStorageBridge` panel, otherwise `normal`.

## Acceptance

- [x] A newer release shows the notice once per session after the menu settles and focuses CLOSE. Settings and saves are untouched.
- [x] Equal, older, malformed (`v`-prefixed, two-part, number, inherited key, array), missing-entry, 404, network-error and no-fetch manifests stay silent.
- [x] An old page without `latest` is never asked, and saving still works.
- [x] A manifest still loading when the menu opens is asked again and then shown.
- [x] The notice waits for an open dialog, closes with ESC (the editor stays open) and the backdrop, is cancelled when the editor closes before the delay, and closes with the editor.
- [x] While the manifest loads, every page title answers exactly one request. `lv` replies carry only `d, i, l, o, ok, q, s`.
- [x] The page refuses non-plain mod ids and touches no storage for `lv`.
- [x] DOWNLOAD opens the listed link for this build (normal in the v3 menu, QOLLOCK in the composed QOLLOCK menu) and closes the notice. Missing, other-build, other-mod, `http`, lookalike-host, userinfo-host, `javascript:`, spaced, over-long, non-string and inherited links hide DOWNLOAD; a page reply carrying an off-site link is refused by the menu.
- [x] Published to hpv2-store `38c7a62` (user-approved 2026-10-18; `dlf/index.html` left out). The served script hash matches `ab135402`; `vendor/hpv2-store.pin.json` is re-pinned with `published: true`.
- [ ] Live: the notice appears in game against the published page (with `latest.json` temporarily set to a higher version), with no Parsing error, FATAL or Uncaught. The fade-in timing has to be checked live.

## Implementation (2026-10-18)

- **Page** (`D:/hpv2-store/index.html`, unpublished): adds `latest` to the ready capabilities, the `lv` operation, the background `fetchLatest` and `latestVersion` (own-property, `X.Y.Z` only). Also adds `latest.json` and README protocol and versioning notes. The unrelated dirty `dlf/index.html` is untouched.
- **Vendor:** `vendor/hpv2-store.js` is the new page script. The pin records `sha256` for the local page, `publishedSha256` for the served `94cc689` page, and `published: false`. Under that state, `store-page.test.js` expects `main` to stay the served `cas` page.
- **Bridge** (`hp_colors_v3_storage.js`): adds the `latest` queue operation. `pump` settles it `unsupported` without sending when the capability is absent, and `onLatest` validates the reply. The controller and `$.HPColorsV3Store.latestRelease(callback)` expose it.
- **Menu** (`hp_colors_v3_menu.js`): `startUpdateCheck`/`stopUpdateCheck` hook into `setMenuOpen` and retire. `askLatest`, `showUpdateWhenIdle`, `dialogBusy` and `closeUpdate` do the rest, using numeric `X.Y.Z` comparison. The CLOSE, ESC and backdrop bindings are added, and `HPColorsMenuCancel` closes the notice first.
- **Layout** (`tools/menu-layout.js`): `HPColorsUpdateDialog` with backdrop, title "UPDATE AVAILABLE", `HPColorsUpdateText` and CLOSE/ESC. It uses no new CSS.
- **Generator:** the contract has a `release` field. Canonical outputs were regenerated and QOLLOCK recomposed; both Escape menus contain the dialog and show `v3.1.0`.

## Verification

- `tests/update-notice.test.js` (6 E2E tests) runs the real hosted page script and the real Escape-menu layout through the storage fixture. The fixture's `latest` option serves `latest.json` through a fetch settled by the fake scheduler. All six failed before the implementation.
- Mutation checks on a scratch copy (`HPV3_SOURCE_ROOT`) make the suite fail when any of these is removed: idle deferral, once-per-session, the version comparison, the capability gate or the pending retry. The clean copy passes.
- The full-suite results are recorded in [MAP.md](../MAP.md#changelog).

## Per-build download (2026-10-21)

- **Request:** each build's notice has its own DOWNLOAD that opens that build's page from the web.
- **Bug found:** the ShowRank build has no QOLLOCK bridge, so it counted as normal and opened the normal file.
- **Now:** the menu picks `qollock` (QOLLOCK's `QOLStorageBridge`), `showrank` (ShowRank's `ShowRankBarebonesPartyBridge`) or `normal`, and opens only `latest.json` → `download.hpv3.<build>`. A build without a valid GameBanana link shows the text-only notice. `hp_colors_v3_storage.js` and the hosted page both pass `showrank` on.
- **Hosted page (before publishing):** `D:/hpv2-store/index.html` was edited locally first. `vendor/hpv2-store.js` holds the new script (sha `3303ec45…`). The pin is `published: false`, with `publishedSha256` (`ab135402…`) and `publishedCapabilities` describing the page still served from `main`. Until it is pushed, the served page drops the `showrank` link, so ShowRank users get the text-only notice.
- **Tests (red first):** `hp_colors_rewrite_v3_showrank/tests/showrank.test.js` "update notice: the composed ShowRank menu offers the ShowRank download…" failed (it opened the normal file) and passes now, with and without a ShowRank link. The canonical and QOLLOCK download tests now also list a ShowRank link and still open only their own.
- **Published (2026-10-21, user-approved push):** hpv2-store `e3fb4fb` on `main`. `latest.json` is `"hpv3": "3.2.1"` with normal `…#FileInfo_1858043` and QOLLOCK `…#FileInfo_1858042`, and there is no ShowRank link yet. GitHub Pages serves it, and the served page script hashes to the pin (`3303ec45…`). The pin is now `commit: e3fb4fb…`, `published: true`. Store, storage and update-notice tests: 43/43. `.scratch/news_nav/latest_check.test.js` runs the committed `latest.json` (version raised to 3.2.2) through the page into the normal and QOLLOCK menus, and each opens its own link. 3.2.1 itself sees no notice.
- **ShowRank:** add `"showrank": <link>` to `latest.json` when that file is uploaded; the page and the menu already pass it on.
- **3.2.2 (2026-10-21):** hpv2-store `5cf293c` sets `latest.json` to `3.2.2`, with normal `#FileInfo_1858077` and QOLLOCK `#FileInfo_1858078` (checked against the GameBanana file list by md5). The page script is unchanged, so the pin stays at `e3fb4fb`.
