# HP Colors Web Schema Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose every persisted `hp_colors` setting one-to-one in the web builder, grouped and hidden like the registrar, while keeping the base_hud-only `pak96_dir.vpk` build flow.

**Architecture:** Treat `hp_colors_web_builder/src/hpSchema.js` as the schema source of truth and extend it with registrar-matching metadata (type, label, category, visibleWhen, bounds). Add a small form model/renderer layer that turns the schema into grouped browser controls and returns sanitized values for the pack builder. Keep `src/packageBuilder.js` focused on injecting the preset store into `base_hud.xml` and compiling only `base_hud.vxml_c`.

**Tech Stack:** Vanilla ES modules, browser DOM, Node `node:test`, Source 2 Panorama resource compilation, VPK packing.

---

### Task 1: Mirror the registrar schema in web schema metadata

**Files:**
- Modify: `hp_colors_web_builder/src/hpSchema.js`
- Create: `hp_colors_web_builder/test/hpSchema.test.js`

- [ ] **Step 1: Write the failing test**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { HP_SCHEMA } from "../src/hpSchema.js";

test("web schema matches registrar persisted settings", async () => {
  const registrar = await readFile(new URL("../templates/hp_colors/panorama/scripts/hp_registrar.js", import.meta.url), "utf8");
  const registrarIds = [...registrar.matchAll(/id:\s*"([a-z0-9_]+)"/g)].map((m) => m[1]).filter((id) => id !== "hp_preset_apply_baked");
  assert.deepEqual(Object.keys(HP_SCHEMA).sort(), registrarIds.sort());
});

test("web schema includes registrar UI metadata", () => {
  assert.equal(HP_SCHEMA.hp_pulse_text_position.type, "positionpicker");
  assert.equal(HP_SCHEMA.hp_friend_color_low.category, "HEALTH BARS|Ally Colors");
  assert.deepEqual(HP_SCHEMA.hp_text_color_low.visibleWhen, { id: "hp_text_color_mode", equals: 1 });
});
```

- [ ] **Step 2: Run the test and confirm it fails for missing metadata**

Run: `node --test hp_colors_web_builder/test/hpSchema.test.js`

Expected: FAIL, because the current schema only covers 31 fields and does not yet include the registrar-matching metadata for the remaining settings.

- [ ] **Step 3: Expand `hpSchema.js` to the full registrar set**

Add all 45 persisted settings from `hp_registrar.js` and keep the existing button out of the editable schema. Use registrar-matching metadata for each entry:

```js
hp_pulse_text_position: {
  type: "positionpicker",
  defaultValue: "20,196",
  label: "Pulsing number position",
  category: "VISUAL EFFECTS|Low HP Pulse",
  visibleWhen: { id: "hp_pulse_text_enabled", equals: true }
}
```

Keep `coerceHpValue()` aligned with the new types:
- `toggle` → boolean
- `slider` / `cycler` → bounded number
- `colorpicker` → uppercase `#RRGGBB`
- `positionpicker` → trimmed string in `x,y` form

- [ ] **Step 4: Re-run the test and confirm it passes**

Run: `node --test hp_colors_web_builder/test/hpSchema.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the schema coverage change**

```bash
git add hp_colors_web_builder/src/hpSchema.js hp_colors_web_builder/test/hpSchema.test.js
git commit -m "feat: mirror hp colors schema metadata"
```

### Task 2: Build a schema-driven form model and renderer

**Files:**
- Create: `hp_colors_web_builder/src/hpFormModel.js`
- Create: `hp_colors_web_builder/src/hpFormRenderer.js`
- Modify: `hp_colors_web_builder/index.html`
- Modify: `hp_colors_web_builder/src/styles.css`
- Create: `hp_colors_web_builder/test/hpFormModel.test.js`

- [ ] **Step 1: Write the failing test**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { buildCategoryGroups, isFieldVisible, createDefaultFormState } from "../src/hpFormModel.js";
import { HP_SCHEMA } from "../src/hpSchema.js";

test("schema groups follow registrar categories", () => {
  const groups = buildCategoryGroups(HP_SCHEMA);
  assert.deepEqual(groups.map((g) => g.category), [
    "GENERAL|Core Behavior",
    "HEALTH BARS|Enemy Colors",
    "VISUAL EFFECTS|Low HP Pulse",
    "HEALTH BARS|Number Overlay",
    "HEALTH BARS|Ally Colors",
    "VISUAL EFFECTS|Kill Marker"
  ]);
  assert.equal(groups[0].fields[0].id, "hp_enabled");
});

test("visibility follows visibleWhen rules", () => {
  const state = createDefaultFormState(HP_SCHEMA);
  assert.equal(isFieldVisible(HP_SCHEMA.hp_text_color_low, state), false);
  state.hp_text_color_mode = 1;
  assert.equal(isFieldVisible(HP_SCHEMA.hp_text_color_low, state), true);
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --test hp_colors_web_builder/test/hpFormModel.test.js`

