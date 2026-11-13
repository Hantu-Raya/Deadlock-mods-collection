# 07: Rest of core bars

**What to build:** Ally side, feedback colors (healing, delta, shield, Rat King), size and position, native HP text, names and outline all work for both sides.

**Blocked by:** 03

**Status:** done

**Runs on:** gpt-6.1-sol (med). **Review:** code-review + claude-fable-5-1 review.

- [ ] Side-aware settings stored as {enemy, ally}
- [ ] HP text adopts the engine label via SetParent and restores it
- [ ] Release restores captured non-empty inline values exactly and clears absent values with `""` for CSS control
- [ ] Ops ceiling still holds
- [ ] VM E2E tests boot the real scripts and pass

## Failure modes (written before code)

- Ally defaults or fixed/gradient bands differ from v2; changing enemy-only rows corrupts explicit slot identity.
- Feedback paints the duplicate UnitShieldbar or leaks enemy settings onto allies/NPCs.
- Width/height/offset conversions mix raw ×0.1, percent offsets and CSS px, changing the shipped look.
- Geometry reads our own writes and drifts, clips the full-canvas motion frame, or stops health updates while hidden.
- HP text creates a second bound label rather than adopting UnitHealthbarValue, loses native updates, or fails to restore its stock parent.
- Font, size, color mode, offsets or outline derive from the wrong v2 baseline/unit system.
- Name color, alignment, spectator alpha or outlines remain owned after disable/recycle.
- Outline default/custom color ignores stock relation/team precedence, and thickness/opacity leak into stock.
- Release uses null clearing, recaptures our own inline value, or discards pending native leases; recycled panels retain owned presentation instead of stylesheet control.
- New schema rows fail generic menu bindings, normalization, versioned code/save slots, or lightweight world validation.
- All-features active/idle/dormant polling exceeds 300/200/30 operations/bar/s, or health/layer changes do not repaint.
- VM tests pass with a no-op renderer, or either exact build lacks core/stock assets.

## Implementation and parity

`settings/schema.json` now has 43 rows and 83 explicit slots. Existing slots 0–8 remain unchanged. Enemy/ally geometry, feedback, native HP, name and outline controls use the same generated menu/normalization/codec/world-validation paths; the shared master switch releases all core ownership. Ally core controls work independently of ally bar-color enablement.

`panorama/scripts/hp_colors_v3_renderer.js` samples engine health/layer signals, normalizes each measured axis by that panel's own UI scale and keeps the motion canvas full-size. The generated layout adds passive motion/readout/outline panels, never another bound Label. The existing `UnitStatus`, `name` and engine-bound `UnitHealthbarValue` are adopted and restored with their original sibling order.

| V2 fact or unit | V3 behavior/evidence |
|---|---|
| Native primary 79×18 CSS px, rather than the frozen 76px historical offset box | Width/height settings are CSS pixels; shipped 148%/80% become 116.92×14.4px and scale factors 1.48/0.8. |
| Raw bar offsets ×0.1 | Shipped Y −38 becomes −3.8px; offsets translate the measured native bar center. |
| HP anchor gap 33.5px, rise 8px, row padding 4px | Preserved from v2 `unit_status_v2_colors.js:184–190`; HP offsets scale per bar axis, while glyph/row extents clamp to the canvas. |
| HP/name outline setting 5 restores native styling | Preserved from v2 `unit_status_v2_colors.js:1911–1916`. HP stock strength is 5; name stock strength is 4, so name setting 5 is a compatibility sentinel, not a literal strength. Generated help states this. |
| Hidden-bar keepalive and color gate | `0.01` primary opacity is enabled only when side bar colors are enabled; visible colored bars force opacity 1. Colors off returns empty-health opacity to CSS immediately. |
| Native HP disabled | Returns the same bound label to `InfoHealthContainer`; enemy native HP is suppressed, ally show/fade rules remain native. Compact-frame compensation is 65px vertically and `(canvasWidth−100)/2` horizontally. |
| Default name and name visibility | Default name styles remain untouched, including −4° tilt. Name-on never owns native visibility; name-off uses an owned class. Oversized left/right names center their entire extent. |

The ledger captures each property's inline value before ownership and persists records across master-off, stop/restart and script reinclusion. Release restores non-empty captured values exactly, even after relation/kind changes; otherwise it writes `""`. Dynamic native states and static geometry overrides use owned root classes, so their removal returns stylesheet control immediately. Parent and class leases restore independently. Partial adoption and failed setters retain pending leases for retry.

