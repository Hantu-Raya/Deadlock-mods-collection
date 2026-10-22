#!/usr/bin/env node
// Prototype (ticket 11): schema rows -> Panorama XML + CSS for the BAR page.
// Usage: node generate.js [outDir]   (default: ./out next to this file)
// Output is a pure function of mocks/settings.js: no dates, no random ids.
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HERE = __dirname;
const SETTINGS_PATH = path.join(HERE, '..', '..', 'mocks', 'settings.js');
const OUT = path.resolve(process.argv[2] || path.join(HERE, 'out'));
const PAGE = { part: 'Bar', name: 'BAR', key: 'Bar',
  description: 'Colors, feedback and geometry. Shared settings below affect both sides.' };
const NAV = ['Bar', 'HP Text', 'Name', 'Indicators', 'Units', 'Presets'];
// Display labels where the stored enum value is not the player-facing word.
const OPTION_LABELS = { barMask: { none: 'V1', original: 'V2', old: 'OLD' } };
const LAYOUT_FILE = 'panorama/layout/hp_colors_v3_menu_bar.xml';
const STYLE_FILE = 'panorama/styles/hp_colors_v3_menu.css';

function loadSettings() {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(SETTINGS_PATH, 'utf8'), sandbox, { filename: SETTINGS_PATH });
  const rows = sandbox.window.HP_MOCK_SETTINGS;
  if (!Array.isArray(rows)) throw new Error('settings.js did not define window.HP_MOCK_SETTINGS');
  return rows;
}

const pascal = text => String(text).replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : ''))
  .replace(/^./, c => c.toUpperCase());
const esc = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function formatDefault(row) {
  if (row.type === 'boolean') return row.default ? 'ON' : 'OFF';
  if (row.type === 'enum') return ((OPTION_LABELS[row.key] || {})[row.default] || String(row.default)).toUpperCase();
  if (row.type === 'number') return `${row.default}${row.unit ? ' ' + row.unit.toUpperCase() : ''} · ${row.min} to ${row.max}`;
  return String(row.default).toUpperCase();
}

