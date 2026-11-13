# 09: Preview bar

**What to build:** The menu's preview bar follows the page (hero, NPC, objective), with an HP slider and a damage/heal play button.

**Blocked by:** 07, 08

**Status:** implemented and audited; VM/generation verified (321/321, 2026-10-14). Live checks are in ticket 11.

**Runs on:** Claude Opus 5.5 (med) with design-taste-frontend. **Review:** code-review + claude-fable-5-1 review.

- [ ] Uses the renderer's plan and apply on an HPColorsPreview-prefixed fake tree
- [ ] Close, page switch, side switch and slider input cancel scheduled work
- [ ] Nothing written outside the preview tree
- [ ] VM E2E tests boot the real scripts and pass

## Failure modes (written before code)

Ported from `prototypes/preview/FAILURE-MODES.md`, narrowed to the shipped menu.

| # | Failure mode | How it would show |
|---|---|---|
| P1 | The renderer's exported `apply` only targets its world cache (`discover()` on the world root), so a preview "using the renderer" silently copies plan/apply logic that drifts from the ledger contract (first-write capture, explicit stock release, diff-only writes, parent adoption/restore) | Preview looks right while world bars differ; ownership never released in the menu |
| P2 | Including the renderer in the ESC menu starts its world loop, registers a config listener or walks the menu's ancestors | A 1 s dormant loop and a `ClientUI_FireOutput` listener inside the menu forever |
| P3 | Preview ids reuse stock/world ids (`UnitHealthbar`, `name`, `HPColorsV3MotionFrame`) or carry carrier classes (`player`, `enemy`) | Stock CSS, world scripts or menu lookups resolve into the preview, or the renderer owns a real panel |
| P4 | A plan part resolves outside the preview pane (missing id, re-parented panel) and apply writes or `SetParent`s outside it | Menu chrome restyled, HP label moved out of the pane |
| P5 | Preview facts diverge from world classification (eligibility, relation, stock flags) | Preview paints an ally/NPC/objective the world leaves stock, or the reverse |
| P6 | Release after a kind/side switch restores the old kind's stock look | Enemy-red fill on an ally or NPC sample |
| P7 | Play, settle or stale callbacks keep running after close, page switch, side switch, slider input or menu-script reinclusion; a stale callback clears the current job slot | Bar animates after close; two sequences interleave; scheduler never empties |
| P8 | Slider echo (our own `value` write firing `onvaluechanged`) cancels the running sequence, or a play step overwrites the user's dragged value | Play stops itself; slider jumps back |
| P9 | Settings edits during play restart or duplicate the sequence, or are ignored until the next step | Two sequences, or the preview lags the edit |
| P10 | Sequence uses milliseconds as seconds or a different step count | 450 s steps or a 4 ms flash |
| P11 | Preview writes leak outside its tree: menu panels, world config, store, undo history, revisions | Opening the preview creates a save or a published revision |
| P12 | Preview misses its panels (late layout) and throws or paints forever | Menu boot breaks; endless settle retries |
| P13 | Unlaid pane (zero size) yields an empty plan forever, or settle retries never stop | Bar stays stock; scheduler never idle |

## Design note

Same audit route as ticket 08 (`redesign-existing-projects`): keep the chosen `mocks/by-part.html` placement (preview column right of the page, HP slider, play button, Enemy/Ally switch, unit-kind switch on Units) and v2's live-proven tokens; the mock's CSS bar drawing is replaced by the real renderer.

