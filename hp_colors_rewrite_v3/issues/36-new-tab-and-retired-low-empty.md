# 36: NEW tab, and remove "Low color on empty charges"

Status: implemented and VM-verified (2026-10-21). The normal debug build is installed and partly checked in game (see Live). Part of 3.2.0.

## Requests (user, 2026-10-21)

1. Remove **Low color on empty charges** (`staminaLowEmpty`, ticket 35).
2. Add a **NEW** tab like the game's Settings NEW section (user screenshots: the game's NEW list, and purple `!` marks beside new keybind rows).

## Decisions

- **Removal:** at low stamina, empty charges keep the stock look (`#10130D` on arrows, black on circles and boxes). Filled charges and the circle or box outline still take the low color.
- **Retired slots:** the debug build saved slot 193 (`enemyStaminaLowEmpty false`) in the live store's backup record, so the slots cannot simply disappear. `settings/record.json` gains `retiredSlots: [193, 194]`. The generator lets a retired slot leave the schema, refuses to reuse its number, and still refuses to drop any other slot. The codec skips retired slots when reading and never writes them. The record version stays 14: nothing changes meaning for older readers.
- **NEW items** *(user: 3.2.0 only)* live in `settings/news.json`: id, release, date, badge (`New` or `Updated`), title, description, target settings (key and optional side) or a target page. The generator validates them and emits the page and the contract.
- **Placement** *(user)*: NEW is the first tab, but the menu still opens on Bar. While any item is showing, the NEW tab gets a purple dot.
- **Dismissal** *(user: like the game)*: each item has an X, and there is a CLEAR ALL button. Dismissed ids are saved in the bundle as `newsDismissed`, which is not a setting. It is not in Undo, is not shared in bundle codes, and survives REPLACE ALL. Items also disappear 30 days after their date. Without a hydrated store, dismissal lasts for the session.
- **Row marks:** each setting row an item targets shows the game's `notification_alert` icon beside its title while the item shows, and its page tab and sub-nav group entry show the same icon *(sub-nav: user, 2026-10-21, like stock's sub-section indicator)*. No glow: the lane forbids new shadow exceptions.
- **Click an item:** go to its page, select the target row's group and scroll to it, then flash the target rows with an opacity-only highlight.

## Plan (tests first)

1. Tests: codec reads a v14 record with 193/194 and drops them; the generator accepts retired slots, refuses reuse and still refuses other removals; the renderer and preview keep stock empty charges at low stamina.
2. Implement the removal and regenerate.
3. Tests: NEW tab placement, opening on Bar, items, badges, dots, click navigation and flash, X and CLEAR ALL persistence, the 30-day expiry, sharing and REPLACE ALL, search, no Undo entry, news.json validation.
4. Implement `news.json`, the generator, the layout, CSS and the menu runtime.
5. Full suites, recompose QOLLOCK and ShowRank, build all six, install the ShowRank debug build.

## Evidence (2026-10-21)

- Tests first: 4 removal tests and 10 NEW-tab tests failed before the code (`tests/news.test.js`, plus `codec`, `generator`, `renderer` and `preview`).
- Canonical 1306/1306, QOLLOCK + ShowRank + v2 storage 90/90; the Closure-minified NEW tab passes `news` and `menu` (33/33). All three generators are current.
- `bootChrome` validity calls are 246 (232 before): one open and one dismiss binding per item, plus CLEAR ALL.
- Review fix: an item opened from the Ally view scrolled to its first (Enemy) row, whose column is collapsed there. `openNews()` now groups and scrolls to the first shared or current-side target. A regression goes Ally → NEW → Low stamina color and checks that the scroll target and its ancestors are visible; it failed before the fix.
- Builds: normal `5abd1081` / `1c052d88`, QOLLOCK `c84cdfcc` / `44a872dc`, ShowRank `31187d46` / `82a901ba` (release / debug).
- Live, still to check: the tab and row icons render (stock `notification_alert` / `icon_refresh`), the flash fades, dismissals survive a restart, and the console has no Parsing error.

## Live (2026-10-21, normal debug `dfcd708a`, game 6796)

- **User report:** clicking the **Team colors** item did not reach the Team colors card. Cause: `openNews()` showed the collapsed target page and scrolled in the same click, when Panorama has no layout for that page yet. Fix: `scrollAfterLayout()` waits at least one frame, then until the row has a height (at most 10 frames, then it scrolls anyway). The regression runs every item with targets against a mock in which a just-shown row has no height until a later scheduled frame; it failed before the fix. The mock proves the deferral, not Panorama's real layout timing, so the fix still needs the in-game click.
- No `JS Exception`, `Parsing error`, FATAL or Uncaught in that session's console.log.

## Audit (m1 / GPT-6 Astra, effort med, 2026-10-21)

No P1 findings. Each fix below has a regression in `tests/news.test.js` that failed first:

