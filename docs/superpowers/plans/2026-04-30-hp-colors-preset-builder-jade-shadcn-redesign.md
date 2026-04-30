# HP Colors Preset Builder Jade Shadcn Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Astro preset builder so schema controls feel closer, the layout matches `hp_colors` anatomy, and the theme reads as minimal jade-dark shadcn instead of generic SaaS UI.

**Architecture:** Keep the Astro app and single React island. Add shadcn primitives for the visible controls and tighten the page into a compact three-zone workspace: schema tree, active controls, and preview/status rail. Preserve the pure JS domain modules and the `pak96_dir.vpk` build path.

**Tech Stack:** Astro, React, shadcn/ui, Tailwind/shadcn preset output, existing ES modules, Node test runner.

---

### Task 1: Initialize shadcn for Astro and lock the theme tokens

**Files:**
- Modify: `D:/web/hp-colors-preset-builder/package.json`
- Create/Modify: `D:/web/hp-colors-preset-builder/components.json`
- Create/Modify: `D:/web/hp-colors-preset-builder/tailwind.config.*` or the preset-generated equivalent
- Create/Modify: `D:/web/hp-colors-preset-builder/src/styles/global.css`
- Create/Modify: `D:/web/hp-colors-preset-builder/src/lib/utils.js` (if the preset generates it)

- [ ] **Step 1: Install the Astro shadcn preset**

Run:
```bash
pnpm dlx shadcn@latest init --preset buFywKm --template astro
```

Expected: shadcn scaffolds the Astro project files and theme hooks without changing the app route structure.

- [ ] **Step 2: Pin the jade dark tokens to `hp_colors` values**

```css
:root {
  color-scheme: dark;
  --background: #111315;
  --foreground: #f2f5f5;
  --card: #181b1a;
  --card-foreground: #f2f5f5;
  --popover: #181b1a;
  --popover-foreground: #f2f5f5;
  --primary: #66cc99;
  --primary-foreground: #111315;
  --secondary: #252a27;
  --secondary-foreground: #f2f5f5;
  --muted: #1c201e;
  --muted-foreground: #8b9496;
  --accent: #22372f;
  --accent-foreground: #f2f5f5;
  --border: rgba(255, 255, 255, 0.045);
  --input: rgba(255, 255, 255, 0.06);
  --ring: rgba(102, 204, 153, 0.55);
}
```

- [ ] **Step 3: Verify the base setup uses the desired dark mode and no stock shadcn defaults leak through**

Run:
```bash
npm run build
```

Expected: Astro still builds, and the output reflects the new tokens.

---

### Task 2: Rebuild the page shell into a compact three-zone workspace

**Files:**
- Modify: `D:/web/hp-colors-preset-builder/src/pages/index.astro`
- Modify: `D:/web/hp-colors-preset-builder/src/styles/global.css`
- Modify: `D:/web/hp-colors-preset-builder/src/components/PresetBuilderIsland.jsx`

- [ ] **Step 1: Replace the tall builder layout with a compact command strip + workspace**

```astro
---
import PresetBuilderIsland from '../components/PresetBuilderIsland.jsx';
import '../styles/global.css';
---

<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>HP Colors Preset Builder</title>
  </head>
  <body>
    <main class="app-shell">
      <PresetBuilderIsland client:load />
    </main>
  </body>
</html>
```

- [ ] **Step 2: Define the three-zone workspace shell**

```css
.app-shell {
  min-height: 100dvh;
  padding: 16px;
}

.builder-shell {
  display: grid;
  gap: 12px;
  max-width: 1440px;
  margin: 0 auto;
}

.builder-grid {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr) 360px;
  gap: 12px;
}
```

- [ ] **Step 3: Put build/import/status into a short top command strip**

```jsx
<header className="command-strip">
  <div className="command-title">
    <h1>HP Colors Preset Builder</h1>
    <p>Compact preset editing with jade dark shadcn styling.</p>
  </div>
  <div className="command-actions">
    <Input value={presetName} onChange={...} />
    <Button onClick={() => setWarningOpen(true)}>Build pak96_dir.vpk</Button>
  </div>
</header>
```

Expected: schema, build, and import sit closer together so the user moves the pointer less.

---

### Task 3: Rework the schema controls into an Anita-style React tree

