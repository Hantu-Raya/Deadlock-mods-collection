# 38: Old separate shield bar on your own HUD

**What to build:** the user's request (2026-10-21). Since the Sep 29, 2026 patch (GameTracking 6711), the own bottom-left health bar draws the bullet shield inside the health bar and adds it to the HP number. The user wants the old look back, "as native as it can be" and with no performance loss:
- a separate green shield bar;
- a white fill at health / max HP;
- an HP number without the shield.

**Setting:** BAR › Your health bar › *Your shield bar*, Merged (default) | Separate (old). It is shared, Basic and slot 195; record version 15 adds it. The NEW item is `old-shield-bar`.

**Runs on:** Claude. The mechanism was debated in two rounds with m1 (GPT-6 Astra, effort med): `.scratch/shieldbar/debate-brief.md` and `debate-round2.md`, with the answers at `agent://ShieldBarDebate` and `agent://ShieldBarDebate2`.

**Status:** done in the VM. All six variants are built: normal `68ec1ca0` / `d4bc3a4c`, QOLLOCK `3515510b` / `cd1dcff6`, ShowRank `05405dd9` / `8351e435` (release / debug). The normal debug build is installed. Not checked in game yet. The debug build logs `[HPV3] legacy shield scale …` whenever the correction changes.

**Live fix 1 (2026-10-21, game 6805):** the first live test shows two problems after the shield went (user screenshot; `console.log` shows the scale handed back at 14:54:31):
- The game's HP number stayed gone, with "/ 1037" moved up into its place. The number had been collapsed while shielded and only cleared with `null` afterwards. Which part failed is unknown: the clear, or the game's rolling `{i:r:}` label after being collapsed.
- The ticks were gone; they were hidden by design.

The fix has three parts:
- The game number is never collapsed; it is faded instead.
- Active visibility writes use the stock-equivalent value, not `null`.
- Release writes that value before the `null`.

The ticks come back whenever the scale is not corrected. The debug build also logs `[HPV3] legacy shield number …` with the game label's text, visibility and height at each switch. Rebuilt: normal `0c90ceca` / `08c2a02f` (installed), QOLLOCK `6ebfd8f2` / `8dc50659`, ShowRank `eaf3b70a` / `fe3d4ca7`.

## What the game does (client.dll 6796, SHA-256 `ca6aee3b46fc63e84c89e34fbf9c51f3127abceaec17a1bc6aa9e9d1ff482b53`)
Evidence: IDA pseudocode in `.scratch/ida_shield/out*.txt` and the saved IDB `input.dll.i64`; stock layouts before and after the patch in `.scratch/shieldbar/`.
- **CCitadel_Hud_Health::UpdateBar** (`sub_181C0DE30`) still feeds the old `#shield_bar`: its fill (shield / shield max), the `shieldActive` class and the `shieldHealth` dialog variables. 6711 only removed the CSS rule `.shieldActive #shield_bar { visibility: visible; }` and recolored the bar from #4bdc68 to cyan.
- **The health fill is health / D.** D = max(max HP, health + shield + barrier + recent loss) (`sub_181E5CBC0`). The cyan `#shield_bar_2` runs from health / D to (health + shield) / D. The pending damage/heal bars and the `#healthLines` ticks use D too.
- **The HP number is merged.** The container's `current_health` is health + shield + barrier, and `total_health` is max HP (`sub_181C095D0`). No raw-health dialog variable is left; `maxHealth` is gone from the binary.
- **No switch exists:** no convar, layout attribute or panel type turns the merge off (m1, round 1).
- **Tech shields are gone** (`ETechShieldHealth_DEPRECATED`), so only the bullet shield returns.