There is no per-kind inline stock fallback table. Native CSS handles ally/neutral/team/spectator colors, boss sizing, critical scaling/animation, empty-health opacity, HP show/fade/unkillable and name gates/tilt. The generated native body has only the two compiled-import adaptations plus v2's appended global rectangular/unbacked outer-bar baseline, including closed unit gates, shield bars and master-off.

## Scheduler decision and known limits

The 1 s check validates each ledger panel once, checks lineage and refreshes ownership classification. `applyTo` indexes both leases and wanted values with panel/property Maps instead of quadratic searches or per-property `IsValid` calls. One loop still probes health at 0.15 s and geometry at 1.5 s; zero width preserves laid geometry and percent-clip health fallback without releasing ownership. Native failures back off for 1 s.

**Known limits:** ownership changes may take up to the next 1 s check; native API failures can extend pending restoration until a retry succeeds. Released CSS-driven presentation has no polling delay. The former 2.5 s stale-stock limit is removed, not merely relabelled as recycling-only. Live validation of empty-string clearing and panel-inline reads remains ticket 11.

The 300/200/30 operation ceilings apply to measured representative ancestry depth 2 and the split-stock depth-3 fixture. Main accepted the immediate world-panel parent as the live research assumption, not a guarantee for every chain up to the 12-level discovery guard. A six-extra-ancestor case proves behavior remains supported, not its operation budget. Debug logs each observed carrier's depth and total ancestry once; ticket 11 must confirm the assumption before live performance claims.

## Failure-mode → behavioral evidence

`tests/renderer.test.js` boots the actual generated world and menu includes through `scripts/hp-colors-panorama-test-adapter.js`, drives real menu events and scheduler ticks, and observes native styles/classes/parents/bindings. It does not assert renderer source text.

| Failure modes | Retained checks |
|---|---|
| Side/default/feedback contamination | Enemy and ally fixed/gradient/team bands; all primary feedback layers; duplicate UnitShieldbar untouched; ally HP/name/outline while ally colors are disabled. |
| Wrong units, drift or hidden geometry | Exact default scale/offset/anchor values; independent x/y UI scales; ten-second no-drift sample; opacity-zero-unlayout mock with `0.01` keepalive. |
| Lost native HP/name bindings or bad clamps | Bound-label identity and unchanged Label set; simulated native text updates with zero renderer text reads/writes; native fonts/colors; row growth, viewport resize, alignment/extreme/oversize clamps; spectator alpha/native name opacity. |
| Ownership leaks and recycling | Exact inline/sibling restoration, master-off/restart/reinclude, and immediate computed-CSS changes for role/boss/critical/empty/show/fade/unkillable and stock-only ancestors, with no scheduler tick. |
| Native API races | Missing/invalid panels, zero layout, adoption failure before/after mutation, persistent release and stop-write failure, cold class-read failure with bounded one-second retries and recovery. |
| Invalid config or vacuous tests | New core type/font/hex/range/step values rejected through real config delivery; the existing no-op mutation tool causes 38 behavioral failures, including painting and active-operation checks. |

## Verification, 2026-10-14

All evidence below is build-only; acceptance boxes remain untouched.

| Check actually run | Result | Evidence under `.build/evidence/` |
|---|---|---|
| `node --test --test-reporter=tap` with every `tests/*.test.js` file passed explicitly | 225/225 pass, 0 fail | `ticket07-all-tests.tap` |
| Focused renderer VM suite | 48/48 pass, 0 fail | `ticket07-renderer.tap` |
| `node hp_colors_rewrite_v3/tools/generate.js --check` | 11 outputs current, exit 0 | `ticket07-generation.log` |
| Existing `tools/check-renderer-mutation.js` | No-op killed by 38 behavioral failures; original source untouched and temporary stage removed | `ticket07-mutation.log`, `ticket03-renderer-noop-mutation.tap` |
| Release `build_hp_colors_rewrite_v3.ps1 -SkipDeploy` | Exit 0; staged VM 197/197; exact 15 compiled/packed assets | `ticket07-release-build.log` |
| Debug `build_hp_colors_rewrite_v3.ps1 -Debug -SkipDeploy` | Exit 0; staged VM 196 pass, 0 fail, 1 intentional release-only logging-check skip; exact 15 compiled/packed assets | `ticket07-debug-build.log` |

Both compiler summaries report `15 compiled, 0 failed, 0 skipped`. The wrapper accepts the known post-success redirected `Console.ReadKey` exit −532462766 only after checking that summary, its exact exception and every required output. Both VPK checks reject raw sources, v2 runtime assets and any mismatch with the exact 15-asset contract. The world stylesheet and v2 converter are included; menu-actions and migration tests run against both staged runtimes.

