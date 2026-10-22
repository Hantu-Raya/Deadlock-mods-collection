# 08: Menu: by-part core pages

**What to build:** The redesigned ESC menu shows Bar, HP Text and Name pages with enemy and ally side by side, Basic/Advanced folds and search, in Deadlock's style.

**Blocked by:** 03

**Status:** implemented and audited; VM/generation verified (321/321, 2026-10-14). Live checks are in ticket 11.

**Runs on:** Claude Opus 5.5 (med) with design-taste-frontend. **Review:** code-review + claude-fable-5-1 review.

- [ ] Rows generated from the settings table; root panel has no id; ids follow HPColors<Key><Role>
- [ ] Search toggle shows editable matches from every page (names, help, keywords)
- [ ] Fold state is menu-local and creates no saves or history
- [ ] Compiles with 0 failed; VM E2E tests boot the real scripts and pass

## Failure modes (written before code)

| # | Failure mode | How it would show |
|---|---|---|
| F1 | A table row (or one side of a side-aware row) gets no generated row, two rows, or ids that drift from `generated/ids.json` | Setting unreachable in the menu; boot waits forever for a missing id; FindChildTraverse hits the wrong panel |
| F2 | Enemy-only rows leak into the ally column or ally config; shared rows are duplicated per side | Ally edits a key that does not exist; one shared value shown twice with diverging state |
| F3 | A control edit does not publish, publishes the wrong side/key, or publishes an invalid value (out of bounds, off step, bad hex, low ≥ high threshold) | World bars ignore the edit or the renderer receives a config `validate` rejects |
| F4 | Programmatic control sync (slider `value`, segment/toggle classes) re-enters the edit handler | Spurious revisions and publish loops on boot, on clamp or on external apply |
| F5 | Fold or search state leaks into settings, revision or the store | Opening a fold creates a save, a history entry or a new config revision |
| F6 | Search misses help/keyword matches, matches word suffixes (`red` in `shared`), shows read-only copies, or leaves pages/folds wrong after clearing | Users cannot find or edit settings; the menu is stuck in a mixed search/page state |
| F7 | Page switch shows several pages, loses the nav selection, or leaves empty pages blank | Wrong page content; empty Indicators/Units look broken |
| F8 | ESC with search or the editor open resumes the game, or stock resume routes stop working | Escape closes the whole ESC menu while the user is typing a search |
| F9 | Panorama-unsupported CSS (glow `box-shadow`, `clip-path`, non-opacity transitions, grid, `display`) compiles silently | Look breaks in game although the compiler reports 0 failed |
| F10 | Root panel gets an id or generated ids collide with stock or chrome ids | Compile error (`Found root panel with 'id'`) or ambiguous lookups |
| F11 | Boot runs before generated panels exist, or rebinding doubles handlers | Missing controls stay dead; one click commits twice |
| F12 | Store/codec hooks are absent or throw; hydrating saved settings queues a save; a refused paste fails silently | Menu boot crashes without the store; every load rewrites the save; no message on a bad code |
| F13 | Default label or changed marker is wrong after edits or external apply | Rows look edited when they are not, or vice versa |
| F14 | Number rows show a unit other than the schema unit (px for offsets/sizes) | Pixel settings displayed as percentages again (the v2 problem D3 removes) |

## Design note

Audit route (`redesign-existing-projects`): keep the chosen `mocks/by-part.html` information architecture and port it onto v2's live-proven ESC tokens rather than invent a new look. Inventory: Panorama XML/CSS/JS only; v2 palette (cream `#ffefd7`, green `#5fe69e`, gold `#e7c77d`), `block`/`oracle`/`sans` fonts, 82 px header with gradient rule, 3 px-accent rail, card rows, 46×24 toggle, bordered segments, 34 px entries (`hp_colors_v2_menu.css`). The prototype `prototypes/menu-gen` proved the structure compiles.

