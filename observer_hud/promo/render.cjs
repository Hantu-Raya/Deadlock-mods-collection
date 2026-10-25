// Renders promo.html's designs to out/*.png at 1920x1080 (Playwright from the preset builder checkout).
const { chromium } = require('D:/web/hp-colors-preset-builder/node_modules/playwright');
const path = require('path');
const JOBS = [['d0', '0_cover_0_2_0'], ['d1', '1_cover'], ['d2', '2_only_in_game'], ['d3', '3_night_desk_band'], ['d5', '4_two_looks'], ['d4', '5_setup'], ['d6', '6_custom_top_bars']];
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const url = 'file:///' + path.resolve(__dirname, 'promo.html').replace(/\\/g, '/');
  const only = process.argv[2];
  for (const [p, name] of JOBS) {
    if (only && only !== p) continue;
    await page.goto(`${url}?p=${p}`);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(__dirname, 'out', name + '.png') });
  }
  await browser.close();
  console.log('ok');
})();
