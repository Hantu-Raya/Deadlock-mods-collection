# Astra audit: tickets 28 and 29

2026-10-17. Reviewed the Implementation sections and their source/test paths, against `AGENTS.md`, `ENGINE.md` and the renderer/storage contracts. This workspace has no Git comparison; the ticket-defined change set is the review boundary.

## Result

**No confirmed source defect requiring a fix was found.** Ticket 28's label controls and ticket 29's search correction are ready for the requested native check, not native acceptance. No runtime, test or generated files were changed by this audit. This report is the only added file.

The four ticket-29 investigation tests exercise real scripts and observable results; they do not establish that the three unreproduced live reports were fixed. Together with the search regression, ticket 29 adds five tests.

## Findings and remaining risks

| Severity | Finding / evidence | Fix applied or recommended |
|---|---|---|
| Medium — live acceptance gap, not a demonstrated defect | Label offset leases preserve the native animated panel, but the VM does not lay out or render the new full-canvas parent. `panorama/scripts/hp_colors_v3_renderer.js:780-790`, `panorama/styles/hp_colors_v3_world.css:7-14`, `tools/generate.js:194-196`. The engine-specific risks are clipping, inherited scale and native adoption/restoration, not an unsupported browser-only offset property. | No speculative fix. Check all three actual statuses with offsets, bar movement/scaling, reset and master off. Include simultaneous offsets and panel recycle/reappearance. |
| Medium — live acceptance gap, not a demonstrated defect | Search now requests the list origin instead of fitting a row, and the native method exists. The regression supplies a deterministic scroll effect, so it cannot prove relayout/scroll timing in Panorama. `panorama/scripts/hp_colors_v3_menu.js:1131-1163`; `tests/menu.test.js:719-736`; native evidence below. | No additional scheduling or coordinate workaround without a reproduced failure. Check rapid filtering, clearing, no results and subnavigation on both variants. |
| Medium — unresolved reported behavior | Bundle COPY, slider Undo and Health track clicks remain unconfirmed reports. `tests/menu-actions.test.js:474-532` and `tests/preview.test.js:1865-1886` prove clipboard-call output, validation, delivered gesture sequences and delivered slider values, not OS clipboard success or native pointer/event delivery. The ticket correctly leaves these open. | Follow the live procedures in `29-live-video-menu-bugs.md:39,47,63`; capture the exact error or input sequence before changing runtime behavior. |
| Low — measured budget headroom | The stressed three-label idle fixture uses **198.3 / 200** counted operations per bar per second; active uses **223.3 / 300**. `tests/renderer.test.js:702-704,724-750`. Both pass, but idle has only 1.7 operations/s of headroom in this fixture. | No optimization or ceiling increase warranted by a passing synthetic budget. Keep the existing ceiling and remeasure after future reconciliation changes. This is not FPS evidence. |

No high-severity or confirmed medium-severity implementation defect was identified. The rows above are acceptance/measurement limits, not claims of observed native failures.

## Engine-facing review

### CSS, offsets and stock animation

