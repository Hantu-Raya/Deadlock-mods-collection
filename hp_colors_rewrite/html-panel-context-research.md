# CitadelHTMLPanel context access

## Executive verdict

`CitadelHTMLPanel` is a native Panorama render/control panel, not a browser `window` or DOM object. The current installed `panoramauiclient.dll` (SHA-256 `97F313F3D0C470741182E1D9E51DB0DC8442D9E79BE423CD4343A6C7B244BCE3`) registers only two HTML-panel V8 methods: `SetURL(string)` and `SetIgnoreCursor(bool)` (`sub_18010F700`). The getter probe therefore reported `GetURL`, `GetTitle`, `GetPageTitle`, `GetText`, `GetHTML`, and `GetContent` as missing: they are not methods on the Panorama wrapper. Exact-string searches of the current `panoramauiclient_strings.txt`, Citadel `client_strings.txt`, and `panorama_strings.txt` also found no such getter names.

The native client also exposes a larger HTML event vocabulary. IDA showed registrations for `HTMLTitle`, `HTMLURLChanged`, `HTMLLoadPage`, `HTMLFinishRequest`, `HTMLJSAlert`, and `HTMLContentLoaded`. A restarted Deadlock client then proved two panel events: `HTMLURLChanged` delivered the loaded URL and `HTMLTitle` delivered a controlled `HPCRSUP1:<JSON>` title. Registering `HTMLContentLoaded` threw during menu boot, so that event is not available through the same Panorama registration path. The production code does not register any of these events.

### Channel matrix

| Channel | Panorama-facing verdict | Lower-level Steam HTML-surface verdict | Safe disposition |
| --- | --- | --- | --- |
| Display a remote HTML page | **YES**: `SetURL(url)` is registered and used by the Rewrite panel. | **YES**: `ISteamHTMLSurface::LoadURL`. | Safe for display-only content after normal load/error/cleanup checks. |
| Ignore cursor/input | **YES**: `SetIgnoreCursor(true)` is registered and used. | **YES**, through HTML input/focus methods. | Keep the panel noninteractive. |
| Read DOM, body text, or HTML source | **NO** direct Panorama API. No getter or DOM method was found. | **INDIRECT/UNKNOWN**: C++ can call `ExecuteJavascript`, but the documented interface has no return-value/DOM-read callback. `ViewSource` opens an editor; it does not return source to Panorama. | Stop looking for a getter. Do not claim DOM access through `SetURL`. |
| Observe current URL | **YES through an event, not a getter**: a restarted client delivered the remote URL and later `about:blank` through `HTMLURLChanged`. | **YES**: `HTML_URLChanged_t` supplies URL/post/redirect/title/new-navigation fields. | Use only when navigation state is required. Do not poll. |
| Read page title | **YES through an event, not a getter**: a restarted client delivered the exact controlled `HPCRSUP1:<JSON>` title through `HTMLTitle`. | **YES**: `HTML_ChangedTitle_t` and `HTML_FinishedRequest_t` carry title text. | A page may expose a small, explicitly versioned metadata string in its title. Treat it as untrusted remote input. |
| Navigation callbacks | **PARTIAL**: `HTMLURLChanged` and `HTMLTitle` are proven. `HTMLContentLoaded` registration throws. Other native event names remain untested. | **YES**: the documented C++ layer has start, finish, URL-change, and title callbacks. | Use only the two proven Panorama events. Guard registration because unsupported names can stop menu boot. |
| Custom URL schemes | **UNKNOWN** for Deadlock's Panorama wrapper. | **DOCUMENTED GENERIC SUPPORT**: `LoadURL` accepts URI schemes supported by CEF, including `http`, `https`, `ftp`, and `file`; this does not prove a handler for an arbitrary custom scheme. | Do not probe arbitrary schemes in production. `about:blank` is the only unload URL currently used. |
| JavaScript console forwarding | **UNKNOWN**, not supported by current evidence. `JSConsoleOutput` is a current token and an older IDA inventory calls it an event, but no producer mapping proves that an embedded page's `console.log` reaches Panorama. | **NO DOCUMENTED GENERIC CONSOLE CALLBACK** in `ISteamHTMLSurface`. `HTML_JSAlert_t`/`HTML_JSConfirm_t` are modal-dialog callbacks, not console forwarding. | Stop unless a one-shot console experiment is specifically required. |
| Page-to-game messaging | **NARROW YES through `HTMLTitle`**: a page-controlled title string reaches a panel event handler. This is not DOM access, `postMessage`, or an arbitrary callback bridge. | **NO generic `postMessage` member/callback** in the documented interface. `ExecuteJavascript` is host-to-page and one-way in the documented API. | Use only for small, versioned, validated metadata when display-only HTML is insufficient. The supporter ticker does not need it in production. |
| Remote images | **YES for rendering only** through a separate `Image.SetImage(url)` control. | **YES**: HTML paint callbacks expose pixels to C++, not to Panorama JS. | Use image panels for visual content only; no text/pixel readback claim. |
| Image dimensions/timing as data | **UNKNOWN and unsafe to rely on**. Panorama can observe panel/layout state, but no pixel buffer or image-byte API was found. | C++ receives BGRA paint buffers and update rectangles. | Treat this as a visual side channel, not a supported data channel. |

