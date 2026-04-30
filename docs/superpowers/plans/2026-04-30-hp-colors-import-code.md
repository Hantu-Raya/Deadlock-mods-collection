# HP Colors import code Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a paste-and-import flow to the HP Colors web builder that accepts the in-game export code, strictly validates it, and replaces the current form state.

**Architecture:** Keep parsing and validation in a small pure module that understands the in-game HP Colors export token, compact payload, alias expansion, and schema validation. Keep the browser wiring thin: `app.js` reads the textarea, calls the parser/controller, updates the schema-driven form state, and leaves the existing base_hud-only `pak96_dir.vpk` build path untouched.

**Tech Stack:** Vanilla ES modules, browser DOM, Node `node:test`, Source 2 Panorama export-code format, existing HP Colors schema/form renderer.

---

### Task 1: Parse game export code strictly

**Files:**
- Create: `hp_colors_web_builder/src/hpImportCode.js`
- Create: `hp_colors_web_builder/test/hpImportCode.test.js`

- [ ] **Step 1: Write the failing test**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { HP_SCHEMA } from "../src/hpSchema.js";
import { parseHpColorsImportCode } from "../src/hpImportCode.js";

function base64UrlEncode(text) {
  return Buffer.from(text, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildToken(payload) {
  return `[ANITA-v1-hp_colors]:${base64UrlEncode(JSON.stringify(payload))}`;
}

test("parses a valid HP Colors export token into full schema state", () => {
  const token = buildToken({
    v: 97,
    c: 1,
    values: {
      e: false,
      cl: "#112233",
      p: "12,34"
    }
  });

  const state = parseHpColorsImportCode(token, HP_SCHEMA);

  assert.equal(state.hp_enabled, false);
  assert.equal(state.hp_color_low, "#112233");
  assert.equal(state.hp_counter_position, "12,34");
  assert.equal(state.hp_high_threshold, HP_SCHEMA.hp_high_threshold.defaultValue);
});

test("rejects malformed or wrong-namespace codes", () => {
  assert.throws(() => parseHpColorsImportCode("not a token", HP_SCHEMA), /hp colors/i);
  assert.throws(() => parseHpColorsImportCode("[ANITA-v1-wrong]:abc", HP_SCHEMA), /namespace/i);
  assert.throws(() => parseHpColorsImportCode("[ANITA-v1-hp_colors]:!!!!", HP_SCHEMA), /base64/i);
});

test("rejects unknown fields and unsupported versions", () => {
  assert.throws(() => parseHpColorsImportCode(buildToken({ v: 98, c: 1, values: { e: true } }), HP_SCHEMA), /version/i);
  assert.throws(() => parseHpColorsImportCode(buildToken({ v: 97, c: 1, values: { zz: 1 } }), HP_SCHEMA), /unknown/i);
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --test hp_colors_web_builder/test/hpImportCode.test.js`

Expected: FAIL, because the parser module does not exist yet.

- [ ] **Step 3: Implement the parser**

Create `src/hpImportCode.js` with these responsibilities:
- extract exactly one HP Colors token from pasted text using the `\[ANITA-v1-hp_colors\]:...` format
- base64url-decode the token payload
- parse JSON payload shape `{ v, c, values }`
- reject any payload whose namespace/version does not match the current HP Colors export format
- expand compact aliases from the game export into full schema ids
- reject unknown alias ids or any decoded field id not present in the web schema
- merge imported values over schema defaults, then sanitize them through the existing schema coercion rules

Use the current game-side compact aliases from `hp_colors_web_builder/templates/hp_colors/panorama/scripts/anita_persist_loader.js` as the source of truth for the alias table inside the parser module.

Suggested public API:

```js
export function parseHpColorsImportCode(text, schema) {
  // returns a full sanitized state object
}

export function extractHpColorsImportToken(text) {
  // returns the exact hp_colors token or throws
}
```

- [ ] **Step 4: Re-run the test and confirm it passes**

Run: `node --test hp_colors_web_builder/test/hpImportCode.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the parser**

```bash
git add hp_colors_web_builder/src/hpImportCode.js hp_colors_web_builder/test/hpImportCode.test.js
git commit -m "feat: parse hp colors import code"
```

### Task 2: Wire the import UI into the web builder

**Files:**
- Create: `hp_colors_web_builder/src/hpImportController.js`
- Modify: `hp_colors_web_builder/src/app.js`
- Modify: `hp_colors_web_builder/index.html`
- Modify: `hp_colors_web_builder/src/styles.css`
- Create: `hp_colors_web_builder/test/hpImportController.test.js`

- [ ] **Step 1: Write the failing test**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { createHpImportController } from "../src/hpImportController.js";

test("import controller replaces the current state on success", () => {
  const statusCalls = [];
  const setStateCalls = [];
  const controller = createHpImportController({
    schema: {
      hp_enabled: { type: "toggle", defaultValue: true },
      hp_color_low: { type: "colorpicker", defaultValue: "#E16161" }
    },
    setState(nextState) {
      setStateCalls.push(nextState);
    },
    setStatus(message, kind) {
      statusCalls.push({ message, kind });
    }
  });

  const result = controller.importFromText(
    `[ANITA-v1-hp_colors]:${Buffer.from(JSON.stringify({ v: 97, c: 1, values: { e: false, cl: "#123456" } }), "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")}`
  );

  assert.equal(setStateCalls.length, 1);
  assert.equal(result.hp_enabled, false);
  assert.equal(result.hp_color_low, "#123456");
  assert.equal(statusCalls.at(-1).kind, "success");
});

test("import controller leaves state unchanged on failure", () => {
  const statusCalls = [];
  const setStateCalls = [];
  const controller = createHpImportController({
    schema: { hp_enabled: { type: "toggle", defaultValue: true } },
    setState(nextState) {
      setStateCalls.push(nextState);
    },
    setStatus(message, kind) {
      statusCalls.push({ message, kind });
    }
  });

  assert.throws(() => controller.importFromText("bad import"), /hp colors/i);
  assert.equal(setStateCalls.length, 0);
  assert.equal(statusCalls.at(-1).kind, "error");
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `node --test hp_colors_web_builder/test/hpImportController.test.js`

Expected: FAIL, because the controller module does not exist yet.

- [ ] **Step 3: Implement the controller and page controls**

Create `src/hpImportController.js` as a tiny UI adapter around `parseHpColorsImportCode()`:
- `createHpImportController({ schema, setState, setStatus })`
- `importFromText(text)` parses the text, replaces the full state, and returns the imported state
- on success, call `setStatus("Imported HP Colors code.", "success")`
- on failure, call `setStatus(error.message, "error")` and rethrow

Update `src/app.js` so it:
- imports `createHpImportController`
- registers `UI.importCode`, `UI.importBtn`, and `UI.importStatus`
- creates the controller with `setState(nextState) { currentPreset = nextState; formApi.setState(nextState); }`
- on import button click, calls `controller.importFromText(UI.importCode.value)`
- leaves the existing build flow untouched (`pak96_dir.vpk`, base_hud-only)

Update `index.html` to add a visible import section near the build preview:

```html
<section class="panel wide">
  <h2>Import Code</h2>
  <label class="import-code">
    <span>Paste HP Colors export code</span>
    <textarea id="importCode" rows="6" spellcheck="false"></textarea>
  </label>
  <div class="import-actions">
    <button id="importBtn" type="button">Import Code</button>
  </div>
  <p id="importStatus" role="status"></p>
</section>
```

Update `src/styles.css` so the new import block matches the current panel styling and error/success text is readable.

- [ ] **Step 4: Re-run the test and confirm it passes**

Run: `node --test hp_colors_web_builder/test/hpImportController.test.js`

Expected: PASS.

- [ ] **Step 5: Commit the UI wiring**

```bash
git add hp_colors_web_builder/src/hpImportController.js hp_colors_web_builder/src/app.js hp_colors_web_builder/index.html hp_colors_web_builder/src/styles.css hp_colors_web_builder/test/hpImportController.test.js
git commit -m "feat: add hp colors import ui"
```

### Task 3: Verify import replacement and pack flow still work

**Files:**
- Test: `hp_colors_web_builder/test/hpImportCode.test.js`
- Test: `hp_colors_web_builder/test/hpImportController.test.js`
- Test: `hp_colors_web_builder/test/hpFormModel.test.js`

- [ ] **Step 1: Run the full test suite**

Run: `npm test` in `hp_colors_web_builder`

Expected: PASS.

- [ ] **Step 2: Run the browser flow manually**

Open the web builder, paste a real HP Colors export code from the game into the new textarea, click `Import Code`, and confirm:
- the form state is replaced entirely
- the preview JSON updates immediately
- invalid codes show an error and do not alter the form

- [ ] **Step 3: Verify the build path is unchanged**

Click `Build randomized pak96_dir.vpk` after importing valid code and confirm the same base_hud-only output still downloads and targets the Deadlock addons folder.
