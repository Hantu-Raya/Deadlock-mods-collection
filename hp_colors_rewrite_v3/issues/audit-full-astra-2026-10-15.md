# HP Colors v3 full audit — Astra — 2026-10-15

## Verdict

**Blocking for ticket 26 release.** Five reproduced defects: **P0: 0, P1: 2, P2: 3, P3: 0**. The two storage defects can lose or overwrite data. Passing existing tests does not cover the lifecycle and competing-writer cases below.

This is a current-state review of the canonical v3 lane, QOLLOCK composition/runtime, shared pipeline, wrappers, tests, and their design/issue contracts. It is not a v2 review and does not count unimplemented tickets 23–26 as implementation defects. No source fixes, builds, deployment, game launch, DLL inspection, or git writes were performed. This report is the only intentional persistent review file; the explicitly authorized suites also write their existing evidence outputs. Temporary probe profiles/artifacts were removed.

## Findings

### P0

None found.

### P1

#### F1 — Storage script reinclusion abandons pending state without retiring the old writer

**Locations:** `hp_colors_rewrite_v3/panorama/scripts/hp_colors_v3_storage.js:11,618-619,649-673`; `hp_colors_rewrite_v3/panorama/scripts/hp_colors_v3_menu.js:58-79`.

The storage IIFE replaces `$.HPColorsV3Store` and resets its controller/bundle variables without asking the previous store to snapshot and dispose. The `attach()` handoff works only between controllers inside the *same* IIFE. Menu reinclusion retires the menu publisher, not its persistence controller. The old debounce/retry callbacks therefore remain alive, while the replacement controller reads the older disk state. `bridgeGeneration` also resets, so request IDs are not unique across these storage incarnations.

**Reproduction:** With the real Escape layout and real pinned hosted-page script, hydrate, save enemy low color `#112233`, edit it to `#445566` without advancing the 0.5-second save debounce, then call `includeScripts(); onload()` on that same layout context. After 300 ms the replacement menu has reverted to `#112233` and says `Saved`. After another 10 seconds the menu still shows `#112233`, disk contains `#445566`, and status is `SAVING`. The retired controller is still participating in writes/retries. Probe A below reproduces this without modifying runtime scripts.

**Impact:** Hot reload/reinclusion can lose an unsaved draft from the editor, split visible and durable state, and allow an obsolete controller to overwrite later edits. This affects both variants because they share the store.

**Suggested fix:** Add an explicit storage-instance retirement/handoff before publishing a new facade. Transfer the pending bundle, touched slots, hydration state and bundle metadata; dispose the old bridge/timers; make old callbacks inert. Keep request-instance identity outside the reincluded closure or use a genuinely fresh nonce. Add a whole-layout reinclusion regression with an outstanding debounce and another with an outstanding chunk/reply. `tests/storage-fixture.js:202-205` currently remounts/onloads but does **not** reinclude the scripts, so its reload coverage misses this boundary.

#### F2 — Newer-save protection is checked at load, not at commit

**Locations:** `hp_colors_rewrite_v3/panorama/scripts/hp_colors_v3_storage.js:374-384,407-421`; `hp_colors_rewrite_v3/vendor/hpv2-store.js:121-128`.

`save()` relies on the `loaded/newerSave` flags from the earlier load. The page's `request.e` checksum controls backup rotation only; a mismatch does not prevent `localStorage.setItem(key, value)`. If another writer puts a newer-version record into the current key after this controller hydrates, this older controller overwrites it. It does not even rotate that unrecognized record into `.prev`.

**Reproduction:** Hydrate and save a valid current record. Replace the fake profile's current key with a correctly checksummed version-999 record containing `futureOnly` metadata, simulating a second writer. Edit one color in the already-loaded menu and advance 1 second. The real classifier reports `newer` before the edit and `valid` afterward; the future bytes are gone and status is `Saved`. Probe A reproduces this with the real page implementation.

**Impact:** Violates D4's “newer save is never overwritten” guarantee under competing writers/reload overlap. The initial-downgrade path is protected; this finding specifically requires a current-key change **after** hydration. F1 makes overlapping writers possible, but a page-side commit guard is independently needed if more than one context can access the same key.

**Suggested fix:** Give v3 writes an atomic expected-current check at the page boundary, including explicit expectations for absent/corrupt recovery. Refuse a changed current record and reload/reclassify it before retrying; never replace a newer record. Preserve v2's protocol-version-1 behavior by negotiating a v3-specific capability/field rather than changing the meaning of v2's existing rotation checksum. Test current-key changes between load and commit and during multi-chunk writes. Publishing a hosted-page change remains a separately authorized action.

### P2

#### F3 — A retired config epoch can take authority back from its replacement

**Locations:** `hp_colors_rewrite_v3/panorama/scripts/hp_colors_v3_renderer.js:1295-1300`; `hp_colors_rewrite_v3/panorama/scripts/hp_colors_v3_timers.js:302-306`.

Both consumers reject an old revision only when its epoch equals the *currently active* epoch. They forget which epochs have already been superseded. Receiving A/revision 10, then B/revision 0, then a replay of A/revision 10 accepts all three. The epoch change also clears topbar timer records again.

**Reproduction:** Broadcast these three valid envelopes through the real menu/topbar/world fixture. Renderer status changes from `epoch-B`, revision 0 back to `epoch-A`, revision 10. In the probe, B disables pickup timers and A re-enables them; the replay restores the old topbar work as well. Probe B contains the sequence.

**Impact:** A delayed/replayed retired publisher message can undo current settings and timer state. This is an authority-boundary regression test, not a claim that arbitrary remote players can inject these local events. The producer-side retirement guard is useful but does not make receivers reject already-retired authority.

**Suggested fix:** Track retired epochs within the lifetime of each consumer, or define a monotonic publisher generation/handshake that identifies the winning incarnation. Apply the same acceptance rule to renderer and topbar. Retain valid new-epoch/revision-0 startup while explicitly rejecting A→B→A replay.

#### F4 — A stale timer-triggered callback can start a second renderer loop

**Locations:** `hp_colors_rewrite_v3/panorama/scripts/hp_colors_v3_renderer.js:71-74,1229-1231,1279-1281`.

The timer-facts wake schedules `tick(generation, false)` using the mutable generation at callback execution rather than capturing it when scheduled. A canceled callback delivered after stop/start therefore passes the new generation check. It paints and schedules an additional recurring tick alongside the current loop. Separately, `tick()` clears `job` before rejecting an invalid token, so even a correctly tokened stale callback can erase the current handle.

**Reproduction:** Capture the zero-delay callback created by `setTimerFacts({pickupAllowed:false, ultimateAngle:null})`; stop and restart the renderer and restore its valid config; then invoke that captured callback to model delivery of canceled work. The fixture has one 0.15-second tick before invocation, two immediately afterward, and two still running a second later. Probe B reproduces this on unmodified real scripts.

**Impact:** The single-loop invariant and the D12 operation-budget assumptions no longer hold after this lifecycle race. More stale deliveries can add more loops. Ordinary scheduler tests pass because cancellation removes the job instead of delivering it late.

**Suggested fix:** Capture the token before scheduling, validate it before touching the current handle, and use job identity where necessary so an old callback cannot clear a replacement slot. Add a canceled-callback-delivery test that asserts exactly one recurring tick after stop/start and timer-state changes. The probe does not establish how often Panorama delivers canceled callbacks; it proves the guard fails if delivery occurs.

#### F5 — Replacing the preview tree reuses write caches from the old panels

**Locations:** `hp_colors_rewrite_v3/panorama/scripts/hp_colors_v3_preview.js:62-63,91-107,206-209,244-248,370-398`; `hp_colors_rewrite_v3/panorama/styles/hp_colors_v3_menu.css:275`.

`resolve()` replaces `parts` and `ui` and resets the model cache for a changed model, but leaves `cameraZoom`, `cameraLeft`, `cameraTop`, and `visualKey` intact. The next paint believes it has already written the new scale/canvas/fill panels. The same-script/new-root path is explicitly supported by menu boot and the storage reload fixture.

**Reproduction:** Open HERO at the default 75% HP. Its scale is `142%` and visual fill scale is `0.75, 1`. Invalidate the old tree, mount a fresh layout, run onload without reexecuting the scripts, and reopen. Preview reports `available:true, open:true`, but neither inline scale nor visual-fill scale is written. The new scale wrapper computes to its stylesheet fallback **200%**, not 142%. Probe C reproduces this.

**Impact:** A recreated Escape tree silently loses HERO 1:1 framing and displays an unscaled visual HP fill until a later relevant value change happens to invalidate each cache. At widths above 136.7, canvas/model registration can also diverge because only the model cache is reset.

**Suggested fix:** Reset every panel-write/layout cache when adopting a different preview tree, or key caches by panel identity. Do not return early from `attach(root)` merely because an old pane is still valid without also checking that it belongs to the supplied root. Test remounts at default width and at 200/316, with unchanged settings and HP.

### P3

No additional standalone finding. See the evidence/maintenance limits below; they are not counted as new implementation defects.

## What verified correctly

These conclusions are limited to source inspection, existing behavioral checks, and the probes—not a new live sign-off.

- **Renderer architecture:** facts/plan/apply are separated; inclusion alone does not start a world loop; preview uses the same planner/ledger. Lineage selects the primary healthbar rather than duplicate shieldbar IDs. Percent-clip whitespace is trimmed, each measured axis uses its panel's UI scale, and zero-layout fallback is covered.
- **Celeste/deleted-panel fix:** `renderer.js:1105-1144` distinguishes a dead leased panel from a live-panel setter failure. Dead leases are dropped without rolling back surviving parts; rediscovery is requested. The passing renderer suite includes deleted-lease/replacement and failed-restoration paths. This does not prove every possible native read race is harmless.
- **Release semantics:** inline ownership captures nonempty values, clears absent values with `null`, preserves shorthand siblings when clearing aliases, and explicitly restores name/row alignment. Pending failed releases remain leased for retry. Native dynamic presentation lives behind removable owned classes.
- **Scheduler/performance baseline:** representative-depth active/idle/dormant fixtures pass the 300/200/30 counted-operation ceilings. The repeated run reported **164.3 / 145.7 / 6** for the named baseline scenarios. These are operation counts, not FPS; not all native calls are in `COUNTED`. The same output separately reports active/idle validity calls of 189/s and UI-scale reads of 47.5/s. F4 is an uncovered lifecycle failure, not a failure of the tested steady-state cases.
- **Units and extras:** default-closed gates, ambiguous carrier rejection, recycling, neutral treatment, OLD pip layers, V2 owned masks, pulse/shake/tilt, text alignment/outline, SHOW BOUNDS and own-HUD release paths have runnable real-script/CSS-model coverage. Unit-class discovery and dormant wake work are bounded by the documented cadence.
- **Schema/codec:** generation is current; stable slots, versioned sparse records, old paired/current compact wire formats, checksum/UTF-8 rejection, unknown/newer projection, capped bundles and reserved preset identity are exercised. Future records encountered at initial load are read-only, including unprojectable future bodies. F2 is the later commit race.
- **Migration:** the suite boots the real import/load boundaries for v2 schemas and supported code formats. Unit conversion, pending-feature promotion, metadata, pre-hydration edits, corrupt-versus-conversion-error distinction, and preservation of v2 keys are covered. No v2 source was reviewed or changed here.
- **Storage ordinary paths:** exact HTTPS readiness, `vkeys` negotiation, title/request matching, chunk limits, retry/duplicate handling, trusted backup rotation, fallback recovery and reset confirmation are covered with the pinned page script and disk-backed profiles. The competing-writer and full-reinclusion holes are F1/F2.
- **Menu:** generated rows bind actual events; search filters editable rows; immutable bounded Undo, gesture coalescing, page reset/picker cancellation, preset pagination and refusal paths are behavioral tests, rather than just checking that functions exist. Settings-only imports preserve bundle metadata.
- **Preview/camera:** current tests cover play timing at 0.45 seconds, independent cancellation tokens, settling, side/kind changes, 142% HERO mapping through width 136.7, shared canvas/model zoom-out at widths 200/316, cache write counts and script reinclusion. F5 covers tree replacement, which differs from script reinclusion.
- **Timers:** separate module and opaque renderer hooks, sibling relay, no-topbar first-gate fail-closed behavior, malformed/future/stale timestamp rejection, duplicate-name ambiguity, pauses, native ultimate/pickup state and disabled-feature work are tested. Config epoch retirement remains F3.
- **CSS safety:** canonical guard passed: **3 stylesheets, 590 rules, maximum 10 selectors per rule**. The guard also enforces 1,024 selector characters and rejects `opacity-mask: none` and any mask in the generated stock sheet. Stock masks/backers are deleted by exact pinned anchors, not overridden with `none`.
- **Build protections:** wrappers require `-SkipDeploy`, validate installed-version/pins and generated currentness, clean only their staged mode, run staged suites and enforce exact compiled/VPK asset sets. The shared compiler wrapper accepts only the documented redirected-ReadKey exception or a validated exit-prompt stop with all outputs and `0 failed`. No wrapper was run in this audit.
- **QOLLOCK:** dependency direction remains lane→canonical. Composition retains pinned includes/nodes/order and validates generated IDs and collisions; post-pack verification compares structure. All 24 lane tests passed, including pinned-runtime paths. Window exclusivity, separate store panels/origins and the topbar composition are covered.
- **Logging/leftovers:** release script staging strips debug markers and fails on remaining logging calls; tests exercise logging throwers. `.tmp`, research/prototype files and diagnostic logs are not included by the exact package asset contract. Their presence alone is not a shipping defect. The preview's detailed diagnostic line is debug-marked, not an unconditional release log.

## Checks actually run

| Check | Result |
|---|---|
| `git status --short` | Read-only status inspected; unrelated dirty work preserved; lanes reviewed as current untracked trees. |
| `node --test hp_colors_rewrite_v3/tests/*.test.js` | Run twice. Repeated run: exit 0, **940 passed, 0 failed/skipped/cancelled**, about 24.94 s. |
| `node --test hp_colors_rewrite_v3_qollock/tests/*.test.js` | Exit 0, **24 passed, 0 failed/skipped/cancelled**, about 2.02 s. |
| `node hp_colors_rewrite_v3/tools/generate.js --check` | **12 outputs current**, stylesheet limits pass. |
| `node hp_colors_rewrite_v3_qollock/tools/qollock.js --check` | **2 outputs current**. |
| Real-script probes A–C | Reproduced all five findings; Node child processes exited 0 after reporting the observed states. These are diagnostic reproductions, not passing regression assertions. |
| Existing staged-source comparison and VPK SHA-256 reads | Current canonical release/debug and QOLLOCK release stages match current canonical/composed assets after the documented debug-line transform. QOLLOCK debug is stale; details below. No compilation/decompilation performed. |
| Required document existence | `AGENTS.md`, `CONTEXT.md`, `ENGINE.md`, `LIVE-VERIFIED.md` are absent in canonical v3. This matches unfinished ticket 25, not completed release evidence. |

