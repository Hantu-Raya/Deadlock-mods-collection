'use strict';
// settings/news.json validation against the validated schema rows.
const { pages, sidesOf } = require('./schema');

// Ticket 36: settings/news.json feeds the NEW tab. Each item targets setting rows (key, optional side)
// or names a page; ids become panel ids, so they are unique kebab-case words.
function validateNews(news, rows) {
  const fail = (item, message) => { throw new Error('news.json ' + (item && item.id || '<item ' + news.indexOf(item) + '>') + ': ' + message); };
  if (!Array.isArray(news)) throw new Error('news.json: expected an array');
  const ids = new Set();
  for (const item of news) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) fail(item, 'expected an object');
    const unknown = Object.keys(item).filter(key => !['id', 'release', 'date', 'badge', 'title', 'description', 'targets', 'page'].includes(key));
    if (unknown.length) fail(item, 'unknown field ' + unknown.join(', '));
    if (typeof item.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(item.id) || item.id.length > 48) fail(item, 'invalid id');
    if (ids.has(item.id)) fail(item, 'duplicate id'); ids.add(item.id);
    if (typeof item.release !== 'string' || !/^\d+\.\d+\.\d+$/.test(item.release)) fail(item, 'invalid release');
    const date = typeof item.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.date) ? new Date(item.date + 'T00:00:00Z') : null;
    if (!date || isNaN(date) || date.toISOString().slice(0, 10) !== item.date) fail(item, 'invalid date (YYYY-MM-DD)');
    if (!['New', 'Updated'].includes(item.badge)) fail(item, 'badge must be New or Updated');
    for (const key of ['title', 'description']) if (typeof item[key] !== 'string' || !item[key].trim() || item[key].length > 240) fail(item, 'invalid ' + key);
    if (!Array.isArray(item.targets)) fail(item, 'targets must be an array');
    // COLORBLIND (ticket 44) is a menu page without schema rows, so an item can only open it by page.
    if (item.page !== undefined && (![...pages, 'Colorblind'].includes(item.page) || item.page === 'Presets')) fail(item, 'unknown page');
    // One item opens one page: its targets share a page, and an explicit page must be that page.
    const targetPages = new Set(item.targets.map(target => (rows.find(entry => entry.key === target.key) || {}).page).filter(Boolean));
    if (targetPages.size > 1) fail(item, 'targets span pages ' + [...targetPages].join(', '));
    if (item.page !== undefined && targetPages.size && !targetPages.has(item.page)) fail(item, 'page ' + item.page + ' does not hold its targets');
    if (!item.targets.length && item.page === undefined) fail(item, 'needs a target setting or a page');
    const seen = new Set();
    for (const target of item.targets) {
      if (!target || typeof target !== 'object' || Object.keys(target).some(key => !['key', 'side'].includes(key))) fail(item, 'invalid target ' + JSON.stringify(target));
      const row = rows.find(entry => entry.key === target.key);
      if (!row) fail(item, 'unknown setting ' + target.key);
      if (target.side !== undefined && !(row.side === 'side-aware' && ['enemy', 'ally'].includes(target.side))) fail(item, 'invalid side for ' + target.key);
      for (const side of target.side ? [target.side] : sidesOf(row)) {
        if (seen.has(row.key + side)) fail(item, 'duplicate target ' + target.key); seen.add(row.key + side);
      }
    }
  }
}

module.exports = { validateNews };
