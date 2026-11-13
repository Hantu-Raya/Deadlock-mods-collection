# HP Colors v3 menu layout mocks

Ready for the user's choice: **by part or by side**, and **with or without Basic/Advanced folds**. Neither option has been selected.

## Open and compare

Open [by-part.html](by-part.html) or [by-side.html](by-side.html) directly from disk in a browser. No server, install, network request or dependency is needed. Keep the companion JS/CSS files beside both pages.

- **By part:** Bar, HP Text, Name, Indicators, Units, Presets. Enemy/ally columns sit side by side; shared controls appear once below them. Presets shows both current side summaries. On narrow screens columns stack.
- **By side:** Enemy, Ally, Units, Shared, Presets. Enemy/ally pages group settings by part. Shared controls are not misleadingly duplicated as independent side settings.
- The upper-right **search icon** toggles the field; Escape closes it. Search replaces the page with editable matches from all pages, regardless of folds. Matching is case-insensitive word-prefix matching across names, help and keywords; each entered word must match. Thus `red` does not match the suffix of `shared`. Empty search restores the current page.
- The corner **Basic/Advanced folds** checkbox adds/removes native disclosure sections. Basic starts open; Advanced starts closed. Hidden settings still apply.
- The preview follows hero pages or the Units page. Units offers NPC, objective and neutral examples; Enemy/Ally buttons choose the relation. The HP slider changes health; Play runs about four seconds of damage/healing and can be stopped. Bar palette, width/height, position, style/outline, HP text color/size/position/font, name color/size/position/visibility and pips respond approximately.
- Ally and Units customization are **off in the actual v2 defaults**. Enable the corresponding gate to preview custom styling. Reset restores shipped defaults. Presets can keep/apply an in-memory snapshot; reload discards all edits and snapshots. Switching to the other HTML page opens its independent fresh session.

## Content and source evidence

[extract-settings.js](extract-settings.js) generates [settings.js](settings.js), shared by both layouts. From the repository root:

```text
node hp_colors_rewrite_v3/mocks/extract-settings.js
```

It extracts **155 live editable settings**, not retired codec slots:

- Names and help are copied verbatim from `hp_colors_rewrite_v2/panorama/layout/hud_escape_menu.xml` setting rows. Where v2 has no help, the mock keeps it empty rather than inventing game behavior.
- Types, ranges, enum values and **current shipped defaults** come from `hp_colors_v2_contract.js:373–407,494–574,729–775`, not its codec/frozen sparse defaults.
- `hp_colors_v2_menu.js:61–350,632–697,984–1189,1287–1444` supplies old page ownership, Basic/Advanced membership, slider increments and key-to-XML-row mapping. These are extraction inputs, not scripts run by the browser.
- Offsets display in **CSS pixels at 100% bar scale**. Bar/stamina and ultimate/level stored tenths convert by ×0.1. HP-text offsets are **already stored in pixels**, despite v2's percentage readouts; name/pickup/tag offsets stay 1:1 (`hp_colors_rewrite_v2/design.md:188`, menu sliders at `1003–1055`). Examples: shipped `positionY -38 → -3.8 px`, `ultOffsetX 74 → 7.4 px`, `readoutOffsetX/Y 18/14 → 18/14 px`. Non-offset setting ranges/units remain those of v2.
- Colors and font-family names follow `hp_colors_v2_menu.css:25–74,178–185`: dark green surfaces, cream `#FFEFD7`, green `#5FE69E`, gold `#E7C77D`, `block` headings and `oracle` body text. Proprietary fonts are not bundled; the CSS falls back to system fonts when those names are unavailable.

Side/part placement and search keywords are prototype annotations, not a committed v3 schema. `red` is a keyword on the relevant shipped red color settings. The extractor fails if any live key lacks its mapped XML title.

## Verification