The first ad hoc storage probe failed because the context tool used Bun and the fixture requires Node's `gc` seam; a subsequent attempt sampled before the fake page's 0.8-second navigation delay. Neither was a product-test failure. Final reproductions ran under Node after 2 seconds of hydration. Tool-call quoting failures were likewise not test results.

### Existing build parity evidence

Read-only SHA-256 checks matched the latest hashes documented in ticket 22c:

- Canonical release: `027ff9d273d74cb01a30691469e3b8666e02a3f6e7e7c96008ce7789e4670999`.
- Canonical debug: `ad6ff1c624287de7d0fdd17069e8cb17e650f476765852c0f354fe9976669c4c`.
- QOLLOCK release: `e5998045bb4a7229e58d2d2cfddf40f130f7ba061bda8700f280a6b34ef4410c`.
- Existing QOLLOCK debug: `b1bee44ecd9bc2530763c3fa4fafba082831709a8289942c0a21fd8cb9dc1808`; its staged Escape layout, preview script, settings script and menu stylesheet differ from current inputs.

Thus the **two release variants are current at the staged-source/hash level**; do not claim the QOLLOCK debug pak tests the latest hero camera. Rebuild that mode before its next live test, as PLAN D7 requires. This audit did not independently prove compiled bytes correspond to the matching stage.

## Test-quality and documentation assessment

The suite is mostly substantive: real includes/layouts, native-like alias failures, deterministic scheduler events, fake-page restarts, mutation/drift cases and operation counters. Text matches against player-facing status/error outputs are behavior checks, not source-text assertions. One literal `.gitignore` assertion remains at `tests/audit-tooling.test.js:61`; a `git check-ignore` behavior check would better match D12, but it is not a release correctness blocker.

The important gaps are the five failing cases above: storage reinclusion is not the fixture's ordinary remount; initial newer-save refusal is not compare-at-commit; same-epoch revision rejection is not retired-epoch rejection; normal cancellation is not late delivery; and preview script reinclusion is not replacing its panels with unchanged values. Retain regressions at these boundaries rather than adding assertions for the implementation text. Two successful full-suite runs showed no timing failure; they do not establish that the suite can never flake or that the native engine shares the fake scheduler's behavior.

**D14 is not fulfilled yet.** `PLAN.md:113-114` requires a live-verified ledger; `issues/11-live-test-1-core.md:7,18-24` remains in progress with the ledger and core live acceptance boxes unchecked. `issues/25-docs.md:3-12` explicitly owns these missing documents and is outside the implemented-ticket scope. `MAP.md:34` is also behind PLAN/SPEC, describing implementation only through Core/Indicators. Reconcile these in ticket 25; do not turn ticket completion or a VM count into blanket live verification.

There *is* specific live evidence recorded elsewhere: PLAN §3 records the user-confirmed Celeste fix, and `issues/22c-preview-hero-model.md:684-704,765-781` records the 1:1 and zoom-out checks and model-cost experiment. Those are historical reported evidence, not checks rerun by this audit. In particular, ticket 22c explicitly leaves missing wide-bar badge/flame behavior as an inference at lines 769–771. Do not describe their live-match parity as verified. The “Main live check” list at lines 758–763 is followed by the actual results at 765 onward and should be read with those qualifications.

## Explicit limits and release gates

- No game or native Panorama engine was started. Selector guards and the CSS simulator reduce known hazards; neither proves native parsing/layout/scene clipping for every state.
- No build, installation, remote upstream drift check, hosted-page request/push, DLL inspection, or benchmark ran. Existing build hashes and historical screenshots/performance claims were not promoted into new live evidence.
- D12 numbers apply to the suite's representative ancestry and feature scenarios, not every supported 12-level discovery chain or a PresentMon FPS result.
- QOLLOCK compatibility was exercised in its VM/pinned-runtime fixture, not by installing its pak02 over pak03. The documented prohibition on deploying that lane over the currently installed non-QOLLOCK pak03 still applies.
- Hero preset routing and ability conditions are deferred tickets 23/24; this audit checks their migration preservation boundary, not nonexistent runtime features.
- Ticket 25's docs/ledger and ticket 26's consent, parity screenshots, rollback archive, installed hash and topbar conflict resolution remain mandatory. The normal v3/ShowRank pak89 conflict in SPEC and ticket 26 is documented accurately; a compatible combined variant is not present.
- Fix/retest F1–F5, rebuild **both release variants**, refresh relevant debug variants, and obtain the remaining explicitly authorized live evidence before ticket 26 release.

## Reproduction recipes

Run these as temporary Node scripts from the repository root. They import existing test helpers and boot the unmodified runtime; no helper/source edits are needed. The observed results above came from equivalent `node -e` invocations. Helpers may print a zero-test footer because these probes are not registered `node:test` cases.

### Probe A — storage boundaries (F1/F2)

```js
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv3-audit-'));
process.env.HPV3_STORAGE_ARTIFACT_ROOT = tmp;
const { profile, launch, CURRENT } = require(process.cwd() + '/hp_colors_rewrite_v3/tests/storage-fixture');
try {
  const p = profile(), f = launch(p);
  f.run(2000); f.edit('#112233'); f.run(1000);
  const parts = p.disk.get(CURRENT).split('.');
  const wire = JSON.parse(Buffer.from(parts[2], 'base64url').toString());
  wire.v = 999; wire.b = { futureOnly: 'DO NOT LOSE' };
  parts[2] = Buffer.from(JSON.stringify(wire)).toString('base64url');
  parts[1] = f.codec.checksum(parts[2]);
  const future = parts.join('.');
  p.disk.set(CURRENT, future);
  f.edit('#445566'); f.run(1000);
  console.log('F2', f.codec.classifyRecord(future).kind,
    f.codec.classifyRecord(p.disk.get(CURRENT)).kind,
    p.disk.get(CURRENT) === future, f.status()); // newer valid false Saved

  const q = profile(), g = launch(q);
  g.run(2000); g.edit('#112233'); g.run(1000);
  g.edit('#445566'); g.includeScripts(); g.onload(); g.run(300);
  console.log('F1 early', g.settings().side.enemy.barColorLow, g.status());
  g.run(10000);
  console.log('F1 late', g.settings().side.enemy.barColorLow,
    g.codec.classifyRecord(q.disk.get(CURRENT)).bundle.settings.side.enemy.barColorLow,
    g.status()); // #112233 #445566 SAVING
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
```

### Probe B — authority and canceled delivery (F3/F4)

```js
const base = process.cwd() + '/hp_colors_rewrite_v3/tests/';
const { setup } = require(base + 'timers-fixture');
const { latestPublishedConfig } = require(base + 'boot-layout');
const f = setup(), a = latestPublishedConfig(f.menu.harness);
a.epoch = 'epoch-A'; a.revision = 10;
f.broadcast(JSON.stringify(a));
const b = JSON.parse(JSON.stringify(a));
b.epoch = 'epoch-B'; b.revision = 0;
b.settings.shared.pickupTimersEnabled = false;
f.broadcast(JSON.stringify(b));
f.broadcast(JSON.stringify(a));
console.log('F3', f.h.$.HPColorsV3Renderer.status.epoch); // epoch-A, not B

const q = setup({ noHook: true, noTopBoot: true });
const r = q.h.$.HPColorsV3Renderer;
r.setTimerFacts({ pickupAllowed: false, ultimateAngle: null });
const stale = q.h.scheduler.jobs.find(j => j.delay === 0).fn;
r.stop(); r.start();
q.broadcast(JSON.stringify(latestPublishedConfig(q.menu.harness)));
const count = () => q.h.scheduler.jobs.filter(j => j.delay === 0.15).length;
console.log('F4 before', count()); // 1
stale();
console.log('F4 after', count()); // 2
q.advance(1000);
console.log('F4 later', count()); // 2
```

### Probe C — replacement tree (F5)

```js
const base = process.cwd() + '/hp_colors_rewrite_v3/tests/';
const { loadLayout } = require(base + 'boot-layout');
const { computed } = require(base + 'style-cascade');
const b = loadLayout('hud_escape_menu.xml');
b.includeScripts(); b.onload();
const h = b.harness;
h.$.HPColorsMenuToggle();
const find = id => h.contextPanel.FindChildTraverse(id);
console.log('before', find('HPColorsPreviewScale').style.uiScale,
  find('HPColorsPreviewBarVisualFill').style.preTransformScale2d); // 142%, 0.75, 1
function invalidate(p) { p.valid = false; p.children.forEach(invalidate); }
invalidate(h.contextPanel);
b.mount(); b.onload(); h.$.HPColorsMenuToggle();
console.log('after', computed(find('HPColorsPreviewScale'), 'uiScale'),
  find('HPColorsPreviewBarVisualFill').style.preTransformScale2d); // 200%, undefined
```

## Fixes (RuntimeFix)

- **F3:** Kept the interrupted worker's retired-epoch guards in both consumers and removed their 32-epoch eviction: retirement now lasts for the consumer's lifetime. The real menu/topbar/world regression covers A/10 → B/0 → replay A/10, revision-zero startup, no replay paint/topbar restart, and replay after 40 further publishers. Reverting either consumer alone to its pre-fix script makes the retained test fail independently.
- **F4:** Kept the interrupted worker's captured generation/job-ticket scheduling and rejection before touching the current job slot. The retained real-script regression delivers a cancelled zero-delay timer-facts wake twice after stop/start, then a replaced wake within the same generation. It checks no stale paint, unchanged current job identity, exactly one recurring 0.15-second tick after advancing time, and complete cancellation on stop.
- **F5:** Kept the interrupted worker's tree-specific `attach(root)` guard and camera/visual/readout-cache resets; model/tick caches are keyed by panel identity. Six real-layout regressions remount unchanged 75%-HP HERO samples at widths **116.92, 200 and 316**, through both menu onload with an invalid old tree and direct attach with a still-valid old root. New panels receive fill, zoom, canvas margins and model registration; later unchanged-camera paints remain write-cached.
- **Preview ally parity:** Added the missing native HP visibility/opacity rules to the preview stylesheet, mapped from the sample's prefixed side/damage classes. Pinned stock rules expose HP layout with `ShowAllyHealthValue`, but expose its ink only with `active_damage`; the preview previously implemented neither rule. The retained test compares against the actual world stylesheet, including native damage timing, idle/heal hiding, below-right placement and custom-HP adoption/release.

### Red/green evidence

The previous worker had already changed runtime scripts without adding tests. Those correct partial edits were preserved rather than reverted on disk. For red evidence, Node intercepted reads of only the affected runtime scripts and supplied the unchanged pre-fix release-stage source at `.build/release/hp_colors_rewrite_v3/panorama/scripts/`; all layouts, fixtures and retained tests remained real/current. No stage or runtime file was overwritten.

- Pre-fix renderer/timers: **2 failed, 0 passed** (retired authority replay; cancelled callback painting). Substituting each consumer independently also failed F3. The resumed current implementation additionally failed the long-history case until the 32-epoch caps were removed.
- Pre-fix preview: **6 failed, 0 passed**, one for each remount path/width (new visual fill was unset).
- Current preview before the stylesheet change: ally regression **1 failed, 0 passed** (`collapse` instead of stock `visible`). After the change: **1 passed**.
- Final command: `node --test --test-reporter=tap hp_colors_rewrite_v3/tests/renderer.test.js hp_colors_rewrite_v3/tests/timers.test.js hp_colors_rewrite_v3/tests/preview.test.js` — **350 passed, 0 failed/skipped/cancelled**, exit 0.
- Ran `node hp_colors_rewrite_v3_qollock/tools/qollock.js` after the menu stylesheet change; two composed layout outputs regenerated.

### Parity limits

The screenshot's **level 1 and HP 830 are not values the preview can infer from settings**. Its HERO sample has 1,000 maximum HP, starts at 75% (750), and carries the static enemy level-label sample 19. The world renderer deliberately reads/paints custom levels only for enemies; the ally schema has no `levelsVisible`, and the pinned native layout has no level badge. Consequently the ally planner correctly reports level 0 and does not fabricate a badge. A visible badge in the reference needs the reference's actual carrier classification/configuration to explain; the image alone does not establish that runtime state.

Likewise ally Custom HP number defaults off, so a live visible native number requires the stock damage state (or a different custom-HP setting). The fixed preview models that gate during its damage sequence; at 83% its sample reads 830, but idle HP is not forced visible to imitate the reference. Fresh live classification/settings evidence is needed to reconcile the exact reference badge/number. No build, deploy, game launch, native transition/layout verification, performance run, storage edit or git write was performed here. Storage F1/F2 remain the separate storage owner's work.

## Fixes (StorageFix)

Covers F1 and F2. No build, deploy, launch, git write, commit or push was performed. The hosted-page change exists only in the local `D:/hpv2-store` worktree; it is **not published**.

### F1: storage reinclusion hands off and retires

- `hp_colors_v3_storage.js`: the store facade gains `retire()`. A reincluded script calls it on the previous `$.HPColorsV3Store` before publishing its own. `retire()` snapshots the controller (pending bundle, pending mode, touched slots, baseline, hydration and reset state), passes on `menuBundle`, `importMode`, preset serial and bridge generation, then disposes the controller. Disposal cancels the debounce/retry timers and the bridge timers and unhooks the page event holder. Late callbacks see a stopped controller or an unavailable bridge and do nothing. The old facade ignores later `attach` calls.
- The new incarnation immediately re-attaches to the menu the old store served. A whole-layout reinclusion then attaches the new menu API on the same root without a second controller. A storage-only reinclusion with no menu boot keeps saving. `onStatus` now goes to the current menu API, not the API that existed when the controller was created.
- Request ids: the bridge prefix is `v3-<inclusion nonce>.<generation>-`. The generation is handed on through `retire()`, and every inclusion adds a fresh `Date.now`/`Math.random` nonce. Message and logical ids therefore never repeat across incarnations.
- No `hp_colors_v3_menu.js` change was needed.

### F2: compare-at-commit (`cas`)

- Page (`D:/hpv2-store/index.html`, diff below; README documents `m`, `cas` and `conflict`): writes may carry `m`, which is `none` or the 8-hex FNV checksum of the whole raw value the writer last saw. At commit the page refuses with `conflict` unless the key still holds that value, or already holds the value being written (an idempotent replay after a lost acknowledgement). A malformed `m` gives `invalid_chunk`. Changing or adding `m` mid-write gives `changed_write`. A refused write clears its staging. `VERSION` stays 1, and writes without `m` (v2) are unconditional exactly as before. The ready reply advertises `c: ["vkeys", "cas"]`.
- Client: on load the bridge records `m` for the current key: `none` if absent, otherwise the checksum of the raw bytes it saw, whether the record was valid, newer or corrupt. A confirmed reset of corrupt data can therefore replace only those exact bytes. `m` is fixed for every chunk of one write and updated after an acknowledged commit.
- On `conflict` the bridge blocks saves (`loaded=false`). Persistence shows `Save changed elsewhere; reloading`, then reloads and reclassifies the record:
  - A newer record is kept and the client goes read-only (`Save from a newer version`).
  - A same-version record gets only this session's touched slots reapplied, then saves with status `Saved; merged a change saved elsewhere`.
  - Corrupt data waits for reset confirmation.
  - A pending confirmed reset is cancelled (`Saved data changed; reset cancelled`).
  - After 3 consecutive conflicts the client becomes UNAVAILABLE.
  - If the record found is our own unacknowledged commit (the exact bytes of a failed final chunk), the client keeps its earlier rotation trust and reports plain `Saved`, so the backup is not rotated twice.
