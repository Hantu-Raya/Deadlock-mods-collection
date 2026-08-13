# Rewrite-native Persistence Implementation Plan

## Status

This document preserves the implementation plan for Priority 1 in `to-do.md`.

Phase 0 is complete. A temporary runtime probe tested `$.persistentStorage` in the real Escape-menu Panorama context. `console.log` reported:

```text
[HP Colors Rewrite] persistence probe api=$.persistentStorage available=0 reason=missing_getItem_setItem
```

The probe ran before the first menu publication and showed that `$.persistentStorage` does not expose the required `getItem`/`setItem` interface in this Deadlock context. The temporary probe and its synthetic tests were removed after recording the result.

The rewrite currently stores its canonical snapshot on the absolute-root panel attribute. That attribute is a same-tree session cache, not durable storage. `GameUI.CustomUIConfig()` and the legacy root/HUD attribute path are also session/shared state; neither survives a complete Deadlock process restart by contract.

Automatic restart persistence cannot proceed on a permitted native backend currently proven in this environment. Do not use engine settings, console commands, ConVars, external file mutation, legacy aliases, compact v99 encoding, or fallback chains.

## Invariants

- Keep one menu-owned canonical `state.values` snapshot.
- Keep one local bar registry per unit-status context.
- Hydrate before the first authoritative publication.
- Continue immediate runtime publication through `ClientUI_FireOutput`.
- Keep the absolute-root attribute as a same-tree cache only.
- Never give unit-status probes direct access to durable storage.
- Do not add an overlay-to-menu request graph or a second settings authority.
- Do not introduce presets, hero scopes, import/export, or compatibility formats in this slice.
- Preserve the existing one-second discovery interval and adaptive `0.15/0.25/1.5s` paint cadence.

## Phase 0 — Storage substrate verdict

**Verdict: unavailable.**

Observed in a real Deadlock session on 2026-08-13:

```text
08/13 17:42:20 [PanoramaScript] [HP Colors Rewrite] persistence probe api=$.persistentStorage available=0 reason=missing_getItem_setItem
```

Packaging evidence for the probe build:

- Deployed VPK SHA-256: `856F7AFA5DEA1CB53B2EEB5A43088DA776B5B4EE734CA6781F6653C8C25D88B6`
- Deployment backup: `pak01_dir.vpk.backup_20260813_174112`
- Focused automated suite before deployment: 47 passed, 0 failed

No sentinel could be written because the API was absent on the first boot; a second boot could not add restart evidence for that interface. This is sufficient to reject `$.persistentStorage` as the implementation substrate.

Priority 1 must stop here unless the user approves a different durable substrate. Do not disguise panel attributes or `CustomUIConfig()` as durable storage. The safe next slice is rewrite-native import/export, or an explicit architecture decision allowing another persistence mechanism.

## Phase 1 — Deferred durable storage contract

Durable persistence remains blocked because Phase 0 found no native storage backend. The current live-transfer format is independent: a compact one-line `HPCR2` code containing sparse `[settingIndex, value]` pairs. It is not a storage implementation, legacy compact v99 encoding, alias format, preset format, or migration path.

## Phase 2 — Add failing regressions

Create a focused test file:

```text
scripts/validate-hp-colors-rewrite-persistence.test.js
```

Extend `scripts/hp-colors-panorama-test-adapter.js` minimally instead of creating another harness. Add:

- an opt-in durable backing shared across separate harness instances;
- seeded raw values for restart, missing, corrupt, and unsupported cases;
- storage read/write counters and captured writes;
- read/write failure injection;
- event history or explicit late delivery through the existing `ClientUI_FireOutput` path.

Required regressions:

1. Valid settings survive a simulated restart.
2. Missing storage hydrates defaults.
3. Malformed storage restores defaults.
4. Unsupported versions restore defaults.
5. Loaded values are normalized before publication.
6. The first authoritative publication contains hydrated values, never defaults followed by persisted values.
7. Publishing unchanged settings causes no storage write.
8. Continuous slider movement is debounced.
9. Continuous HSL picker movement is debounced.
10. Mouse-up commits the final gesture value immediately.
11. One completed gesture creates one Undo entry.
12. A late unit-status context receives the hydrated snapshot through the existing replay path.
13. Reset All persists once and one Undo restores the prior snapshot.
14. Failed writes remain retryable and do not poison unchanged-write suppression.

## Phase 3 — Implement the menu persistence seam

Keep the implementation private to `hp_colors_menu.js`. The likely internal functions are:

```text
readStoredPayload()
decodeStoredPayload()
serializeStoredPayload()
hydrateCanonicalState()
queuePersistence()
flushPersistence()
```

These are implementation details, not new public interfaces.

### Boot precedence

1. Load a valid same-session absolute-root snapshot if present. It may be newer than a pending debounced durable write.
2. Otherwise, load a valid durable payload.
3. Otherwise, use defaults.

Then perform this sequence exactly once:

1. Normalize the selected values.
2. Cache their canonical storage serialization.
3. Repair missing, invalid, or noncanonical durable state when the storage interface permits it.
4. Assign `state.values`.
5. Publish one authoritative `*` snapshot.
6. Start or refresh the existing replay schedule.
7. Render the controls.

Remove `loadRootSnapshot()` from `openEditor()`. Opening the editor must not become a second hydration path or overwrite newer canonical state with a stale root attribute.

### Publication seam

Keep ordinary mutations flowing through `commitValue()` and `replaceValues()` into `publish()`. Extend that single publication boundary to schedule or flush persistence. Do not loop over settings or create a second mutation interface.