Both `file://` entries were loaded in the browser tool and passed [verify-browser.js](verify-browser.js): all 155 settings are reachable exactly once across their pages; folds, editable search, pixel defaults, preview edits, unit-kind switching, snapshot restore/reset, and both damage and healing phases work. Each returned **0 script/console errors**. Search returned **10 rows for `red`, 24 for `offset`, 18 for `name`**, with folds on. A help-only search (`relative`) also found HP-text offsets.

Desktop screenshots were reviewed at 1440×1000 for both layouts and the objective preview. The by-part mock was also reviewed at 390×844; document width remained 390px (no horizontal page overflow).

To rerun using the browser-tool JS Eval helper (after loading its browser documentation), set `directory` to this folder's absolute path:

```js
const directory = 'F:/Users/FoxOS_User/Desktop/Deadlock-mods-collection/hp_colors_rewrite_v3/mocks';
const require = (await import('node:module')).createRequire(directory + '/verify-browser.js');
const module = { exports: {} };
new Function('require', 'module', await Bun.file(directory + '/verify-browser.js').text())(require, module);
for (const name of ['by-part', 'by-side']) {
  const tab = await browser.open({ name, url: 'file:///' + directory + '/' + name + '.html', app: { tern: false }, viewport: { width: 1440, height: 1000 } });
  display(await module.exports(tab));
}
```

## Design pass

Baseline audit (`screens/before-*.png`, 1440×1000): five identical green eyebrows/headings flattened the hierarchy; stacked rows (label, help, control, meta) showed only four settings per column; 38px controls and a 10px `#a4b19f` meta line were heavy yet low-contrast; the icon-only search button gave no label or pressed state; the preview bar was a 112px drawing in a 245px stage; edited values were never marked after a re-render.

Changes, grounded in `hp_colors_v2_menu.css` (shell, 82px header with gradient rule, 3px-accent rail buttons, card rows 394–435, 46×24 toggle 438–476, bordered segments 478–512, 34px entries 577–623):
- Rows are v2 cards: copy left, control right, 64px minimum, gold left edge plus gold meta while a value differs from its default. Slider rows stack only inside the two-column enemy/ally layout so the track keeps its length.
- Hierarchy: green is reserved for the current page, the kicker, open folds and focus; nav/preview eyebrows and counts are dim cream; group headings carry an enemy-green or ally-gold accent bar; the page title gets v2's gradient rule.
- Controls: native checkboxes draw as the v2 toggle (knob is a radial gradient, no pseudo-element), swatches/hex/number entries use v2 sizes, chrome buttons are uppercase; focus is a 2px green ring on every control, nav button and segment.
- Search: the toggle is icon + "Search" with a pressed state; the field is 44px with an inline magnifier and an "ESC closes" hint.
- Preview: 320px column, 280px stage with a labelled 1.3× zoom wrapper (bar sizing in JS is unchanged), segment buttons styled as v2 segments.
- Portability: CSS grid replaced by flex everywhere, px sizes, no transitions, no glow shadows (the shell keeps v2's own drop shadow). Browser-only pieces to rebuild in Panorama: `outline` focus rings, native `<details>`, `<select>`, `accent-color` range sliders, `:empty`, the `::before` silhouette head, `calc()` workspace height and the responsive media queries.

Rerun after the pass: both pages pass `verify-browser.js` with 0 console errors, 155 settings, and search counts red 10 / offset 24 / name 18. `screens/after-*.png` cover defaults, search, Units, a focused slider row with a changed value, and the two-column HP Text page.

## Deliberate limits

These are **approximate CSS drawings**, explicitly labeled in both pages. They are not the real renderer or evidence of Panorama/game fidelity. Non-obvious indicator/timer behavior, own HUD color, ability conditions, hero routing, durable storage, share codes and import/export are not simulated. Preset snapshots demonstrate placement and session editing only. The winning design still needs schema generation and a real-renderer preview in Panorama per PLAN D7. No game launch, build, deploy or benchmark was performed.
