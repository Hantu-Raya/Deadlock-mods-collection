// Browser-tool harness: import this CommonJS module and call verify(tab) on each
// file:// mock tab. Uses the supplied browser helper, not an installed test stack.
const assert = require('node:assert/strict');
module.exports = async function verify(tab) {
  await tab.reload();
  const layout = await tab.evaluate('document.body.dataset.layout');
  const pages = await tab.evaluate('Array.from(document.querySelectorAll("#navigation button"), b => b.dataset.page)');
  assert.deepEqual(pages, layout === 'part' ? ['Bar', 'HP Text', 'Name', 'Indicators', 'Units', 'Presets'] : ['Enemy', 'Ally', 'Units', 'Shared', 'Presets']);
  await tab.uncheck('#folds');
  const keys = [];
  for (const page of pages) {
    await tab.click(`#navigation button[data-page="${page}"]`);
    keys.push(...await tab.evaluate('Array.from(document.querySelectorAll(".setting-row"), row => row.dataset.key)'));
  }
  const expected = await tab.evaluate('window.HP_MOCK_SETTINGS.map(row => row.key)');
  assert.equal(keys.length, expected.length);
  assert.deepEqual([...keys].sort(), [...expected].sort());
  await tab.click(`#navigation button[data-page="${pages[0]}"]`);
  await tab.check('#folds');
  assert(await tab.count('details:not([open])') > 0, 'Advanced rows fold closed');
  await tab.click('#search-toggle');
  const searchCounts = {};
  for (const term of ['red', 'offset', 'name']) {
    await tab.fill('#search', term);
    const matches = await tab.evaluate(`window.HP_MOCK_SETTINGS.filter(row => new RegExp('\\\\b' + ${JSON.stringify(term)}, 'i').test(row.name + ' ' + row.help + ' ' + row.keywords)).map(row => row.key)`);
    const actual = await tab.evaluate('Array.from(document.querySelectorAll(".setting-row"), row => row.dataset.key)');
    assert(actual.length > 0);
    assert.deepEqual([...actual].sort(), [...matches].sort());
    assert.equal(await tab.count('#rows details'), 0, 'Search bypasses folds');
    searchCounts[term] = actual.length;
    if (term === 'red') { assert(actual.includes('enemyLow')); assert(!actual.includes('widthScale'), 'red must not match shaRED'); }
  }
  await tab.fill('#search', 'relative');
  assert(await tab.count('[data-key="readoutOffsetX"]') > 0, 'Search finds help text');
  const set = async (id, value) => tab.evaluate(`(() => { const input = document.getElementById(${JSON.stringify(id)}); input.value = ${JSON.stringify(String(value))}; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await tab.fill('#search', 'offset');
  await set('control-readoutOffsetX', 30);
  assert((await tab.attr('#hp-text', 'style')).includes('30px'));
  assert.equal(await tab.value('#control-positionY'), '-3.8', 'Stored tenths convert to pixels');
  assert.equal(await tab.value('#control-readoutOffsetY'), '14', 'HP-text offsets already are pixels');
  await tab.fill('#search', 'bar width');
  await set('control-widthScale', 200);
  assert((await tab.attr('#bar-visual', 'style')).includes('152px'));
  await tab.fill('#search', 'color');
  await set('hp-slider', 100);
  await set('control-enemyHigh', '#123456');
  assert.equal(await tab.evaluate('getComputedStyle(document.getElementById("bar-fill")).backgroundColor'), 'rgb(18, 52, 86)');
  await tab.select('#control-readoutColorMode', 'custom');
  await set('control-readoutHigh', '#abcdef');
  assert.equal(await tab.evaluate('getComputedStyle(document.getElementById("hp-text")).color'), 'rgb(171, 205, 239)');
  await tab.fill('#search', 'name');
  await tab.check('#control-enemyNameColorEnabled');
  await set('control-enemyNameColor', '#334455');
  assert.equal(await tab.evaluate('getComputedStyle(document.getElementById("hero-name")).color'), 'rgb(51, 68, 85)');
  await tab.uncheck('#control-playerNamesVisible');
  assert.equal(await tab.isVisible('#hero-name'), false);
  await tab.check('#control-playerNamesVisible');
  await tab.press('Escape', { selector: '#search' });
  assert.equal(await tab.isVisible('#search'), false);
  await tab.click('#navigation button[data-page="Units"]');
  assert((await tab.text('#preview-title')).includes('NPC'));
  await tab.click('[data-kind="objective"]');
  assert((await tab.text('#preview-title')).includes('OBJECTIVE'));
  await tab.click('[data-kind="neutral"]');
  assert((await tab.text('#preview-title')).includes('NEUTRAL'));
  await tab.click('#navigation button[data-page="Presets"]');
  await tab.fill('.preset-actions input', 'Browser check');
  await tab.click('.preset-actions button');
  assert((await tab.text('#rows')).includes('Apply Browser check'));
  await tab.click('#reset');
  assert((await tab.attr('#bar-visual', 'style')).includes('112.48px'));
  await tab.click('text/Apply Browser check');
  assert((await tab.attr('#bar-visual', 'style')).includes('152px'), 'Session snapshot restores edits');
  await tab.click('#reset');
  await tab.click('#play');
  await tab.run(async ({ page }) => {
    await page.waitForFunction(() => document.getElementById('preview-status').textContent.startsWith('Damage'), { timeout: 2500 });
    await page.waitForFunction(() => document.getElementById('preview-status').textContent.startsWith('Healing'), { timeout: 4000 });
    await page.waitForFunction(() => document.getElementById('hp-output').textContent === '100%' && document.getElementById('play').textContent.includes('Play'), { timeout: 6500 });
  });
  assert.equal(await tab.text('#hp-output'), '100%');
  assert.equal((await tab.errors()).entries.length, 0);
  assert.equal((await tab.console({ level: 'error' })).entries.length, 0);
  // Leave a clean default surface for visual review.
  await tab.reload();
  return { layout, settings: expected.length, searchCounts, pages: pages.length, consoleErrors: 0 };
};