Measured operations/bar/s with all core options enabled on both sides:

| Scenario | Operations | Ceiling |
|---|---:|---:|
| Moving health | 171.5 | 300 |
| Idle | 158.3 | 200 |
| Never-owned dormant | 6 | 30 |
| Released dormant | 28 | 30 |
| Released split-stock contributor | 29.2 | 30 |
| Moving health with both shield/armor allocations | 265.3 | 300 |

Steady measurements have zero traversals, JSON parses, renderer text accesses, parent writes and class writes. Fixture-injected health writes are removed from the renderer count. These are counted VM operations, not CPU-time or FPS measurements.

Packages: `.build/release/pak02_dir.vpk` SHA256 `e18e5abeff761b5184fbfdfc58914b8df5c1a3af9cd4999572c3b7c061d597c8`; `.build/debug/pak02_dir.vpk` SHA256 `a27361402b7cebe8b9fa7bb7b0d610ded759517564e632b3ca7a45f8b9f8a3f0`. Machine-readable summary: `.build/evidence/ticket07-result.json`.

## Reviews and remaining live evidence

Read-only code-review and claude-fable-5-1 review found the midboss/vault fallback, non-200px HP-off origin, stock-only ancestor wake, hidden-bar zero-opacity risk, cleared-cache empty-opacity fallback, missing root noclip ownership, linear memo lookup and overdue-deadline hot retry. These are fixed; behavioral defects have retained regressions, while the WeakMap lookup change received static re-review without a CPU-time claim. Final code-review confirmed the one-second failure backoff and found no remaining concrete defect. Fable's deeper-ancestry budget finding became the explicit representative-depth assumption above.

No install/deploy, Deadlock launch, game-folder write or git mutation occurred. VM adoption does **not** prove live engine binding or pixels for the new runtime `UnitStatus`/`name` reparenting; v2 nested those statically. Ticket 11 now checks native HP/name updates, shake/ultimate-badge origin, sibling restoration, never-owned stock comparison, carrier depth and hidden-bar keepalive.

The old hard-coded native fallback table is removed. The remaining team colors, primary geometry, HP-origin compensation, name width/tilt and explicit critical/ally outline colors are checked against parsed vendored CSS. Imported base macros (`numericOracle`, `offWhite`, `offBlack`, team-dark colors) still require current-game pixel checks in ticket 11; the VM cascade leaves unpinned macro names unresolved. No visual parity or FPS improvement is claimed.

## Audit fixes — failure modes before implementation

- A0307-1: static inline native fallback snapshots delay stock animation, critical feedback, HP visibility/fades and recycled-unit styling.
- A0307-2/5/6: default names lose their native −4° tilt, visibility bypasses CSS class gates, or oversized left/right names use the wrong centering formula.
- A0307-3/7: HP-off enemies show a number that v2 suppresses, or bar visibility ignores v2's side-color gate.
- A0307-4: momentary zero layout releases leases and waits a second before re-owning.
- A0307-maintenance: per-paint validity checks and quadratic wanted/ledger searches hide work outside counted-op ceilings.
- AWhole-A4: hand-kept native geometry/color facts survive a pin rebase without a parsed-CSS consistency check.
- A0307-default-look: global masks and container backdrops return on NPC/objective/shield/master-off bars instead of v2's shipped rectangular baseline.

This audit round is Node-only; Main owns the subsequent combined build pair. Earlier package/log evidence above is historical until that pair runs.

### Finding → fix → evidence

All logs below are under `.build/evidence/`. Each behavioral fix has a passing real-script VM check and a no-fix mutation that makes it fail; `audit0307-red-proof.json` records **14/14** killed mutations. The evidence script mutates child-VM reads only and deletes its temporary hooks, never runtime files.

