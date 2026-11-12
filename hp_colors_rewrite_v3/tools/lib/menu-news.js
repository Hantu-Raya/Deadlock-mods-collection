'use strict';
// NEW tab (ticket 36): the validated settings/news.json items as menu entries, and the NEW page list.
const { NEW_ICON, UPDATED_ICON, idWord, esc } = require('./menu-markup');
const { sidesOf } = require('./schema');
const { rowId, subNavId } = require('./menu-rows');

// Each item with the row ids it targets and the page it opens; newRows holds every targeted row id.
function newsEntries(rows, news) {
  const newsItems = news.map(item => {
    const rowIds = item.targets.flatMap(target => {
      const row = rows.find(entry => entry.key === target.key);
      return (target.side ? [target.side] : sidesOf(row)).map(side => rowId(row.key, side));
    });
    return { id: item.id, badge: item.badge, release: item.release, date: Date.parse(item.date + 'T00:00:00Z'), title: item.title, description: item.description,
      page: item.page || rows.find(entry => entry.key === item.targets[0].key).page, rowIds, targets: item.targets.map(target => target.key) };
  });
  const newRows = new Set(newsItems.flatMap(item => item.rowIds));
  return { newsItems, newRows };
}

// NEW marks exist only where an item can show them: its page tab and the sub-nav entry of each target group.
// Runs after the page loop has published each page's group list and `hasSubNav`; fills item.subNavIds and returns the
// set of every sub-nav id that carries a mark.
function linkNewsSubNavs(newsItems, pageDefs, rows) {
  for (const item of newsItems) {
    const page = pageDefs.find(entry => entry.name === item.page);
    item.subNavIds = page.hasSubNav ? [...new Set(item.targets.map(key => subNavId(page.key, rows.find(row => row.key === key).group)))] : [];
  }
  return new Set(newsItems.flatMap(item => item.subNavIds));
}

// The runtime part of the contract: what menu.js reads for each item (ids exist after newsPage emitted them).
const newsContract = newsItems => newsItems.map(({ id: newsId, badge, date, page, rowIds, subNavIds, itemId, buttonId, dismissId }) => ({ id: newsId, badge, date, page, rowIds, subNavIds, itemId, buttonId, dismissId }));

// newsPage(depth) emits the NEW page and records each item's panel ids on it.
function newsPageEmitter({ id, out }, newsItems) {
  function newsPage(depth) {
    out(depth, '<Panel class="HPC3NewHeader">');
    out(depth + 1, `<Button id="${id('HPColorsNewClearAllButton')}" class="SecondaryButton light HPC3ActionButton"><Label text="CLEAR ALL" hittest="false" /></Button>`);
    out(depth, '</Panel>');
    out(depth, `<Panel id="${id('HPColorsNewList')}" class="HPC3NewList">`);
    for (const item of newsItems) {
      const key = 'HPColorsNewItem' + idWord(item.id);
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
  return newsPage;
}

module.exports = { newsEntries, linkNewsSubNavs, newsContract, newsPageEmitter };