- **Old page: fail closed.** v3 requires both `vkeys` and `cas` and reports UNAVAILABLE (session-only edits, no reads or writes) against a page without `cas`. Falling back to unconditional writes would bring back the overwrite race. **Consequence: v3 storage is unavailable for every player until the page change is published.** This is a ticket 26 release gate, and `tests/store-page.test.js` keeps a visible TODO test for it.
- Pin: `vendor/hpv2-store.js` holds the pinned worktree script, LF, sha256 `62c75b57…1e73`. `vendor/hpv2-store.pin.json` has `published:false` and `publishedSha256: f5c34567…cbcb` (the main `75e7620` script). While the pin is unpublished, `store-page.test.js` tests the worktree page and separately asserts that `main` still serves `publishedSha256`. `tests/audit-storage.test.js` now expects 19 skipped page tests when the checkout is absent.
- Docs: PLAN D8 and SPEC's storage bridge describe `cas`, its unpublished state and the fail-closed choice.

### Red/green evidence

| Check | Before fix | After fix |
|---|---|---|
| `tests/storage.test.js`, the new `audit F1`/`audit F2` tests plus `fails closed with no compare-at-commit` | Red: pre-fix client (staged release copy via `HPV3_SOURCE_ROOT`) against the new page: 10/10 new tests failed, 53 others passed | Green: **63/63** |
| `tests/store-page.test.js` | Red: against `HPV3_STORE_REF=main`, the ready test, 5 `cas:` tests and the pin test fail | Green: **18 pass, 1 todo** (publish gate) |
| v2 compatibility (new differential test in `store-page.test.js`) | — | v2 message shapes give byte-identical replies, disk and key accesses on main and the worktree page; only the ready `c` differs |
| v2 suite `scripts/validate-hp-colors-rewrite-v2-storage.test.js` (reads the worktree `D:/hpv2-store/index.html`) | — | **48/48** |
| Mutation checks | Removing the reset-race guard or the own-commit recognition makes the matching tests fail | — |
| Storage-dependent v3 files (audit-storage, migration, store-page, menu ×3, profile-hygiene, gameui-regression, own-hud; stage-scripts, logging, memory) | — | 338 pass + 1 todo; 130/130 |
| QOLLOCK `tests/*.test.js` | — | 24/24 |
| Storage suite with debug lines enabled | — | 63/63 |

The new tests cover:

- F1:
  - whole-layout reinclusion with the save debounce outstanding;
  - reinclusion with a multi-chunk write and its replies outstanding;
  - reinclusion with the hydration read reply outstanding;
  - storage-only reinclusion.
- F2:
  - a newer record written between load and commit;
  - a same-version change merged by touched slots;
  - a newer record written during a multi-chunk write, refused at the final chunk;
  - a reset cancelled by a repair before commit;
  - own unacknowledged commit;
  - fail-closed against a page without `cas`.

The new F1 tests also assert that no message id, logical id or id prefix repeats across incarnations. Running `HPV3_DEBUG=1` against unstaged sources fails the existing first test, because its debug log lines are still commented out. That failure exists before this change too; it is an environment mismatch, not a regression.

### Remaining limits

- **Not published.** The live page still advertises only `vkeys`, so a v3 build today shows storage UNAVAILABLE. Nothing here was live-tested in CEF/Panorama.
- The page check is atomic only within one page instance (synchronous `getItem` and `setItem` in one handler). Two CEF pages writing the same origin's localStorage at the same moment are not proven to be serialized by CEF.
- Bundle-mode pending changes (preset edits, bundle import) and settings-only imports still replace a same-version record changed elsewhere after the reload, rather than merging presets. A newer record is never replaced.
- An unacknowledged commit is recognized only by its exact bytes and only within the same bridge. After a renewed bridge, the same case reports `merged a change saved elsewhere`. The saved data is still correct.

### Exact page diff (`D:/hpv2-store`, uncommitted on `main` at `75e7620`; README.md also modified)

```diff
diff --git a/index.html b/index.html
index 635c4b8..11af4ab 100644
--- a/index.html
+++ b/index.html
@@ -57,7 +57,7 @@
       var id = request.i;
       var op = request.o;
       if (op === "hello") {
-        reply({ i: id, o: "ready", ok: true, v: VERSION, h: location.href, c: ["vkeys"] });
+        reply({ i: id, o: "ready", ok: true, v: VERSION, h: location.href, c: ["vkeys", "cas"] });
         return;
       }
       if (op === "d") {
@@ -99,14 +99,17 @@
       if (!Number.isInteger(request.n) || request.n < 1 ||
           request.n > MAX_CHUNKS || part >= request.n ||
           typeof request.v !== "string" || request.v.length > CHUNK ||
-          typeof request.e !== "string")
+          typeof request.e !== "string" ||
+          (request.m !== undefined && (typeof request.m !== "string" ||
+            !/^(none|[0-9a-f]{8})$/.test(request.m))))
         throw new Error("invalid_chunk");
       if (writeId !== request.r) {
         if (part !== 0) throw new Error("missing_chunk");
         writeId = request.r;
-        staging = { count: 0, chunks: [], total: request.n, expected: request.e, key: key };
+        staging = { count: 0, chunks: [], total: request.n, expected: request.e, key: key, match: request.m };
       }
-      if (staging.total !== request.n || staging.expected !== request.e || staging.key !== key)
+      if (staging.total !== request.n || staging.expected !== request.e || staging.key !== key ||
+          staging.match !== request.m)
         throw new Error("changed_write");
       if (staging.chunks[part] === undefined) {
         staging.chunks[part] = request.v;
@@ -123,6 +126,13 @@
       if (!validRecord(value)) throw new Error("checksum");
       var current = localStorage.getItem(key);
       var previous = key.slice(-5) === ".prev" ? null : key + ".prev";
+      // "cas" capability: a write carrying m (checksum of the whole value it
+      // last saw at this key, or "none") replaces only that value. A changed
+      // value is refused so a newer save is never overwritten. Writes without
+      // m (v2) keep the unconditional behaviour.
+      if (request.m !== undefined && current !== value &&
+          request.m !== (current === null ? "none" : checksum(current)))
+        throw new Error("conflict");
       // Only rotate a checksum that Panorama classified as valid (or wrote).
       // Replaying a commit after a lost ack must not rotate the backup twice.
       if (previous && request.e && current !== null && current !== value &&
```

### Steps a publish would take (needs the user's explicit go-ahead; none were run)

1. Review the `D:/hpv2-store` diff (`index.html`, `README.md`; both keep CRLF).
2. Rerun the v2 suite against the worktree page: `node --test scripts/validate-hp-colors-rewrite-v2-storage.test.js`. Also rerun `node --test hp_colors_rewrite_v3/tests/store-page.test.js hp_colors_rewrite_v3/tests/storage.test.js`.
3. Commit in `D:/hpv2-store`: `git add index.html README.md && git commit -m "Add compare-at-commit (cas) writes for HP Colors v3"`.
4. Push to `origin` (`https://github.com/Hantu-Raya/hpv2-store.git`) `main`, then wait for GitHub Pages to deploy.
5. Fetch `https://hantu-raya.github.io/hpv2-store/` and confirm the served inline script hashes (CRLF→LF) to `62c75b5767aff3d61cae20feb9662514b3f8ff3ccd72a0045b1115dc1ab61e73`.
6. Update `vendor/hpv2-store.pin.json`: set `commit` to the new commit, `published: true`, and remove `publishedSha256`. Update SPEC's storage bridge line and PLAN D8 ("published, commit …"). The store-page TODO test then passes as a normal test.
7. v2 players need no change. v3 then sees `cas` on the next page load; a CEF-cached old page still fails closed until it reloads.

## Fix audit (m3)

### Verdict

**Blocking for ticket 26.** Original probes A–C now show the intended fixes, but adversarial lifecycle/conflict probes still reproduce data loss. Findings: **P0: 0, P1: 3, P2: 2, P3: 1**. The unpublished hosted page remains a separate release gate. No build, deployment, game launch, DLL access, publishing, or git write was performed.

### Findings

#### P1 — M1: the conflict merge treats old or never-local edits as outstanding edits

**Locations:** `panorama/scripts/hp_colors_v3_storage.js:478-481,523-525,550-559,629-632` (paths in this section are relative to `hp_colors_rewrite_v3/` unless absolute).

`baseline` starts as defaults and is never advanced on hydration or acknowledgement. `touched` is never cleared on acknowledgement, and neither is `pendingMode`. Thus the merge does not represent the changes since the last known save:

- **Repro, no previous local edit:** seed disk enemy-low `#123456`; launch/hydrate window A; change disk enemy-low to `#654321` through another writer; in A edit only ally-low to `#ABCDEF`; advance 5 seconds. Disk ends with enemy-low **`#123456`**, ally-low `#ABCDEF`, and status **`Saved; merged a change saved elsewhere`**. A never edited enemy-low: comparing the first edit against defaults nevertheless marks it touched.
- **Repro, previously acknowledged edit:** A saves enemy-low `#112233`; B launches and saves it as `#445566`; A edits only ally-low to `#ABCDEF`. A's conflict merge restores enemy-low **`#112233`**, undoing B's newer edit.
- **Repro, sticky scope:** A adds preset `mine` and waits for `Saved`; another writer adds preset `theirs` and ally-low `#AABBCC`; A subsequently changes only enemy-low. Disk loses `theirs` and restores default ally-low **`#FFEFD7`**, because the already-completed operation left `pendingMode === "bundle"`.

These ran through the real layout/menu events and pinned page. Fix the acknowledged-baseline/dirty-scope lifecycle, not just the initial conflict example. Clear only acknowledged work, preserving edits made while that write was in flight. The new single-conflict test at `tests/storage.test.js:568-577` misses all three cases.

#### P1 — M2: reinclusion and unavailable recovery forget what the draft was based on

**Locations:** `panorama/scripts/hp_colors_v3_storage.js:486,574-590,612-621,662-664,710-718`.

The snapshot transfers `hydrated`, pending data and reset intent, but neither the expected record nor conflict provenance. A replacement controller starts `conflicted=false`; `hydrated && !foreign` then replaces a freshly loaded record with the entire stale pending bundle. A renewed bridge after UNAVAILABLE takes the same path. The page CAS subsequently succeeds because this new bridge has just read the victim record.

**Repros:**

1. Launch with `{replyLatencySec:0.3, echoLatencySec:null}`, hydrate for 3 seconds, save enemy-low `#112233`; put a same-version disk record with ally-low `#AABBCC`; edit enemy-low to `#778899`; advance **850 ms** (status `LOADING`, conflict read reply outstanding), then `includeScripts(); onload(); run(10000)`. Result: enemy-low `#778899`, ally-low **`#FFEFD7`**, status **`Saved`**. The remote ally edit disappeared.
2. Start with corrupt current/previous, edit enemy-low, confirm reset, advance **350 ms**; repair disk with a valid bundle containing preset `theirs`; reinclude/onload and advance 10 seconds. Result: **zero presets, `Saved`**, rather than cancelling the stale confirmed reset. The non-reinclusion reset-race test passes, but this lifecycle boundary bypasses its guard.
3. Launch with `{quotaChars:0, echoLatencySec:null}`, hydrate, edit, advance 40 seconds to UNAVAILABLE; another writer saves ally-low `#AABBCC`; restore quota, make another enemy edit, advance 12 seconds. Result: remote ally-low is again **`#FFEFD7`**, status **`Saved`**.

Carry the last-observed base identity/reset expectation across handoff and renewal, or conservatively reconcile every loaded record with the actual outstanding delta. A pending confirmed reset must be cancelled on a repaired record regardless of whether the conflict flag survived.

#### P1 — M3: the disclosed bundle-conflict policy silently deletes other writers' presets

**Locations:** `panorama/scripts/hp_colors_v3_storage.js:620-639`; this report's `Remaining limits` at line 319.

This is **P1 data loss**, not a non-blocking merge limitation. It is separate from M1's sticky completed mode: a genuinely outstanding preset edit also triggers it.

**Repro:** after an initial save, add preset `mine` through `HPColorsV3Store.replaceBundle` without advancing its debounce; another writer adds preset `theirs` to disk; advance 6 seconds. The page correctly rejects the first commit. The client reloads, then saves only **`["mine"]`**, reporting **`Saved; merged a change saved elsewhere`**. The remote preset survives temporarily in `.prev`, but is absent from current and the next ordinary save can rotate that backup away.

Preset mutations are ordinary edits, not permission to replace all concurrent settings/presets. Either merge by stable preset identity with an explicit conflict policy, or stop and ask the user to resolve/confirm the replacement while retaining both versions. Settings-only imports also replace concurrent settings wholesale; document/confirm that scope rather than calling it a touched-slot merge. Reapplication of scalar slots is idempotent and no duplicate preset insertion was observed—the defect is overwritten edits, not arithmetic/application twice.

#### P2 — M4: consumer reinclusion forgets retired epoch authority

**Locations:** `panorama/scripts/hp_colors_v3_renderer.js:10-12,91-98`; `panorama/scripts/hp_colors_v3_timers.js:3-8,305-312`.

**Repro:** in the real timer fixture broadcast A/10 (timers enabled), B/0 (timers disabled); reinclude the world and topbar scripts on their existing contexts; broadcast B/0, then A/10. The renderer accepts **A**, and the topbar again has a **5-second discovery job**. Both retired lists are fresh closure-local arrays after reinclusion.

Ordinary renderer `stop(); start()` retains the retired list and correctly rejects A. A legitimate **menu publisher** reinclusion generates a new epoch/revision 0 and was accepted by both consumers; it does not become permanently rejected. Thus the new rule works within an incarnation, but its authority history does not survive the consumer hot-reload boundary. Preserve the current/retired acceptance state across same-context script reinclusion, or use a shared monotonic authority contract. Do not restore the 32-entry eviction: that reopens the already-tested long-history replay.

Memory qualification: the arrays grow once per accepted replacement publisher, not per paint or revision, and use linear lookup. They have no bound during a long-lived consumer, but are discarded on reinclusion/context collection and are not persisted to disk. No native memory/performance claim is made.

#### P2 — M5: the publish checklist is not executable end-to-end and omits rollback

**Locations:** `tests/store-page.test.js:100-123,353-365`; this report's publish steps at lines 375-383.

**Repro:** simulate precisely step 6 in memory (`published:true`, remove `publishedSha256`, make `git show main:index.html` return the current candidate HTML). The page suite becomes **18 passed / 1 failed**: line 123 still unconditionally expects main's ready capabilities to equal `["vkeys"]`, but a correctly published page returns `["vkeys","cas"]`. No disk, pin, or git ref was changed by this simulation.