- The canonical stylesheet check passed: **3 files, 755 rules, maximum 10 selectors**. Independently counted maximum selector-list lengths are menu **574**, world **455**, generated stock **551** characters, below the **1,024** ceiling. Guards are at `tools/generate.js:282-322`.
- No `opacity-mask: none` regression is present. The generated stock sheet remains mask-free; existing owned bar-style rules control masks. Ticket 28 adds neither a mask nor a transition to the anchors.
- Offsets use the existing `transform: translate3d(...px, ...px, 0px)` path (`panorama/scripts/hp_colors_v3_renderer.js:650-651,783-789`), on ordinary **Panel anchors**, not on the animated native indicators. It does not introduce DOM `left`/`top`, CSS custom properties or another browser-only positioning mechanism.
- Stock `TagGroove1` changes `transform` on ASSASSINATE/UNKILLABLE panels and their child Labels; CRITICAL animates its child Label. Moving the parent anchor avoids replacing these transforms: `vendor/unit_status_v2.css:1121-1271`. The owned anchor has no animation/transition. Critical bar flashing remains on the existing native/owned bar surfaces, independent of label visibility.
- The native visibility selectors remain ancestor/descendant selectors, so inserting an anchor preserves their match: `.health_critical .ShowCriticalState #CriticalIndicator`, `.health_assassinate #AssassinateIndicator`, `.unkillable #UnkillableIndicator`. Hiding owns only `visibility: collapse`; showing releases the inline property rather than forcing `visible` (`renderer.js:783-789`, relative to `panorama/scripts/`). The new scoped `.unkillable` rule preserves HP-number hiding after readout adoption (`panorama/styles/hp_colors_v3_world.css:503-516`).
- The native status panels and labels retain their IDs. Anchors are passive (`hittest="false"`, `hittestchildren="false"`) and full-canvas; defaults do not reparent into them (`tools/generate.js:194-196`, `renderer.js:339-361`). Native drawing at extreme offsets is still owed.

### ScrollToTop on the actual panel type

`HPColorsSettingsList` is emitted as a plain `Panel` (`tools/menu-layout.js:414`) with `overflow: squish scroll` (`panorama/styles/hp_colors_v3_menu.css:88`). The call is guarded for panel validity and method presence (`panorama/scripts/hp_colors_v3_menu.js:1155-1157`).

Static inspection of the installed `game/citadel/bin/win64/client.dll` confirmed a **method registration**, not just the similarly named UI event. Binary SHA-256:

`fadaf78301af6d47d286de6199d1fd0aba7053f6ab597afa3de55369f72424c6`

The common panel JS-binding function at RVA `0x225fe60–0x2260ccc` registers `IsValid`, `visible`, `enabled`, `hittest`, dialog-variable methods and the scroll methods. Its ScrollToTop registration is:

```text
RVA 0x2260a12: lea rdx, [callback RVA 0x225dc00]
RVA 0x2260a19: lea rcx, ["ScrollToTop", string RVA 0x2d13c40]
RVA 0x2260a20: call registration helper RVA 0x224dd00
RVA 0x225dc00: mov rcx, [rcx + 8]
RVA 0x225dc04: mov rax, [rcx]
RVA 0x225dc07: jmp qword ptr [rax + 0x7e0]
```

This supports the API/type choice. It does **not** establish when scrolling takes effect relative to native relayout. Only files were read; no debugger attachment or game execution occurred. The optional `xd://decomp` route was unavailable, so the bounded static check used the already-installed PE/disassembly libraries instead.

## State, storage and test review

