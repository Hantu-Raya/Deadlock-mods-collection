'use strict';
// Ticket 08: settings table -> static by-part ESC menu (Panorama XML) plus the runtime menu contract.
// Pure function of its inputs: no dates, no random ids. Panels use tabs to match the stock layout.
// The parts live in tools/lib/: menu-markup.js (page table, snippets, id/line writer), menu-rows.js (setting
// rows, folds and cards), menu-news.js (NEW tab), menu-preview.js (preview pane), menu-presets.js (PRESETS
// page), menu-buttons.js and menu-dialogs.js. This file lays out the shell and returns the menu contract.
const { PAGES, START, NEW_ICON, SEARCH_ICON, toggleHandles, changedStar, pascal, esc, menuWriter } = require('./lib/menu-markup');
const { settingRowsEmitter } = require('./lib/menu-rows');
const { newsEntries, newsPageEmitter } = require('./lib/menu-news');
const { previewPaneEmitter } = require('./lib/menu-preview');
const { presetsEmitter } = require('./lib/menu-presets');
const { emitDialogs } = require('./lib/menu-dialogs');

// rows: validated schema rows; sidesOf(row) -> ['enemy','ally'] | ['enemy'] | ['shared'];
// reserved: stock layout ids the generated ids must not collide with.
// news: validated settings/news.json items; each targets setting rows (key, optional side) or a page.
function buildMenu(rows, sidesOf, reserved, release, news = []) {
  const writer = menuWriter(reserved);
  const { ids, id, lines, out } = writer;
  const controls = [];
  const search = [];
  const containers = [];
  const folds = [];
  const pages = [];
  const groups = [];

  const menuButton = id('HPColorsMenuButton');
  const instances = [];
  for (const row of rows) for (const side of sidesOf(row)) instances.push({ row, side, value: side === 'shared' || row.side !== 'side-aware' ? row.default : row.default[side] });
  const { newsItems, newRows } = newsEntries(rows, sidesOf, news);
  const { pageBody, colorblindPage } = settingRowsEmitter(writer, { rows, newRows, controls, search, containers, folds, groups });
  const previewPane = previewPaneEmitter(writer, release);
  const { library, sharePanel } = presetsEmitter(writer);
  const newsPage = newsPageEmitter(writer, newsItems);

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
    if (!items.length && !['Presets', 'New', 'Colorblind'].includes(page.name)) out(7, `<Label class="HPC3Placeholder" text="${esc(page.placeholder || 'No settings on this page yet. They arrive in a later v3 update.')}" />`);
    if (page.name === 'Presets') { library(7); sharePanel(7); }
    if (page.name === 'Colorblind') colorblindPage(7);
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
  emitDialogs(writer);
  out(1, '</Panel>');
  // v2's hidden store shape: a collapsed wrapper around a near-transparent HTML panel.
  out(1, `<Panel id="${id('HPColorsV3StoreWrap')}" class="HPC3StoreWrap" hittest="false" hittestchildren="false">`);
  out(2, `<CitadelHTMLPanel id="${id('HPColorsV3StorePanel')}" class="HPC3StorePanel" hittest="false" acceptsfocus="false" />`);
  out(1, '</Panel>');

  const fragment = lines.join('\n') + '\n';
  const emitted = [...fragment.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  if (emitted.join('\n') !== ids.slice(1).join('\n')) {
    const at = [...emitted, undefined].findIndex((value, index) => value !== ids[index + 1]);
    throw new Error('Generated menu ids drifted from the id list at #' + at + ': emitted ' + emitted[at] + ', listed ' + ids[at + 1]);
  }
  if (controls.length !== instances.length) throw new Error('Every table row and side needs exactly one generated menu row (' + controls.length + ' rows for ' + instances.length + ' row sides)');
  // The "!" shows while a newer release exists (menu.js askBadge sets HPC3UpdateAvailable on the button).
  const button = `<Button id="${menuButton}" class="nav_menu_item minor" onactivate="$.HPColorsMenuToggle()">\n` +
    '\t\t\t\t\t\t<Label text="HP COLORS" class="menuButtonLabel" />\n' +
    `\t\t\t\t\t\t<Image class="HPC3MenuUpdateBadge" src="${NEW_ICON}" texturewidth="28px" textureheight="28px" scaling="stretch-to-fit-preserve-aspect" hittest="false" />\n` +
    '\t\t\t\t\t</Button>\n\t\t\t\t\t';
  return { ids, controls, search, fragment, button,
    menu: { rootId: root, pages, groups, folds, containers, startPage: startIndex,
      news: newsItems.map(({ id: newsId, badge, date, page, rowIds, subNavIds, itemId, buttonId, dismissId }) => ({ id: newsId, badge, date, page, rowIds, subNavIds, itemId, buttonId, dismissId })) } };
}

module.exports = { buildMenu, PAGES };
