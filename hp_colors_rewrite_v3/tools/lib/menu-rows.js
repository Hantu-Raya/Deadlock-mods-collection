'use strict';
// Setting rows: one row per schema row and side (toggle, segment/dropdown, color or number controls),
// grouped into side columns, BASIC/ADVANCED folds and group cards per page; plus the COLORBLIND card.
// Every emitted control, search entry, container, fold and card is recorded in `state`.
const { NEW_ICON, SEGMENT_MAX, toggleHandles, resetIcon, idWord, esc } = require('./menu-markup');
const { SIDES, LEVELS } = require('./schema');

// Fold and side-column tables come from the schema vocabulary; only the display words live here.
const FOLDS = LEVELS.map(level => ({ level, title: level.toUpperCase(), open: level === 'basic' }));
const SIDE_COLUMNS = SIDES.map(side => ({ side, title: side.toUpperCase(), className: 'HPC3' + idWord(side) }));

// Every id a row, card or sub-nav button emits is built here, so the menu and the NEW tab agree on it.
const rowPrefix = (key, side) => 'HPColors' + idWord(key) + (side === 'shared' ? '' : idWord(side));
const rowId = (key, side) => rowPrefix(key, side) + 'Row';
const cardId = (pageKey, group) => 'HPColorsCard' + pageKey + idWord(group || 'General');
const subNavId = (pageKey, group) => 'HPColorsSubNav' + pageKey + idWord(group || 'General') + 'Button';

