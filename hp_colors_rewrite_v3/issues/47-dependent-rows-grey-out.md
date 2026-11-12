# 47: Dependent setting rows grey out

**What to build:** a setting row that only works with another switch or mode greys out (dim title, controls at 30% and disabled) while that switch is off, e.g. *Name color* while *Custom name color* is off. Hovering a greyed row says what to turn on, then shows the normal help.

**Status:** built and VM-tested; installed for testing; not checked in game.

**Origin:** user request (2026-10-28): "when the custom name color is disabled the variables and the setting row will be grey out to indicate that this row has been disabled. Apply the user feedback to the appropriate settings."

## Contract

- `settings/schema.json` rows may carry `requires`: conditions that must all hold. `{ key }` is a switch that must be on, `{ key, is: [options] }` a mode, `{ key, above: n }` a number, `{ any: [...] }` either-of. The generator rejects unknown keys, self-references, loops, unknown options, number conditions on switches, colors as conditions, nested either-of and a condition with no value on one of the row's sides.
- Evaluation is per side (enemy rows read enemy values; shared rows are usable if either side qualifies) and cascades: a met switch whose own row is greyed still greys its children (hiding the name greys *Custom name color*, so *Name color* greys too).
- A greyed row keeps its value; it never changes a setting, publishes, records Undo or opens the color picker/condition dialog. Reset page, Undo, presets and codes may still change it; the grey state follows the settings.
- Requirements are UI-only: no slot, default or record change, and the renderer is unchanged.

## Applied rows (each matches what the renderer reads)

| Rows | Need |
|---|---|
| Bar color mode, low/middle/high colors, team high color | Player bar colors **or** an open NPC / objective / neutral customization (unit bars use the side colors; neutral HP follows enemy bands) |
| Shake strength | Damage shake |
| Custom outline color, outline thickness, outline opacity | Show bar outline; *Outline color* also needs Custom outline color |
| Your health bar custom color | Your health bar color: Custom |
| HP font, size, color source, offsets, outline, alignment, tilt | Custom HP number; HP custom color mode, low/middle/high, team high also need HP color source: Own colors |
| Custom name color, name size, offsets, outline, alignment | Show hero name; Name color source and Name color also need Custom name color (team colors fall back to the own color, so it stays usable) |
| Lift name above OLD boxes | Bar style: OLD |
| Custom line color, line opacity | Show health lines; Line color also needs Custom line color |
| Show kill marker | Player bar colors and Show healthbar (enemy); marker color/threshold/width need Show kill marker |
| Stamina color source, color, low threshold | Custom stamina color; Low stamina color needs a threshold above 0 |
| Pulse threshold, custom color, rate, intensity, hide bar | Low HP pulse; pulse color and color mode need Custom pulse color; Pulse HP number needs pulse and Custom HP number; its size/position switch needs Pulse HP number; size and offsets need that switch |
| CRITICAL / ASSASSINATE / UNKILLABLE offsets | Their label |
| Level offsets | Show enemy level badge |
| Ultimate custom color | Ultimate color mode: Custom |
| Ultimate progress colors, darkness, badge size | Show ultimate progress; unavailable color needs Fixed or Gradient, available color needs Gradient |
| All pickup colors, darkness, size, spacing, offsets | Pickup styling and timers |
| Neutral fill color | Customize neutral camps |

Not greyed on purpose: the healing/damage/shield/barrier colors (unit and neutral bars use them without player colors), bar size and position (they also place the HP number), the master switch.

## Evidence

- `tests/row-requirements.test.js` (red first: no greyed rows): name color per side and cascade; refused hex/segment/picker edits with no publication or Undo; tooltips naming the missing switch or mode; mode, number, either-of and shared rows; Undo restores the grey state; greyed styles (controls 0.3, title `#FFEFD722`, also on hover).
- `tests/generator.test.js`: nine malformed `requires` cases fail with a requirement error before any write.
- Mutations killed: no commit guard, no cascade, either-of read as all-of, no picker guard.
- Existing tests that set a dependent value before its switch now turn the switch on first (`renderer`, `timers`, `migration`, `storage` editAlly uses the always-usable ally damage color); the every-row reachability test turns on each row's requirements through their real controls and resets them after.
- Suites: v3 1378/1378; QOLLOCK + ShowRank + v2 storage 93/93; generators current. Builds (md5): normal release `c78d9346`, debug `07b14546`, QOLLOCK `367c31f4`, ShowRank `0709aee6`; staged suites 0 failures.
- Installed (2026-10-28, game closed, 6821): ShowRank `0709aee6` as `addons/pak02_dir.vpk`; the previous build `12e5a542` is in `addons_disabled/pak02_dir.vpk.showrank-neutral-fixes-12e5a542`.

## Pre-release refactor and optimization (2026-10-29)

- Structure: the row lookup for the cascade (`requirementRows`) and the set of keys any condition reads (`requirementKeys`) are built once with the contract at boot, next to `ruleRows`, instead of a lazy index that also reset the shown state. One evaluator (`missing(row)`) reads `config.settings`; `rowActive` and the tooltip both use it. `shownActive` (what the panels last showed) is cleared only when the panels are collected again.
- Optimization kept: an edit re-syncs the grey state only when its key is read by some condition (colors and most sliders never are). The gate is conservative: keyed by setting name without side, so it may sync needlessly but never skips a needed sync. 400-step drag of a non-condition slider (Bar width), VM wall time: 72-114 ms before, 50-70 ms after (alternating runs, 4 x 5 each); a no-requirements build measures 50-70 ms, so the remaining requirement cost on that drag is within noise. Level 1 (VM) evidence, not FPS.
- Tried and reverted: caching each row's missing words per settings change. Switch flips and applySettings did not move outside noise.
- Fixed (found by the refactor): with no settings store attached (store page failed to load), rows were not greyed until the first edit of a condition. The boot now syncs the grey state after binding the rows; red-first test `rows are greyed from boot even when no settings store attaches`.
- Commit path (the gate's path): 800 seeded edit attempts through real controls (255 switches, 90 segments, 296 numbers incl. threshold 0 and 1, 159 hex), grey class and enabled flags of all 125 dependent rows read after each, no applySettings in between; old and new `commitDigest` both `273fd046...` with 195 grey-state changes. A mutant that never syncs in commit gives `83b3b9a2...` with 0 changes.
- Late control at boot: test `a control missing at first boot is greyed once a boot retry finds it`; removing the ready-path sync fails both boot tests.
- Equivalence: `.scratch/hpv3_req_refactor/measure.js` over 400 seeded settings states (every dependent row's greyed class, control enabled flags, tooltip, plus one refused edit per state): old and new digests both `e27ed1a6...` (`baseline.json`, `after.json`); native op counts for 20 switch flips identical.
- Debate (user request): GPT-6 Astra reviewed the refactor. It found the first equivalence digest never reached the commit gate (fixed by the commit scenario above) and asked for the late-control test; it accepted the gate, the reverted cache and the boot fix. Builds after the refactor (md5): normal release `71789192`, debug `58037e74`, QOLLOCK `c673e4f7`, ShowRank `6b48607e`; not installed (the installed test build is still `0709aee6`, which lacks only the store-less boot fix).

## Open follow-up (pre-existing, not ticket 47)

If `$.HPColorsV3Settings` is replaced while the menu is already ready in the same context, boot replaces the settings but returns before re-syncing any control (values, switches and grey state stay stale). Reproduced on the pre-refactor tree too. No evidence it happens in normal play; recorded for a later ticket.