## Decisions
- **Fill: the game's own `#health_bar`, rescaled.** ProgressBarWithMiddle draws (lowervalue − min) / (max − min) with no clamp, and its `max` is JS-writable and invalidates layout; the game never rewrites it (m1, round 2: RVAs 0x2332040, 0x23323D0, 0x1C08470). Writing `max = lowervalue / (health / max HP)` makes the game draw health / max HP. The textures, mid/low tints, v3's HUD wash, the mask and the lost-health colour all stay native. The pending damage/heal bars get the same `max`.
- **Shield bar: the game's own `#shield_bar`.** It is shown while `shieldActive` is on (capacity, like the old rule), in the old green #4BDC68. `#shield_bar_2` is collapsed.
- **Number:** an owned label with the game's `currentHealthLabel` class shows health = `current_health` − `bullet_shield_current`, while the shield is up. It keeps the game's offWhite / mid #DDFF56 / low #FF5656 colours instead of the cyan shield tint. Without a shield, the game's number is already health only and is shown. The game's label is only faded (opacity 0), never collapsed, and the owned label sits over it with `ignoreParentFlow`.
- **Old layout values:** these are the pre-6711 CSS values, from the GameTracking diff.
  - `#HealthRegenAndTotal`: width 115px, right-aligned, margins 5/10px.
  - `.healthContainer`: margin-right 10px.
  - `.shieldNumbersContainer`: visible, margin-right 23px; this shows the old "600" beside the bar.
  - `#RecentHealContainer`: margin-left 35px, margin-top 30px; `.recentDamageCounters`: margin-left 35px, margin-top 160px. Added in 3.3.2 ([ticket 41](41-separate-shield-heal-damage-counters.md)): 6711 moved them to 165px/160px for the 250px box, so inside the 115px box they sat past its right edge and the heal and damage numbers disappeared. Not 6710: while the shield or barrier number shows, heal moves under current/max beside the damage (105px/160px), and the heal container is `overflow: noclip` so it is not squeezed into the box's last 10px; it goes back up when the shield is gone.
  - `#healthLines`: kept (the user wants them, although pre-6711 had none). The game spaces them by D, so while the scale is corrected they are swapped for an owned panel with the same id, with lines at max HP (see live fix 2).
  - `#shield_bar .progress_bar_numbers` stays hidden, as before 6711; m1 suggested showing it.
- **Inline styles, no stock CSS files.** QOLLOCK's pak03 replaces hud_health.css and hud_health_container.css, so shipping patched copies would break QOLLOCK. Inline writes work over any stylesheet. Until 3.3.0 the feature did nothing on a QOLLOCK HUD (`#currentHealthOverHearts`). Since 3.3.1 ([ticket 40](40-qollock-separate-shield.md)) it runs there too: a QOLLOCK healthbar theme keeps its own layout, and the Minecraft healthbar is left alone.
- **Fallbacks to the game view:**
  - a Rat King barrier, because no exact barrier number exists (m1);
  - unreadable numbers;
  - health 0.
- **Release:**
  - Margins clear through `margin`, and `horizontalAlign` goes back to the stylesheet's `center`. Both are aliases that throw when cleared alone (live 6779/6782).
  - The three `max` values return to 1.
  - The container's `hpc3_legacy_shield` attribute lets a later menu context release what an earlier one left.
- **Cost:**
  - Merged (the default) adds nothing.
  - Separate checks three classes 10 times a second. While a shield is up, or the scale is still settling after it breaks, it samples 20 times a second: three classes and three label texts.
  - Writes happen only on change.
  - Measured in the VM with a shield up, including the existing 1 s HUD watch: 161 ops/s.

## Limits (from the debate)
- **Not frame-exact:** corrections lag the game by up to 50 ms while shielded and up to 100 ms when a shield appears.
- **Health smoothing:** the fill shows raw health at each sample, so the game's health smoothing is gone while the scale is corrected.
- **Lost-health flash:** the red flash's extent is approximate while shielded; its timing and colour are native.
- **Barrier:** with a Rat King barrier the game's merged view returns.
- **Tick intervals:** the owned ticks assume the defaults `citadel_unit_status_breakpoint_line_small_amt` 250 and `_large_amt` 1000 (both read from client.dll).
- **Frame order:** whether Panorama runs the per-frame callback before or after UpdateBar is unknown; at worst the scale is one frame late.

## Evidence
- `tests/legacy-shield.test.js`: 10 tests, red before the runtime existed. They cover:
  - the row, and Merged writing and scheduling nothing;
  - the old layout with no shield;
  - a shield up at full, mid and low health: the fill, the green bar, the hidden cyan, the number and its colours, and the cadence;
  - a shield break with a retained loss, then the hand-back;
  - the barrier, unreadable-number and QOLLOCK fallbacks;
  - steady state (no writes) and the op budget;
  - releases on Merged, on HP Colors off and on a pending reload of an earlier context;
  - HUD replacement;
  - v15 codes, and a v14 code reading Merged.