- **Renderer reuse, not a copy.** The world renderer's `apply` was bound to its own `discover()` cache, so it could not paint another tree (P1). `hp_colors_v3_renderer.js` now runs classify, facts, plan and apply over an explicit target (`classifyWith`, `geometryOf`, `probeOf`, `factsFrom`, `applyTo`); the world path wraps them with its existing state, and `createPainter(canvas, parts)` exposes the same chain over a caller-owned part map and ledger. The painter reads no world state, schedules nothing and registers nothing. World behaviour is unchanged (renderer suite 48/48 before and after).
- **Fake tree.** `HPColorsPreviewCanvas` (200×210, the WindowRoot role) > `UnitStatus` > `Info` > `Bars` > `Bar` > `BarInner` > fill/healing/shield/armor/delta, plus `BarLines`, `BarOutline`, `HpText` under `Info`, `Name`, and the v3 owned frame `Motion > Readout > ReadoutAnchor > ReadoutLine`. Every id is `HPColorsPreview…`; no stock or world id and no carrier class appear in the menu. Carrier classes (`player`, `enemy`/`friend`, `ShowHealthValue`, damage flags during play) are data passed to the painter.
- **Kind and side.** Bar/HP Text/Name/Indicators/Presets show a hero; Units shows NPC or objective (segment). Side follows the Enemy/Ally switch and the column of the last edited setting. Unit kinds are classified like world bars and stay stock until unit gates arrive; switching kinds releases owned styles to the new kind's stock through the renderer ledger.
- **Health.** The preview writes the fill width; the renderer measures it exactly like a world clip/width signal, so the probe path is exercised.
- **Scheduling.** One job slot and one generation token: play (9 steps × 0.45 s, then back to the slider value) and at most 5 layout-settle repaints. Close, page switch, side switch, unit-kind switch, slider input, menu-script reinclusion and preview-script reinclusion cancel. Settings edits repaint in place without restarting play.
- **Isolation.** The preview writes only inside `HPColorsPreview`; it never publishes, saves, records undo or changes revisions.
- **Look.** The stock look before the renderer owns a part is CSS approximating pinned `unit_status_v2.css` (79×18 bar, mask and fill image, stock relation washes, name/HP text fonts). Shell width grows from 1240 to 1570 px for the 330 px column.

## CSS property audit (preview additions)

All preview properties occur in v2's live menu CSS or pinned stock `unit_status_v2.css`: background-color, background-image, background-size, border, border-left, brightness, color, flow-children, font-family, font-size, font-weight, height, horizontal-align, letter-spacing, margin-left, margin-right, margin-top, max-height, max-width (stock), opacity, opacity-mask (stock), overflow, padding, text-align, text-overflow, text-shadow, transform, vertical-align, visibility, wash-color, white-space, width, z-index. `transform-origin` was dropped (only in v3 world CSS; the renderer writes it inline when it owns the frame). No transitions, box-shadow, clip-path or grid.

## Failure-mode → evidence mapping

Tests: `tests/preview.test.js` (15 VM E2E tests booting the generated ESC layout with the real settings, codec, storage, renderer, preview and menu scripts). Mutation run `.build/evidence/ticket09-preview-mutations.txt`: 12 mutations, each fails at least one test.