| Assigned item | Fix / passing VM check | Retained red evidence |
|---|---|---|
| 1 · HIGH release | `""` clears absent inline leases; captured non-empty values restore exactly. Remove native fallback snapshots and static/dynamic inline leases in favor of owned CSS classes. Immediate native animation/critical/HP/recycled-name cascade and exact-inline/sibling tests pass. | `audit0307-red-release-css.tap`, `audit0307-red-captured-inline.tap` |
| 2 · Stock name tilt | Leave default name styling untouched; preserve −4° when adding custom position transforms. | `audit0307-red-name-tilt.tap` |
| 3 · Enemy HP-off | `HPColorsV3HPHidden` suppresses enemy native HP; HP-off ally visibility/fades remain class-driven. | `audit0307-red-enemy-hp-off.tap` |
| 4 · Zero width | Keep leases, percent-clip health fallback and last laid geometry, including across full geometry refresh; resume on the 0.15 s cadence. | `audit0307-red-zero-width.tap`, `audit0307-red-zero-geometry.tap` |
| 5 · Name class | Name-on does not lease visibility or bypass native CLASS_PLAYER/HideName/spectating gates; `HPColorsV3NameHidden` implements name-off. | `audit0307-red-name-class.tap` |
| 6 · Oversized name | Use `(canvas−extent)/2 + weight×extent`; test both left and right alignment. | `audit0307-red-oversized-name.tap` |
| 7 · Map/cadence | Panel/property Maps replace quadratic lookup; existing feedback leases use the 1 s ledger validity check, not per-paint validity probes. | `audit0307-red-validity-cadence.tap` |
| 8 · Vendor constants | Remove obsolete fallback table; VM plans compare remaining team colors, bar size divisors, HP margins, name size/width/tilt and critical/ally outline colors with parsed vendor CSS. | `audit0307-red-stock-drift.tap` |
| 9 · Global v2 baseline | Ticket-02 owner appended the exact mask/background-removal suffix in `tools/game-data.js`; renderer VM checks cover closed NPC/objective gates and duplicate shield containers. | `audit0307-red-global-baseline.tap`; ticket 02 owns generator evidence |
| 10 · Ticket 18 note | Record future motion-frame boss/building exclusions and the baseline meaning of “stock”; current closed-gate checks cover all nine objective kinds. Future open-gate implementation remains ticket 18's work. | `audit0307-red-closed-gates.tap` |
| Additional Audit0307-7 | Match v2's color-gated visibility and force opacity 1 on visible colored bars; colors-off instantly restores empty opacity. | `audit0307-red-bar-gate.tap` |
| Pending preview CSS | Match owned world geometry/visibility on `HPColorsPreview` ids and keep the same global rectangular baseline. | `audit0307-red-preview-css.tap`, `tests/preview.test.js` |
| Debug marker / docs | Renderer boot uses generated `HPColorsV3WorldSettings.version`; ticket 02's VM logging check passes in the full suite. PLAN §3/D6/D13, SPEC scheduler and ticket-11 release checklist now describe the approved release path. | `audit0307-all.tap`, `audit0307-generation.log` |

### Verification and re-measured ceilings

Run in order with the **default Node test runner**, without `--test-isolation=none`:

1. Focused renderer + preview: **78/78 pass**, `audit0307-focused.tap`.
2. `node --test --test-reporter=tap hp_colors_rewrite_v3/tests/*.test.js`: **305/305 pass**, zero failures/skips; `audit0307-all.tap`.
3. `node hp_colors_rewrite_v3/tools/generate.js --check`: exit 0, **11 outputs current**; `audit0307-generation.log`.

| Scenario | Counted ops/bar/s | Ceiling | Additional IsValid calls/bar/s | Additional UI-scale reads/bar/s |
|---|---:|---:|---:|---:|
| Moving health | 156.5 | 300 | 111.6 | 46.1 |
| Idle | 143.3 | 200 | 111.6 | 46.1 |
| Never-owned dormant | 6 | 30 | 4 | 0 |
| Released dormant | 11 | 30 | 20 | 0 |
| Released split-stock contributor | 12 | 30 | 17 | 0 |
| Moving health with shield + armor | 250.3 | 300 | 138.4 | 72.9 |

Same depth-2/depth-3 fixtures, warmup and ten-second window as before. Steady traversal, JSON parsing, text access, parent writes and class writes are zero. Counted ceilings deliberately exclude `IsValid` and UI-scale reads; the additional columns now expose those costs instead of implying an absolute native-call budget. These are VM counts, not native timings/FPS.

The first deliberately failing pre-fix audit run stalled the default runner: `assert.equal` serialized giant circular `MockPanel`/VM graphs after zero-layout release changed the label's parent. A read-only reproduction (`audit0307-runner-serialization.json/.log`) times out with only the TAP header; changing that identity assertion to a scalar `assert.ok(parent===row, message)` preserves detection and lets the same wrong-gate mutation exit normally. All 14 red mutations and final suites use the default runner. There are no production timers/watchers added by this fix.

No build, deploy, game launch or git mutation. Live empty-string release/inline capture and pixels remain ticket 11; Main owns rebuilt package verification.