- **Entry point.** `HP COLORS` sits in the stock nav (`SubOptions`, before `SettingsRow`) with the stock `nav_menu_item minor` classes, as in v2. The editor is a full-screen overlay (`HPColorsMenuHost`, collapsed until `.HPC3Open`) with a centred 1240×900 shell: 210 px page rail and a content area whose enemy/ally columns are ~475 px each. The preview column is ticket 09's.
- **Pages and folds.** Six page tabs (Bar, HP Text, Name, Indicators, Units, Presets). Each page has one Basic fold (open) and one Advanced fold (closed); each fold holds enemy and ally columns side by side, then shared rows full width. One fold per page keeps both sides aligned. Enemy-only rows sit in the enemy column; the ally column then says so instead of looking broken. Schema `group` values become column subheadings. Pages with no rows show a placeholder; Presets also carries the share-code section and hidden store panel for tickets 04/06.
- **Controls.** Boolean: v2 Button toggle with `.Checked`. Enum: segments up to four options, `DropDown` above. Color: swatch + hex entry (picker is ticket 10). Number: XML `Slider` + entry + schema unit label (`PX`, `%`). Every row shows `DEFAULT …`; `.Changed` paints a gold edge.
- **Search.** Header toggle opens a field (ESC closes it first, then the editor). Case-insensitive word-prefix matching over the generated index (name, help, group, option labels, keywords, side); every term must match. Matches stay in their own rows, so edits happen in place; empty rows, columns, folds and pages collapse; fold state is untouched.
- **State.** Page, fold and search state never touch `config`, revision or the store. Edits normalise to schema bounds/step (threshold order kept), publish through the ticket-03 path and call `$.HPColorsV3Store.commit`. The store's `applySettings` hydrate path publishes without committing.
- **Panorama limits.** No transitions, no `box-shadow`, no `clip-path`, no grid; hiding is `visibility: collapse`. Unverified in game: XML-declared `Slider` ranges set from JS (v2 created sliders at runtime), the `wash-color` tint on the stock search `.vsvg`, ESC routing while the search `TextEntry` has focus, and the shell size on non-16:9 roots.

## CSS property audit

The compiler accepts unknown properties, so every property in `panorama/styles/hp_colors_v3_menu.css` was checked against v2's live menu CSS and the pinned stock `vendor/unit_status_v2.css` (`.build/evidence/ticket08-css-audit.txt`). All 37 are used by one or both; none is unproven.

`background-color`, `border`, `border-bottom`, `border-left`, `border-radius`, `border-right`, `border-top`, `brightness`, `color`, `flow-children`, `font-family`, `font-size`, `font-weight`, `height`, `horizontal-align`, `letter-spacing`, `margin`, `margin-bottom`, `margin-left`, `margin-right`, `margin-top`, `max-width` (stock only), `min-height`, `min-width`, `opacity`, `overflow`, `padding`, `padding-bottom`, `padding-left`, `text-align`, `text-overflow` (`shrink`, as v2), `transform` (`rotateZ` stock, `translateX` v2), `vertical-align`, `visibility`, `wash-color`, `white-space`, `width`. Values `fill-parent-flow`, `gradient(linear …)`, `squish scroll`, `semi-bold` and `nowrap` are all in v2's menu CSS. Forbidden constructs found: none.

## Failure-mode → evidence mapping

Tests are `tests/menu.test.js` (10 VM E2E tests booting the real generated ESC layout and scripts) plus the review-fixes generator test. Mutation run: `.build/evidence/ticket08-menu-mutations.txt` (each of 9 menu mutations fails exactly one test).