- Tests updated for record v15: codec, migration, preview-chrome, news, nav.

## Not verified
- In game: the fill height with a shield up, the green bar position, the number, the colours, and a Rat King barrier. That `label.text` of `{i:r:…}` labels reads as plain digits is taken from the user's debugger screenshot ("1637", "600").

## Live fix 2 (2026-10-21)
The user reported two more problems:
- the ticks were gone while a shield was up;
- the bar twitched up and down while the shield took damage, until it broke.

**Cause of the twitch:** the scale was sampled 20 times a second, but D changes every frame: the recent loss grows on hits and decays afterwards (`sub_181E5CBC0`). Between samples the fill drifted, and each sample snapped it back. The health was also computed from two labels (`current_health` − `bullet_shield_current`) that are set by different updaters (`sub_181C095D0`, `sub_181C6C280`). Any frame where one label lagged the other gave a wrong health.

**Fix:** D now comes only from bars that UpdateBar (`0x181C0DE30`) writes in one pass (disassembly at `0x181C0E290`–`0x181C0E395`):
- `health_bar.lowervalue` = h/D;
- `shield_bar_2.uppervalue` = (h + S)/D;
- `shield_bar.lowervalue` = S/Smax.

So S = `shield_bar.lowervalue` · Smax, D = S / (upper − lower), the scale is max HP / D, and the number is round(lower · D). These are re-read every frame (`$.Schedule(0.004)`) while shielded or corrected, at three property reads a frame; anything else happens only on change. Classes, max HP and Smax are re-read every 50 ms. Once the shield is broken (S = 0), the HP text equals health and is used instead.

**Ticks:** `CCitadelHudUtils::UpdateTickBar` (`0x181C74D60`, line lambda `0x181C773F0`, positioner `0x181BD50E0`):
- draws a line every `line_small_amt` (250) up to D, with none above 50 lines;
- gives lines on multiples of `line_large_amt` (1000) `line_large`, the others `line_small`;
- places each at `position: 0px (100·(1 − v/D))% 0px` (constant 100.0 at `0x182641680`).

While the scale is corrected, the game's `#healthLines` is hidden. An owned `Panel id="healthLines"` (class `HPColorsLegacyLines`) sits right after it in `.health_bar_border`, which has no flow, so it overlaps. The stock `#healthLines` and `.line_large`/`.line_small` rules apply to it. Its lines are rebuilt only when max HP changes.

**Tests:** 12 in `tests/legacy-shield.test.js`, including three new ones that failed first:
- the fill stays at health / max HP on every 5 ms step while D moves and the labels are stale;
- the owned ticks match UpdateTickBar at max HP;
- the ticks follow a max HP change and are released.

Built: normal `493bb3f0` / `80cd1f80` (debug installed), QOLLOCK `04f10083` / `7f003e5e`, ShowRank `7e9a902a` / `dec877f4` (release / debug). Suites: canonical 1330/1330, staged 1328 release / 1329 debug, variants 42/42. Not yet checked in game.

## Live fix 3 (2026-10-21): empty-shield 0, refactor
The user confirmed that the ticks and the steady fill work. They asked for a "0" beside the green bar while the shield is empty, and for the lane to be refactored and optimized.

**Facts** (`sub_181C6C280`, the shield-number updater):
- `HasBulletShield` follows the shield **max**, so an empty shield keeps it; `BulletShieldBroken` is set at 0 points.
- The game sets `bullet_shield_current` whenever max > 0.
- Live 6805 debug lines show the empty state handing the number back to the game, which in this code means the shield text did not read as an integer. Which text the game showed is not known.

**Empty shield:** while `shieldActive` is on, `#BulletShieldNumbers` is kept visible. When the shield bar is at 0 and the game label is not "0", an owned "0" Label (`HPColorsLegacyShieldZero`, class `progress_bar_current`) sits over the faded game label. The stock rules colour it, including the faint red of `.BulletShieldBroken`. If the game shows "0" itself, its label stays.

**Behavior changes:**
- The HP number is owned only while the shield has points. When it is empty, the game number is already health.
- Sampling is every frame while the shield has points or the scale is corrected, 20/s while the shield is empty (so a recharge is caught early), and 10/s otherwise.

