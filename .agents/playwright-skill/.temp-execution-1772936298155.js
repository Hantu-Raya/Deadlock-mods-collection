const { chromium } = require('playwright');
const TARGET_URL = 'http://localhost:3000';
const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;
(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 80 });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('console', (msg) => console.log('CONSOLE', msg.type(), msg.text()));
  try {
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.getByRole('button', { name: /^Sign In$/ }).click();
    await page.locator('input[type="email"]').fill(EMAIL);
    await page.locator('input[type="password"]').fill(PASSWORD);
    await page.getByRole('button', { name: /^Sign In$/ }).last().click();
    await page.waitForTimeout(3000);
    await page.reload({ waitUntil: 'networkidle' });
    const signOutVisible = await page.getByRole('button', { name: /^Sign Out$/ }).isVisible().catch(() => false);
    console.log('SESSION', JSON.stringify({ signOutVisible }, null, 2));
    await page.goto(`${TARGET_URL}/movie/tt0816692`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(6500);
    const saveButton = page.getByRole('button', { name: /^Save$/ }).first();
    await saveButton.waitFor({ timeout: 20000 });
    await saveButton.click();
    await page.getByRole('button', { name: /^Saved$/ }).waitFor({ timeout: 20000 });
    console.log('BOOKMARK_OK');
  } catch (error) {
    console.error('PLAYWRIGHT_TEST_FAILURE');
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
