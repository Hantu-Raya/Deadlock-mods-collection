'use strict';
// Ticket 08: settings table -> static by-part ESC menu (Panorama XML) plus the runtime menu contract.
// Pure function of its inputs: no dates, no random ids. Panels use tabs to match the stock layout.
// `lead` names a page's ungrouped rows in the sub-nav and card head, so no sub-header repeats the page title.
// A page with a single group (Units) has no sub-header at all: no sub-nav entry and no card title.
// Ticket 36: NEW is the first tab, like the game's Settings NEW section, but the menu opens on START.
const PAGES = [
  { name: 'New', title: 'NEW', description: 'New and changed features from recent updates. Each leaves after 30 days, or when you dismiss it.' },
  { name: 'Bar', title: 'BAR', lead: 'General', description: 'Healthbar colors, damage feedback, size and outline, and your own health bar. Choose Enemy or Ally; shared settings apply to both.' },
  { name: 'HP Text', title: 'HP TEXT', lead: 'Number and font', description: 'The health number on the bar: color, size, font and position.' },
  { name: 'Name', title: 'NAME', lead: 'Name and color', description: 'Hero names above the bar: color, size and position.' },
  { name: 'Indicators', title: 'INDICATORS', description: 'Health lines, kill marker, stamina, low HP pulse and the CRITICAL, ASSASSINATE and UNKILLABLE labels.' },
  // Ticket 37: icons attached to the bar moved off INDICATORS so neither page lists more than seven groups.
  { name: 'Icons', title: 'ICONS', description: 'Level and ultimate badges, pickup icons and timers, and the rejuvenator icon.' },
  { name: 'Units', title: 'UNITS', description: 'Bars for NPCs, neutrals and objectives.' },
  { name: 'Presets', title: 'PRESETS', description: 'Save a look, manage your library and share settings or preset bundles.' },
];
const START = 'Bar';
const NEW_ICON = 's2r://panorama/images/icons/notification_alert.vsvg';
const UPDATED_ICON = 's2r://panorama/images/icons/icon_refresh.vsvg';
const LEVELS = [{ level: 'basic', title: 'BASIC', open: true }, { level: 'advanced', title: 'ADVANCED', open: false }];
const COLUMNS = [{ side: 'enemy', title: 'ENEMY', className: 'HPC3Enemy' }, { side: 'ally', title: 'ALLY', className: 'HPC3Ally' }];
// Up to this many options draw as segments (v2's live-proven control); longer enums use a DropDown.
const SEGMENT_MAX = 4;
const SEARCH_ICON = 's2r://panorama/images/control_icons/24px/search.vsvg';
const toggleHandles = '<Panel class="HPC3ToggleOff" hittest="false" /><Panel class="HPC3ToggleOn" hittest="false" />';
const resetIcon = '<Image src="s2r://panorama/images/icons/reset.vsvg" texturewidth="20px" textureheight="20px" scaling="stretch-to-fit-preserve-aspect" hittest="false" />';
const changedStar = '<Image class="HPC3ChangedStar" src="s2r://panorama/images/icons/icon_star_white.vsvg" texturewidth="20px" textureheight="20px" scaling="stretch-to-fit-preserve-aspect" hittest="false" />';
const glyphs = {
  APPLY: 'icons/icon_checkmark.vsvg', RENAME: 'main_menu/icons/menu_edit.vsvg',
  UP: 'control_icons/arrow_solid_up_png.vtex', DOWN: 'control_icons/arrow_solid_down_png.vtex',
  COPY: 'icons/icon_copy.vsvg', DELETE: 'icons/delete_trash.vsvg', HIDE: 'icons/icon_eye_disabled.vsvg',
  HEROES: 'main_menu/icons/menu_heroes.vsvg', DEFAULT: 'icons/icon_star_white.vsvg',
  IMPORT: 'icons/icon_copy_paste.vsvg', 'RESTORE DEFAULT': 'icons/reset.vsvg', 'SAVE NEW': 'icons/icon_add.vsvg',
};
const image = (path, className) => `<Image class="${className}" src="s2r://panorama/images/${path}" scaling="stretch-to-fit-preserve-aspect" hittest="false" />`;

const pascal = text => String(text).replace(/[^A-Za-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : '')).replace(/^./, c => c.toUpperCase());
const esc = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');