**Refactor:**
- Shared helpers: `legacyReset`, `legacyStyle`/`showLegacy`, `legacyOwnLabel` (number and "0"), and `legacySample`/`legacyApply`/`legacyNumber`.
- One owned-style table that holds the stock values written before each clear.
- The panel lookup is written out by name.

**Optimization:**
- The per-frame path reads three bar values in a try block and skips the panel validity checks, which now run in the 50 ms sample.
- The sample object is reused.
- The HP and shield texts are read only when the bars cannot give the scale.
- One fewer class read: `HasBulletShield` was dropped for `shieldActive`.

**VM measurements** (shield up, 10 s):
- ops 178 → 139.6 per second;
- validity calls 8502 → 1194;
- text reads 778 → 394.

**Tests:** 13 in `tests/legacy-shield.test.js`. The mock now sets `HasBulletShield`/`BulletShieldBroken` from the shield max as the game does. A new empty-shield test was red first. The release test also covers the owned "0" and the owned ticks.

Built: normal `b128cdf8` / `94e742b4` (debug installed), QOLLOCK `cfb97537` / `50dc41cb`, ShowRank `9d111d30` / `4242f6cf` (release / debug). Suites: canonical 1331/1331, staged 1329 release / 1330 debug, variants 42/42. The empty-shield 0 is not yet checked in game.

## Audit pass (2026-10-21, m1 GPT-6 Astra med, read-only: `agent://ShieldLaneAudit`)
**Taken:**
- **R1, discovery:** only the QOLLOCK marker is cached as unsupported. A stock HUD with a panel still missing is retried by the 1 s HUD watch; before, it was skipped for good. New test: panels that arrive late.
- **R3, colour:** the owned number colour is re-read when health or max HP changes, or when the label is shown again. Before, a max HP change at constant health kept a stale mid/low colour. New test.
- **R4, steady-state test:**
  - it now counts max writes on all three bars, text writes and style writes, including on the shield numbers;
  - it reports the per-frame bar reads: 750/s at the harness's 250 Hz, i.e. three per frame.
- **R5:** `shieldActive` is read once per sample.
- **R6, pure functions:** `legacyBarScale` (D from the bars) and `legacyCorrection` (h and k) take no panels. The HP text stays lazy in the caller.
- **R7:** owned labels, the tick panel and its lines are created with the existing `passive()`.
- **R8, hoisting:**
  - the scaled-bar keys are a constant, and the per-change write is an indexed loop with no closure;
  - the debug-only `legacy.number` state is gone; the debug line reads the opacity cache.

VM steady state (shield up, 10 s): 139.6 → 119.6 ops/s; class reads 696 → 504.

**Not taken:**
- **R2, retained release retries:** the release writes that throw are already handled through the base property or the stock value. A refused `max = 1` or visibility write has never been observed, so a retry ledger like the HUD-colour lane's would be speculative.
- **Stale references after a single-panel swap:** the game builds this layout as a whole, and container replacement is already handled.
- **N1–N3:** more memoization, panel pooling and a slower correction cadence. N3 would bring the twitch back.

Built: normal `933416f0` / `1b033b3e` (debug installed), QOLLOCK `5b093a13` / `7bdc69d5`, ShowRank `d595db09` / `bfdc5a06` (release / debug). Suites: canonical 1333/1333, staged 1331 release / 1332 debug, variants 42/42. Not yet checked in game.

## Bench (2026-10-21, evidence level 1: Panorama VM)
**Harness:** `.scratch/shieldbar/bench.js [repeats] [out.json]`; set `HPV3_SOURCE_ROOT` to bench another source tree.
- It drives the mock game HUD every 4 ms (250 fps) for 10 s.
- It runs once with Separate and once with Merged, alternating, under the same driving.
- The mock game writes bars and labels only on change, like `sub_181C08470`.

Results are in `.scratch/shieldbar/boundary-*.json`. VM wall time is indicative only and is not an FPS claim.

Native boundary calls per second added by Separate (old) over Merged. Panorama VM (evidence level 1), mock game driven at 250 fps, 10 s × 5 alternating repeats; the counts were deterministic in every run.

Each call from the menu into Panorama counts once:
- panel methods;
- `$.Schedule`, `$.CancelScheduled` and `$.CreatePanel`;
- text and style gets and sets;
- the three bar reads and the `max` writes.