**Files:**
- Modify: `D:/web/hp-colors-preset-builder/src/components/PresetBuilderIsland.jsx`
- Modify: `D:/web/hp-colors-preset-builder/src/hpFormModel.js`
- Modify: `D:/web/hp-colors-preset-builder/src/hpFormRenderer.js` or replace it if the React island fully owns the form UI
- Create: `D:/web/hp-colors-preset-builder/src/components/schema-tree.jsx` (if the tree should be split out)
- Create: `D:/web/hp-colors-preset-builder/src/components/schema-field.jsx` (if field rendering needs its own leaf component)

- [ ] **Step 1: Model the left tree after `hp_colors` categories**

```jsx
const CATEGORIES = [
  { main: 'GENERAL', sub: ['Core Behavior'] },
  { main: 'HEALTH BARS', sub: ['Enemy Colors', 'Number Overlay', 'Ally Colors'] },
  { main: 'VISUAL EFFECTS', sub: ['Low HP Pulse', 'Kill Marker'] },
];
```

- [ ] **Step 2: Show one active group in the center pane**

```jsx
<section className="controls-pane">
  <div className="pane-header">
    <div>
      <p className="kicker">Active group</p>
      <h2>{activeGroupLabel}</h2>
    </div>
    <span className="count">{visibleCount} fields</span>
  </div>
  <div className="field-stack">{renderedFields}</div>
</section>
```

- [ ] **Step 3: Use shadcn primitives for the actual inputs**

```jsx
<Switch checked={value} onCheckedChange={(next) => onChange(id, next)} />
<Slider value={[value]} min={0} max={100} step={1} onValueChange={(vals) => onChange(id, vals[0])} />
<Select value={String(value)} onValueChange={(next) => onChange(id, next)} />
<Input value={value} onChange={(e) => onChange(id, e.target.value)} />
```

Expected: the schema feels like `hp_colors` in structure, but the controls are easier to scan and closer together.

---

### Task 4: Add the preview rail, build warning, and mobile collapse behavior

**Files:**
- Modify: `D:/web/hp-colors-preset-builder/src/components/PresetBuilderIsland.jsx`
- Modify: `D:/web/hp-colors-preset-builder/src/styles/global.css`

- [ ] **Step 1: Keep preview and status in a sticky right rail**

```jsx
<aside className="preview-rail">
  <section className="panel panel--sticky">
    <h2>Build preview</h2>
    <pre ref={previewRef} id="preview" />
    <p id="status" role="status">{status}</p>
  </section>
</aside>
```

- [ ] **Step 2: Keep the warning gate inline and close to build**

```jsx
{warningOpen && (
  <div className="build-warning-modal" role="dialog" aria-modal="true" aria-labelledby="buildWarningTitle">
    <div className="build-warning-panel panel">
      <h3 id="buildWarningTitle">Check load order before build</h3>
      <p>Build writes an override for base_hud.</p>
      <p>Acknowledge to continue building pak96_dir.vpk.</p>
      <div className="actions">
        <Button variant="secondary" onClick={() => setWarningOpen(false)}>Cancel</Button>
        <Button onClick={performBuild}>Acknowledge</Button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 3: Collapse to one column on smaller screens**

```css
@media (max-width: 1100px) {
  .builder-grid {
    grid-template-columns: 1fr;
  }

  .preview-rail {
    position: static;
  }
}
```

Expected: mobile stays usable and desktop keeps the schema/edit/build loop short.

---

### Task 5: Verify package names, tests, and build

**Files:**
- Verify: `D:/web/hp-colors-preset-builder/package.json`
- Verify: `D:/web/hp-colors-preset-builder/src/components/PresetBuilderIsland.jsx`
- Verify: `D:/web/hp-colors-preset-builder/src/styles/global.css`
- Verify: `D:/web/hp-colors-preset-builder/src/pages/index.astro`

- [ ] **Step 1: Search for stale `pak97` references in the moved repo**

Run:
```bash
grep -R "pak97" D:/web/hp-colors-preset-builder/src D:/web/hp-colors-preset-builder/*.md D:/web/hp-colors-preset-builder/*.astro D:/web/hp-colors-preset-builder/package.json
```

Expected: no matches in source files.

- [ ] **Step 2: Run the test suite**

Run:
```bash
npm test
```

Expected: all existing tests pass.

- [ ] **Step 3: Run the Astro build**

Run:
```bash
npm run build
```

Expected: build completes successfully.

- [ ] **Step 4: Spot-check the final UX loop**

Run:
```bash
npm run dev
```

Expected: schema tree, active controls, preview rail, and `pak96_dir.vpk` build action are all easy to reach without large pointer travel.