- **P2:** reinclusion during a flash left rows highlighted for good. Retirement now ends the flash.
- **P2:** session-only dismissals (store not loaded, or a refused save) came back after reinclusion. They now travel in the retirement handoff, separate from settings, Undo and codes.
- **P3:** `news.json` accepted a page that does not hold the targets, and targets on several pages. The generator now refuses both.
- **P3:** a pending scroll survived closing the menu or opening another item. A navigation counter and an open-menu check now drop it.
- **P3:** the pressed X collapsed with its item and left focus nowhere. Focus now moves to the next item, or to the NEW tab.
- **P3 (docs):** this status line contradicted MAP; fixed above.

Not changed: opening an item focuses CLOSE through the existing `clearSearch()`, as the sub-nav does. The 10th-frame fallback scroll is deliberate.

Still to check in game: each item lands on its card, the flash fades, dismissals survive a restart, keyboard/controller focus after X, long titles at 1280×720.

## Refactor (2026-10-21, debated with m1 / GPT-6 Astra, effort med)

This refactor keeps behavior the same; the user had accepted the in-game result. Pin: `.scratch/hpv3_refactor/measure-menu.js`, which runs a 128-preset bundle through 15 menu actions. After each action it records native op counts, `getBundle` clones and a digest of every HPColors panel's classes and label text. `compare.js` compares two runs. Renderer pin: the 68 operation-ceiling scenarios (COUNTED plus `observedDigest`).

Kept:

- **Saved dismissals:** the list is read from the bundle `refreshPresets` already loads, and once at boot. `syncNews` never clones the bundle, and `refreshPresets` reads it once instead of twice.
- **Shared helpers:** one `mark()` helper serves the nav dots and the NEW marks. `syncNews` returns the showing list, which dismissal focus reuses.
- **Group selection:** `openNews` selects the final group once.
- **Search:** clearing an already clear search (every tab, sub-nav and NEW click) only resets the scroll. The root's `Searching` class decides, so the check survives reinclusion.
- **Fewer marks:** tab and sub-nav marks are generated only where an item can show them, and the generator lists each item's `subNavIds`. That removes 26 hidden images and the runtime group and container scan.
- **Renderer:** `staminaChanged` is deleted (`reconcileStamina` reuses its `same`), and `pipEmpties` no longer re-validates pips that its callers have just validated or collected.

Rejected: reusing `HPC3SearchLanding` for the row flash. ENGINE.md scopes that animation to the landed card title, the lane forbids new motion exceptions, and it would change the accepted purple flash. Also rejected: expanding the contract with per-side routes, which would double the news contract for plain-JS savings.

Caught by the debate: the cached list first stayed empty while a boot was still retrying a missing control. A regression for that failed on the refactor and passed on the old code; the boot read fixed it.

Result (VM level 1, not an FPS claim; `.scratch/hpv3_refactor/menu-before.json` vs `menu-after.json`): all 15 action digests are identical. Native ops fell from 171,605 to 147,525. Bundle clones fell from 19 to 5 (10.6 MB to 2.8 MB): open 1→0, dismiss 6→2, CLEAR ALL 7→2. Panels fell from 5,173 to 5,147, and a NEW item click from about 4,700 ops to about 2,000. In the renderer, all 68 scenarios are identical; low-stamina validity calls fell by up to 66/s per bar (`renderer-before.jsonl` vs `renderer-after.jsonl`).

## Live fix 2 (2026-10-21, normal debug `be606c03`, game 6805)

- **User report:** clicking the items top to bottom (9 screenshots, `D:/steam/userdata/215334735/760/remote/1422450/screenshots/20261021210057_1.jpg` to `…210129_1.jpg`). **Team colors**, **Low stamina color** and **Old shield bar** stayed at the page top; the other items landed.
- **Cause:** all three target a page that had been shown before (BAR is the opening page; INDICATORS was opened by the item above Low stamina). A collapsed page keeps its rows' old heights, so `scrollAfterLayout()` saw a height in the first frame and scrolled once, before the page was laid out again. Pages seen for the first time reported 0 and waited, so they worked.
- **Fix:** `scrollAfterLayout()` scrolls on every frame of the 10-frame window (once the row has a height) and once more at the end. A repeat on a row that already fits does nothing.
- **Regression:** `tests/news.test.js` "ticket 39b: a row with an old height…" gives every row a stale height and only counts a scroll made after the page's first frame. It failed on the old scroll (scratch copy via `HPV3_SOURCE_ROOT`) and passes now. Three existing tests now accept repeated scrolls to the same row.
- **Live (normal debug `ec0f0968`, with a temporary per-frame trace):** all eight items land on their rows with the purple flash, including Low stamina after Team stamina and Old shield bar on BAR. The trace was removed afterwards; the final normal debug `48b73087` (suite 1347/1347) is installed.
- **Not changed:** a landed row can sit at the top edge with its card title above the view (Team colors, Team stamina). Moving the mouse over another card after the click clears the sub-nav highlight, by the existing hover rule. Preview team switch opens BAR without pointing at the AMBER/SAPPHIRE buttons in the preview.