Nested mock calls (such as `BAscendantHasClass` walking `BHasClass`) and the mock game's own writes are not counted. `hittest` writes at panel creation and `Date.now` (a V8 builtin; one per lane tick) are also excluded.

| Scenario | Baseline | +owned validity per sample | +pending bars gated | +lazy shield max | +2 reads per quiet frame | Change |
|---|---|---|---|---|---|---|
| idle, no shield | 88 | 88 | 88 | 88 | 88 | +0% |
| shield up, steady | 1170.8 | 1170.8 | 1170.8 | 1170.8 | 940 | -20% |
| shield taking damage | 2118.3 | 1727.3 | 1426.3 | 1426.3 | 1426.3 | -33% |
| empty shield (blank game number) | 278 | 278 | 278 | 258 | 258 | -7% |
| shield broken, loss decaying | 932 | 863.5 | 716.5 | 697.5 | 697.5 | -25% |
| Rat King barrier | 88 | 88 | 88 | 88 | 88 | +0% |

The versions before the optimizations were rebuilt from the recorded edits in `versions/`. Each one reproduces its earlier `bench-*.json` exactly. Those earlier files hold a selected synthetic-operation score that left out `$.Schedule` (250/s when active), counted traversals more than once and counted `BAscendantHasClass` per ancestor, so their percentages are superseded.

Kept changes:
1. **Owned-panel validity:** the owned number, "0" and ticks are revalidated in the 50 ms sample, not on every change. A panel dying in between makes the apply throw, and the next tick resamples.
2. **Pending damage/heal bars:** they draw only while UpdateBar sets `pendingIncomingDamageActive`/`HealActive` (otherwise their middle is empty). Their max follows every change only then; otherwise it is updated at most once per 50 ms sample. Each bar keeps its own written value, and the class is read only when a max would change. New test.
3. **Lazy shield max:** `bullet_shield_max` is read only while the shield has points.
4. **Quiet frames:** a frame with no change reads two bars. h/D and (h + S)/D move whenever h, S or D does, so the shield bar is read only after a change; the 50 ms sample still reads all three.

**Not measured:** the in-game frame-time effect, which needs a level 2 probe or VProf/ETW and a Deadlock launch.

Built: normal `a2ca632d` / `809d697a` (debug installed), QOLLOCK `ebab2994` / `bfb48abb`, ShowRank `07518ea1` / `56659739` (release / debug). Suites: canonical 1334/1334, staged 1332 release / 1333 debug, variants 42/42. Not yet checked in game.

## Live fix 4 (2026-10-21): Rat King barrier in the spirit-shield bar
**User report** (screenshots 20261021180537/180544): with a Rat King barrier, the lane fell back to the merged game view, showing the tan barrier inside the health bar and the number 964 = health + barrier. They asked for the barrier to use the unused spirit barrier, in the Rat King colour.

**Facts:**
- Pre-6711 `hud_health.xml` had `#tech_shield_bar` (small_progress_bar, vertical) before `#shield_bar`, with the rule `#shield_bar, #tech_shield_bar` and `.shieldActive #tech_shield_bar { margin-right: 12px }`. 6711 removed the bar and its CSS.
- `#TechShieldNumbers` is still in `hud_health_container.xml` 6805, unfed.
- UpdateBar writes `#ratking_armor_bar` as (h+S)/D to (h+S+B)/D (disassembly `0x181C0E32F`–`0x181C0E395`), so B = (ratking top − shield_bar_2 top)·D.
- The Rat King colour is `#ratking_armor_bar .ProgressBarMiddle` #C8A165.
- No barrier max reaches the HUD.

**Change:**
- **Barrier no longer falls back:** `#shield_bar_2` and `#ratking_armor_bar` are always hidden in Separate. The health fill, ticks and HP number leave the barrier out as they do the shield.
- **D without shield points:** once per sample, h = round(HP text · lower / ratking top), with all three read in the same tick. Each frame then takes D = h / lower from the fresh health lower. With neither a shield nor a barrier, the top is the health lower, so h is the HP text, as before.
  - The first version combined a total cached for 50 ms with a top read every frame. A barrier draining without a shield then inferred a wrong health between samples and snapped back. The advisory example: H 964, M 1136, B 150 → 100 inferred H ≈ 1009.
  - New test: no-shield barrier drain in 4 ms steps, with fill, number and barrier number checked every frame. It was red before the fix.
  - Limit: a health change while no shield points are up shows up to 50 ms late (no twitch), as in the empty-shield case.
