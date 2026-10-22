# 32: Donate button and supporter strip

**What to build:** A DONATE button next to CREDITS in the preview footer, and the Ko-fi top-supporters strip in the preview pane, above the footer. Requested by the user on 2026-10-17.

**Dependencies:** the 6790 rebase is complete. Main owns hosted-page publication and the remaining live check; an unavailable strip does not block the editor.

**Status:** done; live-checked on 6790 on 2026-10-17. The DONATE click itself is not confirmed live (see Live check).

**Runs on:** gpt-6.1-sol (med). **Main:** publishes the page and runs the live check.

## User decisions (2026-10-17)

- **DONATE:** sits beside CREDITS in the bottom-right footer. It opens `https://ko-fi.com/hantuaraya` via `$.DispatchEvent("ExternalBrowserGoToURL", url)`, as v2 does (`hp_colors_rewrite_v2/panorama/layout/hud_escape_menu.xml:105`).
- **Strip placement:** the full width of the preview column, in the empty space under the preview note and above the CREDITS/DONATE/v3.0.0 footer.
- **Strip styling:** a new v3-themed hosted page `https://hantu-raya.github.io/hp-colors-preset-builder/supporters-strip-v3/`, built in `D:/web/hp-colors-preset-builder` and published with user approval. The v2 page stays unchanged.

## Design (reuse v2)

- v2's mechanism (`hp_colors_rewrite_v2/panorama/scripts/hp_colors_v2_menu.js:1849-1875`, css `:86-99`): a passive `CitadelHTMLPanel` (`hittest="false"`, `acceptsfocus="false"`). On menu open it calls guarded `SetIgnoreCursor(true)` and `SetURL(url + "?v=<unique>")`, then adds `Open`. On close it calls `SetURL("about:blank")` and removes `Open`, which collapses it. No data reaches Panorama.
- Style the DONATE button the same way as the CREDITS button. The strip frame has no extra chrome beyond fitting the pane.

## Acceptance

- [x] DONATE dispatches exactly the Ko-fi URL; CREDITS and `v3.0.0` are unchanged; both variants.
- [x] The strip loads only while the menu is open (unique query), unloads to `about:blank` on close or retire, never takes input, and collapses when unavailable.
- [x] VM tests cover open/close/retire, the URL, hit-testing and the DONATE dispatch. Generator `--check`s are current, QOLLOCK is recomposed, suites green.
- [x] Live (Main, 6790): the strip renders the v3 page inside the pane without stealing clicks (CREDITS still opens); no Parsing error/FATAL/Uncaught. DONATE: see Live check.

## Implementation (2026-10-17)

- `tools/menu-layout.js` generates `HPColorsPreviewDonateButton` beside CREDITS, reusing `HPC3CreditsButton`, and one `CitadelHTMLPanel`, `HPColorsSupporterStrip`, between the preview note and footer. The strip is full content width and 36px tall, with no added chrome or motion; it collapses without `Open`. `hittest`, `hittestchildren` and `acceptsfocus` are all false.
- `hp_colors_v3_menu.js` guards the external-browser dispatch and HTML-panel methods. Each open uses a publisher-epoch/open-counter query; close, root replacement and retirement attempt `about:blank` and collapse the strip even if navigation throws. Missing, throwing or rejected navigation leaves it collapsed. Boot/hydration never starts it while closed; warm reinclusion unloads the old instance before an already-open editor reloads it. No storage, Undo or configuration state is added.
- Regenerated canonical outputs and recomposed QOLLOCK. The 6790 rebase, ticket 31 credits, three-second shake sample and `v3.0.0` source remain intact.

### VM regression tests

`tests/supporter-strip.test.js`:

- `ticket 32: passive strip opens with a unique v3 URL only on menu open and blanks on close or retire`
- `ticket 32: DONATE reuses CREDITS styling and dispatches only the exact Ko-fi URL without editing settings`
- `ticket 32: unavailable strip navigation is non-fatal and stays collapsed while the editor and DONATE work`
- `ticket 32: optional cursor APIs and failed blank navigation cannot break closing or retirement`
- `ticket 32: warm reinclusion blanks the retired strip before reopening only an already open editor`

`../hp_colors_rewrite_v3_qollock/tests/qollock.test.js`:

- `ticket 32 supporters (model): composed passive strip, DONATE, window handoff and retirement preserve the footer`
- `ticket 32 supporters (pinned): composed passive strip, DONATE, window handoff and retirement preserve the footer`

Red-first evidence: the canonical lifecycle and DONATE tests failed on the absent IDs before implementation; both QOLLOCK runtime tests failed on the absent strip before recomposition. The focused gate is 5/5 canonical and 2/2 QOLLOCK.

Full shell gates: **1254/1254 canonical**, **30/30 QOLLOCK** (model and pinned runtimes) and **48/48 v2 storage**, with zero failures, cancellations or skips. Both direct generator `--check`s pass (12 canonical outputs, two QOLLOCK layouts); the CSS guard reports a maximum of 10 selectors per rule. The existing preview-prefix invariant now permits only the mandated `HPColorsSupporterStrip` sibling; stock-ID collisions and fake-tree carrier checks remain enforced.

No build, install or launch. VM failures exercise absent/throwing/rejected engine navigation, not a real network outage. Hosted rendering, click pass-through, the external browser and native console remain Main's live acceptance.

## Layout changes (user, 2026-10-17)

- The strip moved from above the footer to the bottom of the pane, under CREDITS/DONATE/`v3.0.0`, in a new `HPColorsPreviewBottom` stack (footer first, then strip).
- In the footer, CREDITS and DONATE sit on the left and `v3.0.0` on the right (the footer is full width; the version label is `ignore-parent-flow` + right-aligned).
- Tests `ticket 30: release label…` and `ticket 32: passive strip…` were updated to this layout.

## Live check (Main, 2026-10-17, 6790)

- The hosted page `supporters-strip-v3` was published (builder commits `5aa706d`, then the CI fix `80d052f`; CI and Pages passed). It scrolls the supporter names in the v3 colors inside the preview pane: `.scratch/hpv3_live_1017/t32_strip_live.png`, `t32_strip_bottom.png`, `t32_footer_layout.png`.
- With the strip open, CREDITS still opens its dialog, so the strip does not take clicks.
- DONATE: clicking it gave no new window that the desktop helper could see and logged nothing. Its route is the one v2 and ShowRank already ship (`ExternalBrowserGoToURL`). It opens in the Steam overlay or your browser, which an automated click can't confirm. A real click by the user is still needed.