The differential test should compare against the **fixed pre-CAS commit**, not a moving `main`, and independently check the intended deployed capability set. Otherwise it both fails after a correct publication and stops comparing against the old v2-serving implementation. The existing checklist also has no rollback or protection for UNAVAILABLE session-only drafts. Use the completion/rollback checklist below before any separately approved publication.

#### P3 — M6: PLAN D8 retains the obsolete pre-vkeys deployment description

**Locations:** `PLAN.md:93`; compare `SPEC.md:100`, `vendor/hpv2-store.pin.json:3-8`, and `D:/hpv2-store/index.html:11-13`.

**Repro:** read the opening D8 sentence (“The live page accepts only the two v2 keys”), then inspect `git show 75e76209f4bdfaada1c79a05d9285c95f8c8c656:index.html`. That baseline already accepts versioned keys and advertises `vkeys`. SPEC correctly distinguishes published `vkeys` from unpublished `cas`; D8 should do the same. Its later “only its touched slots” promise also needs to match the actual conflict policy after M1–M3 are resolved.

### What the fixes now prove, and remaining boundaries

- **Original A:** F2 prints `newer newer true Save from a newer version`; F1 early shows draft `#445566`/`SAVING`, and late shows menu=disk=`#445566`/`Saved`. The original failures are fixed.
- **Original B:** renderer remains `epoch-B`; recurring tick counts are **1 / 1 / 1** before, after and one second after stale delivery. The retained F4 test also covers duplicate cancelled delivery, replacement within the same generation, current-handle identity and stop cancellation. The ticket/generation guard is sound for these paths.
- **Original C:** both old and replacement preview trees show **142%** and **`0.75, 1`**. The six remount tests additionally cover widths 116.92/200/316 and a still-valid old tree. Cache invalidation occurs on tree adoption, not every paint; unchanged-camera writes stay cached. No new per-paint write regression was found.
- **Ally native HP:** the real-world-stylesheet comparison passes for idle opacity 0, damage opacity 1/delay, healing hide, below-right native placement, custom adoption and release. The added rules are `panorama/styles/hp_colors_v3_menu.css:332-338`. This does not prove native transition timing in Panorama, nor justify inventing the reference screenshot's level badge.
- **Mid-chunk/mid-read handoff:** retained F1 tests pass for outstanding chunks, hydration replies, debounce and storage-only reinclusion; old message/logical prefixes do not resume. M2 is the uncovered *conflict/reset* handoff case, not a failure of ordinary chunk transfer.
- **Nonce:** additionally forced identical `Date.now()` and `Math.random()` across three storage-only reinclusions. Message IDs remained unique because handed-on generations advanced `.2`, `.3`, `.4`. Across unrelated fresh contexts the nonce is probabilistic (32-bit clock representation is not used; the random suffix has 1,679,616 choices), not a mathematical “never repeats” guarantee; replies remain scoped to their HTML panel. No practical cross-incarnation collision was reproduced.
- **Page compare-at-commit:** the retained page tests pass for absent expectations, corrupt-byte expectations, changed current values during multi-chunk writes, malformed/changing expectations, idempotent replay and backup rotation. `m` is fixed per logical write. This closes the original load-versus-commit window in the tested serialized page model. It remains a **32-bit checksum comparison**, not raw-byte equality or collision-proof identity, and `getItem` followed by `setItem` is not evidence of a cross-CEF-page transaction. The builder's concurrent-page serialization caveat remains unverified.
- **v2 compatibility/pin:** local candidate and vendor script match SHA-256 `62c75b5767aff3d61cae20feb9662514b3f8ff3ccd72a0045b1115dc1ab61e73`; the pin still truthfully says `published:false`. VERSION 1, v2 keys, keyless delete/write, ordinary replies and rotation behavior pass the differential transcript and all 48 v2 storage tests. Only ready capabilities gain `cas`. No live hosted bytes were fetched in this audit; local `main` is not proof of current GitHub Pages/CDN state.
- **UNAVAILABLE:** against ready capabilities `["vkeys"]`, an edited draft remains in the session with **zero reads/writes**. Changing the page fixture to offer `cas` and waiting another **60 seconds** does not retry by itself; a further edit renews the bridge and saves. Thus edits can remain stranded until another edit/reload, and closing the process loses unsaved session-only work. Do not tell users that publishing alone saves their existing drafts. Ordinary unavailable recovery retains the draft, but can overwrite intervening edits (M2). Encountering a newer record switches read-only and clears pending work (`storage.js:643`); the current mechanism protects disk, not a separately retained/exportable conflict draft.

### Publish completion and rollback checklist (instructions only; none performed)

1. Resolve M1–M5 and repeat their adversarial cases before releasing v3. Fix the post-publication test transition first. Keep publication separately gated on explicit user approval; passing local VM tests is not authorization.
2. Inspect the exact page worktree/ref/remote and staged diff; isolate only the reviewed `index.html` and `README.md` changes, preserving unrelated files and `/bt/`/`/dlf/`. Record the prior deployment commit **`75e76209f4bdfaada1c79a05d9285c95f8c8c656`** and LF-normalized inline-script hash **`f5c345670af32f1049338dfffb56401c5e152f78e5153aabe3092664eeabcbcb`**, plus the new reviewed commit/hash. Verify actual served prior bytes rather than assuming local main is the deployment.
3. Rerun the candidate v2/v3 page/storage checks with temporary evidence destinations. Commit only the reviewed change, then obtain approval for the exact push target and publish. Wait for the Pages deployment for that commit; fetch the exact HTTPS page without a settings-bearing fragment and verify its normalized inline-script hash and VERSION 1/`vkeys`/`cas` readiness.
4. Only then mark the pin/docs published and rerun the page suite in its **published** state. Validate authorized CEF/Panorama reload and save/restart behavior separately; a matching static hash does not establish cached-page or native transport behavior. Keep ticket 26 blocked until that required evidence exists.
5. Before refreshing/stopping any session with UNAVAILABLE, preserve its unsaved settings/bundle through the user-controlled export flow. Do not clear browser storage/cache or delete any `hantu.*` key to “fix” readiness. A cached old document needs a new bridge/page load; publication does not cause an automatic retry of a stopped bridge.
6. **Rollback if the published page regresses v2 or violates the protocol:** obtain approval for the rollback push, review a normal revert of the dedicated CAS commit (not a force-push/reset or broad worktree restore), deploy it, and verify the previous script hash and VERSION 1/`vkeys` ready reply. Re-run v2 checks. Reverting the page must not restore/delete player data: all existing v2/v3 current/previous keys stay untouched.
7. A page rollback deliberately makes new/reloaded v3 bridges UNAVAILABLE again. Warn/preserve active drafts before refreshing clients, block v3 release, restore the pin's unpublished/published-hash bookkeeping and docs to describe the actual deployed bytes, and retain both commit/hash records for re-publication. Already loaded candidate pages can continue until reloaded; never promise instantaneous rollback across all CEF caches.

### Checks actually run

| Check | Result |
|---|---|
| Original report probes A–C, extracted and run under Node | All exited 0; corrected observations listed above. |
| Current `storage.test.js` + `store-page.test.js` | **81 passed, 1 TODO, 0 failed**. The TODO is the unpublished-page gate, not a pass. |
| Current `renderer.test.js` + `preview.test.js` | **329 passed, 0 failed**. |
| Current `timers.test.js` | **21 passed, 0 failed**. Combined runtime focused total: **350 passed**. |
| `scripts/validate-hp-colors-rewrite-v2-storage.test.js` | **48 passed, 0 failed**, using the local candidate page. |
| Extra real-script probes | Reproduced M1 dirty-baseline/ack/sticky-mode failures; M2 conflict-reply, confirmed-reset and UNAVAILABLE-renewal failures; M3 genuine pending-bundle loss; M4 consumer-reinclusion replay. Verified publisher restart, stop/start retirement, forced-nonce generation handoff and unavailable retry-on-edit behavior. |
| In-memory post-publication simulation | **18 passed, 1 failed**, identifying M5 at `store-page.test.js:123`; no pin/ref/page edits. |
| Read-only source/status/diff inspection | Reviewed local page/vendor/pin, storage handoff/merge, runtime guards/caches, ally CSS/tests, PLAN D8/SPEC and the publication steps. Main's full v3/QOLLOCK suites and both currentness checks were supplied evidence, not rerun here. |

**Execution caveat:** the first context-mode test call timed out at the tool's 30-second receive limit; its child commands completed but their result was unavailable. I fell back to native eval/Node and obtained the explicit results above. That first attempt also regenerated the existing `hp_colors_rewrite_v3/.build/evidence/timers/release/timers-transcript.json` and `.tmp/hpv2-storage-e2e.json` through their test hooks—an unintended exception to the one-persistent-write audit contract. I did not delete or try to reconstruct their prior contents. Subsequent runs redirected those hooks/evidence into disposable temporary roots and removed them; probes left no retained script/profile. This appended section is the only source/report edit. Native rendering, CEF concurrent-page serialization, deployment and rollback remain untested.

## Fixes round 2 (EpochFix)

- **M4:** Renderer and timer consumers now retain a context-local authority object outside their reincluded IIFEs: current epoch, revision floor and retired epochs. Stop/start and script reinclusion leave this authority intact while replacing loops, panel caches and timer records normally. A fresh consumer can hydrate the current revision once; older revisions and retired publishers remain refused. A legitimate new menu publisher still starts at revision zero.
- **Memory contract:** No eviction was added. Comments justify retaining one epoch string per accepted replacement publisher, not per revision, paint or sample: discarding an opaque epoch would reopen long-history replay. This session-only state is collected with its context and is never persisted to disk.
- **Red first:** Added two retained real-layout regressions in `tests/timers.test.js`, independently asserting renderer authority and topbar discovery. Against the unchanged runtime, `node --test --test-name-pattern=M4: hp_colors_rewrite_v3/tests/timers.test.js` failed both: renderer returned to `epoch-A` instead of B, and the topbar restored one 5-second discovery job instead of zero.
- **Green:** `node --test --test-reporter=tap hp_colors_rewrite_v3/tests/renderer.test.js hp_colors_rewrite_v3/tests/timers.test.js` passed **264/264**, with zero failures/skips/cancellations. The regressions cover A/10 → B/0 → both consumers reincluded → B/0 → A/10; repeat after 40 publishers; reject an older current-epoch revision before hydration; and accept a real menu-publisher reinclusion at revision zero.
- **Dependent checks:** `node --test --test-reporter=tap hp_colors_rewrite_v3/tests/preview.test.js hp_colors_rewrite_v3/tests/logging.test.js hp_colors_rewrite_v3/tests/game-data.test.js hp_colors_rewrite_v3_qollock/tests/timers.test.js` passed **106/106**, with zero failures/skips/cancellations. Existing timer tests refreshed their normal `timers-transcript.json` evidence hook.
- **Limits:** VM/layout evidence only; no native Panorama, build, deploy, launch, publishing or git writes. Full-suite/build integration remains Main's check; storage findings and publication gates are unchanged by this M4-only work.

## Fixes round 2 (StorageFix4)

Covers **M1, M2, M3, M5 and M6**. This section supersedes the first storage fix's bundle-conflict/renewal limitations, TODO-based publication gate and publication steps; the historical observations above remain unchanged.

### Changes and retained regressions

- **M1:** Hydration establishes the observed bundle baseline; each acknowledged write advances it. Slot edits carry operation serials, so acknowledgement removes only edits included in that write. Later edits, including another change to the same slot during an outstanding reply, stay pending. Completed `pendingMode` resets to `edits`. All three audit repros are retained through the real Escape layout/menu and pinned page: never-local nondefault settings, an earlier acknowledged color change, and a completed preset operation followed by an unrelated edit.
- **M2:** Controller snapshots now carry the baseline record identity, bridge checksum/rotation trust, possible unacknowledged write, conflict state, operation serials, notice and confirmed-reset expectation. Every successful load reconciles the actual delta rather than trusting a stale full bundle because the controller was previously hydrated. All three audit repros are retained: reinclusion during a delayed conflict read, repaired confirmed reset during reinclusion, and quota-UNAVAILABLE bridge renewal. An additional test retains confirmation when the corrupt bytes are unchanged.
- **M3:** Three-way preset merge uses stable ids. Independent additions/edits/deletions and remote-only presets survive; competing edits/deletions of the same id keep the remote version and visibly report **“preset conflict: kept remote version; local change not saved.”** Independent bundle metadata merges per top-level field; competing metadata/order changes retain remote with that status. A rename/reorder-handoff test preserves local order alongside remote-only presets. A merge that exceeds validation/capacity refuses to write. Settings imports after hydration merge changed slots; before hydration they explicitly supply every slot and report **“settings import replaced all saved settings.”** Both policies have retained real-menu import tests and are documented in D8.
- **M5:** The differential transcript always uses fixed pre-CAS commit `75e76209f4bdfaada1c79a05d9285c95f8c8c656`, never moving `main`. A separate deployment-bookkeeping test checks the intended hash, protocol version and capability set for either pin state. The retained publication simulation makes `main` and a synthetic candidate commit return candidate HTML, marks the pin published and removes `publishedSha256` **in memory**, then runs the complete page suite with no failures, skips or TODOs. No pin, git ref or page is changed. The former intentionally failing TODO is replaced by these passing truthful checks; this does not authorize release/publication.
- **M5 recovery:** Pending UNAVAILABLE drafts automatically renew after 60 seconds without another edit; a new edit can retry after the existing 8-second cooldown. The retained regression changes the fixture's offered capabilities from `vkeys` to `vkeys` + `cas` without further editing and observes the original draft saved. Every renewal reloads/reconciles before saving. Retry does not guarantee eviction of an already-loaded CEF document/CDN cache; preserve an unavailable draft with bundle export before stopping/reloading the session.
- **M6:** D8 now opens with published `vkeys` versus unpublished `cas`, and precisely documents acknowledged deltas, preset conflicts, import scope, recovery and remaining transport limits. SPEC's storage decision matches it. The page script/vendor pin and local page checkout did not need further changes; their existing CAS candidate bytes remain unchanged and unpublished.

### Red/green evidence

All storage regressions boot current real scripts/layouts and the SHA-pinned page, not a replacement persistence model.

| Check | Evidence |
|---|---|
| Initial retained M1–M3 repros and automatic M5 recovery, before runtime edits | Failed for each reported M1/M2 repro, genuine outstanding-preset loss, same-preset conflict, settings-import conflict, and automatic recovery. The in-flight-edit guard case already passed and remains retained. |
| Additional reset-confirmation handoff / preset rename-order handoff / pre-hydration import disclosure | Each was run red before its corresponding correction: confirmation was lost, order was wrong, and the replacement was only labeled `Saved`, respectively. |
| M5 pre-fix moving-main behavior under publication simulation | In-memory substitution of `main` for the fixed baseline gives **18 pass / 1 fail**, reproducing the published `cas` capability mismatch without filesystem or git changes. |
| Final storage/page/dependent suites | `storage`, `store-page`, `audit-storage`, `migration`, `menu`, `menu-actions`, `menu-audit`, `profile-hygiene`, `gameui-regression`, `own-hud`: **417 passed, 0 failed/TODO**. Storage includes **77** cases; page includes **19**, with its nested publication run also **19/19**. |
| Additional storage-dependent boundaries | `stage-scripts`, `logging`, `memory`: **130 passed, 0 failed/TODO**. |
| `node --test scripts/validate-hp-colors-rewrite-v2-storage.test.js` | **48/48 passed**, against the unchanged local CAS candidate page. |