function generate(settings) {
  const ids = [];
  const seen = new Set();
  const id = name => {
    if (!/^HPColors[A-Z][A-Za-z0-9]*$/.test(name)) throw new Error(`bad id ${name}`);
    if (seen.has(name)) throw new Error(`duplicate id ${name}`);
    seen.add(name); ids.push(name);
    return name;
  };
  const lines = [];
  const out = (depth, text) => lines.push('  '.repeat(depth) + text);

  function settingRow(d, row, stacked) {
    const k = 'HPColors' + pascal(row.key);
    const classes = ['HPC3Row', `HPC3Type${pascal(row.type)}`];
    if (stacked) classes.push('HPC3RowStacked');
    out(d, `<Panel id="${id(k + 'Row')}" class="${classes.join(' ')}">`);
    out(d + 1, '<Panel class="HPC3Copy">');
    out(d + 2, `<Label class="HPC3RowTitle" text="${esc(row.name)}" />`);
    if (row.help) out(d + 2, `<Label class="HPC3Help" text="${esc(row.help)}" />`);
    out(d + 2, `<Label id="${id(k + 'Default')}" class="HPC3Meta" text="${esc('DEFAULT ' + formatDefault(row))}" />`);
    out(d + 1, '</Panel>');
    if (row.type === 'boolean') {
      out(d + 1, `<Button id="${id(k + 'Toggle')}" class="HPC3Toggle${row.default ? ' Checked' : ''}"><Panel class="HPC3ToggleKnob" /></Button>`);
    } else if (row.type === 'enum') {
      out(d + 1, `<Panel id="${id(k + 'Segment')}" class="HPC3Segment">`);
      for (const option of row.options) {
        const label = ((OPTION_LABELS[row.key] || {})[option] || option).toUpperCase();
        out(d + 2, `<Button id="${id(k + 'Option' + pascal(option))}" class="HPC3SegmentButton${option === row.default ? ' Selected' : ''}"><Label text="${esc(label)}" /></Button>`);
      }
      out(d + 1, '</Panel>');
    } else if (row.type === 'color') {
      out(d + 1, `<Button id="${id(k + 'Swatch')}" class="HPC3Swatch" style="background-color: ${row.default};" />`);
      out(d + 1, `<TextEntry id="${id(k + 'Hex')}" class="HPC3Hex" text="${esc(row.default)}" maxchars="7" />`);
    } else if (row.type === 'number') {
      out(d + 1, '<Panel class="HPC3SliderGroup">');
      out(d + 2, `<Slider id="${id(k + 'Slider')}" class="HPC3Slider HorizontalSlider" direction="horizontal" />`);
      out(d + 2, `<TextEntry id="${id(k + 'Entry')}" class="HPC3NumberEntry" text="${esc(row.default)}" maxchars="8" />`);
      out(d + 2, `<Label class="HPC3Unit" text="${esc((row.unit || '').toUpperCase())}" />`);
      out(d + 1, '</Panel>');
    } else {
      throw new Error(`unsupported type ${row.type} for ${row.key}`);
    }
    out(d, '</Panel>');
  }

  function fold(d, prefix, label, rows, open, stacked) {
    if (!rows.length) return;
    out(d, `<Panel id="${id(prefix + 'Fold')}" class="HPC3Fold${open ? ' Open' : ''}">`);
    out(d + 1, `<Button id="${id(prefix + 'FoldToggle')}" class="HPC3FoldToggle">`);
    out(d + 2, '<Panel class="HPC3FoldChevron" />');
    out(d + 2, `<Label class="HPC3FoldLabel" text="${label} · ${rows.length}" />`);
    out(d + 1, '</Button>');
    out(d + 1, `<Panel id="${id(prefix + 'FoldBody')}" class="HPC3FoldBody">`);
    rows.forEach(row => settingRow(d + 2, row, stacked));
    out(d + 1, '</Panel>');
    out(d, '</Panel>');
  }

  function group(d, groupKey, title, rows, accent, stacked) {
    const prefix = `HPColorsPage${PAGE.key}${groupKey}`;
    out(d, `<Panel id="${id(prefix + 'Column')}" class="HPC3Column ${accent}">`);
    out(d + 1, '<Panel class="HPC3ColumnHeading">');
    out(d + 2, `<Label class="HPC3ColumnTitle" text="${esc(title)}" />`);
    out(d + 2, `<Label class="HPC3ColumnCount" text="${rows.length}" />`);
    out(d + 1, '</Panel>');
    fold(d + 1, prefix + 'Basic', 'BASIC', rows.filter(r => !r.advanced), true, stacked);
    fold(d + 1, prefix + 'Advanced', 'ADVANCED', rows.filter(r => r.advanced), false, stacked);
    out(d, '</Panel>');
  }

  const pageRows = settings.filter(row => row.part === PAGE.part);
  const bySide = side => pageRows.filter(row => row.side === side);
  for (const row of pageRows) if (!['enemy', 'ally', 'shared'].includes(row.side)) throw new Error(`bad side ${row.key}`);

  lines.push('<?xml version="1.0" encoding="utf-8"?>');
  lines.push('<!-- GENERATED by hp_colors_rewrite_v3/prototypes/menu-gen/generate.js from mocks/settings.js. Do not edit. -->');
  out(0, '<root>');
  out(1, '<styles>');
  out(2, '<include src="s2r://panorama/styles/hp_colors_v3_menu.vcss_c" />');
  out(1, '</styles>');
  // The compiler rejects an id on the layout's root panel, so the id-less wrapper stands in for
  // the CitadelHudEscapeMenu parent that the fragment is injected into in the real build.
  out(1, '<Panel class="HPC3Layout" hittest="false">');
  out(1, `<Panel id="${id('HPColorsEditorRoot')}" class="HPC3Root" hittest="true">`);
  out(2, '<Panel class="HPC3Backdrop" hittest="false" />');
  out(2, `<Panel id="${id('HPColorsEditorShell')}" class="HPC3Shell">`);
  // Header: title, gradient rule (yields to the field when search is open), search field, search toggle.
  out(3, '<Panel class="HPC3Header">');
  out(4, '<Panel class="HPC3TitleBlock">');
  out(5, '<Label class="HPC3Eyebrow" text="DEADLOCK / HEALTHBARS" />');
  out(5, '<Panel class="HPC3TitleRow"><Label class="HPC3Title" text="HP COLORS" /><Label class="HPC3TitleVersion" text="V3" /></Panel>');
  out(4, '</Panel>');
  out(4, '<Panel class="HPC3HeaderRule" />');
  out(4, `<Panel id="${id('HPColorsSearchBox')}" class="HPC3SearchBox">`);
  out(5, '<Image class="HPC3SearchFieldIcon" src="s2r://panorama/images/control_icons/24px/search.vsvg" texturewidth="48px" textureheight="48px" scaling="stretch-to-fit-preserve-aspect" hittest="false" />');
  out(5, `<TextEntry id="${id('HPColorsSearchField')}" class="HPC3SearchField" placeholder="Try red, offset, name" maxchars="40" />`);
  out(5, '<Label class="HPC3SearchHint" text="ESC CLOSES" />');
  out(4, '</Panel>');
  out(4, `<Button id="${id('HPColorsSearchToggle')}" class="HPC3SearchToggle">`);
  out(5, '<Image class="HPC3SearchToggleIcon" src="s2r://panorama/images/control_icons/24px/search.vsvg" texturewidth="48px" textureheight="48px" scaling="stretch-to-fit-preserve-aspect" hittest="false" />');
  out(5, '<Label class="HPC3SearchToggleLabel" text="SEARCH" />');
  out(4, '</Button>');
  out(3, '</Panel>');
  out(3, '<Panel class="HPC3Body">');
  // Page rail (static chrome; only BAR's content is generated in this prototype).
  out(4, '<Panel class="HPC3Rail">');
  out(5, '<Label class="HPC3RailEyebrow" text="BY PART OF THE BAR" />');
  NAV.forEach((name, index) => {
    out(5, `<Button id="${id('HPColorsNav' + pascal(name) + 'Button')}" class="HPC3NavButton${name === PAGE.part ? ' Selected' : ''}">`);
    out(6, `<Label class="HPC3NavIndex" text="0${index + 1}" />`);
    out(6, `<Label class="HPC3NavLabel" text="${esc(name.toUpperCase())}" />`);
    out(5, '</Button>');
  });
  out(4, '</Panel>');
  // Page content.
  out(4, '<Panel class="HPC3Content">');
  out(5, '<Panel class="HPC3PageHead">');
  out(6, `<Label id="${id('HPColorsPageKicker')}" class="HPC3Kicker" text="ORGANIZED BY PART" />`);
  out(6, `<Label id="${id('HPColorsPageTitle')}" class="HPC3PageTitle" text="${PAGE.name}" />`);
  out(6, '<Panel class="HPC3PageRule" />');
  out(6, `<Label id="${id('HPColorsPageDescription')}" class="HPC3PageDescription" text="${esc(PAGE.description)}" />`);
  out(5, '</Panel>');
  out(5, `<Panel id="${id('HPColorsSettingsList')}" class="HPC3SettingsList">`);
  out(6, `<Panel id="${id('HPColorsPage' + PAGE.key)}" class="HPC3Page Active">`);
  out(7, '<Panel class="HPC3SideColumns">');
  group(8, 'Enemy', 'ENEMY', bySide('enemy'), 'HPC3Enemy', true);
  group(8, 'Ally', 'ALLY', bySide('ally'), 'HPC3Ally', true);
  out(7, '</Panel>');
  group(7, 'Shared', 'SHARED · BOTH SIDES', bySide('shared'), 'HPC3Shared', false);
  out(6, '</Panel>');
  out(6, `<Label id="${id('HPColorsSearchEmpty')}" class="HPC3SearchEmpty" text="No matching settings. Try red, offset or name." />`);
  out(5, '</Panel>');
  out(4, '</Panel>');
  // Preview: the slot is filled at runtime by the real renderer on a fake bar tree (PLAN D7, ticket 10).
  out(4, `<Panel id="${id('HPColorsPreview')}" class="HPC3Preview">`);
  out(5, '<Label class="HPC3Kicker HPC3Dim" text="PREVIEW" />');
  out(5, `<Label id="${id('HPColorsPreviewTitle')}" class="HPC3PreviewTitle" text="HERO · ENEMY" />`);
  out(5, `<Panel id="${id('HPColorsPreviewSideSegment')}" class="HPC3Segment HPC3SegmentWide">`);
  out(6, `<Button id="${id('HPColorsPreviewSideOptionEnemy')}" class="HPC3SegmentButton Selected"><Label text="ENEMY" /></Button>`);
  out(6, `<Button id="${id('HPColorsPreviewSideOptionAlly')}" class="HPC3SegmentButton"><Label text="ALLY" /></Button>`);
  out(5, '</Panel>');
  out(5, `<Panel id="${id('HPColorsPreviewStage')}" class="HPC3PreviewStage">`);
  out(6, `<Panel id="${id('HPColorsPreviewSlot')}" class="HPC3PreviewSlot" hittest="false" />`);
  out(5, '</Panel>');
  out(5, '<Panel class="HPC3PreviewHealthHead">');
  out(6, '<Label class="HPC3Kicker HPC3Dim HPC3Grow" text="HEALTH" />');
  out(6, `<Label id="${id('HPColorsPreviewHealthValue')}" class="HPC3PreviewHealthValue" text="75%" />`);
  out(5, '</Panel>');
  out(5, `<Slider id="${id('HPColorsPreviewHealthSlider')}" class="HPC3Slider HPC3PreviewHealthSlider HorizontalSlider" direction="horizontal" />`);
  out(5, `<Button id="${id('HPColorsPreviewPlay')}" class="HPC3PlayButton"><Label id="${id('HPColorsPreviewPlayLabel')}" text="PLAY DAMAGE / HEAL" /></Button>`);
  out(5, `<Label id="${id('HPColorsPreviewStatus')}" class="HPC3PreviewStatus" text="Ready" />`);
  out(4, '</Panel>');
  out(3, '</Panel>');
  out(2, '</Panel>');
  out(1, '</Panel>');
  out(1, '</Panel>');
  out(0, '</root>');

  return {
    xml: lines.join('\n') + '\n',
    ids: { generatedBy: 'prototypes/menu-gen/generate.js', page: PAGE.name, layout: LAYOUT_FILE,
      settings: pageRows.map(row => row.key), count: ids.length, ids },
  };
}