// rows: validated schema rows; sidesOf(row) -> ['enemy','ally'] | ['enemy'] | ['shared'];
// reserved: stock layout ids the generated ids must not collide with.
// news: validated settings/news.json items; each targets setting rows (key, optional side) or a page.
function buildMenu(rows, sidesOf, reserved, release, news = []) {
  const ids = [];
  const id = value => {
    if (!/^HPColors[A-Z][A-Za-z0-9]*$/.test(value)) throw new Error('Invalid generated id: ' + value);
    if (ids.includes(value) || reserved.has(value)) throw new Error('Duplicate generated id: ' + value);
    ids.push(value); return value;
  };
  const lines = [];
  const out = (depth, text) => lines.push('\t'.repeat(depth) + text);
  const controls = [];
  const search = [];
  const containers = [];
  const folds = [];
  const pages = [];
  const groups = [];

  const menuButton = id('HPColorsMenuButton');
  const instances = [];
  for (const row of rows) for (const side of sidesOf(row)) instances.push({ row, side, value: side === 'shared' || row.side !== 'side-aware' ? row.default : row.default[side] });
  const rowIdOf = (key, side) => 'HPColors' + pascal(key) + (side === 'shared' ? '' : pascal(side)) + 'Row';
  const newsItems = news.map(item => {
    const rowIds = item.targets.flatMap(target => {
      const row = rows.find(entry => entry.key === target.key);
      return (target.side ? [target.side] : sidesOf(row)).map(side => rowIdOf(row.key, side));
    });
    return { id: item.id, badge: item.badge, release: item.release, date: Date.parse(item.date + 'T00:00:00Z'), title: item.title, description: item.description,
      page: item.page || rows.find(entry => entry.key === item.targets[0].key).page, rowIds, targets: item.targets.map(target => target.key) };
  });
  const newRows = new Set(newsItems.flatMap(item => item.rowIds));

  function settingRow(depth, item) {
    const { row, side, value } = item;
    const prefix = 'HPColors' + pascal(row.key) + (side === 'shared' ? '' : pascal(side));
    const rowId = id(prefix + 'Row');
    out(depth, `<Panel id="${rowId}" class="HPC3Row HPC3Type${pascal(row.type)}">`);
    out(depth + 1, '<Panel class="HPC3RowBg" hittest="false" />');
    out(depth + 1, '<Panel class="HPC3RowRule" hittest="false" />');
    // Only rows a NEW item targets carry its mark and an opacity-only flash layer.
    if (newRows.has(rowId)) {
      out(depth + 1, '<Panel class="HPC3RowNewFlash" hittest="false" />');
      out(depth + 1, `<Image class="HPC3NewMark" src="${NEW_ICON}" texturewidth="14px" textureheight="14px" scaling="stretch-to-fit-preserve-aspect" hittest="false" />`);
    }
    out(depth + 1, `<Label class="HPC3RowTitle" text="${esc(row.name)}" hittest="false" />`);
    const control = { id: '', key: row.key, name: row.name, help: row.help, side, type: row.type, bounds: row.bounds, step: row.step, unit: row.unit,
      default: value, rowId, page: row.page, level: row.level, group: row.group || '' };
    const kind = row.type === 'enum' && row.options.length > SEGMENT_MAX ? 'dropdown' : row.type;
    out(depth + 1, `<Panel class="HPC3RowControls HPC3Controls${pascal(kind)}">`);
    if (row.type === 'boolean') {
      control.id = control.toggleId = id(prefix + 'Toggle');
      out(depth + 2, `<Button id="${control.toggleId}" class="HPC3Toggle${value ? ' Checked' : ''}">${toggleHandles}</Button>`);
    } else if (row.type === 'enum') {
      control.kind = row.options.length <= SEGMENT_MAX ? 'segment' : 'dropdown';
      control.id = id(prefix + (control.kind === 'segment' ? 'Segment' : 'Select'));
      control.options = row.options.map(option => ({ value: option.value, label: option.label, id: id(prefix + 'Option' + pascal(option.value)) }));
      if (control.kind === 'segment') {
        out(depth + 2, `<Panel id="${control.id}" class="HPC3Segment">`);
        for (const option of control.options) out(depth + 3, `<Button id="${option.id}" class="HPC3SegmentButton${option.value === value ? ' Selected' : ''}"><Panel class="HPC3RadioBox" hittest="false" /><Label text="${esc(option.label)}" hittest="false" /></Button>`);
        out(depth + 2, '</Panel>');
      } else {
        out(depth + 2, '<Panel class="DropDownNew HPC3DropDown">');
        out(depth + 3, '<Panel class="Border" hittest="false" />');
        out(depth + 3, '<Panel class="Background" hittest="false" />');
        out(depth + 3, `<DropDown id="${control.id}" class="DropDownContent HPC3Select">`);
        for (const option of control.options) out(depth + 4, `<Label id="${option.id}" text="${esc(option.label)}" />`);
        out(depth + 3, '</DropDown>');
        out(depth + 3, '<Panel class="Arrow" hittest="false" />');
        out(depth + 2, '</Panel>');
      }
    } else if (row.type === 'color') {
      control.hueId = id(prefix + 'HueSlider');
      control.swatchId = prefix + 'Swatch';
      control.id = control.hexId = prefix + 'Hex';
      out(depth + 2, '<Panel class="HPC3ColorGroup">');
      out(depth + 3, `<Slider id="${control.hueId}" class="HPC3HueSlider HorizontalSlider" direction="horizontal" />`);
      out(depth + 3, `<Button id="${id(control.swatchId)}" class="HPC3Swatch" style="background-color: ${value};" />`);
      out(depth + 3, `<Panel class="HPC3EntryBox"><TextEntry id="${id(control.hexId)}" class="HPC3Hex" text="${esc(value)}" maxchars="7" /></Panel>`);
      out(depth + 2, '</Panel>');
    } else {
      control.sliderId = id(prefix + 'Slider');
      control.id = control.entryId = id(prefix + 'Entry');
      out(depth + 2, '<Panel class="HPC3SliderGroup">');
      const notch = ((value - row.bounds[0]) / (row.bounds[1] - row.bounds[0]) * 100).toFixed(4);
      out(depth + 3, `<Slider id="${control.sliderId}" class="HPC3Slider HorizontalSlider" direction="horizontal"><Panel class="HPC3DefaultNotch" style="margin-left: ${notch}%;" hittest="false" /></Slider>`);
      out(depth + 3, '<Panel class="HPC3NumberValue">');
      out(depth + 4, `<Panel class="HPC3EntryBox"><TextEntry id="${control.entryId}" class="HPC3NumberEntry" text="${esc(value)}" maxchars="8" /></Panel>`);
      out(depth + 4, `<Label class="HPC3Unit" text="${esc(row.unit.toUpperCase())}" hittest="false" />`);
      out(depth + 3, '</Panel>');
      out(depth + 2, '</Panel>');
    }
    control.resetId = id(prefix + 'ResetButton');
    out(depth + 2, `<Button id="${control.resetId}" class="HPC3RowReset">${resetIcon}</Button>`);
    control.conditionId = id('HPColorsCondition' + pascal(row.key) + pascal(side));
    out(depth + 2, `<Button id="${control.conditionId}" class="HPC3ConditionAction"><Label text="◆" hittest="false" /></Button>`);
    out(depth + 1, '</Panel>');
    out(depth, '</Panel>');
    controls.push(control);
    search.push({ key: row.key, side, page: row.page, level: row.level, group: row.group || '', id: rowId,
      text: [row.name, row.help, row.group || '', ...(row.options || []).map(option => option.label), ...row.keywords, side].join(' ').toLowerCase() });
    return rowId;
  }

  // One side of a group card; the card head owns its group title.
  function column(depth, columnId, title, className, items) {
    const rowIds = [];
    out(depth, `<Panel id="${id(columnId)}" class="HPC3Column ${className}">`);
    out(depth + 1, '<Panel class="HPC3ColumnHeading">');
    out(depth + 2, `<Label class="HPC3ColumnTitle" text="${esc(title)}" hittest="false" />`);
    out(depth + 2, `<Label class="HPC3ColumnCount" text="${items.length}" hittest="false" />`);
    out(depth + 1, '</Panel>');
    for (const item of items) rowIds.push(settingRow(depth + 1, item));
    out(depth, '</Panel>');
    containers.push({ id: columnId, rows: rowIds });
    return rowIds;
  }

  function groupBody(depth, page, pageKey, group, items) {
    const rowIds = [];
    const singleSide = new Set(items.filter(item => item.side !== 'shared').map(item => item.side)).size === 1;
    for (const { level, title, open } of LEVELS) {
      const levelItems = items.filter(item => item.row.level === level);
      if (!levelItems.length) continue;
      const prefix = 'HPColorsPage' + pageKey + pascal(group || 'General') + pascal(level);
      const foldId = id(prefix + 'Fold');
      const toggleId = id(prefix + 'FoldToggle');
      const labelId = id(prefix + 'FoldLabel');
      const bodyId = id(prefix + 'FoldBody');
      const firstControl = controls.length;
      const foldRows = [];
      out(depth, `<Panel id="${foldId}" class="HPC3Fold${open ? ' Open' : ''}">`);
      out(depth + 1, `<Button id="${toggleId}" class="HPC3FoldToggle">`);
      out(depth + 2, '<Panel class="HPC3FoldChevron" hittest="false" />');
      const shown = levelItems.filter(item => item.side === 'shared' || singleSide || item.side === 'enemy').length;
      out(depth + 2, `<Label id="${labelId}" class="HPC3FoldLabel" text="${esc(title + ' · ' + shown)}" hittest="false" />`);
      out(depth + 1, '</Button>');
      out(depth + 1, `<Panel id="${bodyId}" class="HPC3FoldBody">`);
      const sided = levelItems.filter(item => item.side !== 'shared');
      if (sided.length) {
        out(depth + 2, '<Panel class="HPC3SideColumns">');
        for (const spec of COLUMNS) {
          const columnItems = sided.filter(item => item.side === spec.side);
          if (!columnItems.length) continue;
          foldRows.push(...column(depth + 3, prefix + pascal(spec.side) + 'Column', spec.title, spec.className, columnItems));
        }
        out(depth + 2, '</Panel>');
      }
      const shared = levelItems.filter(item => item.side === 'shared');
      if (shared.length) foldRows.push(...column(depth + 2, prefix + 'SharedColumn', 'SHARED · BOTH SIDES', 'HPC3Shared', shared));
      out(depth + 1, '</Panel>');
      out(depth, '</Panel>');
      containers.push({ id: foldId, rows: foldRows });
      folds.push({ id: foldId, toggleId, labelId, bodyId, page: page.name, group, level, open, singleSide,
        rows: controls.slice(firstControl).map(row => ({ id: row.rowId, side: row.side })) });
      rowIds.push(...foldRows);
    }
    return rowIds;
  }

  function pageBody(depth, page, items) {
    const rowIds = [];
    const solo = page.groups.length === 1;
    for (const name of page.groups) {
      const prefix = 'HPColorsCard' + page.key + pascal(name || 'General');
      const card = { name, page: page.name, id: id(prefix), resetId: '', subNavId: solo ? '' : 'HPColorsSubNav' + page.key + pascal(name || 'General') + 'Button' };
      const groupItems = items.filter(item => (item.row.group || '') === name);
      const availableSides = COLUMNS.filter(spec => groupItems.some(item => item.side === spec.side));
      out(depth, `<Panel id="${card.id}" class="HPC3Card${availableSides.length === 1 ? ' HPC3SingleSide' : ''}">`);
      out(depth + 1, '<Panel class="HPC3CardBg" hittest="false" />');
      out(depth + 1, '<Panel class="HPC3CardHead">');
      if (!solo) out(depth + 2, `<Label class="HPC3CardTitle" text="${esc((name || page.lead || page.title).toUpperCase())}" hittest="false" />`);
      card.resetId = id(prefix + 'ResetButton');
      out(depth + 2, `<Button id="${card.resetId}" class="HPC3GroupReset">${resetIcon}</Button>`);
      if (availableSides.length > 1) {
        card.sides = [];
        out(depth + 2, '<Panel class="HPC3Grow" hittest="false" />');
        out(depth + 2, '<Panel class="HPC3SideTabs">');
        for (const spec of availableSides) {
          const side = { side: spec.side, id: id(prefix + 'Side' + pascal(spec.side) + 'Button') };
          card.sides.push(side);
          out(depth + 3, `<Button id="${side.id}" class="SecondaryButton light HPC3SidePill${spec.side === 'enemy' ? ' fill Selected' : ''}"><Label text="${spec.title}" hittest="false" /></Button>`);
        }
        out(depth + 2, '</Panel>');
      }
      out(depth + 1, '</Panel>');
      const groupRows = groupBody(depth + 1, page, page.key, name, groupItems);
      out(depth, '</Panel>');
      containers.push({ id: card.id, rows: groupRows });
      groups.push(card);
      rowIds.push(...groupRows);
    }
    return rowIds;
  }

  // Preview (ticket 09): a fake unit-status tree with the world lineage
  // (WindowRoot > UnitStatus > InfoHealthContainer > UnitHealthbarsContainer > UnitHealthbar > UnitHealthbarInner)
  // and the v3 owned frame, all under HPColorsPreview ids. No stock ids and no carrier classes:
  // the renderer reads carrier classes from data held by the preview script.
  function previewPane(depth) {
    const segment = (d, key, options) => {
      out(d, `<Panel id="${id('HPColorsPreview' + key + 'Segment')}" class="HPC3PreviewSegment HPC3Preview${key}Segment">`);
      options.forEach(([value, label], index) => out(d + 1, `<Button id="${id('HPColorsPreview' + key + 'Option' + value)}" class="SecondaryButton light HPC3PreviewPill${index ? '' : ' fill Selected'}"><Label text="${label}" hittest="false" /></Button>`));
      out(d, '</Panel>');
    };
    out(depth, `<Panel id="${id('HPColorsPreview')}" class="HPC3Preview HPC3PreviewKindHero HPC3PreviewSideEnemy">`);
    out(depth + 1, `<Label id="${id('HPColorsPreviewTitle')}" class="HPC3PreviewTitle" text="HERO · ENEMY" hittest="false" />`);
    // Ticket 35: side and session-only team (Amber/Sapphire) share one row, so the plate does not move.
    out(depth + 1, '<Panel class="HPC3PreviewSegmentRow">');
    segment(depth + 2, 'Side', [['Enemy', 'ENEMY'], ['Ally', 'ALLY']]);
    segment(depth + 2, 'Team', [['Amber', 'AMBER'], ['Sapphire', 'SAPPHIRE']]);
    out(depth + 1, '</Panel>');
    segment(depth + 1, 'Kind', [['Npc', 'NPC'], ['Neutral', 'NEUTRAL'], ['Objective', 'OBJECTIVE']]);
    out(depth + 1, `<Panel id="${id('HPColorsPreviewPlate')}" class="HPC3PreviewPlate" hittest="false" hittestchildren="false">`);
    out(depth + 2, `<Panel id="${id('HPColorsPreviewSceneWindow')}" class="HPC3PreviewSceneWindow" hittest="false" hittestchildren="false">`);
    out(depth + 3, `<Image id="${id('HPColorsPreviewBackdrop')}" class="HPC3PreviewBackdrop" src="s2r://panorama/images/buttons/temp_preview_panel_subtitles_png.vtex" scaling="stretch-to-cover-preserve-aspect" hittest="false" />`);
    out(depth + 3, `<Panel id="${id('HPColorsPreviewStage')}" class="HPC3PreviewStage" hittest="false" hittestchildren="false">`);
    // Ticket 22c: static Infernus model behind the bar, shop pose (user choice). Live checks 1-4: heroid="1" is
    // the key attribute (heroname alone drew nothing). Live 1:1: client.dll 6785 has no renderdeferred/antialias
    // scene-panel attribute and the live strip drew without them, so only the needed set is emitted.
    // CSS shows it only for the HERO kind with the menu open; no JS touches it.
    // Live check 8: a scene render ignores scissor clipping (overflow: clip, clip: rect()) but is clipped by a
    // parent on its own composition layer; the plate-sized scene window owns the brush/mask, not the stage.
    out(depth + 4, `<Panel id="${id('HPColorsPreviewHeroFrame')}" class="HPC3PreviewHeroFrame" hittest="false">`);
    out(depth + 5, `<CitadelHeroScenePanelNew id="${id('HPColorsPreviewHeroModel')}" class="HPC3PreviewHeroModel" heroname="hero_inferno" heroid="1" heroscenestyle="Shop" map="maps/ui/hero_shop/inferno_shop.vmap" camera="point_camera" rendershadows="false" rotate="None" hittest="false" />`);
    out(depth + 4, '</Panel>');
    const node = (key, className, children, type, text) => [key, className, children, type, text];
    const layers = ['Fill', 'Healing', 'Shield', 'Armor', 'Delta'].map(part => node('Bar' + part, 'HPC3PreviewBarLayer HPC3PreviewBar' + part, []));
    layers.push(node('BarVisualFill', 'HPC3PreviewBarLayer HPC3PreviewBarFill HPC3PreviewBarVisualFill', []));
    layers.push(node('PulseOverlay', 'HPColorsV3PulseOverlay HPC3PreviewPulseOverlay', []));
    // Same OLD grid order as the world overlay; the renderer creates its boxes on first OLD paint.
    const pipGrid = node('PipGrid', 'HPC3PreviewPipGrid', ['Outline', 'Empty', 'Shield', 'Armor', 'Fill', 'Healing', 'Delta', 'KillMarker']
      .map(name => node('Pip' + name, 'HPC3PreviewPipLayer', [])));
    const bar = node('Bar', 'HPC3PreviewBar', [node('BarBg', 'HPC3PreviewBarBg', []), node('BarBorder', 'HPC3PreviewBarBorder', []),
      node('BarInner', 'HPC3PreviewBarInner', layers), node('BarLines', 'HPC3PreviewBarLines', []), node('BarOutline', 'HPC3PreviewBarOutline', []), node('KillMarker', 'HPC3PreviewKillMarker', []), pipGrid]);
    const ult = node('UltPanel', 'HPC3PreviewUltPanel', [node('UltBackground', 'HPC3PreviewUltBackground',
      [node('UltReady', 'HPC3PreviewUltReady', [], 'Image')])]);
    const level = node('Level', 'HPC3PreviewLevel', [node('LevelLabel', 'HPC3PreviewLevelLabel', null, 'Label', '19')]);
    const info = node('Info', 'HPC3PreviewInfo', [level, node('Bars', 'HPC3PreviewBars', [bar]), ult, node('HpText', 'HPC3PreviewHpText', null, 'Label', '750')]);
    const readout = node('Readout', 'HPC3PreviewReadout', [node('ReadoutAnchor', 'HPC3PreviewReadoutAnchor', [node('ReadoutLine', 'HPC3PreviewReadoutLine', [])])]);
    const stamina = node('Stamina', 'HPC3PreviewStamina StaminaRecentlyUsed', [1, 2, 3].map(i =>
      node('StaminaPip' + i, 'StaminaPip' + (i === 3 ? ' PipEmpty' : ''),
        [node('StaminaIcon' + i, 'StaminaPipIcon', [])])));
    const pickups = node('Pickups', 'HPC3PreviewPickups', ['Gun', 'Movement', 'Spirit', 'Survival'].map((name, i) =>
      node('Pickup' + name, 'HPC3PreviewPickup ' + ['gunpower_pickup', 'movement_pickup', 'casting_pickup', 'survival_pickup'][i], [
        node('Pickup' + name + 'Inner', 'HPC3PreviewPickupInner', []),
        node('Pickup' + name + 'Track', 'HPC3PreviewPickupTrack', []),
        node('Pickup' + name + 'Border', 'HPC3PreviewPickupBorder', []),
        node('Pickup' + name + 'Glyph', 'HPC3PreviewPickupGlyph statusEffectImage', [], 'Image')])));
    // SHOW BOUNDS outline (ticket 22): the canvas-sized rim sits outside the motion frame, like the world bar's.
    const tree = [node('Scale', 'HPC3PreviewScale', [node('Canvas', 'HPC3PreviewCanvas ShowCriticalState', [node('CanvasBounds', 'HPC3PreviewCanvasBounds', []),
      node('Name', 'HPC3PreviewName', null, 'Label', 'Infernus'),
      node('Motion', 'HPC3PreviewMotion', [readout]), node('UnitStatus', 'HPC3PreviewUnitStatus', [info]), stamina, pickups,
      node('KillStreak', 'HPC3PreviewKillStreak', [node('KillStreakImage', 'HPC3PreviewKillStreakImage', [])]),
      node('RejuvenatorAnchor', 'HPC3PreviewRejuvenatorAnchor', []), node('Rejuvenator', 'HPC3PreviewRejuvenator', []),
      ...['Critical', 'Assassinate', 'Unkillable'].flatMap(name => [
        node(name + 'Anchor', 'HPColorsV3StatusLabelAnchor', []),
        node(name + 'Indicator', 'HPC3Preview' + name + 'Indicator', [node(name + 'Label', '', null, 'Label', '#Citadel_Hud_' + name)])])])])];
    (function emit(d, nodes) {
      for (const [key, className, children, type, text] of nodes) {
        const tag = type || 'Panel';
        const attrs = `id="${id('HPColorsPreview' + key)}" class="${className}"` + (text ? ` text="${text}"` : '') + ' hittest="false"';
        if (!children || !children.length) { out(d, `<${tag} ${attrs} />`); continue; }
        out(d, `<${tag} ${attrs}>`);
        emit(d + 1, children);
        out(d, `</${tag}>`);
      }
    })(depth + 4, tree);
    out(depth + 3, '</Panel>');
    out(depth + 2, '</Panel>');
    out(depth + 1, '</Panel>');
    out(depth + 1, '<Panel class="HPC3PreviewHealthHead">');
    out(depth + 2, '<Label class="HPC3PreviewHealthLabel" text="Health" hittest="false" />');
    out(depth + 2, `<Slider id="${id('HPColorsPreviewHealthSlider')}" class="HPC3Slider HPC3PreviewHealthSlider HorizontalSlider" direction="horizontal" />`);
    out(depth + 2, `<Label id="${id('HPColorsPreviewHealthValue')}" class="HPC3PreviewHealthValue" text="75%" hittest="false" />`);
    out(depth + 1, '</Panel>');
    out(depth + 1, `<Button id="${id('HPColorsPreviewPlay')}" class="SecondaryButton light fill HPC3PlayButton"><Label id="${id('HPColorsPreviewPlayLabel')}" text="PLAY DAMAGE / HEAL" hittest="false" /></Button>`);
    out(depth + 1, `<Label id="${id('HPColorsPreviewStatus')}" class="HPC3PreviewStatus" text="" hittest="false" />`);
    out(depth + 1, `<Label id="${id('HPColorsPreviewNote')}" class="HPC3PreviewNote" text="Plain, not-targeted sample. The view adapts to the selected unit and settings; world scale varies." hittest="false" />`);
    // Bottom stack: footer (CREDITS, DONATE, version) above the supporter strip; a collapsed strip leaves the footer at the bottom.
    out(depth + 1, `<Panel id="${id('HPColorsPreviewBottom')}" class="HPC3PreviewBottom">`);
    out(depth + 2, `<Panel id="${id('HPColorsPreviewFooter')}" class="HPC3PreviewFooter">`);
    out(depth + 3, `<Button id="${id('HPColorsPreviewCreditsButton')}" class="SecondaryButton light HPC3CreditsButton"><Label text="CREDITS" hittest="false" /></Button>`);
    out(depth + 3, `<Button id="${id('HPColorsPreviewDonateButton')}" class="SecondaryButton light HPC3CreditsButton"><Label text="DONATE" hittest="false" /></Button>`);
    out(depth + 3, `<Label id="${id('HPColorsPreviewVersion')}" class="HPC3PreviewVersion" text="${esc('v' + release)}" hittest="false" />`);
    out(depth + 2, '</Panel>');
    out(depth + 2, `<CitadelHTMLPanel id="${id('HPColorsSupporterStrip')}" class="HPC3SupporterStrip" hittest="false" hittestchildren="false" acceptsfocus="false" />`);
    out(depth + 1, '</Panel>');
    out(depth, '</Panel>');
  }

  function sharePanel(depth) {
    out(depth, `<Panel id="${id('HPColorsShareSection')}" class="HPC3Share">`);
    out(depth + 1, '<Panel class="HPC3ColumnHeading"><Label class="HPC3ColumnTitle" text="SHARE CODES" /></Panel>');
    // Either box imports either code kind, so both accept the larger bundle length.
    for (const [key, title, help] of [
      ['Settings', 'SETTINGS CODE', 'Your current settings as one code. IMPORT applies a pasted settings code; a bundle code adds its presets instead.'],
      ['Bundle', 'PRESET / BUNDLE CODE', 'IMPORT adds a bundle\'s presets without changing your look; a settings code applies instead. REPLACE ALL replaces the library and current settings after confirmation.']]) {
      const maxchars = 32768;
      out(depth + 1, `<Panel id="${id('HPColors' + key + 'CodeRow')}" class="HPC3Row HPC3CodeRow">`);
      out(depth + 2, '<Panel class="HPC3Copy">');
      out(depth + 3, `<Label class="HPC3RowTitle" text="${title}" hittest="false" />`);
      out(depth + 3, `<Label class="HPC3Help" text="${esc(help)}" hittest="false" />`);
      out(depth + 2, '</Panel>');
      out(depth + 2, '<Panel class="HPC3EntryActions">');
      out(depth + 3, `<TextEntry id="${id('HPColors' + key + 'CodeEntry')}" class="HPC3CodeEntry" maxchars="${maxchars}" />`);
      action(depth + 3, key + 'Copy', 'COPY');
      action(depth + 3, key + 'Import', 'IMPORT');
      if (key === 'Bundle') action(depth + 3, 'BundleReplace', 'REPLACE ALL');
      out(depth + 2, '</Panel>');
      out(depth + 1, '</Panel>');
    }
    out(depth + 1, `<Label id="${id('HPColorsCodeStatus')}" class="HPC3CodeStatus" text="" />`);
    out(depth, '</Panel>');
  }

  function action(depth, name, text) {
    const glyph = glyphs[text];
    out(depth, `<Button id="${id('HPColors' + name + 'Button')}" class="${glyph ? 'InputButtonBorderRadius HPC3GlyphButton' + (text === 'APPLY' ? ' Fill CTA' : '') : 'SecondaryButton light HPC3ActionButton'}" tooltip="${esc(text)}">${glyph ? '<Panel class="Bottom" hittest="false"><Panel class="Background" hittest="false" /></Panel><Panel class="Top" hittest="false"><Panel class="Background" hittest="false" /></Panel><Panel class="Content" hittest="false">' + image(glyph, 'HPC3Glyph') + '</Panel>' : `<Label text="${esc(text)}" hittest="false" />`}</Button>`);
  }
  function dialogAction(depth, name, text, primary = false, extra = '') {
    const warning = name === 'PresetDeleteConfirm' || name === 'BundleReplaceConfirm';
    out(depth, `<Button id="${id('HPColors' + name + 'Button')}" class="${primary ? 'InputButtonBorderRadius Fill ' + (warning ? 'Warning' : 'CTA') : 'InputButton Fill'} HPC3DialogButton${extra ? ' ' + extra : ''}"><Panel class="Bottom" hittest="false"><Panel class="Background" hittest="false" /></Panel><Panel class="Top" hittest="false"><Panel class="Background" hittest="false" /></Panel><Panel class="Content" hittest="false"><Label text="${esc(text)}" hittest="false" /></Panel></Button>`);
  }
  function noticeStart(depth, icon) {
    out(depth, '<Panel class="HPC3NoticeShadow" hittest="false" />');
    out(depth, '<Panel class="HPC3NoticeBg" hittest="false" />');
    out(depth, '<Panel class="HPC3NoticeContent">');
    out(depth + 1, '<Panel class="HPC3NoticeHeader">');
    out(depth + 2, image(icon, 'HPC3NoticeIcon'));
  }
  function noticeHeaderEnd(depth) { out(depth, '</Panel>'); }
  function escClose(depth, key) {
    out(depth, `<Button id="${id('HPColors' + key + 'EscClose')}" class="HPC3EscClose"><Label class="HPC3EscKey" text="ESC" hittest="false" /><Label class="HPC3EscCloseLabel" text="CLOSE" hittest="false" /></Button>`);
  }
  function newsPage(depth) {
    out(depth, '<Panel class="HPC3NewHeader">');
    out(depth + 1, `<Button id="${id('HPColorsNewClearAllButton')}" class="SecondaryButton light HPC3ActionButton"><Label text="CLEAR ALL" hittest="false" /></Button>`);
    out(depth, '</Panel>');
    out(depth, `<Panel id="${id('HPColorsNewList')}" class="HPC3NewList">`);
    for (const item of newsItems) {
      const key = 'HPColorsNewItem' + pascal(item.id);
      item.itemId = id(key); item.buttonId = id(key + 'Button'); item.dismissId = id(key + 'DismissButton');
      out(depth + 1, `<Panel id="${item.itemId}" class="HPC3NewItem${item.badge === 'Updated' ? ' Updated' : ''}">`);
      out(depth + 2, `<Button id="${item.buttonId}" class="HPC3NewOpen">`);
      out(depth + 3, '<Panel class="HPC3NewItemBg" hittest="false" />');
      out(depth + 3, `<Image class="HPC3NewIcon" src="${item.badge === 'Updated' ? UPDATED_ICON : NEW_ICON}" texturewidth="20px" textureheight="20px" scaling="stretch-to-fit-preserve-aspect" hittest="false" />`);
      out(depth + 3, '<Panel class="HPC3NewInfo" hittest="false">');
      out(depth + 4, `<Label class="HPC3NewTitle" text="${esc(item.title)}" hittest="false" />`);
      out(depth + 4, `<Label class="HPC3NewDescription" text="${esc(item.description)}" hittest="false" />`);
      out(depth + 3, '</Panel>');
      out(depth + 3, '<Panel class="HPC3NewMeta" hittest="false">');
      out(depth + 4, `<Label class="HPC3NewBadge" text="${esc(item.badge.toUpperCase())}" hittest="false" />`);
      out(depth + 4, `<Label class="HPC3NewVersion" text="${esc('v' + item.release)}" hittest="false" />`);
      out(depth + 3, '</Panel>');
      out(depth + 2, '</Button>');
      out(depth + 2, `<Button id="${item.dismissId}" class="HPC3NewDismiss" tooltip="DISMISS"><Image src="s2r://panorama/images/control_icons/24px/x_close.vsvg" texturewidth="20px" textureheight="20px" scaling="stretch-to-fit-preserve-aspect" hittest="false" /></Button>`);
      out(depth + 1, '</Panel>');
    }
    out(depth, '</Panel>');
    out(depth, '<Label class="HPC3NewEmpty" text="Nothing new right now. New and changed features show up here after an update." hittest="false" />');
  }
  function library(depth) {
    out(depth, '<Panel class="HPC3Library">');
    out(depth + 1, '<Panel class="HPC3LibraryHeader">');
    out(depth + 2, `<Label id="${id('HPColorsHeroIdentityLabel')}" class="HPC3Meta" text="NO HERO DETECTED" hittest="false" />`);
    out(depth + 2, '<Panel class="HPC3EntryActions">');
    out(depth + 3, `<TextEntry id="${id('HPColorsPresetNameEntry')}" class="HPC3PresetName" placeholder="PRESET N" maxchars="48" />`);
    action(depth + 3, 'PresetSave', 'SAVE NEW');
    action(depth + 3, 'PresetRestore', 'RESTORE DEFAULT');
    out(depth + 2, '</Panel>');
    out(depth + 2, `<Label id="${id('HPColorsPresetStatus')}" class="HPC3CodeStatus" text="" />`);
    out(depth + 1, '</Panel>');
    out(depth + 1, `<Label id="${id('HPColorsPresetLibraryHeading')}" class="HPC3LibraryHeading" text="LIBRARY · 0/128" hittest="false" />`);
    out(depth + 1, `<Panel id="${id('HPColorsPresetList')}" class="HPC3PresetList">`);
    out(depth + 2, `<Button id="${id('HPColorsPresetDefault')}" class="HPC3PresetTile"><Panel class="HPC3PresetTileFace" hittest="false">${image('icons/icon_gear.vsvg', 'HPC3PresetGear')}<Label id="${id('HPColorsPresetDefaultNameLabel')}" class="HPC3PresetTileName" text="Rewrite Default" hittest="false" /></Panel>${image('icons/icon_checkmark.vsvg', 'HPC3PresetSource')}${image('icons/icon_star_white.vsvg', 'HPC3PresetDefaultMark')}</Button>`);
    out(depth + 1, '</Panel>');
    out(depth + 1, '<Panel class="HPC3PresetToolbar">');
    out(depth + 2, `<TextEntry id="${id('HPColorsPresetSelectedNameEntry')}" class="HPC3PresetName" maxchars="48" />`);
    out(depth + 2, '<Panel class="HPC3PresetActions">');
    for (const word of ['APPLY', 'RENAME', 'UP', 'DOWN', 'COPY', 'DELETE', 'HEROES', 'DEFAULT']) action(depth + 3, 'PresetSelected' + pascal(word.toLowerCase()), word);
    out(depth + 2, '</Panel>');
    out(depth + 1, '</Panel>');
    out(depth, '</Panel>');
  }
  const root = id('HPColorsMenuHost');
  out(1, `<Panel id="${root}" class="HPC3Root" hittest="true">`);
  // Panorama passes clicks on plain Panels through to whatever is behind; a Button absorbs them (v2 pattern).
  out(2, '<Button class="HPC3Backdrop" hittest="true" />');
  out(2, `<Panel id="${id('HPColorsEditorShell')}" class="HPC3Shell">`);
  out(3, '<Panel class="HPC3Body">');
  out(4, '<Panel class="HPC3Rail">');
  out(5, '<Panel class="HPC3NavTop">');
  out(6, `<Panel id="${id('HPColorsSearchBox')}" class="HPC3SearchBox">`);
  out(7, `<Image class="HPC3SearchFieldIcon" src="${SEARCH_ICON}" texturewidth="48px" textureheight="48px" scaling="stretch-to-fit-preserve-aspect" hittest="false" />`);
  out(7, `<TextEntry id="${id('HPColorsSearchField')}" class="HPC3SearchField" placeholder="Search" maxchars="40" />`);
  out(6, '</Panel>');
  out(6, `<Button id="${id('HPColorsShareButton')}" class="HPC3NavSquare"><Image class="HPC3NavSquareIcon" src="s2r://panorama/images/icons/share.vsvg" texturewidth="20px" textureheight="20px" scaling="stretch-to-fit-preserve-aspect" hittest="false" /></Button>`);
  out(6, `<Button id="${id('HPColorsResetPageButton')}" class="HPC3NavSquare"><Image class="HPC3NavSquareIcon" src="s2r://panorama/images/icons/reset.vsvg" texturewidth="20px" textureheight="20px" scaling="stretch-to-fit-preserve-aspect" hittest="false" /></Button>`);
  out(5, '</Panel>');
  out(5, '<Panel class="HPC3NavList">');
  const pageDefs = PAGES.map(page => ({ ...page, key: pascal(page.name),
    groups: [...new Set(rows.filter(row => row.page === page.name).map(row => row.group || ''))] }));
  // NEW marks exist only where an item can show them: its page tab and the sub-nav entry of each target group.
  const subNavIdOf = (page, group) => 'HPColorsSubNav' + page.key + pascal(group || 'General') + 'Button';
  for (const item of newsItems) {
    const page = pageDefs.find(entry => entry.name === item.page);
    item.subNavIds = page.groups.length > 1 ? [...new Set(item.targets.map(key => subNavIdOf(page, rows.find(row => row.key === key).group)))] : [];
  }
  const newsPages = new Set(['New', ...newsItems.map(item => item.page)]), newsSubNavs = new Set(newsItems.flatMap(item => item.subNavIds));
  const startIndex = PAGES.findIndex(page => page.name === START);
  pageDefs.forEach((page, index) => {
    page.navId = id('HPColorsNav' + page.key + 'Button');
    out(5, `<Button id="${page.navId}" class="HPC3NavButton${index === startIndex ? ' Selected' : ''}">`);
    out(6, '<Panel class="HPC3NavBrush" hittest="false" />');
    out(6, '<Panel class="HPC3NavDot" hittest="false" />');
    out(6, `<Label class="HPC3NavLabel" text="${esc(page.title)}" hittest="false" />`);
    if (newsPages.has(page.name)) out(6, `<Image class="HPC3NavNew" src="${NEW_ICON}" texturewidth="16px" textureheight="16px" scaling="stretch-to-fit-preserve-aspect" hittest="false" />`);
    out(6, changedStar);
    out(5, '</Button>');
    page.subNavId = id('HPColorsSubNav' + page.key);
    out(5, `<Panel id="${page.subNavId}" class="HPC3SubNav${index === startIndex ? ' Selected' : ''}">`);
    if (page.groups.length > 1) page.groups.forEach(group => {
      const subNavId = id(subNavIdOf(page, group));
      out(6, `<Button id="${subNavId}" class="HPC3SubNavButton">`);
      out(7, '<Panel class="HPC3SubBrush" hittest="false" />');
      out(7, `<Label class="HPC3SubNavLabel" text="${esc(group || page.lead || page.title)}" hittest="false" />`);
      if (newsSubNavs.has(subNavId)) out(7, `<Image class="HPC3SubNavNew" src="${NEW_ICON}" texturewidth="14px" textureheight="14px" scaling="stretch-to-fit-preserve-aspect" hittest="false" />`);
      out(7, changedStar);
      out(6, '</Button>');
    });
    out(5, '</Panel>');
  });
  out(5, '</Panel>');
  // SHOW BOUNDS (v2 rail tool): a session-only view toggle, not a setting, so it has no schema row.
  out(5, '<Panel class="HPC3BoundsTool">');
  out(6, '<Panel class="HPC3BoundsRow">');
  out(7, '<Label class="HPC3BoundsLabel" text="SHOW BOUNDS" />');
  out(7, `<Button id="${id('HPColorsShowBoundsToggle')}" class="HPC3Toggle">${toggleHandles}</Button>`);
  out(6, '</Panel>');
  out(6, '<Label class="HPC3BoundsHelp" text="Outline the area healthbars can use. Stays on until you turn it off or restart." />');
  out(5, '</Panel>');
  out(4, '</Panel>');
  out(4, '<Panel class="HPC3Content">');
  out(5, '<Panel class="HPC3PageHead">');
  out(6, `<Label id="${id('HPColorsPageTitle')}" class="HPC3PageTitle" text="${esc(PAGES[startIndex].title)}" />`);
  out(6, `<Label id="${id('HPColorsPageDescription')}" class="HPC3PageDescription" text="${esc(PAGES[startIndex].description)}" />`);
  out(5, '</Panel>');
  out(5, `<Panel id="${id('HPColorsSettingsList')}" class="HPC3SettingsList">`);
  pageDefs.forEach((page, index) => {
    const pageId = id('HPColorsPage' + page.key);
    out(6, `<Panel id="${pageId}" class="HPC3Page${page.name === 'New' ? ' HPC3NewPage' : ''}${index === startIndex ? ' Active' : ''}">`);
    out(7, `<Label class="HPC3PageSearchTitle" text="${esc(page.title)}" />`);
    const items = instances.filter(item => item.row.page === page.name);
    const rowIds = pageBody(7, page, items);
    if (!items.length && page.name !== 'Presets' && page.name !== 'New') out(7, `<Label class="HPC3Placeholder" text="${esc(page.placeholder || 'No settings on this page yet. They arrive in a later v3 update.')}" />`);
    if (page.name === 'Presets') { library(7); sharePanel(7); }
    if (page.name === 'New') newsPage(7);
    out(6, '</Panel>');
    containers.push({ id: pageId, rows: rowIds });
    pages.push({ name: page.name, id: pageId, navId: page.navId, subNavId: page.subNavId, title: page.title, description: page.description });
  });
  out(6, `<Label id="${id('HPColorsSearchEmpty')}" class="HPC3SearchEmpty" text="No matching settings. Try red, offset or name." />`);
  out(5, '</Panel>');
  out(4, '</Panel>');
  previewPane(4);
  out(3, '</Panel>');
  out(3, `<Panel id="${id('HPColorsFooter')}" class="HPC3Footer">`);
  out(4, `<Button id="${id('HPColorsCloseButton')}" class="HPC3FooterButton"><Label text="ESC BACK" /></Button>`);
  out(4, `<Button id="${id('HPColorsUndoButton')}" class="HPC3FooterButton"><Label text="UNDO" /></Button>`);
  out(4, `<Label id="${id('HPColorsSaveStatus')}" class="HPC3SaveStatus" text="" />`);
  // Unreadable-save recovery remains a two-click footer action.
  out(4, `<Button id="${id('HPColorsResetSaveButton')}" class="HPC3FooterButton HPC3ResetSave"><Label text="RESET SAVE" /></Button>`);
  out(4, `<Button id="${id('HPColorsResetSaveConfirmButton')}" class="HPC3FooterButton HPC3ResetSaveConfirm"><Label text="CONFIRM: OVERWRITE WITH THESE SETTINGS" /></Button>`);
  out(3, '</Panel>');
  out(2, '</Panel>');
  out(2, `<Panel id="${id('HPColorsCreditsDialog')}" class="HPC3Dialog">`);
  out(3, `<Button id="${id('HPColorsCreditsBackdrop')}" class="HPC3DialogBackdrop" hittest="true" />`);
  out(3, '<Panel class="HPC3DialogCard">');
  noticeStart(4, glyphs.HEROES);
  out(6, '<Label class="HPC3DialogTitle" text="CREDITS" hittest="false" />');
  noticeHeaderEnd(5);
  for (const [key, name, text] of [
    ['Yesdaddy', 'yesdaddy', 'Taking his own time testing my mods and giving alot of Good suggestions'],
    ['Razorrzr', 'razorrzr', 'Critizing my ui and giving a solid gold']]) {
    out(4, '<Panel class="HPC3CreditEntry" hittest="false" hittestchildren="false">');
    out(5, '<Panel class="HPC3CreditHeading" hittest="false">');
    out(6, '<Panel class="HPC3CreditPortrait" hittest="false">');
    out(7, '<Panel class="HPC3HeroCircle" hittest="false" />');
    out(7, `<Image id="${id('HPColorsCredits' + key + 'Portrait')}" class="HPC3HeroPortrait" scaling="stretch-to-fit-preserve-aspect" hittest="false" />`);
    out(6, '</Panel>');
    out(6, `<Label id="${id('HPColorsCredits' + key + 'Name')}" class="HPC3CreditName" text="${esc(name)}" hittest="false" />`);
    out(5, '</Panel>');
    out(5, `<Label id="${id('HPColorsCredits' + key + 'Text')}" class="HPC3DialogDescription HPC3CreditText" text="${esc(text)}" hittest="false" />`);
    out(4, '</Panel>');
  }
  // Ticket 43: bug reports and feedback go to the author's Discord; FEEDBACK copies the username. Outside
  // the credit entries, whose hittestchildren is off.
  out(4, `<Label id="${id('HPColorsFeedbackText')}" class="HPC3DialogDescription HPC3CreditText" text="Found a bug or have feedback? Message hanturaya101 on Discord. FEEDBACK copies the name." hittest="false" />`);
  out(4, '<Panel class="HPC3PresetActions">');
  dialogAction(5, 'FeedbackCopy', 'FEEDBACK', true);
  dialogAction(5, 'CreditsClose', 'CLOSE');
  out(4, '</Panel>');
  out(4, `<Label id="${id('HPColorsFeedbackStatus')}" class="HPC3DialogDescription" text="" hittest="false" />`);
  escClose(4, 'Credits');
  out(4, '</Panel>');
  out(3, '</Panel>');
  out(2, '</Panel>');
  // Update notice (ticket 33): text and the DOWNLOAD link come from the hosted latest.json result.
  out(2, `<Panel id="${id('HPColorsUpdateDialog')}" class="HPC3Dialog">`);
  out(3, `<Button id="${id('HPColorsUpdateBackdrop')}" class="HPC3DialogBackdrop" hittest="true" />`);
  out(3, '<Panel class="HPC3DialogCard">');
  noticeStart(4, glyphs.DOWN);
  out(6, '<Label class="HPC3DialogTitle" text="UPDATE AVAILABLE" hittest="false" />');
  noticeHeaderEnd(5);
  out(4, `<Label id="${id('HPColorsUpdateText')}" class="HPC3DialogDescription" text="" hittest="false" />`);
  out(4, '<Panel class="HPC3PresetActions">');
  dialogAction(5, 'UpdateDownload', 'DOWNLOAD', true, 'HPC3UpdateDownload');
  dialogAction(5, 'UpdateClose', 'CLOSE');
  out(4, '</Panel>');
  escClose(4, 'Update');
  out(4, '</Panel>');
  out(3, '</Panel>');
  out(2, '</Panel>');
  out(2, `<Panel id="${id('HPColorsResetPageDialog')}" class="HPC3Dialog">`);
  out(3, '<Button class="HPC3DialogBackdrop" hittest="true" />');
  out(3, '<Panel class="HPC3DialogCard">');
  noticeStart(4, 'icons/icon_gear.vsvg');
  out(6, '<Label class="HPC3DialogTitle" text="RESET PAGE" hittest="false" />');
  noticeHeaderEnd(5);
  out(4, `<Label id="${id('HPColorsResetPageMessage')}" class="HPC3DialogDescription" text="" hittest="false" />`);
  out(4, '<Panel class="HPC3PresetActions">');
  dialogAction(5, 'ResetPageConfirm', 'RESET', true);
  dialogAction(5, 'ResetPageCancel', 'CANCEL');
  out(4, '</Panel>');
  escClose(4, 'ResetPage');
  out(4, '</Panel>');
  out(3, '</Panel>');
  out(2, '</Panel>');
  out(2, `<Panel id="${id('HPColorsPresetDeleteDialog')}" class="HPC3Dialog">`);
  out(3, '<Button class="HPC3DialogBackdrop" hittest="true" />');
  out(3, '<Panel class="HPC3DialogCard">');
  noticeStart(4, 'icons/delete_trash.vsvg');
  out(6, '<Label class="HPC3DialogTitle" text="DELETE PRESET" hittest="false" />');
  noticeHeaderEnd(5);
  out(4, `<Label id="${id('HPColorsPresetDeleteMessage')}" class="HPC3DialogDescription" text="" hittest="false" />`);
  out(4, '<Panel class="HPC3PresetActions">');
  dialogAction(5, 'PresetDeleteConfirm', 'DELETE', true);
  dialogAction(5, 'PresetDeleteCancel', 'CANCEL');
  out(4, '</Panel>');
  escClose(4, 'PresetDelete');
  out(4, '</Panel>');
  out(3, '</Panel>');
  out(2, '</Panel>');
  out(2, `<Panel id="${id('HPColorsBundleReplaceDialog')}" class="HPC3Dialog">`);
  out(3, '<Button class="HPC3DialogBackdrop" hittest="true" />');
  out(3, '<Panel class="HPC3DialogCard">');
  noticeStart(4, 'icons/icon_copy_paste.vsvg');
  out(6, '<Label class="HPC3DialogTitle" text="REPLACE BUNDLE" hittest="false" />');
  noticeHeaderEnd(5);
  out(4, `<Label id="${id('HPColorsBundleReplaceMessage')}" class="HPC3DialogDescription" text="" hittest="false" />`);
  out(4, '<Panel class="HPC3PresetActions">');
  dialogAction(5, 'BundleReplaceConfirm', 'REPLACE ALL', true);
  dialogAction(5, 'BundleReplaceCancel', 'CANCEL');
  out(4, '</Panel>');
  escClose(4, 'BundleReplace');
  out(4, '</Panel>');
  out(3, '</Panel>');
  out(2, '</Panel>');
  out(2, `<Panel id="${id('HPColorsHeroDialog')}" class="HPC3Dialog">`);
  out(3, '<Button class="HPC3DialogBackdrop" hittest="true" />');
  out(3, '<Panel class="HPC3DialogCard">');
  noticeStart(4, glyphs.HEROES);
  out(6, `<Label id="${id('HPColorsHeroTitleLabel')}" class="HPC3DialogTitle" text="HEROES" hittest="false" />`);
  noticeHeaderEnd(5);
  out(4, '<Label class="HPC3DialogDescription" text="Use this preset for a hero. Assigning it here replaces any other preset for that hero." hittest="false" />');
  out(4, '<Panel class="HPC3HeroSearch">');
  out(5, `<TextEntry id="${id('HPColorsHeroSearchField')}" class="HPC3PresetName" placeholder="Search heroes" maxchars="80" />`);
  out(5, `<Image class="HPC3SearchFieldIcon" src="${SEARCH_ICON}" hittest="false" />`);
  out(4, '</Panel>');
  out(4, `<Label id="${id('HPColorsHeroMatchCount')}" class="HPC3Meta" text="" hittest="false" />`);
  out(4, `<Panel id="${id('HPColorsHeroList')}" class="HPC3HeroGrid" />`);
  out(4, '<Panel class="HPC3PresetActions">');
  dialogAction(5, 'HeroClose', 'DONE', true);
  out(4, '</Panel>');
  escClose(4, 'Hero');
  out(4, '</Panel>');
  out(3, '</Panel>');
  out(2, '</Panel>');
  out(2, `<Panel id="${id('HPColorsConditionDialog')}" class="HPC3Dialog">`);
  out(3, '<Button class="HPC3DialogBackdrop" hittest="true" />');
  out(3, '<Panel class="HPC3DialogCard">');
  noticeStart(4, 'icons/icon_gear.vsvg');
  out(4, `<Label id="${id('HPColorsConditionTitle')}" class="HPC3DialogTitle" text="CONDITION" hittest="false" />`);
  noticeHeaderEnd(5);
  out(4, `<Label id="${id('HPColorsConditionSubtitle')}" class="HPC3DialogSubtitle" text="" hittest="false" />`);
  out(4, '<Label class="HPC3DialogDescription" text="Use this value after YOUR signature ability reaches the chosen tier. Click the selected slot to cycle tier 1–3." hittest="false" />');
  out(4, '<Panel class="HPC3ConditionAbilities">');
  for (let slot = 1; slot <= 4; slot++) {
    const prefix = 'HPColorsConditionSlot' + slot;
    out(5, `<Button id="${id(prefix)}" class="HPC3AbilitySlot" hittestchildren="false">`);
    // Stock hud_ability_icon.css stack, one 104px box: tier art (passive_2/3), ring (passive_1), disc (passive_0), glyph.
    out(6, `<Panel id="${id(prefix + 'TierArt')}" class="HPC3AbilityLayer HPC3AbilityTierArt" hittest="false" />`);
    out(6, `<Panel id="${id(prefix + 'Ring')}" class="HPC3AbilityLayer HPC3AbilityRing" hittest="false" />`);
    out(6, `<Panel id="${id(prefix + 'Disc')}" class="HPC3AbilityLayer HPC3AbilityDisc" hittest="false" />`);
    out(6, '<Panel class="HPC3AbilityGlyph" hittest="false">');
    out(7, `<Image id="${id(prefix + 'Image')}" class="HPC3AbilityImage" scaling="stretch-to-fit-preserve-aspect" hittest="false" />`);
    out(7, `<Label id="${id(prefix + 'FallbackLabel')}" class="HPC3AbilityFallback" text="${slot}" hittest="false" />`);
    out(6, '</Panel>');
    out(6, '<Panel class="HPC3AbilityBadge" hittest="false">');
    out(7, `<Label id="${id(prefix + 'NumberLabel')}" text="${slot}" hittest="false" />`);
    out(6, '</Panel>');
    out(6, `<Label id="${id(prefix + 'Label')}" class="HPC3AbilityTier" text="" hittest="false" />`);
    out(5, '</Button>');
  }
  out(4, '</Panel>');
  out(4, `<Button id="${id('HPColorsConditionBooleanToggle')}" class="HPC3Toggle">${toggleHandles}</Button>`);
  out(4, `<Panel id="${id('HPColorsConditionOptions')}" class="HPC3PresetActions" />`);
  out(4, `<Panel id="${id('HPColorsConditionNumber')}" class="HPC3SliderGroup">`);
  out(5, `<Slider id="${id('HPColorsConditionNumberSlider')}" class="HPC3Slider HorizontalSlider" direction="horizontal" />`);
  out(5, '<Panel class="HPC3NumberValue">');
  out(6, `<Panel class="HPC3EntryBox"><TextEntry id="${id('HPColorsConditionNumberEntry')}" class="HPC3NumberEntry" maxchars="8" /></Panel>`);
  out(6, `<Label id="${id('HPColorsConditionNumberUnit')}" class="HPC3Unit" text="" hittest="false" />`);
  out(5, '</Panel>');
  out(4, '</Panel>');
  out(4, `<Panel id="${id('HPColorsConditionColor')}" class="HPC3PresetActions">`);
  out(5, `<Button id="${id('HPColorsConditionSwatch')}" class="HPC3Swatch" />`);
  out(5, `<TextEntry id="${id('HPColorsConditionHex')}" class="HPC3Hex" maxchars="7" />`);
  out(4, '</Panel>');
  out(4, `<Label id="${id('HPColorsConditionStatus')}" class="HPC3DialogDescription" text="" hittest="false" />`);
  out(4, '<Panel class="HPC3PresetActions">');
  dialogAction(5, 'ConditionApply', 'APPLY', true);
  dialogAction(5, 'ConditionRemove', 'REMOVE');
  dialogAction(5, 'ConditionCancel', 'CANCEL');
  out(4, '</Panel>');
  escClose(4, 'Condition');
  out(4, '</Panel>');
  out(3, '</Panel>');
  out(2, '</Panel>');
  out(2, `<Panel id="${id('HPColorsPickerDialog')}" class="HPC3Dialog">`);
  out(3, '<Button class="HPC3DialogBackdrop" hittest="true" />');
  out(3, `<Panel id="${id('HPColorsPickerCard')}" class="HPC3DialogCard">`);
  noticeStart(4, 'icons/icon_gear.vsvg');
  out(4, `<Label id="${id('HPColorsPickerTitle')}" class="HPC3DialogTitle" text="COLOR" hittest="false" />`);
  noticeHeaderEnd(5);
  out(4, `<CitadelColorPicker id="${id('HPColorsNativePicker')}" class="HPC3NativePicker" />`);
  out(4, `<TextEntry id="${id('HPColorsPickerHex')}" class="HPC3Hex" maxchars="7" />`);
  out(4, `<Label id="${id('HPColorsPickerStatus')}" class="HPC3DialogDescription" text="Escape restores the opening color." hittest="false" />`);
  out(4, '<Panel class="HPC3PresetActions">');
  dialogAction(5, 'PickerDone', 'DONE', true);
  dialogAction(5, 'PickerCancel', 'CANCEL');
  out(4, '</Panel>');
  escClose(4, 'Picker');
  out(4, '</Panel>');
  out(3, '</Panel>');
  out(2, '</Panel>');
  out(1, '</Panel>');
  // v2's hidden store shape: a collapsed wrapper around a near-transparent HTML panel.
  out(1, `<Panel id="${id('HPColorsV3StoreWrap')}" class="HPC3StoreWrap" hittest="false" hittestchildren="false">`);
  out(2, `<CitadelHTMLPanel id="${id('HPColorsV3StorePanel')}" class="HPC3StorePanel" hittest="false" acceptsfocus="false" />`);
  out(1, '</Panel>');

  const fragment = lines.join('\n') + '\n';
  const emitted = [...fragment.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  if (emitted.join('\n') !== ids.slice(1).join('\n')) throw new Error('Generated menu ids drifted from the id list');
  if (controls.length !== instances.length) throw new Error('Every table row and side needs exactly one generated menu row');
  const button = `<Button id="${menuButton}" class="nav_menu_item minor" onactivate="$.HPColorsMenuToggle()">\n` +
    '\t\t\t\t\t\t<Label text="HP COLORS" class="menuButtonLabel" />\n\t\t\t\t\t</Button>\n\t\t\t\t\t';
  return { ids, controls, search, fragment, button,
    menu: { rootId: root, pages, groups, folds, containers, startPage: startIndex,
      news: newsItems.map(({ id: newsId, badge, date, page, rowIds, subNavIds, itemId, buttonId, dismissId }) => ({ id: newsId, badge, date, page, rowIds, subNavIds, itemId, buttonId, dismissId })) } };
}

module.exports = { buildMenu, PAGES };