V3 storage evidence was redirected to disposable temporary roots and removed. The v2 suite refreshed its existing `.tmp/hpv2-storage-e2e.json` evidence hook. One combined context-mode call exceeded its 30-second receive deadline; its outcome was not counted. Native eval/Node fallback supplied the explicit completed results above.

### Executable publication completion and rollback checklist

These are instructions for a **separately approved publication**, not actions performed here. Run checks from the collection repository unless a command explicitly uses `git -C D:/hpv2-store`.

1. Preserve active UNAVAILABLE drafts through the existing bundle-export controls before stopping/reloading clients. Do not delete storage keys or clear browser data. Inspect `git -C D:/hpv2-store status --short` and `git -C D:/hpv2-store diff -- index.html README.md`; isolate only the reviewed CAS change, preserving `/bt/`, `/dlf/` and unrelated work.
2. Record the actual previously served deployment commit/hash and candidate commit/hash. The known pre-CAS baseline is commit `75e76209f4bdfaada1c79a05d9285c95f8c8c656`, normalized script SHA-256 `f5c345670af32f1049338dfffb56401c5e152f78e5153aabe3092664eeabcbcb`; the unchanged local candidate hash is `62c75b5767aff3d61cae20feb9662514b3f8ff3ccd72a0045b1115dc1ab61e73`. Confirm actual served bytes rather than assuming local `main` is deployed.
3. Run `node --test scripts/validate-hp-colors-rewrite-v2-storage.test.js` and `node --test hp_colors_rewrite_v3/tests/store-page.test.js hp_colors_rewrite_v3/tests/storage.test.js`. To isolate transcripts, set `HPV2_STORAGE_ARTIFACT` to a temporary JSON filename and `HPV3_STORAGE_ARTIFACT_ROOT` to a temporary directory before running. The page suite automatically exercises the complete step-6 published state; a local passing simulation is not a hosted deployment.
4. After explicit approval, commit only reviewed `index.html`/`README.md` changes, inspect the resulting commit, and obtain approval for its exact push to `https://github.com/Hantu-Raya/hpv2-store.git` `main`. Wait for Pages to deploy that commit.
5. Fetch the exact HTTPS page without any settings-bearing fragment. Normalize its inline script CRLF→LF and verify candidate SHA-256 plus VERSION 1 readiness with `["vkeys","cas"]`. Preserve the prior and new deployment records.
6. Only after served-byte verification, set the pin's `commit` to the published candidate commit, `published:true`, remove `publishedSha256`, and update PLAN D8/SPEC from unpublished to that actual deployment. Rerun the same page/storage and v2 commands from step 3. The fixed compatibility baseline remains `75e7620`; do not change it to the new commit. The page suite now checks the real published-pin state without a TODO or obsolete `main` capability expectation.
7. Obtain separately authorized native CEF/Panorama reload/save/restart evidence. Keep ticket 26 blocked until that evidence exists. Automatic retry only saves after the loaded page actually offers `cas`; publishing alone does not prove an existing cached document refreshed.
8. **Rollback:** preserve active drafts first, obtain approval for a rollback push, review a normal revert of the dedicated CAS commit, and deploy that revert. Do not reset/force-push or restore the whole worktree. Verify the prior served normalized hash and VERSION 1/`["vkeys"]` readiness; rerun the v2 suite. Existing v2/v3 current/previous keys must stay untouched.
9. After verified rollback, block v3 release and restore pin bookkeeping to describe deployed reality: `published:false`, `publishedSha256` equal to the verified pre-CAS hash, `commit` equal to the deployed rollback commit; retain `sha256` for the candidate fixture. Update D8/SPEC to unpublished again and retain both deployment commit/hash records. Rerun step 3 with `HPV3_STORE_REF` set to the retained reviewed CAS candidate commit, so candidate behavior/pin tests still use candidate code while deployment-bookkeeping independently checks reverted `main`. Remove that override for ordinary worktree/published checks afterwards. New/reloaded v3 bridges deliberately become UNAVAILABLE; already-loaded candidate pages may persist until refreshed, so do not promise instantaneous rollback across caches.

### Remaining limits

No build, deployment, native Panorama/CEF load, game launch, git write, push, publishing or live-host fetch was performed. Main owns full-suite/build integration. CAS remains a 32-bit checksum guard with synchronous page-local get/set, not proven cross-CEF transaction serialization. Session-only drafts can still be lost on process exit without export; newer-record read-only protection does not create a separately retained conflict-draft export. The CAS page remains unpublished and ticket 26 remains gated on publication and native evidence.

## Round 2 audit (m3)

### Verdict

**Ticket 26 is still blocked beyond the explicit hosted-page publish gate.** Every original M1–M6 reproduction and original probe A–C now shows the intended correction, but a new overlapping-write/handoff case loses the later preset edit. New findings: **P0: 0, P1: 1, P2: 0, P3: 1**. R2-1 is blocking; R2-2 is not. Separately, publication/served-byte verification and the checklist's authorized native CEF/Panorama evidence remain outstanding.

This was a read-only source/runtime audit except for this appended section. No build, deployment, game launch, DLL inspection, live-host fetch, git write or publication ran.

### New findings

#### P1 — R2-1: an own unacknowledged preset commit defeats the later draft during handoff

**Locations:** `panorama/scripts/hp_colors_v3_storage.js:415-419,599-608,657,699-708` (module-relative paths).

The bridge correctly recognizes its own committed-but-unacknowledged record through `result.own`. The controller uses that flag for foreign-change/reset decisions, but still runs the preset three-way merge against the **older acknowledged baseline**. If another local edit changed the same preset while the first acknowledgement was pending, the merge mistakes its own first write for a competing writer and discards the later edit.

**Repro:** hydrate and save preset `p0`; use `{replyLatencySec:0.3, echoLatencySec:null}`. Rename it to `First`, advance 600 ms (the 500-ms debounce committed, the acknowledgement has not arrived), rename it to `Second`, then `includeScripts(); onload(); run(10000)`. Disk and the replacement menu both retain **`First`**, not `Second`, with **`Saved; preset conflict: kept remote version; local change not saved`**. Replacing the second rename with deletion also incorrectly retains `First`. There is **no competing writer**.

The following runs from the repository root without modifying runtime/helper files:

```js
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv3-r2-own-'));
process.env.HPV3_STORAGE_ARTIFACT_ROOT = tmp;
require('node:test').after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const { profile, launch, CURRENT } =
  require(process.cwd() + '/hp_colors_rewrite_v3/tests/storage-fixture');
const p = profile(), f = launch(p, { replyLatencySec: 0.3, echoLatencySec: null });
const store = () => f.harness.$.HPColorsV3Store;
f.run(3000);
let b = store().getBundle();
b.presets = [{ id: 'p0', name: 'Original', settings: b.settings }];
store().replaceBundle(b); f.run(3000);
b = store().getBundle(); b.presets[0].name = 'First';
store().replaceBundle(b); f.run(600);
b = store().getBundle(); b.presets[0].name = 'Second'; // Or: b.presets = [];
store().replaceBundle(b);
f.includeScripts(); f.onload(); f.run(10000);
console.log(f.codec.classifyRecord(p.disk.get(CURRENT)).bundle.presets.map(p => p.name));
console.log(store().getBundle().presets.map(p => p.name), f.status());
// Both arrays: ["First"]; false remote-conflict status.
```

**Impact/fix direction:** ordinary same-context reinclusion can erase a later rename/delete even though the earlier commit is explicitly recognized as this controller's own. Preserve the in-flight operation's base/bundle through handoff and reconcile subsequent preset/metadata changes against that recognized own commit, without clearing later scalar operations. Merely suppressing the conflict message would hide the loss. The retained M1 in-flight test covers scalar slots; the ordinary in-flight preset probe passes without reinclusion and therefore does not catch this boundary.

#### P3 — R2-2: independent preset addition plus remote reorder reports nonexistent lost work

**Locations:** `panorama/scripts/hp_colors_v3_storage.js:610-623,634`.

The order check compares complete id lists, treating membership changes as reorder operations.

**Repro:** save `[p0,p1]`; locally append preset `local` through `replaceBundle`, without advancing the debounce. Independently replace disk with the same two original presets reordered to `[p1,p0]`; advance 8 seconds. The saved result is correctly **`[p1,p0,local]`**, but status says **`Saved; preset conflict: kept remote version; local change not saved`**. Every local change was actually saved. This was reproduced with the real layout/menu and pinned page.

**Impact/fix direction:** a harmless independent merge produces a false data-loss warning. Compare the relative order of surviving common identities separately from additions/deletions before declaring an order conflict. This does not block release by itself.

### Original repros rerun

| Repro | Current result |
|---|---|
| M1: never-local nondefault slot, earlier acknowledged color, completed bundle scope; plus same-slot edit while acknowledgement is outstanding | All four retained cases pass. Hydration/acknowledgement remove stale scalar work without clearing later edits. R2-1 is the newly exposed preset/handoff boundary. |
| M2: delayed conflict-read reinclusion; repaired confirmed reset during reinclusion; quota-UNAVAILABLE renewal | All three original cases pass. Remote settings/presets survive, repaired resets cancel. The additional unchanged-corrupt confirmation handoff also passes. |
| M3: genuinely outstanding local preset versus remote addition | Both identities survive. Retained same-id conflict, rename/order handoff and settings-import cases pass. |
| M4: A/10 → B/0 → consumer reinclusion → B/0 → A/10 | Both retained consumer tests pass, including 40 replacement publishers, revision-floor rejection before hydration, and legitimate publisher restart at revision zero. |
| M5: published pin and candidate `main` simulation | Complete page suite passes, including its nested published-state run: no failure, skip or TODO. The fixed pre-CAS comparison no longer follows moving `main`. |
| M6: D8 versus published baseline, pin and SPEC | Original stale pre-vkeys wording is gone. D8/SPEC correctly distinguish published `vkeys` and unpublished `cas`; remaining implementation exceptions are noted below. |
| Original A, F1 | Early draft `#445566`/`SAVING`; late menu=disk=`#445566`/`Saved`. |
| Original A, F2 | `newer newer true Save from a newer version`: future bytes remain intact. |
| Original B, F3/F4 | Epoch stays B; recurring tick counts remain **1 / 1 / 1** around stale delivery. |
| Original C, F5 | Replacement preview retains **142%** scale and **`0.75, 1`** visual fill. |

### Additional adversarial coverage

- **Acknowledged baseline/overlap:** a preset rename followed by another rename, deletion of a different preset and reorder while the acknowledgement is outstanding survives a later foreign addition when there is no reinclusion. The same-identity own-write/handoff variants fail as R2-1; rename and delete were independently reproduced.
- **Identity merge:** local-delete/remote-edit retains the remote entry; local-edit/remote-delete retains deletion; independent delete/rename, both deleting the same id, independent renames, and competing reorders retain the intended identities/content. Competing reorder retains remote order with a conflict message. A rejected local deletion currently moves the retained remote entry to the end (`[p0,p1,p2]` becomes `[p1,p2,p0]`), another consequence of treating membership as an ordering operation; no preset content is lost in this case.
- **128 cap:** start with 127 presets and add a different 128th on each side. The 129-entry merge is refused; current disk remains byte-identical to the remote 128-entry record, the local 128-entry draft remains exportable, and advancing another 180 seconds adds no write attempts.
- **Settings-only imports:** hydrated import changes only touched slots and preserves unrelated remote settings. A pre-hydration import followed by reinclusion replaces all supplied settings, retains the remote preset library and retains the explicit full-settings replacement notice. This matches the documented distinction; it is not an unannounced whole-bundle replacement.
- **Reset authority:** automatic renewal after a quota-failed confirmed reset cancels that reset when the record was repaired. Reinclusion after the corrupt current bytes change requires fresh confirmation and does not write over those new bytes. Unchanged corrupt bytes retain the original confirmation.
- **Automatic CAS recovery/no storm:** with an existing draft and only `vkeys`, 600 simulated seconds produce no reads/writes and at most 12 hello requests. Enabling `cas` then produces one logical write, preserves a remote-only preset and unrelated remote ally color, and another 180 seconds produces no further writes. A separate recovery against a correctly checksummed version-999 record performs zero writes and preserves both current and previous bytes.
- **Epoch memory/context isolation:** 1,000 accepted revisions of one epoch add zero retirement entries; 100 replacement epochs add exactly 100 strings. The retained object contains only `epoch`, `revision` and `retired`, not panels/configs/jobs. Same-context reinclusion preserves its identity/history. A world-only retired epoch remains acceptable to the independent topbar and to a fresh world context; the menu preview's renderer authority stays empty even when opened. No cross-context leakage was reproduced. Lookup/history remain linear in accepted replacement publishers and intentionally unbounded until context collection; this is not a per-paint leak or a native memory benchmark.

### Publish/rollback execution and documentation

The new checklist is executable at the local test/bookkeeping level. The local candidate page suite passes **19/19**, and its nested published-pin simulation passes the complete suite. I additionally simulated rollback **in memory**: reverted `main`/worktree page, `published:false`, rollback pin commit and `HPV3_STORE_REF` pointing to the retained CAS candidate. The complete page suite passes **19/19**, including its nested publication check; the v2 suite against the reverted pre-CAS page passes **48/48**. Synthetic refs were supplied only through subprocess interception; no refs, pin or page bytes were edited. Both transcript environment overrides named in the checklist exist and were used where applicable.

This verifies the earlier M5 failure is resolved, not that Pages/CDN or an existing CEF document refreshes. Approval, actual served-byte hashes, dedicated commit/revert, draft export and authorized native save/restart evidence remain real prerequisites. The checklist does not authorize performing them during this audit.

`PLAN.md:93-99` and `SPEC.md:100` now match capability gating, settings-import scope, acknowledged scalar deltas, stable-id merging, refusal at capacity, reset cancellation and bounded unavailable recovery in the exercised paths. D8's promise to retain later in-flight work through handoff is **not fully implemented for presets** (R2-1); the independent merge's conflict status is inaccurate (R2-2). These are implementation defects, not reasons to weaken those guarantees. The round-2 checklist link resolves to the existing report section.

### Checks and execution limits