// Panorama CSS. Rules: opacity-only transitions, no glow box-shadows, no clip-path,
// visibility: collapse for hiding, px sizes, flow-children instead of grid.
const CREAM = '#ffefd7', GREEN = '#5fe69e', GOLD = '#e7c77d';
const CSS = `/* GENERATED by hp_colors_rewrite_v3/prototypes/menu-gen/generate.js. Do not edit. */
/* Palette and metrics follow hp_colors_rewrite_v2/panorama/styles/hp_colors_v2_menu.css. */

.HPC3Layout, .HPC3Root { width: 100%; height: 100%; }
.HPC3Backdrop { width: 100%; height: 100%; background-color: #080a08d9; }

.HPC3Shell {
  width: 1560px; height: 900px; horizontal-align: center; vertical-align: center; flow-children: down;
  background-color: gradient(linear, 0% 0%, 100% 100%, from(#20241d), color-stop(0.55, #151914), to(#0d100c));
  border: 1px solid ${CREAM}1f;
  box-shadow: #00000099 0px 18px 42px 0px;
}

/* Header */
.HPC3Header {
  width: 100%; height: 82px; flow-children: right; padding: 0px 24px 0px 28px;
  background-color: gradient(linear, 0% 0%, 100% 0%, from(#10130df5), color-stop(0.72, #1c211af2), to(#10130df5));
  border-bottom: 1px solid ${CREAM}14;
}
.HPC3TitleBlock { vertical-align: center; flow-children: down; }
.HPC3Eyebrow { font-family: oracle; font-size: 11px; font-weight: semi-bold; color: ${CREAM}66; letter-spacing: 2px; margin-bottom: 4px; }
.HPC3TitleRow { flow-children: right; }
.HPC3Title { font-family: block; font-size: 34px; font-weight: bold; color: ${CREAM}; letter-spacing: 1px; }
.HPC3TitleVersion { vertical-align: bottom; margin-left: 8px; margin-bottom: 4px; font-family: block; font-size: 16px; color: ${GREEN}; }
.HPC3HeaderRule {
  width: fill-parent-flow(1); height: 1px; margin-left: 26px; margin-right: 22px; vertical-align: center;
  background-color: gradient(linear, 0% 0%, 100% 0%, from(${GREEN}66), to(${CREAM}0d));
}
.HPC3SearchBox { width: fill-parent-flow(1); height: 44px; margin-left: 26px; margin-right: 14px; vertical-align: center; flow-children: right; visibility: collapse; background-color: #090b09cc; border: 1px solid ${CREAM}24; }
.HPC3SearchFieldIcon { width: 18px; height: 18px; margin-left: 14px; vertical-align: center; wash-color: ${GREEN}; }
.HPC3SearchField { width: fill-parent-flow(1); height: 100%; padding: 0px 10px; vertical-align: center; background-color: #00000000; border: 0px solid #00000000; font-family: oracle; font-size: 16px; color: ${CREAM}; }
.HPC3SearchHint { margin-right: 14px; vertical-align: center; font-family: oracle; font-size: 11px; color: ${CREAM}66; letter-spacing: 1px; }
.HPC3SearchToggle { height: 36px; padding: 0px 14px; vertical-align: center; flow-children: right; background-color: #090b09cc; border: 1px solid ${CREAM}24; }
.HPC3SearchToggleIcon { width: 16px; height: 16px; vertical-align: center; wash-color: ${CREAM}; }
.HPC3SearchToggleLabel { margin-left: 8px; vertical-align: center; font-family: oracle; font-size: 13px; font-weight: bold; color: ${CREAM}; letter-spacing: 1px; }
.HPC3SearchToggle:hover, .HPC3SearchToggle:focus { border: 1px solid ${GREEN}88; background-color: ${GREEN}0d; }
.HPC3Root.SearchOpen .HPC3HeaderRule { visibility: collapse; }
.HPC3Root.SearchOpen .HPC3SearchBox { visibility: visible; }
.HPC3Root.SearchOpen .HPC3SearchToggle { border: 1px solid ${GREEN}; background-color: ${GREEN}1f; }
.HPC3Root.SearchOpen .HPC3SearchToggleLabel, .HPC3SearchToggle:hover .HPC3SearchToggleLabel { color: ${GREEN}; }

/* Body: rail | content | preview */
.HPC3Body { width: 100%; height: fill-parent-flow(1); flow-children: right; }
.HPC3Rail {
  width: 210px; height: 100%; padding: 24px 12px 18px 12px; flow-children: down;
  background-color: gradient(linear, 0% 0%, 100% 0%, from(#11140ff5), to(#191d17eb));
  border-right: 1px solid ${CREAM}14;
}
.HPC3RailEyebrow { margin-left: 14px; margin-bottom: 16px; font-family: oracle; font-size: 11px; font-weight: semi-bold; color: ${CREAM}66; letter-spacing: 2px; }
.HPC3NavButton { width: 100%; height: 48px; margin-bottom: 4px; padding: 0px 12px; flow-children: right; border-left: 3px solid ${GREEN}00; }
.HPC3NavButton:hover, .HPC3NavButton:focus { background-color: gradient(linear, 0% 0%, 100% 0%, from(${GREEN}14), to(${GREEN}00)); }
.HPC3NavButton.Selected { border-left: 3px solid ${GREEN}; background-color: gradient(linear, 0% 0%, 100% 0%, from(${GREEN}26), to(${GREEN}05)); }
.HPC3NavIndex { width: 30px; vertical-align: center; font-family: oracle; font-size: 12px; color: ${CREAM}55; letter-spacing: 1px; }
.HPC3NavLabel { vertical-align: center; font-family: oracle; font-size: 16px; font-weight: bold; color: ${CREAM}99; letter-spacing: 1px; }
.HPC3NavButton.Selected .HPC3NavIndex { color: ${GREEN}; }
.HPC3NavButton.Selected .HPC3NavLabel, .HPC3NavButton:hover .HPC3NavLabel { color: ${CREAM}; }

.HPC3Content { width: fill-parent-flow(1); height: 100%; padding: 26px 30px 0px 30px; flow-children: down; background-color: #11140fd9; }
.HPC3PageHead { width: 100%; flow-children: down; margin-bottom: 16px; }
.HPC3Kicker { font-family: oracle; font-size: 12px; font-weight: semi-bold; color: ${GREEN}; letter-spacing: 2px; }
.HPC3Dim { color: ${CREAM}66; }
.HPC3PageTitle { margin-top: 4px; font-family: block; font-size: 30px; font-weight: bold; color: ${CREAM}; letter-spacing: 1px; }
.HPC3PageRule { width: 100%; height: 1px; margin-top: 12px; margin-bottom: 12px; background-color: gradient(linear, 0% 0%, 100% 0%, from(${GREEN}77), color-stop(0.35, ${CREAM}1f), to(${CREAM}00)); }
.HPC3PageDescription { width: 100%; font-family: sans; font-size: 15px; color: ${CREAM}99; }
/* Bottom gap lives inside the scroll content so the last row can scroll into view (v2 lesson). */
.HPC3SettingsList { width: 100%; height: fill-parent-flow(1); overflow: squish scroll; flow-children: down; }
.HPC3Page { width: 100%; padding-bottom: 24px; flow-children: down; visibility: collapse; }
.HPC3Page.Active { visibility: visible; }

/* Columns */
.HPC3SideColumns { width: 100%; flow-children: right; margin-bottom: 22px; }
.HPC3Column { flow-children: down; }
.HPC3SideColumns .HPC3Column { width: fill-parent-flow(1); }
.HPC3SideColumns .HPC3Enemy { margin-right: 20px; }
.HPC3Shared { width: 100%; }
.HPC3ColumnHeading { width: 100%; flow-children: right; margin-bottom: 8px; padding: 4px 0px 4px 12px; border-left: 3px solid ${CREAM}66; }
.HPC3Enemy .HPC3ColumnHeading { border-left: 3px solid ${GREEN}; }
.HPC3Ally .HPC3ColumnHeading { border-left: 3px solid ${GOLD}; }
.HPC3ColumnTitle { font-family: oracle; font-size: 13px; font-weight: bold; color: ${CREAM}; letter-spacing: 2px; }
.HPC3ColumnCount { margin-left: 10px; font-family: oracle; font-size: 12px; color: ${CREAM}66; letter-spacing: 1px; }

/* Folds (Panorama has no <details>: Button header + body collapsed unless .Open) */
.HPC3Fold { width: 100%; flow-children: down; margin-bottom: 6px; }
.HPC3FoldToggle { width: 100%; height: 30px; padding-left: 4px; flow-children: right; }
.HPC3FoldChevron { width: 7px; height: 7px; margin-right: 10px; vertical-align: center; border-right: 2px solid ${CREAM}99; border-bottom: 2px solid ${CREAM}99; transform: rotateZ(-45deg); }
.HPC3FoldLabel { vertical-align: center; font-family: oracle; font-size: 11px; font-weight: bold; color: ${CREAM}99; letter-spacing: 2px; }
.HPC3FoldToggle:hover .HPC3FoldLabel, .HPC3FoldToggle:focus .HPC3FoldLabel { color: ${CREAM}; }
.HPC3Fold.Open .HPC3FoldChevron { transform: rotateZ(45deg); border-right: 2px solid ${GREEN}; border-bottom: 2px solid ${GREEN}; }
.HPC3Fold.Open .HPC3FoldLabel { color: ${GREEN}; }
.HPC3FoldBody { width: 100%; flow-children: down; visibility: collapse; }
.HPC3Fold.Open .HPC3FoldBody { visibility: visible; }

/* Search mode: all generated pages show, folds are bypassed, non-matching rows collapse. */
.HPC3Root.Searching .HPC3Page { visibility: visible; }
.HPC3Root.Searching .HPC3FoldToggle { visibility: collapse; }
.HPC3Root.Searching .HPC3FoldBody { visibility: visible; }
.HPC3Root.Searching .HPC3Row.SearchMiss { visibility: collapse; }
.HPC3SearchEmpty { margin-top: 12px; font-family: sans; font-size: 14px; color: ${CREAM}66; visibility: collapse; }
.HPC3Root.Searching.NoResults .HPC3SearchEmpty { visibility: visible; }

/* Setting rows (v2 cards: copy left, control right; gold edge while changed) */
.HPC3Row {
  width: 100%; min-height: 64px; padding: 12px 16px; margin-bottom: 5px; flow-children: right;
  background-color: gradient(linear, 0% 0%, 100% 0%, from(${CREAM}0a), to(${CREAM}03));
  border-left: 2px solid ${CREAM}14; border-top: 1px solid ${CREAM}0a; border-right: 1px solid ${CREAM}06; border-bottom: 1px solid ${CREAM}06;
}
.HPC3Row:hover { border-left: 2px solid ${GREEN}66; }
.HPC3Row.Changed { border-left: 2px solid ${GOLD}; }
.HPC3Row.Disabled { opacity: 0.35; }
.HPC3RowStacked.HPC3TypeNumber { flow-children: down; }
.HPC3Copy { width: fill-parent-flow(1); vertical-align: center; flow-children: down; }
.HPC3RowStacked.HPC3TypeNumber .HPC3Copy { width: 100%; }
.HPC3RowTitle { font-family: oracle; font-size: 15px; font-weight: bold; color: ${CREAM}dd; letter-spacing: 1px; }
.HPC3Help { width: 100%; margin-top: 4px; font-family: sans; font-size: 14px; color: ${CREAM}99; }
.HPC3Meta { margin-top: 4px; font-family: oracle; font-size: 11px; color: ${CREAM}66; letter-spacing: 1px; }
.HPC3Row.Changed .HPC3Meta { color: ${GOLD}; }

/* Toggle (v2 46x24 track + knob; state is the .Checked class) */
.HPC3Toggle { width: 46px; height: 24px; margin-left: 16px; vertical-align: center; background-color: #292e2e; border: 1px solid ${CREAM}2b; border-radius: 12px; }
.HPC3ToggleKnob { width: 18px; height: 18px; margin-left: 2px; vertical-align: center; background-color: ${CREAM}99; border-radius: 50%; }
.HPC3Toggle.Checked { background-color: ${GREEN}; border: 1px solid ${GREEN}; }
.HPC3Toggle.Checked .HPC3ToggleKnob { transform: translateX(21px); background-color: #10130d; }
.HPC3Toggle:hover, .HPC3Toggle:focus { brightness: 1.3; }
.HPC3Toggle:focus { border: 2px solid ${GREEN}; }

/* Segments (enum choices; replaces the mock's <select>) */
.HPC3Segment { height: 36px; margin-left: 16px; vertical-align: center; flow-children: right; border: 1px solid ${CREAM}1f; }
.HPC3SegmentButton { min-width: 64px; height: 34px; padding: 0px 12px; background-color: #10130d99; border-bottom: 2px solid ${GREEN}00; }
.HPC3SegmentButton Label { horizontal-align: center; vertical-align: center; font-family: oracle; font-size: 13px; font-weight: bold; color: ${CREAM}77; letter-spacing: 1px; }
.HPC3SegmentButton.Selected { background-color: ${GREEN}1f; border-bottom: 2px solid ${GREEN}; }
.HPC3SegmentButton.Selected Label, .HPC3SegmentButton:hover Label, .HPC3SegmentButton:focus Label { color: ${CREAM}; }
.HPC3SegmentWide { width: 100%; margin-left: 0px; margin-top: 12px; }
.HPC3SegmentWide .HPC3SegmentButton { width: fill-parent-flow(1); }

/* Color swatch + hex (swatch opens the stock CitadelColorPicker popup at runtime) */
.HPC3Swatch { width: 40px; height: 34px; margin-left: 16px; vertical-align: center; border: 2px solid ${CREAM}44; }
.HPC3Swatch:hover, .HPC3Swatch:focus { border: 2px solid ${GREEN}; }
.HPC3Hex, .HPC3NumberEntry { height: 34px; vertical-align: center; padding: 5px 8px; background-color: #090b09cc; border: 1px solid ${CREAM}24; font-family: oracle; font-size: 15px; color: ${CREAM}; }
.HPC3Hex { width: 96px; margin-left: 10px; }
.HPC3Hex:focus, .HPC3NumberEntry:focus { border: 1px solid ${GREEN}; }

/* Slider + number entry + unit */
.HPC3SliderGroup { width: 340px; height: 38px; margin-left: 16px; vertical-align: center; flow-children: right; }
.HPC3RowStacked .HPC3SliderGroup { width: 100%; margin-left: 0px; margin-top: 10px; }
.HPC3Slider { width: fill-parent-flow(1); height: 14px; vertical-align: center; overflow: noclip; }
.HPC3Slider.HorizontalSlider #SliderTrack { width: 100%; height: 4px; vertical-align: center; background-color: #23282a; border-radius: 2px; }
.HPC3Slider.HorizontalSlider #SliderTrackProgress { height: 4px; vertical-align: center; background-color: gradient(linear, 0% 0%, 100% 0%, from(#355c46), to(${GREEN})); border-radius: 2px; }
.HPC3Slider.HorizontalSlider #SliderThumb { width: 12px; height: 12px; vertical-align: center; background-color: #f2f5f5; border: 1px solid ${GREEN}; border-radius: 50%; }
.HPC3Slider.HorizontalSlider:active #SliderThumb { background-color: ${GREEN}; }
.HPC3NumberEntry { width: 64px; margin-left: 10px; text-align: center; }
.HPC3Unit { width: 26px; margin-left: 6px; vertical-align: center; font-family: oracle; font-size: 13px; color: ${CREAM}66; }

/* Preview column */
.HPC3Preview { width: 330px; height: 100%; padding: 26px 22px 18px 22px; flow-children: down; border-left: 1px solid ${CREAM}14; background-color: #10130de6; }
.HPC3PreviewTitle { margin-top: 4px; font-family: block; font-size: 26px; font-weight: bold; color: ${CREAM}; letter-spacing: 1px; }
.HPC3PreviewStage {
  width: 100%; height: 300px; margin-top: 14px;
  background-color: gradient(linear, 0% 0%, 0% 100%, from(#1b2019), to(#0b0d0b));
  border: 1px solid ${CREAM}1f;
}
/* Unit-status canvas is ~200x210 CSS px; the real renderer paints into this slot. */
.HPC3PreviewSlot { width: 200px; height: 210px; horizontal-align: center; vertical-align: center; overflow: noclip; }
.HPC3PreviewHealthHead { width: 100%; margin-top: 18px; flow-children: right; }
.HPC3Grow { width: fill-parent-flow(1); }
.HPC3PreviewHealthValue { font-family: oracle; font-size: 13px; font-weight: bold; color: ${CREAM}; }
.HPC3PreviewHealthSlider { width: 100%; margin-top: 8px; }
.HPC3PlayButton { width: 100%; height: 40px; margin-top: 16px; background-color: ${GREEN}12; border: 1px solid ${GREEN}88; }
.HPC3PlayButton Label { horizontal-align: center; vertical-align: center; font-family: oracle; font-size: 13px; font-weight: bold; color: ${GREEN}; letter-spacing: 1px; }
.HPC3PlayButton:hover, .HPC3PlayButton:focus { background-color: ${GREEN}26; border: 1px solid ${GREEN}; }
.HPC3PreviewStatus { margin-top: 10px; font-family: sans; font-size: 13px; color: ${GREEN}; }
`;

function main() {
  const { xml, ids } = generate(loadSettings());
  // Every id written into the XML must be in ids.json, and vice versa.
  const xmlIds = [...xml.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  if (xmlIds.join('\n') !== ids.ids.join('\n')) throw new Error('ids.json does not match XML ids');
  const files = { [LAYOUT_FILE]: xml, [STYLE_FILE]: CSS, 'ids.json': JSON.stringify(ids, null, 2) + '\n' };
  for (const [rel, text] of Object.entries(files)) {
    const target = path.join(OUT, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text.replace(/\r\n/g, '\n'), 'utf8');
  }
  console.log(`menu-gen: ${ids.settings.length} settings, ${ids.count} ids -> ${path.relative(process.cwd(), OUT) || '.'}`);
}

if (require.main === module) main();
module.exports = { generate, loadSettings, CSS };