| Failure mode | Evidence |
|---|---|
| P1 apply copy drifts | Every style in `renderer.plan(previewFacts, settings)` equals the preview panel's inline value; HP text adopted into `ReadoutLine`, status into `Motion`, `HPColorsV3Core` on the canvas; mutation bypassing the painter fails 3 tests |
| P2 renderer self-starts in menu | After boot: renderer status `stopped`, one `ClientUI_FireOutput` listener (the menu's), no jobs |
| P3 id/class collisions | Lineage parent chain asserted; all ids `HPColorsPreview…`; none in the pinned ESC/overlay layouts or the generated overlay; no carrier classes on preview panels |
| P4 writes outside the pane | Snapshot of styles, classes, text, events and parents of every panel outside the pane is identical after slider, play, stop, side and kind operations; mutation touching the pane's parent fails |
| P5 classification drift | Preview facts come from the renderer's `classifyWith`; enemy hero eligible, measured fraction 0.1 at 10% |
| P6 wrong stock after switch | Custom hero → Units: owned count 0, fill released to enemy stock `#FD4949`, HP text back in `Info`; ally switch moves unowned stock to `#FFEFD7`; ally with colors off releases to ally stock; mutation ignoring ledger ownership fails |
| P7 lingering/stale work | Close, page switch, side switch, slider input and menu reinclusion each cancel play; the captured stale callback writes nothing and schedules nothing; preview-script reinclusion retires the old instance |
| P8 slider echo | Writing the current value during play keeps playing; mutation removing the echo guard fails |
| P9 edits during play | Edit keeps the same step and one job; next step continues the sequence |
| P10 timing | Exact sequence 90/72/45/20/8/28/52/78/100, nine delays of 0.45 s, back to slider HP, empty scheduler; seconds→ms mutation fails |
| P11 saves/revisions/history | Revision, dispatch count, store commits and Undo state unchanged by preview operations |
| P12 missing panels | Invalidated fill: no throw, preview disabled with message, play inert, no jobs |
| P13 unlaid pane | Zero-width inner: "Waiting for layout", 1–5 settle repaints then stop; once laid it paints and settles to an empty scheduler; unbounded-settle mutation fails |

## Acceptance evidence

- Source: all v3 tests 240/240 (`.build/evidence/ticket09-all-tests.tap`); `node tools/generate.js --check` current.
- Build pair (`.build/evidence/ticket09-{release,debug}-build.log`): both `OK: 16 compiled, 0 failed, 0 skipped`; staged VM tests including `tests/preview.test.js` 212/212 release, 211 pass + 1 intentional release-only skip debug; exact 16-asset compiled tree and VPK (adds `panorama/scripts/hp_colors_v3_preview.vjs_c`). Release pak02 SHA256 `48c80bc964f656883d6d394eb6df2a72013d9e044766215fb543eca14f1ff8dd`; debug `70b42bc21352aeb66aaf2854894c9e9a2b3587e0f155a49106db4505e043e6ab`.
- Not done: no install, deploy or launch. Unverified in game: the stock-look approximation, fill-image wash, menu UI scale versus world scale, whether XML `Slider` value writes echo synchronously, and whether the stock ESC close path reaches the preview's close (play is bounded to ~4 s regardless). Acceptance boxes left unticked.

## Audit fixes (agent://Audit0809, 2026-10-14)

Node tests only; Main runs the final build pair. Mutation proof: `.build/evidence/audit0809-mutations.txt`.

| Finding | Fix | Evidence |
|---|---|---|
| 2. Play never shows damage or heal colors | Each step writes the feedback layers inside the preview tree. On damage, delta is `width: 100%` with `clip: rect(0%, previous%, 100%, new%)`. On heal, healing spans old to new and the fill is held at the old value. Both are cleared on the next step, on stop/cancel and on close. The renderer still owns their colors | `preview.test.js` "play shows feedback layers": exact clips for 100→90 and 90→72, the heal 8→28 holds the fill at 8%, the label shows 28%, the layers clear on the next step, on stop and on close |
| 3. Reload strands ownership | `retire()` calls `painter.release()` before the new instance attaches; a re-attach also releases any older painter | "reloading the preview script releases…": after a reload, HP text is back in `Info`, `UnitStatus` back under the canvas, `HPColorsV3Core` is removed and the custom wash is gone; after re-attaching and switching to Units, nothing is stranded |
| 6. Failed attach looks like a working preview | Missing parts add `HPC3PreviewUnavailable` to any pane that exists. A missing or throwing `createPainter` calls `disable("Preview unavailable: renderer not loaded")` | "preview that cannot attach says so": boot without a painter gives the class and the message while the menu still boots; a part removed before re-attach makes `attach` return false and adds the class |

Preview suite 18/18. Pending: V3Ticket03 is moving static plan styles into root classes (Audit03). The preview will then need matching menu CSS rules on the `HPColorsPreview` ids; that work waits for their CSS block.

## Live comparison fixes

Compared `.scratch/hpv3_live1/preview_vs_live/{menu_preview_zoom,live_enemy_hero_zoom,live_enemy_dummy_zoom,menu_full,live_full}.png`. These fixes change only the menu preview; Main owns the rebuild and visual check.

| Difference | Fix and source evidence |
|---|---|
| Scale | The fake 200×210 world root now sits inside a horizontally centered `HPColorsPreviewScale` wrapper with `ui-scale: 200%`, following Valve's Accessibility preview. Root transform magnification/translation is removed. Owned hero bars omit the stock 13 px right margin so the preview's bar and name share the canvas center; user offsets still apply. |
| Name | Enemy is `Warden`, ally `Lady Geist`, not uppercase marketing copy. Pinned `vendor/unit_status_v2.css:871-915` has no uppercase transform: it uses centered oracle 14 px, `rotateZ(-4deg)`, and an enemy color ending at `#ff6a6a`; friend inherits off-white. The preview now mirrors that relation cascade. Renderer-owned custom name color, offsets, alignment, size and release remain authoritative. No pinned team-specific name rule exists. |
| HP segment lines | `UnitHealthbarLines` has representative ticks for each sample's max HP: hero 1000 → 4; NPC 600 → 2; objective 4000 → 16. Like the existing engine-fact fixture (`scripts/validate-hp-colors-rewrite-v2-style.test.js:1569-1578`), ticks occur every 250 HP at `250k/max × 100%`, including the endpoint, and every fourth is large. Relation wash, opacity and major markers follow pinned CSS `:345-407`; small markers are now 4 px bottom-aligned notches, the lower third of the 12 px inner bar, matching the sharp live crop. Their overlay clips to the 69×12 inner rectangle rather than the larger masked backer. HP changes/play retain panels; kind changes rebuild them. |
| Eye icon | Skipped rather than inventing a hero state. Searched every stylesheet/layout listed in `game-data-pin.json`: `vendor/unit_status_v2.css`, `vendor/unit_status_overlay_v2.xml`, and `vendor/hud_escape_menu.xml`. The only related element is `TargetableIndicator` (`unit_status_overlay_v2.xml:46`), with `target_indicator.vsvg`; pinned CSS `:996-1026` hides it except for `CLASS_NECRO_HAUNTINGSKULL`, not hero/dummy samples. |
| Team | Carrier data includes enemy `team2` (Sapphire, blue), ally `team1` (Amber). VM checks verify team-high is used only when enabled. Main's live log showed `team=team2 teamHigh=false`, resolving the yellow fill as the correct configured orange→green mix, not a team bug. The resolved diagnostic was removed. Outline decisions use the same renderer plan; the hint states the assumed teams/plain state. |
| Background/outline | Retained the correct black inner/missing-HP background and rectangular/unbacked outer baseline. Added the world outline's `ignore-parent-flow: true` (`hp_colors_v3_world.css:72-78`) so it is an overlay, not a layout participant. Renderer thickness, color, opacity, transform and stock release are unchanged and exercised in the VM. |

**Remaining stock-state discrepancy:** Main reports that the 6779 install has only our pak02 loaded: the far-left, non-aimed-at TargetDummy has a small white name/eye; Solomon and the nearby aimed-at dummy have a larger yellow-green name/eye (also seen on Kelvin). The pinned inputs above contain neither that hero-name state rule nor that visibility-eye element. The stock sheet imports `citadel_base_styles.vcss` and `unit_status_icons.vcss` (`:3-4`), but neither import is vendored or pinned here. State-driven engine/import behavior is a hypothesis, not established provenance. Keep the pinned plain cascade rather than guess yellow-green colors or add an unrelated target icon.

**First-pass verification (node only; superseded by the follow-up below):**
- Five new VM regression tests initially failed against the unchanged preview: 19 pass / 5 fail in `.build/evidence/preview-live-red.tap`.
- Focused preview suite: **24/24** (`.build/evidence/preview-live-focused.tap`).
- Full `node --test hp_colors_rewrite_v3/tests/*.test.js`: **312/312**, no skips (`.build/evidence/preview-live-all-tests.tap`).
- Generator inputs regenerated; `node tools/generate.js --check`: **11 outputs current** (`.build/evidence/preview-live-generate-check.txt`).
- Disposable source-snapshot VM run: clean baseline 5/5; **9/9 mutations caught** for scale, centering, casing, stock name color, tick presence/spacing, team identity, hint and outline flow (`.build/evidence/preview-live-mutations.txt`). No source instrumentation remains.

No build, deployment, game launch or git mutation was performed by this agent. Main's build/live checks are separate evidence.

### Follow-up after Main's live check

The user screenshot `local://pasted-image-eac59c4a058dd6d5.png` showed a blurry, right-shifted sample, yellow fill and small red marks below the bar. These observations exposed limits of the original VM: every panel had the adapter's default 120×32 geometry and UI scale 1 rather than the fake tree's real CSS layout.

- **Use Valve's scale wrapper.** The supplied pinned Settings reference (`.scratch/hpv3_live1/stock_preview/popup_settings.css:3975-3987`) centers `EnemyHealthbarPreviewScale` with `ui-scale: 150%`. Our generated layout mirrors that wrapper/root structure, using 200% for this pane. Its fixed fake root remains 200×210 logical px and uses no root transform scale. The wrapper is top-aligned without Valve's 48 px margin: our fake tree already has the stock 47/65 px name/bar offsets. `popup_settings.xml:1374-1377` declares an empty native preview panel; the supplied layout has no script includes showing how it is populated. We retain the fake tree and pass carrier classes as data, not stock classes on menu panels.
- **Model measurement, not arbitrary boxes.** Focused VM fixtures now derive measured dimensions/offsets from the preview CSS and inherit wrapper `ui-scale` through `actualuiscale_x/y`. At menu scale 0.8 and wrapper scale 2, the root reports 320×336 physical px and scale 1.6; renderer facts normalize to 200×210, with 69 px inner width. Text extents remain fixed fixtures, not a font renderer.
- **Center the sample.** The world player's 13 px primary-bar margin moved its default center to 106.5 inside a 200 px canvas. Removing that preview-only margin centers it at 100 px. A VM test derives the rendered bar center through the real renderer's scale/translation and requires it to agree with the canvas/name center within 1 CSS px at zero user offsets; repeated repaints remain stable.
- **Keep ticks inside the fill rectangle.** Mask removal left the stock 74×18, 2 px-offset backer exposed: bottom-aligned 8 px ticks extended beneath the 69×12 fill. The preview line overlay now shares the inner bounds (6 px left, 3.5 px top), uses `ignore-parent-flow: true` and `overflow: clip`, and retains stock small/large tick styles. VM checks cover the bounds, small-tick containment and large-tick clipping.
- **Team discrepancy resolved by live evidence.** `createPainter` reads only its passed class array (`hp_colors_v3_renderer.js:578-582`), not Panorama ancestor classes. VM checks retain **#D07A42** at 75% with the default 65% threshold and team-high on, versus **#B6A100** toward custom green when off. Main read `team=team2 teamHigh=false` in the installed debug build: the yellow fill is expected. The temporary team repaint diagnostic and its log assertions have been removed; setting/identity regression checks remain.

**Wrapper-round verification (historical):** focused preview **27/27**; full v3 node suite **315/315**, no skips; generation check **11 outputs current**. Before the corrections, the updated scale test and three follow-up VM tests failed (23 pass / 4 fail). Disposable snapshot checks caught **7/7 mutations** covering UI scale, wrapper centering, primary margin, tick bounds/clipping, team identity and the then-requested debug diagnostic. Evidence: `.build/evidence/preview-live-followup-{red,focused,all-tests}.tap`, `preview-live-followup-generate-check.txt`, and `preview-live-followup-mutations.txt`.

Main reported the wrapper round is crisp, centered and has correctly contained tick marks (`.scratch/hpv3_live1/preview_vs_live/preview_after_uiscale.png`). The next round below adjusts notch shape and investigates the remaining HP alignment.

### HP edge and notch follow-up

Reference: the sharp dummy crop `local://pasted-image-e1de9a366ac0c0bd.png` and the live/preview frames above. Small ticks now rise from the bar's bottom through its lower third (`4/12`), not two-thirds (`8/12`). Stock 1000-HP major markers retain their height; they are also visible as tall markers in the crop.

**HP layout gap fixed:** preview settle detection previously covered the core rebase/name changes but not HP font/padding/margin/adoption changes. A readout-layout key now schedules a bounded 100 ms re-sample after those changes, and zero-width/height custom HP rows retry at most five times. Re-sampling uses the painter's fresh normalized geometry; the idle preview does not gain a perpetual poll. VM checks cover a laid row after a font edit, delayed row measurement and permanently unlaid rows.

**Alignment evidence and remaining live prerequisite:** the modeled preview preserves the world's glyph-right versus bar-right relationship within 1 CSS px at HP X offsets 18, 0, -10 and 30. At defaults, the glyph edge is about 3.6 CSS px beyond the inner bar's right edge, matching the live fixture's small positive gap. This parity check passes without a preview-only compensating offset, so none was added. Main cannot inspect live facts directly on retail and requested a diagnostic rebuild. The new single-line `// HPV3_DEBUG` log prints `hpTextOffsetX`, `hpTextAlign`, measured canvas/primary/inner geometry, row width/height and planned row transform on every repaint. The old team diagnostic is gone. The next live log is still required to establish why the screenshot's glyph edge sits left of the bar; the bounded settle fix is verified in the VM, not yet as the live cause/fix.

**Latest node evidence:** focused preview **31/31**; full v3 suite **319/319**, no skips; generation check **11 outputs current**. Before this round, four checks failed (27 pass / 4 fail); disposable snapshot checks caught **4/4 mutations** for notch height, layout-change settle, zero-row retries and the requested HP log. Artifacts: `.build/evidence/preview-live-hp-{red,focused,all-tests}.tap`, `preview-live-hp-mutations.txt`, and `preview-live-hp-generate-check.txt`.

Main owns the rebuild/readout of HP geometry and the final HP-edge/notch visual check. No builds, deployment, launches or git mutation were performed by this agent. Release stays silent; only the requested debug-only HP diagnostic is retained.

### Stock ultimate badge

The hero sample now contains `HPColorsPreviewUltPanel > HPColorsPreviewUltBackground > Image#HPColorsPreviewUltReady` under its fake `Info` panel, mirroring `vendor/unit_status_overlay_v2.xml:67-71`. It uses only the existing `s2r://panorama/images/hud/icons/icon_ultimate_off_blk.vsvg` and `icon_ultimate_blk.vsvg` assets.

CSS mirrors the stock 20 px square badge, background sizing, ready brightness 2 and enemy/friend wash (`vendor/unit_status_v2.css:122-201,239-247`). When the renderer adopts the hero frame, its badge uses the world's centered, -80 px left / 67 px top origin (`hp_colors_v3_world.css:96-103`). Master-off restores the compact stock origin. The hero sample represents `has_ultimate` with its existing preview-kind class, without putting stock carrier classes on menu panels. NPC/objective samples collapse the entire badge and ready layer; their retained static nodes paint nothing.

The preview's opacity mask stays off now and must follow the selected bar style once BAR STYLE V2 lands in ticket 19; no mask/style-setting work was started or retained in this round.

**Latest node evidence:** focused preview **33/33**, full v3 suite **321/321**, generation check **11 outputs current**. Both new badge checks failed before the subtree/styles were added (31 pass / 2 fail); disposable snapshots caught **5/5 mutations** for hero visibility, nonhero leakage, ready asset, brightness and world badge origin. Evidence: `.build/evidence/preview-live-ult-{red,focused,all-tests}.tap`, `preview-live-ult-generate-check.txt`, and `preview-live-ult-mutations.txt`. Main owns the rebuild and live badge check.
