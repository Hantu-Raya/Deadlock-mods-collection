# Preview bar

Type: wayfinder:prototype (HITL)
Status: Closed
Blocked by: none

## Question

Can the real renderer draw a fake bar tree inside the ESC menu, driven by an HP slider and a damage/heal play button, without touching stock settings previews?

## Notes

`GRILL.md` 10, 17, 18, 23. Prove it on the VM adapter first, then in game during live test 1.

## Resolution

**On the VM adapter: yes.** The renderer prototype's `plan` draws a fake bar tree in the preview pane through an apply with the renderer's ledger contract. The HP slider and the damage/heal play button work. No panel outside the pane is touched, and nothing stays scheduled after close or a page switch. **In game: not yet shown.** Nothing was packed, deployed or launched, so this waits for live test 1.

Prototype: `prototypes/preview/`. [FAILURE-MODES.md](../prototypes/preview/FAILURE-MODES.md) was written before the code.

- **`panorama/layout/hp_colors_v3_preview.xml`.** A drop-in replacement for menu-gen's `HPColorsPreview` placeholder. The chrome ids are the same as menu-gen's. It adds a kind segment (NPC / Objective, shown only on the Units page) and a fake tree:
  - lineage: `HPColorsPreviewUnitStatus > Info > Bars.UnitHealthbarsContainer > Bar.UnitHealthbar.UnitHealthbarContainer > BarInner.UnitHealthbarInner > BarFill`;
  - `HpText` sits under `Info`, and `Name` sits above the bars.
  - All 25 ids are `HPColorsPreview*`. None appears in the stock/v2 unit-status layout or the v2 escape menu, and no menu panel carries a carrier class.
- **`panorama/styles/hp_colors_v3_preview.css`.** Styles only the fake tree, the kind segment and the states. The chrome comes from menu-gen's sheet. The fill uses the stock `hero_healthbar_fill_center_psd.vtex` with a wash, and fonts and sizes come from `unit_status_v2.css`. There are no transitions, no `box-shadow` and no `clip-path`.
- **`panorama/scripts/hp_colors_v3_preview.js`.** Publishes `ctx.HPColorsPreviewV3`, with `open`, `close`, `setPage`, `setSide`, `setUnitKind`, `setSettings` and `inspect`.
  - **Kind.** Bar, HP Text, Name, Indicators and Presets show a hero. Units shows an NPC or an objective.
  - **Facts.** Same shape as the renderer's facts. Eligibility follows the same rule as `carrierFacts`, but the carrier classes are data, not classes on panels.
  - **Scheduling.** Only two things are ever scheduled: the 9-step play sequence (0.45 s per step) and up to ten 0.1 s layout-settle retries. Both share one job slot and one generation token.
  - **Slider.** The script never writes the slider during play, so its own writes cannot cancel the sequence. A slider event that repeats the current value is ignored.
- **Tests and compile.** `preview.test.js` (with `index.js`) holds the tests. `compile.ps1` mirrors menu-gen's compile and writes `compile.log`.

**Findings for the production renderer:**

1. **The renderer exports only `plan`.** Its `apply` is bound to a cache that looks panels up by stock id. The preview therefore carries an apply with the same contract over its own part map. A test drives the real `renderer.js` on a stock-lineage world bar and the preview on its fake tree, with the same settings and health, and requires identical owned styles and HP adoption in two phases: painted (4 cases) and released (`enabled: false`). Production should export `apply(parts, plan, ledger)`, so the preview and world bars share one apply instead of a mirror.
2. **The renderer starts itself when included.** `renderer.js` boots on whatever context includes it and keeps a 1 s dormant loop running. The preview reads `plan` and the normalised defaults from it, then calls `stop()` at once. Without that call, 9 of the 12 tests fail.
3. **Stock fallbacks are pinned to enemy players.** The renderer's fallbacks (for example wash `#fd4949`) would be written onto a friend or NPC bar whose stock value was never captured. The preview writes each kind and side's stock look inline before the renderer captures it, and releases the old capture first, so switching kinds restores correctly. World bars need per-kind fallbacks, or a capture that is always non-empty.
4. **Only enemy heroes are painted.** The renderer paints enemy players only, so ally heroes, NPCs and objectives show the stock look, with a status line saying why. They will follow automatically once the renderer gains those kinds.

**Checks run (2026-10-14):**

- `node --test hp_colors_rewrite_v3/prototypes/preview/`: 12 pass, 0 fail. The tests cover:
  - the layout and id contract and lineage parity;
  - the self-booted renderer loop being stopped;
  - the slider repainting, and ignoring repeats of the current value;
  - play running and ending;
  - slider input cancelling play, with stale callbacks doing nothing;
  - close cancelling all jobs and releasing ownership;
  - kind following the page, and page or side switches cancelling play;
  - zero writes, re-parents, class, event or text changes outside the pane across a full session, against bait panels: a world enemy bar, a stock-id settings preview, `HPColorsPickerPreview`, and a `player enemy` carrier above the menu;
  - equivalence with `renderer.js`;
  - bounded settle retries;
  - settings changes during play, and refusal of malformed settings;
  - disabling when the renderer is missing.
- Mutation checks were run and the file restored afterwards. Each of these mutations made at least one test fail: removing the generation token check, a `close()` without cancel, a page switch without cancel, writing the slider during play, a drifted stock pin, stock ids in the part map, no `renderer.stop()`, and eligibility always true.
- `compile.ps1`: `OK: 4 compiled, 0 failed, 0 skipped`. Outputs (sha256 prefix):
  - `hp_colors_v3_preview.vxml_c`: 2,792 B, `0D7136FC…`;
  - `.vcss_c`: 4,619 B, `A97B3EEE…`;
  - `hp_colors_v3_preview.vjs_c`: 17,856 B, `CD614884…`;
  - `hp_colors_v3_renderer_prototype.vjs_c`: 14,509 B, `9E7D552F…`.

  The process exits -532462766, the known trailing `ReadKey` exception. Decompiling the `.vxml_c` with Source2Viewer-CLI gave the same 25 ids in source order. As menu-gen showed, "0 failed" proves syntax and the root rule only, not property validity.

**Only an in-game look can confirm:**

- **Look.** The wash on the stock fill image over a 79×18 frame, the fonts (`numericOracle`, `oracle`), the name tilt and the bar placement in the 200×210 slot. The NPC and objective stock looks are approximations.
- **Slider events.** Whether XML `Slider` panels fire `onvaluechanged` for script writes, and whether synchronously. The preview tolerates both, but this is unobserved.
- **Close path.** Whether the ESC close path reaches `close()`. If it does not, the worst case is the bounded sequence (about 4.5 s) and the retries (1 s).
- **Expandos and stock CSS.** Whether expando properties on the escape-menu context work as in the VM, and whether stock escape-menu CSS reacts to the lineage classes (`UnitHealthbarContainer` and the others).
- **Scale.** Pixel settings appear at menu UI scale, not world scale.

**Open risks.**

- The apply is a mirror until finding 1 is fixed.
- The preview's health is fed directly, so world-bar probe and parse bugs never show up in it.
- During play, a slider drag that ends exactly on the current value is treated as a repeat and does not cancel the sequence.