| Check actually run here | Result |
|---|---|
| `storage.test.js`, `--test-name-pattern="audit M"` | **14 passed**, no failures/skips. |
| `timers.test.js`, `--test-name-pattern="M4:|F4:"` | **3 passed**, no failures/skips; only its evidence destination was redirected in memory. |
| `store-page.test.js` | **19 passed**, no failures/skips/TODOs; includes complete published-state simulation. |
| Rollback page simulation | **19 passed**, no failures/skips/TODOs. |
| v2 storage suite against simulated reverted page | **48 passed**, no failures/skips/TODOs. |
| Original A–C and additional real-script probes | Original fixes confirmed; two R2-1 variants and R2-2 reproduced; positive boundary results listed above. |

Main's supplied **v3 985/985**, **QOLLOCK 24/24**, candidate **v2 48/48** and both currentness checks were not rerun or relabeled as my evidence. No tracked evidence files were regenerated: storage/v2 transcripts and the timer hook were redirected to disposable temporary directories and removed. The first context-mode execution failed before running its code because escaped newlines became an unterminated string; native eval/Node supplied all reported results. The only persistent audit write is this section.

## Fixes round 3 (StorageFix5)

### Changes and retained regressions

- **R2-1:** Each bridge write now carries its controller operation token alongside the exact encoded record. Retirement snapshots retain both the active write and earlier lost-ack candidates; a replacement chunk must not hide the earlier commit still on disk. Acknowledgement or reload of matching own bytes advances the same baseline and clears only scalar/mode operations through that token. Preset and metadata reconciliation therefore starts from the recognized own commit, preserving later rename/delete/metadata changes and later scalar edits rather than treating them as competing remote work. Candidates are deduplicated on failed writes and cleared on acknowledgement/read.
- **R2-2:** Ordering compares the relative order of baseline identities surviving on both sides, independently of additions/deletions. Independent add/reorder merges no longer claim lost local work. Genuine competing reorders still retain remote order with the explicit conflict status. A rejected deletion no longer moves the retained remote preset merely because membership changed.
- `tests/storage.test.js` retains **11 new real-layout/pinned-page cases**: rename/delete after an own commit through reinclusion, lost acknowledgement and ordinary delayed acknowledgement; earlier lost-ack identity during a replacement multi-chunk handoff; add/reorder in both directions; genuinely conflicting orders; and rejected-deletion order preservation. Assertions check menu and durable preset data, metadata, later scalar settings, status and backup rotation where applicable. No fixture, hosted-page, vendor-pin or publication change was needed.

### Red/green evidence

- Before the R2-1 runtime change, the rename/delete × reinclusion/lost-acknowledgement regressions were **0 passed / 4 failed**, retaining `First` rather than `Second` or deletion. The additional replacement-chunk handoff case also ran red against the initial correction, retaining `First`; keeping both commit candidates corrected it. Ordinary delayed-reply cases remain passing guards.
- Before the R2-2 runtime change, its four cases were **2 passed / 2 failed**: the reported false lost-work warning and the rejected deletion's unintended `[p1,p2,p0]` order. Both are green; inverse add/reorder and genuine-order-conflict guards stay green.

| Check actually run | Result |
|---|---|
| `node --test hp_colors_rewrite_v3/tests/storage.test.js hp_colors_rewrite_v3/tests/store-page.test.js` | **107/107 passed**: storage **88**, page **19**, including the page suite's nested complete publication simulation. |
| Storage-dependent `audit-storage`, `migration`, `menu`, `menu-actions`, `menu-audit`, `profile-hygiene`, `gameui-regression`, `own-hud` | **321/321 passed**. |
| Storage-dependent `stage-scripts`, `logging`, `memory` | **130/130 passed**. |
| `node --test scripts/validate-hp-colors-rewrite-v2-storage.test.js` | **48/48 passed**, against the unchanged local CAS candidate page. |
| `node --test hp_colors_rewrite_v3_qollock/tests/*.test.js` | **24/24 passed**. |
| Storage with debug markers enabled in memory | **88/88 passed**. |

All final checks exited 0 with no failures, skips, cancellations or TODOs. Storage/v2 transcripts and the two menu evidence hooks were redirected to disposable temporary destinations and removed. An initial context-mode escaped-newline error occurred before tests; native eval supplied the first red run, and corrected context-mode calls supplied the remaining runs. An optional first debug invocation set only `HPV3_DEBUG=1`, leaving source debug comments disabled, and failed its expected-log assertion (87/88); enabling those markers in memory, without staging/building or source edits, yielded the reported 88/88.

Only the storage source, its retained tests and this report were edited. No build, deployment, game/native CEF launch, git write, push, publication or hosted-page fetch was performed. Publication/served-byte verification and authorized native evidence remain release gates; these VM results do not replace them.

## Round 3 audit (m3)

### Verdict

**Ticket 26 remains blocked beyond the hosted-page publish gate.** The original R2-1 and R2-2 repros are fixed, and all **11 retained R2 regressions pass**, but an independent foreign write during the unacknowledged-commit handoff still destroys later local preset work. New findings: **P0: 0, P1: 1, P2: 0, P3: 0**. R3-1 is blocking. This audit does not discharge the separately required publication/served-byte and authorized native evidence gates.

### P1 — R3-1: a foreign addition before the replacement read hides the own commit and discards later edits

**Locations:** `panorama/scripts/hp_colors_v3_storage.js:419-422,609-614,636-639,709-719` (module-relative paths).

The handoff recognizes an own commit only when the complete newly read record equals a retained candidate. If another writer reads that committed record and merely adds an unrelated preset before the replacement bridge reads it, the bytes no longer match. The bridge discards the candidate, and the controller merges against the older acknowledged baseline. Its own earlier rename is therefore mistaken for a competing remote rename; the later local rename, deletion or preset-settings edit is rejected. The same failure affects later bundle metadata. Both the durable record and the menu lose the later work, so the rejected draft is no longer available to export.

**Repro:** use the real-layout/pinned-page fixture with `{replyLatencySec:0.3, echoLatencySec:null}`. Hydrate, save `p0: Original`, then rename it to `First` and advance 600 ms: the write has committed but its reply is outstanding. Rename it to `Second`, reinclude the scripts, and immediately append an unrelated `remote` preset to the current disk record. Advance 10 seconds. Expected: `["Second","Remote"]`. Actual, in both disk and menu: **`["First","Remote"]`**, with **`Saved; preset conflict: kept remote version; local change not saved`**. The foreign writer never edits `p0`.

This exact minimal probe ran from the repository root; its temporary profile/evidence directories are removed by the fixture and hook:

```js
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hpv3-r3-'));
process.env.HPV3_STORAGE_ARTIFACT_ROOT = tmp;
require('node:test').after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const { profile, launch, CURRENT } =
  require(process.cwd() + '/hp_colors_rewrite_v3/tests/storage-fixture');
const p = profile(), f = launch(p, { replyLatencySec: 0.3, echoLatencySec: null });
const store = () => f.harness.$.HPColorsV3Store;
f.run(3000);
let b = store().getBundle();
b.presets = [{ id: 'p0', name: 'Original', settings: b.settings }];
store().replaceBundle(b); f.run(3000);
b = store().getBundle(); b.presets[0].name = 'First'; b.v2pending = { first: true };
store().replaceBundle(b); f.run(600);
b = store().getBundle(); b.presets[0].name = 'Second'; b.v2pending = { second: true };
store().replaceBundle(b);
f.includeScripts(); f.onload();
const remote = f.codec.classifyRecord(p.disk.get(CURRENT)).bundle;
remote.presets.push({ id: 'remote', name: 'Remote', settings: remote.settings });
p.disk.set(CURRENT, f.codec.encodeRecord(remote));
f.run(10000);
const disk = f.codec.classifyRecord(p.disk.get(CURRENT)).bundle;
console.log(disk.presets.map(p => p.name), store().getBundle().presets.map(p => p.name));
console.log(disk.v2pending, f.status());
// ["First", "Remote"] twice; { first: true }; false same-preset conflict.
```

**Controls and scope:** the same independent addition without reinclusion retains `Second` and `{second:true}`. Addition at handoff +0 or +100 ms reproduces the loss; at +350 or +650 ms, after the replacement read has captured the own commit, both changes survive. Two immediate reinclusions also reproduce it. Replacing the later rename with deletion or a preset-settings edit loses that operation too; a later scalar setting still survives. This is not the documented genuine same-preset conflict policy: the foreign operation is exclusively an addition.

**Fix requirement:** preserve/reconcile the later delta when the observed foreign bundle includes earlier own work, or retain the unresolved local draft rather than destroying it. Do not treat every unacknowledged candidate as proof of a committed baseline; the existing lost-ack/multi-chunk tests correctly cover candidates that may not have landed.

### Original repros and adversarial results

| Case actually exercised | Result |
|---|---|
| Original R2-1: later rename/delete after own commit | Fixed through reinclusion, lost acknowledgement and ordinary delayed acknowledgement; later metadata/scalars and backup rotation pass the retained assertions. |
| Original R2-2: independent addition/reorder | Fixed in both directions; genuine competing order still reports conflict, and rejected deletion preserves remote order. |
| Two reinclusions separated by 0, 100 or 650 ms | Later rename, deletion of another preset, preset-settings edit, metadata and scalar setting all survive together when no foreign write intervenes. |
| Rename/edit/delete followed by rename/edit/delete | All nine combinations survive two immediate reinclusions. After a first deletion, the second operation targets the next surviving preset. |
| Old successful reply after handoff | Naturally delayed replies and explicit replay before/after the replacement settles do not replace the later draft, change final bytes or schedule additional writes. |
| Earlier lost acknowledgement plus replacement multi-chunk write | Two immediate reinclusions retain the earlier candidate and complete the later 43-preset draft with `Second`; status is `Saved`. |
| Independent foreign addition during handoff | **R3-1:** before the replacement read, later preset/metadata work is lost; after the read, it survives. |
| Genuine same-id foreign conflict after the replacement read | Remote rename wins over local rename/delete/settings edit with the explicit conflict status, as specified. |
| Write-storm checks | Every settled adversarial fixture was advanced another 180 simulated seconds: zero additional write requests and unchanged current bytes. The minimal R3-1 case uses three total write requests including seeding; the multi-chunk case uses six chunks total. No storm reproduced. |

### Checks and limits

- Ran `node --test --test-reporter=tap --test-name-pattern="audit R2-" hp_colors_rewrite_v3/tests/storage.test.js`: **11 passed, 0 failed/cancelled/skipped/TODO**. The first launcher accidentally selected context-mode's Bun executable and failed with `gc is not defined`; all reported test/probe results use explicit `node`.
- Additional probes executed the unmodified layout, runtime and pinned page in memory, using temporary disk-backed profiles. The probes assert the positive boundaries and inspect/reproduce R3-1; their zero-test helper footer is not an additional suite pass.
- Main's supplied **996/996** and current generator/QOLLOCK `--check` results were not rerun or represented as this audit's evidence. No tracked evidence was regenerated.
- The only persistent repository write is this appended section. No source/test changes, build, deployment, game/native CEF launch, DLL inspection, hosted-page fetch, git write or publication ran. No new native correctness or performance claim is made.

## Fixes round 4 (StorageFix5)

### R3-1 correction

- Own-record equality remains the requirement for treating a reload as an acknowledgement and clearing operations through its token. Nonmatching candidates are **not** promoted to an acknowledged baseline.
- Reads additionally transfer the candidate bundles into reconciliation. A remote preset, metadata field or relative order matching an earlier local intermediate value is compatible with the later local delta, even when an independent foreign addition changed the complete record. Genuinely different same-id/metadata/order changes still retain the remote version with the explicit conflict notice.
- Local-delta detection includes intermediate identities/metadata keys and changes back to the original baseline. Undoing a rename, removing an earlier addition/metadata field, or restoring the original order is therefore retained work, not mistaken for “unchanged.”
- Provenance survives the entire current/previous read sequence, failed-read renewal and a refused over-capacity merge. Controller snapshots retain unresolved candidates until successful reconciliation, acknowledgement, reset supersession/cancellation or read-only adoption. Repairing a refused draft can then merge without losing its later rename/metadata. Later scalar operations remain token-protected; compatibility alone never clears them.

### Retained adversarial coverage

Added **57 real-layout/pinned-page tests**, in addition to the prior 11 R2 regressions. The handoff table crosses **0/1/2 reinclusions**, delivered/lost own acknowledgements, and cuts while the own reply, conflict reply, conflict-read reply or reconciled read is current. The second reinclusion lands while the first replacement read reply is outstanding, exercising obsolete reply delivery. Each settled primary matrix case advances another 180 simulated seconds and asserts no additional writes.

Related tables retain later rename/delete/preset-settings edits plus metadata and unrelated scalar settings; independent foreign additions; genuine same-id/metadata conflicts; later reorder and Undo of rename/metadata/addition/order; a second foreign write after a stale read snapshot; previous-record fallback with its read reply outstanding; 129-preset refusal, further handoffs and draft repair; failed reads through UNAVAILABLE automatic renewal; and newer-version read-only gates. These are deterministic boundary/interleaving checks, not a claim to enumerate every possible native scheduler ordering.

### Red/green evidence

- The exact R3-1 rename/delete/preset-settings repros ran against the round-3 source first: **0 passed / 3 failed**, retaining the earlier preset/metadata.
- The initial 30-case acknowledgement/reinclusion/conflict/order table ran red: **14 passed / 16 failed**.
- Further adversarial tests caught incomplete intermediate corrections before their fixes: Undo cases **3 passed / 6 failed**; stale-read/fallback/refusal cases **3 passed / 6 failed**. The latter exposed provenance loss during previous-record reads and capacity-refusal recovery. All are retained and now pass; unrelated already-passing controls were not relabeled as red evidence.

| Final check actually run | Result |
|---|---|
| `node --test hp_colors_rewrite_v3/tests/storage.test.js hp_colors_rewrite_v3/tests/store-page.test.js` | **164/164 passed**: storage **145**, page **19**, including its nested publication simulation. |
| Storage-dependent `audit-storage`, `migration`, `menu`, `menu-actions`, `menu-audit`, `profile-hygiene`, `gameui-regression`, `own-hud` | **321/321 passed**. |
| Storage-dependent `stage-scripts`, `logging`, `memory` | **130/130 passed**. |
| `node --test scripts/validate-hp-colors-rewrite-v2-storage.test.js` | **48/48 passed**, unchanged local CAS candidate page. |
| `node --test hp_colors_rewrite_v3_qollock/tests/*.test.js` | **24/24 passed**. |
| Full storage suite with debug markers enabled in memory | **145/145 passed**. |

Every final command exited 0 with zero failures, skips, cancellations or TODOs. Storage/v2 and menu evidence outputs were isolated in disposable temporary destinations and removed. Only the storage source, retained storage tests and this appended report section changed in this follow-up. No builds, deployments, game/native CEF launches, git writes, hosted-page fetches or publication occurred. Publication and authorized native evidence remain separate release gates; Main owns full-suite/build integration.

## Round 4 audit (m3)

### Verdict

**Yes: ticket 26 still has a storage blocker beyond the hosted-page publish gate.** The original R3-1 rename/delete/preset-settings repros are fixed, but the new compatibility check can silently overwrite a genuinely competing remote operation using a local candidate that never committed. **P0: 0, P1: 1, P2: 0; P3: 1.** R4-1 blocks release. Publication/served-byte verification and authorized native release evidence remain separate gates; this audit does not discharge them.

