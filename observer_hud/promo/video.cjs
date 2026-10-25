// Renders video.html's overlays to out/video/*.png (captions transparent, end card opaque).
const { chromium } = require('D:/web/hp-colors-preset-builder/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const JOBS = [['c1', true], ['c2', true], ['c3', true], ['end', false]];
(async () => {
  const dir = path.join(__dirname, 'out', 'video');
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const url = 'file:///' + path.resolve(__dirname, 'video.html').replace(/\\/g, '/');
  for (const [p, clear] of JOBS) {
    await page.goto(`${url}?p=${p}`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(dir, p + '.png'), omitBackground: clear });
  }
  await browser.close();
  console.log('ok');
})();
