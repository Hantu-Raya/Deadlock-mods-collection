// Renders promo.html's designs to out/*.png (1920x1080) and out/*.jpg (1280x720, for upload),
// then out/_overview.jpg (contact sheet). Playwright comes from the preset builder checkout.
// Usage: node detailed_postgame/promo/render.cjs [dN]   (no argument renders everything)
const { chromium } = require('D:/web/hp-colors-preset-builder/node_modules/playwright');
const path = require('path');
const fs = require('fs');
const JOBS = [['d1', '1_cover'], ['d2', '2_exact_numbers'], ['d3', '3_souls_and_items'], ['d4', '4_soul_lead_graph'], ['d5', '5_details'], ['d6', '6_install']];
const OUT = path.join(__dirname, 'out');
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const url = 'file:///' + path.resolve(__dirname, 'promo.html').replace(/\\/g, '/');
  const only = process.argv[2];
  const browser = await chromium.launch();
  const shoot = async (page, p, file, opts) => {
    await page.goto(`${url}?p=${p}`);
    await page.waitForFunction('window.__ready === true');
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(OUT, file), ...opts });
  };
  // PNG at 1920x1080; JPG drawn at 2/3 scale so the text is rendered, not resampled.
  const big = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const small = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 / 3 });
  for (const [p, name] of JOBS) {
    if (only && only !== p) continue;
    await shoot(big, p, name + '.png');
    await shoot(small, p, name + '.jpg', { type: 'jpeg', quality: 86 });
  }
  if (!only) {
    await shoot(big, 'sheet', '_overview.png');
    await shoot(small, 'sheet', '_overview.jpg', { type: 'jpeg', quality: 85 });
    fs.rmSync(path.join(OUT, '_overview.png'));
  }
  await browser.close();
  for (const f of fs.readdirSync(OUT).filter(f => f.endsWith('.jpg'))) console.log(f, Math.round(fs.statSync(path.join(OUT, f)).size / 1024) + ' KB');
  console.log('ok');
})();