| Contract | Evidence and result |
|---|---|
| Append-only v13 slots | `settings/schema.json:53-61`, `settings/record.json:2-4`: slots **167–175**, three default-on booleans, six default-zero integer-pixel offsets, X ±200 / Y ±210. Existing slots are not repurposed. |
| v12 → v13, stale pending | `panorama/scripts/hp_colors_v3_codec.js:13-16,278-324` and `hp_colors_v3_from_v2.js:173-211` preserve the existing upgrade mechanism. `tests/migration.test.js:464-492` boots menu/storage, verifies old defaults and one-time pending promotion for bundle and preset, then saves/restarts. Current-version omitted defaults beat stale pending. |
| v2 mapping and data-loss protection | Shared-key fallback maps all five old label keys without another scale conversion (`panorama/scripts/hp_colors_v3_from_v2.js:137-171`). `tests/migration.test.js:454-463` imports through the actual menu, consumes pending values and checks restart. The removed dropping fallback is replaced with a fail-closed size check (`hp_colors_v3_from_v2.js:326-330`); the suite retains the large-library/scope and oversize refusal regressions. No v2 keys are written. |
| Newer-save protection | `panorama/scripts/hp_colors_v3_codec.js:280-285,363-374` still flags future versions/slots and protects unprojectable future bodies. `tests/storage.test.js:46-54,166-182,323-328` checks blocked writes and unchanged durable bytes, including recovery races; future-version tests derive the version from the current contract. |
| Presets/share codes | Generic codecs consume generated slots rather than a second label allowlist. `tests/codec.test.js:41-60` exercises **every shipped setting** at both endpoints through the 4,096-character settings code and checks bundle/save round-trips; existing preset/routing tests remain green. Record framing and caps are unchanged. |
| Release exactly / default zero writes | `panorama/scripts/hp_colors_v3_renderer.js:1118-1137,1215-1257` retains captured inline styles and native parent/order leases. `tests/renderer.test.js:2520-2589` checks both sides and all labels, independent hiding, animation selection, offsets, reset, master off/on, captured values, sibling identity/order, zero default label/anchor style writes and native class-driven visibility. Default settings skip label discovery/ownership work; zero/zero deliberately returns positioning to stock even when the bar is moved. |
| Preview | `panorama/scripts/hp_colors_v3_preview.js:150-165,447-467`, `tests/preview.test.js:1888-1911`: same painter/leases, synthetic sample for the edited label, no invented gameplay status class, page changes clear the sample, and low-health CRITICAL remains health-driven. Native animation/rendering itself is not simulated. |
| Ticket 29 tests | Search observes scroll origin/reset and absence of first-row fitting. Two COPY tests decode emitted clipboard codes and preserve the clipboard/draft on oversize refusal. Gesture tests undo delivered numeric/hue gestures once for mouse-up/blur. Health tests check rounded/clamped values, displayed HP, unchanged settings and passive scene ancestry. These are behavior assertions, not source-string assertions. |
| QOLLOCK | Full downstream suite passes; composition check reports both outputs current. The copy already includes canonical menu changes and shares the canonical menu script. No recomposition was necessary because this audit changed no source. |

## Checks actually run

All test commands used shell `node --test` with normal isolation, not a VM/sandbox substitute for the Node test runner. The compatibility commands were dispatched through a context-mode shell batch to retain only their summaries.

| Command | Result |
|---|---|
| `node --test hp_colors_rewrite_v3/tests/*.test.js` | **1219/1219**; 0 failed/cancelled/skipped |
| `node --test hp_colors_rewrite_v3_qollock/tests/*.test.js` | **24/24**; 0 failed/cancelled/skipped |
| `node --test scripts/validate-hp-colors-rewrite-v2-storage.test.js` | **48/48**; 0 failed/cancelled/skipped |
| `node hp_colors_rewrite_v3/tools/generate.js --check` | **12 outputs current**, CSS contract passes |
| `node hp_colors_rewrite_v3_qollock/tools/qollock.js --check` | **2 outputs current** |

The full v3 run also retained the 300/200/30 per-bar and 30/s no-rule HUD/identity-watch ceilings. Boundary-validity/query diagnostics remain separate from those historical counts. No tests were weakened, no source fixes were applied, and no builds, installs, launches or addon edits were performed.

## Required native check

1. For actual CRITICAL, ASSASSINATE and UNKILLABLE: toggle each independently; confirm critical flashing and UNKILLABLE HP-number hiding survive. Exercise CRITICAL with `ShowCriticalState` enabled and disabled.
2. Move each label, move/scale the bar, switch anchoring, try both sides and all three labels together. Reset offsets and turn the master off/on. Confirm native position/order/animation restore, including status expiry and reappearance. Check preview samples and page changes.
3. On normal and QOLLOCK menus, search from a scrolled page, edit the query rapidly, test no matches, clear search and use subnavigation. Confirm headers stay at the list origin.
4. Perform the ticket-29 COPY, one-Undo drag/release-outside, and Health track-click procedures. A VM pass is not evidence that those reported live paths now work.
5. Check the authorized debug session's console for `Parsing error`, `FATAL` and `Uncaught`; retain representative screenshots. Native acceptance remains open until these checks are recorded.