Expected: FAIL, because the form model does not exist yet.

- [ ] **Step 3: Implement the form model and DOM renderer**

Create a pure model layer that:
- groups entries by `category`
- preserves registrar order within each group
- filters visibility using `visibleWhen`
- creates default state from `HP_SCHEMA`

Create a renderer layer that:
- renders category panels into `#builderForm`
- maps field types to controls:
  - `toggle` → checkbox
  - `slider` → range + numeric display
  - `colorpicker` → color input plus hex text value
  - `cycler` → select
  - `positionpicker` → text input containing `x,y`
- hides dependent fields when their parent value does not match
- keeps the preview panel showing the current serialized preset JSON

- [ ] **Step 4: Re-run the test and confirm it passes**

Run: `node --test hp_colors_web_builder/test/hpFormModel.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the form layer**

```bash
git add hp_colors_web_builder/src/hpFormModel.js hp_colors_web_builder/src/hpFormRenderer.js hp_colors_web_builder/index.html hp_colors_web_builder/src/styles.css hp_colors_web_builder/test/hpFormModel.test.js
git commit -m "feat: render hp colors schema form"
```

### Task 3: Wire the form into the build pipeline

**Files:**
- Modify: `hp_colors_web_builder/src/app.js`
- Modify: `hp_colors_web_builder/src/packageBuilder.js`
- Modify: `hp_colors_web_builder/test/packageBuilder.test.js`
- Modify: `hp_colors_web_builder/test/presetUi.test.js`

- [ ] **Step 1: Write the failing integration test**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { buildHpColorsPackage } from "../src/packageBuilder.js";

test("buildHpColorsPackage still emits only the base_hud override", () => {
  const result = buildHpColorsPackage({
    sourceTexts: {
      "templates/hp_colors/panorama/layout/base_hud.xml": '<root><Panel id="AnitaUI_Anchor" /></root>'
    },
    preset: {
      name: "Web Builder Preset",
      version: 1,
      values: { hp_enabled: true }
    }
  });

  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].path, "panorama/layout/base_hud.vxml_c");
});
```

- [ ] **Step 2: Run the test and confirm it fails if the wiring is broken**

Run: `node --test hp_colors_web_builder/test/packageBuilder.test.js`

Expected: FAIL only if the current build path no longer matches the base_hud-only contract.

- [ ] **Step 3: Wire `app.js` to collect form state and preview it**

Update the browser app so it:
- renders the schema-driven form on load
- seeds fields with a randomized default preset
- keeps `preview` in sync with the current form state
- builds `pak96_dir.vpk` from the current form values instead of the old tiny hardcoded inputs

Keep `buildHpColorsPackage()` focused on:
```js
export function buildHpColorsPackage({ sourceTexts, preset }) {
  // inject HPColorsPresetStore into base_hud.xml
  // compile base_hud.vxml_c only
}
```

- [ ] **Step 4: Re-run the suite and confirm it passes**

Run: `npm test` in `hp_colors_web_builder`

Expected: PASS.

- [ ] **Step 5: Commit the pipeline wiring**

```bash
git add hp_colors_web_builder/src/app.js hp_colors_web_builder/src/packageBuilder.js hp_colors_web_builder/test/packageBuilder.test.js hp_colors_web_builder/test/presetUi.test.js
git commit -m "feat: wire hp colors form into pak builder"
```

### Task 4: Verify the browser build and deploy output

**Files:**
- Modify: `hp_colors_web_builder/README.md` (if copy needs to reflect the new form)

- [ ] **Step 1: Run the full test suite**

Run: `npm test` in `hp_colors_web_builder`

Expected: PASS.

- [ ] **Step 2: Build `pak96_dir.vpk` in the browser**

Open the web builder, set a few controls from different categories, and click build.

Expected output:
- `pak96_dir.vpk` downloads
- the built file is copied/replaced at `G:\SteamLibrary\steamapps\common\Deadlock\game\citadel\addons\pak96_dir.vpk`
- the preview reflects the selected form values before build

- [ ] **Step 3: Spot-check the deployed artifact**

Confirm the addons file exists and is non-empty, then launch Deadlock and verify the web-selected values still apply in-game.

- [ ] **Step 4: Final commit for copy/docs cleanup if needed**

```bash
git add hp_colors_web_builder/README.md
git commit -m "docs: update hp colors web builder copy"
```