## What the stock game and Rewrite actually show

- Current stock Deadlock uses the control in [`popup_news_post.xml`](https://github.com/SteamDatabase/GameTracking-Deadlock/blob/master/game/citadel/pak01_dir/panorama/layout/popups/popup_news_post.xml): `CitadelHTMLPanel#NewsPostWebFrame` is the page surface, with a stock spinner child. The stock stylesheet fixes the frame to `100%` width and `740px` height in [`popup_news_post.css`](https://github.com/SteamDatabase/GameTracking-Deadlock/blob/master/game/citadel/pak01_dir/panorama/styles/popups/popup_news_post.css).
- Rewrite declares one noninteractive panel in [`hp_colors_rewrite/panorama/layout/hud_escape_menu.xml:101-103`](panorama/layout/hud_escape_menu.xml#L101-L103): `hittest="false"`, `acceptsfocus="false"`; the neighboring `DONATE` button uses the separate `ExternalBrowserGoToURL` Panorama event. That external-browser event is navigation out of the game, not HTML-panel context access.
- Rewrite calls only the proven setters in [`hp_colors_rewrite/panorama/scripts/hp_colors_menu.js`](panorama/scripts/hp_colors_menu.js): it loads the production strip once per editor open, suppresses cursor interaction, and unloads with `SetURL("about:blank")`. The temporary getter and event probes were removed after the restarted-client test. The getter probe reported every candidate as `missing`, which proves binding absence rather than a failed page load.
- The current stock string inventories contain `CitadelHTMLPanel` and the HTML event tokens (`HTMLContentLoaded`, `HTMLFinishRequest`, `HTMLJSAlert`, `HTMLLoadPage`, `HTMLStartRequest`, `HTMLTitle`, `HTMLURLChanged`, and others): [`panoramauiclient_strings.txt:918-949`](https://github.com/SteamDatabase/GameTracking-Deadlock/blob/master/game/bin/win64/panoramauiclient_strings.txt), [`client_strings.txt:26706-26737`](https://github.com/SteamDatabase/GameTracking-Deadlock/blob/master/game/citadel/bin/win64/client_strings.txt). The same current UI-client inventory contains C++ RTTI for `CHTML` and `CCallback<CHTML, HTML_*_t>` objects, including title, finished-request, start-request, URL-change, JS alert/confirm, paint, new-window, link, search, tooltip, and scroll callbacks: [`panoramauiclient_strings.txt:136-157`](https://github.com/SteamDatabase/GameTracking-Deadlock/blob/master/game/bin/win64/panoramauiclient_strings.txt).
- The current V8 method token neighborhood contains `SetIgnoreCursor`, `SetImage`, `SetTitle`, and `SetURL`, but no `GetURL`, `GetTitle`, `GetPageTitle`, `GetText`, `GetHTML`, or `GetContent`: [`panoramauiclient_strings.txt:1301-1331`](https://github.com/SteamDatabase/GameTracking-Deadlock/blob/master/game/bin/win64/panoramauiclient_strings.txt). `SetImage` belongs to `Image`, and `SetTitle` is not evidence of an HTML-title getter. The exact getter search was repeated over current `panoramauiclient_strings.txt`, Citadel `client_strings.txt`, and `panorama_strings.txt`; it returned no matches.
- Current binary strings also contain `JSConsoleInput`, `JSConsoleOutput`, and `JSConsoleText` ([`panoramauiclient_strings.txt:1015-1018`](https://github.com/SteamDatabase/GameTracking-Deadlock/blob/master/game/bin/win64/panoramauiclient_strings.txt)). This proves a Panorama/JS-console vocabulary exists, not that CEF page console output is forwarded to the panel's event target. The older IDA extract records a `JSConsoleOutput` event at [`docs/2026-06-01-client-dll-ida-extract.json:16570-16577`](../docs/2026-06-01-client-dll-ida-extract.json#L16570-L16577); it is corroboration of the event token, not current producer or payload proof.
- Current engine strings identify `STEAMHTMLSURFACE_INTERFACE_VERSION_005` ([`engine2_strings.txt:7248-7250`](https://github.com/SteamDatabase/GameTracking-Deadlock/blob/master/game/bin/win64/engine2_strings.txt)). The current Steam API string inventory exposes C++ entry points such as `SteamAPI_ISteamHTMLSurface_ExecuteJavascript`, `LoadURL`, `AllowStartRequest`, `GetLinkAtPosition`, and `SetSize` ([`steam_api64_strings.txt:290-320`](https://github.com/SteamDatabase/GameTracking-Deadlock/blob/master/game/bin/win64/steam_api64_strings.txt)). The public Valve page currently documents interface version `003`, so the game binary/API-version mismatch is a reason not to infer an exact ABI from the web page; it does not create a Panorama JavaScript bridge.

## QOLLOCK precedent: image rendering, not HTML context

The local QOLLOCK profile layout uses a normal `<Image>` panel (`WebMediaDemoMedia`) beside a local badge, with hit testing disabled; it does not use `CitadelHTMLPanel`: [`_reference/qollock_local_vpk_decompiled/panorama/layout/profile_card.xml:23-31`](../_reference/qollock_local_vpk_decompiled/panorama/layout/profile_card.xml#L23-L31). Its `showrank_web_media_bridge.js` builds `https://api.deadlock-api.com/.../rank-predict/image?...format=webp` URLs and calls `profile.media.SetImage(url)`; a search of that bridge found no `CitadelHTMLPanel`, `SetURL`, or `LoadURL` ([`_reference/qollock_local_vpk_decompiled/panorama/scripts/showrank_web_media_bridge.js:1`](../_reference/qollock_local_vpk_decompiled/panorama/scripts/showrank_web_media_bridge.js#L1)). The Rewrite/QOLLOCK menu bridge only wraps `ToggleSettingsWindow` and `SetPanelEvent`; it has no HTML-panel bridge ([`hp_colors_rewrite_qollock/panorama/scripts/qollock_hp_colors_bridge.js:1-80`](../hp_colors_rewrite_qollock/panorama/scripts/qollock_hp_colors_bridge.js#L1-L80)).

This establishes a useful split:

1. Remote HTML and remote images can be rendered by native controls.
2. QOLLOCK's proven remote-data pattern ends at `Image.SetImage`; it does not parse image bytes or obtain HTML text.
3. No local QOLLOCK source proves a CEF-to-Panorama message route.

## What the official Steam surface documents (and what it does not)

Valve's [Steam HTML Surface overview](https://partner.steamgames.com/doc/features/html_surface) says the surface is CEF/HTML5 and is accessed through the C++ `SteamHTMLSurface()` interface. The API reference says its callbacks are fired by `SteamAPI_RunCallbacks`; that is a C++ callback pump, not a Panorama JavaScript function. The [ISteamHTMLSurface reference](https://partner.steamgames.com/doc/api/ISteamHTMLSurface) documents these relevant signatures and callbacks:

- `void LoadURL( HHTMLBrowser unBrowserHandle, const char *pchURL, const char *pchPostData );` — navigation; it triggers `HTML_StartRequest_t` and accepts CEF-supported URI schemes.
- `void ExecuteJavascript( HHTMLBrowser unBrowserHandle, const char *pchScript );` — runs JavaScript in the loaded page. The reference does not define a returned JavaScript value or a DOM-object result.
- `HTML_StartRequest_t` — URL, target, POST data, redirect flag; the host must answer with `AllowStartRequest`.
- `HTML_FinishedRequest_t` — loaded URL and page title.
- `HTML_URLChanged_t` — URL, POST data, redirect flag, page title, and `bNewNavigation`.
- `HTML_ChangedTitle_t` — new page title.
- `HTML_NeedsPaint_t` — a BGRA pointer, dimensions, damage rectangle, scroll values, scale, and page serial for the native renderer.
- `HTML_JSAlert_t` and `HTML_JSConfirm_t` — page modal-dialog messages; the host answers with `JSDialogResponse`.
- `GetLinkAtPosition`/`HTML_LinkAtPosition_t` and `Find`/`HTML_SearchResults_t` — link/search metadata, not DOM or source access.
- `CopyToClipboard` copies selected page text to the OS clipboard; it is not a Panorama getter. `ViewSource` opens the source in a local editor; it is not a Panorama data return path.

The reference does **not** document a Panorama-callable `GetURL`, `GetTitle`, `GetText`, `GetHTML`, CEF `postMessage`, generic page-to-game callback, or JavaScript-console callback. Steam's C++ callback layer and the Panorama V8 method/event layer must therefore remain separate in this note.

## Restarted-client experiment result

The bounded experiment ran against deployed VPK SHA-256 `2CB772ADC0EB574DB010CD381F8EA7486FA6B71D889CD4CC55BE49E9A491AC38`.

1. At `10:59:00`, the editor opened normally.
2. At `10:59:01`, `HTMLURLChanged` delivered the cache-busted debug URL.
3. At `10:59:01`, `HTMLTitle` delivered the full controlled `HPCRSUP1:<JSON>` payload. The event fired twice with the same value.
4. At `10:59:13`, closing the editor navigated the panel to `about:blank`; `HTMLURLChanged` and `HTMLTitle` both reported that unload.
5. `HTMLContentLoaded` registration threw at boot. Guarding registration kept the editor functional, but production removes the event probe entirely.

This proves a narrow page-title metadata channel and observable URL changes. It does not prove DOM access, response-body access, `postMessage`, JavaScript console forwarding, custom URL schemes, or arbitrary Steam HTML callbacks in Panorama. The production supporter ticker remains display-only because its static page already renders the reviewed CSV.

## Primary sources

- Current stock layout: [`popup_news_post.xml`](https://github.com/SteamDatabase/GameTracking-Deadlock/blob/master/game/citadel/pak01_dir/panorama/layout/popups/popup_news_post.xml).
- Current stock binary string inventories: [`panoramauiclient_strings.txt`](https://github.com/SteamDatabase/GameTracking-Deadlock/blob/master/game/bin/win64/panoramauiclient_strings.txt), [`client_strings.txt`](https://github.com/SteamDatabase/GameTracking-Deadlock/blob/master/game/citadel/bin/win64/client_strings.txt), [`steam_api64_strings.txt`](https://github.com/SteamDatabase/GameTracking-Deadlock/blob/master/game/bin/win64/steam_api64_strings.txt), [`engine2_strings.txt`](https://github.com/SteamDatabase/GameTracking-Deadlock/blob/master/game/bin/win64/engine2_strings.txt).
- Valve: [Steam HTML Surface](https://partner.steamgames.com/doc/features/html_surface) and [ISteamHTMLSurface](https://partner.steamgames.com/doc/api/ISteamHTMLSurface).
- Local direct binary inventory and older IDA extraction: [`docs/2026-06-01-panorama-js-api-inventory.md`](../docs/2026-06-01-panorama-js-api-inventory.md), [`docs/2026-06-01-client-dll-ida-extract.json`](../docs/2026-06-01-client-dll-ida-extract.json).