### P1 — R4-1: an incomplete local write grants false compatibility to a competing remote change

**Locations:** `panorama/scripts/hp_colors_v3_storage.js:81-84,417-419,612-614,637-642,651,666-671` (module-relative).

`snapshot()` retains the active write's complete candidate even when only its first, nonfinal chunk has been sent. The replacement read converts that candidate into `localCommits`, and `matchesCommit()` treats matching preset/metadata/order values as compatible with later local work. The candidate need not have reached the page's commit boundary. This lets a genuinely independent remote edit masquerade as an earlier local edit and bypass the documented remote-wins conflict policy.

**Reproduced with two real-layout, pinned-page fixture writers sharing one disk-backed profile**, not merely an injected reply:

1. Writer A uses `{replyLatencySec:0.3, echoLatencySec:null}`. Hydrate; seed `p0,p1,p2`; wait for acknowledgement. Launch writer B on the same profile and hydrate it.
2. In A, rename `p0` to `First` and add 40 presets named `extra0` through `extra39`, each with `' 雪'.repeat(20)` appended to its name. Submit through `replaceBundle()` and advance 600 ms.
3. Assert the disk still equals the original seed. The observed write request is **part 0 of 3**: A's candidate has never committed.
4. In A, change `p0` again to `Second`, submit, then call `includeScripts(); onload()` without advancing A.
5. In B, independently rename its original `p0` to `First`, add an unrelated `remote` preset, submit and advance 2,000 ms. B reports **`Saved`**; assert its bundle is now on disk.
6. Advance A 20,000 ms. Expected: B's `First` survives with the explicit same-preset conflict notice. Actual: disk and A's menu contain **`Second`**, and A reports **`Saved; merged a change saved elsewhere`**, with no lost-work warning.

The same two-writer schedule reproduced all four compatibility false positives:

| Incomplete candidate / later local operation | Independently acknowledged remote operation | Actual result after reconciliation |
|---|---|---|
| Rename `p0` to `First` / rename to `Second` | Rename `p0` to `First` | Remote rename overwritten by `Second`. |
| Delete `p0` / restore original `p0` | Delete `p0` | Remote deletion undone; `p0` resurrected. |
| Set `v2pending={first:true}` / replace with `{second:true}` | Set `v2pending={first:true}` | Remote metadata overwritten by `{second:true}`. |
| Reverse `p0,p1,p2` / reorder to `p1,p2,p0` | Reverse to `p2,p1,p0` | Remote order overwritten by `p1,p2,p0`. |

Every row reports the ordinary merged-change status, not a conflict. The remote writer's operation is known to be independent because A's intermediate record never existed durably. Exact whole-record acknowledgement remains guarded, but **compatibility itself authorizes destructive merging**, so guarding acknowledgement alone is insufficient.

**Fix requirement:** do not use an incomplete/noncommittable candidate as evidence that an observed remote value is earlier local work. Preserve the prior genuinely uncertain lost-ack candidate during replacement chunks, and preserve the fixed R3-1 independent-addition behavior. Where provenance is ambiguous, retain unresolved work or report the conflict rather than silently replacing a competing remote operation.

### Other adversarial results

| Check actually exercised | Result |
|---|---|
| Original R3-1 rename/delete/preset-settings repros | All three retained tests pass: later presets, metadata and touched scalar edits survive the independent foreign addition. |
| Retained R2/R3 interleavings | **68/68 pass**, including genuine distinct-value conflicts, Undo-like bundle reversions, lost acknowledgements, stale reads, fallback, refusal/repair and newer-version gates. These do not cover an independent remote value matching an uncommitted candidate. |
| Actual menu Undo | Six additional cases: delivered/lost acknowledgements × 0/1/2 reinclusions. Undo restores the scalar's original value while later rename/metadata and unrelated remote settings survive. Hydration clears history; pressing the stale Undo button changes neither bytes nor write count. |
| 128-preset boundary | Direct 129-preset replacement refuses without replacing the 128-preset local draft. A 129-preset merged union preserves remote bytes and an exportable 128-preset local draft through **20 reinclusions**. Removing the local extra then saves exactly 128 presets, retaining `Second`, later metadata and the remote extra. |
| Retention across refused reconciliation | Those 20 reinclusions retain **one candidate**, not one additional copy per reinclusion. Successful repair clears both controller candidates and bridge candidates. |
| Write storms | The retained primary matrix, six actual-Undo cases, compatibility probes, cap refusal/repair and quota recovery were advanced another **180 simulated seconds** at their checked settled/refused boundaries: no extra writes. No write storm reproduced. |

### P3 — retained candidates grow during continuing quota-failed edits

At `hp_colors_v3_storage.js:119-125,563-568`, each distinct final-chunk quota failure retains a candidate, while continuing edits reset retries and avoid a renewal/read. With a one-preset save, `quotaChars=0`, and one distinct rename every 600 ms, **10/40/100 edits retained 10/40/100 candidates**; the 100-candidate snapshot held **11,190 record characters**. There is no observed fixed candidate ceiling on this path. Restoring quota and reincluding successfully saved the latest draft and cleared both candidate collections; no post-recovery growth or user-visible failure was reproduced. **Nonblocking P3**, not a measured memory/performance regression.

### Checks and limits

- Ran `node --test --test-reporter=tap --test-name-pattern="audit R2-|audit R3:" hp_colors_rewrite_v3/tests/storage.test.js`: **68 passed, 0 failed/cancelled/skipped/TODO**.
- Additional probes ran the unchanged shipped layout/runtime and pinned candidate page under explicit Node, with disposable disk-backed profiles. Their helper footer reports zero registered tests; it is not another suite pass. The four R4-1 cases assert the observed incorrect result, not compliance with the conflict contract.
- Main's supplied **1053/1053 v3**, **24/24 QOLLOCK**, **48/48 v2 storage** and current generator/QOLLOCK checks were not rerun or claimed as this audit's evidence.
- An initial context-mode wrapper failed before execution because of newline escaping; the corrected wrapper passed. One cap probe initially omitted the export API's required settings argument; the corrected complete probe passed. Its leftover temporary directories were identified and removed.
- The only persistent repository write is this appended section. No source/test changes, tracked evidence regeneration, build, deployment, game/native CEF launch, DLL inspection, hosted-page fetch, git write or publication occurred.

## Fixes round 5 (StorageFix5)

### Conservative conflict policy

This implements Main's explicitly revised policy, superseding the earlier candidate-compatibility and remote-wins expectations.

- Removed per-field/intermediate-candidate compatibility, decoded candidate-bundle retention and unused pending-mode state. Preset ids, top-level metadata keys and actual relative-order edits now carry operation tokens, like scalar slots. Acknowledgement clears only operations through its token; later edits and Undo-like reversions remain pending through retirement.
- Auto-merge only disjoint bundle changes. Every locally touched preset id, metadata key and order must be unchanged remotely from the acknowledged baseline. Matching local/remote values are still an overlap, not permission to write. Membership changes alone are not reorders.
- Any overlap stops the **entire** write. Remote current bytes stay untouched; the complete local bundle, including pending scalar settings, stays in the editor and can be exported through the existing bundle-code flow. Status lists the overlapping `preset <id>`, `metadata <key>` and/or `preset order`, followed by **“local draft not saved; export your draft.”** There is no automatic retry.
- Only whole-record `own` recognition acknowledges a possibly committed final-chunk write. Incomplete chunks are no longer snapshot candidates; explicit page failures do not become uncertain commits. Earlier genuinely uncertain commits remain available while a replacement chunk is outstanding. The scalar acknowledged-token rule is unchanged.
- Updated only the authorized PLAN D8 and SPEC storage-bridge passages. Their conservative policy and the retained local publication-checklist link were checked for consistency.

### Red-first evidence and retained checks

The four R4-1 cases were retained first using **two real script/layout/pinned-page writers sharing a disk-backed profile**. Each asserts the initial multi-chunk candidate never committed, independently acknowledges the remote operation, then checks unchanged remote bytes, an intact/exportable local draft, named conflict status and no writes for another 180 simulated seconds. Before the source change: **0 passed / 4 failed**, reproducing overwritten remote rename, deletion, metadata and order. After the change: all four pass.

Added three disjoint-capacity refusal/repair cases (0/1/2 reinclusions), retaining that independent safety boundary now that overlapping edits stop before capacity handling. Added an equal-value overlap case proving that matching foreign preset/metadata/order values still refuse and that the status names all three overlaps. All **153** storage cases remain retained.

### Existing tests whose policy expectations changed

These **43 instantiated cases** now assert remote-byte preservation, the complete exportable local draft, named overlap refusal and no automatic writes, rather than a silent compatible merge or discarding the local version:

| Retained test / parameter set | Cases |
|---|---:|
| `audit M3: concurrent changes to one preset …` — now “keep remote bytes and the exportable local draft” | 1 |
| `audit R2-2: competing relative preset reorders …` and `a rejected deletion does not reorder the retained remote preset` | 2 |
| `audit R2-1: later <rename / delete / preset settings> … before the handoff read` — now explicitly retain the conflicting draft when foreign bytes obscure own identity | 3 |
| `audit R3: <ack> own ack; <N> reinclusions at <boundary>`: lost ack × N=0/1/2 × all four own-reply/conflict-reply/conflict-read/reconciled-read boundaries; plus delivered ack × N=1/2 at the own-reply boundary | 14 |
| `audit R3: a genuinely different remote preset/metadata edit …` — now “preserves both versions,” N=0/1/2 | 3 |
| `audit R3: later reorder after an unacknowledged reorder …`, N=1/2 | 2 |
| `audit R3: undo <rename and metadata / addition / order> …`, N=1/2 | 6 |
| `audit R3: <stale current / backup> reply with a lost own acknowledgement …`, N=0/1/2 | 6 |
| Former `a refused merge retains its intermediate delta …` — now `overlapping merge stays refused … and capacity-only draft repair`, N=0/1/2 | 3 |
| `audit R3: failed reads preserve the own delta through UNAVAILABLE renewal …`, N=0/1/2 | 3 |

The other ten primary acknowledgement/interleaving controls still auto-merge after an actual acknowledgement. Exact-own reload, later rename/delete/metadata/scalar edits, independent additions/reorders, reset authority, future-save gates and disjoint-capacity recovery remain passing behavioral checks. No existing test was deleted.

### Final checks actually run

| Check | Result |
|---|---|
| `node --test hp_colors_rewrite_v3/tests/storage.test.js hp_colors_rewrite_v3/tests/store-page.test.js` | **172/172 passed**: storage **153**, page **19**, including its nested publication simulation. |
| Storage-dependent `audit-storage`, `migration`, `menu`, `menu-actions`, `menu-audit`, `profile-hygiene`, `gameui-regression`, `own-hud` | **321/321 passed**. |
| Storage-dependent `stage-scripts`, `logging`, `memory` | **130/130 passed**. |
| `node --test scripts/validate-hp-colors-rewrite-v2-storage.test.js` | **48/48 passed**, unchanged local candidate page. |
| `node --test hp_colors_rewrite_v3_qollock/tests/*.test.js` | **24/24 passed**. |
| Full storage suite with debug markers enabled in memory | **153/153 passed**. |
| D8/SPEC policy and local checklist target/heading | Consistent; target and heading exist. |

All final commands exited 0 with no failures, skips, cancellations or TODOs. Transcripts/menu evidence and temporary debug-marker enabling were isolated in disposable temporary paths and removed. Changes are limited to the owned storage source/tests, authorized D8/SPEC policy text and this appendix. No builds, deployment, game/native CEF launch, git writes, hosted-page fetch or publication occurred. Existing export/store size limits, session-only draft lifetime, publication/served-byte verification and authorized native evidence remain unchanged; these VM checks are not release/native sign-off.

## Round 5 audit (m3)

### Verdict

**Yes: one reproduced P2 recovery gap still blocks ticket 26 beyond the hosted-page publish gate.** R4-1 is fixed: all four original incomplete-candidate repros now preserve the remote record and local draft without retrying. No overlapping preset/metadata/order change silently overwrote a different remote record in this audit. However, the recommended exported-draft fallback is not fully recoverable through the shipped import controls. **P0: 0, P1: 0, P2: 1; new P3: 0.** Publication/served-byte verification and authorized native release evidence remain separate gates.

Scope clarification from Main: scalar slots deliberately retain last-writer-wins behavior **only for this client's still-unacknowledged touched slots**. Conservative overlap refusal applies to preset ids, top-level metadata keys and relative order, not scalar slots. The scalar exception was tested, not reported as a defect.

### P2 — R5-1: the conflict export cannot restore the complete draft through the menu

**Locations:** `panorama/scripts/hp_colors_v3_storage.js:635,895-910`; `panorama/scripts/hp_colors_v3_menu.js:944-953`; `panorama/scripts/hp_colors_v3_codec.js:279-281` (module-relative).

The conflict status instructs the player to export the draft. Bundle Copy does encode its settings, presets and metadata intact, but Bundle Import consumes only `result.bundle.presets`, generates new ids and appends them to the current library. It does not restore the exported active settings or top-level metadata. The Settings box rejects that bundle code. Existing encode/decode assertions prove preservation inside the code, not recovery through the UI.

**Reproduced using two real-layout/pinned-page clients and actual menu controls, with no user presets:**

1. Hydrate A and B against the same empty disk-backed profile.
2. In A, rename Rewrite Default to `Local Default` through `HPColorsPresetDefaultNameEntry` / `HPColorsPresetDefaultRenameButton`; edit enemy-low to `#112233`, without advancing A.
3. In B, rename Rewrite Default to `Remote Default`; advance B 2,000 ms, then A 8,000 ms.
4. A reports `CONFLICT: metadata bakedPresetNameOverrides changed elsewhere; local draft not saved; export your draft`. Remote bytes remain intact. Click A's Bundle Copy button; decoding that code confirms the complete local draft, including `{"baked_default":"Local Default"}` and `#112233`.
5. Launch a fresh client on the same profile and paste the saved code through Bundle Import. After 5,000 ms it reports **`Presets imported.` / `Saved`**, but disk is byte-identical to the remote record: `Remote Default` remains and the local scalar is not restored. The bundle has zero presets, so the import restores none of the conflicting work.
6. Paste the same code into Settings: **`Use the matching settings or bundle paste box for this code.`** Importing the bundle into a fresh empty profile also restores neither metadata nor the scalar.

**Impact:** the complete draft survives in the exported text, but the player cannot restore it using the advertised menu fallback after closing the unsaved session. This is not durable-record corruption, nor a request to change ordinary append-only preset import. It is a missing user-facing recovery path now relied upon by conflict refusal. A separate settings export can preserve active settings if made before closing; it does not recover the bundle's top-level metadata.

**Required resolution:** provide a usable, lossless recovery flow for the complete exported conflict draft, with explicit scope/confirmation for any replacement of remote work; retain ordinary non-destructive preset import. Test export → fresh session → actual recovery controls → durable reload, not only export → decode.