- **The barrier bar:** an owned `ProgressBarWithMiddle#tech_shield_bar`, created on the first barrier with `{ vertical, class: small_progress_bar }` before `#shield_bar`.
  - It uses the pre-6711 rule values inline, with offBlack written as hex.
  - margin-right is 12px beside an active shield bar and 29px alone.
  - Left is #C8A165; Middle and Right are transparent. The parts are coloured once the native control has built them, retried in the 50 ms sample.
  - The fill is B over its peak since the barrier appeared; the peak resets when the barrier ends.
- **The barrier number:** an owned "B" label in `#TechShieldNumbers`, in the stock spirit-shield-number classes and #C8A165, over the faded unfed game label. TechShieldNumbers is shown only while a barrier is up and is optional: without it there is no number.
- **Cadence:** every frame while a barrier is up. The ratking top is part of the quiet-frame check.
- **Release:** collapses the owned bar and number, and clears `armor.visibility`, `techBox.visibility` (stock collapse first) and `tech.opacity`.
- **Help text:** updated.

**Bench** (boundary calls, `.scratch/shieldbar/boundary-final.json`):
- Rat King barrier steady: 1228/s (four bar reads a frame).
- Barrier draining one point a frame: 2036/s, including 250 number writes.
- The other scenarios are unchanged: 88 / 940 / 1426 / 258 / 698.

**Tests:** new barrier test (red first) plus a split fallback test; the release test covers the owned barrier bar and number. 18 in `tests/legacy-shield.test.js` (with the drain test).

**Not verified in game:**
- that `$.CreatePanel` honours `vertical`/`class` for a ProgressBarWithMiddle;
- that its parts carry the ProgressBarLeft/Middle/Right classes;
- that `lowervalue`/`uppervalue` are JS-writable on an owned bar (`max` is);
- the barrier number position.

Built: normal `cbae006f` / `330f1a37` (debug installed), QOLLOCK `3e81b9f3` / `ba0eb4b7`, ShowRank `85efeee1` / `e0496074` (release / debug). Suites: canonical 1335/1335, staged 1333 release / 1334 debug, variants 42/42.

Rebuilt after the drain fix: normal `5b70396e` / `25e45509` (debug installed), QOLLOCK `87f2521a` / `26cc2633`, ShowRank `aacad18c` / `81d8e15d`. Suites: canonical 1336/1336, staged 1334 release / 1335 debug, variants 42/42. The bench is unchanged.

## Live fix 5 (2026-10-21): the first frame of a barrier or shield
**User report** (screenshots 20261021185328/185334): the barrier works (170, tan bar, 1136/1136). But on the frame a barrier appeared, the fill showed a gap and the number was the merged 1306, until the next sample. Idle sampling was 10/s; with an empty shield it was 20/s.

**Cause:** onset was seen only by the class check in the 50/100 ms sample.

**Fix:** the lane now ticks every frame in Separate. With no shield points and no barrier, a quiet frame reads two bars: the health lower h/D and the ratking top (h+S+B)/D, which are equal then.
- One read is not enough. At full health a barrier keeps the top at 1 while D grows. With h + B ≤ max HP, D stays and only the top moves.
- On a change it reads the rest, and if the top is above health it samples the classes in that same frame.
- Classes are still sampled every 100 ms when idle and every 50 ms otherwise.

**New test:** barrier onset and shield recharge at full HP are corrected by the next callback, and quiet frames read two bars. It was red before the fix.

**What this does not prove** (advisory, 2026-10-21): the VM writes the game values before the callback runs, so the test covers only the order game update → script → render.
- **If Panorama runs scheduled callbacks before the HUD's UpdateBar in a frame** (script → game → render), the frame the barrier appears still renders the gap once, and the next callback corrects it. A second test pins that worst case at exactly one frame; it describes a limit and was not red first.
- **The live order is unverified.** A screenshot of the onset frame with this build is the evidence that would settle it.
- **`$.Schedule(0.004)` caps the lane at 250 callbacks/s.** Above 250 fps a correction can land one frame later.