| Failure mode | Evidence |
|---|---|
| F1 rows/ids | Every schema row × side has exactly one `Row` with its role ids at `Page/Fold/FoldBody/Column`; layout ids equal `generated/ids.json`, unique, `^HPColors[A-Z]…`; the generator itself refuses id drift or a missing row |
| F2 sides | The shipped schema has no enemy-only rows any more (ticket 07 made the bar colors side-aware). Enemy-only coverage now comes from fixture rows: `menu.test.js` "px rows…" adds an enemy-only toggle that lands only in the enemy column, has no ally or shared id, edits only `side.enemy`, and leaves the ally column with its explanatory empty label; the review-fixes test covers an enemy-only px row. Shared rows appear once (row-count assertion) |
| F3 edits | Toggle, segment, hex, entry, slider and DropDown edits each publish a new revision whose dispatched settings equal the model; bad hex/number revert with no publish; clamp, step (0.5 px), threshold order |
| F4 sync loops | Slider whose `value` setter fires `onvaluechanged` (Panorama behaviour): one edit yields exactly one revision and one dispatch; mutation removing the guard fails |
| F5 fold leakage | Fold toggles leave the config object, dispatch count and store calls unchanged; mutation that publishes on fold fails |
| F6 search | `RED` matches only the red-keyword row (not `shared`), help-only `blends`, keyword prefix `sapph` inside the closed Advanced fold, all-terms `threshold high`; editing while searching publishes; no-results state; clearing restores every row; substring and any-term mutations fail |
| F7 pages | Exactly one `Active` page and `Selected` tab; heading text; placeholders on empty pages; tab switch closes search |
| F8 ESC | First ESC closes search, second closes the editor, neither resumes; third resumes; all three stock resume routes dispatch `CitadelResumePlaying`; stock subtree equals the pinned layout apart from `HPColors*` panels; game-data anchor test covers the new `SettingsRow` patch |
| F9 CSS | Property audit above; compile result below |
| F10 root/id collisions | Root panel has no id; generator rejects ids that collide with stock layout ids |
| F11 late panels | Late mount retries at 0.1/0.2/0.4 s, stops when the context dies; with one control missing the others still work, retries do not rebind (`eventSetCounter` unchanged), later onload completes |
| F12 store hooks | Attach once per root; hydrate `applySettings` does not commit and refuses invalid settings; edits and pasted codes commit; store warnings survive; refused code shows the thrown message with no revision; no store gives "Share codes are unavailable." and edits still work; `storage.test.js` boots the same menu |
| F13 changed marker | `.Changed` toggles on and off with the value; mutation removing it fails |
| F14 units | px row shows `PX`, default `-3.5 PX`; `%` rows show `%` |

## Acceptance evidence

**Superseded:** the current evidence is ticket 09's build pair (`issues/09-preview-bar.md`, Acceptance evidence: 16 assets, 0 failed, staged 212/212) plus the Audit fixes section below. The 138/138, 13-asset entries and hashes that follow are historical.


- Source suite: `node --test tests/*.test.js` → 138/138 pass (includes ticket 03 review fixes and 04/06 codec/storage on the same tree). `node tools/generate.js --check` → 11 outputs current.
- Builds: one shared serial pair run by V3Ticket03 on the combined tree (logs `.build/evidence/ticket03-review-{release,debug}-build.log`). Both: `OK: 13 compiled, 0 failed, 0 skipped`; staged VM tests including `tests/menu.test.js` 110/110 release, 109 pass + 1 release-only skip debug; exact 13-asset compiled tree and VPK listing, including `hud_escape_menu.vxml_c`, `hp_colors_v3_menu.vjs_c`, `hp_colors_v3_menu.vcss_c`. Release pak02 SHA256 `26b97fbe11b0f961a937198615ad1fcc654d61f21e9bb6b7fd980f51846a60e2`; debug `e4041aed92ef1256f34f1d7e4596591469232c88e3e501627880ea0cd4b7e740`. Staged menu CSS and ESC layout are byte-identical to source.
- Not done: no install, deploy or game launch; the menu's in-game look, slider behaviour, focus/ESC routing and layout at non-16:9 roots are unverified. Acceptance boxes left unticked.

### Addendum: unreadable-save recovery (for 04/06 review fixes)

Header buttons `HPColorsResetSaveButton` / `HPColorsResetSaveConfirmButton` stay collapsed until the store calls `api.setSaveResetAvailable(true)`. The first click reveals the confirm button (clicking reset again or closing the editor cancels); confirm calls `$.HPColorsV3Store.resetUnreadableSave(true)` and hides the control only if it returns `true`. The menu changes no settings and commits nothing. Test: `tests/menu.test.js` "unreadable-save reset…"; source suite 139/139 after regeneration. The CSS uses only properties already in the audit. It was built in ticket 09's pair.

## Fixes (Main-reported defects, 2026-10-14)