// state: { rows, newRows, controls, search, containers, folds, groups }; the arrays are filled in place.
function settingRowsEmitter({ id, out }, state) {
  const { rows, newRows, controls, search, containers, folds, groups } = state;
  // Dependent rows: each condition carries whether its setting is shared and the words the greyed row's
  // tooltip uses ("turn on Custom name color", "set Your health bar color to Custom").
  const rowByKey = new Map(rows.map(entry => [entry.key, entry]));
  function requirement(condition) {
    if (condition.any) {
      const parts = condition.any.map(requirement);
      const switches = condition.any.every(inner => rowByKey.get(inner.key).type === 'boolean');
      return { any: parts, text: switches ? 'turn on ' + condition.any.map(inner => rowByKey.get(inner.key).name).join(' or ') : parts.map(part => part.text).join(' or ') };
    }
    const target = rowByKey.get(condition.key), result = { key: condition.key, shared: target.side === 'shared' };
    if (condition.is) {
      result.is = condition.is.slice();
      result.text = 'set ' + target.name + ' to ' + condition.is.map(value => target.options.find(option => option.value === value).label).join(' or ');
    } else if (condition.above !== undefined) {
      result.above = condition.above; result.text = 'set ' + target.name + ' above ' + condition.above;
    } else result.text = 'turn on ' + target.name;
    return result;
  }

  function settingRow(depth, item) {
    const { row, side, value } = item;
    const prefix = rowPrefix(row.key, side);
    const panelId = id(rowId(row.key, side));
    out(depth, `<Panel id="${panelId}" class="HPC3Row HPC3Type${idWord(row.type)}">`);
    out(depth + 1, '<Panel class="HPC3RowBg" hittest="false" />');
    out(depth + 1, '<Panel class="HPC3RowRule" hittest="false" />');
    // Only rows a NEW item targets carry its mark and an opacity-only flash layer.
    if (newRows.has(panelId)) {
      out(depth + 1, '<Panel class="HPC3RowNewFlash" hittest="false" />');
      out(depth + 1, `<Image class="HPC3NewMark" src="${NEW_ICON}" texturewidth="14px" textureheight="14px" scaling="stretch-to-fit-preserve-aspect" hittest="false" />`);
    }
    out(depth + 1, `<Label class="HPC3RowTitle" text="${esc(row.name)}" hittest="false" />`);
    const control = { id: '', key: row.key, name: row.name, help: row.help, side, type: row.type, bounds: row.bounds, step: row.step, unit: row.unit,
      default: value, rowId: panelId, page: row.page, level: row.level, group: row.group || '' };
    if (row.requires) control.requires = row.requires.map(requirement);
    // The menu script only drives segment buttons; an enum too long for one row needs a new control first.
    if (row.type === 'enum' && row.options.length > SEGMENT_MAX) throw new Error(row.key + ': an enum can have at most ' + SEGMENT_MAX + ' options (segment buttons)');
    const kind = row.type;
    out(depth + 1, `<Panel class="HPC3RowControls HPC3Controls${idWord(kind)}">`);
    if (row.type === 'boolean') {
      control.id = control.toggleId = id(prefix + 'Toggle');
      out(depth + 2, `<Button id="${control.toggleId}" class="HPC3Toggle${value ? ' Checked' : ''}">${toggleHandles}</Button>`);
    } else if (row.type === 'enum') {
      control.kind = 'segment';
      control.id = id(prefix + 'Segment');
      control.options = row.options.map(option => ({ value: option.value, label: option.label, id: id(prefix + 'Option' + idWord(option.value)) }));
      out(depth + 2, `<Panel id="${control.id}" class="HPC3Segment">`);
      for (const option of control.options) out(depth + 3, `<Button id="${option.id}" class="HPC3SegmentButton${option.value === value ? ' Selected' : ''}"><Panel class="HPC3RadioBox" hittest="false" /><Label text="${esc(option.label)}" hittest="false" /></Button>`);
      out(depth + 2, '</Panel>');
    } else if (row.type === 'color') {
      control.hueId = id(prefix + 'HueSlider');
      control.swatchId = id(prefix + 'Swatch');
      control.id = control.hexId = id(prefix + 'Hex');
      out(depth + 2, '<Panel class="HPC3ColorGroup">');
      out(depth + 3, `<Slider id="${control.hueId}" class="HPC3HueSlider HorizontalSlider" direction="horizontal" />`);
      out(depth + 3, `<Button id="${control.swatchId}" class="HPC3Swatch" style="background-color: ${value};" />`);
      out(depth + 3, `<Panel class="HPC3EntryBox"><TextEntry id="${control.hexId}" class="HPC3Hex" text="${esc(value)}" maxchars="7" /></Panel>`);
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
    control.conditionId = id('HPColorsCondition' + idWord(row.key) + idWord(side));
    out(depth + 2, `<Button id="${control.conditionId}" class="HPC3ConditionAction"><Label text="◆" hittest="false" /></Button>`);
    out(depth + 1, '</Panel>');
    out(depth, '</Panel>');
    controls.push(control);
    search.push({ key: row.key, side, page: row.page, level: row.level, group: row.group || '', id: panelId,
      text: [row.name, row.help, row.group || '', ...(row.options || []).map(option => option.label), ...row.keywords, side].join(' ').toLowerCase() });
    return panelId;
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
    for (const { level, title, open } of FOLDS) {
      const levelItems = items.filter(item => item.row.level === level);
      if (!levelItems.length) continue;
      const prefix = 'HPColorsPage' + pageKey + idWord(group || 'General') + idWord(level);
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
        for (const spec of SIDE_COLUMNS) {
          const columnItems = sided.filter(item => item.side === spec.side);
          if (!columnItems.length) continue;
          foldRows.push(...column(depth + 3, prefix + idWord(spec.side) + 'Column', spec.title, spec.className, columnItems));
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
    const solo = !page.hasSubNav;
    for (const name of page.groups) {
      const prefix = cardId(page.key, name);
      const card = { name, page: page.name, id: id(prefix), resetId: '', subNavId: page.hasSubNav ? page.subNavIds.get(name) : '' };
      const groupItems = items.filter(item => (item.row.group || '') === name);
      const availableSides = SIDE_COLUMNS.filter(spec => groupItems.some(item => item.side === spec.side));
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
          const side = { side: spec.side, id: id(prefix + 'Side' + idWord(spec.side) + 'Button') };
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

  // COLORBLIND tab: one card of normal-looking switch rows. They are not settings (no reset, condition,
  // search entry or saved value): each switch sends one game command, so the three types mix.
  function colorblindPage(depth) {
    out(depth, `<Panel id="${id('HPColorsColorblindCard')}" class="HPC3Card">`);
    out(depth + 1, '<Panel class="HPC3CardBg" hittest="false" />');
    out(depth + 1, '<Panel class="HPC3CardHead" />');
    for (const [type, name] of [['Protanopia', 'red'], ['Deuteranopia', 'green'], ['Tritanopia', 'blue']]) {
      out(depth + 1, `<Panel id="${id('HPColorsColorblind' + type + 'Row')}" class="HPC3Row HPC3TypeBoolean">`);
      out(depth + 2, '<Panel class="HPC3RowBg" hittest="false" />');
      out(depth + 2, '<Panel class="HPC3RowRule" hittest="false" />');
      out(depth + 2, `<Label class="HPC3RowTitle" text="${type} (${name}-weak)" hittest="false" />`);
      out(depth + 2, '<Panel class="HPC3RowControls HPC3ControlsBoolean">');
      out(depth + 3, `<Button id="${id('HPColorsColorblind' + type + 'Toggle')}" class="HPC3Toggle">${toggleHandles}</Button>`);
      out(depth + 2, '</Panel>');
      out(depth + 1, '</Panel>');
    }
    out(depth, '</Panel>');
  }

  return { requirement, settingRow, column, groupBody, pageBody, colorblindPage };
}

module.exports = { settingRowsEmitter, rowId, cardId, subNavId };