Cache the last successfully written durable payload. Suppress a write only when the canonical payload matches that successful value. A failed write must remain eligible for retry.

Log storage availability and failures on transitions only; do not log every read, replay, or debounce tick.

## Phase 4 — Integrate gesture timing

Runtime updates remain immediate. Only durable writes are delayed.

- Toggles, modes, text-entry commits, Undo, Reset Section, and Reset All: persist immediately.
- Slider and HSL picker `onvaluechanged`: publish immediately and queue one trailing durable write, approximately 250 ms after the latest change.
- Slider or picker `onmouseup`: commit the control's current value and flush durable storage immediately.
- Picker close and editor close: finalize any active gesture and flush immediately.
- Scheduled writes must use a generation/token check so superseded callbacks do nothing.

Track active gesture state centrally. The current slider and picker bindings keep `gestureBefore` inside closures and clear it only on mouse-up. A reset or close during a missed mouse-up can otherwise leave stale history that a later event pushes into Undo.

A finalization path must:

1. Commit the control's current value.
2. Add the pre-gesture snapshot to history at most once.
3. Clear active gesture state.
4. Flush the final canonical durable payload.

## Phase 5 — Gate unit-status painting on authority

`healthbar_probe.js` currently starts with `DEFAULT_CONFIG` and paints immediately. Persistence introduces a risk that a late or concurrently booting context briefly paints defaults before receiving hydrated settings.

Add a local `hasAuthoritativeConfig` flag:

- Discover and classify bars normally before hydration.
- Leave stock presentation untouched until a valid root or event snapshot arrives.
- Set the flag only after `applyConfigRaw()` accepts a valid canonical snapshot.
- On the first valid snapshot, mark local bars dirty and apply the hydrated configuration.
- Keep all late and replacement delivery on the existing root/event/replay path.

If the menu never publishes, leaving bars stock is safer than applying guessed defaults. A broader bounded bootstrap fallback belongs to Priority 8 and must not be added speculatively here.

## Phase 6 — Add Reset All

Add `HPColorsResetAllButton` to the existing editor footer after **RESET SECTION** and before the footer spacer.

Route the action through the existing wholesale mutation path:

```js
replaceValues(copyValues(DEFAULTS), true);
```

Required behavior:

- one wildcard publication;
- one immediate durable write;
- one Undo entry;
- no change to Reset Section semantics;
- no history or storage write when settings already equal defaults;
- no stale gesture history after reset.

## Expected files

- `hp_colors_rewrite/panorama/scripts/hp_colors_menu.js`
- `hp_colors_rewrite/panorama/scripts/healthbar_probe.js`
- `hp_colors_rewrite/panorama/layout/hud_escape_menu.xml`
- `hp_colors_rewrite/panorama/styles/hp_colors_menu.css`
- `scripts/hp-colors-panorama-test-adapter.js`
- `scripts/validate-hp-colors-rewrite-persistence.test.js`

Do not edit compiled output, staging trees, VPKs, archives, deployed files, or unrelated dirty work.

## Verification

Run the focused rewrite suite:

```powershell
node --test scripts/validate-hp-colors-rewrite-persistence.test.js scripts/validate-hp-colors-rewrite-effects.test.js scripts/validate-hp-colors-rewrite-readout.test.js scripts/validate-hp-colors-rewrite-healthbar-controls.test.js scripts/validate-hp-colors-rewrite-picker.test.js scripts/validate-hp-colors-rewrite-visibility.test.js
```

After the user confirms Deadlock is stopped, run:

```powershell
powershell -ExecutionPolicy Bypass -File build_hp_colors_rewrite.ps1
```

Treat compilation, VPK asset checks, deployment, and matching SHA-256 hashes as packaging evidence only.

Priority 1 is complete only after a real Deadlock smoke proves:

1. Change several settings and exit Deadlock.
2. Fully restart Deadlock.
3. Confirm persisted settings are the first authoritative state.
4. Confirm bars do not flash rewrite defaults first.
5. Confirm late and replaced unit-status contexts receive the hydrated snapshot.
6. Confirm continuous gestures save their final values.
7. Confirm Reset All persists and Undo remains distinct from Reset Section.
8. Exit and inspect `console.log` for transition-only persistence/config messages and no rewrite exceptions.

Never claim this in-game verification from automated tests or packaging output.

## Evidence map

- Canonical menu state and authority: `hp_colors_rewrite/AGENTS.md:23-50`
- Persistence checklist and deferred compatibility: `hp_colors_rewrite/to-do.md:14-27`, `136-155`
- Defaults and normalization: `hp_colors_rewrite/panorama/scripts/hp_colors_menu.js:22-90`, `614-691`
- Root cache and message publication: `hp_colors_rewrite/panorama/scripts/hp_colors_menu.js:693-834`
- Mutation, Undo, and section reset: `hp_colors_rewrite/panorama/scripts/hp_colors_menu.js:836-890`
- Slider and picker gesture behavior: `hp_colors_rewrite/panorama/scripts/hp_colors_menu.js:920-958`, `1080-1113`
- Current boot ordering: `hp_colors_rewrite/panorama/scripts/hp_colors_menu.js:2372-2410`
- Current probe bootstrap and config application: `hp_colors_rewrite/panorama/scripts/healthbar_probe.js:1709-1770`, `1944-1982`
- Reset control insertion point: `hp_colors_rewrite/panorama/layout/hud_escape_menu.xml:587-595`