| Defect | Fix | Evidence |
|---|---|---|
| Hex and number entries bound `onfocuslost`, which Panorama never fires (stock chat and v2 use `onblur`), so typed values were published only on Enter | Bind `onblur` (Enter still submits) | Test "typed hex and number values publish when focus moves away": a VM focus model fires `onblur` on the panel losing focus; typing alone publishes nothing, moving focus commits hex and number, a blur without a change publishes nothing |
| `DropDown.SetSelected` received an option panel; Panorama takes the option id string | Pass `row.options[j].id` | The test mock now throws on a non-string `SetSelected`; the long-enum DropDown test boots, syncs and edits through it |
| Reincluding the menu script on the same root left the old closure's queued answer (old epoch) and a second answer listener; worlds accepted the retired epoch, so an older color won | Each inclusion calls `$.HPColorsMenuPublisher.retire()` on the previous instance: cancels its queued answer and retry, unregisters its listener, and makes publish, commit and applySettings no-ops. The new instance inherits the settings under a fresh epoch. Epochs stay opaque (V3Ticket03: ordered epochs could reject a legitimate publisher on clock rollback) | Test "reincluding the menu script retires the old publisher": answer queued with `#ABCDEF`, reinclude, edit `#778899`, request, advance 0.6 s → one listener, every later broadcast carries only the live epoch, `#778899` wins, no jobs left |

Reverting each fix fails exactly its test (`.build/evidence/ticket08-fixes-mutations.txt`). All v3 tests 142/142; `generate --check` current. Built in ticket 09's pair.

## Audit fixes (agent://Audit0809, 2026-10-14)

Node tests only this round; Main runs the final build pair. Mutation proof: `.build/evidence/audit0809-mutations.txt`, where each revert fails exactly its test.

| Finding | Fix | Evidence |
|---|---|---|
| 1. Shell cut off at 4:3 and 5:4 (fixed 1570 px) | `.HPC3Shell { width: 100%; max-width: 1570px; }`. The rail (210) and preview (330) stay fixed; the content area fills | `menu.test.js` "editor fits 5:4, 4:3 and 16:9": a width model over the generated layout and menu CSS (border-box, flow-right, fill-parent-flow) gives shell 1350/1440/1570 at roots 1350/1440/1920, content ≥ 750 and side columns 365/410/475. With the fixed width it fails: "shell 1570 exceeds root" |
| 4. Closed search field keeps focus and filters | The field handler ignores text unless `SearchOpen` is set. Closing moves focus to `HPColorsSearchToggle`. Opening focuses the field through a cancellable `$.Schedule(0)` (`focusJob`), which close and retire cancel | "closed search field…": closing cancels the pending focus; after ESC the toggle has focus and the field does not; keys into the collapsed field set no `Searching` or `NoResults` and hide no rows. The search test checks that focus arrives only after the next frame |
| 5. Slider thumb selectors only by id | `.SliderThumb` added beside `#SliderThumb`, plus hover and active rules for both, as in v2 | "slider thumb is styled…": the same resolver model gives 12 px, `#f2f5f5`, active `#5fe69e` and a hover border for a class-matched and an id-matched thumb |
| 7. Stale evidence; `menu.test.js:98` ran on zero rows | Dropped that vacuous loop, added the enemy-only fixture row (F2 above), rewrote the F2 row and marked the old acceptance block as superseded | The F2 row above; menu suite 16/16 |

Full run `.build/evidence/audit0809-all-tests.tap`: 241/257, with all six new audit tests and every menu, preview and review-fixes test passing. The 16 failures are in codec, migration, game-data, generator and version tests that other agents are editing in this round (stale `version` generation). A later rerun failed only because peers' files were mid-edit (`hp_colors_v3_storage.js` syntax; `requestBundleReplacement` not yet defined in V3Ticket10's menu.js hunk), not because of these fixes. `generate --check` reports the same in-flight staleness (`hp_colors_v3_settings.js`, `hp_colors_v3_world_settings.js`), which belongs to the generator owner.

Follow-up: V3Ticket10's deferred cold publication. With a store present, the menu now publishes only after `api.hydrateSettings`, a cache hit, store unavailability or the 30 s fallback. `menu.test.js` was adapted to match:
- the store-hooks test hydrates through `api.hydrateSettings` and asserts that nothing is published before it;
- the reset test hydrates first;
- the late-panels test asserts publication waits for the store attach once panels exist, and that a menu which never finishes booting still publishes through the 30 s fallback.

Result: menu, preview and review-fixes suites 48/48.