### Adversarial results

| Check actually exercised | Result |
|---|---|
| R4-1 rename, deletion, metadata and order | All four original two-writer repros pass. The first multi-chunk candidate never committed; independently acknowledged remote bytes survive, the complete local draft remains exportable, status names the overlap, and 180 simulated seconds produce no further writes. |
| Equal foreign values / same-preset different fields | Refused when the complete remote record differs. Equal preset name, equal metadata and equal order do not authorize a merge; a rename competing with a settings edit inside the same preset also refuses the entire write. |
| Disjoint changes | Different preset ids, preset edit versus remote reorder, deletion versus reorder in both directions, and different metadata keys all merge while preserving both operations. No unexplained disjoint refusal reproduced. The retained three capacity-refusal cases save after removing the local extra, across 0/1/2 reinclusions. |
| Scalar boundary | A still-pending local scalar wins over a remote edit to that same scalar, as authorized. Editing only ally-low preserves the remote enemy-low value; no untouched-slot clobber reproduced. |
| Next edit after conflict | Performs a fresh read, then returns to the named conflict with the updated local draft and no write when the overlap remains. Another 180 seconds stays idle. Merely matching the remote value still refuses, consistent with the explicit equal-value policy. When the remote overlapping entity returns to the acknowledged baseline, the next edit saves safely. This is not an automatic retry loop. |
| Export recovery | A preset-bearing export imports successfully after restart as a fresh-id local copy alongside the remote original, retaining its settings. Complete settings/metadata-only draft recovery fails as R5-1 above. |
| Acknowledgement provenance | Exact own uncertain final-body reload acknowledges and saves the later edit. Same values plus a foreign preset, semantically equal but byte-different framing, an incomplete candidate, and an explicit quota failure do not acknowledge the local operation; each preserves remote bytes and the later draft with a conflict. |
| Whole-record idempotence | An independently submitted **whole byte-identical** final body receives the page's normal acknowledgement; current and previous bytes remain unchanged. This is exact-record idempotence, not the removed per-field compatibility heuristic. No nonidentical foreign record was accepted as acknowledgement. |
| Settled/refused boundaries | All independent merge/provenance cases checked for 180 additional simulated seconds stayed write-idle. |

### The 43 changed expectations

**All 43 are legitimate under the revised conservative bundle policy.** I inspected the retained cases and reran them in the focused matrix: 1 same-preset conflict + 2 order/deletion conflicts + 3 pre-handoff foreign-identity cases + 14 acknowledgement/interleaving cases + 3 genuinely different remote edits + 2 unacknowledged reorder cases + 6 Undo-like cases + 6 stale-current/backup cases + 3 overlap/capacity cases + 3 unavailable-renewal cases = **43**.

These changes no longer infer provenance from matching intermediate values or discard the local version. Ambiguous lost-ack/handoff cases conservatively retain both versions, while the ten primary acknowledged/disjoint controls still merge. The changed assertions check remote bytes, the complete local draft, named status and no automatic writes. Their export/decode assertion is valid but insufficient to establish user-facing recovery; R5-1 is outside that assertion's coverage.

### P3

No new P3 reproduced. The prior quota-candidate growth observation no longer reproduces: **100 distinct quota-failed edits retain zero uncertain candidates**, because explicit page failures are no longer treated as possibly committed writes. Existing export-size limits and session-only draft lifetime remain limits, not newly measured regressions.

### Checks and limits

- Ran `node --test --test-reporter=tap --test-name-pattern="audit R2-|audit R3:|audit R4-1:|audit R5:|audit M3:" hp_colors_rewrite_v3/tests/storage.test.js`: **81 passed, 0 failed/cancelled/skipped/TODO**.
- Ran **21 additional fixture scenarios** under explicit Node using the unchanged shipped layout/runtime and pinned candidate page. They cover the table above, including actual menu export/import. Their helper footer registers zero tests; it is not an additional suite pass.
- An initial context-mode wrapper failed before execution due to newline escaping; the corrected wrapper passed. An initial equal-preset probe accidentally made the entire remote record byte-identical, correctly receiving idempotent acknowledgement; adding an unrelated remote preset exercised the intended partial-match refusal. Its two disposable profiles were identified and removed.
- Main's supplied **1061/1061 v3**, **24/24 QOLLOCK**, **48/48 v2 storage**, and current generator/QOLLOCK checks were not rerun or claimed as this audit's evidence.
- All fixture evidence was redirected to disposable temporary paths and removed. This appendix is the only persistent repository write. No source/test changes, tracked-evidence regeneration, build, deployment, game/native CEF launch, DLL inspection, hosted-page fetch, git write or publication occurred.

## Fixes round 6 (StorageFix5)

### R5-1 recovery path

- Reused the existing confirmed **REPLACE ALL** control, which already restores the complete decoded bundle through `replaceBundle()` and the normal CAS bridge. No new format, widget, layout or persistence algorithm was added.
- Conflict status now gives the complete route: **Bundle COPY → preserve/paste the code in the Bundle box → REPLACE ALL**. Ordinary IMPORT still appends fresh-id preset copies without replacing the saved library. Its success message now explicitly says active settings and metadata are unchanged and points to REPLACE ALL for full recovery.
- A bundle with zero presets no longer performs an empty append/save or claims **“Presets imported.”** It refuses with actionable REPLACE ALL guidance for restoring active settings and metadata.
- The existing confirmation now explicitly names active settings and metadata and says it **overwrites ALL saved presets, including any that another window added**. Opening it or choosing Cancel changes nothing. Confirmed recovery still obeys CAS and the conservative overlap policy; it does not authorize overwriting a later overlapping remote edit.
- PLAN D8 and SPEC's storage passage document the same recovery controls and replacement scope. Ordinary append-only preset import remains available and non-destructive.

### Retained end-to-end evidence

Added **7 actual-control/pinned-page regressions**. The four primary cases cross exported drafts with **0/1 presets** and destination sessions with **0/1 additional remote presets**. They reproduce the two-writer baked-default-name/scalar conflict, click Bundle Copy, start a fresh session, exercise ordinary Import, open and cancel full replacement, explicitly confirm it, then restart again and verify the complete durable settings, metadata, stable preset identities and order. Existing saved presets disappear only after the explicit library-replacement confirmation.

The primary four ran red first on the unchanged source: **0 passed / 4 failed**. Zero-preset codes falsely reported `Presets imported.`; nonempty append import failed to disclose that settings/metadata were unchanged. After the minimal message/empty-import changes, all four round-trip.

Three additional guards restore a metadata/settings-only draft into an empty profile and race confirmation against another real writer. The page rejects both stale commit expectations: overlapping metadata preserves remote bytes and the recoverable local draft; an independent preset appended after the dialog opened survives reconciliation. These use the shipped controls/bridge, not an export/decode-only model.

### Final checks actually run

| Check | Result |
|---|---|
| `node --test hp_colors_rewrite_v3/tests/storage.test.js hp_colors_rewrite_v3/tests/store-page.test.js` | **179/179 passed**: storage **160**, page **19**, including its nested publication simulation. |
| Storage-dependent `audit-storage`, `migration`, `menu`, `menu-actions`, `menu-audit`, `profile-hygiene`, `gameui-regression`, `own-hud` | **321/321 passed**. |
| Storage-dependent `stage-scripts`, `logging`, `memory` | **130/130 passed**. |
| `node --test scripts/validate-hp-colors-rewrite-v2-storage.test.js` | **48/48 passed**, unchanged local candidate page. |
| `node --test hp_colors_rewrite_v3_qollock/tests/*.test.js` | **24/24 passed**. |
| Full storage suite with debug markers enabled in memory | **160/160 passed**. |
| `node hp_colors_rewrite_v3_qollock/tools/qollock.js --check` | **2 outputs current**; no regeneration needed. |
| D8/SPEC recovery guidance and retained local checklist target/heading | Consistent; target and heading exist. |

All final commands exited 0 with no failures, skips, cancellations or TODOs. Evidence/debug setup used disposable temporary paths and was removed. Changes are limited to storage source/tests, one existing menu-confirmation string, D8/SPEC recovery guidance and this appendix. No builds, deployment, game/native CEF launch, git writes, hosted-page fetch or publication occurred. Native confirmation layout/usability, publication/served-byte checks and other release gates remain unverified; existing export/store size caps are unchanged.

## Round 6 audit (m3)

### Verdict

**R5-1 is closed. No reproduced P0–P2 storage defect remains blocking ticket 26 beyond the hosted-page publish/served-byte gate. P0: 0, P1: 0, P2: 0; P3: 1 (status wording).** This is not release authorization: ticket 26's separate consent, native parity/install evidence and topbar-compatibility checklist remain unverified by this audit. Thus publication is the remaining storage gate, not proof that every release gate is complete.

### Recovery and commit evidence

| Check actually exercised | Result |
|---|---|
| Original R5-1 zero-preset repro | Two writers conflict on the baked-default name while the local active enemy-low colour is `#112233`. Bundle Copy preserves the complete draft. In a fresh session, ordinary Import now refuses with REPLACE ALL guidance, performs no write and does not claim an import. Confirmed REPLACE ALL restores the local name and colour durably; another fresh session reads them back. |
| Retained actual-control recovery matrix | **7/7 pass**: 0/1 exported presets × 0/1 existing remote additions, empty-profile recovery, overlapping metadata race and disjoint late-addition race. Opening/Cancel writes nothing. Successful replacement preserves the complete exported settings/metadata/preset identities and rotates the previous record. Ordinary nonempty Import remains append-only and explicitly reports settings/metadata unchanged. |
| Independent richer draft | Created three presets through the real menu with different settings, then locally renamed one, reordered to `Local Alpha, Gamma, Beta`, changed active settings and renamed the baked default while a second writer saved a conflicting name and fourth preset. Bundle Copy → fresh session → paste → Cancel → confirmed REPLACE ALL → fresh restart reproduced exact whole-bundle equality: active settings, baked-name and next-id metadata, stable ids, per-preset settings and nontrivial order. The remote fourth preset disappeared only after confirmation; the previous record retained it. |
| Compare-at-commit, not merely compare-at-dialog | With a 24-preset exported conflict draft and 300 ms reply latency, confirmed recovery sent **part 0 of a multi-chunk write** without changing disk. The other real writer then durably changed the baked-default name before recovery's final chunk. The pinned page returned `conflict`; remote bytes remained exact, the complete recovery draft remained in the editor, and the status named the metadata overlap. Another 180 simulated seconds produced no writes. |
| Confirmation accuracy | The richer recovery displayed: `Restore this bundle's active settings and metadata? This overwrites ALL 4 saved presets, including any that another window added, with this bundle's 3 presets. This cannot be undone for the library.` Those settings, metadata and four already-observed presets were replaced as stated. This is not unconditional authority over subsequent remote work: the retained late-addition race preserves a newly observed disjoint preset and reports a merged save; an overlapping edit refuses the entire save. |
| No-op/refusal statuses | Independently exercised malformed and zero-preset imports, replacement before hydration, and append beyond 128 presets. Every case left durable bytes and write counts unchanged and showed an error rather than an import/replacement success. The zero-preset refusal also left the complete editor bundle unchanged. |
| Failed durability versus local application | A quota-failed confirmed replacement applied the complete draft in the editor but wrote no durable record and ended `UNAVAILABLE`. The overlapping commit race likewise ended with the explicit unsaved-draft conflict, not `Saved`. See the nonblocking code-status wording below. |

The candidate page checks the last-observed raw-record checksum at final assembly before backup/current writes (`vendor/hpv2-store.js:122-138`); REPLACE ALL reaches the ordinary controller/bridge rather than bypassing that guard (`panorama/scripts/hp_colors_v3_menu.js:778-787`, `panorama/scripts/hp_colors_v3_storage.js:788-800`). PLAN D8 and SPEC describe the same full-recovery route, append-only import and preserved conflict protection. This proves the local pinned-page flow, not cross-native-CEF transaction serialization.

### P3 — code status describes local replacement, not durable success

`hp_colors_v3_menu.js:786` leaves **`Bundle replaced.`** in the code-status label after both the reproduced overlapping-commit refusal and quota failure. The complete draft really was applied locally, and the separate save-status label correctly says **`CONFLICT: … local draft not saved`** or **`UNAVAILABLE`**, so this is not the original empty-import false success or a reproduced data-loss blocker. Prefer wording such as “Bundle applied locally; check save status” to avoid implying durable recovery.

### Checks and limits

- Ran `node --test --test-reporter=tap --test-name-pattern="audit R5-1:" hp_colors_rewrite_v3/tests/storage.test.js`: **7 passed; 0 failed/cancelled/skipped/TODO**.
- Ran **7 additional independent fixture scenarios** under explicit Node: rich-draft recovery, malformed import, zero-preset import, pre-hydration refusal, capacity refusal, mid-write CAS race and quota failure. All assertions passed. These drive registered controls from the unchanged shipped layout/runtime and execute the hash-checked candidate page with disposable disk-backed profiles; their zero-test helper footers are not suite passes.
- Main's supplied **1068/1068 v3**, **24/24 QOLLOCK**, **48/48 v2 storage**, and two current `--check`s were not rerun or represented as this audit's evidence.
- One context-mode wrapper failed to parse before running tests; the corrected wrapper passed. Fixture outputs were redirected to disposable temporary paths and removed; tracked evidence was not regenerated.
- This appendix is the only persistent repository write. No source/test edits, builds, deployment, game/native CEF launch, hosted-page fetch, publication or git writes occurred. Native confirmation readability/usability and existing export/store size limits are not newly validated here.

## Publication and live check (Main, 2026-10-15)

- **User approval:** "Publish now" was chosen in the session prompt.
- **Pre-checks:** v2 storage 48/48; page + storage tests 179/179. `D:/hpv2-store` was clean apart from the reviewed `index.html`/`README.md` and level with `origin/main` `75e7620`.
- **Commit:** `94cc689f5f9a310c50a71a69a515d27625e48f85`, those two files only, pushed to `main`.
- **Served-byte check:** `https://hantu-raya.github.io/hpv2-store/` serves a single inline script with SHA-256 `62c75b5767aff3d6…` (the candidate), `VERSION` 1, and ready capabilities `["vkeys", "cas"]`.
- **Pin and docs:** the pin now holds `commit 94cc689…` and `published: true`, with `publishedSha256` removed. PLAN D8 and SPEC were updated. After the pin flip: v3 1068/1068, v2 storage 48/48.
- **In game (v3 debug `6295843a`):**
  - The bridge is ready and the stored record loads.
  - Turning on ALLY "Player bar colors" was saved, acknowledged and survived a restart.
  - Turning it off again also saved.
  - The console showed no `Parsing error`/`FATAL`/`Uncaught`/`renderer race`.
- **Rollback, if ever needed:** follow the round-2 checklist step 8 (a normal revert of `94cc689`).
- **Still not covered:** the round-6 P3 ("Bundle replaced" stays shown after a save failure), and live multi-window conflict paths.
