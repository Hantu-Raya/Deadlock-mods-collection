# HP Colors Web Builder Compact Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the HP Colors web builder feel production-ready and compact without changing import/build behavior.

**Architecture:** Keep the current single-page app and existing JS flow. Reshape the page into a compact two-column workspace, then polish the visual system with shadcn-like restraint: dark neutral surfaces, tight spacing, clear borders, and strong focus states. Keep logic changes minimal and only touch JS if a class hook or accessibility attribute is needed.

**Tech Stack:** Vanilla HTML, vanilla CSS, ES modules, Node test runner.

---

### Task 1: Restructure the page shell

**Files:**
- Modify: `hp_colors_web_builder/index.html`
- Modify: `hp_colors_web_builder/src/styles.css`

- [ ] **Step 1: Rebuild the top-level layout into a compact workspace**

```html
<main class="shell">
  <header class="topbar">
    <div class="topbar-copy">
      <h1>HP Colors Web Builder</h1>
      <p>Build and import hp_colors presets in a compact production UI.</p>
    </div>
    <button id="buildBtn" type="button">Build pak96_dir.vpk</button>
  </header>

  <section class="workspace">
    <div class="stack stack--controls">
      <section class="panel">
        <h2>Schema controls</h2>
        <div id="builderForm" class="form-grid"></div>
      </section>

      <section class="panel import-panel">
        <h2>Import preset</h2>
        <textarea id="importText" class="import-textarea" rows="4" placeholder="Paste HP Colors import code here"></textarea>
        <div class="import-actions">
          <button id="importBtn" type="button">Import preset state</button>
        </div>
      </section>
    </div>

    <div class="stack stack--output">
      <section class="panel">
        <h2>Build preview</h2>
        <pre id="preview"></pre>
        <p id="status" role="status">Ready.</p>
      </section>
    </div>
  </section>
</main>
```

- [ ] **Step 2: Convert the page to a two-column, compact desktop grid**

```css
.shell {
  width: min(1040px, calc(100vw - 24px));
  margin: 0 auto;
  padding: 20px 0 28px;
}

.topbar {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 14px;
}

.workspace {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.9fr);
  gap: 12px;
}

.stack {
  display: grid;
  gap: 12px;
}
```

**Expected result:** The page reads as a tight workspace instead of a tall stack of panels.

---

### Task 2: Apply the production visual system

**Files:**
- Modify: `hp_colors_web_builder/src/styles.css`

- [ ] **Step 1: Replace the generic visual defaults with compact shadcn-like tokens**

```css
:root {
  color-scheme: dark;
  font-family: "Segoe UI", system-ui, sans-serif;
  font-variant-numeric: tabular-nums;
  --bg: #0b0d10;
  --surface: #12161b;
  --surface-2: #0f1317;
  --border: rgba(255, 255, 255, 0.08);
  --accent: #d8a23a;
  --text: #eef1f4;
  --muted: #9aa4af;
}
```

- [ ] **Step 2: Tighten component spacing and hierarchy**

```css
.panel {
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface);
  padding: 14px;
}

.form-grid,
.field-group,
.import-panel {
  gap: 10px;
}

h1 {
  font-size: 24px;
  line-height: 1.05;
  letter-spacing: -0.02em;
}

h2 {
  font-size: 13px;
  letter-spacing: 0.01em;
  color: var(--accent);
}
```

- [ ] **Step 3: Add interaction states and focus visibility**

```css
button,
input,
textarea,
select {
  transition: border-color 180ms ease, background-color 180ms ease, transform 180ms ease, box-shadow 180ms ease;
}

button:hover {
  transform: translateY(-1px);
}

button:active {
  transform: translateY(0);
}

button:focus-visible,
input:focus-visible,
textarea:focus-visible,
select:focus-visible {
  outline: 2px solid rgba(216, 162, 58, 0.8);
  outline-offset: 2px;
}
```

**Expected result:** The UI feels like a finished product: quiet, dense, and clearly interactive.

---

### Task 3: Polish output, import, and responsive behavior

**Files:**
- Modify: `hp_colors_web_builder/src/styles.css`
- Modify: `hp_colors_web_builder/index.html` (if any wrapper labels or semantic tweaks are needed)
- Modify: `hp_colors_web_builder/src/app.js` only if a minor status text or accessibility hook is needed

- [ ] **Step 1: Style the preview and status areas as a code-output surface**

```css
pre {
  margin-top: 10px;
  max-height: 320px;
  overflow: auto;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-2);
  color: #dce3ea;
  font-size: 12px;
  line-height: 1.5;
}

#status {
  min-height: 20px;
  margin-top: 10px;
  color: var(--muted);
}
```

- [ ] **Step 2: Keep the import panel compact and readable**

```css
.import-panel textarea {
  min-height: 92px;
  resize: vertical;
}

.import-actions {
  display: flex;
  justify-content: flex-end;
}
```

- [ ] **Step 3: Collapse cleanly on smaller screens**

```css
@media (max-width: 960px) {
  .topbar {
    align-items: stretch;
    flex-direction: column;
  }

  .workspace {
    grid-template-columns: 1fr;
  }
}
```

**Expected result:** Controls, import, and preview remain easy to use without wasting vertical space.

---

### Task 4: Verify the redesign

**Files:**
- Verify: `hp_colors_web_builder/src/app.js`
- Verify: `hp_colors_web_builder/src/styles.css`
- Verify: `hp_colors_web_builder/index.html`

- [ ] **Step 1: Run the test suite**

Run:
```bash
npm test
```

Expected: all existing tests pass.

- [ ] **Step 2: Run syntax checks for edited JS**

Run:
```bash
node --check src/app.js && node --check src/hpImportController.js && node --check test/hpImportController.test.js
```

Expected: no syntax errors.

- [ ] **Step 3: Smoke test the page manually**

Open `hp_colors_web_builder/index.html` in a browser and confirm:
- the shell stays compact
- the two-column layout collapses cleanly on narrow screens
- build/import controls are visible without scrolling
- preview and status remain readable

**Expected result:** The redesign is ready for production use and still behaves exactly like the current builder.
