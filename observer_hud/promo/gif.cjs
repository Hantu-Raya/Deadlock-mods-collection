// Renders gif.html's parts to out/gif/*.png: caption strips 1920x120, title and end cards 1920x680.
const { chromium } = require('D:/web/hp-colors-preset-builder/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const JOBS = [['g1', 120], ['g2', 120], ['g3', 120], ['title', 680], ['end', 680]];
(async () => {
  const dir = path.join(__dirname, 'out', 'gif');
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 680 } });
  const url = 'file:///' + path.resolve(__dirname, 'gif.html').replace(/\\/g, '/');
  for (const [p, h] of JOBS) {
    await page.goto(`${url}?p=${p}`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(dir, p + '.png'), clip: { x: 0, y: 0, width: 1920, height: h } });
  }
  await browser.close();
  console.log('ok');
})();