Before this fix the gap could last up to 100 ms.

**Cost** (boundary calls/s, `.scratch/shieldbar/boundary-watch.json`):

| Scenario | Before | After |
|---|---|---|
| Idle, no shield | 88 | 818 |
| Empty shield | 258 | 959 |
| Shield broken, loss decaying | 698 | 1257 |
| Shield up, shield taking damage, barrier | unchanged | unchanged |

The idle and empty-shield increase is two property reads, one `$.Schedule` and one `Date.now` per frame. It costs less than a shield-up frame, but it is not zero; no frame-time effect has been measured.

Built: normal `9e66b53a` / `7afb1e89`, QOLLOCK `24102723` / `049e44ce`, ShowRank `082909df` / `d5e2229d`. Installed after the game closed: normal debug `7afb1e89`. Suites: canonical 1337/1337, staged 1335 release / 1336 debug, variants 42/42.

## Optimization pass 3 (2026-10-21): the watch only where needed; cheaper samples
1. **Watch gating:** `modifier_ratking_ratarmor` is the caster's own armour (abilities.vdata: subclass `ratking_armor_caster`, Rat King bodygroups). So the every-frame watch runs only when the bar can change unseen:
   - there is a shield max;
   - a barrier is up;
   - the scale is corrected;
   - the local hero (identity watch) is Rat King or not known yet.

   Otherwise the lane is back to 10/s. A shield bought in the shop can show the onset gap for up to 100 ms. New test (red first).
2. **HUD liveness:** one panel (`#health_bar`) per sample instead of three. The stock HUD is built and removed as a whole, and the existing replaced-HUD test covers it.
3. **Owned-panel validity:** checked only after an apply error (`legacy.revalidate`), not on every sample.

**Native boundary calls per frame** (250 fps VM; calls/s ÷ 250; `boundary-baseline/-watch/-gated.json`):

| Scenario | Before the optimizations | Last build | Now |
|---|---|---|---|
| Idle, hero unknown or Rat King | 0.35 | 3.27 | 3.19 |
| Idle, known other hero | 0.35 | 3.27 | 0.31 |
| Shield up, steady | 4.68 | 3.76 | 3.45 |
| Shield taking damage | 8.47 | 5.71 | 5.40 |
| Empty shield | 1.11 | 3.84 | 3.61 |
| Shield broken, loss decaying | 3.73 | 5.03 | 4.80 |
| Rat King barrier, steady | game view | 4.91 | 4.45 |
| Barrier draining one point a frame | game view | 8.14 | 7.68 |

A quiet watched frame is two bar reads plus the `$.Schedule`. The rest is the 50/100 ms sample spread over the frames.

## Cadence cap 120/s (2026-10-21, user choice)
The watch callback was `$.Schedule(0.004)`: every frame up to 250 fps. At the user's request it is now `LEGACY_FRAME = 1/120`, so it runs every frame up to 120 fps and at most 120 times a second above that.
- **Cost per callback:** unchanged.
- **Calls per second:** lower only when the game runs above 120 fps.
- **Tradeoff:** above 120 fps a correction can land a frame later.

Boundary calls/s with the game at 250 fps (`.scratch/shieldbar/cadence-*.json`):

| Scenario | 4 ms cap | 120/s cap |
|---|---|---|
| Idle, unknown hero or Rat King | 798 | 406 |
| Idle, another known hero | 78 | 78 |
| Shield up | 863 | 472 |
| Shield taking damage | 1350 | 734 |
| Empty shield | 902 | 510 |
| Shield broken, loss decaying | 1199 | 668 |
| Barrier steady | 1113 | 592 |
| Barrier draining | 1921 | 1009 |

At 120 fps or below, the real game runs one callback per frame either way. The VM has no frame quantisation, so it cannot show that.

**Tests:** step one 120/s callback (9 ms) per frame. The test-time suite cache now also keys the repo ignore rules, the hpv2-store checkout and every HPV3_* variable the suite reads, with invalidation tests (advisory).

Built (120/s cap): normal `e76dd7d0` / `e3c6169d`, QOLLOCK `16175248` / `ad7abeca`, ShowRank `cc83a34a` / `09df7b19` (release / debug). Six builds in 5 min 15 s; the variants reused the canonical suite pass. Normal debug `e3c6169d` installed.
